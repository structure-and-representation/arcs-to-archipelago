import { describe, expect, it } from 'vitest';
import { chapters as COPY } from '../docs/copy/chapters.js';
import { CHAPTERS, isValidStep, toStateSelection } from '../src/content/chapters.js';
import { DICT } from '../src/i18n.js';
import { ANCHOR, locate, sceneToPatch } from '../src/ui/chapters.js';

describe('章の定義', () => {
  it('5章で、各章の場面の年・選択・カメラが有効な値', () => {
    expect(CHAPTERS).toHaveLength(5);
    for (const ch of CHAPTERS) {
      expect(ch.steps.length).toBeGreaterThan(0);
      for (const s of ch.steps) expect(isValidStep(s), `${ch.id}: ${JSON.stringify(s)}`).toBe(true);
    }
  });

  it('場面の選択は、都道府県コードを数値にした state の形', () => {
    expect(toStateSelection(null)).toBeNull();
    expect(toStateSelection({ type: 'metro', id: 'osaka' })).toEqual({ type: 'metro', id: 'osaka' });
    expect(toStateSelection({ type: 'pref', code: '01' })).toEqual({ type: 'pref', code: 1 });
    expect(toStateSelection({ type: 'pref', code: '47' })).toEqual({ type: 'pref', code: 47 });
    expect(isValidStep({ year: 2014, selection: { type: 'pref', code: '13' }, camera: 'side' })).toBe(false); // 文字列のコードは state に入れない
    expect(isValidStep({ year: 2011, selection: null, camera: 'side' })).toBe(false);
    expect(isValidStep({ year: 2014, selection: null, camera: 'front' })).toBe(false);
  });

  it('確定稿(docs/copy/chapters.js)と、文言・場面・順序が一致する', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(COPY.map((c) => c.id));
    COPY.forEach((copy, i) => {
      const ch = CHAPTERS[i];
      for (const lang of ['ja', 'en']) {
        expect(DICT[lang][ch.heading], `${copy.id} heading ${lang}`).toBe(copy.heading[lang]);
        expect(DICT[lang][ch.body], `${copy.id} body ${lang}`).toBe(copy.body[lang]);
        if (copy.bodyPortrait) expect(DICT[lang][ch.bodyPortrait], `${copy.id} portrait ${lang}`).toBe(copy.bodyPortrait[lang]);
        if (copy.note) expect(DICT[lang][ch.note], `${copy.id} note ${lang}`).toBe(copy.note[lang]);
      }
      expect(Boolean(ch.bodyPortrait)).toBe(Boolean(copy.bodyPortrait));
      expect(Boolean(ch.note)).toBe(Boolean(copy.note));
      expect(ch.steps).toEqual(copy.steps.map((s) => ({ year: s.year, selection: toStateSelection(s.selection), camera: s.camera })));
    });
  });

  it('目次の章名は仕様どおり', () => {
    expect(CHAPTERS.map((c) => DICT.ja[c.name])).toEqual(['全国', '東京一極', '大阪圏', '名古屋圏', '自由探索']);
    expect(CHAPTERS.map((c) => DICT.en[c.name])).toEqual(['Japan', 'Tokyo', 'Osaka', 'Nagoya', 'Explore']);
  });

  it('自由探索は最後の 1 場面だけ', () => {
    expect(CHAPTERS.filter((c) => c.explore).map((c) => c.id)).toEqual(['explore']);
    expect(CHAPTERS[4].steps).toHaveLength(1);
  });
});

describe('locate: スクロールの位置から章と場面を求める', () => {
  // 画面の高さ 1000 として、3 場面の章は 2100(場面ごと 700)、自由探索は 1000
  const sections = [
    { top: 0, height: 2100, steps: 3 },
    { top: 2100, height: 2100, steps: 3 },
    { top: 4200, height: 2100, steps: 3 },
    { top: 6300, height: 2100, steps: 3 },
    { top: 8400, height: 1000, steps: 1 },
  ];

  it('章の中は高さを場面の数で等分する(境の位置は次の場面に入る)', () => {
    expect(locate(0, sections)).toEqual({ chapter: 0, step: 0 });
    expect(locate(699, sections)).toEqual({ chapter: 0, step: 0 });
    expect(locate(700, sections)).toEqual({ chapter: 0, step: 1 });
    expect(locate(1399, sections)).toEqual({ chapter: 0, step: 1 });
    expect(locate(1400, sections)).toEqual({ chapter: 0, step: 2 });
    expect(locate(2099, sections)).toEqual({ chapter: 0, step: 2 });
  });

  it('章の境をまたぐと、次の章の 0 場面になる', () => {
    expect(locate(2100, sections)).toEqual({ chapter: 1, step: 0 });
    expect(locate(2800, sections)).toEqual({ chapter: 1, step: 1 });
    expect(locate(8399, sections)).toEqual({ chapter: 3, step: 2 });
    expect(locate(8400, sections)).toEqual({ chapter: 4, step: 0 });
  });

  it('先頭より上は 0 章 0 場面、最後の章より下は最後の章の最後の場面', () => {
    expect(locate(-50, sections)).toEqual({ chapter: 0, step: 0 });
    expect(locate(9400, sections)).toEqual({ chapter: 4, step: 0 });
    expect(locate(99999, sections)).toEqual({ chapter: 4, step: 0 });
    const last3 = [{ top: 0, height: 900, steps: 3 }];
    expect(locate(99999, last3)).toEqual({ chapter: 0, step: 2 });
  });

  it('自由探索の章の中では、どこにいても同じ(章,場面)なので、state を書き直さない', () => {
    const a = locate(8400, sections);
    for (const y of [8500, 9000, 9399, 12000]) expect(locate(y, sections)).toEqual(a);
  });

  it('章の先頭までスクロールすると、その章の 0 場面になる(目次から移る位置)', () => {
    // 画面の高さ 1000: scrollY = 章の top のとき、中央の線は top + 500
    sections.forEach((s, i) => expect(locate(s.top + 1000 * ANCHOR, sections)).toEqual({ chapter: i, step: 0 }));
  });
});

describe('sceneToPatch', () => {
  it('章と場面の値を state の patch にする', () => {
    expect(sceneToPatch(0, 0)).toEqual({ chapter: 0, year: 2025, selection: null, camera: 'side' });
    expect(sceneToPatch(2, 1)).toEqual({ chapter: 2, year: 2023, selection: { type: 'metro', id: 'osaka' }, camera: 'oblique' });
    expect(sceneToPatch(4, 0)).toEqual({ chapter: 4, year: 2025, selection: null, camera: 'oblique' });
  });

  it('selection は場面の定義と別のオブジェクト', () => {
    const p = sceneToPatch(1, 0);
    expect(p.selection).not.toBe(CHAPTERS[1].steps[0].selection);
  });
});
