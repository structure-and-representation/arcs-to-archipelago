// 凡例と注記。仕様は docs/design/spec.md の 5.8、文言は docs/copy/strings.md の legend.*(src/i18n/legend.js)。
//   mount(el, store, ctx) → { dispose() }   el は #legend。読む state: selection、camera(lang は i18n、縦画面は ui/portrait.js)
//
// ・「1粒=100人」と「弧の高さ=距離」、向きの意味(小さな図つき)、出典の注記を出す。
// ・向きの意味は状態で変わる: 地域を選んでいないとき(真横の横長用 / 縦画面用、真横以外は「地上は北へ、地下は南へ」)、
//   選んでいるとき(「地上の弧:東京圏への転入」など)。
// ・縦画面では、「1粒=100人」と「弧の高さ=距離」がドックの 3 段目の右、向きの意味が図の左上(縦に 2 行)に分かれて出る。
//   出典の注記は縦画面では出さない(表のダイアログの末尾に置く)。配置は ui-legend.css。
import { getLang, metroName, onLangChange, prefName, t } from '../i18n.js';
import { isPortrait, onPortraitChange } from './portrait.js';

const FALLBACK_SOURCE_URL = 'https://www.stat.go.jp/data/idou/index.html';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** 弧の向きの小さな図: 水平の線と、上の弧(実線)または下の弧(点線)。 */
function glyph(kind) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'legend-glyph');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '10');
  svg.setAttribute('viewBox', '0 0 16 10');
  svg.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', 'M0 5H16');
  const arc = document.createElementNS(ns, 'path');
  if (kind === 'up') {
    arc.setAttribute('d', 'M2 5C5 0 11 0 14 5');
  } else {
    arc.setAttribute('d', 'M2 5C5 10 11 10 14 5');
    arc.setAttribute('stroke-dasharray', '1.5 1.5');
  }
  svg.append(line, arc);
  return svg;
}

/** 選択中の地域の名前。選択がなければ null。 */
export function regionName(selection) {
  if (!selection) return null;
  if (selection.type === 'metro') return metroName(selection.id);
  return prefName(selection.code - 1);
}

/**
 * 状態から、向きの意味の文言のキーを選ぶ。
 * 地域を選んでいる: 地上 = 転入、地下 = 転出(hint つき)。選んでいない: 真横は横長用 / 縦画面用、真横以外は地図の上の文。
 */
export function directionKeys(selection, camera, portrait) {
  if (selection) return { up: 'legend.selected.in', down: 'legend.selected.out', hint: 'legend.selected.hint' };
  if (camera === 'side') {
    const k = portrait ? 'portrait' : 'landscape';
    return { up: `legend.none.${k}.up`, down: `legend.none.${k}.down`, hint: null };
  }
  return { up: 'legend.none.map.up', down: 'legend.none.map.down', hint: null };
}

export function mount(root, store, ctx) {
  const sourceUrl = ctx?.data?.source?.url || FALLBACK_SOURCE_URL;
  root.setAttribute('role', 'group');

  const render = () => {
    const { selection, camera } = store.get();
    const portrait = isPortrait();
    const keys = directionKeys(selection, camera, portrait);
    const region = regionName(selection) ?? '';
    const fill = (key) => t(key).replace('{region}', region);

    root.setAttribute('aria-label', t('legend.label'));

    // 1粒=100人、弧の高さ=距離
    const key = el('div', 'legend-key');
    const grain = el('span', 'legend-item legend-grain');
    grain.append(el('span', 'legend-dot'), el('span', null, t('legend.particle')));
    key.append(grain, el('span', 'legend-item legend-height', t('legend.height')));

    // 向きの意味
    const dir = el('ul', 'legend-dir');
    for (const [kind, k] of [['up', keys.up], ['down', keys.down]]) {
      const li = el('li', 'legend-item');
      li.append(glyph(kind), el('span', null, fill(k)));
      dir.append(li);
    }
    if (keys.hint && !portrait) dir.append(el('li', 'legend-hint', t(keys.hint)));

    const children = [key, dir];

    // 注記(縦画面では表のダイアログに置くので、ここには出さない)
    if (!portrait) {
      const lang = getLang();
      const note = el('p', 'legend-note');
      const link = el('a', null, t('source.body'));
      link.href = sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      note.append(`${t('source.label')}${lang === 'ja' ? ' ' : ': '}`, link, lang === 'ja' ? '。' : '. ', t('legend.encoding'));
      children.push(note);
    }
    root.replaceChildren(...children);
  };

  render();
  const offStore = store.subscribe((_, changed) => {
    if (changed.includes('selection') || changed.includes('camera')) render();
  });
  const offLang = onLangChange(render);
  const offPortrait = onPortraitChange(render);

  return {
    dispose() {
      offStore();
      offLang();
      offPortrait();
      root.replaceChildren();
    },
  };
}
