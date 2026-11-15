// データの読み込みと検証。
//   loadData() → { years, totals, matrix(year) → Int32Array(2209), prefectures, topology, source, series, unit }
import { N } from '../geometry/constants.js';

const CELLS = N * N;
const METROS = new Set(['tokyo', 'nagoya', 'osaka']);

function fail(msg) {
  throw new Error(`データの形式が不正です: ${msg}`);
}

function validateOd(od) {
  if (!od || typeof od !== 'object') fail('od.json がオブジェクトではありません');
  if (!Array.isArray(od.years) || !od.years.length || !od.years.every(Number.isInteger)) {
    fail('od.years は整数の配列である必要があります');
  }
  if (!od.matrices || typeof od.matrices !== 'object') fail('od.matrices がありません');
  for (const y of od.years) {
    const m = od.matrices[y];
    if (!Array.isArray(m) || m.length !== CELLS) fail(`matrices[${y}] は ${CELLS} 個の配列である必要があります`);
    for (let k = 0; k < CELLS; k++) {
      const v = m[k];
      if (!Number.isInteger(v) || v < 0) fail(`matrices[${y}][${k}] が 0 以上の整数ではありません`);
    }
    for (let i = 0; i < N; i++) if (m[i * N + i] !== 0) fail(`matrices[${y}] の対角成分(${i})が 0 ではありません`);
  }
  if (!od.totals || typeof od.totals !== 'object') fail('od.totals がありません');
  for (const y of od.years) {
    if (!Number.isFinite(od.totals[y])) fail(`totals[${y}] が数ではありません`);
  }
}

function validatePrefectures(prefs) {
  if (!Array.isArray(prefs) || prefs.length !== N) fail(`prefectures.json は ${N} 件の配列である必要があります`);
  prefs.forEach((p, i) => {
    if (p.code !== i + 1) fail(`prefectures[${i}].code は ${i + 1} である必要があります`);
    if (typeof p.ja !== 'string' || typeof p.en !== 'string') fail(`prefectures[${i}] に ja / en がありません`);
    if (p.metro !== null && !METROS.has(p.metro)) fail(`prefectures[${i}].metro が不正です`);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail(`prefectures[${i}] に x / y がありません`);
  });
}

function validateTopology(topo) {
  if (!topo || topo.type !== 'Topology') fail('japan.topojson は Topology である必要があります');
  if (!topo.objects?.japan) fail('japan.topojson に object "japan" がありません');
  if (!Array.isArray(topo.arcs)) fail('japan.topojson に arcs がありません');
}

/** 取得済みの3つの JSON を検証して、アプリが使う形にする。 */
export function parseData({ od, prefectures, topology }) {
  validateOd(od);
  validatePrefectures(prefectures);
  validateTopology(topology);
  const years = [...od.years].sort((a, b) => a - b);
  const cache = new Map();
  return {
    series: od.series,
    unit: od.unit,
    source: od.source,
    years,
    totals: od.totals,
    prefectures,
    topology,
    /** year 年の 47×47 行優先の行列。添字 o*47+d が o → d の人数。同じ配列を返す(書き換えない)。 */
    matrix(year) {
      let m = cache.get(year);
      if (!m) {
        const src = od.matrices[year];
        if (!src) throw new Error(`${year} 年のデータはありません`);
        m = Int32Array.from(src);
        cache.set(year, m);
      }
      return m;
    },
  };
}

async function getJson(url, fetchFn) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${url} を読み込めませんでした (${res.status})`);
  return res.json();
}

/**
 * data/ 以下の3ファイルを読み込む。
 * 基準は document.baseURI(index.html が末尾スラッシュなしで開かれても解決できるよう、
 * index.html で <base> を補っている)。
 */
export async function loadData({ base, fetchFn = globalThis.fetch } = {}) {
  const root = new URL(base ?? 'data/', globalThis.document?.baseURI ?? globalThis.location?.href);
  const url = (name) => new URL(name, root).href;
  const [od, prefectures, topology] = await Promise.all([
    getJson(url('od.json'), fetchFn),
    getJson(url('prefectures.json'), fetchFn),
    getJson(url('japan.topojson'), fetchFn),
  ]);
  return parseData({ od, prefectures, topology });
}
