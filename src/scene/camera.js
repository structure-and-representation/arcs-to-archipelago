// カメラの定位置と補間(純関数。store も renderer も触らない)。
//   viewFor(preset, aspect, layout, opts) → { azimuth, elevation, zoom, center, roll, morph, lean, anchor, target, size }
//     preset: 'side' | 'oblique' | 'top'、aspect: 画面の幅 / 高さ、layout: renderer.layout({ line, geo, northAngle, bounds })。
//     azimuth ... roll は renderer.setView にそのまま渡せる。morph は state.morph の目標値、lean は renderer.setLean の値。
//     opts: { size: [幅, 高さ](CSS px)、region: 図を収める領域 { x0, y0, x1, y1 }(CSS px、画面の左上が原点)、
//             portrait: 縦画面の構成か(幅 1024px 未満。縦横比では判定しない)、selection: state.selection }。
//             region を省略すると、画面いっぱいに収める。図は region の中央に収まり、center と zoom がそれを表す。
//     anchor / target / size は、図の基準点(ワールド)がその領域のどこに来るかを表す。center はそこから決まる。
//   tween(a, b, s, layout) → 2つの視点を s(0〜1)で補間した視点。角度は短い側へ、zoom は対数で補間する。
//     layout を渡すと、途中の視点でも図(都道府県と弧)を領域に収め直す(viewFor が返す fit を使う)。
//     真横(morph 0)と地図(morph 1)の間は、仰角を先に上げてから方位を回す(列島がカメラの方を向いて縮まない)。
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
//   roll      画面の像を時計まわりに回す角度。定位置ではいつも 0(真横は北海道が左、斜め俯瞰と真上は北が上)
import { CAMERA_PRESETS, isCameraName } from '../geometry/constants.js';
import { arcPoint } from '../geometry/arc.js';
import { lineLayout, nodePos } from '../geometry/layout.js';
import { selectionMask } from '../geometry/flows.js';

export const VIEWS = CAMERA_PRESETS;

// ---- 画面の構成と、図の領域(docs/design/spec.md「画面の構成と重なり順」) ----

/** この幅(CSS px)より狭い画面は、縦画面の構成(上の帯とドック)にする。 */
export const DESKTOP_BREAKPOINT = 1024;
/** 図を領域に収めるときの四辺の余白(領域の寸法に対する割合)。真横で一直線が領域の幅の 93% になる。 */
export const FIT_MARGIN = 0.035;
/**
 * 地域を選んだときの拡大率の上限(選択なしで収めた拡大率に対する倍率)。
 * 拡大率は、47 都道府県と、選択地域とすべての相手先の間の地上・地下の弧が領域に収まる値で、この値までの範囲。
 */
export const SELECTION_ZOOM = 2.5;
/** 地域を選んだときの拡大率の下限(同じ領域に全体を収めた拡大率に対する倍率)。 */
export const SELECTION_ZOOM_MIN = 0.75;
/**
 * 地域を選んだときの斜め俯瞰の仰角と弧の倒し(案C4)。選択なしの 36° より低く見て、立てた弧(lean 0)の
 * 地上(転入、画面の上へふくらむ)と地下(転出、画面の下へふくらむ)の厚みの差が見える角度にする。
 */
export const SELECTION_OBLIQUE = Object.freeze({ elevation: (26 * Math.PI) / 180, lean: 0 });
/** 選択地域を置く範囲: 領域の四辺からこの割合だけ内側。この外へ出る向きにだけ、図を動かして収める。 */
export const SELECTION_COMFORT = 0.18;
/** 斜め俯瞰と真上で、図を置く領域の上端(CSS px)。デスクトップは読み出し(選択なしのとき y 185 まで)と、その右下へ張り出す北海道の陸地の面を避ける高さ、縦画面は図の向きの注記の下。 */
export const DESKTOP_FIGURE_TOP = 250;
/** デスクトップで地域を選んでいるとき、右の読み出しの列(幅 300 + 右の余白 40 + 間 24)を図の領域から外す幅。 */
export const DESKTOP_READOUT_COLUMN = 324;
/** 読み出しの列を外すと図が細くなりすぎる幅(CSS px)。これより狭いデスクトップでは、列を外さず、図を読み出しの下へ下げる。 */
export const DESKTOP_WIDE = 1280;
/** 地域を選んでいるときの読み出しの下端(CSS px。「全国に戻る」の下)。幅の狭いデスクトップは、斜め俯瞰と真上の図をここより下に置く。 */
export const DESKTOP_READOUT_BOTTOM = 340;
export const PORTRAIT_FIGURE_TOP = 118;
/**
 * 縦画面では、上の帯の下(y 72)からドックの上(高さ − 180)までを、図(上)と本文のカード(下)で分け合う。
 * 図はその上側のこの割合。本文のカードは図の下からドックの上までに固定して出す(styles/ui-chapters.css、ui/chapters.js)。
 */
