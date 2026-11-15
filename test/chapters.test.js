import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chapters as COPY } from '../docs/copy/chapters.js';
import { CHAPTERS, isValidStep, toStateSelection } from '../src/content/chapters.js';
import { DICT } from '../src/i18n.js';
import { ANCHOR, ANCHOR_PORTRAIT, locate, sceneToPatch } from '../src/ui/chapters.js';

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
      expect(ch.steps.map((s) => ({ year: s.year, selection: s.selection, camera: s.camera }))).toEqual(
        copy.steps.map((s) => ({ year: s.year, selection: toStateSelection(s.selection), camera: s.camera })),
      );
      // 場面ごとの本文と、強調する弧
      copy.steps.forEach((cs, k) => {
        const st = ch.steps[k];
        expect(Boolean(st.body), `${copy.id} step ${k} body`).toBe(Boolean(cs.body));
        if (cs.body) for (const lang of ['ja', 'en']) expect(DICT[lang][st.body], `${copy.id} step ${k} ${lang}`).toBe(cs.body[lang]);
        expect(st.hover ?? null).toEqual(cs.hover ? { type: 'arc', o: cs.hover.o, d: cs.hover.d } : null);
      });
    });
  });

  it('目次の章名は仕様どおり', () => {
    expect(CHAPTERS.map((c) => DICT.ja[c.name])).toEqual(['全国', '東京一極', '大阪圏', '名古屋圏', '自由探索']);
    expect(CHAPTERS.map((c) => DICT.en[c.name])).toEqual(['Japan', 'Tokyo', 'Osaka', 'Nagoya', 'Explore']);
  });

  it('自由探索の章は、本文の例(大阪府、千葉県の 2012 年と 2025 年)を見せてから、全国の 2025 年で読者に渡す', () => {
    expect(CHAPTERS.filter((c) => c.explore).map((c) => c.id)).toEqual(['explore']);
    expect(CHAPTERS[4].steps.map(({ year, selection, camera, hover }) => ({ year, selection, camera, hover }))).toEqual([
      { year: 2025, selection: { type: 'pref', code: 27 }, camera: 'oblique', hover: { type: 'arc', o: 26, d: 27 } }, // 大阪府 → 兵庫県
      { year: 2012, selection: { type: 'pref', code: 12 }, camera: 'oblique', hover: { type: 'arc', o: 11, d: 12 } }, // 千葉県 → 東京都
      { year: 2025, selection: { type: 'pref', code: 12 }, camera: 'oblique', hover: { type: 'arc', o: 11, d: 12 } },
      { year: 2025, selection: null, camera: 'oblique', hover: undefined },
    ]);
  });

  it('1 章の見出しは作品名ではなく、その章が述べる事実', () => {
    expect(DICT.ja[CHAPTERS[0].heading]).toBe('2025年、214万人が都道府県の境を越えた');
    expect(DICT.en[CHAPTERS[0].heading]).toBe('In 2025, 2.1 Million People Moved Across Prefectures');
    for (const lang of ['ja', 'en']) expect(DICT[lang][CHAPTERS[0].heading]).not.toBe(DICT[lang].title);
  });

  it('縦画面の基準の線は、デスクトップより上(章の先頭のカードがドックの上に収まる)', () => {
    expect(ANCHOR).toBe(0.5);
    expect(ANCHOR_PORTRAIT).toBeLessThan(ANCHOR);
  });
});

describe('locate: スクロールの位置から章と場面を求める', () => {
  // 画面の高さ 1000 として、3 場面の章は 2100(場面ごと 700)、自由探索(4 場面)は 2800
  const sections = [
    { top: 0, height: 2100, steps: 3 },
    { top: 2100, height: 2100, steps: 3 },
    { top: 4200, height: 2100, steps: 3 },
    { top: 6300, height: 2100, steps: 3 },
    { top: 8400, height: 2800, steps: 4 },
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
    expect(locate(9400, sections)).toEqual({ chapter: 4, step: 1 });
    expect(locate(99999, sections)).toEqual({ chapter: 4, step: 3 });
    const last3 = [{ top: 0, height: 900, steps: 3 }];
    expect(locate(99999, last3)).toEqual({ chapter: 0, step: 2 });
  });

  it('自由探索の最後の場面に入ってからは、どこにいても同じ(章,場面)なので、state を書き直さない', () => {
    const a = locate(8400 + 2100, sections); // 4 場面の章の最後(場面ごと 700)
    expect(a).toEqual({ chapter: 4, step: 3 });
    for (const y of [10600, 11000, 11199, 12000, 99999]) expect(locate(y, sections)).toEqual(a);
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
    expect(sceneToPatch(4, 0)).toEqual({ chapter: 4, year: 2025, selection: { type: 'pref', code: 27 }, camera: 'oblique' });
    expect(sceneToPatch(4, 1)).toEqual({ chapter: 4, year: 2012, selection: { type: 'pref', code: 12 }, camera: 'oblique' });
    expect(sceneToPatch(4, 3)).toEqual({ chapter: 4, year: 2025, selection: null, camera: 'oblique' });
  });

  it('selection は場面の定義と別のオブジェクト', () => {
    const p = sceneToPatch(1, 0);
    expect(p.selection).not.toBe(CHAPTERS[1].steps[0].selection);
  });
});

