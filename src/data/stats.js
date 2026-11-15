// 集計の純関数。移動者の行列(47×47、行優先、添字 o*47+d が o → d の人数)と選択(selection)から数を求める。
// 年の切り替え(折れ線)、読み出し、ツールチップ、数値の表、ラベルの相手先が、ここの同じ関数から同じ値を出す。
//
// 圏(metro)の転入・転出は、圏の外との移動だけを数える(圏内の都府県どうしの移動は含めない)。
// 都道府県を1つ選んだときは、ほかの46都道府県がすべて「外」になる。
import { N } from '../geometry/constants.js';
import { selectionMask } from '../geometry/flows.js';

/** 行列の合計(都道府県間の移動者の総数)。 */
export function totalMovers(matrix) {
  let sum = 0;
  for (let k = 0; k < matrix.length; k++) sum += matrix[k];
  return sum;
}

/** year 年の総数。od.json の totals があればそれを、なければ行列の合計を返す。 */
export function yearTotal(data, year) {
  const v = data.totals?.[year];
  return Number.isFinite(v) ? v : totalMovers(data.matrix(year));
}

/**
 * 都道府県ごとの転入・転出・差引。{ in, out, net } はそれぞれ長さ 47 の数の配列(添字は JIS コード − 1)。
 * in[i] は、ほかの46都道府県から i への移動者の合計、out[i] は i からほかへの合計、net = in − out。
 */
export function prefFlows(matrix) {
  const inn = new Array(N).fill(0);
  const out = new Array(N).fill(0);
  for (let o = 0; o < N; o++) {
    for (let d = 0; d < N; d++) {
      if (o === d) continue;
      const v = matrix[o * N + d];
      out[o] += v;
      inn[d] += v;
    }
  }
  return { in: inn, out, net: inn.map((v, i) => v - out[i]) };
}

/**
 * 選択した地域(0/1 のマスク Uint8Array(47))の、地域の外との転入・転出・差引。
 * 地域の内部の移動と、地域に関わらない移動は数えない。
 */
export function maskFlows(matrix, mask) {
  let inn = 0;
  let out = 0;
  for (let o = 0; o < N; o++) {
    const mo = mask[o];
    for (let d = 0; d < N; d++) {
      if (mask[d] === mo) continue;
      const v = matrix[o * N + d];
      if (mo) out += v;
      else inn += v;
    }
  }
  return { in: inn, out, net: inn - out };
}

/** selection(null | { type: 'pref', code } | { type: 'metro', id })の転入・転出・差引。選択なしは null。 */
export function regionFlows(matrix, selection) {
  if (!selection) return null;
  return maskFlows(matrix, selectionMask(selection));
}

/** 都道府県 i(添字)の、ほかの46都道府県との転入・転出・差引 { in, out, net }。ツールチップが使う。 */
export function prefFlow(matrix, i) {
  let inn = 0;
  let out = 0;
  for (let j = 0; j < N; j++) {
    if (j === i) continue;
    inn += matrix[j * N + i];
    out += matrix[i * N + j];
  }
  return { in: inn, out, net: inn - out };
}

/**
 * 選択地域から見た、相手先(選択地域の外の都道府県)ごとの値。selection は state.selection。
 *  in[p]  = 相手先 p から選択地域への移動(圏なら構成県への合計)
 *  out[p] = 選択地域から相手先 p への移動
 *  net[p] = in[p] − out[p]
 *  partners = 相手先の添字(昇順)
 *  total  = { in, out, net }: 全相手先の合計 = regionFlows と同じ値(選択地域の内部どうしの移動は含まない)
 * 選択がない(または空の)ときは null。
 */
export function partnerFlows(matrix, selection) {
  const mask = selectionMask(selection);
  const members = [];
  for (let i = 0; i < N; i++) if (mask[i]) members.push(i);
  if (!members.length) return null;
  const inn = new Array(N).fill(0);
  const out = new Array(N).fill(0);
  const net = new Array(N).fill(0);
  const partners = [];
  const total = { in: 0, out: 0, net: 0 };
  for (let p = 0; p < N; p++) {
    if (mask[p]) continue;
    partners.push(p);
    for (const s of members) {
      inn[p] += matrix[p * N + s];
      out[p] += matrix[s * N + p];
    }
    net[p] = inn[p] - out[p];
    total.in += inn[p];
    total.out += out[p];
  }
  total.net = total.in - total.out;
  return { in: inn, out, net, partners, total, mask };
}

