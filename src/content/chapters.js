// 章の中身(物語の構成)。担当: 章の実装者が、この中身を決める。仕組み(スクロールと state の連動)は ui/chapters.js。
// 文言は src/i18n/chapters.js の辞書にある(title / body は、そのキー)。
// 各章が state に書く値: selection(null | { type: 'pref', code } | { type: 'metro', id })、camera('side' | 'oblique' | 'top')、
// year(省略すると変えない)。いまの値は仮のもの。
export const CHAPTERS = [
  { id: 'national', title: 'ch.0.title', body: 'ch.0.body', selection: null, camera: 'side' },
  { id: 'tokyo', title: 'ch.1.title', body: 'ch.1.body', selection: { type: 'metro', id: 'tokyo' }, camera: 'oblique' },
  { id: 'osaka', title: 'ch.2.title', body: 'ch.2.body', selection: { type: 'metro', id: 'osaka' }, camera: 'oblique' },
  { id: 'nagoya', title: 'ch.3.title', body: 'ch.3.body', selection: { type: 'metro', id: 'nagoya' }, camera: 'oblique' },
  { id: 'explore', title: 'ch.4.title', body: 'ch.4.body', selection: null, camera: 'top' },
];
