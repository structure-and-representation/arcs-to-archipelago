import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseData } from '../src/data/loader.js';
import { partnerFlows, prefectureFlows, sortRows, tableRows } from '../src/data/tableStats.js';
import { buildTableModel, formatCount, formatNet, nextSort, regionName } from '../src/ui/table.js';
import { METRO_CODES } from '../src/geometry/constants.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const data = parseData({ od: read('od.json'), prefectures: read('prefectures.json'), topology: read('japan.topojson') });
const TOKYO = 12; // 添字(JIS コード 13)
const KANAGAWA = 13;
const m2014 = data.matrix(2014);
const TOKYO_SEL = { type: 'pref', code: 13 };
const sum = (a) => [...a].reduce((x, y) => x + y, 0);

describe('都道府県ごとの転入・転出・差引', () => {
  it('2014年の東京都は 転入 404,736・転出 331,456・差引 73,280', () => {
    const f = prefectureFlows(m2014);
    expect(f.in[TOKYO]).toBe(404736);
    expect(f.out[TOKYO]).toBe(331456);
    expect(f.net[TOKYO]).toBe(73280);
  });

  it('2021年の東京都の差引は 10,815', () => {
    expect(prefectureFlows(data.matrix(2021)).net[TOKYO]).toBe(10815);
  });

  it('どの年も、転入の合計と転出の合計がその年の移動者総数に一致し、差引の合計は 0', () => {
    for (const year of data.years) {
      const f = prefectureFlows(data.matrix(year));
      expect(sum(f.in)).toBe(data.totals[year]);
      expect(sum(f.out)).toBe(data.totals[year]);
      expect(sum(f.net)).toBe(0);
    }
  });
});

describe('選択地域から見た相手先ごとの値', () => {
  const r = partnerFlows(m2014, TOKYO_SEL);

  it('2014年の神奈川県から東京都への移動 77,802 が、相手先 神奈川県の転入になる', () => {
    expect(r.in[KANAGAWA]).toBe(77802);
    expect(r.out[KANAGAWA]).toBe(m2014[TOKYO * 47 + KANAGAWA]);
    expect(r.net[KANAGAWA]).toBe(r.in[KANAGAWA] - r.out[KANAGAWA]);
  });

  it('相手先は選択した都道府県を除く 46 件で、合計は東京都の転入・転出・差引に一致する', () => {
    expect(r.partners).toHaveLength(46);
    expect(r.partners).not.toContain(TOKYO);
    expect(r.total).toEqual({ in: 404736, out: 331456, net: 73280 });
  });

  it('選択なしは null', () => {
    expect(partnerFlows(m2014, null)).toBeNull();
  });

  it('圏を選ぶと、圏の外の都道府県が相手先になり、圏の内部どうしの移動は数えない', () => {
    const metro = partnerFlows(m2014, { type: 'metro', id: 'tokyo' });
    const members = METRO_CODES.tokyo.map((c) => c - 1);
    expect(metro.partners).toHaveLength(43);
    for (const i of members) expect(metro.partners).not.toContain(i);
    // 北海道から圏への転入 = 北海道から各都県への移動の和
    expect(metro.in[0]).toBe(members.reduce((a, s) => a + m2014[0 * 47 + s], 0));
    expect(metro.out[0]).toBe(members.reduce((a, s) => a + m2014[s * 47 + 0], 0));
    // 圏の転入の合計 = 各都県の転入の合計 − 圏内どうしの移動
    const f = prefectureFlows(m2014);
    let internal = 0;
    for (const a of members) for (const b of members) internal += m2014[a * 47 + b];
    expect(metro.total.in).toBe(members.reduce((a, i) => a + f.in[i], 0) - internal);
    expect(metro.total.out).toBe(members.reduce((a, i) => a + f.out[i], 0) - internal);
    expect(metro.total.net).toBe(metro.total.in - metro.total.out);
  });
});

describe('並べ替え', () => {
  const { rows } = tableRows(m2014, null);

  it('都道府県の列は JIS コード順で、逆順にできる', () => {
    expect(sortRows(rows, 'pref', 1).map((r) => r.index)).toEqual([...Array(47).keys()]);
    expect(sortRows(rows, 'pref', -1).map((r) => r.index)).toEqual([...Array(47).keys()].reverse());
  });

  it('差引の降順は大きい順で、東京都が先頭、同じ値は都道府県の並びで安定する', () => {
    const s = sortRows(rows, 'net', -1);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].net).toBeGreaterThanOrEqual(s[i].net);
    expect(s[0].index).toBe(TOKYO);
    expect(s[0].net).toBe(73280);
  });

  it('転入・転出の昇順', () => {
    for (const key of ['in', 'out']) {
      const s = sortRows(rows, key, 1);
      for (let i = 1; i < s.length; i++) expect(s[i - 1][key]).toBeLessThanOrEqual(s[i][key]);
    }
  });

  it('元の配列は変えない', () => {
    const copy = rows.map((r) => r.index);
    sortRows(rows, 'net', -1);
    expect(rows.map((r) => r.index)).toEqual(copy);
  });

  it('列を押したときの向き: 都道府県は昇順、数は降順から始まり、同じ列でもう一度押すと逆順', () => {
    expect(nextSort({ key: 'pref', dir: 1 }, 'net')).toEqual({ key: 'net', dir: -1 });
    expect(nextSort({ key: 'net', dir: -1 }, 'net')).toEqual({ key: 'net', dir: 1 });
    expect(nextSort({ key: 'net', dir: 1 }, 'pref')).toEqual({ key: 'pref', dir: 1 });
    expect(nextSort({ key: 'pref', dir: 1 }, 'pref')).toEqual({ key: 'pref', dir: -1 });
  });
});

