import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseData } from '../src/data/loader.js';
import {
  fill, formatCount, formatShort, formatSigned, maskFlows, netSeries, prefFlows, regionFlows, timelineSeries,
  totalMovers, totalSeries, yearTotal,
} from '../src/data/stats.js';
import { fixture } from './helpers.js';

// 本物のデータ(public/data)で、公表された値と照合する
const pub = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data');
const read = (name) => JSON.parse(readFileSync(resolve(pub, name), 'utf8'));
const data = parseData({ od: read('od.json'), prefectures: read('prefectures.json'), topology: read('japan.topojson') });
const metro = (id) => ({ type: 'metro', id });
const pref = (code) => ({ type: 'pref', code });
const net = (year, selection) => regionFlows(data.matrix(year), selection).net;

describe('総数', () => {
  it('年ごとの総数', () => {
    expect(yearTotal(data, 2014)).toBe(2259688);
    expect(yearTotal(data, 2025)).toBe(2148329);
  });
  it('totals と行列の合計が一致し、系列は data.years の順', () => {
    for (const y of data.years) expect(totalMovers(data.matrix(y))).toBe(yearTotal(data, y));
    expect(totalSeries(data)).toHaveLength(14);
    expect(totalSeries(data)[2]).toBe(2259688);
    expect(timelineSeries(data, null)).toEqual(totalSeries(data));
  });
});

describe('圏の転入超過(圏外との移動だけ)', () => {
  it('東京圏', () => {
    expect(net(2014, metro('tokyo'))).toBe(109408);
    expect(net(2019, metro('tokyo'))).toBe(145576);
    expect(net(2021, metro('tokyo'))).toBe(80441);
    expect(net(2025, metro('tokyo'))).toBe(112738);
  });
  it('東京圏の転入・転出・差引(2014年)', () => {
    expect(regionFlows(data.matrix(2014), metro('tokyo'))).toEqual({ in: 468576, out: 359168, net: 109408 });
  });
  it('大阪圏', () => {
    expect(net(2014, metro('osaka'))).toBe(-11722);
    expect(net(2025, metro('osaka'))).toBe(7503);
  });
  it('名古屋圏(岐阜・愛知・三重)。転出は統計局の長期時系列表第11表の名古屋圏の行(2022年 124,351)と一致する', () => {
    expect(regionFlows(data.matrix(2022), metro('nagoya')).out).toBe(124351);
    expect(net(2012, metro('nagoya'))).toBe(1567);
    expect(net(2022, metro('nagoya'))).toBe(-13709);
    expect(net(2025, metro('nagoya'))).toBe(-9561);
  });
  it('名古屋圏を岐阜・静岡・愛知で数えると、作品の文案にある -276 / -15,872 / -11,542 になる', () => {
    // 文案(docs/copy/chapters.js)の数値はこの組み合わせの値。圏の構成(METRO_CODES)は岐阜・愛知・三重
    const mask = new Uint8Array(47);
    for (const code of [21, 22, 23]) mask[code - 1] = 1;
    expect(maskFlows(data.matrix(2012), mask).net).toBe(-276);
    expect(maskFlows(data.matrix(2022), mask).net).toBe(-15872);
    expect(maskFlows(data.matrix(2025), mask).net).toBe(-11542);
  });
});

describe('都道府県', () => {
  it('東京都の転入超過', () => {
    expect(net(2019, pref(13))).toBe(86575);
    expect(net(2021, pref(13))).toBe(10815);
  });
  it('都道府県ごとの転入・転出・差引は、1県を選んだときの値と一致し、差引の合計は 0', () => {
    for (const y of [2014, 2021]) {
      const f = prefFlows(data.matrix(y));
      for (const code of [1, 13, 27, 47]) {
        expect(regionFlows(data.matrix(y), pref(code))).toEqual({ in: f.in[code - 1], out: f.out[code - 1], net: f.net[code - 1] });
      }
      expect(f.net.reduce((a, b) => a + b, 0)).toBe(0);
      expect(f.in.reduce((a, b) => a + b, 0)).toBe(yearTotal(data, y));
    }
  });
});

