// スクロールで進む5章。担当: 章の実装者。
// 要素: #chapters の section.chapter[data-chapter="0..4"]。書く state: chapter、selection、camera、year(章ごとの見せ方)。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
// 章 0 全国(選択なし)、1 東京一極(metro tokyo)、2 大阪圏(metro osaka)、3 名古屋圏(metro nagoya)、4 自由探索。
export function mount(el, store, ctx) {
  return { dispose() {} };
}