export const PORTRAIT_FIGURE_SHARE = 0.55;
export const PORTRAIT_TOP = 72;
export const PORTRAIT_DOCK = 180;
/** 縦画面の真横で、都道府県名の索引(図の右側)のために右から空ける幅(CSS px)。いまの縦画面の真横は回さないので使わない。 */
export const PORTRAIT_LABEL_GUTTER = 80;
/** 縦画面の真横で、並びの下の縦書きの索引のために、図の領域の下から空ける高さ(CSS px)。 */
export const PORTRAIT_INDEX_GUTTER = 44;
/** 遷移の長さ(秒)と、真横から立ち上がるとき morph を動かし始めるまでの回転の割合。 */
export const TRANSITION_SECONDS = 1.6;
/** 真横と地図の間の遷移(変形)の長さ(秒)。作品の見せ場なので、ほかの遷移より長くとる。 */
export const MORPH_TRANSITION_SECONDS = 1.8;
/**
 * 真横(morph 0)から地図(morph 1)へ移るときの段取り(遷移の進み s。緩急は成分ごとにかける)。2 つの段に分ける。
 *  1 段目(0 〜 MORPH_END、約 0.8 秒): カメラは真横のまま、morph を 0 から 1 へ動かす(点が地理の並びへ動き、弧の高さが変わる)。
 *  2 段目(MORPH_END 〜 1、約 1.0 秒): カメラを起こす。仰角は ELEVATION_FROM 〜 ELEVATION_LEAD で上がりきり、
 *    方位は AZIMUTH_FROM 〜 1 で回る(仰角を先に上げるので、方位の回転は画面の中の回転に近くなり、列島が縮まない)。
 *  逆向き(地図から真横)は、この段取りを時間で裏返す(カメラを寝かせてから、並びへ戻す)。
 * 傾いた図が伸びる「どちらでもない」時間を作らず、どの点がどこへ行ったかを、真横のまま目で追えるようにする。
 */
export const MORPH_DELAY = 0;
export const MORPH_END = 0.44;
export const ELEVATION_FROM = 0.44;
export const ELEVATION_LEAD = 0.8;
export const AZIMUTH_FROM = 0.52;
/** 利用者が動かせる範囲。 */
export const USER_LIMITS = { azimuth: 1.4, elevationMin: 0, elevationMax: Math.PI / 2, zoomMin: 0.6, zoomMax: 8 };

/** CSS と同じ縦画面の条件(ui/portrait.js と同じ)。 */
export const PORTRAIT_MEDIA = '(max-width: 1023.98px)';

/**
 * 縦画面の構成か。判定は幅だけ(縦横比では判定しない)。
 * ブラウザでは、CSS の @media と同じ幅(スクロールバーを含む innerWidth)で判定するため matchMedia を使う
 * (キャンバスの幅はスクロールバーを含まないので、幅 1024px 前後で CSS と食い違う)。width はブラウザの外(テスト)で使う。
 */
export function isPortrait(width, { media = true } = {}) {
  if (media && typeof globalThis.matchMedia === 'function') return globalThis.matchMedia(PORTRAIT_MEDIA).matches;
  return width < DESKTOP_BREAKPOINT;
}

/**
 * 固定の UI に覆われない図の領域(CSS px、画面の左上が原点)。
 *  デスクトップ: 左の柱(目次と章の本文、424px まで)と右 40px、上の帯(96px まで)と下の年・凡例の帯を除く。
 *  縦画面: 上の帯(72px まで)と、下のドック(高さ 164px)+ 余白 16px の間。左右は 16px。
 */
