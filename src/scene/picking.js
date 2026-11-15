// 当たり判定。
//
// 約束:
//   createPicker(data, { now }) → {
//     rebuild(s),      // 見た目が変わったら呼ぶ。s = { matrix, mask, selection, morph, lean, screen }
//                      //   matrix: Int32Array(2209)(表示中の年の人数)、mask: Uint8Array(47)、
//                      //   selection: state.selection、morph / lean: 現在値、
//                      //   screen: renderer.screenMatrix()(world → CSS px のアフィン 2x4)
//     pickNode(x, y, radius?),  // CSS px(キャンバス左上基準)→ 都道府県の添字 | null
//     pickArc(x, y, radius?),   // → { o, d } | null。描いている弧だけが対象(sideOf(o, d, selection) !== 0 で人数 > 0)
//     isSettled(), version
//   }
// 弧は geometry/flows.js の arcList()(固定の順序。弧・粒子・表と共有)の添字 k で扱う。
//
// 弧の判定:
//  - 描いている弧を折れ線(画面の CSS px)にしてキャッシュする。作り直すのは、年・選択・カメラが変わった後に
//    最初の pickArc が呼ばれたときだけ(rebuild では印を付けるだけ)。
//  - カメラの移動や変形の最中(画面の行列・morph・lean が SETTLE_MS 以内に変わっている間)は、キャッシュを作らず
//    pickArc は null を返す。止まった時点で最初の pickArc が作り直す。
//  - 1 回の判定は、折れ線の外接矩形で絞ってから線分との距離を測る。配列は作らない。
//  - 近くに複数の弧があるときは、最も近い弧との距離の差が TIE_PX 以内の弧のうち、人数が多いものを返す。
import { lineLayout, geoLayout, nodePos } from '../geometry/layout.js';
import { K } from '../geometry/constants.js';
import { ARC_COUNT, arcList, sideOf } from '../geometry/flows.js';

export const NODE_RADIUS = 14; // CSS px
export const ARC_RADIUS = 8; // CSS px
export const TIE_PX = 3; // 距離がこの差以内なら「同程度」とみなして人数の多い弧を選ぶ
export const SETTLE_MS = 100; // カメラが止まってからキャッシュを作るまでの待ち
const SEGMENTS = 32; // 弧 1 本の折れ線の線分数

