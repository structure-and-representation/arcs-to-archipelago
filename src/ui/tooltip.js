// ホバー中の弧・都道府県の数値(デザイン仕様 5.5 節)。
// 要素: #tooltip(role="tooltip")。読む state: hover、year、lang、selection。
// 数値は ctx.data.matrix(year)[o * 47 + d] から求める。位置はポインタ(pointermove の座標)、
// キーボードでラベルにフォーカスしているときは、その都道府県の点(ctx.renderer.project(i))。
//
// このファイルは、図の上のポインタ操作(ホバー・選択・タッチの 2 回タップ)の DOM との結びつきも受け持つ
// (scene/picking.js の createInteraction を、キャンバス #stage のイベントにつなぐ)。
// main.js も pointermove / click / pointerleave を受けるが、結果は同じ(hover は同じ値になる)。
// タッチでは、main.js の click(1 回目で選んでしまう)と pointerleave(ツールチップを消してしまう)を、
// window の capture で止める。
import { t } from '../i18n.js';
import { shortName } from '../i18n/tooltip.js';
import { PREF_EN, PREF_JA } from '../i18n/common.js';
import { createInteraction } from '../scene/picking.js';
import { fill, formatCount as fmtInt, formatSigned as fmtSigned, prefFlow } from '../data/stats.js';
import { collectFixedRects, rectsOverlap } from './avoid.js';

const OFFSET = 12; // ポインタから右下へずらす距離(px)
const EDGE = 4; // 画面の端に残す余白(px)
const TAP_SLOP = 10; // タップとみなす移動量の上限(px)
const TAP_MS = 600;

// ---------------------------------------------------------------------------------------------
// 数値と書式は data/stats.js(読み出し・表・折れ線と同じ関数)

/**
 * ツールチップの中身(表示用の値と、読み上げ用の 1 文)。hover が null なら null。
 *   弧:        { kind: 'arc', from, to, n, reverse, year, small, label }
 *   都道府県:  { kind: 'pref', name, in, out, net, label }
 * lang で名前と文言を決める。
 */
