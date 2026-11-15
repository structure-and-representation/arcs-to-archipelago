import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { arcPoint } from '../src/geometry/arc.js';
import { selectionMask, sideOf } from '../src/geometry/flows.js';
import {
  FADE,
  PHI,
  arcT,
  countsTextureData,
  endFade,
  hash,
  orderSlots,
  phaseAt,
  sideOfMask,
  slotBudget,
  slotS,
  slotWeight,
  u01,
} from '../src/geometry/particles.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const od = JSON.parse(readFileSync(resolve(root, 'public/data/od.json'), 'utf8'));
const years = od.years;
const matrixOf = (y) => od.matrices[String(y)];
const { per, total } = slotBudget(years, matrixOf);

describe('枠の予算', () => {
  it('全年の ceil(v/100) の最大の合計が 26,206、弧ごとの最大が 887(東京→神奈川)', () => {
    expect(years[0]).toBe(2012);
    expect(years[years.length - 1]).toBe(2025);
    expect(total).toBe(26206);
    let mx = 0, at = -1;
    per.forEach((v, i) => {
      if (v > mx) { mx = v; at = i; }
    });
    expect(mx).toBe(887);
    expect(at).toBe(12 * 47 + 13);
  });

  it('対角は 0 枠、それ以外の弧はすべて 1 枠以上', () => {
    for (let o = 0; o < 47; o++) for (let d = 0; d < 47; d++) {
      if (o === d) expect(per[o * 47 + d]).toBe(0);
      else expect(per[o * 47 + d]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('人数テクスチャ', () => {
  it('texel (d, 年の添字 * 47 + o) が o → d の人数で、R32F で正確に表せる', () => {
    const tex = countsTextureData(years, matrixOf);
    expect(tex.length).toBe(47 * 47 * years.length);
    years.forEach((y, yi) => {
      const m = matrixOf(y);
      for (const [o, d] of [[12, 13], [0, 12], [46, 26], [26, 12]]) {
        expect(tex[(yi * 47 + o) * 47 + d]).toBe(m[o * 47 + d]);
      }
    });
    let mx = 0;
    for (const v of tex) mx = Math.max(mx, v);
    expect(mx).toBeLessThan(2 ** 24);
  });
});

describe('不透明度の重みの総和 = 人数 / 100', () => {
  const sumW = (v, n) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += slotWeight(v, k);
    return s;
  };

  it('各年・各弧で一致する', () => {
    let worst = 0;
    for (const y of years) {
      const m = matrixOf(y);
      for (let i = 0; i < 2209; i++) worst = Math.max(worst, Math.abs(sumW(m[i], per[i]) - m[i] / 100));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('隣り合う年、離れた年の補間の途中でも一致する', () => {
    const mixes = [0, 0.1, 0.37, 0.5, 0.83, 1];
    const pairs = [];
    for (let i = 0; i + 1 < years.length; i++) pairs.push([years[i], years[i + 1]]);
    pairs.push([2012, 2025], [2025, 2015]);
    let worst = 0;
    for (const [ya, yb] of pairs) {
      const a = matrixOf(ya), b = matrixOf(yb);
      for (let i = 0; i < 2209; i++) for (const t of mixes) {
        const v = a[i] * (1 - t) + b[i] * t;
        worst = Math.max(worst, Math.abs(sumW(v, per[i]) - v / 100));
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('arcT(弧の長さの割合 → 媒介変数)', () => {
  it('単調で、arcT(0)=0、arcT(0.5)=0.5、arcT(1)=1', () => {
    let prev = -1;
    for (let i = 0; i <= 10000; i++) {
      const t = arcT(i / 10000);
      expect(t).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = t;
    }
    expect(arcT(0)).toBe(0);
    expect(arcT(0.5)).toBeCloseTo(0.5, 12);
    expect(arcT(1)).toBeCloseTo(1, 12);
  });

  it('ランダムな弧で、arcPoint(arcT(s)) までの弧の長さの割合と s の差が 0.002 以下', () => {
    let seed = 1;
    const rnd = () => (seed = hash(seed + 0x9e3779b9)) / 2 ** 32;
    const STEPS = 4000;
    const p = [0, 0, 0], q = [0, 0, 0];
    let worst = 0;
    for (let trial = 0; trial < 40; trial++) {
      const A = [rnd() * 1200 - 600, rnd() * 600 - 300];
      const B = [rnd() * 1200 - 600, rnd() * 600 - 300];
      const side = rnd() < 0.5 ? -1 : 1;
      const lean = rnd() * 0.9;
      // 弧の長さの累積(t を細かく刻む)
      const cum = new Float64Array(STEPS + 1);
      arcPoint(A, B, side, lean, 0, p);
      for (let i = 1; i <= STEPS; i++) {
        arcPoint(A, B, side, lean, i / STEPS, q);
        cum[i] = cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        p[0] = q[0]; p[1] = q[1]; p[2] = q[2];
      }
      const L = cum[STEPS];
      for (let j = 0; j <= 200; j++) {
        const s = j / 200;
        const t = arcT(s);
        const x = t * STEPS, i0 = Math.min(Math.floor(x), STEPS - 1), fr = x - i0;
        const frac = (cum[i0] + (cum[i0 + 1] - cum[i0]) * fr) / L;
        worst = Math.max(worst, Math.abs(frac - s));
      }
    }
    expect(worst).toBeLessThanOrEqual(0.002);
  });
});

describe('位相と配置', () => {
  it('ハッシュの固定値(GLSL の lowbias32 と同じ)', () => {
    expect(hash(0)).toBe(0);
    expect(hash(1)).toBe(1753845952);
    expect(hash(2)).toBe(3507691905);
    expect(hash(3)).toBe(1408362973);
    for (let i = 0; i < 1000; i++) {
      const v = u01(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('黄金比の並び: 隙間の比が 2.63 以下で、新しい枠が最大の隙間に入る', () => {
    let ratio = 0, inLargest = 0, tries = 0;
    for (let n = 2; n < 900; n++) {
      const p = Array.from({ length: n }, (_, k) => (k * PHI) % 1).sort((x, y) => x - y);
      const gaps = p.map((x, i) => (i + 1 < n ? p[i + 1] - x : 1 - x + p[0]));
      const gmax = Math.max(...gaps);
      ratio = Math.max(ratio, gmax / Math.min(...gaps));
      const x = (n * PHI) % 1;
      let i = p.findIndex((v) => v > x);
      if (i < 0) i = n;
      const g = i > 0 && i < n ? p[i] - p[i - 1] : 1 - p[n - 1] + p[0];
      tries++;
      if (Math.abs(g - gmax) < 1e-9) inLargest++;
    }
    expect(ratio).toBeLessThanOrEqual(2.63);
    expect(inLargest).toBe(tries);
  });

  it('静止の配置はすべて [0.04, 0.96] に入り、端の薄めでインクが減らない', () => {
    for (let o = 0; o < 47; o++) for (let d = 0; d < 47; d++) {
      for (let k = 0; k < per[o * 47 + d]; k++) {
        const s = slotS(o, d, k, 0, true);
        expect(s).toBeGreaterThanOrEqual(FADE);
        expect(s).toBeLessThanOrEqual(1 - FADE);
        expect(endFade(s)).toBe(1);
      }
    }
  });

  it('phaseAt は [0, 1) に入り、still では 0', () => {
    for (const t of [0, 0.5, 3, 13.999, 14, 27, 1e6 + 0.3, -3]) {
      const ph = phaseAt(t, false);
      expect(ph).toBeGreaterThanOrEqual(0);
      expect(ph).toBeLessThan(1);
      expect(phaseAt(t, true)).toBe(0);
    }
    expect(phaseAt(7, false)).toBeCloseTo(0.5, 12);
  });
});

describe('地上と地下の振り分け(orderSlots)', () => {
  const buf = new Float32Array(total * 3);

  const checkRanges = (mask, r, selection) => {
    for (const [range, want] of [[r.below, -1], [r.above, 1]]) {
      for (let v = range.start; v < range.start + range.count; v++) {
        const o = buf[v * 3], d = buf[v * 3 + 1];
        expect(sideOfMask(o, d, mask)).toBe(want);
        expect(sideOf(o, d, selection)).toBe(want); // geometry/flows.js と同じ規則
      }
    }
  };

  it('全国表示: 地下 12,803 + 地上 13,403', () => {
    const r = orderSlots(per, null, buf);
    expect(r.below).toEqual({ start: 0, count: 12803 });
    expect(r.above).toEqual({ start: 12803, count: 13403 });
    checkRanges(null, r, null);
  });

  it('東京圏の選択: 地下 4,106 + 地上 5,189(圏の内部と無関係の弧は除く)', () => {
    const selection = { type: 'metro', id: 'tokyo' };
    const mask = selectionMask(selection);
    const r = orderSlots(per, mask, buf);
    expect(r.below.count).toBe(4106);
    expect(r.above.count).toBe(5189);
    expect(r.above.start).toBe(4106);
    checkRanges(mask, r, selection);
  });

  it('都道府県の選択でも、範囲の中の弧がすべて正しい側にある', () => {
    for (const code of [1, 13, 27, 47]) {
      const selection = { type: 'pref', code };
      const mask = selectionMask(selection);
      const r = orderSlots(per, mask, buf);
      checkRanges(mask, r, selection);
      // 選択した県に関わる枠をすべて含む
      let want = 0;
      for (let j = 0; j < 47; j++) if (j !== code - 1) want += per[(code - 1) * 47 + j] + per[j * 47 + code - 1];
      expect(r.below.count + r.above.count).toBe(want);
    }
  });

  it('枠の中の k は弧ごとに 0 から連番', () => {
    orderSlots(per, null, buf);
    let prev = null;
    for (let v = 0; v < total; v++) {
      const o = buf[v * 3], d = buf[v * 3 + 1], k = buf[v * 3 + 2];
      if (prev && prev[0] === o && prev[1] === d) expect(k).toBe(prev[2] + 1);
      else expect(k).toBe(0);
      prev = [o, d, k];
    }
  });
});
