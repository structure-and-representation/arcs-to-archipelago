// 配線だけを行う: データを読み込み、store を作り、URL の引数を反映し、描画器と各 UI 部品をつなぐ。
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui-labels.css';
import './styles/ui-chapters.css';
import './styles/ui-legend.css';
import './styles/ui-timeline.css';
import './styles/ui-selector.css';
import './styles/ui-controls.css';
import './styles/ui-tooltip.css';
import './styles/ui-table.css';
import { loadData } from './data/loader.js';
import { createStore } from './state.js';
import { applyParams, syncUrl } from './params.js';
import { applyStatic, setLang, t } from './i18n.js';
import { selectionMask } from './geometry/flows.js';
import { createRenderer } from './scene/renderer.js';
import { createCameraRig } from './scene/cameraRig.js';
import { createFallback } from './scene/fallback2d.js';
import { createPicker } from './scene/picking.js';
import { createYearTween, YEAR_SECONDS } from './scene/yearTween.js';
import * as labels from './ui/labels.js';
import * as timeline from './ui/timeline.js';
import * as selector from './ui/selector.js';
import * as tooltip from './ui/tooltip.js';
import * as table from './ui/table.js';
import * as chapters from './ui/chapters.js';
import * as controls from './ui/controls.js';
import * as legend from './ui/legend.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

function showMessage(text) {
  const el = $('message');
  el.textContent = text;
  el.hidden = false;
}

