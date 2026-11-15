import { describe, expect, it } from 'vitest';
import { STEP } from '../src/geometry/constants.js';
import { selectionMask } from '../src/geometry/flows.js';
import { parseData } from '../src/data/loader.js';
import { geoLayout, lineLayout, nodePos } from '../src/geometry/layout.js';
import {
  CANDIDATES, CARRIED, GROUP_CANDIDATES, INDEX_OFFSET_H, INDEX_OFFSET_V, carryPose, indexDense, indexLayout, indexVisible, labelOrder, partnerTotals, placeLabels, volumeOrder,
} from '../src/ui/labels.js';
import { rectsOverlap } from '../src/ui/avoid.js';
import { placeTooltip, tooltipContent } from '../src/ui/tooltip.js';
import { formatCount as fmtInt, formatSigned as fmtSigned, prefFlow as prefFlows } from '../src/data/stats.js';
import tooltipDict, { shortName } from '../src/i18n/tooltip.js';
import { PREF_EN, PREF_JA } from '../src/i18n/common.js';
import { fixture } from './helpers.js';

const data = parseData({ od: fixture('od.json'), prefectures: fixture('prefectures.json'), topology: fixture('japan.topojson') });
const matrix = data.matrix(2014);
const geo = geoLayout(data.prefectures).pos;
const line = lineLayout();

// 斜め俯瞰に近い画面位置(地理配置を拡大して画面に置く)
function screenPoints(w = 1440, h = 900) {
  return geo.map(([x, z]) => ({ x: w / 2 + x * 0.8, y: h / 2 + z * 1.0 + x * 0.15 }));
}

describe('文言', () => {
  it('短い名前は「都」「府」「県」を省く(北海道・英語はそのまま)', () => {
    expect(PREF_JA.map((_, i) => shortName(i, PREF_JA)).slice(0, 3)).toEqual(['北海道', '青森', '岩手']);
    expect(shortName(12, PREF_JA)).toBe('東京');
    expect(shortName(25, PREF_JA)).toBe('京都');
    expect(shortName(26, PREF_JA)).toBe('大阪');
    expect(shortName(12, PREF_EN)).toBe('Tokyo');
  });

  it('strings.md の tooltip.* がそろっている', () => {
    for (const k of ['tooltip.flow', 'tooltip.pair', 'tooltip.pref', 'tooltip.small']) {
      expect(tooltipDict.ja[k]).toBeTruthy();
      expect(tooltipDict.en[k]).toBeTruthy();
    }
    expect(tooltipDict.ja['tooltip.flow']).toBe('{from} → {to}:{n}人({year}年)');
  });
});

describe('ツールチップの数値', () => {
  it('書式: 桁区切りはカンマ、差引には符号(マイナスは U+2212)', () => {
    expect(fmtInt(1234567)).toBe('1,234,567');
    expect(fmtSigned(414)).toBe('+414');
    expect(fmtSigned(-11542)).toBe('−11,542');
    expect(fmtSigned(0)).toBe('0');
  });

  it('都道府県: 転入・転出・差引がデータと一致する', () => {
    for (const i of [0, 12, 26, 46]) {
      let inn = 0, out = 0;
      for (let j = 0; j < 47; j++) {
        if (j === i) continue;
        inn += matrix[j * 47 + i];
        out += matrix[i * 47 + j];
      }
      expect(prefFlows(matrix, i)).toEqual({ in: inn, out, net: inn - out });
      const c = tooltipContent({ type: 'pref', code: i + 1 }, { matrix, year: 2014, lang: 'ja' });
      expect(c).toMatchObject({ kind: 'pref', in: inn, out, net: inn - out, name: shortName(i, PREF_JA) });
      expect(c.label).toContain(fmtInt(inn));
      expect(c.label).toContain(fmtSigned(inn - out));
    }
  });

  it('弧: 人数・逆向き・年がデータと一致する。移動前 → 移動後', () => {
    const c = tooltipContent({ type: 'arc', o: 26, d: 12 }, { matrix, year: 2014, lang: 'ja' });
    expect(c).toMatchObject({ kind: 'arc', from: '大阪', to: '東京', n: matrix[26 * 47 + 12], reverse: matrix[12 * 47 + 26], year: 2014 });
    expect(c.label).toBe(`大阪 ⇄ 東京:${fmtInt(c.n)}人 / ${fmtInt(c.reverse)}人(2014年)`);
    const e = tooltipContent({ type: 'arc', o: 12, d: 26 }, { matrix, year: 2014, lang: 'en' });
    expect(e).toMatchObject({ from: 'Tokyo', to: 'Osaka', n: matrix[12 * 47 + 26] });
  });

  it('逆向きが 0 のときは一方向の文、100 人未満は small', () => {
    const m = new Int32Array(2209);
    m[3 * 47 + 20] = 40;
    const c = tooltipContent({ type: 'arc', o: 3, d: 20 }, { matrix: m, year: 2020, lang: 'ja' });
    expect(c.small).toBe(true);
    expect(c.reverse).toBe(0);
    expect(c.label).toBe('宮城 → 岐阜:40人(2020年)');
  });

  it('hover が null なら null', () => {
    expect(tooltipContent(null, { matrix, year: 2014, lang: 'ja' })).toBeNull();
  });
});

