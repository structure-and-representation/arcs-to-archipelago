// カメラの定位置・言語・テーマ・数値の表を開くボタン。要素: #controls。
// 読む・書く state: camera、theme、lang。デザイン仕様 5.1(上の帯の右側)、5.7 節。
//   - カメラ: 「真横」「斜め」「真上」の3つのボタン(線画の小さな図つき)。role="group"、aria-pressed、roving tabindex(Tab は1回だけ止まり、←→ で移動)。
//   - 言語(日本語 / EN)とテーマ(紙 / 墨): 2つのボタンの group。縦画面(幅 1024px 未満)では、選ばれていないほうだけを出す(押すと切り替わる)。
//   - 数値の表: #table を開く。#table が <dialog> なら showModal()、<details> なら open を切り替える。
//     先に #table へ bubbling の CustomEvent('table:open', { detail: { opener } }) を送るので、表の部品が自分で開く場合は
//     preventDefault() すればよい(開いたボタンへフォーカスを戻すために opener を渡す)。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
import { CAMERA_NAMES } from '../geometry/constants.js';
import { t } from '../i18n.js';

// カメラの線画。デザインのモック(docs/design/mock/mock.html の ICON)と同じ
const ICON = {
  side: '<svg viewBox="0 0 28 16" aria-hidden="true" focusable="false"><path d="M1 8H27"/><path d="M4 8C9 1 19 1 24 8"/><path d="M4 8C9 15 19 15 24 8" stroke-dasharray="1.5 1.5"/></svg>',
  oblique: '<svg viewBox="0 0 28 16" aria-hidden="true" focusable="false"><path d="M1 14L7 9H27L21 14Z"/><path d="M6 12C10 2 17 2 21 11"/></svg>',
  top: '<svg viewBox="0 0 28 16" aria-hidden="true" focusable="false"><rect x="4.5" y="1.5" width="19" height="13"/><path d="M19 4L15 7L11 9.5L8 12" stroke-dasharray="1.2 1.6"/></svg>',
};

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  node.append(...children);
  return node;
}

