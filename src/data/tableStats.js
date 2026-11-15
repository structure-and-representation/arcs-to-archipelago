// 数値の表のための集計(純関数)。
// 別の担当が作る data/stats.js に同じ集計が入る予定で、統合のときにオーケストレータがまとめる。
// matrix は data.matrix(year)(47×47 を行優先に並べた Int32Array。添字 o * 47 + d が o → d の人数)。
// 都道府県の添字は JIS コード − 1(0 が北海道、46 が沖縄県)。
import { selectionMask } from '../geometry/flows.js';

const N = 47;

/**
 * 都道府県ごとの転入・転出・差引。
 *  in[i]  = 他の都道府県から i への移動の合計
 *  out[i] = i から他の都道府県への移動の合計
 *  net[i] = in[i] − out[i]
 */
export function prefectureFlows(matrix) {
  const inn = new Int32Array(N);
  const out = new Int32Array(N);
  for (let o = 0; o < N; o++) {
    for (let d = 0; d < N; d++) {
      if (o === d) continue;
      const v = matrix[o * N + d];
      out[o] += v;
      inn[d] += v;
    }
  }
  const net = new Int32Array(N);
  for (let i = 0; i < N; i++) net[i] = inn[i] - out[i];
  return { in: inn, out, net };
}

/**
 * 選択地域から見た、相手先(選択地域の外の都道府県)ごとの値。
 * selection は state.selection(`{ type: 'pref', code }` または `{ type: 'metro', id }`)。
 *  in[p]  = 相手先 p から選択地域への移動(選択地域が複数の都道府県なら、その合計)
 *  out[p] = 選択地域から相手先 p への移動
 *  net[p] = in[p] − out[p]
 *  partners = 相手先の添字(昇順)
 *  total  = { in, out, net }: 全相手先の合計(選択地域の内部どうしの移動は含まない)
 * 選択がない(または空の)ときは null。
 */
export function partnerFlows(matrix, selection) {
  const mask = selectionMask(selection);
  const members = [];
  for (let i = 0; i < N; i++) if (mask[i]) members.push(i);
  if (!members.length) return null;
  const inn = new Int32Array(N);
  const out = new Int32Array(N);
  const net = new Int32Array(N);
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

/**
 * 行の並べ替え。rows は { index, in, out, net } を持つ配列(index は都道府県の添字)。
 * key: 'pref'(都道府県の並び = JIS コード順)| 'in' | 'out' | 'net'。dir: 1(昇順)| −1(降順)。
 * 同じ値は都道府県の並びで安定させる。新しい配列を返す。
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
 * 表の行を作る。
 *  選択なし: 47 都道府県の転入・転出・差引
 *  選択あり: 選択地域から見た相手先ごとの転入・転出・差引と、合計
 * 戻り値: { mode: 'national' | 'region', rows: [{ index, code, in, out, net }], total }
 *   total は region のときだけ { in, out, net }、national のときは null。
 */
export function tableRows(matrix, selection) {
  const region = partnerFlows(matrix, selection);
  if (!region) {
    const f = prefectureFlows(matrix);
    const rows = Array.from({ length: N }, (_, i) => ({ index: i, code: i + 1, in: f.in[i], out: f.out[i], net: f.net[i] }));
    return { mode: 'national', rows, total: null };
  }
  const rows = region.partners.map((p) => ({ index: p, code: p + 1, in: region.in[p], out: region.out[p], net: region.net[p] }));
  return { mode: 'region', rows, total: region.total };
}