describe('表の中身(選択に応じた切り替え)', () => {
  const sort = { key: 'pref', dir: 1 };
  const base = { matrix: m2014, year: 2014, sort };

  it('選択なしは 47 都道府県。正式名で、行は 転入・転出・差引 を持つ', () => {
    const m = buildTableModel({ ...base, selection: null, lang: 'ja' });
    expect(m.mode).toBe('national');
    expect(m.rows).toHaveLength(47);
    expect(m.summary).toBeNull();
    expect(m.heading).toBe('2014年 · 都道府県別');
    expect(m.caption).toBe('2014年の都道府県別の移動');
    const tokyo = m.rows.find((r) => r.code === 13);
    expect(tokyo).toMatchObject({ name: '東京都', in: 404736, out: 331456, net: 73280 });
    expect(m.rows[0].name).toBe('北海道');
  });

  it('東京都を選ぶと、相手先 46 件に切り替わり、選択地域の行が合計を持つ', () => {
    const m = buildTableModel({ ...base, selection: TOKYO_SEL, lang: 'ja' });
    expect(m.mode).toBe('region');
    expect(m.rows).toHaveLength(46);
    expect(m.rows.some((r) => r.name === '東京都')).toBe(false);
    expect(m.rows.find((r) => r.name === '神奈川県').in).toBe(77802);
    expect(m.summary).toEqual({ name: '東京都', in: 404736, out: 331456, net: 73280 });
    expect(m.heading).toBe('2014年 · 東京都との移動');
    expect(m.caption).toBe('東京都との移動、2014年');
  });

  it('圏を選ぶと、圏の名前の行と圏外の 43 件', () => {
    const m = buildTableModel({ ...base, selection: { type: 'metro', id: 'tokyo' }, lang: 'ja' });
    expect(m.rows).toHaveLength(43);
    expect(m.summary.name).toBe('東京圏');
  });

  it('英語では英語の名前と見出し', () => {
    const n = buildTableModel({ ...base, selection: null, lang: 'en' });
    expect(n.heading).toBe('2014 · By prefecture');
    expect(n.rows.find((r) => r.code === 13).name).toBe('Tokyo');
    const r = buildTableModel({ ...base, selection: TOKYO_SEL, lang: 'en' });
    expect(r.heading).toBe('2014 · Moves to and from Tokyo');
    expect(r.caption).toBe('Moves to and from Tokyo, 2014');
  });

  it('年が変わると値が変わる(2021年の東京都の差引)', () => {
    const m = buildTableModel({ ...base, matrix: data.matrix(2021), year: 2021, selection: null, lang: 'ja' });
    expect(m.rows.find((r) => r.code === 13).net).toBe(10815);
    expect(m.heading).toBe('2021年 · 都道府県別');
  });

  it('並べ替えは、選択ありの表の相手先にも効く', () => {
    const m = buildTableModel({ ...base, selection: TOKYO_SEL, lang: 'ja', sort: { key: 'in', dir: -1 } });
    expect(m.rows[0].name).toBe('神奈川県');
    for (let i = 1; i < m.rows.length; i++) expect(m.rows[i - 1].in).toBeGreaterThanOrEqual(m.rows[i].in);
  });

  it('選択地域の名前', () => {
    expect(regionName(null, 'ja')).toBeNull();
    expect(regionName({ type: 'pref', code: 27 }, 'ja')).toBe('大阪府');
    expect(regionName({ type: 'metro', id: 'osaka' }, 'en')).toBe('Osaka area');
  });
});

describe('数の書式', () => {
  it('桁区切りはカンマ', () => {
    expect(formatCount(404736)).toBe('404,736');
    expect(formatCount(0)).toBe('0');
  });
  it('差引は符号つきで、負は U+2212', () => {
    expect(formatNet(73280)).toBe('+73,280');
    expect(formatNet(-8580)).toBe('−8,580');
    expect(formatNet(-8580)).not.toContain('-');
    expect(formatNet(0)).toBe('0');
  });
});