export function mount(el, store, ctx) {
  // 子の group を並べるだけの入れ物。骨格の index.html は role="toolbar" を付けているが、中は group の集まりなので外す
  el.removeAttribute('role');

  // ---- 上の帯の右側: 数値の表、言語、テーマ ----
  const tableBtn = h('button', { type: 'button', class: 'ctl-table', 'aria-haspopup': 'dialog', 'data-open-table': '' });
  const tableLong = h('span', { class: 'ctl-long' });
  const tableShort = h('span', { class: 'ctl-short', 'aria-hidden': 'true' });
  tableBtn.append(tableLong, tableShort);

  const toggle = (name, options) => {
    const buttons = options.map(([value]) => h('button', { type: 'button', class: 'ctl-tbtn', 'data-value': value }));
    const group = h('div', { class: `ctl-toggle ctl-${name}`, role: 'group' });
    buttons.forEach((b, i) => {
      if (i) group.append(h('span', { class: 'ctl-sep', 'aria-hidden': 'true' }, '/'));
      group.append(b);
    });
    return { group, buttons };
  };
  const langT = toggle('lang', [['ja'], ['en']]);
  const themeT = toggle('theme', [['paper'], ['ink']]);
  const tools = h('div', { class: 'ctl-tools' }, tableBtn, langT.group, themeT.group);

  // ---- 右下: カメラの定位置 ----
  const camButtons = CAMERA_NAMES.map((name) => {
    const b = h('button', { type: 'button', class: 'ctl-cam', 'data-camera': name });
    b.insertAdjacentHTML('beforeend', ICON[name]);
    b.append(h('span', { class: 'ctl-lbl' }));
    return b;
  });
  const camGroup = h('div', { class: 'ctl-camera', role: 'group' }, ...camButtons);

  el.replaceChildren(tools, camGroup);

  // ---- 描画 ----
  const lang = () => store.get().lang;

  function renderLabels() {
    const L = lang();
    tableLong.textContent = t('settings.table', L);
    tableShort.textContent = t('settings.tableShort', L);
    tableBtn.setAttribute('aria-label', t('settings.table', L));
    langT.group.setAttribute('aria-label', t('settings.lang', L));
    themeT.group.setAttribute('aria-label', t('settings.theme', L));
    const [ja, en] = langT.buttons;
    ja.textContent = t('settings.lang.ja', L);
    ja.setAttribute('aria-label', t('settings.lang.ja', L));
    en.textContent = t('settings.lang.enShort', L);
    en.setAttribute('aria-label', t('settings.lang.en', L));
    const [paper, ink] = themeT.buttons;
    paper.textContent = t('settings.theme.paper', L);
    paper.setAttribute('aria-label', `${t('settings.theme.paper', L)} (${t('settings.theme.light', L)})`);
    ink.textContent = t('settings.theme.ink', L);
    ink.setAttribute('aria-label', `${t('settings.theme.ink', L)} (${t('settings.theme.dark', L)})`);
    camGroup.setAttribute('aria-label', t('camera.heading', L));
    for (const b of camButtons) b.querySelector('.ctl-lbl').textContent = t(`camera.${b.dataset.camera}`, L);
  }

  function renderState() {
    const s = store.get();
    for (const b of langT.buttons) b.setAttribute('aria-pressed', String(b.dataset.value === s.lang));
    for (const b of themeT.buttons) b.setAttribute('aria-pressed', String(b.dataset.value === s.theme));
    const current = camButtons.find((b) => b.dataset.camera === s.camera) ?? camButtons[0];
    for (const b of camButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.camera === s.camera));
      b.tabIndex = b === current ? 0 : -1;
    }
  }

  // ---- 操作 ----
  // 縦画面では、押したボタン(選ばれた側)が隠れて反対側が現れる。フォーカスを現れたほうへ移して、キーボードで迷子にならないようにする
  const keepFocus = (b, group) => {
    if (document.activeElement !== b && document.activeElement !== document.body) return;
    if (getComputedStyle(b).display !== 'none') return;
    group.querySelector('button:not([aria-pressed="true"])')?.focus();
  };
  const onLang = (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    store.set({ lang: b.dataset.value });
    keepFocus(b, langT.group);
  };
  const onTheme = (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    store.set({ theme: b.dataset.value });
    keepFocus(b, themeT.group);
  };
  const onCamera = (e) => {
    const b = e.target.closest('button[data-camera]');
    if (b) store.set({ camera: b.dataset.camera });
  };
  const onCameraKey = (e) => {
    const i = camButtons.indexOf(document.activeElement);
    if (i < 0) return;
    const n = camButtons.length;
    let next;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else return;
    e.preventDefault();
    for (const b of camButtons) b.tabIndex = b === camButtons[next] ? 0 : -1;
    camButtons[next].focus();
  };
  const onFocusOut = (e) => {
    // グループの外へフォーカスが出たら、Tab で戻ってくる先を現在のカメラに戻す
    if (!camGroup.contains(e.relatedTarget)) renderState();
  };
  const onTable = () => {
    const target = document.getElementById('table');
    if (!target) return;
    const ev = new CustomEvent('table:open', { bubbles: true, cancelable: true, detail: { opener: tableBtn } });
    if (!target.dispatchEvent(ev)) return; // 表の部品が自分で開いた
    if (typeof target.showModal === 'function') {
      if (!target.open) target.showModal();
    } else if ('open' in target) {
      target.open = !target.open;
    }
  };

  langT.group.addEventListener('click', onLang);
  themeT.group.addEventListener('click', onTheme);
  camGroup.addEventListener('click', onCamera);
  camGroup.addEventListener('keydown', onCameraKey);
  camGroup.addEventListener('focusout', onFocusOut);
  tableBtn.addEventListener('click', onTable);

  const root = document.documentElement;
  const off = store.subscribe((s, changed) => {
    if (changed.includes('lang')) {
      root.lang = s.lang;
      renderLabels();
    }
    if (changed.includes('theme')) root.dataset.theme = s.theme;
    renderState();
  });

  root.lang = store.get().lang;
  root.dataset.theme = store.get().theme;
  renderLabels();
  renderState();

  return {
    dispose() {
      off();
      el.replaceChildren();
    },
  };
}
