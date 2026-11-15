// カメラの定位置と補間(純関数。store も renderer も触らない)。
//   viewFor(preset, aspect, layout, opts) → { azimuth, elevation, zoom, center, roll, morph, lean, anchor, target, size }
//     preset: 'side' | 'oblique' | 'top'、aspect: 画面の幅 / 高さ、layout: renderer.layout({ line, geo, northAngle, bounds })。
//     azimuth ... roll は renderer.setView にそのまま渡せる。morph は state.morph の目標値、lean は renderer.setLean の値。
//     opts: { size: [幅, 高さ](CSS px)、region: 図を収める領域 { x0, y0, x1, y1 }(CSS px、画面の左上が原点)、
//             portrait: 縦画面の構成か(幅 1024px 未満。縦横比では判定しない)、selection: state.selection }。
//             region を省略すると、画面いっぱいに収める。図は region の中央に収まり、center と zoom がそれを表す。
//     anchor / target / size は、図の基準点(ワールド)がその領域のどこに来るかを表す。center はそこから決まる。
//   tween(a, b, s) → 2つの視点を s(0〜1)で補間した視点。角度は短い側へ、zoom は対数で補間する。
//   reorient(view, { azimuth, elevation, zoomScale }) → 利用者の回転・拡大を加えた視点(領域の中心まわりで回る)。
//   figureRegion(width, height)、isPortrait(width, height)、viewOptions(width, height, selection):
//     画面の大きさから、UI に覆われない図の領域と構成(デスクトップ / 縦画面)を計算する。
// store と renderer をつなぐ部分(状態の変化の検知、時間をかけた補間、利用者の操作)は scene/cameraRig.js が受け持つ。
//
// 視点の座標の約束(renderer.setView と同じ):
//   azimuth   Y 軸まわり。0 でカメラは +z 側にあり、-z 向きを見る(真横で x が右)
//   elevation 仰角。0 で真横、π/2 で真上
//   zoom      ワールド 1 単位が画面の高さの何分の一か(画面の大きさに依らない)
//   center    [x, y, z] 注視点(画面の中心に来る点)
//   roll      画面の像を時計まわりに回す角度。縦長の画面の真横と斜め俯瞰では π/2(北海道が上)
import { CAMERA_PRESETS } from '../geometry/constants.js';
import { arcPoint } from '../geometry/arc.js';
import { lineLayout, nodePos } from '../geometry/layout.js';
import { selectionMask } from '../geometry/flows.js';

export const VIEWS = CAMERA_PRESETS;

// ---- 画面の構成と、図の領域(docs/design/spec.md「画面の構成と重なり順」) ----

/** この幅(CSS px)より狭い画面は、縦画面の構成(上の帯とドック)にする。 */
export const DESKTOP_BREAKPOINT = 1024;
/** 図を領域に収めるときの四辺の余白(領域の寸法に対する割合)。真横で一直線が領域の幅の 93% になる。 */
export const FIT_MARGIN = 0.035;
/** 地域を選んだときの拡大率(選択なしで収めた拡大率に対する倍率)。東京圏で 2.5 倍前後が読みやすい。 */
export const SELECTION_ZOOM = 2.5;
/** 選択地域を置く範囲: 領域の四辺からこの割合だけ内側。この外へ出る向きにだけ、図を動かして収める。 */
export const SELECTION_COMFORT = 0.18;
/** 縦画面の真横で、都道府県名の索引(図の右側)のために右から空ける幅(CSS px)。 */
export const PORTRAIT_LABEL_GUTTER = 80;
/** 遷移の長さ(秒)と、真横から立ち上がるとき morph を動かし始めるまでの回転の割合。 */
export const TRANSITION_SECONDS = 1.6;
export const MORPH_DELAY = 0.15;
/** 利用者が動かせる範囲。 */
export const USER_LIMITS = { azimuth: 1.4, elevationMin: 0, elevationMax: Math.PI / 2, zoomMin: 0.6, zoomMax: 8 };

/** 縦画面の構成か。判定は幅だけ(縦横比では判定しない)。 */
export function isPortrait(width) {
  return width < DESKTOP_BREAKPOINT;
}

/**
 * 固定の UI に覆われない図の領域(CSS px、画面の左上が原点)。
 *  デスクトップ: 左の柱(目次と章の本文、424px まで)と右 40px、上の帯(96px まで)と下の年・凡例の帯を除く。
 *  縦画面: 上の帯(72px まで)と、下のドック(高さ 150px)+ 余白 16px の間。左右は 16px。
 */
