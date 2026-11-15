// 流れ(o → d)の向きと、粒子の枠の数。
import { METRO_CODES } from './constants.js';

/** 選択から、選択中の都道府県の 0/1 マスク Uint8Array(47)(添字は JIS コード − 1)を作る。 */
export function selectionMask(selection) {
  const mask = new Uint8Array(47);
  if (!selection) return mask;
  if (selection.type === 'pref') {
    const i = selection.code - 1;
    if (i >= 0 && i < 47) mask[i] = 1;
  } else if (selection.type === 'metro') {
    for (const code of METRO_CODES[selection.id] || []) mask[code - 1] = 1;
  }
  return mask;
}

const maskCache = new WeakMap();
function maskOf(selection) {
  let m = maskCache.get(selection);
  if (!m) {
    m = selectionMask(selection);
    maskCache.set(selection, m);
  }
  return m;
}

/**
 * 弧の側。+1 が地上、-1 が地下、0 は描かない。o, d は都道府県の添字(0〜46)。
 *  - 選択なし: o > d(南から北)が +1、o < d が -1(原作と同じ)。
 *  - 選択あり: 選択地域への転入が +1、選択地域からの転出が -1。
 *    選択地域の内部どうしと、選択地域に関わらない流れは 0。
 */
export function sideOf(o, d, selection) {
  if (o === d) return 0;
  if (!selection) return o > d ? 1 : -1;
  const m = maskOf(selection);
  const so = m[o], sd = m[d];
  if (so === sd) return 0;
  return sd ? 1 : -1;
}

/** 人数 v の弧が持つ粒子の枠の数。1 粒 = 100 人で、100 人に満たない流れも 1 粒を持つ。 */
export function particleCount(v) {
  return v > 0 ? Math.ceil(v / 100) : 0;
}
