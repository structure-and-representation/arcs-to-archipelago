// 数値の表。担当: 表の実装者。
// 要素: #table(details)の .table-body。読む state: year、selection、lang。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
// 図と同じ数値(選択地域への転入・転出、または全国の上位)を、キーボードと読み上げで読める表にする。
export function mount(el, store, ctx) {
  return { dispose() {} };
}