export function figureRegion(width, height) {
  const r = isPortrait(width)
    ? { x0: 16, y0: 72, x1: width - 16, y1: height - 166 }
    : { x0: 424, y0: 96, x1: width - 40, y1: height - 100 };
  // 小さな画面でも領域が潰れないようにする
  if (r.x1 - r.x0 < 120) { const c = (r.x0 + r.x1) / 2; r.x0 = c - 60; r.x1 = c + 60; }
  if (r.y1 - r.y0 < 120) { const c = (r.y0 + r.y1) / 2; r.y0 = c - 60; r.y1 = c + 60; }
  return r;
}

/** viewFor に渡す opts を、画面の大きさ(CSS px)と state.selection から作る。 */
export function viewOptions(width, height, selection = null) {
  return { size: [width, height], region: figureRegion(width, height), portrait: isPortrait(width), selection };
}

// ---- 角度・ベクトルの道具 ----

const TWO_PI = Math.PI * 2;
const norm = (a) => ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + norm(b - a) * t;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** 真上で北が画面の上になる azimuth。 */
export function topAzimuth(northAngle) {
  return Math.atan2(-Math.cos(northAngle), -Math.sin(northAngle));
}

/** カメラの向きから、画面の右・上のワールドでの単位ベクトルを返す。 */
export function screenAxes(azimuth, elevation, roll) {
  const sa = Math.sin(azimuth), ca = Math.cos(azimuth);
  const se = Math.sin(elevation), ce = Math.cos(elevation);
  const f = [-ce * sa, -se, -ce * ca];
  let u = [-se * sa, ce, -se * ca];
  // 上向きを視線の逆向きの軸まわりに roll だけ回す(renderer と同じ規約)
  const axis = [-f[0], -f[1], -f[2]];
  const c = Math.cos(roll), s = Math.sin(roll);
  const dot = axis[0] * u[0] + axis[1] * u[1] + axis[2] * u[2];
  const cr = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
  u = [0, 1, 2].map((k) => u[k] * c + cr[k] * s + axis[k] * dot * (1 - c));
  const r = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  return { right: r, up: u };
}

/** ワールドの点 P が、視点 view で画面のどこ(CSS px、左上が原点)に映るか。 */
export function projectPoint(view, P, size) {
  const [W, H] = size ?? view.size;
  const { right, up } = screenAxes(view.azimuth, view.elevation, view.roll);
  const d = [P[0] - view.center[0], P[1] - view.center[1], P[2] - view.center[2]];
  const s = view.zoom * H;
  return [
    W / 2 + s * (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]),
    H / 2 - s * (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]),
  ];
}

/** ワールドの点 anchor が画面の target(CSS px)に映るような注視点。 */
function centerFor(anchor, target, size, zoom, right, up) {
  const [W, H] = size;
  const s = zoom * H;
  const dr = (target[0] - W / 2) / s;
  const du = (H / 2 - target[1]) / s;
  return [0, 1, 2].map((k) => anchor[k] - right[k] * dr - up[k] * du);
}

// ---- 図の形(収める対象) ----

const cloudCache = new WeakMap();

/**
 * 図の形を表す点群: 都道府県の位置と、すべての弧(地上・地下の両方)の途中の点。
 * morph と lean は定位置の値。Float64Array [x, y, z, ...]。
 */
function figureCloud(layout, morph, lean) {
  let byKey = cloudCache.get(layout);
  if (!byKey) cloudCache.set(layout, (byKey = new Map()));
  const key = `${morph}|${lean}`;
  if (byKey.has(key)) return byKey.get(key);
  const line = layout.line ?? lineLayout();
  const P = Array.from({ length: 47 }, (_, i) => nodePos(line, layout.geo, i, morph));
  const out = [];
  for (let i = 0; i < 47; i++) out.push(P[i][0], 0, P[i][1]);
  const tmp = [0, 0, 0];
  for (let o = 0; o < 47; o++) {
    for (let d = 0; d < 47; d++) {
      if (o === d) continue;
      for (const side of [1, -1]) {
        for (const t of [0.3, 0.5, 0.7]) {
          arcPoint(P[o], P[d], side, lean, t, tmp);
          out.push(tmp[0], tmp[1], tmp[2]);
        }
      }
    }
  }
  const cloud = { points: Float64Array.from(out), nodes: P };
  byKey.set(key, cloud);
  return cloud;
}

