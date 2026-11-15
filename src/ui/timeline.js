// 年の切り替え。担当: タイムラインの実装者。
// 要素: #timeline(nav)。読む state: year。書く state: year(2012〜2025)。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
// キーボードで操作でき、年の合計 ctx.data.totals[year] を併記できる。
export function mount(el, store, ctx) {
  return { dispose() {} };
}
