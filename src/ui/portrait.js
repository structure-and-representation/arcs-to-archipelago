// 縦画面かどうか。CSS の縦画面の構成(styles/base.css の @media (max-aspect-ratio: 1/1))と同じ条件で、幅 ≦ 高さのとき真。
// 縦画面用の文言(章の本文、凡例)を選ぶときに使う。
export const PORTRAIT_QUERY = '(max-aspect-ratio: 1/1)';

const mq = () => (typeof matchMedia === 'function' ? matchMedia(PORTRAIT_QUERY) : null);

export function isPortrait() {
  return mq()?.matches ?? false;
}

/** 縦画面かどうかが変わったときに fn(portrait) を呼ぶ。戻り値は購読解除の関数。 */
export function onPortraitChange(fn) {
  const m = mq();
  if (!m) return () => {};
  const handler = (e) => fn(e.matches);
  m.addEventListener('change', handler);
  return () => m.removeEventListener('change', handler);
}