describe('placeTooltip', () => {
  const base = { w: 200, h: 60, vw: 1000, vh: 700 };
  it('ポインタの右下へ 12px', () => {
    expect(placeTooltip({ ...base, x: 100, y: 100 })).toEqual({ x: 112, y: 112 });
  });
  it('右端・下端からはみ出すときは左・上へ反転する', () => {
    expect(placeTooltip({ ...base, x: 900, y: 100 })).toEqual({ x: 900 - 12 - 200, y: 112 });
    expect(placeTooltip({ ...base, x: 100, y: 680 })).toEqual({ x: 112, y: 680 - 12 - 60 });
  });
  it('固定の UI にかかる向きは避ける', () => {
    const avoid = [{ left: 100, top: 100, right: 400, bottom: 250 }];
    const p = placeTooltip({ ...base, x: 90, y: 90, avoid });
    const r = { left: p.x, top: p.y, right: p.x + 200, bottom: p.y + 60 };
    expect(rectsOverlap(r, avoid[0])).toBe(false);
  });
});

describe('ラベルの優先度', () => {
  it('相手先は、選択地域との転入と転出の合計が多い順(選択地域の外)', () => {
    const sel = { type: 'metro', id: 'tokyo' };
    const mask = selectionMask(sel);
    const top = partnerTotals(matrix, mask, 6);
    expect(top).toHaveLength(6);
    const sum = (i) => [...mask].reduce((a, m, k) => a + (m ? matrix[k * 47 + i] + matrix[i * 47 + k] : 0), 0);
    for (let k = 1; k < top.length; k++) expect(sum(top[k - 1])).toBeGreaterThanOrEqual(sum(top[k]));
    expect(top.some((i) => mask[i])).toBe(false);
    for (let i = 0; i < 47; i++) if (!mask[i] && !top.includes(i)) expect(sum(i)).toBeLessThanOrEqual(sum(top[5]));
  });

  it('全国: 16 個まで。ホバー → 端点 → 動きの大きい順', () => {
    const volume = volumeOrder(matrix);
    const o = labelOrder({ hover: 30, selection: null, volume });
    expect(o).toHaveLength(16);
    expect(o[0]).toMatchObject({ i: 30, cls: 'em', force: true });
    expect(o.slice(1, 4).map((x) => x.i)).toEqual([0, 46, 45]);
    expect(new Set(o.map((x) => x.key)).size).toBe(16);
  });

  it('圏を選んでいるときは、圏の名前 1 つ + 相手先 6 + 端点だけ(構成県の名前は出さない)', () => {
    const sel = { type: 'metro', id: 'tokyo' };
    const partners = partnerTotals(matrix, selectionMask(sel));
    const o = labelOrder({ selection: sel, partners, volume: volumeOrder(matrix) });
    expect(o[0]).toMatchObject({ group: true, cls: 'sel group' });
    const prefs = o.filter((x) => !x.group).map((x) => x.i);
    for (const code of [11, 12, 13, 14]) expect(prefs).not.toContain(code - 1);
    expect(o.filter((x) => x.cls === 'partner')).toHaveLength(6);
    expect(o.length).toBeLessThanOrEqual(1 + 6 + 3);
  });

  it('都道府県を選んでいるとき、その県は sel。ホバー中の県が選択中なら sel のまま', () => {
    const sel = { type: 'pref', code: 13 };
    const o = labelOrder({ hover: 12, selection: sel });
    expect(o[0]).toMatchObject({ i: 12, cls: 'sel' });
    expect(o.filter((x) => x.i === 12)).toHaveLength(1);
  });

  it('ホバー中は、上限を超えても常に出す', () => {
    const o = labelOrder({ hover: 40, selection: null, volume: volumeOrder(matrix) });
    expect(o.some((x) => x.i === 40)).toBe(true);
  });
});

