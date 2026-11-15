import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { arcPoint, arcTangent } from '../src/geometry/arc.js';
import { CX, H, K, STEP, W } from '../src/geometry/constants.js';
import { lineLayout } from '../src/geometry/layout.js';

// 原作が使った d3 v3 の basis 補間(devDependency の d3@3.5.17)
const d3 = createRequire(import.meta.url)('d3');
const line = lineLayout();

// 原作 d3.layout.arcDiagram.arc と同じ式で、[A, M, B] の3点(SVG 座標)を作る
function originalPoints(s, t) {
  const sx = s * STEP, tx = t * STEP;
  const midX = (sx + tx) / 2;
  const midPercent = Math.abs((sx - tx) / W);
  const midY = sx > tx ? H - midPercent * H : H + midPercent * H;
  return [[sx, H], [midX, midY], [tx, H]];
}
const toWorld = ([x, y]) => [x - CX, H - y]; // SVG → ワールド(x, y)

// d3 の path 文字列を、M / L / C / C / L の5片に分解する
function parsePath(d) {
  const tokens = d.match(/[MLC][^MLC]*/g).map((s) => ({ cmd: s[0], n: s.slice(1).split(/[ ,]/).filter(Boolean).map(Number) }));
  return tokens;
}
const bez = (p0, p1, p2, p3, f) => {
  const a = 1 - f;
  return [0, 1].map((k) => a ** 3 * p0[k] + 3 * a * a * f * p1[k] + 3 * a * f * f * p2[k] + f ** 3 * p3[k]);
};

describe('arcPoint(morph = 0, lean = 0) は原作の d3 v3 basis 補間と同じ曲線', () => {
  const cases = [[0, 46], [46, 0], [12, 26], [26, 12], [22, 23], [5, 40]];
  for (const [s, t] of cases) {
    it(`${s} → ${t}`, () => {
      const pts = originalPoints(s, t);
      const toks = parsePath(d3.svg.line().interpolate('basis')(pts));
      expect(toks.map((k) => k.cmd).join('')).toBe('MLCCL');
      const A = line[s], B = line[t];
      const side = s > t ? 1 : -1;
      const at = (tt) => arcPoint(A, B, side, 0, tt);

      // 3次の2片(区間 1, 2)は、パラメータまで一致する
      let cur = toWorld(toks[1].n);
      for (const [j, tok] of [[1, toks[2]], [2, toks[3]]]) {
        const p0 = cur;
        const p1 = toWorld(tok.n.slice(0, 2)), p2 = toWorld(tok.n.slice(2, 4)), p3 = toWorld(tok.n.slice(4, 6));
        for (let k = 0; k <= 10; k++) {
          const f = k / 10;
          const want = bez(p0, p1, p2, p3, f);
          const got = at((j + f) / 4);
          expect(got[0]).toBeCloseTo(want[0], 6);
          expect(got[1]).toBeCloseTo(want[1], 6);
          expect(got[2]).toBeCloseTo(0, 9); // 同じ平面(z = 0)
        }
        cur = p3;
      }
      // 直線の2片(区間 0, 3)は、同じ線分の上にある(速さは違ってよい)
      const segs = [
        [toWorld(toks[0].n), toWorld(toks[1].n), 0],
        [toWorld(toks[3].n.slice(4, 6)), toWorld(toks[4].n), 3],
      ];
      for (const [p, q, j] of segs) {
        for (let k = 0; k <= 10; k++) {
          const g = at((j + k / 10) / 4);
          const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
          const cross = ((g[0] - p[0]) * (q[1] - p[1]) - (g[1] - p[1]) * (q[0] - p[0])) / len;
          expect(Math.abs(cross)).toBeLessThan(1e-6);
        }
      }
      // 端点
      const first = at(0), last = at(1);
      expect(first[0]).toBeCloseTo(A[0], 6);
      expect(first[1]).toBeCloseTo(0, 9);
      expect(last[0]).toBeCloseTo(B[0], 3);
      expect(last[1]).toBeCloseTo(0, 3);
    });
  }
});

describe('arcPoint の性質', () => {
  const A = [-100, 20], B = [300, -80];
  const ts = Array.from({ length: 21 }, (_, k) => k / 20);

  it('side を反転すると y の符号だけが変わる', () => {
    for (const lean of [0, 0.5, 0.9]) {
      for (const t of ts) {
        const p = arcPoint(A, B, 1, lean, t), q = arcPoint(A, B, -1, lean, t);
        expect(q[0]).toBeCloseTo(p[0], 9);
        expect(q[2]).toBeCloseTo(p[2], 9);
        expect(q[1]).toBeCloseTo(-p[1], 9);
      }
    }
  });

  it('弧の最高点の高さは端点間の距離に比例する(lean = 0)', () => {
    const peak = (a, b) => Math.max(...Array.from({ length: 401 }, (_, k) => arcPoint(a, b, 1, 0, k / 400)[1]));
    const d1 = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const h1 = peak(A, B);
    expect(h1).toBeCloseTo((2 / 3) * K * d1, 3); // 中央(t = 0.5)で (A + 4M + B) / 6 の高さ
    // 距離を 2.5 倍(向きも変える)にすると高さも 2.5 倍
    const A2 = [0, 0], B2 = [d1 * 2.5, 0];
    expect(peak(A2, B2) / h1).toBeCloseTo(2.5, 3);
  });

  it('lean は弧を弦に垂直な水平方向へ倒す(弦が x 軸のとき z 方向)', () => {
    const P = [0, 0], Q = [400, 0];
    const mid = arcPoint(P, Q, 1, Math.PI / 2, 0.5);
    expect(mid[1]).toBeCloseTo(0, 6);
    expect(Math.abs(mid[2])).toBeGreaterThan(10);
    const mid0 = arcPoint(P, Q, 1, 0, 0.5);
    expect(mid0[2]).toBeCloseTo(0, 9);
  });

  it('同じ位置の2点でも NaN にならない', () => {
    const p = arcPoint([5, 5], [5, 5], 1, 0.3, 0.5);
    expect(p.every(Number.isFinite)).toBe(true);
  });

  it('out に書き込み、同じ配列を返す', () => {
    const out = [0, 0, 0];
    expect(arcPoint(A, B, 1, 0, 0.3, out)).toBe(out);
    expect(arcTangent(A, B, 1, 0, 0.3, out)).toBe(out);
  });
});

describe('arcTangent', () => {
  const A = [-200, 0], B = [250, 100];
  it('単位長で、数値微分の向きと一致する(端点を含む)', () => {
    for (const lean of [0, 0.7]) {
      for (const t of [0, 0.1, 0.25, 0.5, 0.8, 1]) {
        const tg = arcTangent(A, B, 1, lean, t);
        expect(Math.hypot(...tg)).toBeCloseTo(1, 9);
        const e = 1e-3;
        const p = arcPoint(A, B, 1, lean, Math.max(t - e, 0)), q = arcPoint(A, B, 1, lean, Math.min(t + e, 1));
        const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        const dot = ((q[0] - p[0]) * tg[0] + (q[1] - p[1]) * tg[1] + (q[2] - p[2]) * tg[2]) / len;
        expect(dot).toBeGreaterThan(0.99);
      }
    }
  });
});
