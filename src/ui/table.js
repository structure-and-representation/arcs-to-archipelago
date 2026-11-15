// 数値の表。図と同じ数値を、キーボードと読み上げで読める表にする(設計 §8、デザイン仕様 5.6)。
//   mount(el, store, ctx) → { open(opener?), close(), dispose() }
// 読む state: year、selection、lang。書く state: selection(行の都道府県の名前を押したとき)。
//
// `<dialog>` を showModal() で開く。開き方:
//   - [data-open-table] を持つ要素(上の帯の「数値の表」、代替表示の案内のボタン)を押す
//   - el が <details>(骨格の仮の置き場)のときは、その <summary> を押す
//   - 戻り値の open(opener) を呼ぶ
// 選択なしのときは 47 都道府県の転入・転出・差引、選択ありのときは選択地域から見た相手先ごとの
// 転入(相手先 → 選択地域)・転出(選択地域 → 相手先)・差引を出す。
import { t, prefName, metroName } from '../i18n.js';
import { sortRows, tableRows } from '../data/tableStats.js';

const COLUMNS = ['pref', 'in', 'out', 'net'];
const MINUS = '−';
let instances = 0;

/** 12345 → '12,345'(日本語でもカンマ区切り) */
export function formatCount(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** 差引。正は '+'、負は U+2212 の '−'、0 は '0'。 */
export function formatNet(n) {
  const v = Math.round(n);
  if (v > 0) return `+${formatCount(v)}`;
  if (v < 0) return `${MINUS}${formatCount(-v)}`;
  return '0';
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));

/** 選択の名前(都道府県は正式名、圏は圏の名前)。選択なしは null。 */
export function regionName(selection, lang) {
  if (!selection) return null;
  if (selection.type === 'pref') return prefName(selection.code - 1, lang);
  if (selection.type === 'metro') return metroName(selection.id, lang);
  return null;
}

/** 列を押したときの並べ替え。同じ列ならもう一度で逆順、別の列なら都道府県は昇順、数は降順で始める。 */
export function nextSort(sort, key) {
  if (sort.key === key) return { key, dir: -sort.dir };
  return { key, dir: key === 'pref' ? 1 : -1 };
}

/**
 * 表の中身(DOM に依存しない)。
 *   input: { matrix, selection, year, lang, sort: { key, dir } }
 *   戻り値: { mode, heading, caption, rows: [{ code, index, name, in, out, net }], summary }
 *   summary は選択ありのときの、選択地域の行 { name, in, out, net }(相手先すべての合計)。
 */
export function buildTableModel({ matrix, selection, year, lang, sort }) {
  const { mode, rows, total } = tableRows(matrix, selection);
  const sorted = sortRows(rows, sort.key, sort.dir).map((r) => ({ ...r, name: prefName(r.index, lang) }));
  const region = regionName(selection, lang);
  const vars = { year, region };
  const summary = mode === 'region' ? { name: region, ...total } : null;
  return {
    mode,
    heading: fill(t(mode === 'region' ? 'table.headingSelected' : 'table.heading', lang), vars),
    caption: fill(t(mode === 'region' ? 'table.captionSelected' : 'table.caption', lang), vars),
    rows: sorted,
    summary,
  };
}

