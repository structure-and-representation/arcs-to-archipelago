// 都道府県名のラベル(デザイン仕様 5.9 節)。
// 要素: #labels。47 個の <button> と、圏の名前の 1 個(装飾)を作り、毎フレーム ctx.renderer.project(i) へ動かす。
//   - 真横(morph ≈ 0): 47 個すべてを索引として並べる。デスクトップは図の下に縦書き、縦画面は図の右に横書き。
//   - 変形の途中(真横と地図の間): 運ぶラベル(CARRIED: 両端と大きな都市、選択中・ホバー中の県)を点に付けたまま、
//     索引の位置から点の東へ運ぶ(morph に合わせて補間し、0.5 で縦書きから横書きへ移る)。ほかのラベルは動き始めに消える。
//   - 斜め俯瞰・真上: 優先度の高い順に、重ならない位置を貪欲に探して置く(配置は 100ms に 1 回まで)。
//     弧の上でも読めるよう、ラベルは紙の地の小さな札にする(styles/ui-labels.css)。
// 位置は transform: translate() で動かす。state の hover / selection / lang / year / chapter に追従する。
// ラベルの層は Tab の止まりを 1 つにして(roving tabindex)、←→ ↑↓ で移動し、Enter で選ぶ。
import { t, metroName } from '../i18n.js';
import { shortName } from '../i18n/tooltip.js';
import { PREF_EN, PREF_JA } from '../i18n/common.js';
import { METRO_CODES, STEP } from '../geometry/constants.js';
import { selectionMask } from '../geometry/flows.js';
import { topPartners } from '../data/stats.js';
import { CHAPTERS } from '../content/chapters.js';
import { collectFixedRects, rectsOverlap } from './avoid.js';
import { isPortrait } from '../scene/camera.js';

// ---------------------------------------------------------------------------------------------
// 定数(デザイン仕様 5.9 節)

/** 一直線の並びから索引までの距離(ワールドの単位。拡大率に比例させる)。 */
export const INDEX_OFFSET_V = 165; // デスクトップ: 並びの線から下へ(レンズの高さ + 12px)。1440 幅で 132px
export const INDEX_OFFSET_H = 184; // 縦画面: 並びの線から右へ。390 幅で 98px
export const INDEX_MORPH_MAX = 0.02; // この値未満なら真横の索引
export const INDEX_ELEVATION_MAX = 0.05;
export const PARTNERS = 6;
export const NATIONWIDE_MAX = 16;
/** 縦画面の全国表示で出すラベルの上限。 */
export const NATIONWIDE_MAX_PORTRAIT = 8;
/**
 * 変形の途中で点に付けたまま運ぶラベル(優先度の順): 北海道、沖縄、東京、大阪、福岡、宮城、愛知(両端と、大きな都市圏の中心)。
 * 横書きの札が重なるときは、優先度の低いほうを出さない(縦画面の狭い並びなど)。
 */
export const CARRIED = [0, 46, 12, 26, 39, 3, 22];
/** この morph 以上なら、変形を終えた地図のラベル(貪欲な配置)。 */
export const CARRY_MORPH_MAX = 0.98;
/** morph が 1 になってから、カメラが動き続けている間、運ぶラベルのままにする時間の上限(ms)。 */
export const CARRY_GRACE_MS = 1500;
/** 索引の列の間隔(CSS px)がこれ未満なら、索引を詰めた形にする(10px、1 つおき)。英語は INDEX_DENSE_EN。 */
export const INDEX_DENSE = 14;
export const INDEX_DENSE_EN = 16;
export const ENDPOINTS = [0, 46, 45]; // 北海道、沖縄、鹿児島
export const THROTTLE_MS = 100;
const GAP_LABEL = 3; // ラベルどうしの間隔(px)
const GAP_FIXED = 6; // 固定の UI との間隔
const EDGE = 8; // 画面の端
const DOT_MARGIN = 4; // 選択中の点を覆わない余白