export function createPicker(data, { now = () => globalThis.performance.now(), segments = SEGMENTS } = {}) {
  const line = lineLayout();
  const geo = geoLayout(data.prefectures).pos;
  const list = arcList();
  const seg = segments;
  const stride = (seg + 1) * 2;
  let s = null;
  let version = 0; // キャッシュを作り直した回数
  let revision = 0; // rebuild が呼ばれた回数
  let dirty = true;
  let lastMotion = -Infinity;

  // 画面上の都道府県の位置
  const sx = new Float64Array(47);
  const sy = new Float64Array(47);
  // 描いている弧の折れ線と外接矩形(minX, minY, maxX, maxY)
  const pts = new Float32Array(ARC_COUNT * stride);
  const box = new Float32Array(ARC_COUNT * 4);
  const liveK = new Int16Array(ARC_COUNT); // 描いている j 番目の弧の arcList の添字
  const dist = new Float32Array(ARC_COUNT); // j 番目の弧の、カーソルからの距離(px)
  let live = 0;

  function sameView(a, b) {
    if (!a || !b) return false;
    if (a.morph !== b.morph || a.lean !== b.lean) return false;
    for (let i = 0; i < 8; i++) if (a.screen[i] !== b.screen[i]) return false;
    return true;
  }

  // 弧は制御点 [A, A, A, M, B, B, B] の 3 次 B スプラインで、画面への射影はアフィンなので、
  // 3 点(A, M, B)だけを射影して、基底の重みで混ぜれば折れ線の点が得られる(arcPoint と同じ式)。
  const wJ = new Int8Array(seg + 1);
  const wB = new Float64Array((seg + 1) * 4);
  for (let i = 0; i <= seg; i++) {
    const u = Math.min(Math.max(i / seg, 0), 0.99999) * 4;
    const j = Math.floor(u);
    const f = u - j;
    const f2 = f * f;
    const f3 = f2 * f;
    wJ[i] = j;
    wB[i * 4] = (1 - f) ** 3 / 6;
    wB[i * 4 + 1] = (3 * f3 - 6 * f2 + 4) / 6;
    wB[i * 4 + 2] = (-3 * f3 + 3 * f2 + 3 * f + 1) / 6;
    wB[i * 4 + 3] = f3 / 6;
  }
  const cx = new Float64Array(7);
  const cy = new Float64Array(7);

  function build() {
    const m = s.screen;
    const { matrix, selection, morph, lean } = s;
    const sl = Math.sin(lean);
    const cl = Math.cos(lean);
    live = 0;
    for (let k = 0; k < list.length; k++) {
      const o = list.o[k];
      const d = list.d[k];
      if (matrix[o * 47 + d] <= 0) continue;
      const side = sideOf(o, d, selection);
      if (side === 0) continue;
      const ax = line[o][0] + (geo[o][0] - line[o][0]) * morph;
      const az = line[o][1] + (geo[o][1] - line[o][1]) * morph;
      const bx = line[d][0] + (geo[d][0] - line[d][0]) * morph;
      const bz = line[d][1] + (geo[d][1] - line[d][1]) * morph;
      // M = (A + B) / 2 + n * K * |AB|、n = side * cos(lean) * Y + sin(lean) * R(geometry/arc.js と同じ)
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1e-6;
      const h = K * len;
      const mx = (ax + bx) / 2 + sl * (-dz / len) * h;
      const my = cl * side * h;
      const mz = (az + bz) / 2 + sl * (dx / len) * h;
      const aX = m[0] * ax + m[2] * az + m[3];
      const aY = m[4] * ax + m[6] * az + m[7];
      const bX = m[0] * bx + m[2] * bz + m[3];
      const bY = m[4] * bx + m[6] * bz + m[7];
      const mX = m[0] * mx + m[1] * my + m[2] * mz + m[3];
      const mY = m[4] * mx + m[5] * my + m[6] * mz + m[7];
      cx[0] = cx[1] = cx[2] = aX; cy[0] = cy[1] = cy[2] = aY;
      cx[3] = mX; cy[3] = mY;
      cx[4] = cx[5] = cx[6] = bX; cy[4] = cy[5] = cy[6] = bY;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const base = live * stride;
      for (let i = 0; i <= seg; i++) {
        const j = wJ[i];
        const w = i * 4;
        const x = wB[w] * cx[j] + wB[w + 1] * cx[j + 1] + wB[w + 2] * cx[j + 2] + wB[w + 3] * cx[j + 3];
        const y = wB[w] * cy[j] + wB[w + 1] * cy[j + 1] + wB[w + 2] * cy[j + 2] + wB[w + 3] * cy[j + 3];
        pts[base + i * 2] = x;
        pts[base + i * 2 + 1] = y;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      box[live * 4] = x0; box[live * 4 + 1] = y0; box[live * 4 + 2] = x1; box[live * 4 + 3] = y1;
      liveK[live] = k;
      live++;
    }
    dirty = false;
    version++;
  }

  return {
    get version() {
      return version;
    },
    get revision() {
      return revision;
    },
    /** 描いている弧の数(キャッシュを作った後の値)。 */
    get liveCount() {
      return live;
    },
    /** カメラが止まっていて、弧の判定ができる状態か。 */
    isSettled() {
      return now() - lastMotion >= SETTLE_MS;
    },
    rebuild(next) {
      if (s && !sameView(s, next)) lastMotion = now();
      s = next;
      dirty = true;
      revision++;
      const m = s.screen;
      for (let i = 0; i < 47; i++) {
        const [x, z] = nodePos(line, geo, i, s.morph);
        sx[i] = m[0] * x + m[2] * z + m[3];
        sy[i] = m[4] * x + m[6] * z + m[7];
      }
    },
    pickNode(x, y, radius = NODE_RADIUS) {
      if (!s) return null;
      let best = null;
      let bd = radius * radius;
      for (let i = 0; i < 47; i++) {
        const d = (sx[i] - x) ** 2 + (sy[i] - y) ** 2;
        if (d <= bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    },
    pickArc(x, y, radius = ARC_RADIUS) {
      if (!s) return null;
      if (now() - lastMotion < SETTLE_MS) return null; // 動いている間は判定しない
      if (dirty) build();
      const r2 = radius * radius;
      let bestD2 = r2;
      // 1 周目: 外接矩形で絞って、各弧までの距離(2 乗)を求め、最も近い距離を得る
      for (let j = 0; j < live; j++) {
        const b4 = j * 4;
        if (x < box[b4] - radius || x > box[b4 + 2] + radius || y < box[b4 + 1] - radius || y > box[b4 + 3] + radius) {
          dist[j] = Infinity;
          continue;
        }
        const base = j * stride;
        let best = Infinity;
        let px = pts[base];
        let py = pts[base + 1];
        for (let i = 1; i <= seg; i++) {
          const qx = pts[base + i * 2];
          const qy = pts[base + i * 2 + 1];
          const dx = qx - px;
          const dy = qy - py;
          const len2 = dx * dx + dy * dy;
          let u = len2 > 1e-9 ? ((x - px) * dx + (y - py) * dy) / len2 : 0;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const ex = px + u * dx - x;
          const ey = py + u * dy - y;
          const d2 = ex * ex + ey * ey;
          if (d2 < best) best = d2;
          px = qx;
          py = qy;
        }
        dist[j] = best;
        if (best < bestD2) bestD2 = best;
      }
      // 2 周目: 最も近い距離 + TIE_PX 以内の弧のうち、人数が多いもの(同数なら近いもの)
      const dmin = Math.sqrt(bestD2);
      const limit = Math.min(radius, dmin + TIE_PX);
      const limit2 = limit * limit;
      let pick = -1;
      let pickV = -1;
      let pickD = Infinity;
      for (let j = 0; j < live; j++) {
        const d2 = dist[j];
        if (d2 > limit2 || d2 > r2) continue;
        const k = liveK[j];
        const v = s.matrix[list.o[k] * 47 + list.d[k]];
        if (v > pickV || (v === pickV && d2 < pickD)) {
          pick = j;
          pickV = v;
          pickD = d2;
        }
      }
      if (pick < 0) return null;
      const k = liveK[pick];
      return { o: list.o[k], d: list.d[k] };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// ホバーと選択の操作(DOM を持たない)。DOM のイベントとの結びつきは ui/tooltip.js の mount が行う。
//
//   createInteraction({ store, picker, touchNodeRadius?, touchArcRadius? }) → {
//     move(x, y),       // マウス・ペンのポインタが動いた(キャンバスの CSS px)
//     leave(),          // ポインタが図から出た
//     click(x, y),      // マウス・ペンの click。都道府県の点なら選択する
//     tap(x, y),        // タッチの 1 回のタップ。1 回目はツールチップを出し、同じ対象への 2 回目で選択する
//     refresh(),        // 毎フレーム呼ぶ。選択・年・カメラが変わった後に、最後のポインタの位置で判定し直す
//   }
// ホバーの対象は、都道府県の点が近ければその都道府県、そうでなければ弧。
export function createInteraction({ store, picker, touchNodeRadius = 22, touchArcRadius = 14 }) {
  let pointer = null; // { x, y, touch }
  let seenRevision = -1;
  let wasSettled = true;

  const sameTarget = (a, b) =>
    a === b || (a && b && a.type === b.type && (a.type === 'pref' ? a.code === b.code : a.o === b.o && a.d === b.d));

  function pick(x, y, touch) {
    const i = picker.pickNode(x, y, touch ? touchNodeRadius : undefined);
    if (i != null) return { type: 'pref', code: i + 1 };
    const arc = picker.pickArc(x, y, touch ? touchArcRadius : undefined);
    return arc ? { type: 'arc', o: arc.o, d: arc.d } : null;
  }

  return {
    move(x, y) {
      pointer = { x, y };
      store.set({ hover: pick(x, y, false) });
    },
    leave() {
      pointer = null;
      store.set({ hover: null });
    },
    click(x, y) {
      const t = pick(x, y, false);
      if (t?.type === 'pref') store.set({ selection: { type: 'pref', code: t.code } });
    },
    tap(x, y) {
      pointer = null;
      const t = pick(x, y, true);
      const cur = store.get().hover;
      if (!t) {
        store.set({ hover: null });
      } else if (sameTarget(cur, t)) {
        // 2 回目のタップ。都道府県なら選ぶ。弧は選べないので、ツールチップを閉じる
        if (t.type === 'pref') store.set({ selection: { type: 'pref', code: t.code }, hover: null });
        else store.set({ hover: null });
      } else {
        store.set({ hover: t });
      }
    },
    refresh() {
      if (!pointer) return;
      const settled = picker.isSettled();
      // rebuild が呼ばれた(選択・年・カメラが変わった)とき、またはカメラが止まったときに、判定し直す。
      // 動いている間は pickArc が null を返すので、都道府県の点だけを追う
      if (picker.revision !== seenRevision || settled !== wasSettled) {
        seenRevision = picker.revision;
        wasSettled = settled;
        store.set({ hover: pick(pointer.x, pointer.y, false) });
      }
    },
  };
}