describe('placeLabels(貪欲な配置)', () => {
  const bounds = { width: 1440, height: 900 };
  const pts = screenPoints();
  const size = (i) => ({ w: 12 + (i % 3) * 11, h: 11 });
  const mk = (order) =>
    order.map((o) => (o.group ? { ...o, x: 700, y: 400, w: 44, h: 13 } : { ...o, x: pts[o.i].x, y: pts[o.i].y, ...size(o.i) }));

  function check(items, res, { fixed = [], points = [] } = {}) {
    const rects = [];
    res.forEach((r, k) => {
      if (!r) return;
      rects.push({ r, item: items[k] });
      expect(r.left).toBeGreaterThanOrEqual(8);
      expect(r.top).toBeGreaterThanOrEqual(8);
      expect(r.right).toBeLessThanOrEqual(bounds.width - 8);
      expect(r.bottom).toBeLessThanOrEqual(bounds.height - 8);
    });
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) expect(rectsOverlap(rects[a].r, rects[b].r, 3 - 1e-9), `${rects[a].item.key} / ${rects[b].item.key}`).toBe(false);
      for (const f of fixed) expect(rectsOverlap(rects[a].r, f, 6 - 1e-9)).toBe(false);
      for (const p of points) {
        if (p.key === rects[a].item.key) continue;
        const r = rects[a].r;
        expect(p.x > r.left - 4 && p.x < r.right + 4 && p.y > r.top - 4 && p.y < r.bottom + 4).toBe(false);
      }
    }
  }

  it('全国(16 個): 互いに重ならず、画面の端から 8px 以上離れる', () => {
    const items = mk(labelOrder({ selection: null, volume: volumeOrder(matrix) }));
    const res = placeLabels({ items, bounds });
    check(items, res);
    expect(res.filter(Boolean).length).toBeGreaterThanOrEqual(12);
  });

  it('圏の選択: 圏の名前が構成県の点を覆わず、ほかのラベルとも重ならない', () => {
    const sel = { type: 'metro', id: 'tokyo' };
    const mask = selectionMask(sel);
    const items = mk(labelOrder({ selection: sel, partners: partnerTotals(matrix, mask), volume: [] }));
    const cx = [11, 12, 13, 14].reduce((a, c) => a + pts[c - 1].x / 4, 0);
    const cy = [11, 12, 13, 14].reduce((a, c) => a + pts[c - 1].y / 4, 0);
    items[0].x = cx;
    items[0].y = cy;
    const points = [11, 12, 13, 14].map((c) => ({ ...pts[c - 1], key: `p${c - 1}` }));
    const fixed = [{ left: 1100, top: 96, right: 1400, bottom: 300 }, { left: 424, top: 800, right: 1082, bottom: 864 }];
    const res = placeLabels({ items, bounds, fixed, points });
    check(items, res, { fixed, points });
    expect(res[0]).not.toBeNull();
    // 圏の名前は北西か北東(点の集まりから離して置く)を先に試す
    expect(GROUP_CANDIDATES.slice(0, 2).map((c) => c.name)).toEqual(['gNW', 'gNE']);
    expect(res[0].cand).toBeLessThan(2);
  });

  it('候補は東 → 西 → 北 → 南 → 北西 → 北東の順に試す。東が空いていれば東', () => {
    expect(CANDIDATES.map((c) => c.name)).toEqual(['E', 'W', 'N', 'S', 'NW', 'NE']);
    const items = [{ key: 'p1', i: 1, x: 500, y: 400, w: 30, h: 11 }];
    const [r] = placeLabels({ items, bounds });
    expect(r.cand).toBe(0);
    expect(r.left).toBe(507);
  });

  it('東がふさがっていれば次の候補。全部ふさがっていれば置かない(force は置く)', () => {
    const blocker = { key: 'b', i: 2, x: 530, y: 400, w: 200, h: 11 };
    const a = { key: 'a', i: 1, x: 500, y: 400, w: 30, h: 11 };
    const [rb, ra] = placeLabels({ items: [blocker, a], bounds });
    expect(rb.cand).toBe(0);
    expect(ra.cand).not.toBe(0);
    // 全方向を固定の UI でふさぐ
    const fixed = [{ left: 0, top: 0, right: 1440, bottom: 900 }];
    expect(placeLabels({ items: [a], bounds, fixed })[0]).toBeNull();
    expect(placeLabels({ items: [{ ...a, force: true }], bounds, fixed })[0]).not.toBeNull();
  });

  it('ヒステリシス: 前回の候補が空いていれば、そこに残す', () => {
    const items = [{ key: 'p1', i: 1, x: 500, y: 400, w: 30, h: 11 }];
    const first = placeLabels({ items, bounds, prev: new Map([['p1', 3]]) });
    expect(first[0].cand).toBe(3);
    // 前回の候補がふさがれたら、通常の順に戻る
    const blocker = { key: 'b', x: 500, y: 421, w: 80, h: 11 };
    const again = placeLabels({ items: [blocker, ...items], bounds, prev: new Map([['p1', 3]]) });
    expect(again[1].cand).not.toBe(3);
  });

  it('画面の端のラベルは、はみ出さない向きへ回る', () => {
    const items = [{ key: 'p1', i: 1, x: 1430, y: 400, w: 30, h: 11 }];
    const [r] = placeLabels({ items, bounds });
    expect(r.right).toBeLessThanOrEqual(bounds.width - 8);
  });
});

