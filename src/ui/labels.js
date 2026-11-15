// 都道府県名のラベル。担当: ラベルの実装者。
// 要素: #labels(aria-hidden、pointer-events なし)。
// 約束: mount(el, store, ctx) → { dispose() }
//   ctx = { data, renderer, picker, onFrame(fn(timeSec)) → off }
//   毎フレーム ctx.renderer.project(i) → [x, y](CSS px)へ 47 個のラベルを動かす。
//   名前は i18n の prefName(i)。state の lang で切り替え、selection / hover の都道府県は朱にする。
export function mount(el, store, ctx) {
  return { dispose() {} };
}
