// 地域の選択と読み出し。要素: #selector。読む・書く state: selection(null | { type: 'pref', code } | { type: 'metro', id })。
// 読む state: year、lang。デザイン仕様 5.4 節。
//   - 読み出し: 全国のときはその年の移動者総数。地域を選んでいるときは、地域の名前(朱)と転入・転出・差引(「差引 転入超過」「差引 転出超過」)、「全国に戻る」。
//     縦画面(幅 1024px 未満)のドックでは、同じ内容を1行の要約(「転入 46.9万 転出 35.9万 差引 +10.9万」)にする。
//   - 見出しのボタンを押すと、選択の一覧(全国、三大都市圏、7地方ごとの都道府県)がポップオーバーで開く。
//     先頭の入力欄で絞り込み(名前、読み、英語名の前方一致)。フォーカスは入力欄に置いたまま、↑↓ ←→ Home End で項目を移動する。
//   - Esc(一覧が閉じているとき)で選択を解除する。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
// 数の集計と書式は data/stats.js、圏の構成は geometry/constants.js の METRO_CODES。
import { METRO_CODES } from '../geometry/constants.js';
import { fill, formatCount, formatShort, formatSigned, regionFlows, yearTotal } from '../data/stats.js';
import { PREF_EN, PREF_JA, metroName, prefName, t } from '../i18n.js';
import { ALL_YOMI, METRO_YOMI, PREF_YOMI } from '../i18n/selector.js';

// 7地方の分け方(JIS コード)。docs/copy/strings.md
const BLOCKS = [
  ['hokkaido', 1, 1],
  ['tohoku', 2, 7],
  ['kanto', 8, 14],
  ['chubu', 15, 23],
  ['kinki', 24, 30],
  ['chugokuShikoku', 31, 39],
  ['kyushuOkinawa', 40, 47],
];
const METRO_IDS = ['tokyo', 'nagoya', 'osaka'];
const LIVE_DELAY = 500; // ms。年を連続で変えたときに読み上げが溢れないよう、落ち着いてから反映する

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

const CHEVRON = '<svg class="sel-chev" viewBox="0 0 8 8" aria-hidden="true" focusable="false"><path d="M1 2.5L4 5.5L7 2.5"/></svg>';

/** 「東京都」→「東京」、「京都府」→「京都」、「神奈川県」→「神奈川」。北海道はそのまま。 */
export function shortPrefName(i, lang) {
  const name = prefName(i, lang);
  return lang === 'ja' ? name.replace(/[都府県]$/, '') : name;
}