describe('initialScene(URL の引数 → はじめの章と場面)', async () => {
  const { initialScene, EXPLORE } = await import('../src/ui/chapters.js');
  const { parseParams } = await import('../src/params.js');
  const scene = (q) => initialScene(parseParams(q).patch);
  const tokyo = { type: 'metro', id: 'tokyo' };

  it('引数がなければ開幕(0 章の最初の場面: 2025 年、真横)', () => {
    expect(scene('')).toEqual({ chapter: 0, step: 0, patch: { chapter: 0, year: 2025, selection: null, camera: 'side', morph: 0 } });
  });

  it('ch だけなら、その章の最初の場面の年・選択・カメラ', () => {
    expect(scene('?ch=1')).toMatchObject({ chapter: 1, step: 0, patch: { year: 2019, selection: tokyo, camera: 'oblique', morph: 1 } });
    expect(scene('?ch=3').patch).toMatchObject({ year: 2012, selection: { type: 'metro', id: 'nagoya' } });
  });

  it('ch と一緒に sel / cam / year があれば、そちらを優先する', () => {
    const s = scene('?ch=1&year=2014&cam=top');
    expect(s.chapter).toBe(1);
    expect(s.patch).toMatchObject({ year: 2014, selection: tokyo, camera: 'top' });
    expect(scene('?ch=2&sel=13').patch.selection).toEqual({ type: 'pref', code: 13 });
  });

  it('ch と URL の値が章の中の場面に合えば、その場面から始める(再読み込みで場面を戻さない)', () => {
    expect(scene('?ch=1&year=2025&sel=tokyo&cam=oblique')).toMatchObject({ chapter: 1, step: 2 });
    expect(scene('?ch=0&cam=oblique&year=2025')).toMatchObject({ chapter: 0, step: 1 });
    expect(scene('?ch=1&year=2014')).toMatchObject({ chapter: 1, step: 0 });
  });

  it('ch がなければ、URL の値に合う場面の章を選ぶ(本文と画面が矛盾しない)', () => {
    expect(scene('?sel=tokyo')).toMatchObject({ chapter: 1, step: 0 });
    expect(scene('?sel=tokyo&year=2021&cam=oblique')).toMatchObject({ chapter: 1, step: 1, patch: { year: 2021 } });
    expect(scene('?sel=osaka&year=2023')).toMatchObject({ chapter: 2, step: 1 });
    expect(scene('?year=2025')).toMatchObject({ chapter: 0, step: 0 });
    expect(scene('?cam=oblique&year=2025')).toMatchObject({ chapter: 0, step: 1 });
  });

  it('合う場面がなければ自由探索の章の最後の場面にし、URL にない値はその場面の値にする', () => {
    const last = CHAPTERS[EXPLORE].steps.length - 1;
    const s = scene('?sel=13&cam=oblique');
    expect(s.chapter).toBe(EXPLORE);
    expect(s.step).toBe(last);
    expect(s.patch).toMatchObject({ chapter: EXPLORE, selection: { type: 'pref', code: 13 }, camera: 'oblique', year: 2025 });
    expect(scene('?cam=top')).toMatchObject({ chapter: EXPLORE, step: last });
    expect(scene('?year=2018')).toMatchObject({ chapter: EXPLORE, step: last });
  });

  it('URL が自由探索の章の本文の例に合うときは、その場面', () => {
    expect(scene('?sel=27&year=2025')).toMatchObject({ chapter: EXPLORE, step: 0 });
    expect(scene('?sel=12&year=2012&cam=oblique')).toMatchObject({ chapter: EXPLORE, step: 1 });
    expect(scene('?sel=12&year=2025')).toMatchObject({ chapter: EXPLORE, step: 2 });
    expect(scene('?ch=4').patch).toMatchObject({ selection: { type: 'pref', code: 27 } });
  });

  it('morph は URL になければカメラの定位置の値、あればその値', () => {
    expect(scene('?cam=top').patch.morph).toBe(1);
    expect(scene('?cam=side&morph=0.5').patch.morph).toBe(0.5);
  });
});

describe('場面ごとの本文の人数が、データ(public/data/od.json)と一致する', () => {
  const od = JSON.parse(readFileSync(resolve(__dirname, '../public/data/od.json'), 'utf8'));
  const flow = (y, o, d) => od.matrices[String(y)][o * 47 + d];
  const fmt = (n) => n.toLocaleString('en-US');
  const ja = (n) => (n >= 10000 ? `${Math.floor(n / 10000)}万${n % 10000 ? (n % 10000).toLocaleString('en-US') : ''}` : n.toLocaleString('en-US'));
  const body = (k, lang) => DICT[lang][CHAPTERS[4].steps[k].body];

  it('大阪府 → 兵庫県は、14 年間毎年 2 万 6 千〜2 万 7 千人台', () => {
    for (const y of od.years) {
      const v = flow(y, 26, 27);
      expect(v, String(y)).toBeGreaterThanOrEqual(26000);
      expect(v, String(y)).toBeLessThan(28000);
    }
    expect(body(0, 'ja')).toContain('2万6千〜2万7千人台');
    expect(body(0, 'en')).toContain('26,000 to 27,000');
  });

  it('2012 年: 千葉県 → 東京都 50,189 人、逆向きより 9,427 人多い', () => {
    const a = flow(2012, 11, 12), b = flow(2012, 12, 11);
    expect(body(1, 'ja')).toContain(`${ja(a)}人`);
    expect(body(1, 'ja')).toContain(`${fmt(a - b)}人多かった`);
    expect(body(1, 'en')).toContain(`${fmt(a)} people moved from Chiba to Tokyo, ${fmt(a - b)} more`);
  });

  it('2025 年: 東京都 → 千葉県 45,333 人、逆向きより 783 人多い', () => {
    const a = flow(2025, 12, 11), b = flow(2025, 11, 12);
    expect(body(2, 'ja')).toContain(`${ja(a)}人`);
    expect(body(2, 'ja')).toContain(`${fmt(a - b)}人多い`);
    expect(body(2, 'en')).toContain(`${fmt(a)} people moved from Tokyo to Chiba, ${fmt(a - b)} more`);
  });
});
