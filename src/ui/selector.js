// 地域の選択(都道府県と三大都市圏)。担当: 地域選択の実装者。
// 要素: #selector。読む・書く state: selection(null | { type: 'pref', code } | { type: 'metro', id })。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
// 圏の構成は geometry/constants.js の METRO_CODES、名前は i18n の prefName / metroName。
export function mount(el, store, ctx) {
  return { dispose() {} };
}
