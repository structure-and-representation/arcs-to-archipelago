// 粒子の計算の JavaScript 版。scene/particles.js のシェーダと同じ式を持つ(docs/particles/spec.md)。
// 当たり判定、Canvas 2D の代替表示、テストが import する。three.js には依存しない。
//
//   1粒 = 100 人。弧 (o → d) ごとに、全年の ceil(v / 100) の最大を枠の数とする(2012〜2025 で計 26,206)。
//   枠 k の位置は弧の長さの割合 s で決め(slotS)、B スプラインの媒介変数 t へ変換する(arcT)。
//   不透明度は ALPHA * slotWeight(people, k) * endFade(s)。Σk slotWeight = people / 100。
import { N } from './constants.js';

export const PEOPLE_PER_PARTICLE = 100;
export const PERIOD = 14; // 端から端まで流れる秒数(全弧で同じ)
export const PHI = 0.618034; // 位相の係数(黄金比)
export const FADE = 0.04; // 端の薄めの幅(弧の長さの割合)
export const SIZE_CSS_PX = 2.5; // 粒子の直径
export const ALPHA = 0.5; // 粒子の不透明度

// arcT の定数(docs/particles/arclen.py で導出)
export const ARC_T = Object.freeze({ C: 5.510779, S0: 0.0861059, c1: 0.52318546, c3: 0.0844248, c5: 2.19156312 });

/** lowbias32 の整数ハッシュ。GLSL の hash() と同じ値を返す。 */
export function hash(x) {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** [0, 1) の一様乱数。GLSL の u01() と同じ値(24 ビット)。 */
export const u01 = (x) => (hash(x) >>> 8) / 16777216;

/** 弧の長さの割合 s(0〜1)→ B スプラインの媒介変数 t。すべての弧が相似なので、1つの式で済む。 */
export function arcT(s) {
  const { C, S0, c1, c3, c5 } = ARC_T;
  if (s < S0) return Math.cbrt(Math.max(s, 0) / C); // 区間0([A,A,A,M])は直線で s = C t^3
  if (s > 1 - S0) return 1 - Math.cbrt(Math.max(1 - s, 0) / C);
  const x = s - 0.5, x2 = x * x;
  return 0.5 + x * (c1 + x2 * (c3 + c5 * x2));
}

/** 弧 (o, d) の枠 k の位置(弧の長さの割合 s)。phase は phaseAt の値、still は静止の配置。 */
export function slotS(o, d, k, phase, still) {
  const g = (k * PHI + u01(o * N + d)) % 1;
  return still ? FADE + (1 - 2 * FADE) * g : (g + phase) % 1;
}

/** 人数 people の弧の枠 k の重み(0〜1)。Σk slotWeight(people, k) = people / 100。 */
export const slotWeight = (people, k) => Math.min(Math.max(people / PEOPLE_PER_PARTICLE - k, 0), 1);

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** 端の薄め。弧の長さの割合 s で測る。 */
export const endFade = (s) => smooth(0, FADE, s) * smooth(1, 1 - FADE, s);

/** 粒子1つの不透明度(シェーダの vA と同じ)。 */
export const slotAlpha = (people, k, s, alpha = ALPHA) => alpha * slotWeight(people, k) * endFade(s);

/** 位相の uniform。倍精度で計算する(生の秒数を GPU に渡さない)。still では 0。 */
export const phaseAt = (timeSec, still) => (still ? 0 : (((timeSec / PERIOD) % 1) + 1) % 1);

/** 年の行列を年の順に連結した人数テクスチャのデータ(R32F、幅 47 = d、高さ 47·NY、行 = 年の添字 * 47 + o)。
 *  matrixOf(year) → 2209 個の配列(loadData の matrix、または od.json の matrices[year])。 */
export function countsTextureData(years, matrixOf) {
  const out = new Float32Array(N * N * years.length);
  years.forEach((y, yi) => out.set(matrixOf(y), yi * N * N));
  return out;
}

/** 弧ごとの枠の数(全年の ceil(v / 100) の最大)。per[o * 47 + d]、total は合計。 */
export function slotBudget(years, matrixOf) {
  const per = new Uint16Array(N * N);
  for (const y of years) {
    const m = matrixOf(y);
    for (let i = 0; i < N * N; i++) per[i] = Math.max(per[i], Math.ceil(m[i] / PEOPLE_PER_PARTICLE));
  }
  let total = 0;
  for (const v of per) total += v;
  return { per, total };
}

/** 弧 o → d の側(選択のマスク版)。+1 地上、-1 地下、0 描かない。geometry/flows.js の sideOf と同じ規則。 */
export function sideOfMask(o, d, mask) {
  if (o === d) return 0;
  if (!mask || !mask.some(Boolean)) return o > d ? 1 : -1;
  if (!!mask[o] === !!mask[d]) return 0;
  return mask[d] ? 1 : -1;
}

/**
 * 枠の並びを [地下 | 地上] の順に out(Float32Array(total * 3)、(o, d, k))へ書く。
 * 選択地域の内部どうしの弧と、選択地域に関わらない弧は除く。
 * 返り値は2つの Points の drawRange(頂点の数)。
 */
export function orderSlots(per, mask, out) {
  let n = 0;
  let belowCount = 0;
  for (const want of [-1, 1]) {
    for (let o = 0; o < N; o++) {
      for (let d = 0; d < N; d++) {
        if (sideOfMask(o, d, mask) !== want) continue;
        const m = per[o * N + d];
        for (let k = 0; k < m; k++) {
          out[n * 3] = o;
          out[n * 3 + 1] = d;
          out[n * 3 + 2] = k;
          n++;
        }
      }
    }
    if (want === -1) belowCount = n;
  }
  return { below: { start: 0, count: belowCount }, above: { start: belowCount, count: n - belowCount } };
}

/** 年の切り替えのイージング(ease-in-out)。 */
export const easeInOut = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
};