/** 絞り込みの比較用。全角半角を揃え、小文字にし、カタカナをひらがなにする。 */
export function normalizeQuery(s) {
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

export function selectionKey(selection) {
  if (!selection) return 'all';
  return selection.type === 'metro' ? `metro:${selection.id}` : `pref:${selection.code}`;
}

/** 選択の一覧のモデル。{ id, labelKey, options: [{ key, value, label(lang), search }] }[] */
export function buildModel() {
  const prefOption = (code) => ({
    key: `pref:${code}`,
    value: { type: 'pref', code },
    label: (lang) => shortPrefName(code - 1, lang),
    search: [PREF_JA[code - 1], PREF_JA[code - 1].replace(/[都府県]$/, ''), PREF_YOMI[code - 1], PREF_EN[code - 1]].map(normalizeQuery),
  });
  return [
    {
      id: 'all',
      labelKey: 'region.all',
      options: [
        {
          key: 'all',
          value: null,
          label: (lang) => t('region.all', lang),
          search: [t('region.all', 'ja'), t('region.all', 'en'), ALL_YOMI, 'all'].map(normalizeQuery),
        },
      ],
    },
    {
      id: 'metro',
      labelKey: 'region.metroHeading',
      options: METRO_IDS.map((id) => ({
        key: `metro:${id}`,
        value: { type: 'metro', id },
        label: (lang) => metroName(id, lang),
        search: [metroName(id, 'ja'), METRO_YOMI[id], metroName(id, 'en')].map(normalizeQuery),
      })),
    },
    ...BLOCKS.map(([id, from, to]) => ({
      id,
      labelKey: `region.block.${id}`,
      options: Array.from({ length: to - from + 1 }, (_, k) => prefOption(from + k)),
    })),
  ];
}

/** 選択の名前(読み出しの見出し)。都道府県は正式名。 */
export function regionLabel(selection, lang) {
  if (!selection) return t('region.all', lang);
  if (selection.type === 'metro') return metroName(selection.id, lang);
  return prefName(selection.code - 1, lang);
}

export function mount(el, store, ctx) {
  const data = ctx?.data;
  const model = buildModel();
  const uid = 'sel';
  const lang = () => store.get().lang;

  // ---- 見出しのボタンとポップオーバー ----
  const nameEl = h('span', { class: 'sel-name' });
  const btn = h('button', {
    type: 'button',
    class: 'sel-btn',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-controls': `${uid}-pop`,
  });
  btn.append(nameEl);
  btn.insertAdjacentHTML('beforeend', CHEVRON);

  const input = h('input', {
    type: 'text',
    class: 'sel-input',
    role: 'combobox',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': `${uid}-list`,
  });
  const escHint = h('span', { class: 'sel-esc', 'aria-hidden': 'true' });
  const list = h('div', { class: 'sel-list', id: `${uid}-list`, role: 'listbox' });
  const empty = h('p', { class: 'sel-empty', hidden: true });
  const pop = h('div', { class: 'sel-pop', id: `${uid}-pop` }, h('div', { class: 'sel-search' }, input, escHint), list, empty);

  /** key → option の要素。groups は { el, nameEl, options } */
  const optionEls = new Map();
  const groups = model.map((g) => {
    const gName = h('span', { class: 'sel-gname', 'aria-hidden': 'true' });
    const opts = h('div', { class: 'sel-opts' });
    const gEl = h('div', { class: 'sel-group', role: 'group' }, gName, opts);
    const options = g.options.map((o) => {
      const oEl = h('div', { class: 'sel-opt', role: 'option', id: `${uid}-opt-${o.key.replace(':', '-')}`, 'aria-selected': 'false', 'data-key': o.key });
      optionEls.set(o.key, oEl);
      opts.append(oEl);
      return { ...o, el: oEl };
    });
    list.append(gEl);
    return { ...g, el: gEl, nameEl: gName, options };
  });

  const headRow = h('div', { class: 'sel-head' }, btn, pop);

  // ---- 読み出し(デスクトップ) ----
  const totalEl = h('span', { class: 'sel-v' });
  const totalUnit = h('small', { class: 'sel-unit' });
  const allCaption = h('p', { class: 'sel-cap' });
  const allBlock = h('div', { class: 'sel-all' }, h('div', { class: 'sel-big' }, totalEl, totalUnit), allCaption);

  const members = h('p', { class: 'sel-cap sel-members' });
  const scope = h('p', { class: 'sel-cap sel-scope' });
  const slot = () => ({ v: h('span', { class: 'sel-v' }), u: h('small', { class: 'sel-unit' }) });
  const sIn = slot();
  const sOut = slot();
  const sNet = slot();
  const dtIn = h('dt');
  const dtOut = h('dt');
  const dtNet = h('dt', { class: 'sel-net' });
  const dl = h(
    'dl',
    { class: 'sel-dl' },
    dtIn,
    h('dd', {}, sIn.v, sIn.u),
    dtOut,
    h('dd', {}, sOut.v, sOut.u),
    dtNet,
    h('dd', { class: 'sel-net' }, sNet.v, sNet.u),
  );
  const backBtn = h('button', { type: 'button', class: 'sel-back' });
  const regionBlock = h('div', { class: 'sel-region' }, members, scope, dl, backBtn);

  // ---- 要約(縦画面のドック) ----
  const sumLabel = h('span', { class: 'sel-sl' });
  const sumTotal = h('b', { class: 'sel-v' });
  const sumUnit = h('span', { class: 'sel-sl' });
  const sumAll = h('span', { class: 'sel-sum-all' }, sumLabel, sumTotal, sumUnit);
  const sumPart = () => ({ l: h('span', { class: 'sel-sl' }), v: h('b', { class: 'sel-v' }) });
  const pIn = sumPart();
  const pOut = sumPart();
  const pNet = sumPart();
  pNet.v.classList.add('lg');
  const sumSel = h('span', { class: 'sel-sum-sel' }, pIn.l, pIn.v, pOut.l, pOut.v, pNet.l, pNet.v);
  const sum = h('div', { class: 'sel-sum' }, sumAll, sumSel);

  const live = h('div', { class: 'sel-live', 'aria-live': 'polite', 'aria-atomic': 'true' });

  const root = h('div', { class: 'sel' }, headRow, allBlock, regionBlock, sum, live);
  el.replaceChildren(root);

  // ---- 描画 ----
  const swapped = new WeakMap();
  /** 文字を入れ替え、変わったときだけ不透明度の入れ替わり(--dur-3)を起こす。数え上げはしない。 */
  function put(node, text) {
    if (node.textContent === text) return;
    node.textContent = text;
    if (!swapped.has(node)) {
      swapped.set(node, true);
      return; // 最初の描画では動かさない
    }
    node.classList.remove('swap');
    void node.offsetWidth;
    node.classList.add('swap');
  }

  function renderLabels() {
    const L = lang();
    for (const g of groups) {
      g.nameEl.textContent = t(g.labelKey, L);
      g.el.setAttribute('aria-label', t(g.labelKey, L));
      for (const o of g.options) o.el.textContent = o.label(L);
    }
    input.setAttribute('aria-label', t('selector.searchLabel', L));
    input.setAttribute('placeholder', t('selector.search', L));
    escHint.textContent = t('selector.escClose', L);
    empty.textContent = t('selector.noMatch', L);
    dtIn.textContent = t('readout.in', L);
    dtOut.textContent = t('readout.out', L);
    dtNet.textContent = t('readout.net', L);
    backBtn.textContent = t('readout.back', L);
    pIn.l.textContent = t('readout.inShort', L);
    pOut.l.textContent = t('readout.outShort', L);
    pNet.l.textContent = t('readout.net', L);
    pop.setAttribute('aria-label', t('selector.open', L));
  }

  function renderSelected() {
    const key = selectionKey(store.get().selection);
    for (const [k, node] of optionEls) node.setAttribute('aria-selected', k === key ? 'true' : 'false');
  }

  let liveTimer = null;
  let liveFirst = true;
  function announce(text) {
    if (liveFirst) {
      liveFirst = false;
      live.textContent = text;
      return;
    }
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      live.textContent = text;
    }, LIVE_DELAY);
  }

  function renderReadout() {
    const { year, selection, lang: L } = store.get();
    const label = regionLabel(selection, L);
    const unit = L === 'ja' ? t('readout.unit', L) : '';
    root.classList.toggle('is-sel', !!selection);
    root.dataset.mode = selection ? 'region' : 'all';
    put(nameEl, label);
    btn.setAttribute('aria-label', `${label} — ${t('selector.open', L)}`);
    allBlock.hidden = !!selection;
    regionBlock.hidden = !selection;
    sumAll.hidden = !!selection;
    sumSel.hidden = !selection;
    if (!data) return;

    if (!selection) {
      const total = yearTotal(data, year);
      put(totalEl, formatCount(total));
      put(totalUnit, t('readout.totalUnit', L));
      put(allCaption, fill(t('readout.captionTotal', L), { year }));
      sumLabel.textContent = fill(t('readout.summaryTotal', L), { year });
      put(sumTotal, formatCount(total));
      sumUnit.textContent = L === 'ja' ? t('readout.totalUnit', L) : '';
      announce(`${fill(t('readout.heading', L), { region: label, year })} ${t('readout.total', L)} ${formatCount(total)}${L === 'ja' ? t('readout.unit', L) : ''}`);
      return;
    }

    const f = regionFlows(data.matrix(year), selection);
    const metro = selection.type === 'metro';
    members.hidden = !metro;
    members.textContent = metro && METRO_CODES[selection.id] ? METRO_CODES[selection.id].map((c) => shortPrefName(c - 1, L)).join(t('selector.memberSep', L)) : '';
    put(scope, fill(t(metro ? 'readout.captionMetro' : 'readout.captionPref', L), { year }));
    put(sIn.v, formatCount(f.in));
    put(sOut.v, formatCount(f.out));
    put(sNet.v, formatSigned(f.net));
    sIn.u.textContent = sOut.u.textContent = sNet.u.textContent = unit;
    put(pIn.v, formatShort(f.in, L));
    put(pOut.v, formatShort(f.out, L));
    put(pNet.v, formatShort(f.net, L, { signed: true }));
    const gain = f.net > 0 ? t('readout.netGain', L) : f.net < 0 ? t('readout.netLoss', L) : '';
    // 差引の見出しに「転入超過」「転出超過」を添える(和文は「差引 転入超過」、英語は「Net gain」「Net loss」)
    dtNet.textContent = !gain ? t('readout.net', L) : L === 'ja' ? `${t('readout.net', L)} ${gain}` : gain;
    const heading = fill(t(metro ? 'readout.headingMetro' : 'readout.heading', L), { region: label, year });
    const u = L === 'ja' ? t('readout.unit', L) : '';
    announce(
      `${heading}。${t('readout.in', L)} ${formatCount(f.in)}${u}、${t('readout.out', L)} ${formatCount(f.out)}${u}、${t('readout.net', L)} ${formatSigned(f.net)}${u} ${gain}`,
    );
  }

  // ---- ポップオーバー ----
  let isOpen = false;
  let active = null;

  const visibleOptions = () => groups.flatMap((g) => g.options.filter((o) => !o.el.hidden));

  function setActive(opt) {
    if (active) active.el.classList.remove('is-active');
    active = opt ?? null;
    if (active) {
      active.el.classList.add('is-active');
      input.setAttribute('aria-activedescendant', active.el.id);
      active.el.scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function applyFilter(query) {
    const q = normalizeQuery(query);
    let any = false;
    for (const g of groups) {
      let shown = 0;
      for (const o of g.options) {
        const hit = !q || o.search.some((s) => s.startsWith(q));
        o.el.hidden = !hit;
        if (hit) shown++;
      }
      g.el.hidden = shown === 0;
      any ||= shown > 0;
    }
    empty.hidden = any;
    const vis = visibleOptions();
    setActive(vis.find((o) => o.key === selectionKey(store.get().selection)) ?? vis[0] ?? null);
  }

  const onDocPointer = (e) => {
    if (!pop.contains(e.target) && !btn.contains(e.target)) close({ restoreFocus: false });
  };

  function open() {
    if (isOpen) return;
    isOpen = true;
    pop.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-expanded', 'true');
    input.value = '';
    applyFilter('');
    input.focus({ preventScroll: true });
    document.addEventListener('pointerdown', onDocPointer, true);
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    pop.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', onDocPointer, true);
    if (restoreFocus) btn.focus({ preventScroll: true });
  }

  function choose(opt) {
    store.set({ selection: opt.value });
    close();
  }

  function move(delta) {
    const vis = visibleOptions();
    if (!vis.length) return;
    const i = Math.max(0, vis.indexOf(active));
    setActive(vis[(i + delta + vis.length) % vis.length]);
  }

  /** 同じ組の中の前後(端で止まる)。 */
  function moveInGroup(delta) {
    if (!active) return;
    const g = groups.find((gr) => gr.options.includes(active));
    const vis = g.options.filter((o) => !o.el.hidden);
    const i = vis.indexOf(active);
    const next = vis[i + delta];
    if (next) setActive(next);
  }

  const onInputKey = (e) => {
    if (e.isComposing || e.keyCode === 229) return; // 変換中は IME に任せる
    pop.classList.add('kbd');
    switch (e.key) {
      case 'ArrowDown': move(1); break;
      case 'ArrowUp': move(-1); break;
      case 'ArrowRight': moveInGroup(1); break;
      case 'ArrowLeft': moveInGroup(-1); break;
      case 'Home': { const v = visibleOptions(); if (v.length) setActive(v[0]); break; }
      case 'End': { const v = visibleOptions(); if (v.length) setActive(v[v.length - 1]); break; }
      case 'Enter': if (active) choose(active); break;
      case 'Escape': close(); break;
      case 'Tab': close({ restoreFocus: false }); return; // フォーカスは自然に次へ進む
      default: return;
    }
    e.preventDefault();
    if (e.key === 'Escape') e.stopPropagation();
  };

  const onInput = () => {
    pop.classList.add('kbd');
    applyFilter(input.value);
  };
  const onListClick = (e) => {
    const node = e.target.closest?.('[role="option"]');
    if (!node) return;
    for (const g of groups) {
      const opt = g.options.find((o) => o.el === node);
      if (opt) return choose(opt);
    }
  };
  const onListMove = (e) => {
    pop.classList.remove('kbd');
    const node = e.target.closest?.('[role="option"]');
    if (!node) return;
    for (const g of groups) {
      const opt = g.options.find((o) => o.el === node);
      if (opt && opt !== active) return setActive(opt);
    }
  };
  const onBtnClick = () => (isOpen ? close() : open());
  const onBtnKey = (e) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      open();
    }
  };
  const onBack = () => store.set({ selection: null });
  // ポップオーバーが閉じているとき、Esc で選択を解除する(表のダイアログなどが開いているときは何もしない)
  const onDocKey = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || isOpen) return;
    if (document.querySelector('dialog[open]')) return;
    if (store.get().selection) store.set({ selection: null });
  };

  input.addEventListener('keydown', onInputKey);
  input.addEventListener('input', onInput);
  list.addEventListener('click', onListClick);
  list.addEventListener('pointermove', onListMove);
  btn.addEventListener('click', onBtnClick);
  btn.addEventListener('keydown', onBtnKey);
  backBtn.addEventListener('click', onBack);
  document.addEventListener('keydown', onDocKey);

  const off = store.subscribe((_, changed) => {
    if (changed.includes('lang')) renderLabels();
    if (changed.includes('selection')) renderSelected();
    if (changed.some((k) => k === 'year' || k === 'selection' || k === 'lang')) renderReadout();
    if (isOpen && changed.includes('lang')) applyFilter(input.value);
  });

  renderLabels();
  renderSelected();
  renderReadout();

  return {
    dispose() {
      off();
      clearTimeout(liveTimer);
      close({ restoreFocus: false });
      document.removeEventListener('keydown', onDocKey);
      document.removeEventListener('pointerdown', onDocPointer, true);
      el.replaceChildren();
    },
  };
}
