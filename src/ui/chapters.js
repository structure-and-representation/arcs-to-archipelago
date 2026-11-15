// スクロールで進む 5 章の仕組み(中身は content/chapters.js、文言は i18n/chapters.js)。
//   mount(el, store, ctx) → { dispose() }   el は #chapters
//
// ・5 章の本文はページのスクロールで流れ、キャンバスは画面に固定されている。各章は複数の場面(年・選択・カメラ)を持つ。
// ・画面の高さの中央の線(ANCHOR)がどの章のどの場面にあるかを locate() で求め、(章, 場面)が変わったときだけ
//   state の chapter / year / selection / camera を一度に書く。カメラはスクロールの量に連動させず、場面の境で一度だけ動く。
// ・自由探索の章は場面が 1 つなので、章の中をスクロールしている間は state を書かない(読者の操作を上書きしない)。
//   ほかの章でも、同じ場面の中にいる間は上書きしない。
// ・目次を押すとその章の先頭へ動く。動いている途中の章の場面は通り過ぎるだけで、state には書かない。
// ・はじめの章と場面は initialScene(URL の引数)で決める(main.js が state へ書き、ここはその位置へスクロールする)。
//   URL に ch がなくても、URL の年・選択・カメラに合う章を選ぶので、本文と画面が矛盾しない。
// ・日本語と英語(i18n の言語)、縦画面用の本文、動きを減らす設定(state.reducedMotion)に追従する。
import { CHAPTERS } from '../content/chapters.js';
import { CAMERA_PRESETS, isCameraName } from '../geometry/constants.js';
import { onLangChange, t } from '../i18n.js';
import { isPortrait, onPortraitChange } from './portrait.js';

/** 画面の高さのどこにある線で、いまの章と場面を決めるか(0 = 上端、1 = 下端)。 */
export const ANCHOR = 0.5;

/**
 * スクロールの位置から、章と場面を求める純関数。
 * anchor はページ上の y(scrollY + 画面の高さ × ANCHOR)。sections は章の並び(上から順)で、
 * 各章は { top, height, steps }(ページ上の位置、高さ、場面の数)。章の中は高さを場面の数で等分する。
 * 先頭の章より上は 0 章の 0 場面、最後の章より下は最後の章の最後の場面。
 */
export function locate(anchor, sections) {
  let chapter = 0;
  for (let i = 0; i < sections.length; i++) if (anchor >= sections[i].top) chapter = i;
  const s = sections[chapter];
  if (!s) return { chapter: 0, step: 0 };
  const frac = s.height > 0 ? (anchor - s.top) / s.height : 0;
  const step = Math.min(s.steps - 1, Math.max(0, Math.floor(frac * s.steps)));
  return { chapter, step };
}

/** 場面の値を state へ書く patch にする(selection は新しいオブジェクトにして、場面の定義を共有しない)。 */
export function sceneToPatch(chapter, step) {
  const s = CHAPTERS[chapter].steps[step];
  return { chapter, year: s.year, selection: s.selection ? { ...s.selection } : null, camera: s.camera };
}

const sameSelection = (a, b) =>
  (a == null && b == null) ||
  (a != null && b != null && a.type === b.type && (a.type === 'metro' ? a.id === b.id : a.code === b.code));

/** 自由探索の章(場面が 1 つで、読者が年・地域・カメラを動かす)。 */
export const EXPLORE = CHAPTERS.findIndex((c) => c.explore);

/**
 * URL の引数(params.js の parseParams の patch)から、はじめの章と場面と、state へ書く patch を決める純関数。
 *  - ch があるとき: その章の最初の場面(URL の year / sel / cam に合う場面があれば、その場面)の年・選択・カメラ。
 *    URL に year / sel / cam / morph があれば、そちらを優先する。
 *  - ch がなく、year / sel / cam のどれかがあるとき: それらがすべて一致する最初の場面の章(本文と画面が矛盾しない)。
 *    一致する場面がなければ自由探索の章にし、URL にない値は自由探索の場面の値にする。
 *  - どれもないとき: 0 章の最初の場面(開幕)。
 * morph は、URL になければカメラの定位置の値。戻り値: { chapter, step, patch }
 */
