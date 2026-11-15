// 粒子の点の形(scene/particles.js の INK_DOT)を変えても、1 粒の墨の量(画素の不透明度の総和)が
// 従来の「1px の縁の真円」と同じであることを、シェーダと同じ式の数値積分で確かめる。
import { describe, expect, it } from 'vitest';
import { INK_DOT, dotInk } from '../src/scene/particles.js';

// シェーダ(PARTICLE_FRAG)と同じ式で、細かな格子の上で不透明度を足し合わせる(濃さ 1)
function integrate(size, dpr, { shaped }) {
  const soft = shaped ? INK_DOT.SOFT_BASE + INK_DOT.SOFT_DPR * dpr : 1;
  const eps = shaped ? INK_DOT.EPS : 0;
  const R0 = size / 2;
  const norm = shaped ? dotInk(size, 1, 0) / dotInk(size, soft, eps) : 1;
  const ext = R0 * (1 + eps) + soft;
  const step = 0.01;
  let sum = 0;
  const ph = [1.3, 4.1];
  for (let y = -ext; y <= ext; y += step) for (let x = -ext; x <= ext; x += step) {
    const r = Math.hypot(x, y), th = Math.atan2(y, x);
    const R = R0 * (1 + eps * (INK_DOT.W2 * Math.cos(2 * th + ph[0]) + INK_DOT.W3 * Math.cos(3 * th + ph[1])));
    sum += Math.min(1, Math.max(0, (R - r) / soft + 0.5)) * norm * step * step;
  }
  return sum;
}

describe('筆先の点の墨の量', () => {
  for (const [css, dpr] of [[2, 1], [2, 2], [2.2, 1], [2.2, 2], [1.8, 1], [1.8, 2], [2, 1.5]]) {
    it(`径 ${css} CSS px、DPR ${dpr} で、従来の真円との差が 0.5% 以内`, () => {
      const size = css * dpr;
      const before = integrate(size, dpr, { shaped: false });
      const after = integrate(size, dpr, { shaped: true });
      expect(Math.abs(after / before - 1)).toBeLessThan(0.005);
      // 解析式(dotInk)も、従来の真円の数値積分と合う
      expect(Math.abs(dotInk(size) / before - 1)).toBeLessThan(0.005);
    });
  }
  it('1 画素の濃さは粒子の濃さの上限を超えない(係数 ≦ 1)', () => {
    for (const size of [1.8, 2, 2.2, 3.6, 4, 4.4]) for (const dpr of [1, 2]) {
      expect(dotInk(size, 1, 0) / dotInk(size, INK_DOT.SOFT_BASE + INK_DOT.SOFT_DPR * dpr, INK_DOT.EPS)).toBeLessThanOrEqual(1);
    }
  });
});
