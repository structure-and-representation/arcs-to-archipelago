// スクロールで進む5章の仕組み。担当: 章の実装者が、スクロールと state の連動を書く(中身は content/chapters.js)。
// 要素: #chapters。書く state: chapter、selection、camera、year(章ごとの見せ方)。読む state: lang。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
// いまの実装: content/chapters.js の章を section.chapter[data-chapter] として並べ、言語が変わると文言を入れ替える。
import { CHAPTERS } from '../content/chapters.js';
import { applyStatic, onLangChange } from '../i18n.js';

export function mount(el, store, ctx) {
  el.replaceChildren(
    ...CHAPTERS.map((ch, i) => {
      const section = document.createElement('section');
      section.className = 'chapter';
      section.dataset.chapter = String(i);
      const h = document.createElement('h2');
      h.dataset.i18n = ch.title;
      const p = document.createElement('p');
      p.dataset.i18n = ch.body;
      section.append(h, p);
      return section;
    }),
  );
  applyStatic(el);
  const off = onLangChange(() => applyStatic(el));
  return {
    dispose() {
      off();
      el.replaceChildren();
    },
  };
}
