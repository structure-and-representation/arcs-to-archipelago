// ツールチップ(ui/tooltip.js)と都道府県名のラベル(ui/labels.js)の文言。
// 辞書は { ja, en }。キーは `<部品>.<名前>`(この部品は tooltip.)。src/i18n.js がまとめて t(key) を提供する。
// docs/copy/strings.md の `tooltip.*`(確定稿)に、ツールチップの行と、ラベルのボタンに必要な文言を足している。
import { PREF_JA } from './common.js';

export default {
  ja: {
    // 確定稿(読み上げ用の 1 文)
    'tooltip.flow': '{from} → {to}:{n}人({year}年)',
    'tooltip.pair': '{a} ⇄ {b}:{ab}人 / {ba}人({year}年)',
    'tooltip.pref': '{pref}:転入 {in}人、転出 {out}人、差引 {net}人',
    'tooltip.small': '100人未満の流れ',
    // 表示の行
    'tooltip.people': '人',
    'tooltip.meta': '{year}年 · 逆向き {n}人',
    'tooltip.metaNone': '{year}年',
    'tooltip.in': '転入',
    'tooltip.out': '転出',
    'tooltip.net': '差引',
    'tooltip.hintMouse': 'クリックで選ぶ',
    'tooltip.hintTouch': 'もう一度タップで選ぶ',
    // 都道府県名のラベル(<button>)
    'tooltip.labels': '都道府県',
    'tooltip.select': '{pref}を選ぶ',
  },
  en: {
    'tooltip.flow': '{from} → {to}: {n} people ({year})',
    'tooltip.pair': '{a} ⇄ {b}: {ab} / {ba} people ({year})',
    'tooltip.pref': '{pref}: {in} in, {out} out, net {net}',
    'tooltip.small': 'Fewer than 100 people',
    'tooltip.people': 'people',
    'tooltip.meta': '{year} · Reverse: {n}',
    'tooltip.metaNone': '{year}',
    'tooltip.in': 'In',
    'tooltip.out': 'Out',
    'tooltip.net': 'Net',
    'tooltip.hintMouse': 'Click to select',
    'tooltip.hintTouch': 'Tap again to select',
    'tooltip.labels': 'Prefectures',
    'tooltip.select': 'Select {pref}',
  },
};

/**
 * ラベルとツールチップに出す短い名前。日本語は「都」「府」「県」を省く(北海道はそのまま)。
 * 英語は PREF_EN そのまま(県・府・都は付いていない)。i は添字(0〜46)。
 */
export function shortName(i, names) {
  const n = names[i] ?? '';
  return n.replace(/[都府県]$/, '');
}

/** 日本語の短い名前(辞書の外から引く)。 */
export const SHORT_JA = PREF_JA.map((_, i) => shortName(i, PREF_JA));