describe('真横の索引', () => {
  // 画面: 並びの長さを 910px(デスクトップ)、606px(縦画面)にする
  const make = (len, vertical) => {
    const scale = len / (46 * STEP);
    const px = new Float64Array(47);
    const py = new Float64Array(47);
    for (let i = 0; i < 47; i++) {
      const along = 256 + (i * STEP + 0) * scale;
      if (vertical) { px[i] = 195; py[i] = 72 + (i * STEP) * scale; } else { px[i] = along; py[i] = 440; }
    }
    return { px, py, scale };
  };

  it('デスクトップ: 並びの線から 132px 下、x は各点に合わせ、47 個が重ならない(縦書きの幅 11px)', () => {
    const { px, py, scale } = make(910, false);
    const pos = indexLayout(px, py, scale, 'v');
    expect(pos[0].y - 440).toBeCloseTo(132, 0);
    pos.forEach((p, i) => expect(p.x).toBe(px[i]));
    const rects = pos.map((p) => ({ left: p.x - 5.5, right: p.x + 5.5, top: p.y, bottom: p.y + 60 }));
    for (let a = 0; a < 47; a++) for (let b = a + 1; b < 47; b++) expect(rectsOverlap(rects[a], rects[b])).toBe(false);
    expect(INDEX_OFFSET_V * scale).toBeCloseTo(132, 0);
  });

  it('縦画面: 並びの線から右へ 98px、y は各点に合わせ、47 個が重ならない(行の高さ 10.5px)', () => {
    const { px, py, scale } = make(606, true);
    const pos = indexLayout(px, py, scale, 'h');
    expect(pos[0].x - 195).toBeCloseTo(98, 0);
    pos.forEach((p, i) => expect(p.y).toBe(py[i]));
    const rects = pos.map((p) => ({ left: p.x, right: p.x + 40, top: p.y - 5.25, bottom: p.y + 5.25 }));
    for (let a = 0; a < 47; a++) for (let b = a + 1; b < 47; b++) expect(rectsOverlap(rects[a], rects[b])).toBe(false);
    expect(INDEX_OFFSET_H * scale).toBeCloseTo(98, 0);
  });

  it('縦画面で高さ 700px 未満: 北海道から数えて偶数番目だけ(選択中・ホバー中・章の県は残す)', () => {
    const o = { portrait: true, height: 600, protect: new Set([3]) };
    expect(indexVisible(0, o)).toBe(true);
    expect(indexVisible(1, o)).toBe(false);
    expect(indexVisible(2, o)).toBe(true);
    expect(indexVisible(3, o)).toBe(true);
    expect(indexVisible(5, o)).toBe(false);
    expect(indexVisible(1, { ...o, height: 844 })).toBe(true);
    expect(indexVisible(1, { ...o, portrait: false })).toBe(true);
  });

  it('地理配置の点でも、nodePos と索引の前提(一直線)が合う', () => {
    const p = line.map((_, i) => nodePos(line, geo, i, 0));
    expect(p[46][0] - p[0][0]).toBeCloseTo(46 * STEP, 6);
  });
});

