// 縦画面の構成かどうか。CSS の @media (max-width: 1023.98px) と scene/camera.js の isPortrait(幅 1024px 未満)と同じ条件。
// 縦画面用の文言(章の本文、凡例)を選ぶときに使う。
export const PORTRAIT_QUERY = '(max-width: 1023.98px)';

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
