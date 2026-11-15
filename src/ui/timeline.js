// 年の切り替え。要素: #timeline。読む state: year、selection、lang。書く state: year(2012〜2025)。
// 14年の推移を小さな折れ線で示し、その下に年を並べる(デザイン仕様 5.3 節)。
//   - 地域を選んでいないときの折れ線は、都道府県間の移動者の総数。選んでいるときは、その地域の転入超過
//     (圏のときは圏外との移動だけ)。系列は data/stats.js の timelineSeries が求める。
//   - 部品全体が1つの role="slider"。← ↓ で1年前、→ ↑ で1年後、Home / End で最初と最後、PageUp / PageDown で5年。
//   - 列を押すとその年に変わり、押したまま横へ動かすと通過した列の年に順に変わる。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
import { fill, formatCount, formatSigned, timelineSeries } from '../data/stats.js';
import { metroName, prefName, t } from '../i18n.js';

const PAGE = 5;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

/** 選択した地域の名前(都道府県は正式名、圏は「東京圏」)。 */
function regionName(selection, lang) {
  if (selection.type === 'metro') return metroName(selection.id, lang);
  return prefName(selection.code - 1, lang);
}

export function mount(el, store, ctx) {
  const data = ctx?.data;
  const years = data?.years ?? [];
  const n = years.length;
  const disabled = n === 0;
  const first = years[0];
  const last = years[n - 1];

  const caption = h('span', { class: 'tl-name' });
  const svg = h('div', { class: 'tl-spark', 'aria-hidden': 'true' });
  const cells = years.map((y, i) =>
    h('span', { class: 'tl-yr', 'data-i': i }, h('span', { class: 'tl-c' }, String(y).slice(0, 2)), String(y).slice(2)),
  );
  const yearRow = h('div', { class: 'tl-years', 'aria-hidden': 'true' }, ...cells);
  const root = h(
    'div',
    {
      class: `tl${disabled ? ' is-off' : ''}`,
      role: 'slider',
      tabindex: disabled ? null : '0',
      'aria-disabled': disabled ? 'true' : null,
      'aria-valuemin': first,
      'aria-valuemax': last,
    },
    h('div', { class: 'tl-cap', 'aria-hidden': 'true' }, caption),
    svg,
    yearRow,
  );
  root.style.setProperty('--tl-n', String(Math.max(n, 1)));
  el.replaceChildren(root);

  let series = [];
  let hoverIndex = null; // ホバー(ドラッグ)中の列
  let dragging = false;
  let focusVisible = false;
  let width = 0;

  const lang = () => store.get().lang;
  const sel = () => store.get().selection;
  const indexOf = (year) => Math.max(0, years.indexOf(year));

  function buildSeries() {
    series = disabled ? [] : timelineSeries(data, sel());
  }

  function seriesName() {
    const s = sel();
    if (!s) return t('year.sparkTotal', lang());
    const region = regionName(s, lang());
    return fill(t(s.type === 'metro' ? 'year.sparkNetMetro' : 'year.sparkNet', lang()), { region });
  }

  function valueText(i) {
    const s = sel();
    const year = years[i];
    if (!s) return fill(t('year.valueTotal', lang()), { year, n: formatCount(series[i]) });
    const region = regionName(s, lang());
    return fill(t(s.type === 'metro' ? 'year.valueNetMetro' : 'year.valueNet', lang()), {
      year,
      region,
      n: formatSigned(series[i]),
    });
  }

  function drawSpark() {
    markHover();
    width = root.clientWidth;
    const style = getComputedStyle(root);
    const plotH = parseFloat(style.getPropertyValue('--tl-spark-h')) || 30;
    const pad = parseFloat(style.getPropertyValue('--tl-label-pad')) || 0; // ホバーの値を出す余白
    if (!width || disabled) {
      svg.replaceChildren();
      return;
    }
    const selected = !!sel();
    const cw = width / n;
    const x = (i) => cw * (i + 0.5);
    let lo = Math.min(...series);
    let hi = Math.max(...series);
    if (selected) {
      lo = Math.min(0, lo);
      hi = Math.max(0, hi);
    } else {
      const margin = (hi - lo) * 0.15;
      lo -= margin;
      hi += margin;
    }
    if (hi - lo < 1e-9) hi = lo + 1;
    const y = (v) => pad + plotH - 2 - ((v - lo) / (hi - lo)) * (plotH - 6);

    const cur = indexOf(store.get().year);
    const total = pad + plotH;
    let s = `<svg width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" focusable="false">`;
    if (selected) s += `<line class="tl-zero" x1="0" x2="${width}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
    s += `<line class="tl-cur" x1="${x(cur).toFixed(1)}" x2="${x(cur).toFixed(1)}" y1="${(y(series[cur]) + 4).toFixed(1)}" y2="${total}"/>`;
    s += `<polyline class="tl-line" points="${series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
    series.forEach((v, i) => {
      if (i !== cur) s += `<circle class="tl-dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="1.6"/>`;
    });
    s += `<circle class="tl-now" cx="${x(cur).toFixed(1)}" cy="${y(series[cur]).toFixed(1)}" r="3"/>`;
    const shown = hoverIndex ?? (focusVisible ? cur : null);
    if (shown != null) {
      if (shown !== cur) s += `<circle class="tl-hov" cx="${x(shown).toFixed(1)}" cy="${y(series[shown]).toFixed(1)}" r="3"/>`;
      if (pad > 0) {
        const label = selected ? formatSigned(series[shown]) : formatCount(series[shown]);
        // 端の列では、値の文字が部品の外へはみ出さないように寄せる
        const anchor = shown === 0 ? 'start' : shown === n - 1 ? 'end' : 'middle';
        const tx = shown === 0 ? Math.max(0, x(shown) - 14) : shown === n - 1 ? Math.min(width, x(shown) + 14) : x(shown);
        s += `<text class="tl-val" x="${tx.toFixed(1)}" y="${(y(series[shown]) - 8).toFixed(1)}" text-anchor="${anchor}">${label}</text>`;
      }
    }
    s += '</svg>';
    svg.innerHTML = s;
  }

  function markHover() {
    cells.forEach((c, i) => c.classList.toggle('hov', i === hoverIndex));
  }

  function update(changed) {
    const all = changed == null;
    const has = (k) => all || changed.includes(k);
    if (disabled) return;
    if (has('selection')) buildSeries();
    if (has('selection') || has('lang')) caption.textContent = seriesName();
    if (has('lang')) root.setAttribute('aria-label', t('year.label', lang()));
    if (has('year') || has('selection')) {
      const cur = indexOf(store.get().year);
      root.setAttribute('aria-valuenow', String(years[cur]));
      cells.forEach((c, i) => {
        c.classList.toggle('on', i === cur);
        if (i === cur) c.setAttribute('data-current', '');
        else c.removeAttribute('data-current');
      });
    }
    if (has('year') || has('selection') || has('lang')) {
      root.setAttribute('aria-valuetext', valueText(indexOf(store.get().year)));
    }
    if (has('year') || has('selection')) drawSpark();
  }

  function setYear(year) {
    if (disabled) return;
    store.set({ year: clamp(year, first, last) });
  }
  const step = (d) => setYear(years[clamp(indexOf(store.get().year) + d, 0, n - 1)]);

  const columnAt = (clientX) => {
    const r = root.getBoundingClientRect();
    return clamp(Math.floor(((clientX - r.left) / r.width) * n), 0, n - 1);
  };

  const onDown = (e) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragging = true;
    try {
      root.setPointerCapture(e.pointerId);
    } catch {
      /* 合成イベントなどでは捕捉できなくてもよい */
    }
    hoverIndex = columnAt(e.clientX);
    setYear(years[hoverIndex]);
    drawSpark();
  };
  const onMove = (e) => {
    if (disabled) return;
    const i = columnAt(e.clientX);
    if (dragging) setYear(years[i]);
    if (i !== hoverIndex) {
      hoverIndex = i;
      drawSpark();
    }
  };
  const onUp = (e) => {
    dragging = false;
    if (e.pointerType !== 'mouse') hoverIndex = null;
    drawSpark();
  };
  const onLeave = () => {
    if (dragging) return;
    hoverIndex = null;
    drawSpark();
  };
  const onKey = (e) => {
    if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowDown') step(-1);
    else if (k === 'ArrowRight' || k === 'ArrowUp') step(1);
    else if (k === 'PageUp') step(PAGE);
    else if (k === 'PageDown') step(-PAGE);
    else if (k === 'Home') setYear(first);
    else if (k === 'End') setYear(last);
    else return;
    e.preventDefault();
  };
  const onFocus = () => {
    focusVisible = root.matches(':focus-visible');
    drawSpark();
  };
  const onBlur = () => {
    focusVisible = false;
    drawSpark();
  };

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('keydown', onKey);
  root.addEventListener('focus', onFocus);
  root.addEventListener('blur', onBlur);

  const off = store.subscribe((_, changed) => {
    if (changed.some((k) => k === 'year' || k === 'selection' || k === 'lang')) update(changed);
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (root.clientWidth !== width) drawSpark();
  }) : null;
  ro?.observe(root);
  // 縦画面の構成に切り替わると折れ線の高さが変わる(幅が変わらないこともある)
  const mql = window.matchMedia?.('(max-width: 1023.98px)');
  const onLayout = () => drawSpark();
  mql?.addEventListener?.('change', onLayout);

  update(null);
  drawSpark();

  return {
    dispose() {
      off();
      ro?.disconnect();
      mql?.removeEventListener?.('change', onLayout);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('focus', onFocus);
      root.removeEventListener('blur', onBlur);
      el.replaceChildren();
    },
  };
}
