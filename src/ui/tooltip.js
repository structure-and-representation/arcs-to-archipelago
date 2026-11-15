// ホバー中の弧・都道府県の数値。担当: ツールチップの実装者。
// 要素: #tooltip(role="tooltip"、hidden で隠す)。読む state: hover、year。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
// 人数は ctx.data.matrix(year)[o * 47 + d]。位置は ctx.renderer.project(i) か、pointermove の座標。
export function mount(el, store, ctx) {
  return { dispose() {} };
}
