// 文言の辞書(ja / en)。t(key) は現在の言語で引く。見つからなければ ja、それもなければ key を返す。
// 辞書は部品ごとに src/i18n/<部品>.js に分かれていて、ここでまとめる(担当は自分の辞書だけを編集する)。
// 静的な HTML は data-i18n="key"(本文)、data-i18n-attr="aria-label:key,title:key"(属性)で指定する。
import common, { PREF_EN, PREF_JA } from './i18n/common.js';
import timeline from './i18n/timeline.js';
import selector from './i18n/selector.js';
import tooltip from './i18n/tooltip.js';
import table from './i18n/table.js';
import controls from './i18n/controls.js';
import chapters from './i18n/chapters.js';
import legend from './i18n/legend.js';
import hints from './i18n/hints.js';

export { PREF_EN, PREF_JA };

const parts = [common, timeline, selector, tooltip, table, controls, chapters, legend, hints];
export const DICT = { ja: Object.assign({}, ...parts.map((p) => p.ja)), en: Object.assign({}, ...parts.map((p) => p.en)) };

let lang = 'ja';
const listeners = new Set();

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (next !== 'ja' && next !== 'en') return;
  if (next === lang) return;
  lang = next;
  for (const fn of [...listeners]) fn(lang);
}

/** 言語が変わったときに呼ばれる。戻り値は購読解除の関数。 */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, forLang = lang) {
  return DICT[forLang]?.[key] ?? DICT.ja[key] ?? key;
}

/** 都道府県名。i は添字(0〜46)。 */
export function prefName(i, forLang = lang) {
  return (forLang === 'en' ? PREF_EN : PREF_JA)[i] ?? '';
}

/** 圏の名前。 */
export function metroName(id, forLang = lang) {
  return t(`region.metro.${id}`, forLang);
}

/** root 以下の data-i18n / data-i18n-attr を現在の言語で書き換え、<html lang> と <title> も更新する。 */
export function applyStatic(root = document) {
  const doc = root.ownerDocument || root;
  doc.documentElement.lang = lang;
  doc.title = t('app.title');
  const meta = doc.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', t('app.description'));
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
}
