// 章の中身(物語の構成)。仕組み(スクロールと state の連動)は ui/chapters.js。
// 文言は src/i18n/chapters.js の辞書にある(name / heading / body / bodyPortrait / note は、そのキー)。
// 確定稿は docs/copy/chapters.js で、test/chapters.test.js が文言と場面を突き合わせている。
//
// 各章は複数の場面(steps)を持つ。章の中をスクロールで進み、場面の境を越えたときに、その場面の
//   year(西暦)、selection(null | { type: 'pref', code: 1〜47 } | { type: 'metro', id })、camera('side' | 'oblique' | 'top')
// を state へ一度だけ書く。自由探索の章(explore: true)は、読者が年・地域・カメラを動かせる。
import { CAMERA_NAMES, METRO_CODES, YEAR_MAX, YEAR_MIN } from '../geometry/constants.js';

/** 確定稿の selection(都道府県コードは 2 桁の文字列)を、state の形(数値の JIS コード)にする。 */
export function toStateSelection(sel) {
  if (!sel) return null;
  if (sel.type === 'metro') return { type: 'metro', id: sel.id };
  if (sel.type === 'pref') return { type: 'pref', code: Number(sel.code) };
  throw new Error(`不明な selection: ${JSON.stringify(sel)}`);
}

const step = (year, selection, camera) => ({ year, selection: toStateSelection(selection), camera });
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
    step(2014, null, 'side'), // 開幕: 2015 年の原作と同じ姿
    step(2014, null, 'oblique'), // カメラが回り込み、都道府県が地図の上へ移る
    step(2025, null, 'oblique'), // 年が最新のデータまで進む
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
    step(2025, null, 'oblique'), // 自由探索の出発点
  ], { explore: true }),
];

export default CHAPTERS;

/** 場面の値が有効かを確かめる(テストと、読み込み時の検算に使う)。 */
export function isValidStep(s) {
  const sel = s.selection;
  const selOk =
    sel === null ||
    (sel.type === 'metro' && sel.id in METRO_CODES) ||
    (sel.type === 'pref' && Number.isInteger(sel.code) && sel.code >= 1 && sel.code <= 47);
  return Number.isInteger(s.year) && s.year >= YEAR_MIN && s.year <= YEAR_MAX && selOk && CAMERA_NAMES.includes(s.camera);
}
