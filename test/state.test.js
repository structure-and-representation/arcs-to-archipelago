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

describe('createStore の通知の順序', () => {
  it('購読関数の中で set しても、どの購読関数も set された順に通知を受け取る', () => {
    const s = createStore();
    const log = [];
    // 章の切り替えのように、chapter が変わったら年・選択・カメラを書く購読関数
    s.subscribe((st, keys) => {
      log.push(['A', keys.join(','), st.year]);
      if (keys.includes('chapter')) s.set({ year: 2019, camera: 'oblique' });
    });
    s.subscribe((st, keys) => log.push(['B', keys.join(','), st.year]));
    s.set({ chapter: 1 });
    expect(log).toEqual([
      ['A', 'chapter', 2025],
      ['B', 'chapter', 2025],
      ['A', 'year,camera', 2019],
      ['B', 'year,camera', 2019],
    ]);
    expect(s.get()).toMatchObject({ chapter: 1, year: 2019, camera: 'oblique' });
  });

  it('通知の途中で購読を解除された関数には、それ以降の通知を配らない', () => {
    const s = createStore();
    const b = vi.fn();
    let offB;
    s.subscribe(() => offB());
    offB = s.subscribe(b);
    s.set({ year: 2014 });
    expect(b).not.toHaveBeenCalled();
  });

  it('購読関数が例外を投げても、次の set は通知される', () => {
    const s = createStore();
    const fn = vi.fn(() => {
      throw new Error('x');
    });
    s.subscribe(fn);
    expect(() => s.set({ year: 2014 })).toThrow('x');
    expect(() => s.set({ year: 2015 })).toThrow('x');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('createStore: 購読関数の例外', () => {
  it('ある購読関数が例外を投げても、ほかの購読関数と、その中で積まれた通知は配られる', () => {
    const s = createStore();
    const got = [];
    s.subscribe((st, keys) => {
      if (keys.includes('camera')) s.set({ morph: 1 });
    });
    s.subscribe(() => {
      throw new Error('ui');
    });
    s.subscribe((st, keys) => got.push(keys.join(',')));
    expect(() => s.set({ camera: 'oblique' })).toThrow('ui');
    expect(got).toEqual(['camera', 'morph']);
    expect(s.get().morph).toBe(1);
  });
});

