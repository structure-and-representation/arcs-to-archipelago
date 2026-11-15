// 章の中身(物語の構成)。仕組み(スクロールと state の連動)は ui/chapters.js。
// 文言は src/i18n/chapters.js の辞書にある(name / heading / body / bodyPortrait / note は、そのキー)。
// 確定稿は docs/copy/chapters.js で、test/chapters.test.js が文言と場面を突き合わせている。
//
// 各章は複数の場面(steps)を持つ。章の中をスクロールで進み、場面の境を越えたときに、その場面の
//   year(西暦)、selection(null | { type: 'pref', code: 1〜47 } | { type: 'metro', id })、camera('side' | 'oblique' | 'top')
// を state へ一度だけ書く。自由探索の章(explore: true)は、読者が年・地域・カメラを動かせる。
import { CAMERA_NAMES, YEAR_MAX, YEAR_MIN, isMetroId } from '../geometry/constants.js';

/** 確定稿の selection(都道府県コードは 2 桁の文字列)を、state の形(数値の JIS コード)にする。 */
export function toStateSelection(sel) {
  if (!sel) return null;
  if (sel.type === 'metro') return { type: 'metro', id: sel.id };
  if (sel.type === 'pref') return { type: 'pref', code: Number(sel.code) };
  throw new Error(`不明な selection: ${JSON.stringify(sel)}`);
}

// extra: { body: 場面の本文のキー(あるときだけ。その場面にいる間、章の本文の代わりに出す)、
//          hover: { type: 'arc', o, d }(場面に入ったとき、朱で強調する弧。都道府県の添字 0〜46) }
const step = (year, selection, camera, extra = {}) => ({ year, selection: toStateSelection(selection), camera, ...extra });
const arc = (o, d) => ({ type: 'arc', o, d });
const tokyo = { type: 'metro', id: 'tokyo' };
const osaka = { type: 'metro', id: 'osaka' };
const nagoya = { type: 'metro', id: 'nagoya' };

const ch = (i, id, steps, extra = {}) => ({
  id,
  name: `ch.${i}.name`,
  heading: `ch.${i}.heading`,
  body: `ch.${i}.body`,
  ...extra,
  steps,
});

export const CHAPTERS = [
  ch(0, 'nation', [
    step(2025, null, 'side'), // 開幕: 最新年を、2015 年の原作と同じ姿(真横)で見せる
    step(2025, null, 'oblique', { body: 'ch.0.step1.body' }), // カメラが回り込み、都道府県が地図の上へ移る(地上と地下の意味を本文で教える)
  ], { bodyPortrait: 'ch.0.body.portrait' }),
  ch(1, 'tokyo', [
    step(2019, tokyo, 'oblique'),
    step(2021, tokyo, 'oblique'),
    step(2025, tokyo, 'oblique'),
  ], { note: 'ch.1.note' }),
  ch(2, 'osaka', [
    step(2014, osaka, 'oblique'),
    step(2023, osaka, 'oblique'), // 差引がゼロを越える年(+235)
    step(2025, osaka, 'oblique'),
  ]),
  ch(3, 'nagoya', [
    step(2012, nagoya, 'oblique'),
    step(2022, nagoya, 'oblique'),
    step(2025, nagoya, 'oblique'),
  ]),
  ch(4, 'explore', [
    step(2025, { type: 'pref', code: 27 }, 'oblique', { body: 'ch.4.step0.body', hover: arc(26, 27) }), // 大阪府(兵庫県への流れが毎年 2 万 6 千〜2 万 7 千人台)
    step(2012, { type: 'pref', code: 12 }, 'oblique', { body: 'ch.4.step1.body', hover: arc(11, 12) }), // 千葉県、流れの向きが逆転する前(千葉→東京)
    step(2025, { type: 'pref', code: 12 }, 'oblique', { body: 'ch.4.step2.body', hover: arc(11, 12) }), // 千葉県、逆転した後
    step(2025, null, 'oblique', { body: 'ch.4.step3.body' }), // 自由探索の出発点(この場面に入ってからは、読者の操作を上書きしない)
  ], { explore: true }),
];

export default CHAPTERS;

/** 場面の値が有効かを確かめる(テストと、読み込み時の検算に使う)。 */
export function isValidStep(s) {
  const sel = s.selection;
  const selOk =
    sel === null ||
    (sel.type === 'metro' && isMetroId(sel.id)) ||
    (sel.type === 'pref' && Number.isInteger(sel.code) && sel.code >= 1 && sel.code <= 47);
  return Number.isInteger(s.year) && s.year >= YEAR_MIN && s.year <= YEAR_MAX && selOk && CAMERA_NAMES.includes(s.camera);
}