function extent(points, right, up) {
  let rMin = Infinity, rMax = -Infinity, uMin = Infinity, uMax = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    const r = x * right[0] + y * right[1] + z * right[2];
    const u = x * up[0] + y * up[1] + z * up[2];
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
  }
  return { rMin, rMax, uMin, uMax };
}

/** 選択している都道府県の添字。 */
function selectedIndices(selection) {
  if (!selection) return [];
  const mask = selectionMask(selection);
  const out = [];
  for (let i = 0; i < 47; i++) if (mask[i]) out.push(i);
  return out;
}

/** 1 軸で、範囲 [lo, hi] を [cLo, cHi] に収めるための移動量。範囲が大きすぎるときは中央に合わせる。 */
function slide(lo, hi, cLo, cHi) {
  if (hi - lo >= cHi - cLo) return (cLo + cHi) / 2 - (lo + hi) / 2;
  if (lo < cLo) return cLo - lo;
  if (hi > cHi) return cHi - hi;
  return 0;
}

/**
 * 定位置 preset の視点。aspect は画面の幅 / 高さ、layout は renderer.layout、opts は先頭のコメントを参照。
 */
export function viewFor(preset, aspect, layout, opts = {}) {
  const name = CAMERA_PRESETS[preset] ? preset : 'side';
  const p = CAMERA_PRESETS[name];
  // size を省略したときは、高さ 900px の画面として扱う(幅は aspect から決まる)
  const size = opts.size ?? [aspect * 900, 900];
  const [W, H] = size;
  const portrait = opts.portrait ?? isPortrait(W);
  let region = opts.region ?? { x0: 0, y0: 0, x1: W, y1: H };
  if (portrait && name === 'side') region = { ...region, x1: Math.max(region.x0 + 120, region.x1 - PORTRAIT_LABEL_GUTTER) };

  const azimuth = p.azimuth ?? topAzimuth(layout.northAngle);
  const roll = name !== 'top' && portrait ? Math.PI / 2 : 0;
  const { right, up } = screenAxes(azimuth, p.elevation, roll);

  // 図の全体(都道府県と弧)を、領域の余白の内側いっぱいに収める
  const cloud = figureCloud(layout, p.morph, p.lean);
  const ext = extent(cloud.points, right, up);
  const rc = (ext.rMin + ext.rMax) / 2, uc = (ext.uMin + ext.uMax) / 2;
  const rw = Math.max(ext.rMax - ext.rMin, 1e-6), uh = Math.max(ext.uMax - ext.uMin, 1e-6);
  const rw0 = region.x1 - region.x0, rh0 = region.y1 - region.y0;
  const fit = Math.min((rw0 * (1 - 2 * FIT_MARGIN)) / rw, (rh0 * (1 - 2 * FIT_MARGIN)) / uh); // CSS px / ワールド 1 単位
  const anchor = [0, 1, 2].map((k) => right[k] * rc + up[k] * uc); // 図の中心(画面の右・上の座標が (rc, uc) の点)
  let target = [(region.x0 + region.x1) / 2, (region.y0 + region.y1) / 2];
  let scale = fit;

  // 地域を選んでいるときは、その地域を拡大して領域の中に置く(正投影のまま拡大するので、量の比は崩れない)
  const sel = name === 'side' ? [] : selectedIndices(opts.selection);
  if (sel.length) {
    scale = fit * SELECTION_ZOOM;
    // 拡大後の、選択地域の画面上の範囲(図の中心が領域の中心に来る場合)
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (const i of sel) {
      const [x, z] = cloud.nodes[i];
      const r = x * right[0] + z * right[2], u = x * up[0] + z * up[2];
      const sx = target[0] + (r - rc) * scale, sy = target[1] - (u - uc) * scale;
      bx0 = Math.min(bx0, sx); bx1 = Math.max(bx1, sx);
      by0 = Math.min(by0, sy); by1 = Math.max(by1, sy);
    }
    const mx = rw0 * SELECTION_COMFORT, my = rh0 * SELECTION_COMFORT;
    target = [
      target[0] + slide(bx0, bx1, region.x0 + mx, region.x1 - mx),
      target[1] + slide(by0, by1, region.y0 + my, region.y1 - my),
    ];
  }

  const zoom = scale / H;
  const center = centerFor(anchor, target, size, zoom, right, up);
  return { azimuth, elevation: p.elevation, zoom, center, roll, morph: p.morph, lean: p.lean, anchor, target, size };
}

