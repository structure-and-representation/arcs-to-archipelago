// 配線だけを行う: データを読み込み、store を作り、URL の引数を反映し、描画器と各 UI 部品をつなぐ。
import { loadData } from './data/loader.js';
import { createStore } from './state.js';
import { applyParams, syncUrl } from './params.js';
import { applyStatic, setLang, t } from './i18n.js';
import { selectionMask } from './geometry/flows.js';
import { createRenderer } from './scene/renderer.js';
import { createCameraRig } from './scene/camera.js';
import { createPicker } from './scene/picking.js';
import * as labels from './ui/labels.js';
import * as timeline from './ui/timeline.js';
import * as selector from './ui/selector.js';
import * as tooltip from './ui/tooltip.js';
import * as table from './ui/table.js';
import * as chapters from './ui/chapters.js';
import * as controls from './ui/controls.js';

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
  motionQuery.addEventListener?.('change', (e) => store.set({ reducedMotion: e.matches }));

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
    // TODO: WebGL2 が使えない環境では、Canvas 2D で真横の図と静止した点描を描く(設計 §8)
    console.error(err);
    showMessage(t('app.noWebgl'));
    root.dataset.error = 'webgl';
    return;
  }

  const picker = createPicker(data);
  const rig = createCameraRig({ store, renderer, immediate: still });

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
    if (has('year')) renderer.setYear(s.year, s.year, 0);
    if (has('selection')) renderer.setSelection(selectionMask(s.selection));
    if (has('hover')) renderer.setHover(s.hover?.type === 'arc' ? { o: s.hover.o, d: s.hover.d } : null);
    if (has('reducedMotion')) renderer.setReducedMotion(s.reducedMotion);
  };
  sync(store.get(), null);
  store.subscribe(sync);
  const stopUrl = syncUrl(store, { still });

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
  canvas.addEventListener('pointermove', (e) => {
    rebuildPicker();
    const [x, y] = localPoint(e);
    const i = picker.pickNode(x, y);
    const arc = i == null ? picker.pickArc(x, y) : null;
    store.set({ hover: i != null ? { type: 'pref', code: i + 1 } : arc ? { type: 'arc', o: arc.o, d: arc.d } : null });
  });
  canvas.addEventListener('pointerleave', () => store.set({ hover: null }));
  canvas.addEventListener('click', (e) => {
    rebuildPicker();
    const [x, y] = localPoint(e);
    const i = picker.pickNode(x, y);
    if (i != null) store.set({ selection: { type: 'pref', code: i + 1 } });
  });

  // 描画ループ
  let last = performance.now();
  const t0 = last;
  let first = true;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    rig.update(dt);
    const time = still ? 0 : (now - t0) / 1000;
    rebuildPicker();
    renderer.render(time);
    for (const fn of frameFns) fn(time);
    if (first) {
      first = false;
      root.dataset.ready = '1';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // 撮影・デバッグ用の取っ手
  window.__app = { store, renderer, data, picker, dispose() {
    ro.disconnect();
    stopUrl();
    mounts.forEach((m) => m.dispose());
    rig.dispose();
    renderer.dispose();
  } };
}

main().catch((err) => {
  console.error(err);
  root.dataset.error = 'fatal';
});
