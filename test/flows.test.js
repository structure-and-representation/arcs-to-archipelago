import { describe, expect, it } from 'vitest';
import { METRO_CODES } from '../src/geometry/constants.js';
import { arcList, particleCount, selectionMask, sideOf } from '../src/geometry/flows.js';

const idx = (code) => code - 1;

describe('sideOf', () => {
  it('選択なし: 移動前の添字が移動後より大きい流れ(南から北)が +1、逆が -1(原作と同じ)', () => {
    expect(sideOf(26, 12, null)).toBe(1); // 大阪 → 東京(添字は大きい方 → 小さい方)
    expect(sideOf(12, 26, null)).toBe(-1);
    expect(sideOf(5, 5, null)).toBe(0);
  });

  it('都道府県の選択: 転入が +1、転出が -1、内部と無関係は 0', () => {
    const sel = { type: 'pref', code: 13 }; // 東京
    const tokyo = idx(13), osaka = idx(27), aichi = idx(23), hokkaido = 0;
    expect(sideOf(osaka, tokyo, sel)).toBe(1);
    expect(sideOf(hokkaido, tokyo, sel)).toBe(1);
    expect(sideOf(tokyo, osaka, sel)).toBe(-1);
    expect(sideOf(tokyo, hokkaido, sel)).toBe(-1);
    expect(sideOf(osaka, aichi, sel)).toBe(0);
    expect(sideOf(tokyo, tokyo, sel)).toBe(0);
  });

  it('圏の選択: 圏への転入が +1、圏からの転出が -1、圏の内部と無関係は 0', () => {
    const sel = { type: 'metro', id: 'tokyo' };
    const [saitama, chiba, tokyo, kanagawa] = [11, 12, 13, 14].map(idx);
    const osaka = idx(27), aichi = idx(23);
    expect(sideOf(osaka, tokyo, sel)).toBe(1);
    expect(sideOf(tokyo, osaka, sel)).toBe(-1);
    expect(sideOf(aichi, kanagawa, sel)).toBe(1);
    expect(sideOf(saitama, chiba, sel)).toBe(0);
    expect(sideOf(kanagawa, tokyo, sel)).toBe(0);
    expect(sideOf(osaka, aichi, sel)).toBe(0);
  });

  it('3つの圏のどれも、構成の都道府県が設計どおり', () => {
    expect(METRO_CODES.tokyo).toEqual([11, 12, 13, 14]);
    expect(METRO_CODES.nagoya).toEqual([21, 23, 24]);
    expect(METRO_CODES.osaka).toEqual([26, 27, 28, 29]);
  });
});

describe('selectionMask', () => {
  it('選択なし・都道府県・圏', () => {
    expect([...selectionMask(null)].reduce((a, b) => a + b, 0)).toBe(0);
    const p = selectionMask({ type: 'pref', code: 1 });
    expect(p[0]).toBe(1);
    expect([...p].reduce((a, b) => a + b, 0)).toBe(1);
    const m = selectionMask({ type: 'metro', id: 'nagoya' });
    expect([...m].map((v, i) => (v ? i + 1 : 0)).filter(Boolean)).toEqual([21, 23, 24]);
  });
});

describe('particleCount', () => {
  it('0 人で 0、1〜100 人で 1、101 人で 2', () => {
    expect(particleCount(0)).toBe(0);
    expect(particleCount(1)).toBe(1);
    expect(particleCount(99)).toBe(1);
    expect(particleCount(100)).toBe(1);
    expect(particleCount(101)).toBe(2);
    expect(particleCount(200)).toBe(2);
    expect(particleCount(201)).toBe(3);
    expect(particleCount(10000)).toBe(100);
  });
});

describe('arcList', () => {
  const list = arcList();

  it('47 × 46 = 2162 組を、o の昇順、その中で d の昇順に並べる', () => {
    expect(list.length).toBe(2162);
    expect(list.o).toHaveLength(2162);
    let k = 0;
    for (let o = 0; o < 47; o++) {
      for (let d = 0; d < 47; d++) {
        if (o === d) continue;
        expect(list.pair(k)).toEqual([o, d]);
        k++;
      }
    }
    expect(k).toBe(2162);
  });

  it('添字 → 組 → 添字 と 組 → 添字 → 組 が往復する', () => {
    for (let k = 0; k < list.length; k++) {
      const [o, d] = list.pair(k);
      expect(list.indexOf(o, d)).toBe(k);
    }
    for (let o = 0; o < 47; o++) {
      for (let d = 0; d < 47; d++) {
        if (o === d) expect(list.indexOf(o, d)).toBe(-1);
        else expect(list.pair(list.indexOf(o, d))).toEqual([o, d]);
      }
    }
  });

  it('範囲外や整数でない値は -1、cell は行列の添字 o * 47 + d', () => {
    expect(list.indexOf(-1, 3)).toBe(-1);
    expect(list.indexOf(3, 47)).toBe(-1);
    expect(list.indexOf(1.5, 2)).toBe(-1);
    expect(list.cell(list.indexOf(12, 26))).toBe(12 * 47 + 26);
    expect(list.cell(0)).toBe(1);
    expect(list.cell(2161)).toBe(46 * 47 + 45);
  });

  it('同じオブジェクトを返す(共有される)', () => {
    expect(arcList()).toBe(list);
  });
});