export function figureRegion(width, height) {
  const r = isPortrait(width)
    ? { x0: 16, y0: PORTRAIT_TOP, x1: width - 16, y1: portraitSplit(height) }
    : { x0: 424, y0: 96, x1: width - 40, y1: height - 136 }; // 下端は年の切り替え(見出しの行を含む)の上
  // 小さな画面でも領域が潰れないようにする
  if (r.x1 - r.x0 < 120) { const c = (r.x0 + r.x1) / 2; r.x0 = c - 60; r.x1 = c + 60; }
  if (r.y1 - r.y0 < 120) { const c = (r.y0 + r.y1) / 2; r.y0 = c - 60; r.y1 = c + 60; }
  return r;
}

/** 縦画面で、図の領域の下端(= 本文のカードの領域の上端。CSS px)。 */
export function portraitSplit(height) {
  return Math.round(PORTRAIT_TOP + Math.max(0, height - PORTRAIT_DOCK - PORTRAIT_TOP) * PORTRAIT_FIGURE_SHARE);
}

/**
 * viewFor に渡す opts を、画面の大きさ(CSS px)と state.selection から作る。
 * partners は選択地域の主要な相手先の添字(構図に収める。省略すると選択地域だけを基準にする)。
 */
export function viewOptions(width, height, selection = null, partners = null) {
  return { size: [width, height], region: figureRegion(width, height), portrait: isPortrait(width), selection, partners };
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
  // 遷移の途中の値は毎回変わるので、溜め込まない(定位置の値だけが繰り返し使われる)
  if (byKey.size > 8) byKey.clear();
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

/** extent の結果 a、b を合わせた範囲。 */
function mergeExtent(a, b) {
  return { rMin: Math.min(a.rMin, b.rMin), rMax: Math.max(a.rMax, b.rMax), uMin: Math.min(a.uMin, b.uMin), uMax: Math.max(a.uMax, b.uMax) };
}

/** 陸地の面が現れ始める morph と、現れきる morph(scene/ground.js の APPEAR と同じ)。 */
const LAND_FROM = 0.6;
const LAND_TO = 1.0;

/**
 * 陸地の外形(layout.landHull、地理配置のワールド座標)の点群 [x, 0, z, ...]。縦画面で、陸地の面が領域の外へ切れないよう、
 * 図の範囲に加える。面が現れる前(morph が小さいとき)は、点を都道府県の重心へ寄せて範囲に効かせない
 * (遷移の途中で範囲が跳ばないよう、面の現れ方と同じ速さで外へ広げる)。
 */
function landCloud(layout, nodes, morph) {
  const hull = layout.landHull;
  if (!hull?.length) return null;
  const t = Math.min(1, Math.max(0, (morph - LAND_FROM) / (LAND_TO - LAND_FROM)));
  const w = t * t * (3 - 2 * t);
  if (w <= 0) return null;
  let cx = 0, cz = 0;
  for (const [x, z] of nodes) { cx += x; cz += z; }
  cx /= nodes.length; cz /= nodes.length;
  const out = new Float64Array(hull.length * 3);
  hull.forEach(([x, z], i) => { out[i * 3] = cx + (x - cx) * w; out[i * 3 + 2] = cz + (z - cz) * w; });
  return out;
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

/** デスクトップの真横で、都道府県名の縦書きの索引のために下から空ける高さ(CSS px)。 */
export const DESKTOP_SIDE_INDEX_GUTTER = 130;

/**
 * 定位置ごとに、図を収める領域を整える(docs/design/spec.md 4 節)。
 *  縦画面の真横: 右に都道府県名の索引の余白を空ける。
 *  斜め俯瞰と真上: デスクトップでは読み出しの下端より下、縦画面では図の向きの注記(2 行)より下に収める。
 *  デスクトップで地域を選んでいるとき(斜め俯瞰と真上): 読み出しが縦に伸びるので、幅 1280px 以上では右の読み出しの列を外し、
 *  上端は上の帯の下(y 96)のままにする。幅 1280px 未満は列を外すと図が細くなるので、列は外さず、上端を読み出しの下端
 *  (DESKTOP_READOUT_BOTTOM)まで下げる。どちらも、図・相手先・弧が読み出しの文字の下を通らないようにするため。
 * fromLayout は region が画面の構成(figureRegion)から来たか(省略して画面いっぱいのときは上端を変えない)。
 */
export function presetRegion(preset, region, portrait, fromLayout = true, selected = false) {
  let r = region;
  // 縦画面の真横は回さずに横長の並びを描き、並びの下に縦書きの索引を出すので、下を空ける
  if (portrait && preset === 'side' && fromLayout) r = { ...r, y1: Math.max(r.y0 + 80, r.y1 - PORTRAIT_INDEX_GUTTER) };
  // デスクトップの真横は、並びの下に縦書きの索引が付く。索引のぶんだけ下を空け、弧の塊を上へ寄せる
  if (!portrait && preset === 'side' && fromLayout) r = { ...r, y1: Math.max(r.y0 + 200, r.y1 - DESKTOP_SIDE_INDEX_GUTTER) };
  const wide = r.x1 + 40 >= DESKTOP_WIDE; // 右の余白 40px を足すと画面の幅
  if (preset !== 'side' && fromLayout && selected && !portrait && wide && r.x1 - DESKTOP_READOUT_COLUMN - r.x0 >= 300) {
    return { ...r, x1: r.x1 - DESKTOP_READOUT_COLUMN };
  }
  if (preset !== 'side' && fromLayout) {
    const narrowSelected = selected && !portrait && !wide;
    const top = portrait ? PORTRAIT_FIGURE_TOP : narrowSelected ? DESKTOP_READOUT_BOTTOM : DESKTOP_FIGURE_TOP;
    if (r.y1 - top >= (portrait ? 120 : 200)) r = { ...r, y0: Math.max(r.y0, top) };
  }
  return r;
}

/**
 * 視点の向き(azimuth、elevation、roll)と図の形(morph、lean)に対して、図を region に収める拡大率と注視点。
 * sel は選択している都道府県の添字(空なら選択なし)。
 *  選択なし: 図の全体(47 都道府県と、すべての地上・地下の弧)を領域の余白の内側いっぱいに収める。
 *  選択あり: 47 都道府県と、選択地域とすべての相手先の間の地上・地下の弧を収める(相手先を画面の外へ出さない)。
 *    全体を収める拡大率の SELECTION_ZOOM_MIN〜SELECTION_ZOOM 倍の範囲で、そのうえで選択地域を領域の内側に寄せる。
 */
function frameFigure(layout, v, region, size, sel, land = false) {
  const [, H] = size;
  const { right, up } = screenAxes(v.azimuth, v.elevation, v.roll);
  const cloud = figureCloud(layout, v.morph, v.lean);
  const hull = land ? landCloud(layout, cloud.nodes, v.morph) : null;
  let ext = extent(cloud.points, right, up);
  if (hull) ext = mergeExtent(ext, extent(hull, right, up));
  const rc = (ext.rMin + ext.rMax) / 2, uc = (ext.uMin + ext.uMax) / 2;
  const rw = Math.max(ext.rMax - ext.rMin, 1e-6), uh = Math.max(ext.uMax - ext.uMin, 1e-6);
  const rw0 = region.x1 - region.x0, rh0 = region.y1 - region.y0;
  const fit = Math.min((rw0 * (1 - 2 * FIT_MARGIN)) / rw, (rh0 * (1 - 2 * FIT_MARGIN)) / uh); // CSS px / ワールド 1 単位
  const anchor = [0, 1, 2].map((k) => right[k] * rc + up[k] * uc); // 図の中心(画面の右・上の座標が (rc, uc) の点)
  let target = [(region.x0 + region.x1) / 2, (region.y0 + region.y1) / 2];
  let scale = fit;

  if (sel.length) {
    const P = cloud.nodes;
    const pts = [];
    const tmp = [0, 0, 0];
    for (let i = 0; i < 47; i++) pts.push(P[i][0], 0, P[i][1]);
    for (const m of sel) {
      for (let q = 0; q < 47; q++) {
        if (sel.includes(q)) continue;
        for (const t of [0.15, 0.3, 0.5, 0.7, 0.85]) {
          arcPoint(P[q], P[m], 1, v.lean, t, tmp); // 転入(地上)
          pts.push(tmp[0], tmp[1], tmp[2]);
          arcPoint(P[m], P[q], -1, v.lean, t, tmp); // 転出(地下)
          pts.push(tmp[0], tmp[1], tmp[2]);
        }
      }
    }
    let fe = extent(pts, right, up);
    if (hull) fe = mergeExtent(fe, extent(hull, right, up));
    const fw = Math.max(fe.rMax - fe.rMin, 1e-6), fh = Math.max(fe.uMax - fe.uMin, 1e-6);
    const focusFit = Math.min((rw0 * (1 - 2 * FIT_MARGIN)) / fw, (rh0 * (1 - 2 * FIT_MARGIN)) / fh);
    scale = clamp(focusFit, fit * SELECTION_ZOOM_MIN, fit * SELECTION_ZOOM);
    // 収める対象の中心を領域の中心に置く
    const fc = [(fe.rMin + fe.rMax) / 2, (fe.uMin + fe.uMax) / 2];
    target = [target[0] - (fc[0] - rc) * scale, target[1] + (fc[1] - uc) * scale];
    // 拡大後の、選択地域の画面上の範囲
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (const i of sel) {
      const [x, z] = P[i];
      const r = x * right[0] + z * right[2], u = x * up[0] + z * up[2];
      const sx = target[0] + (r - rc) * scale, sy = target[1] - (u - uc) * scale;
      bx0 = Math.min(bx0, sx); bx1 = Math.max(bx1, sx);
      by0 = Math.min(by0, sy); by1 = Math.max(by1, sy);
    }
    const mx = rw0 * SELECTION_COMFORT, my = rh0 * SELECTION_COMFORT;
    // 選択地域を内側へ寄せる移動は、相手先と弧の範囲が領域からはみ出さない範囲に限る
    const roomX = Math.max(0, (rw0 * (1 - 2 * FIT_MARGIN) - fw * scale) / 2);
    const roomY = Math.max(0, (rh0 * (1 - 2 * FIT_MARGIN) - fh * scale) / 2);
    target = [
      target[0] + clamp(slide(bx0, bx1, region.x0 + mx, region.x1 - mx), -roomX, roomX),
      target[1] + clamp(slide(by0, by1, region.y0 + my, region.y1 - my), -roomY, roomY),
    ];
  }

  const zoom = scale / H;
  return { zoom, anchor, target, center: centerFor(anchor, target, size, zoom, right, up) };
}

/**
 * 定位置 preset の視点。aspect は画面の幅 / 高さ、layout は renderer.layout、opts は先頭のコメントを参照。
 * 戻り値の fit = { region, sel } は、遷移の途中で図を収め直すための値(tween が使う)。
 */
export function viewFor(preset, aspect, layout, opts = {}) {
  const name = isCameraName(preset) ? preset : 'side';
  const p = CAMERA_PRESETS[name];
  // size を省略したときは、高さ 900px の画面として扱う(幅は aspect から決まる)
  const size = opts.size ?? [aspect * 900, 900];
  const [W, H] = size;
  const portrait = opts.portrait ?? isPortrait(W);
  const sel = name === 'side' ? [] : selectedIndices(opts.selection);
  const region = presetRegion(name, opts.region ?? { x0: 0, y0: 0, x1: W, y1: H }, portrait, !!opts.region, sel.length > 0);

  const azimuth = p.azimuth ?? topAzimuth(layout.northAngle);
  // どの定位置も回さない。縦画面の図の領域は本文と分け合う横長の領域なので、真横も横長の並びのまま収める
  const roll = 0;
  const tilt = sel.length && name === 'oblique' ? SELECTION_OBLIQUE : null;
  const elevation = tilt ? tilt.elevation : p.elevation;
  const lean = tilt ? tilt.lean : p.lean;
  const v = { azimuth, elevation, roll, morph: p.morph, lean };
  const f = frameFigure(layout, v, region, size, sel, portrait);
  return { ...v, zoom: f.zoom, center: f.center, anchor: f.anchor, target: f.target, size, fit: { region, sel, land: portrait } };
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

const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * 遷移の各成分の進み(0〜1)。el: 仰角、az: 方位と roll、morph、rest: lean・zoom・注視点など。
 *  真横(morph 0)から地図(morph 1)へ: 仰角を先に上げ、方位は後から回す。都道府県は、回転の最初の 15% の間は
 *  動かない(平面の図が立体に見えてから動き始める)。地図から真横へは、同じ段取りを時間で裏返す。
 *  それ以外(斜め俯瞰と真上の間など): すべて同じ進み。
 */
export function tweenChannels(a, b, s, ease = null) {
  const E = ease ?? ((x) => x);
  const win = (lo, hi, x) => E(clamp((x - lo) / (hi - lo), 0, 1));
  const rise = (x) => ({
    el: win(ELEVATION_FROM, ELEVATION_LEAD, x),
    az: win(AZIMUTH_FROM, 1, x),
    morph: win(MORPH_DELAY, MORPH_END, x),
  });
  if (isMorphing(a, b)) {
    if (a.morph === 0) return { ...rise(s), rest: E(s) };
    const r = rise(1 - s);
    return { el: 1 - r.el, az: 1 - r.az, morph: 1 - r.morph, rest: E(s) };
  }
  const e = E(s);
  return { el: e, az: e, morph: e, rest: e };
}

/** a から b への遷移が、真横(morph 0)と地図(morph > 0)の間の変形か。 */
export function isMorphing(a, b) {
  return (a.morph === 0 && b.morph > 0) || (b.morph === 0 && a.morph > 0);
}

const lerpRect = (a, b, s) => ({ x0: lerp(a.x0, b.x0, s), y0: lerp(a.y0, b.y0, s), x1: lerp(a.x1, b.x1, s), y1: lerp(a.y1, b.y1, s) });
const frameCache = new WeakMap();
/** 視点 v の向きと形で、v.fit の領域に図を収めた拡大率と注視点(v ごとに覚えておく)。 */
function frameOf(layout, v) {
  let f = frameCache.get(v);
  if (!f) {
    f = frameFigure(layout, v, v.fit.region, v.size, v.fit.sel, v.fit.land);
    frameCache.set(v, f);
  }
  return f;
}

/**
 * 2つの視点 a、b を s(0〜1)で補間する。角度は短い側へ回り、zoom は対数で補間する。
 * ease を渡すと、成分ごとに緩急をかける(変形の段取りの区間ごとに緩急がつく)。省略すると s は緩急をかけた後の値。
 * layout を渡し、a、b が fit と size を持つとき(viewFor の結果と、それを reorient・tween したもの)は、
 * 途中の向きと形で図を領域に収め直す。利用者が拡大・移動していた分は、収めた図に対する比として補間する。
 * そうでなく a、b が anchor / target / size を持つときは、中心を毎回それらから決める(図が領域の中心から外れずに回る)。
 */
export function tween(a, b, s, layout = null, ease = null) {
  const c = tweenChannels(a, b, s, ease);
  const azimuth = lerpAngle(a.azimuth, b.azimuth, c.az);
  const elevation = lerp(a.elevation, b.elevation, c.el);
  const roll = lerpAngle(a.roll, b.roll, c.az);
  const zoom = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), c.rest));
  const out = {
    azimuth, elevation, zoom, roll,
    center: [0, 1, 2].map((k) => lerp(a.center[k], b.center[k], c.rest)),
    morph: lerp(a.morph, b.morph, c.morph),
    lean: lerp(a.lean, b.lean, c.rest),
  };
  if (layout && a.fit && b.fit && a.size && b.size) {
    const size = b.size;
    const region = lerpRect(a.fit.region, b.fit.region, c.rest);
    const sel = b.fit.sel;
    const land = b.fit.land;
    const f = frameFigure(layout, out, region, size, sel, land);
    // 端の視点が、収めた図からどれだけ拡大・移動しているか(定位置そのものなら 1 倍・0px)
    const fa = frameOf(layout, a), fb = frameOf(layout, b);
    const pa = projectPoint(a, fa.anchor, a.size), pb = projectPoint(b, fb.anchor, b.size);
    const da = [pa[0] - fa.target[0], pa[1] - fa.target[1]];
    const db = [pb[0] - fb.target[0], pb[1] - fb.target[1]];
    out.zoom = f.zoom * Math.exp(lerp(Math.log(a.zoom / fa.zoom), Math.log(b.zoom / fb.zoom), c.rest));
    out.anchor = f.anchor;
    out.target = [f.target[0] + lerp(da[0], db[0], c.rest), f.target[1] + lerp(da[1], db[1], c.rest)];
    out.size = size;
    out.fit = { region, sel, land };
    const { right, up } = screenAxes(azimuth, elevation, roll);
    out.center = centerFor(out.anchor, out.target, size, out.zoom, right, up);
  } else if (a.anchor && b.anchor && a.target && b.target && b.size) {
    out.anchor = [0, 1, 2].map((k) => lerp(a.anchor[k], b.anchor[k], c.rest));
    out.target = [0, 1].map((k) => lerp(a.target[k], b.target[k], c.rest));
    out.size = b.size;
    const { right, up } = screenAxes(azimuth, elevation, roll);
    out.center = centerFor(out.anchor, out.target, out.size, zoom, right, up);
  }
  return out;
}
