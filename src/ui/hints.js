// 操作の手がかり。装飾を足さず、12px の一行を --fg-3 で出す。仕様は docs/design/spec.md、文言は docs/copy/strings.md の hint.*(src/i18n/hints.js)。
//   mount(el, store, ctx) → { dispose() }   el は使わない(null でよい)。#app の中に自分の要素を作る。読む state: chapter、selection、hover、lang
//
// 気づいてほしいことは 3 つ。出す場所と時機は、順に気づけるように分ける。
//   ・スクロールで章が進む: 最初の章(chapter 0)で、まだスクロールしていないときだけ。左の柱の、本文のカードの下。縦画面では上の帯の下の右。
//   ・図を回せる(ドラッグ)、点を押して地域を選べる、弧に触れると人数が出る: 2 章以降で、右下のカメラの上(縦画面は上の帯の下の右)。
//     利用者が一度やったことは、一行から外す(ドラッグしたら「ドラッグで回す」を消す)。3 つとも済んだら、一行ごと消える。
// 覚えておくのはこのページを開いている間だけ(保存しない)。代替表示(<html data-fallback="2d">)では図を回せないので、「ドラッグ」は出さない。
// ポインタが指のとき(pointer: coarse、またはホバーできない画面、または縦画面の構成でタッチできる画面)は、
// 「なぞる」「タップ」の言い方にし、弧に触れる手がかりは出さない。
// 縦画面の構成(幅 1024px 未満)では、上の帯の下の一行が章の進み具合と重ならないよう、残っている手がかりを 1 つずつ出す。
import { onLangChange, t } from '../i18n.js';
import { PORTRAIT_MEDIA } from '../scene/camera.js';

const DRAG_THRESHOLD = 4; // scene/cameraRig.js と同じ(この距離を超えて動いたらドラッグ)
const SCROLLED = 24; // CSS px。これより下へスクロールしたら、スクロールの手がかりは役目を終える

export function mount(_el, store) {
  const doc = document;
  const host = doc.getElementById('app') ?? doc.body;
  const stage = doc.getElementById('stage');
  const fallback = doc.documentElement.dataset.fallback === '2d';
  const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : null);
  const touchQuery = mq('(pointer: coarse), (hover: none)');
  const narrowQuery = mq(PORTRAIT_MEDIA);
  const narrow = () => !!narrowQuery?.matches;
  const touch = () =>
    !!touchQuery?.matches || (narrow() && (navigator.maxTouchPoints > 0 || !!mq('(any-pointer: coarse)')?.matches));

  const make = (cls) => {
    const p = doc.createElement('p');
    p.className = `hint ${cls}`;
    return p;
  };
  const scrollHint = make('hint-scroll');
  const exploreHint = make('hint-explore');
  const root = doc.createElement('div');
  root.id = 'hints';
  root.append(scrollHint, exploreHint);
  host.append(root);

  // 済んだこと
  const done = { scrolled: false, drag: fallback, select: false, hover: false };
  const markScrolled = () => {
    if (!done.scrolled && window.scrollY > SCROLLED) {
      done.scrolled = true;
      render();
    }
  };
  if (window.scrollY > SCROLLED) done.scrolled = true;

  function render() {
    const s = store.get();
    scrollHint.textContent = t('hint.scroll');
    const showScroll = s.chapter === 0 && !done.scrolled;
    const tips = [];
    if (!done.drag) tips.push(t(touch() ? 'hint.dragTouch' : 'hint.drag'));
    if (!done.select) tips.push(t(touch() ? 'hint.selectTouch' : 'hint.select'));
    if (!done.hover && !touch()) tips.push(t('hint.hover'));
    exploreHint.textContent = (narrow() ? tips.slice(0, 1) : tips).join(t('hint.sep'));
    const showExplore = s.chapter >= 1 && tips.length > 0;
    scrollHint.classList.toggle('on', showScroll);
    exploreHint.classList.toggle('on', showExplore);
    // 見えないものは、読み上げにも出さない
    scrollHint.setAttribute('aria-hidden', String(!showScroll));
    exploreHint.setAttribute('aria-hidden', String(!showExplore));
  }

  // ---- 済んだことの検知 ----
  const pointers = new Map();
  const onDown = (e) => pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || done.drag) return;
    if (pointers.size >= 2 || Math.hypot(e.clientX - p.x, e.clientY - p.y) >= DRAG_THRESHOLD) {
      done.drag = true;
      render();
    }
  };
  const onUp = (e) => pointers.delete(e.pointerId);
  const onKey = (e) => {
    if (!done.drag && e.key.startsWith('Arrow') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      done.drag = true;
      render();
    }
  };
  stage?.addEventListener('pointerdown', onDown);
  stage?.addEventListener('pointermove', onMove);
  stage?.addEventListener('pointerup', onUp);
  stage?.addEventListener('pointercancel', onUp);
  stage?.addEventListener('keydown', onKey);
  window.addEventListener('scroll', markScrolled, { passive: true });

  const offStore = store.subscribe((s, changed) => {
    if (changed.includes('selection') && s.selection) done.select = true;
    if (changed.includes('hover') && s.hover?.type === 'arc') done.hover = true;
    if (changed.some((k) => k === 'chapter' || k === 'selection' || k === 'hover' || k === 'lang')) render();
  });
  const offLang = onLangChange(render);
  touchQuery?.addEventListener?.('change', render);
  narrowQuery?.addEventListener?.('change', render);

  render();

  return {
    dispose() {
      offStore();
      offLang();
      touchQuery?.removeEventListener?.('change', render);
      narrowQuery?.removeEventListener?.('change', render);
      stage?.removeEventListener('pointerdown', onDown);
      stage?.removeEventListener('pointermove', onMove);
      stage?.removeEventListener('pointerup', onUp);
      stage?.removeEventListener('pointercancel', onUp);
      stage?.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', markScrolled);
      root.remove();
    },
  };
}