describe('系列', () => {
  it('選択なしは null、あれば年ごとの差引', () => {
    expect(netSeries(data, null)).toBeNull();
    expect(regionFlows(data.matrix(2014), null)).toBeNull();
    const s = netSeries(data, metro('tokyo'));
    expect(s).toHaveLength(14);
    expect(s[2]).toBe(109408);
    expect(s[7]).toBe(145576);
    expect(timelineSeries(data, metro('tokyo'))).toEqual(s);
  });
  it('小さな試作データでも動く', () => {
    const small = parseData({ od: fixture('od.json'), prefectures: fixture('prefectures.json'), topology: fixture('japan.topojson') });
    expect(netSeries(small, pref(13))).toHaveLength(2);
  });
});

describe('書式', () => {
  it('桁区切りと符号(負は U+2212)', () => {
    expect(formatCount(2259688)).toBe('2,259,688');
    expect(formatSigned(109408)).toBe('+109,408');
    expect(formatSigned(-11542)).toBe('−11,542');
    expect(formatSigned(0)).toBe('0');
    expect(formatCount(-5)).toBe('−5');
  });
  it('縦画面の要約の略記', () => {
    expect(formatShort(468576)).toBe('46.9万');
    expect(formatShort(359168)).toBe('35.9万');
    expect(formatShort(109408, 'ja', { signed: true })).toBe('+10.9万');
    expect(formatShort(9870)).toBe('9,870');
    expect(formatShort(-23456, 'ja', { signed: true })).toBe('−2.3万');
    expect(formatShort(468576, 'en')).toBe('469k');
    expect(formatShort(109408, 'en', { signed: true })).toBe('+109k');
    expect(formatShort(9870, 'en')).toBe('9,870');
    expect(formatShort(2259688)).toBe('226万');
  });
  it('fill は {名前} を置き換え、ないものはそのまま残す', () => {
    expect(fill('{region}の{year}年', { region: '東京圏', year: 2014 })).toBe('東京圏の2014年');
    expect(fill('{a}{b}', { a: 1 })).toBe('1{b}');
  });
});

describe('読み出し・ツールチップ・表・年の折れ線が、同じ関数から同じ値を出す', async () => {
  const { partnerFlows, prefFlow, tableRows } = await import('../src/data/stats.js');
  const sels = [metro('tokyo'), metro('osaka'), metro('nagoya'), pref(13), pref(1), pref(47)];
  it('選択地域: 読み出し(regionFlows)= 表の合計(tableRows)= 相手先の合計 = 折れ線(netSeries)', () => {
    for (const sel of sels) {
      const series = netSeries(data, sel);
      data.years.forEach((y, k) => {
        const m = data.matrix(y);
        const r = regionFlows(m, sel);
        expect(tableRows(m, sel).total, `${JSON.stringify(sel)} ${y}`).toEqual(r);
        expect(partnerFlows(m, sel).total).toEqual(r);
        expect(series[k]).toBe(r.net);
      });
    }
  });
  it('都道府県: ツールチップ(prefFlow)= 表の行(tableRows 全国)= 1 県の選択の読み出し', () => {
    for (const y of [2012, 2021, 2025]) {
      const m = data.matrix(y);
      const rows = tableRows(m, null).rows;
      for (let i = 0; i < 47; i++) {
        const f = prefFlow(m, i);
        expect({ in: rows[i].in, out: rows[i].out, net: rows[i].net }).toEqual(f);
        expect(regionFlows(m, pref(i + 1))).toEqual(f);
      }
    }
  });
  it('圏は圏外との移動だけを数える(章の確定稿の値)', () => {
    expect(net(2019, metro('tokyo'))).toBe(145576);
    expect(net(2021, metro('tokyo'))).toBe(80441);
    expect(net(2025, metro('tokyo'))).toBe(112738);
    expect(net(2014, metro('osaka'))).toBe(-11722);
    expect(net(2023, metro('osaka'))).toBe(235);
    expect(net(2025, metro('osaka'))).toBe(7503);
  });
});
