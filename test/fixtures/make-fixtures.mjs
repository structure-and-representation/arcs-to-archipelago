// テスト用の小さなデータを作る。実データ(public/data/)とは別物で、
// reference/proto/data.json(2014年)と reference/proto/geometry.js の県庁所在地の座標から作る。
//   node test/fixtures/make-fixtures.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LATLON } from '../../reference/proto/geometry.js';

const here = dirname(fileURLToPath(import.meta.url));
const proto = JSON.parse(readFileSync(resolve(here, '../../reference/proto/data.json'), 'utf8'));

// Lambert Conformal Conic (2SP)。+proj=lcc +lat_1=30 +lat_2=40 +lat_0=36 +lon_0=138 +ellps=GRS80 (km)
function lcc(latDeg, lonDeg) {
  const a = 6378.137, f = 1 / 298.257222101, e = Math.sqrt(2 * f - f * f);
  const rad = Math.PI / 180;
  const m = (p) => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2);
  const tt = (p) => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const p1 = 30 * rad, p2 = 40 * rad, p0 = 36 * rad, l0 = 138 * rad;
  const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(tt(p1)) - Math.log(tt(p2)));
  const F = m(p1) / (n * tt(p1) ** n);
  const rho = (p) => a * F * tt(p) ** n;
  const r = rho(latDeg * rad), th = n * (lonDeg * rad - l0);
  return [r * Math.sin(th), rho(p0) - r * Math.cos(th)];
}

const JA = proto.nodes.map((n) => n.name);
const EN = ['Hokkaido', 'Aomori', 'Iwate', 'Miyagi', 'Akita', 'Yamagata', 'Fukushima', 'Ibaraki', 'Tochigi', 'Gunma', 'Saitama', 'Chiba', 'Tokyo', 'Kanagawa', 'Niigata', 'Toyama', 'Ishikawa', 'Fukui', 'Yamanashi', 'Nagano', 'Gifu', 'Shizuoka', 'Aichi', 'Mie', 'Shiga', 'Kyoto', 'Osaka', 'Hyogo', 'Nara', 'Wakayama', 'Tottori', 'Shimane', 'Okayama', 'Hiroshima', 'Yamaguchi', 'Tokushima', 'Kagawa', 'Ehime', 'Kochi', 'Fukuoka', 'Saga', 'Nagasaki', 'Kumamoto', 'Oita', 'Miyazaki', 'Kagoshima', 'Okinawa'];
const METRO = { 11: 'tokyo', 12: 'tokyo', 13: 'tokyo', 14: 'tokyo', 21: 'nagoya', 23: 'nagoya', 24: 'nagoya', 26: 'osaka', 27: 'osaka', 28: 'osaka', 29: 'osaka' };

const prefectures = LATLON.map(([lat, lon], i) => {
  const [x, y] = lcc(lat, lon);
  return {
    code: i + 1, ja: JA[i], en: EN[i], metro: METRO[i + 1] ?? null,
    capital: { ja: JA[i], lon, lat }, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000,
  };
});

const m2014 = new Array(47 * 47).fill(0);
for (const l of proto.links) m2014[l.source * 47 + l.target] += l.value;
const m2015 = m2014.map((v) => Math.floor(v * 1.1));
const sum = (m) => m.reduce((s, v) => s + v, 0);
const od = {
  series: '日本人移動者', unit: '人',
  source: { name: 'テスト用', url: 'https://example.com/', retrieved: '2026-01-01' },
  years: [2014, 2015],
  totals: { 2014: sum(m2014), 2015: sum(m2015) },
  matrices: { 2014: m2014, 2015: m2015 },
};

// 四角形1つだけの TopoJSON(形式の検証用)
const topology = {
  type: 'Topology',
  objects: { japan: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', id: 13, arcs: [[0]] }] } },
  arcs: [[[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]],
};

writeFileSync(resolve(here, 'od.json'), JSON.stringify(od));
writeFileSync(resolve(here, 'prefectures.json'), JSON.stringify(prefectures));
writeFileSync(resolve(here, 'japan.topojson'), JSON.stringify(topology));
console.log('written', sum(m2014), prefectures[12], prefectures[26], prefectures[0], prefectures[45], prefectures[46]);