export function tooltipContent(hover, { matrix, year, lang }) {
  if (!hover) return null;
  const names = lang === 'en' ? PREF_EN : PREF_JA;
  if (hover.type === 'arc') {
    const { o, d } = hover;
    const n = matrix[o * 47 + d];
    const reverse = matrix[d * 47 + o];
    const from = shortName(o, names);
    const to = shortName(d, names);
    const label =
      reverse > 0
        ? fill(t('tooltip.pair', lang), { a: from, b: to, ab: fmtInt(n), ba: fmtInt(reverse), year })
        : fill(t('tooltip.flow', lang), { from, to, n: fmtInt(n), year });
    return { kind: 'arc', from, to, n, reverse, year, small: n < 100, label };
  }
  if (hover.type === 'pref') {
    const i = hover.code - 1;
    const f = prefFlow(matrix, i);
    const name = shortName(i, names);
    const label = fill(t('tooltip.pref', lang), { pref: name, in: fmtInt(f.in), out: fmtInt(f.out), net: fmtSigned(f.net) });
    return { kind: 'pref', name, code: hover.code, ...f, label };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// 位置

/**
 * ツールチップの左上の位置。ポインタ (x, y) の右下へ offset ずらし、画面の端からはみ出すなら左または上へ反転する。
 * avoid(固定の UI の矩形)にかからない向きを先に選ぶ。どれもだめなら、画面に収まる最初の向き。
 */
export function placeTooltip({ x, y, w, h, vw, vh, avoid = [], offset = OFFSET, edge = EDGE }) {
  const xs = [x + offset, x - offset - w];
  const ys = [y + offset, y - offset - h];
  const fits = (px, py) => px >= edge && py >= edge && px + w <= vw - edge && py + h <= vh - edge;
  let firstFit = null;
  for (const py of ys) {
    for (const px of xs) {
      if (!fits(px, py)) continue;
      const r = { left: px, top: py, right: px + w, bottom: py + h };
      if (!firstFit) firstFit = [px, py];
      if (!avoid.some((a) => rectsOverlap(r, a, 0))) return { x: px, y: py };
    }
  }
  if (firstFit) return { x: firstFit[0], y: firstFit[1] };
  return {
    x: Math.max(edge, Math.min(x + offset, vw - edge - w)),
    y: Math.max(edge, Math.min(y + offset, vh - edge - h)),
  };
}

// ---------------------------------------------------------------------------------------------
// DOM

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function buildRows(c, lang, touch) {
  const rows = [];
  if (c.kind === 'arc') {
    const route = node('div', 'tip-route');
    route.append(node('i'), node('span', null, `${c.from} → ${c.to}`));
    const value = node('div', 'tip-value');
    value.append(node('span', 'tip-num', fmtInt(c.n)), node('span', 'tip-unit', t('tooltip.people', lang)));
    const meta = node(
      'div',
      'tip-sub',
      c.reverse > 0
        ? fill(t('tooltip.meta', lang), { year: c.year, n: fmtInt(c.reverse) })
        : fill(t('tooltip.metaNone', lang), { year: c.year }),
    );
    rows.push(route, value, meta);
    if (c.small) rows.push(node('div', 'tip-sub', t('tooltip.small', lang)));
  } else {
    const route = node('div', 'tip-route', c.name);
    const mid = node('div', 'tip-sub');
    mid.append(`${t('tooltip.in', lang)} `, node('span', 'tip-n', fmtInt(c.in)), ` · ${t('tooltip.out', lang)} `, node('span', 'tip-n', fmtInt(c.out)));
    const low = node('div', 'tip-sub');
    low.append(`${t('tooltip.net', lang)} `, node('span', 'tip-n', fmtSigned(c.net)), ` · ${t(touch ? 'tooltip.hintTouch' : 'tooltip.hintMouse', lang)}`);
    rows.push(route, mid, low);
  }
  return rows;
}

export function mount(el, store, ctx) {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  const canvas = doc.getElementById('stage');
  const cleanups = [];
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  el.hidden = false;
  el.classList.add('tip');
  el.setAttribute('role', 'tooltip');

  const pointer = { x: 0, y: 0, type: 'mouse' };
  let fixed = [];
  let fixedAt = 0;
  let visible = false;

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  function anchor(hover) {
    // キーボードでラベルにフォーカスしているときは、その都道府県の点のそば
    const active = doc.activeElement;
    if (hover?.type === 'pref' && active && active.closest?.('#labels') && active.matches?.(':focus-visible')) {
      const [x, y] = ctx.renderer.project(hover.code - 1);
      return { x, y };
    }
    return { x: pointer.x, y: pointer.y };
  }

  function position(hover) {
    const a = anchor(hover);
    const now = performance.now();
    if (now - fixedAt > 300) {
      fixed = collectFixedRects(doc).filter((r) => !(r.left <= a.x && a.x <= r.right && r.top <= a.y && a.y <= r.bottom));
      fixedAt = now;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const p = placeTooltip({
      x: a.x, y: a.y, w, h,
      vw: doc.documentElement.clientWidth, vh: doc.documentElement.clientHeight,
      avoid: fixed,
    });
    el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  }

  function render() {
    const s = store.get();
    const content = tooltipContent(s.hover, { matrix: ctx.data.matrix(s.year), year: s.year, lang: s.lang });
    if (!content) {
      if (visible) {
        visible = false;
        el.classList.remove('on');
      }
      return;
    }
    el.replaceChildren(...buildRows(content, s.lang, pointer.type === 'touch'));
    el.classList.toggle('is-arc', content.kind === 'arc');
    el.setAttribute('aria-label', content.label);
    el.lang = s.lang;
    position(s.hover);
    if (!visible) {
      visible = true;
      el.classList.add('on');
    }
  }

  const off = store.subscribe((_, changed) => {
    if (changed.some((k) => k === 'hover' || k === 'year' || k === 'lang' || k === 'selection')) render();
  });
  cleanups.push(off);

  // ポインタの位置(ツールチップが付いていく)
  const track = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.type = e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (visible) position(store.get().hover);
  };
  listen(win, 'pointermove', track, { capture: true, passive: true });
  listen(win, 'pointerdown', track, { capture: true, passive: true });

  // 図の上の操作
  if (canvas) {
    const interaction = createInteraction({ store, picker: ctx.picker });
    let touchDown = null;
    let lastType = 'mouse';
    const isCanvas = (e) => e.target === canvas;

    listen(canvas, 'pointerdown', (e) => {
      lastType = e.pointerType === 'touch' ? 'touch' : 'mouse';
      touchDown = lastType === 'touch' ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    });
    listen(canvas, 'pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const [x, y] = local(e);
      interaction.move(x, y);
    });
    listen(canvas, 'pointerup', (e) => {
      if (e.pointerType !== 'touch' || !touchDown) return;
      const moved = Math.hypot(e.clientX - touchDown.x, e.clientY - touchDown.y);
      const quick = performance.now() - touchDown.t < TAP_MS;
      touchDown = null;
      if (moved > TAP_SLOP || !quick) return;
      track(e);
      const [x, y] = local(e);
      interaction.tap(x, y);
    });
    listen(canvas, 'pointercancel', () => {
      touchDown = null;
    });
    // main.js の pointerleave(hover を消す)と click(1 回目で選ぶ)より先に、window の capture で受ける
    listen(
      win,
      'pointerleave',
      (e) => {
        if (!isCanvas(e)) return;
        if (e.pointerType === 'touch') e.stopImmediatePropagation();
        else interaction.leave();
      },
      true,
    );
    listen(
      win,
      'click',
      (e) => {
        if (!isCanvas(e)) return;
        if (lastType === 'touch') {
          e.stopImmediatePropagation();
          return;
        }
        const [x, y] = local(e);
        interaction.click(x, y);
      },
      true,
    );
    listen(doc, 'keydown', (e) => {
      if (e.key === 'Escape' && store.get().hover && !doc.activeElement?.closest?.('#labels')) store.set({ hover: null });
    });
    const offFrame = ctx.onFrame?.(() => interaction.refresh());
    if (offFrame) cleanups.push(offFrame);
  }

  render();
  return {
    dispose() {
      cleanups.splice(0).forEach((fn) => fn());
      el.classList.remove('on');
    },
  };
}