/** 選択地域(マスク)との転入と転出の合計が多い相手先の添字を、多い順に n 個。ラベルが使う。 */
export function topPartners(matrix, mask, n = 6) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    if (mask[i]) continue;
    let sum = 0;
    for (let m = 0; m < N; m++) if (mask[m]) sum += matrix[m * N + i] + matrix[i * N + m];
    if (sum > 0) rows.push([i, sum]);
  }
  rows.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return rows.slice(0, n).map((r) => r[0]);
}

/**
 * 表の行の並べ替え。rows は { index, in, out, net } を持つ配列(index は都道府県の添字)。
 * key: 'pref'(JIS コード順)| 'in' | 'out' | 'net'。dir: 1(昇順)| −1(降順)。同じ値は都道府県の並びで安定させる。
 */
export function sortRows(rows, key, dir = 1) {
  const sgn = dir < 0 ? -1 : 1;
  const val = (r) => (key === 'pref' ? r.index : r[key]);
  return [...rows].sort((a, b) => {
    const d = val(a) - val(b);
    return d !== 0 ? sgn * d : a.index - b.index;
  });
}

/**
 * 表の行。選択なし: 47 都道府県の転入・転出・差引(prefFlows)。
 * 選択あり: 選択地域から見た相手先ごとの転入・転出・差引(partnerFlows)と、その合計(= regionFlows)。
 * 戻り値: { mode: 'national' | 'region', rows: [{ index, code, in, out, net }], total }(national の total は null)
 */
export function tableRows(matrix, selection) {
  const region = partnerFlows(matrix, selection);
  if (!region) {
    const f = prefFlows(matrix);
    const rows = Array.from({ length: N }, (_, i) => ({ index: i, code: i + 1, in: f.in[i], out: f.out[i], net: f.net[i] }));
    return { mode: 'national', rows, total: null };
  }
  const rows = region.partners.map((p) => ({ index: p, code: p + 1, in: region.in[p], out: region.out[p], net: region.net[p] }));
  return { mode: 'region', rows, total: region.total };
}

/** data.years の順に、年ごとの総数を並べた配列。 */
export function totalSeries(data) {
  return data.years.map((y) => yearTotal(data, y));
}

/** data.years の順に、選択地域の差引(転入超過)を並べた配列。選択なしは null。 */
export function netSeries(data, selection) {
  if (!selection) return null;
  const mask = selectionMask(selection);
  return data.years.map((y) => maskFlows(data.matrix(y), mask).net);
}

/** 折れ線に出す系列。選択なしは年ごとの総数、あれば選択地域の差引。 */
export function timelineSeries(data, selection) {
  return selection ? netSeries(data, selection) : totalSeries(data);
}

// ---- 表示用の書式(読み出し、年の折れ線、ツールチップ、表で共通) ----

const MINUS = '−'; // U+2212。ハイフンではない

/** 桁区切りのカンマ付きの整数。2259688 → '2,259,688'。負の数は U+2212 で始める。 */
export function formatCount(n) {
  if (!Number.isFinite(n)) return '';
  const s = Math.abs(Math.round(n)).toLocaleString('en-US');
  return n < 0 && Math.round(n) !== 0 ? MINUS + s : s;
}

/** 符号付き。正は '+'、負は U+2212、0 は '0'。差引に使う。 */
export function formatSigned(n) {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n);
  if (r === 0) return '0';
  return (r > 0 ? '+' : MINUS) + Math.abs(r).toLocaleString('en-US');
}

/**
 * 縦画面のドックの要約用に略した数。
 * 日本語: 1万以上は「46.9万」(100万以上は小数なしの「226万」)、1万未満は「9,870」のまま。
 * 英語: 1万以上は「469k」、1万未満は「9,870」のまま。signed を付けると正負の符号を付ける。
 */
export function formatShort(n, lang = 'ja', { signed = false } = {}) {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(Math.round(n));
  let body;
  if (abs < 10000) body = abs.toLocaleString('en-US');
  else if (lang === 'en') body = `${Math.round(abs / 1000).toLocaleString('en-US')}k`;
  else body = abs >= 1000000 ? `${Math.round(abs / 10000).toLocaleString('en-US')}万` : `${(abs / 10000).toFixed(1)}万`;
  if (Math.round(n) < 0) return MINUS + body;
  return signed && abs > 0 ? `+${body}` : body;
}

/** '{region}の転入超過' のような文言の {名前} を vars の値で置き換える。 */
export function fill(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