/**
 * 利用者の回転・拡大を加えた視点。anchor を target に置いたまま回すので、図は領域の中心まわりで回る。
 * azimuth / elevation は絶対値(省略すると view のまま)、zoomScale は view の zoom に掛ける倍率。
 */
export function reorient(view, { azimuth = view.azimuth, elevation = view.elevation, zoomScale = 1 } = {}) {
  const zoom = view.zoom * zoomScale;
  const out = { ...view, azimuth, elevation, zoom };
  if (view.anchor && view.target && view.size) {
    const { right, up } = screenAxes(azimuth, elevation, view.roll);
    out.center = centerFor(view.anchor, view.target, view.size, zoom, right, up);
  }
  return out;
}

/** 画面上のドラッグ(dx, dy は CSS px)を、方位と仰角の変化(ラジアン)にする。縦画面の roll を考慮する。 */
export function dragToAngles(dx, dy, roll = 0, sensitivity = 0.006) {
  const c = Math.cos(roll), s = Math.sin(roll);
  const ux = dx * c + dy * s; // 画面の像を roll の逆に回して、回す前の画面での動きにする
  const uy = -dx * s + dy * c;
  return { dAzimuth: -ux * sensitivity, dElevation: uy * sensitivity };
}

/** 利用者の回転を、範囲(定位置の方位 ± 80°、地面の下へは回り込まない)に収める。 */
export function clampOrbit(base, azimuth, elevation) {
  const L = USER_LIMITS;
  return {
    azimuth: base.azimuth + clamp(azimuth - base.azimuth, -L.azimuth, L.azimuth),
    elevation: clamp(elevation, L.elevationMin, L.elevationMax),
  };
}

// ---- 遷移 ----

/** CSS の cubic-bezier(x1, y1, x2, y2) と同じ緩急の関数 t → 0〜1。 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (u) => ((ax * u + bx) * u + cx) * u;
  const Y = (u) => ((ay * u + by) * u + cy) * u;
  const dX = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = X(u) - x;
      if (Math.abs(e) < 1e-7) return Y(u);
      const d = dX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0, hi = 1;
    u = x;
    for (let i = 0; i < 40; i++) {
      const e = X(u) - x;
      if (Math.abs(e) < 1e-7) break;
      if (e > 0) hi = u; else lo = u;
      u = (lo + hi) / 2;
    }
    return Y(u);
  };
}

/** 遷移の緩急(`--ease-inout`: cubic-bezier(.65, 0, .35, 1))。 */
export const easeCamera = cubicBezier(0.65, 0, 0.35, 1);

/**
 * morph の進み方。morph = 0 の定位置から離れるときは、回転の最初の 15% の間は 0 のまま(平面の図が立体に見えてから
 * 都道府県が動き始める)。morph = 0 へ戻るときは、回転の最後の 15% の前に 0 になる。
 */
function morphProgress(a, b, s) {
  if (a.morph === 0 && b.morph > 0) return clamp((s - MORPH_DELAY) / (1 - MORPH_DELAY), 0, 1);
  if (b.morph === 0 && a.morph > 0) return clamp(s / (1 - MORPH_DELAY), 0, 1);
  return s;
}

/**
 * 2つの視点 a、b を s(0〜1、緩急は適用済み)で補間する。角度は短い側へ回り、zoom は対数で補間する。
 * a、b が anchor / target / size を持つときは、中心を毎回それらから決める(図が領域の中心から外れずに回る)。
 */
export function tween(a, b, s) {
  const azimuth = lerpAngle(a.azimuth, b.azimuth, s);
  const elevation = lerp(a.elevation, b.elevation, s);
  const roll = lerpAngle(a.roll, b.roll, s);
  const zoom = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), s));
  const out = {
    azimuth, elevation, zoom, roll,
    center: [0, 1, 2].map((k) => lerp(a.center[k], b.center[k], s)),
    morph: lerp(a.morph, b.morph, morphProgress(a, b, s)),
    lean: lerp(a.lean, b.lean, s),
  };
  if (a.anchor && b.anchor && a.target && b.target && b.size) {
    out.anchor = [0, 1, 2].map((k) => lerp(a.anchor[k], b.anchor[k], s));
    out.target = [0, 1].map((k) => lerp(a.target[k], b.target[k], s));
    out.size = b.size;
    const { right, up } = screenAxes(azimuth, elevation, roll);
    out.center = centerFor(out.anchor, out.target, out.size, zoom, right, up);
  }
  return out;
}