// 候補の位置。点 (x, y) からのずらし。
//   ax: 1 = 左端を x + dx に、-1 = 右端を x + dx に、0 = 中心を x に
//   vy: 'center' = 縦の中心を y + dy に、'top' = 上端を y + dy に
export const CANDIDATES = [
  { name: 'E', dx: 7, ax: 1, dy: 0, vy: 'center' },
  { name: 'W', dx: -7, ax: -1, dy: 0, vy: 'center' },
  { name: 'N', dx: 0, ax: 0, dy: -11, vy: 'center' },
  { name: 'S', dx: 0, ax: 0, dy: 10, vy: 'top' },
  { name: 'NW', dx: -12, ax: -1, dy: -14, vy: 'center' },
  { name: 'NE', dx: 12, ax: 1, dy: -14, vy: 'center' },
];
export const GROUP_CANDIDATES = [
  { name: 'gNW', dx: -16, ax: -1, dy: -20, vy: 'center' },
  { name: 'gNE', dx: 16, ax: 1, dy: -20, vy: 'center' },
  ...CANDIDATES,
];

function candidateRect(c, x, y, w, h) {
  const left = c.ax === 1 ? x + c.dx : c.ax === -1 ? x + c.dx - w : x - w / 2;
  const top = c.vy === 'center' ? y + c.dy - h / 2 : y + c.dy;
  return { left, top, right: left + w, bottom: top + h };
}

// ---------------------------------------------------------------------------------------------
// 優先度

/** 選択地域との転入・転出の合計が多い都道府県(選択地域の外)の添字を、多い順に n 個。 */
export const partnerTotals = (matrix, mask, n = PARTNERS) => topPartners(matrix, mask, n);

/** 人の動きの大きい順(転入と転出の合計)。「人口の多い順」の代わりに、データから求める。 */
export function volumeOrder(matrix) {
  const v = new Float64Array(47);
  for (let o = 0; o < 47; o++) {
    for (let d = 0; d < 47; d++) {
      const n = matrix[o * 47 + d];
      v[o] += n;
      v[d] += n;
    }
  }
  return Array.from({ length: 47 }, (_, i) => i).sort((a, b) => v[b] - v[a] || a - b);
}

/**
 * 置く候補を優先度の順に並べる。要素は { key, i, cls, group }。key は 'p<i>' か 'g'。
 *  1 ホバー中(常に出す)  2 選択中の地域(圏は圏の名前 1 つ)  3 相手先の上位  4 章で扱う県  5 端点  6 動きの大きい順(全国のとき)
 *  全国表示では合計 16 個まで。地域を選んでいるときは 1〜5 の分だけ。
 */
