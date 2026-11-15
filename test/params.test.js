import { describe, expect, it } from 'vitest';
import { applyParams, parseParams, toSearch } from '../src/params.js';
import { DEFAULT_STATE, createStore } from '../src/state.js';

const roundTrip = (state, opts) => {
  const { patch, still } = parseParams(toSearch(state, opts));
  return { state: { ...DEFAULT_STATE, ...patch }, still };
};

describe('parseParams', () => {
  it('仕様の例を読める', () => {
    const { patch, still } = parseParams('?year=2014&ch=0&sel=13&cam=side&morph=0&theme=ink&lang=en&still=1');
    expect(patch).toEqual({
      year: 2014, chapter: 0, selection: { type: 'pref', code: 13 }, camera: 'side', morph: 0, theme: 'ink', lang: 'en',
    });
    expect(still).toBe(true);
  });

  it('sel は都道府県コードか圏の名前', () => {
    expect(parseParams('sel=tokyo').patch.selection).toEqual({ type: 'metro', id: 'tokyo' });
    expect(parseParams('sel=osaka').patch.selection).toEqual({ type: 'metro', id: 'osaka' });
    expect(parseParams('sel=47').patch.selection).toEqual({ type: 'pref', code: 47 });
  });

  it('不正な値は無視する', () => {
    const { patch, still } = parseParams('year=1999&ch=9&sel=99&cam=back&morph=abc&theme=red&lang=fr&still=0');
    expect(patch).toEqual({});
    expect(still).toBe(false);
    expect(parseParams('sel=nowhere').patch).toEqual({});
  });

  it('morph は 0〜1 に丸める', () => {
    expect(parseParams('morph=3').patch.morph).toBe(1);
    expect(parseParams('morph=-1').patch.morph).toBe(0);
  });

  it('cam だけが指定されたとき、morph はその定位置の値になる', () => {
    expect(parseParams('cam=top').patch.morph).toBe(1);
    expect(parseParams('cam=oblique').patch.morph).toBe(1);
    expect(parseParams('cam=side').patch.morph).toBe(0);
    expect(parseParams('cam=top&morph=0.4').patch.morph).toBe(0.4);
  });
});

describe('URL と state の往復', () => {
  const states = [
    {},
    { year: 2014, chapter: 3, selection: { type: 'pref', code: 27 }, theme: 'ink', lang: 'en' },
    { selection: { type: 'metro', id: 'nagoya' }, camera: 'oblique', morph: 1 },
    { camera: 'top', morph: 1 },
    { camera: 'top', morph: 0.4 },
    { camera: 'side', morph: 0.25 },
    { camera: 'side', morph: 1 },
    { year: 2012, camera: 'oblique', morph: 0 },
  ];
  for (const s of states) {
    it(JSON.stringify(s), () => {
      const state = { ...DEFAULT_STATE, ...s };
      expect(roundTrip(state).state).toEqual(state);
    });
  }

  it('既定値は URL に出さない', () => {
    expect(toSearch(DEFAULT_STATE)).toBe('');
  });

  it('still は state に入れず、URL にだけ出る', () => {
    expect(toSearch(DEFAULT_STATE, { still: true })).toBe('still=1');
    expect(roundTrip(DEFAULT_STATE, { still: true }).still).toBe(true);
  });

  it('hover と reducedMotion は URL に出ない', () => {
    const state = { ...DEFAULT_STATE, hover: { type: 'pref', code: 1 }, reducedMotion: true };
    expect(toSearch(state)).toBe('');
  });

  it('applyParams は store に反映して still を返す', () => {
    const store = createStore();
    expect(applyParams(store, '?year=2013&sel=tokyo&still=1')).toBe(true);
    expect(store.get().year).toBe(2013);
    expect(store.get().selection).toEqual({ type: 'metro', id: 'tokyo' });
  });
});
