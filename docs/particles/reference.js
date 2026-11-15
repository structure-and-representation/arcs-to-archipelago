// CPU-side reference for the particle layer (plain ES module, no three.js).
// These are the JS twins of the shader math, for src/scene/particles.js, the Canvas 2D fallback and Vitest.
export const N = 47;
export const PERIOD = 14;                 // seconds per end-to-end transit, every arc
export const PHI = 0.618034;
export const FADE = 0.04;                 // end fade width, in arc-length fraction

// lowbias32 integer hash, identical to the GLSL hash()
export function hash(x) {
  x >>>= 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16; return x >>> 0;
}
export const u01 = (x) => (hash(x) >>> 8) / 16777216;

// arc-length fraction s -> B-spline parameter t (see arclen.py)
const C = 5.510779, S0 = 0.0861059;
export function arcT(s) {
  if (s < S0) return Math.cbrt(Math.max(s, 0) / C);
  if (s > 1 - S0) return 1 - Math.cbrt(Math.max(1 - s, 0) / C);
  const x = s - 0.5, x2 = x * x;
  return 0.5 + x * (0.52318546 + x2 * (0.0844248 + x2 * 2.19156312));
}

// slot k on arc (o,d): position along the arc (arc-length fraction) and opacity weight
export function slotS(o, d, k, phase, still) {
  const g = (k * PHI + u01(o * N + d)) % 1;
  return still ? FADE + (1 - 2 * FADE) * g : (g + phase) % 1;
}
export const slotWeight = (people, k) => Math.min(Math.max(people / 100 - k, 0), 1);
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
export const endFade = (s) => smooth(0, FADE, s) * smooth(1, 1 - FADE, s);

// phase uniform: computed in double precision, never pass raw seconds to the GPU
export const phaseAt = (timeSec, still) => (still ? 0 : (((timeSec / PERIOD) % 1) + 1) % 1);

// counts texture data: R32F, width 47 (d), height 47*NY (row = yearIndex*47 + o)
export function countsTextureData(years, matrices) {
  const out = new Float32Array(N * N * years.length);
  years.forEach((y, yi) => out.set(matrices[String(y)], yi * N * N));
  return out;                              // DataTexture(out, 47, 47*NY, RedFormat, FloatType), internalFormat 'R32F'
}

// slots per arc = max over years of ceil(v/100)
export function slotBudget(years, matrices) {
  const per = new Uint16Array(N * N);
  for (const y of years) {
    const m = matrices[String(y)];
    for (let i = 0; i < N * N; i++) per[i] = Math.max(per[i], Math.ceil(m[i] / 100));
  }
  let total = 0; for (const v of per) total += v;
  return { per, total };                   // total = 26,206 for 2012-2025
}

// side of arc o->d: +1 above ground, -1 below, 0 not drawn (same rule as geometry/flows.js sideOf)
export function sideOf(o, d, sel /* Uint8Array(47) or null */) {
  if (o === d) return 0;
  if (!sel || !sel.some(Boolean)) return o > d ? 1 : -1;
  if (sel[o] === sel[d]) return 0;
  return sel[d] ? 1 : -1;
}

// Fill the slot buffer [below-ground slots | above-ground slots] for the current selection.
// out: Float32Array(total*3) (o, d, k). Returns draw ranges in vertices for the two Points objects.
export function orderSlots(per, sel, out) {
  let n = 0;
  for (const want of [-1, 1]) {
    for (let o = 0; o < N; o++) for (let d = 0; d < N; d++) {
      if (sideOf(o, d, sel) !== want) continue;
      const m = per[o * N + d];
      for (let k = 0; k < m; k++) { out[n * 3] = o; out[n * 3 + 1] = d; out[n * 3 + 2] = k; n++; }
    }
    if (want === -1) var belowCount = n;
  }
  return { below: { start: 0, count: belowCount }, above: { start: belowCount, count: n - belowCount } };
}