export function initialScene(urlPatch = {}) {
  const has = (k) => urlPatch[k] !== undefined;
  const fromUrl = {};
  for (const k of ['year', 'selection', 'camera', 'morph']) if (has(k)) fromUrl[k] = urlPatch[k];
  let chapter = 0;
  let step = 0;
  if (has('chapter')) {
    chapter = Math.min(Math.max(0, urlPatch.chapter), CHAPTERS.length - 1);
    // 章の中で URL の年・選択・カメラに合う場面があれば、その場面から始める(再読み込みや共有の URL で場面を戻さない)
    if (has('year') || has('selection') || has('camera')) {
      const k = CHAPTERS[chapter].steps.findIndex(
        (s) =>
          (!has('year') || s.year === urlPatch.year) &&
          (!has('selection') || sameSelection(s.selection, urlPatch.selection)) &&
          (!has('camera') || s.camera === urlPatch.camera),
      );
      if (k >= 0) step = k;
    }
  } else if (has('year') || has('selection') || has('camera')) {
    let found = null;
    CHAPTERS.forEach((c, i) =>
      c.steps.forEach((s, k) => {
        if (found) return;
        if (has('year') && s.year !== urlPatch.year) return;
        if (has('selection') && !sameSelection(s.selection, urlPatch.selection)) return;
        if (has('camera') && s.camera !== urlPatch.camera) return;
        found = [i, k];
      }),
    );
    [chapter, step] = found ?? [EXPLORE, 0];
  }
  const patch = { ...sceneToPatch(chapter, step), ...fromUrl };
  if (!has('morph') && isCameraName(patch.camera)) patch.morph = CAMERA_PRESETS[patch.camera].morph;
  return { chapter, step, patch };
}

const pad = (n) => String(n + 1).padStart(2, '0');
const el = (tag, className, attrs = {}) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