function el(doc, tag, props = {}, children = []) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function mount(host, store, ctx) {
  const doc = host.ownerDocument;
  const data = ctx.data;
  let sort = { key: 'pref', dir: 1 };
  let dirty = true;
  let opener = null;

  // --- 骨格 ---
  const heading = el(doc, 'h2', { class: 'table-heading' });
  const unit = el(doc, 'p', { class: 'table-unit' });
  const closeBtn = el(doc, 'button', { class: 'table-close', type: 'button' });
  const caption = el(doc, 'caption', { class: 'table-caption' });
  const headButtons = {};
  const headCells = {};
  const headRow = el(doc, 'tr');
  for (const key of COLUMNS) {
    const label = el(doc, 'span', { class: 'table-col-label' });
    const arrow = el(doc, 'span', { class: 'table-arrow', 'aria-hidden': 'true' });
    const btn = el(doc, 'button', { type: 'button', 'data-key': key }, [label, arrow]);
    const th = el(doc, 'th', { scope: 'col', 'data-key': key }, [btn]);
    headButtons[key] = { btn, label, arrow };
    headCells[key] = th;
    headRow.append(th);
  }
  const summaryBody = el(doc, 'tbody', { class: 'table-summary' });
  const body = el(doc, 'tbody', { class: 'table-rows' });
  const table = el(doc, 'table', { class: 'data' }, [caption, el(doc, 'thead', {}, [headRow]), summaryBody, body]);
  const source = el(doc, 'p', { class: 'table-source' });
  const scroller = el(doc, 'div', { class: 'table-scroll' }, [table, source]);
  const sheet = el(doc, 'div', { class: 'table-sheet' }, [
    el(doc, 'header', { class: 'table-head' }, [heading, closeBtn]),
    unit,
    scroller,
  ]);
  const dlg = el(doc, 'dialog', { class: 'table-dialog' }, [sheet]);
  heading.id = `table-heading-${++instances}`;
  dlg.setAttribute('aria-labelledby', heading.id);

  // el が <details>(骨格の仮の置き場)のときは、閉じたままの details の中に置くと表示されないので body に置く
  const dialogParent = host.tagName === 'DETAILS' ? doc.body : host;
  dialogParent.append(dlg);

  // --- 描画 ---
  const cell = (tag, text, cls) => el(doc, tag, cls ? { class: cls, text } : { text });

  function numberCells(tr, r) {
    tr.append(cell('td', formatCount(r.in), 'num'), cell('td', formatCount(r.out), 'num'), cell('td', formatNet(r.net), 'num net'));
  }

  function update() {
    dirty = false;
    const s = store.get();
    const lang = s.lang;
    const model = buildTableModel({ matrix: data.matrix(s.year), selection: s.selection, year: s.year, lang, sort });

    heading.textContent = model.heading;
    caption.textContent = model.caption;
    closeBtn.textContent = t('table.close', lang);
    unit.textContent = t('table.unit', lang);
    for (const key of COLUMNS) {
      const { btn, label, arrow } = headButtons[key];
      const th = headCells[key];
      label.textContent = t(`table.col.${key}`, lang);
      if (sort.key === key) {
        th.setAttribute('aria-sort', sort.dir > 0 ? 'ascending' : 'descending');
        arrow.textContent = sort.dir > 0 ? '↑' : '↓';
        btn.classList.add('is-sorted');
      } else {
        th.removeAttribute('aria-sort');
        arrow.textContent = '↓';
        btn.classList.remove('is-sorted');
      }
    }

    // 選択地域の行(相手先すべての合計)。名前は朱
    summaryBody.replaceChildren();
    if (model.summary) {
      const tr = el(doc, 'tr', { class: 'sel', 'aria-current': 'true' });
      tr.append(cell('th', model.summary.name, 'name'));
      numberCells(tr, model.summary);
      summaryBody.append(tr);
    }

    // 並べ替え後の行。フォーカス中の行のボタンがあれば、同じ都道府県へ戻す
    const focusedCode = doc.activeElement?.closest?.('tbody.table-rows') ? doc.activeElement.dataset.code : null;
    body.replaceChildren();
    for (const r of model.rows) {
      const btn = el(doc, 'button', { type: 'button', class: 'pref-btn', 'data-code': String(r.code), text: r.name });
      const th = el(doc, 'th', { scope: 'row', class: 'name' }, [btn]);
      const tr = el(doc, 'tr', { 'data-code': String(r.code) });
      tr.append(th);
      numberCells(tr, r);
      body.append(tr);
    }
    if (focusedCode) body.querySelector(`button[data-code="${focusedCode}"]`)?.focus();

    // 出典(縦画面ではドックに出さないので、表の末尾に置く)
    source.replaceChildren();
    source.append(cell('span', t('source.label', lang), 'label'), ' ');
    const url = data.source?.url;
    const name = t('source.body', lang);
    source.append(/^https:\/\//.test(url ?? '') ? el(doc, 'a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: name }) : name);
  }

  // --- 開閉 ---
  function open(from) {
    if (dlg.open) return;
    opener = from ?? doc.activeElement;
    if (dirty) update();
    dlg.showModal();
    scroller.scrollTop = 0;
    closeBtn.focus();
  }
  function close() {
    if (dlg.open) dlg.close();
  }
  const onClose = () => {
    const target = opener;
    opener = null;
    if (target?.isConnected && typeof target.focus === 'function') target.focus();
  };
  dlg.addEventListener('close', onClose);
  closeBtn.addEventListener('click', close);

  headRow.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-key]');
    if (!btn) return;
    sort = nextSort(sort, btn.dataset.key);
    update();
  });

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('button.pref-btn');
    if (!btn) return;
    store.set({ selection: { type: 'pref', code: Number(btn.dataset.code) } });
    close();
  });

  // 行の名前のボタンどうしを ↑↓ Home End で移る
  body.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const btns = [...body.querySelectorAll('button.pref-btn')];
    const i = btns.indexOf(doc.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : Math.min(btns.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
    btns[j].focus();
  });

  const onDocClick = (e) => {
    const trigger = e.target.closest?.('[data-open-table]');
    if (trigger) {
      e.preventDefault();
      open(trigger);
    }
  };
  doc.addEventListener('click', onDocClick);

  let summary = null;
  const onSummary = (e) => {
    e.preventDefault();
    open(summary);
  };
  if (host.tagName === 'DETAILS') {
    summary = host.querySelector('summary');
    summary?.addEventListener('click', onSummary);
  }

  // --- 状態への追従 ---
  const off = store.subscribe((_s, changed) => {
    if (!changed.some((k) => k === 'year' || k === 'selection' || k === 'lang')) return;
    dirty = true;
    if (dlg.open) update();
  });

  return {
    open,
    close,
    dispose() {
      off();
      doc.removeEventListener('click', onDocClick);
      summary?.removeEventListener('click', onSummary);
      if (dlg.open) dlg.close();
      dlg.remove();
    },
  };
}
