// 操作ボタン: カメラ(真横/斜め俯瞰/真上)、テーマ、言語、動きを減らす。担当: 操作ボタンの実装者。
// 要素: #controls。読む・書く state: camera、theme、lang、reducedMotion。
// 約束: mount(el, store, ctx) → { dispose() }。ctx = { data, renderer, picker, onFrame }。
// 文言は i18n の t('cam.side') など。ボタンはキーボードで操作でき、aria-pressed などで状態を示す。
export function mount(el, store, ctx) {
  return { dispose() {} };
}