describe('変形の途中のラベル(carryPose)', () => {
  it('運ぶラベルは両端(北海道・沖縄県)と三大都市圏の中心を含む', () => {
    for (const i of [0, 46, 12, 22, 26]) expect(CARRIED).toContain(i);
  });

  it('横長: 索引の位置(点の下)から点の東へ運び、morph 0.5 で縦書きから横書きへ移る(そこで 0.3 まで薄くなる)', () => {
    const a = carryPose(0, 'v', 0.8);
    expect([a.dx, a.dy]).toEqual([0, INDEX_OFFSET_V * 0.8]);
    expect(a.vertical).toBe(true);
    expect(a.carried).toBe(1);
    expect(a.others).toBe(1);
    const m = carryPose(0.5, 'v', 0.8);
    expect(m.vertical).toBe(false);
    expect(m.carried).toBeCloseTo(0.3, 9);
    expect(m.others).toBe(0); // 運ばないラベルは動き始めに消える
    const b = carryPose(1, 'v', 0.8);
    expect([b.dx, b.dy]).toEqual([7, 0]);
    expect(b.carried).toBe(1);
  });

  it('縦画面: 索引(点の右)から点の東へ、横書きのまま運ぶ', () => {
    const a = carryPose(0, 'h', 0.5);
    expect([a.dx, a.dy]).toEqual([INDEX_OFFSET_H * 0.5, 0]);
    expect(carryPose(0.5, 'h', 0.5).vertical).toBe(false);
    expect(carryPose(0.5, 'h', 0.5).carried).toBe(1);
  });
});

describe('詰まった縦書きの索引(幅 1024px 前後)', () => {
  it('列の間隔が 14px 未満(英語は 16px 未満)なら、10px にして 1 つおきに出す。守るものは常に出す', () => {
    expect(indexDense(13.9, 'ja')).toBe(true);
    expect(indexDense(14, 'ja')).toBe(false);
    expect(indexDense(15, 'en')).toBe(true);
    expect(indexDense(16, 'en')).toBe(false);
    const o = { portrait: false, height: 768, protect: new Set([5]), dense: true };
    expect(indexVisible(0, o)).toBe(true);
    expect(indexVisible(1, o)).toBe(false);
    expect(indexVisible(5, o)).toBe(true);
    expect(indexVisible(1, { ...o, dense: false })).toBe(true);
  });
});
