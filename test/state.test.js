import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE, createStore } from '../src/state.js';

describe('createStore', () => {
  it('get は既定値に initial を重ねた値を返す', () => {
    const s = createStore({ year: 2014 });
    expect(s.get()).toEqual({ ...DEFAULT_STATE, year: 2014 });
  });

  it('set は変わったキーだけを通知し、変化がなければ通知しない', () => {
    const s = createStore();
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ year: 2013, chapter: 0 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][1]).toEqual(['year']);
    s.set({ year: 2013 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('同じ中身の selection は変化とみなさない', () => {
    const s = createStore({ selection: { type: 'pref', code: 13 } });
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ selection: { type: 'pref', code: 13 } });
    expect(fn).not.toHaveBeenCalled();
    s.set({ selection: { type: 'metro', id: 'tokyo' } });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('get は不変のスナップショット(set のたびに新しい)', () => {
    const s = createStore();
    const a = s.get();
    s.set({ year: 2013 });
    expect(s.get()).not.toBe(a);
    expect(a.year).toBe(DEFAULT_STATE.year);
  });

  it('subscribe は購読解除の関数を返す', () => {
    const s = createStore();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    off();
    s.set({ year: 2013 });
    expect(fn).not.toHaveBeenCalled();
  });
});