export function mount(root, store, ctx = {}) {
  // ---- DOM ----
  const toc = el('nav', 'toc');
  const tocList = el('ol');
  const tocLinks = CHAPTERS.map((c, i) => {
    const a = el('a', '', { href: `#chapter-${c.id}` });
    const n = el('span', 'n');
    n.textContent = pad(i);
    const name = el('span', 'name');
    a.append(n, name);
    const li = el('li');
    li.append(a);
    tocList.append(li);
    return { a, li, name };
  });
  toc.append(tocList);

  const progress = el('div', 'progress', { 'aria-hidden': 'true' });
  const bars = CHAPTERS.map(() => progress.appendChild(el('i')));
  const progressLabel = progress.appendChild(el('span'));

  const sections = CHAPTERS.map((c, i) => {
    const section = el('section', 'chapter', { id: `chapter-${c.id}`, 'aria-labelledby': `chapter-${c.id}-h` });
    section.dataset.chapter = String(i);
    section.style.setProperty('--steps', String(c.steps.length));
    const card = el('div', 'chapter-card');
    const kicker = el('p', 'kicker');
    const h2 = el('h2', '', { id: `chapter-${c.id}-h`, tabindex: '-1' });
    const body = el('p', 'body');
    card.append(kicker, h2, body);
    let note = null;
    if (c.note) {
      note = el('p', 'note');
      card.append(note);
    }
    section.append(card);
    return { section, kicker, h2, body, note };
  });

  const footer = el('footer', 'footnote');
  const footerNote = footer.appendChild(el('p'));
  const footerMap = footer.appendChild(el('p', 'map-source'));
  root.replaceChildren(toc, progress, ...sections.map((s) => s.section), footer);

  // 目次と章の位置の表示(いま見せる章)
  let shown = store.get().chapter;
  function renderCurrent(i) {
    shown = i;
    tocLinks.forEach((l, k) => {
      if (k === i) l.a.setAttribute('aria-current', 'step');
      else l.a.removeAttribute('aria-current');
    });
    bars.forEach((b, k) => b.classList.toggle('on', k === i));
    progressLabel.textContent = `${pad(i)} ${t(CHAPTERS[i].name)}`;
  }

  // ---- 文言(言語と縦画面で変わる) ----
  const renderTexts = () => {
    const portrait = isPortrait();
    CHAPTERS.forEach((c, i) => {
      const s = sections[i];
      s.kicker.textContent = `${pad(i)} — ${t(c.name)}`;
      s.h2.textContent = t(c.heading);
      s.body.textContent = t(portrait && c.bodyPortrait ? c.bodyPortrait : c.body);
      if (s.note) s.note.textContent = t(c.note);
      tocLinks[i].name.textContent = t(c.name);
    });
    toc.setAttribute('aria-label', t('ch.nav'));
    footerNote.textContent = t('footer.note');
    footerMap.textContent = t('footer.mapSource');
    renderCurrent(shown);
  };

  // ---- スクロール → 章と場面 ----
  let geometry = [];
  const measure = () => {
    const y = window.scrollY;
    geometry = sections.map((s, i) => {
      const r = s.section.getBoundingClientRect();
      return { top: r.top + y, height: r.height, steps: CHAPTERS[i].steps.length };
    });
  };
  const here = () => locate(window.scrollY + window.innerHeight * ANCHOR, geometry);

  let current = { chapter: -1, step: -1 };
  const enter = (loc, write = true) => {
    current = loc;
    if (write) store.set(sceneToPatch(loc.chapter, loc.step));
    else store.set({ chapter: loc.chapter });
  };
  const update = () => {
    const loc = here();
    if (loc.chapter === current.chapter && loc.step === current.step) return;
    enter(loc);
  };

  // 目次から動いている間は、通り過ぎる章の場面を state に書かない。止まったら、いる場所の場面を書く。
  // 止まった = スクロールが 160ms 動かず(または scrollend)、目標の位置に着いている(着かないまま 4 秒たったら諦める)
  let navigating = false;
  let target = 0;
  let startedAt = 0;
  let quiet = 0;
  const arrived = () => Math.abs(window.scrollY - Math.min(target, document.documentElement.scrollHeight - window.innerHeight)) < 2;
  const finish = () => {
    clearTimeout(quiet);
    if (!navigating) return;
    if (!arrived() && performance.now() - startedAt < 4000) {
      quiet = setTimeout(finish, 160);
      return;
    }
    navigating = false;
    renderCurrent(store.get().chapter);
    update();
  };
  const goto = (i) => {
    measure();
    navigating = true;
    target = geometry[i].top;
    startedAt = performance.now();
    renderCurrent(i);
    window.scrollTo({ top: target, behavior: store.get().reducedMotion ? 'auto' : 'smooth' });
    clearTimeout(quiet);
    quiet = setTimeout(finish, 160);
    sections[i].h2.focus({ preventScroll: true });
  };
  tocLinks.forEach((l, i) =>
    l.a.addEventListener('click', (e) => {
      e.preventDefault();
      goto(i);
    }),
  );

  // スクロールのたびに、場面が変わったかを調べる(章は 5 つだけなので軽い。描画の 1 フレームを待たない)
  const onScroll = () => {
    if (navigating) {
      clearTimeout(quiet);
      quiet = setTimeout(finish, 160);
      return;
    }
    update();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scrollend', finish);

  // 画面の大きさ・言語・フォントで高さが変わるとき、位置を測り直す
  const ro = new ResizeObserver(() => {
    measure();
    if (!navigating) update();
  });
  ro.observe(root);
  document.fonts?.ready.then(() => {
    measure();
    update();
  });

  const offStore = store.subscribe((s, changed) => {
    if (changed.includes('chapter') && !navigating) renderCurrent(s.chapter);
  });
  const offLang = onLangChange(renderTexts);
  const offPortrait = onPortraitChange(renderTexts);

  // ---- はじめの章と場面 ----
  // main.js が initialScene(URL)で決めた章・場面の state を書いてから mount する。ここでは、その場面の位置へ
  // スクロールするだけで、state は書かない(URL の値を上書きしない)。読者がスクロールして場面を越えたときから書く。
  renderTexts();
  measure();
  const start = ctx.initialScene ?? { chapter: store.get().chapter, step: 0 };
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const g = geometry[start.chapter];
  if (g && (start.chapter > 0 || start.step > 0)) {
    // 場面の範囲の中ほど(画面の高さの中央の線が、その場面の中央に来る位置。フォントの読み込みなどで高さが少し変わっても場面を外れない)
    const y = g.top + (g.height / g.steps) * (start.step + 0.5) - window.innerHeight * ANCHOR;
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
  } else if (window.scrollY > 0) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  current = { chapter: start.chapter, step: start.step };
  if (store.get().chapter !== start.chapter) store.set({ chapter: start.chapter });
  renderCurrent(store.get().chapter);

  return {
    dispose() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', finish);
      clearTimeout(quiet);
      ro.disconnect();
      offStore();
      offLang();
      offPortrait();
      root.replaceChildren();
    },
  };
}
