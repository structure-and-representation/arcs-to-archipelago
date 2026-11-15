import { describe, expect, it } from 'vitest';
import { loadData, parseData } from '../src/data/loader.js';
import { fixture } from './helpers.js';

const raw = () => ({ od: fixture('od.json'), prefectures: fixture('prefectures.json'), topology: fixture('japan.topojson') });

describe('parseData', () => {
  it('matrix(year) は 2209 要素の Int32Array を返す', () => {
    const data = parseData(raw());
    expect(data.years).toEqual([2014, 2015]);
    for (const y of data.years) {
      const m = data.matrix(y);
      expect(m).toBeInstanceOf(Int32Array);
      expect(m).toHaveLength(2209);
    }
    expect(data.prefectures).toHaveLength(47);
  });

  it('o * 47 + d が o から d への人数で、年ごとに違う行列を返す', () => {
    const { od } = raw();
    const data = parseData(raw());
    expect(data.matrix(2014)[1 * 47 + 0]).toBe(od.matrices[2014][47]);
    expect(data.matrix(2014)[1 * 47 + 0]).toBe(1874); // 試作データ: 青森 → 北海道
    expect(data.matrix(2015)[47]).toBe(Math.floor(1874 * 1.1));
    expect(data.matrix(2014)).toBe(data.matrix(2014)); // 同じ配列を返す
    for (let i = 0; i < 47; i++) expect(data.matrix(2014)[i * 47 + i]).toBe(0);
  });

  it('totals は行列の合計と同じ', () => {
    const data = parseData(raw());
    for (const y of data.years) {
      expect(data.totals[y]).toBe(data.matrix(y).reduce((a, b) => a + b, 0));
    }
  });

  it('データのない年は例外', () => {
    expect(() => parseData(raw()).matrix(1999)).toThrow(/1999/);
  });

  it('形式が不正なら、何が不正かを示して例外にする', () => {
    const bad = (mut) => {
      const r = raw();
      mut(r);
      return () => parseData(r);
    };
    expect(bad((r) => { r.od.matrices[2014] = r.od.matrices[2014].slice(1); })).toThrow(/matrices\[2014\]/);
    expect(bad((r) => { r.od.matrices[2014][0] = 5; })).toThrow(/対角/);
    expect(bad((r) => { r.od.matrices[2014][1] = -1; })).toThrow(/整数/);
    expect(bad((r) => { r.od.years = []; })).toThrow(/years/);
    expect(bad((r) => { delete r.od.totals[2015]; })).toThrow(/totals/);
    expect(bad((r) => { r.prefectures.pop(); })).toThrow(/47/);
    expect(bad((r) => { r.prefectures[3].code = 9; })).toThrow(/code/);
    expect(bad((r) => { r.prefectures[3].metro = 'kyoto'; })).toThrow(/metro/);
    expect(bad((r) => { delete r.prefectures[3].x; })).toThrow(/x \/ y/);
    expect(bad((r) => { r.topology.type = 'FeatureCollection'; })).toThrow(/Topology/);
    expect(bad((r) => { delete r.topology.objects.japan; })).toThrow(/japan/);
  });
});

describe('loadData', () => {
  it('data/ 以下の3ファイルを取得して検証する', async () => {
    const files = { 'od.json': fixture('od.json'), 'prefectures.json': fixture('prefectures.json'), 'japan.topojson': fixture('japan.topojson') };
    const urls = [];
    const fetchFn = async (url) => {
      urls.push(url);
      const name = url.split('/').pop();
      return name in files ? { ok: true, json: async () => files[name] } : { ok: false, status: 404 };
    };
    const data = await loadData({ base: 'https://example.com/works/x/data/', fetchFn });
    expect(urls.sort()).toEqual([
      'https://example.com/works/x/data/japan.topojson',
      'https://example.com/works/x/data/od.json',
      'https://example.com/works/x/data/prefectures.json',
    ]);
    expect(data.matrix(2014)).toHaveLength(2209);
  });

  it('取得に失敗したら、どのファイルかを示して例外にする', async () => {
    const fetchFn = async () => ({ ok: false, status: 404 });
    await expect(loadData({ base: 'https://example.com/data/', fetchFn })).rejects.toThrow(/404/);
  });
});