async function main() {
  const search = location.search;
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

  const store = createStore({
    theme: prefersDark ? 'ink' : 'paper',
    lang: navigator.language?.startsWith('en') ? 'en' : 'ja',
    reducedMotion: motionQuery.matches,
  });
  const still = applyParams(store, search);
  const cleanups = []; // dispose で外す登録(イベント、購読)
  const listen = (target, type, fn, opts) => {
    target.addEventListener?.(type, fn, opts);
    cleanups.push(() => target.removeEventListener?.(type, fn, opts));
  };
  listen(motionQuery, 'change', (e) => store.set({ reducedMotion: e.matches }));

  // 言語とテーマは描画より先に反映する(ちらつきを避ける)
  const applyLangTheme = () => {
    const s = store.get();
    setLang(s.lang);
    root.dataset.theme = s.theme;
    applyStatic(document);
  };
  applyLangTheme();

  let data;
  try {
    data = await loadData();
  } catch (err) {
    console.error(err);
    showMessage(t('app.loadError'));
    root.dataset.error = 'data';
    return;
  }
  // データが読めたら、データがある年に収める
  if (!data.years.includes(store.get().year)) store.set({ year: data.years[data.years.length - 1] });

  const canvas = $('stage');
  let renderer;
  try {
    renderer = createRenderer(canvas, data);
  } catch (err) {
    // WebGL2 が使えない環境では、Canvas 2D の代替表示(scene/fallback2d.js)に切り替える
    console.warn(err);
    renderer = createFallback(canvas, data);
    root.dataset.fallback = '2d';
  }

  renderer.setStill(still);
  const picker = createPicker(data);
  const rig = createCameraRig({ store, renderer, immediate: still });
  // 年の補間(--dur-year)。動きを減らす設定と still=1 では即時
  const yearSeconds = () => {
    const v = parseFloat(getComputedStyle(root).getPropertyValue('--dur-year'));
    return Number.isFinite(v) ? v / 1000 : YEAR_SECONDS;
  };
  const years = createYearTween({ renderer, year: store.get().year, duration: yearSeconds() });

  // 毎フレーム呼ばれる関数の登録(ラベルなどが使う)
  const frameFns = new Set();
  const onFrame = (fn) => {
    frameFns.add(fn);
    return () => frameFns.delete(fn);
  };

  // state → 描画器
  const sync = (s, changed) => {
    const all = changed == null;
    const has = (k) => all || changed.includes(k);
    if (has('lang') || has('theme')) applyLangTheme();
    if (has('theme')) renderer.setTheme(s.theme);
    if (has('morph')) renderer.setMorph(s.morph);
    if (has('year')) years.set(s.year, { immediate: all || still || s.reducedMotion });
    if (has('selection')) renderer.setSelection(selectionMask(s.selection));
    if (has('hover')) renderer.setHover(s.hover?.type === 'arc' ? { o: s.hover.o, d: s.hover.d } : null);
    if (has('reducedMotion')) renderer.setReducedMotion(s.reducedMotion);
  };
  sync(store.get(), null);
  cleanups.push(store.subscribe(sync));
  cleanups.push(syncUrl(store, { still }));

  // UI 部品
  const ctx = { data, renderer, picker, onFrame };
  const mounts = [
    [labels, 'labels'],
    [timeline, 'timeline'],
    [selector, 'selector'],
    [tooltip, 'tooltip'],
    [table, 'table'],
    [chapters, 'chapters'],
    [controls, 'controls'],
    [legend, 'legend'],
  ].map(([mod, id]) => mod.mount($(id), store, ctx));

  // 画面の大きさ
  const resize = () => {
    renderer.resize();
    rig.resize();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // 当たり判定とホバー・クリックでの選択
  let pickKey = '';
  const rebuildPicker = () => {
    const s = store.get();
    const rs = renderer.getState();
    const screen = renderer.screenMatrix();
    const key = [s.year, s.selection ? JSON.stringify(s.selection) : '', rs.morph, rs.lean, ...screen].join('|');
    if (key === pickKey) return;
    pickKey = key;
    picker.rebuild({
      matrix: data.matrix(s.year),
      mask: rs.mask,
      selection: s.selection,
      morph: rs.morph,
      lean: rs.lean,
      screen,
    });
  };
  const localPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  listen(canvas, 'pointermove', (e) => {
    rebuildPicker();
    const [x, y] = localPoint(e);
    const i = picker.pickNode(x, y);
    const arc = i == null ? picker.pickArc(x, y) : null;
    store.set({ hover: i != null ? { type: 'pref', code: i + 1 } : arc ? { type: 'arc', o: arc.o, d: arc.d } : null });
  });
  listen(canvas, 'pointerleave', () => store.set({ hover: null }));
  listen(canvas, 'click', (e) => {
    rebuildPicker();
    const [x, y] = localPoint(e);
    const i = picker.pickNode(x, y);
    if (i != null) store.set({ selection: { type: 'pref', code: i + 1 } });
  });

  // 描画ループ。1 フレームの中で例外が出ても、次のフレームの予約は失わない(先に予約する)。
  // 描画器と UI 部品の毎フレームの処理は、それぞれ例外を受け止める(同じ例外は 1 回だけ記録する)。
  const reported = new Set();
  const guard = (name, fn) => {
    try {
      fn();
    } catch (err) {
      const key = `${name}:${err?.message}`;
      if (!reported.has(key)) {
        reported.add(key);
        console.error(`[frame:${name}]`, err);
      }
    }
  };
  let last = performance.now();
  const t0 = last;
  let first = true;
  let raf = 0;
  let running = true;
  const frame = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const time = still ? 0 : (now - t0) / 1000;
    guard('camera', () => rig.update(dt));
    guard('year', () => years.update(dt));
    guard('picker', rebuildPicker);
    guard('render', () => renderer.render(time));
    for (const fn of frameFns) guard(fn.name || 'ui', () => fn(time));
    if (first) {
      first = false;
      root.dataset.ready = '1';
    }
  };
  raf = requestAnimationFrame(frame);

  // 撮影・デバッグ用の取っ手
  window.__app = { store, renderer, data, picker, rig, years, dispose() {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    cleanups.splice(0).forEach((off) => off());
    mounts.forEach((m) => m.dispose());
    frameFns.clear();
    rig.dispose();
    years.dispose();
    renderer.dispose();
  } };
}

main().catch((err) => {
  console.error(err);
  root.dataset.error = 'fatal';
});
