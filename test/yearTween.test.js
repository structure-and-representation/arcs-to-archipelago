import { describe, expect, it } from 'vitest';
import { createYearTween } from '../src/scene/yearTween.js';

const make = (opts = {}) => {
  const calls = [];
  const renderer = { setYear: (a, b, mix) => calls.push([a, b, mix]) };
  const tw = createYearTween({ renderer, year: 2025, duration: 0.6, ease: (x) => x, ...opts });
  return { tw, calls, last: () => calls[calls.length - 1] };
};

describe('scene/yearTween.js(年の補間)', () => {
  it('はじめは (年, 年, 0)', () => {
    expect(make().last()).toEqual([2025, 2025, 0]);
  });

  it('前の年から次の年へ 0.6 秒で補間し、終わったら (次の年, 次の年, 0)', () => {
    const { tw, last } = make();
    tw.set(2014);
    expect(last()).toEqual([2025, 2014, 0]);
    tw.update(0.3);
    expect(last()[0]).toBe(2025);
    expect(last()[1]).toBe(2014);
    expect(last()[2]).toBeCloseTo(0.5, 10);
    tw.update(0.3);
    expect(last()).toEqual([2014, 2014, 0]);
    expect(tw.busy).toBe(false);
  });

  it('immediate のときは即座に切り替える', () => {
    const { tw, last } = make();
    tw.set(2019, { immediate: true });
    expect(last()).toEqual([2019, 2019, 0]);
  });

  it('補間の途中で次の年が来たら、見た目が近いほうの年から向かい直す', () => {
    const { tw, last } = make();
    tw.set(2014);
    tw.update(0.42); // 70% 進んで、2014 に近い
    tw.set(2020);
    expect(last()).toEqual([2014, 2020, 0]);
    tw.update(0.06);
    tw.set(2012); // 10% しか進んでいないので 2014 から
    expect(last()).toEqual([2014, 2012, 0]);
  });
});
