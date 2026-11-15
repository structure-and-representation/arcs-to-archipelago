import { describe, expect, it } from 'vitest';
import { DICT } from '../src/i18n.js';
import { directionKeys, heightKey } from '../src/ui/legend.js';

const metro = { type: 'metro', id: 'tokyo' };

describe('凡例の向きの文言を選ぶ', () => {
  it('地域を選んでいないとき、真横は横長用と縦画面用で変わる', () => {
    expect(directionKeys(null, 'side', false)).toEqual({ up: 'legend.none.landscape.up', down: 'legend.none.landscape.down', hint: null });
    expect(directionKeys(null, 'side', true)).toEqual({ up: 'legend.none.portrait.up', down: 'legend.none.portrait.down', hint: null });
  });

  it('地域を選んでいないとき、真横以外(斜め俯瞰・真上)は「地上は北上、地下は南下」', () => {
    for (const camera of ['oblique', 'top']) {
      for (const portrait of [false, true]) {
        expect(directionKeys(null, camera, portrait)).toEqual({ up: 'legend.none.map.up', down: 'legend.none.map.down', hint: null });
      }
    }
    expect(DICT.ja['legend.none.map.up']).toBe('地上の弧は、北上する移動');
    expect(DICT.ja['legend.none.map.down']).toBe('地下の弧は、南下する移動');
  });

  it('地域を選んでいるとき、カメラと画面の向きに依らず「転入・転出」と補足', () => {
    for (const camera of ['side', 'oblique', 'top']) {
      for (const portrait of [false, true]) {
        expect(directionKeys(metro, camera, portrait)).toEqual({ up: 'legend.selected.in', down: 'legend.selected.out', hint: 'legend.selected.hint' });
      }
    }
  });

  it('選んだキーがすべて辞書にあり、確定稿(strings.md)の文言どおり', () => {
    const used = new Set();
    for (const sel of [null, metro]) for (const cam of ['side', 'oblique', 'top']) for (const p of [false, true]) {
      const k = directionKeys(sel, cam, p);
      [k.up, k.down, k.hint].filter(Boolean).forEach((x) => used.add(x));
    }
    for (const key of [...used, 'legend.particle', 'legend.height.side', 'legend.height.map', 'legend.encoding', 'legend.label']) {
      expect(DICT.ja[key], key).toBeTruthy();
      expect(DICT.en[key], key).toBeTruthy();
    }
    expect(DICT.ja['legend.particle']).toBe('1粒は100人');
    expect(DICT.ja['legend.selected.in']).toBe('地上の弧は、{region}への転入');
    expect(DICT.en['legend.selected.out']).toBe('Arcs below ground: moves out of {region}');
    expect(DICT.ja['legend.none.portrait.up']).toBe('線より右は、北へ向かう移動');
  });

  it('和文の凡例に、半角のコロン・等号を使わない(字間が詰まる)', () => {
    for (const [key, text] of Object.entries(DICT.ja)) {
      if (key.startsWith('legend.')) expect(text, key).not.toMatch(/[:=]/);
    }
  });

  it('弧の高さの意味は、真横では並び順の隔たり、地図の上(斜め俯瞰・真上)では県庁所在地間の距離', () => {
    expect(heightKey('side')).toBe('legend.height.side');
    expect(heightKey('oblique')).toBe('legend.height.map');
    expect(heightKey('top')).toBe('legend.height.map');
    expect(DICT.ja['legend.height.side']).toBe('弧の高さは、並び順の隔たり');
    expect(DICT.ja['legend.height.map']).toBe('弧の高さは、県庁所在地間の距離');
    expect(DICT.en['legend.height.side']).not.toBe(DICT.en['legend.height.map']);
  });
});