export function labelOrder({ hover = null, selection = null, partners = [], featured = [], endpoints = ENDPOINTS, volume = [], max = NATIONWIDE_MAX }) {
  // (縦画面の全国表示では max に NATIONWIDE_MAX_PORTRAIT を渡す)
  const out = [];
  const seen = new Set();
  const mask = selectionMask(selection);
  const push = (i, cls, extra) => {
    if (i == null || seen.has(i)) return;
    seen.add(i);
    out.push({ key: `p${i}`, i, cls, group: false, ...extra });
  };
  if (hover != null) push(hover, mask[hover] && selection?.type === 'pref' ? 'sel' : 'em', { force: true });
  if (selection?.type === 'pref') push(selection.code - 1, 'sel');
  if (selection?.type === 'metro') out.push({ key: 'g', i: null, cls: 'sel group', group: true });
  for (const i of partners.slice(0, PARTNERS)) if (!mask[i]) push(i, 'partner');
  for (const i of featured) if (!mask[i]) push(i, 'em');
  for (const i of endpoints) if (!mask[i]) push(i, '');
  if (!selection) {
    for (const i of volume) {
      if (out.length >= max) break;
      push(i, '');
    }
    return out.slice(0, Math.max(max, out.filter((o) => o.force).length));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 貪欲な配置

/**
 * items: 優先度の順の [{ key, x, y, w, h, group, force }](x, y は基準の点の画面位置、w, h はラベルの大きさ)
 * bounds: { width, height }  fixed: 固定の UI の矩形  points: 覆ってはいけない点 [{ x, y, key }](選択中の都道府県の点)
 * prev: Map(key → 前回の候補の添字)。空いていれば同じ位置に残す(ヒステリシス)
 * 戻り値: items と同じ長さの配列。置けなかったものは null、置けたものは { left, top, right, bottom, cand }。
 * 置かない条件: すでに置いたラベルと 3px 以内、固定の UI と 6px 以内、選択中の点を覆う、画面の端から 8px 以内。
 * force(ホバー中)は常に置く: 条件を満たす候補がなければ、条件を緩めてでも置く。
 */
export function placeLabels({ items, bounds, fixed = [], points = [], prev = new Map() }) {
  const placed = [];
  const result = new Array(items.length).fill(null);
  const ok = (r, item, strict) => {
    if (r.left < EDGE || r.top < EDGE || r.right > bounds.width - EDGE || r.bottom > bounds.height - EDGE) return false;
    if (strict) {
      for (const p of placed) if (rectsOverlap(r, p, GAP_LABEL)) return false;
      for (const f of fixed) if (rectsOverlap(r, f, GAP_FIXED)) return false;
    }
    for (const p of points) {
      if (p.key === item.key) continue;
      if (p.x > r.left - DOT_MARGIN && p.x < r.right + DOT_MARGIN && p.y > r.top - DOT_MARGIN && p.y < r.bottom + DOT_MARGIN) return false;
    }
    return true;
  };
  items.forEach((item, n) => {
    const list = item.group ? GROUP_CANDIDATES : CANDIDATES;
    const order = list.map((_, k) => k);
    const keep = prev.get(item.key);
    if (keep != null && keep < list.length) order.sort((a, b) => (a === keep ? -1 : b === keep ? 1 : a - b));
    for (const strict of item.force ? [true, false] : [true]) {
      for (const k of order) {
        const r = candidateRect(list[k], item.x, item.y, item.w, item.h);
        if (!ok(r, item, strict)) continue;
        result[n] = { ...r, cand: k };
        placed.push(r);
        return;
      }
    }
    if (item.force) {
      // どの候補も画面の端などで置けない: 東に、画面の内側へ寄せて置く
      const r0 = candidateRect(list[0], item.x, item.y, item.w, item.h);
      const dx = Math.max(EDGE - r0.left, Math.min(0, bounds.width - EDGE - r0.right));
      const dy = Math.max(EDGE - r0.top, Math.min(0, bounds.height - EDGE - r0.bottom));
      const r = { left: r0.left + dx, top: r0.top + dy, right: r0.right + dx, bottom: r0.bottom + dy };
      result[n] = { ...r, cand: 0 };
      placed.push(r);
    }
  });
  return result;
}

// ---------------------------------------------------------------------------------------------
// 真横の索引

/**
 * 索引の位置。px, py は 47 個の点の画面位置、scale は画面の px / ワールド 1 単位(一直線の並びの長さ ÷ (46 × STEP))。
 * orient 'v': 点の x に中心を合わせ、並びの線から下へ INDEX_OFFSET_V × scale の位置に上端を置く(縦書き)。
 * orient 'h': 点の y に縦の中心を合わせ、並びの線から右へ INDEX_OFFSET_H × scale の位置に左端を置く(横書き)。
 * 戻り値: { x, y }[47]。v は x が中心・y が上端、h は x が左端・y が中心。
 */
export function indexLayout(px, py, scale, orient) {
  const out = [];
  if (orient === 'v') {
    let lineY = 0;
    for (let i = 0; i < 47; i++) lineY += py[i] / 47;
    for (let i = 0; i < 47; i++) out.push({ x: px[i], y: lineY + INDEX_OFFSET_V * scale });
  } else {
    let lineX = 0;
    for (let i = 0; i < 47; i++) lineX += px[i] / 47;
    for (let i = 0; i < 47; i++) out.push({ x: lineX + INDEX_OFFSET_H * scale, y: py[i] });
  }
  return out;
}

/**
 * 索引を 1 つおきにするか: 縦画面で画面の高さが 700px 未満のとき、または列が詰まりすぎるとき(dense)、
 * 北海道から数えて偶数番目だけを出す(守るもの: 選択中、ホバー中、章で扱う県は常に出す)。
 */
export function indexVisible(i, { portrait, height, protect, dense = false }) {
  if (!dense && (!portrait || height >= 700)) return true;
  return i % 2 === 0 || protect.has(i);
}

/** 縦書きの索引の列の間隔 gap(CSS px)が、字間なしで横につながって読めてしまうほど狭いか。 */
export function indexDense(gap, lang) {
  return gap < (lang === 'en' ? INDEX_DENSE_EN : INDEX_DENSE);
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 変形の途中で、点からこの距離(CSS px)以上離れたラベルは出さない(宙に浮かせない)。 */
export const CARRY_MAX_DIST = 40;
/** 横長の索引で、縦書きから横書きへ移る morph。 */
export const CARRY_FLIP = 0.3;

/**
 * 変形の途中のラベルの置き方。morph(0〜1)、orient('v' 横長の真横から / 'h' 回した真横から)、
 * scale(画面の CSS px / ワールド 1 単位)から、点からのずれと書字の向きと不透明度を返す。
 *  { dx, dy, vertical, carried: 運ぶラベルの不透明度, others: 運ばないラベルの不透明度 }
 * 位置: 索引の位置(横長は点の下 INDEX_OFFSET_V、回した真横は点の右 INDEX_OFFSET_H)から、morph 0〜CARRY_FLIP の間に
 * 点の東(右へ 7px)へ。横長は CARRY_FLIP で縦書きから横書きへ移り、そこで不透明度を一度 0.2 まで落とす。
 * 点から CARRY_MAX_DIST 以上離れている間は出さない(索引の位置から点へ寄ってくる途中で現れる)。
 * 運ばないラベルは、morph が 0.15 になるまでに消える。
 */
export function carryPose(morph, orient, scale) {
  const k = smoothstep(0, CARRY_FLIP, morph);
  const from = orient === 'v' ? [0, INDEX_OFFSET_V * scale] : [INDEX_OFFSET_H * scale, 0];
  const to = [7, 0];
  const dx = from[0] + (to[0] - from[0]) * k;
  const dy = from[1] + (to[1] - from[1]) * k;
  const vertical = orient === 'v' && morph < CARRY_FLIP;
  const dip = orient === 'v' ? 0.8 * Math.max(0, 1 - Math.abs(morph - CARRY_FLIP) / 0.1) : 0;
  // 索引の位置(morph 0)では、そのまま索引として見せる。動き出したら、点から離れている間は出さない
  const near = morph <= 0 ? 1 : Math.min(1, Math.max(0, (CARRY_MAX_DIST + 12 - Math.hypot(dx, dy)) / 12));
  return { dx, dy, vertical, carried: (1 - dip) * near, others: 1 - smoothstep(0, 0.15, morph) };
}

// ---------------------------------------------------------------------------------------------
// DOM

const namesOf = (lang) => (lang === 'en' ? PREF_EN : PREF_JA);

export function mount(el, store, ctx) {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  const { renderer } = ctx;
  const cleanups = [];
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  // ラベルはボタンなので、読み上げの対象にする(index.html の aria-hidden を外す)
  el.removeAttribute('aria-hidden');
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-orientation', 'horizontal');
  el.replaceChildren();

  const btn = [];
  for (let i = 0; i < 47; i++) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'label off';
    b.dataset.i = String(i);
    b.tabIndex = -1;
    btn.push(b);
  }
  const groupEl = doc.createElement('div');
  groupEl.className = 'label group sel off';
  groupEl.setAttribute('aria-hidden', 'true');
  const measure = doc.createElement('span');
  measure.className = 'label measure';
  measure.setAttribute('aria-hidden', 'true');
  el.append(...btn, groupEl, measure);

  // 現在の状態
  const px = new Float64Array(47);
  const py = new Float64Array(47);
  const prevPx = new Float64Array(47);
  const prevPy = new Float64Array(47);
  const applied = btn.map(() => ({ cls: '', tf: '' }));
  const groupApplied = { cls: '', tf: '' };
  let roving = 0;
  let mode = ''; // 'index-v' | 'index-h' | 'carry' | 'free'
  const opac = btn.map(() => '');
  let portrait = false;
  let dirty = true;
  let lastPlace = -Infinity;
  let pending = false;
  let sizes = null; // { key, w: Float64Array(47), h: Float64Array(47), gw, gh }
  let fixed = [];
  let fixedAt = -Infinity;
  const prev = new Map();
  const offsets = new Map(); // key → { ox, oy }(基準の点からの左上のずれ)
  const stateKey = { year: null, selection: null, chapter: null };
  let cache = { volume: [], partners: [], mask: new Uint8Array(47) };

  const lang = () => store.get().lang;

  function setTexts() {
    const l = lang();
    const names = namesOf(l);
    for (let i = 0; i < 47; i++) {
      btn[i].textContent = shortName(i, names);
      btn[i].setAttribute('aria-label', t('tooltip.select', l).replace('{pref}', names[i]));
    }
    el.setAttribute('aria-label', t('tooltip.labels', l));
    const sel = store.get().selection;
    groupEl.textContent = sel?.type === 'metro' ? metroName(sel.id, l) : '';
    sizes = null;
  }

  function measureSizes() {
    const l = lang();
    const key = `${l}|${portrait ? 'p' : 'd'}`;
    if (sizes && sizes.key === key) return sizes;
    const names = namesOf(l);
    const w = new Float64Array(47);
    const h = new Float64Array(47);
    measure.className = 'label measure';
    for (let i = 0; i < 47; i++) {
      measure.textContent = shortName(i, names);
      w[i] = measure.offsetWidth;
      h[i] = measure.offsetHeight;
    }
    measure.className = 'label group measure';
    measure.textContent = groupEl.textContent || metroName('tokyo', l);
    sizes = { key, w, h, gw: measure.offsetWidth, gh: measure.offsetHeight };
    return sizes;
  }

  function refreshCache() {
    const s = store.get();
    if (stateKey.year !== s.year) {
      cache.volume = volumeOrder(ctx.data.matrix(s.year));
    }
    if (stateKey.year !== s.year || stateKey.selection !== s.selection) {
      cache.mask = selectionMask(s.selection);
      cache.partners = s.selection ? partnerTotals(ctx.data.matrix(s.year), cache.mask) : [];
    }
    stateKey.year = s.year;
    stateKey.selection = s.selection;
    stateKey.chapter = s.chapter;
  }

  function featuredOf(s) {
    const ch = CHAPTERS[s.chapter];
    return Array.isArray(ch?.labels) ? ch.labels.map((c) => c - 1) : [];
  }

  function setClass(i, cls) {
    const a = applied[i];
    if (a.cls !== cls) {
      btn[i].className = cls;
      a.cls = cls;
    }
  }
  function setTransform(i, tf) {
    const a = applied[i];
    if (a.tf !== tf) {
      btn[i].style.transform = tf;
      a.tf = tf;
    }
  }

  function project() {
    let moved = false;
    for (let i = 0; i < 47; i++) {
      const p = renderer.project(i);
      px[i] = p[0];
      py[i] = p[1];
      if (Math.abs(px[i] - prevPx[i]) > 0.05 || Math.abs(py[i] - prevPy[i]) > 0.05) moved = true;
      prevPx[i] = px[i];
      prevPy[i] = py[i];
    }
    return moved;
  }

  // 変形の 2 段目(morph は 1 で、カメラが起きている間)も、運ぶラベルのまま点に付けておく
  let morphLowAt = -Infinity;
  function currentMode(moved, now) {
    const rs = renderer.getState();
    const view = rs.view ?? {};
    const indexMode = rs.morph < INDEX_MORPH_MAX && Math.abs(view.elevation ?? 0) < INDEX_ELEVATION_MAX;
    if (rs.morph < CARRY_MORPH_MAX) morphLowAt = now;
    if (indexMode) return Math.abs(Math.sin(view.roll ?? 0)) > 0.5 ? 'index-h' : 'index-v';
    if (rs.morph < CARRY_MORPH_MAX) return 'carry';
    return mode === 'carry' && moved && now - morphLowAt < CARRY_GRACE_MS ? 'carry' : 'free';
  }
  function setOpacity(i, v) {
    const o = v >= 0.999 ? '' : v.toFixed(2);
    if (opac[i] !== o) {
      btn[i].style.opacity = o;
      opac[i] = o;
    }
  }

  // 変形の途中: 運ぶラベルを点に付けたまま索引の位置から点の東へ運び、ほかのラベルは消す
  function applyCarry(s, hoverI) {
    const rs = renderer.getState();
    const view = rs.view ?? {};
    const scale = (view.zoom ?? 0) * win.innerHeight || 1;
    const pose = carryPose(rs.morph, Math.abs(Math.sin(view.roll ?? 0)) > 0.5 ? 'h' : 'v', scale);
    // 運ぶラベル: 選択中・ホバー中を先に、続いて CARRIED の順。横書きのときは、すでに置いた札と重なるものを出さない
    const order = [];
    if (hoverI != null) order.push(hoverI);
    cache.mask.forEach((m, i) => m && order.push(i));
    order.push(...CARRIED);
    const carried = new Set();
    const sz = pose.vertical ? null : measureSizes();
    const rects = [];
    for (const i of order) {
      if (carried.has(i)) continue;
      if (sz) {
        const r = { left: px[i] + pose.dx, top: py[i] + pose.dy - sz.h[i] / 2, right: px[i] + pose.dx + sz.w[i] + 6, bottom: py[i] + pose.dy + sz.h[i] / 2 + 3 }; // 札の余白(左右 3px、上下 1・2px)
        if (rects.some((q) => rectsOverlap(r, q, GAP_LABEL))) continue;
        rects.push(r);
      }
      carried.add(i);
    }
    for (let i = 0; i < 47; i++) {
      const keep = carried.has(i);
      const a = keep ? pose.carried : pose.others;
      const tone = cache.mask[i] ? 'sel' : hoverI === i ? 'em' : '';
      setClass(i, ['label', a < 0.01 && 'off', tone, pose.vertical ? 'v' : 'h'].filter(Boolean).join(' '));
      setOpacity(i, a);
      const x = px[i] + pose.dx;
      const y = py[i] + pose.dy;
      setTransform(i, pose.vertical ? `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateX(-50%)` : `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`);
    }
    if (groupApplied.cls !== 'label group sel off') {
      groupEl.className = 'label group sel off';
      groupApplied.cls = 'label group sel off';
    }
  }

  function applyIndex(s, hoverI) {
    const scale = Math.hypot(px[46] - px[0], py[46] - py[0]) / (46 * STEP) || 1;
    const orient = mode === 'index-h' ? 'h' : 'v';
    const pos = indexLayout(px, py, scale, orient);
    const featured = new Set(featuredOf(s));
    const protect = new Set(featured);
    if (hoverI != null) protect.add(hoverI);
    cache.mask.forEach((m, i) => m && protect.add(i));
    const height = win.innerHeight;
    // 横長の縦書きの索引は、列の間隔が狭いと横につながって読めるので、10px にして 1 つおきに出す
    const dense = orient === 'v' && indexDense(STEP * scale, lang());
    if (el.classList.contains('dense') !== dense) {
      el.classList.toggle('dense', dense);
      sizes = null;
    }
    for (let i = 0; i < 47; i++) {
      setOpacity(i, 1);
      const show = indexVisible(i, { portrait: orient === 'h' && portrait, height, protect, dense });
      const tone = cache.mask[i] ? 'sel' : hoverI === i || featured.has(i) ? 'em' : '';
      setClass(i, ['label', !show && 'off', tone].filter(Boolean).join(' '));
      const p = pos[i];
      setTransform(i, orient === 'v' ? `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translateX(-50%)` : `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translateY(-50%)`);
    }
    if (groupApplied.cls !== 'label group sel off') {
      groupEl.className = 'label group sel off';
      groupApplied.cls = 'label group sel off';
    }
  }

  function place(s, hoverI, now) {
    const sz = measureSizes();
    if (now - fixedAt > 250) {
      fixed = collectFixedRects(doc);
      fixedAt = now;
    }
    const order = labelOrder({
      hover: hoverI,
      selection: s.selection,
      partners: cache.partners,
      featured: featuredOf(s),
      volume: cache.volume,
      max: portrait ? NATIONWIDE_MAX_PORTRAIT : NATIONWIDE_MAX,
    });
    // 選択中の地域の点(覆わない)と、圏の重心
    const selPts = [];
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (let i = 0; i < 47; i++) {
      if (!cache.mask[i]) continue;
      selPts.push({ x: px[i], y: py[i], key: `p${i}` });
      cx += px[i];
      cy += py[i];
      n++;
    }
    if (n) {
      cx /= n;
      cy /= n;
    }
    const items = order.map((o) =>
      o.group
        ? { ...o, x: cx, y: cy, w: sz.gw, h: sz.gh }
        : { ...o, x: px[o.i], y: py[o.i], w: sz.w[o.i], h: sz.h[o.i] },
    );
    // 圏の名前(key 'g')は、構成県の点のどれも覆わない
    const res = placeLabels({
      items,
      bounds: { width: win.innerWidth, height: win.innerHeight },
      fixed,
      points: selPts,
      prev,
    });
    prev.clear();
    offsets.clear();
    const shown = new Map();
    items.forEach((it, k) => {
      const r = res[k];
      if (!r) return;
      prev.set(it.key, r.cand);
      offsets.set(it.key, { ox: r.left - it.x, oy: r.top - it.y });
      shown.set(it.key, it);
    });
    for (let i = 0; i < 47; i++) {
      const it = shown.get(`p${i}`);
      setClass(i, it ? ['label', it.cls].filter(Boolean).join(' ') : 'label off');
      setOpacity(i, 1);
    }
    const g = shown.get('g');
    const gcls = g ? 'label group sel' : 'label group sel off';
    if (groupApplied.cls !== gcls) {
      groupEl.className = gcls;
      groupApplied.cls = gcls;
    }
  }

  function applyFree() {
    for (let i = 0; i < 47; i++) {
      const o = offsets.get(`p${i}`);
      if (o) setTransform(i, `translate(${(px[i] + o.ox).toFixed(1)}px, ${(py[i] + o.oy).toFixed(1)}px)`);
    }
    const g = offsets.get('g');
    if (g) {
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (let i = 0; i < 47; i++) {
        if (cache.mask[i]) {
          cx += px[i];
          cy += py[i];
          n++;
        }
      }
      if (n) {
        const tf = `translate(${(cx / n + g.ox).toFixed(1)}px, ${(cy / n + g.oy).toFixed(1)}px)`;
        if (groupApplied.tf !== tf) {
          groupEl.style.transform = tf;
          groupApplied.tf = tf;
        }
      }
    }
  }

  function frame() {
    const s = store.get();
    const now = performance.now();
    const widthPortrait = isPortrait(win.innerWidth); // CSS とカメラ(scene/camera.js)と同じ判定
    if (widthPortrait !== portrait) {
      portrait = widthPortrait;
      el.classList.toggle('portrait', portrait);
      sizes = null;
      dirty = true;
    }
    const moved = project();
    const m = currentMode(moved, now);
    if (m !== mode) {
      mode = m;
      el.classList.toggle('index-v', m === 'index-v');
      el.classList.toggle('index-h', m === 'index-h');
      el.classList.toggle('carry', m === 'carry');
      el.classList.toggle('free', m === 'free');
      if (m !== 'index-v') el.classList.remove('dense');
      dirty = true;
      sizes = null;
    }
    refreshCache();
    const hoverI = s.hover?.type === 'pref' ? s.hover.code - 1 : null;
    if (mode === 'carry') {
      if (dirty || moved) applyCarry(s, hoverI);
      dirty = false;
      pending = false;
      return;
    }
    if (mode !== 'free') {
      if (dirty || moved) {
        applyIndex(s, hoverI);
        dirty = false;
        pending = false;
      }
      return;
    }
    // 斜め俯瞰・真上: カメラが動いている間は、配置の計算を 100ms に 1 回までにする
    if (dirty) pending = true;
    if (moved) pending = true;
    if (pending && (!moved || now - lastPlace >= THROTTLE_MS)) {
      place(s, hoverI, now);
      lastPlace = now;
      pending = false;
      dirty = false;
      applyFree();
    } else if (moved) {
      applyFree();
    }
  }

  // 操作
  for (let i = 0; i < 47; i++) {
    const b = btn[i];
    b.addEventListener('click', () => store.set({ selection: { type: 'pref', code: i + 1 } }));
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') store.set({ hover: { type: 'pref', code: i + 1 } });
    });
    b.addEventListener('pointerleave', (e) => {
      const h = store.get().hover;
      if (e.pointerType !== 'touch' && h?.type === 'pref' && h.code === i + 1) store.set({ hover: null });
    });
    b.addEventListener('focus', () => {
      setRoving(i);
      // キーボードのフォーカスのときだけ、ツールチップを出す(マウスは pointerenter、タップは選択で足りる)
      if (!b.matches(':focus-visible')) return;
      store.set({ hover: { type: 'pref', code: i + 1 } });
      b.setAttribute('aria-describedby', 'tooltip');
    });
    b.addEventListener('blur', () => {
      b.removeAttribute('aria-describedby');
      const h = store.get().hover;
      if (h?.type === 'pref' && h.code === i + 1) store.set({ hover: null });
    });
  }
  function setRoving(i) {
    btn[roving].tabIndex = -1;
    roving = i;
    btn[roving].tabIndex = 0;
  }
  listen(el, 'keydown', (e) => {
    const cur = btn.indexOf(doc.activeElement);
    if (cur < 0) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(46, cur + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, cur - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 46;
    if (next == null) return;
    e.preventDefault();
    btn[next].focus();
  });

  function syncPressed() {
    const mask = selectionMask(store.get().selection);
    for (let i = 0; i < 47; i++) btn[i].setAttribute('aria-pressed', mask[i] ? 'true' : 'false');
  }

  setTexts();
  syncPressed();
  btn[roving].tabIndex = 0;
  const off = store.subscribe((s, changed) => {
    if (changed.includes('lang') || changed.includes('selection')) setTexts();
    if (changed.includes('selection')) syncPressed();
    dirty = true;
  });
  cleanups.push(off);
  listen(win, 'resize', () => {
    dirty = true;
    sizes = null;
    fixedAt = -Infinity;
  });
  doc.fonts?.ready?.then(() => {
    sizes = null;
    dirty = true;
  });
  cleanups.push(ctx.onFrame(frame));

  return {
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}
