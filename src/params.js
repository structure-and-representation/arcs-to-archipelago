// URL の引数と state の相互変換。
//   ?year=2014&ch=0&sel=13 (都道府県コード) | sel=tokyo (圏)
//   &cam=side|oblique|top &morph=0〜1 &theme=paper|ink &lang=ja|en &still=1
// still=1 は時間と乱数を固定して、撮影の結果を再現できるようにする(state には入れない)。
import { DEFAULT_STATE } from './state.js';
import { CAMERA_PRESETS, YEAR_MIN, YEAR_MAX, isCameraName, isMetroId } from './geometry/constants.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function parseSelection(v) {
  if (v == null || v === '') return undefined;
  if (isMetroId(v)) return { type: 'metro', id: v };
  if (/^\d+$/.test(v)) {
    const code = Number(v);
    if (code >= 1 && code <= 47) return { type: 'pref', code };
  }
  return undefined;
}

function selectionToParam(sel) {
  if (!sel) return null;
  return sel.type === 'metro' ? sel.id : String(sel.code);
}

/**
 * 検索文字列(`?` の有無は問わない)から、state に重ねる patch と still を取り出す。
 * 不正な値は無視する。cam だけが指定されたときの morph は、その定位置の値にする。
 */
export function parseParams(search = '') {
  const q = new URLSearchParams(search);
  const patch = {};
  let still = false;

  if (q.has('year') && /^\d{4}$/.test(q.get('year'))) {
    const y = Number(q.get('year'));
    if (y >= YEAR_MIN && y <= YEAR_MAX) patch.year = y;
  }
  if (q.has('ch') && /^\d+$/.test(q.get('ch'))) {
    const c = Number(q.get('ch'));
    if (c >= 0 && c <= 4) patch.chapter = c;
  }
  if (q.has('sel')) {
    const sel = parseSelection(q.get('sel'));
    if (sel) patch.selection = sel;
  }
  if (q.has('cam') && isCameraName(q.get('cam'))) {
    patch.camera = q.get('cam');
    patch.morph = CAMERA_PRESETS[patch.camera].morph;
  }
  if (q.has('morph') && q.get('morph') !== '' && Number.isFinite(Number(q.get('morph')))) {
    patch.morph = clamp(Number(q.get('morph')), 0, 1);
  }
  if (q.get('theme') === 'paper' || q.get('theme') === 'ink') patch.theme = q.get('theme');
  if (q.get('lang') === 'ja' || q.get('lang') === 'en') patch.lang = q.get('lang');
  if (q.get('still') === '1') still = true;
  return { patch, still };
}

/**
 * state から検索文字列(先頭に `?` は付けない)を作る。既定値と同じものは省く。
 * parseParams(toSearch(state)) を既定の state に重ねると、同じ値に戻る。
 */
export function toSearch(state, { still = false } = {}) {
  const q = new URLSearchParams();
  const d = DEFAULT_STATE;
  if (state.year !== d.year) q.set('year', String(state.year));
  if (state.chapter !== d.chapter) q.set('ch', String(state.chapter));
  const sel = selectionToParam(state.selection);
  if (sel) q.set('sel', sel);
  if (state.camera !== d.camera) q.set('cam', state.camera);
  // morph は、定位置の値と違うときだけ書く
  const presetMorph = isCameraName(state.camera) ? CAMERA_PRESETS[state.camera].morph : 0;
  const explicitMorph = state.camera === d.camera ? state.morph !== d.morph : state.morph !== presetMorph;
  if (explicitMorph) q.set('morph', String(Math.round(state.morph * 1000) / 1000));
  if (state.theme !== d.theme) q.set('theme', state.theme);
  if (state.lang !== d.lang) q.set('lang', state.lang);
  if (still) q.set('still', '1');
  return q.toString();
}

/** location.search を読んで store に反映し、still を返す。 */
export function applyParams(store, search) {
  const { patch, still } = parseParams(search);
  store.set(patch);
  return still;
}

/**
 * state の変化を history.replaceState で URL に反映する。
 * morph などがアニメーションで毎フレーム変わるので、変化が 250ms 止まってから書く。
 */
export function syncUrl(store, { still = false, win = globalThis.window } = {}) {
  if (!win?.history) return () => {};
  let timer = null;
  const write = () => {
    timer = null;
    const s = toSearch(store.get(), { still });
    const url = win.location.pathname + (s ? `?${s}` : '') + win.location.hash;
    win.history.replaceState(null, '', url);
  };
  const off = store.subscribe((_, changed) => {
    if (changed.length === 1 && changed[0] === 'hover') return;
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(write, 250);
  });
  return () => {
    off();
    if (timer != null) clearTimeout(timer);
  };
}
