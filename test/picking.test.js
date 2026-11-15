import { describe, expect, it } from 'vitest';
import { arcPoint } from '../src/geometry/arc.js';
import { arcList, sideOf } from '../src/geometry/flows.js';
import { geoLayout, lineLayout, nodePos } from '../src/geometry/layout.js';
import { parseData } from '../src/data/loader.js';
import { createInteraction, createPicker, SETTLE_MS, TIE_PX } from '../src/scene/picking.js';
import { createStore } from '../src/state.js';
import { fixture, IDX } from './helpers.js';

const data = parseData({ od: fixture('od.json'), prefectures: fixture('prefectures.json'), topology: fixture('japan.topojson') });
const line = lineLayout();
const geo = geoLayout(data.prefectures).pos;

// world → CSS px のアフィン 2x4(斜めから見た正投影に近い値)。sy は y が上なので m5 が負。
const SCREEN = Float64Array.from([0.8, 0, 0.1, 720, 0.25, -0.9, 0.55, 420]);
const clock = () => {
  const c = { t: 1000, now: () => c.t };
  return c;
};

function view(over = {}) {
  return { selection: null, morph: 0.7, lean: 0.5, screen: SCREEN, ...over };
}

/** 指定した弧だけに人数を入れた行列 */
function matrixOf(arcs) {
  const m = new Int32Array(2209);
  for (const [o, d, v] of arcs) m[o * 47 + d] = v;
  return m;
}

/** 弧 (o, d) の上の点(CSS px)。arcPoint で求めて画面へ射影する */
function screenPoint(o, d, t, s) {
  const side = sideOf(o, d, s.selection);
  const out = arcPoint(nodePos(line, geo, o, s.morph), nodePos(line, geo, d, s.morph), side, s.lean, t, [0, 0, 0]);
  const m = s.screen;
  return [m[0] * out[0] + m[1] * out[1] + m[2] * out[2] + m[3], m[4] * out[0] + m[5] * out[1] + m[6] * out[2] + m[7]];
}

function make(matrix, over = {}) {
  const c = clock();
  const picker = createPicker(data, { now: c.now });
  const s = { ...view(over), matrix, mask: new Uint8Array(47) };
  picker.rebuild(s);
  c.t += SETTLE_MS + 1;
  return { picker, s, c };
}

describe('pickArc', () => {
  it('弧の上の点で、その弧を返す(arcPoint の点を画面へ射影して確かめる)', () => {
    const arcs = [[26, 12, 5000], [0, 45, 800], [40, 46, 300], [12, 26, 7000], [3, 20, 1200]];
    for (const morph of [0, 0.7, 1]) {
      for (const lean of [0, 0.5, 0.9]) {
        for (const [o, d, v] of arcs) {
          const { picker, s } = make(matrixOf([[o, d, v]]), { morph, lean });
          for (const t of [0.2, 0.5, 0.8]) {
            const [x, y] = screenPoint(o, d, t, s);
            expect(picker.pickArc(x, y), `${o}→${d} morph=${morph} lean=${lean} t=${t}`).toEqual({ o, d });
            // 弧から 3px ずれた点でも半径内
            expect(picker.pickArc(x + 3, y + 3)).toEqual({ o, d });
          }
        }
      }
    }
  });

  it('弧から離れた点では null を返す', () => {
    const { picker, s } = make(matrixOf([[26, 12, 5000], [0, 45, 800]]));
    expect(picker.pickArc(-500, -500)).toBeNull();
    expect(picker.pickArc(5000, 5000)).toBeNull();
    const [x, y] = screenPoint(26, 12, 0.5, s);
    expect(picker.pickArc(x, y + 40)).toBeNull();
    expect(picker.pickArc(x, y + 40, 50)).toEqual({ o: 26, d: 12 }); // 半径を広げれば拾う
  });

  it('人数が 0 の弧は返さない', () => {
    const { picker, s } = make(matrixOf([[26, 12, 5000]]));
    const [x, y] = screenPoint(12, 26, 0.5, s);
    // 12 → 26 は 0 人。26 → 12 が真上にあるときは別の弧なので、離れた位置で確かめる
    const [qx, qy] = screenPoint(0, 45, 0.5, s);
    expect(picker.pickArc(qx, qy)).toBeNull();
    expect(x).toBeTypeOf('number');
    expect(picker.liveCount).toBe(1);
  });

  it('選択中は、描かれていない弧を返さない(転入は地上、転出は地下、無関係は描かない)', () => {
    const selection = { type: 'pref', code: 13 }; // 東京
    const tokyo = IDX.tokyo;
    const arcs = [[IDX.osaka, tokyo, 5000], [tokyo, IDX.sapporo, 3000], [40, 46, 4000]];
    const { picker, s } = make(matrixOf(arcs), { selection });
    expect(sideOf(40, 46, selection)).toBe(0);
    expect(picker.pickArc(...screenPoint(IDX.osaka, tokyo, 0.5, s))).toEqual({ o: IDX.osaka, d: tokyo });
    expect(picker.pickArc(...screenPoint(tokyo, IDX.sapporo, 0.5, s))).toEqual({ o: tokyo, d: IDX.sapporo });
    // 描かれていない弧(福岡 → 沖縄)の上の点。選択なしの側で求めた位置
    const [x, y] = screenPoint(40, 46, 0.5, { ...s, selection: null });
    expect(picker.pickArc(x, y)).toBeNull();
    expect(picker.liveCount).toBe(2);
  });

  it('圏の選択でも、圏の内部の弧は返さない', () => {
    const selection = { type: 'metro', id: 'tokyo' };
    const { picker, s } = make(matrixOf([[10, 13, 9000], [IDX.osaka, 12, 4000]]), { selection });
    expect(picker.pickArc(...screenPoint(IDX.osaka, 12, 0.5, s))).toEqual({ o: IDX.osaka, d: 12 });
    // 圏の内部(埼玉 → 神奈川)は描かれない。選択なしの側で求めた点では、返っても別の弧
    expect(sideOf(10, 13, selection)).toBe(0);
    const [x, y] = screenPoint(10, 13, 0.5, { ...s, selection: null });
    const hit = picker.pickArc(x, y);
    expect(hit === null || (hit.o === IDX.osaka && hit.d === 12)).toBe(true);
    expect(picker.liveCount).toBe(1);
  });

  it('選択を変えて rebuild すると、描く弧が入れ替わる', () => {
    const matrix = matrixOf([[IDX.osaka, 22, 4000]]);
    const { picker, s, c } = make(matrix);
    const [x, y] = screenPoint(IDX.osaka, 22, 0.5, s);
    expect(picker.pickArc(x, y)).toEqual({ o: IDX.osaka, d: 22 });
    picker.rebuild({ ...s, selection: { type: 'pref', code: 13 } }); // 画面は同じなので動いた扱いにならない
    c.t += 1;
    expect(picker.pickArc(x, y)).toBeNull();
  });

  it('近くに複数の弧があるときは、距離が同程度なら人数の多い弧を返す', () => {
    // 北海道から出る 2 本は、始点の近くでほぼ重なる
    const small = [0, 10, 100];
    const big = [0, 20, 50000];
    const { picker, s } = make(matrixOf([small, big]), { morph: 0, lean: 0 });
    const [x, y] = screenPoint(0, 10, 0.06, s);
    // 前提: 大きい弧までの距離が、小さい弧までの距離(0)から TIE_PX 以内
    let near = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const [bx, by] = screenPoint(0, 20, i / 2000, s);
      near = Math.min(near, Math.hypot(bx - x, by - y));
    }
    expect(near).toBeLessThan(TIE_PX);
    expect(picker.pickArc(x, y)).toEqual({ o: 0, d: 20 });
    // 終点の近く(2 本が離れている所)では、近い方を返す
    const [x2, y2] = screenPoint(0, 10, 0.5, s);
    expect(picker.pickArc(x2, y2)).toEqual({ o: 0, d: 10 });
  });

  it('同程度に近くて人数が同じなら、近い方を返す', () => {
    const { picker, s } = make(matrixOf([[0, 10, 700], [0, 20, 700]]), { morph: 0, lean: 0 });
    const [x, y] = screenPoint(0, 10, 0.3, s);
    expect(picker.pickArc(x, y)).toEqual({ o: 0, d: 10 });
  });

  it('カメラが動いている間は null を返し、止まった後に作り直す', () => {
    const matrix = matrixOf([[26, 12, 5000]]);
    const { picker, s, c } = make(matrix);
    const [x, y] = screenPoint(26, 12, 0.5, s);
    expect(picker.pickArc(x, y)).toEqual({ o: 26, d: 12 });
    const v0 = picker.version;
    // 画面の行列が変わった(カメラの移動)
    const moved = Float64Array.from(SCREEN);
    moved[3] += 40;
    picker.rebuild({ ...s, screen: moved });
    expect(picker.isSettled()).toBe(false);
    expect(picker.pickArc(x + 40, y)).toBeNull();
    expect(picker.version).toBe(v0); // 動いている間は作り直さない
    c.t += SETTLE_MS - 1;
    expect(picker.pickArc(x + 40, y)).toBeNull();
    c.t += 2;
    expect(picker.isSettled()).toBe(true);
    expect(picker.pickArc(x + 40, y)).toEqual({ o: 26, d: 12 });
    expect(picker.version).toBe(v0 + 1);
    // 同じ状態の rebuild は、動いた扱いにしない
    picker.rebuild({ ...s, screen: moved });
    expect(picker.isSettled()).toBe(true);
  });

  it('morph や lean の変化も動きとして扱う', () => {
    const { picker, s } = make(matrixOf([[26, 12, 5000]]));
    picker.rebuild({ ...s, morph: s.morph + 0.01 });
    expect(picker.isSettled()).toBe(false);
  });

  it('全 2,162 本でも、作り直しと判定が十分に速い', () => {
    const matrix = data.matrix(2014);
    const c = clock();
    const picker = createPicker(data, { now: c.now });
    picker.rebuild({ ...view(), matrix, mask: new Uint8Array(47) });
    c.t += SETTLE_MS + 1;
    const t0 = performance.now();
    picker.pickArc(700, 400);
    const build = performance.now() - t0;
    expect(picker.liveCount).toBe(arcList().length - [...Array(2162).keys()].filter((k) => matrix[arcList().cell(k)] <= 0).length);
    const t1 = performance.now();
    for (let i = 0; i < 200; i++) picker.pickArc(300 + i * 3, 250 + (i % 20) * 12);
    const per = (performance.now() - t1) / 200;
    expect(build).toBeLessThan(200); // 余裕をみた上限(実測は数十 ms 以内)
    expect(per).toBeLessThan(3);
  });
});

describe('pickNode', () => {
  it('半径内の最も近い都道府県を返す。半径を渡せる', () => {
    const { picker } = make(matrixOf([]), { morph: 0, lean: 0 });
    const m = SCREEN;
    const p = nodePos(line, geo, IDX.tokyo, 0);
    const x = m[0] * p[0] + m[2] * p[1] + m[3];
    const y = m[4] * p[0] + m[6] * p[1] + m[7];
    expect(picker.pickNode(x + 2, y + 2)).toBe(IDX.tokyo);
    expect(picker.pickNode(x, y + 20)).toBeNull();
    expect(picker.pickNode(x, y + 20, 22)).toBe(IDX.tokyo);
  });
});

describe('createInteraction', () => {
  // 弧と点の判定を差し替えた picker
  function fake({ node = null, arc = null } = {}) {
    const f = { node, arc, settled: true, revision: 0, version: 0, nodeRadius: [], arcRadius: [] };
    f.pickNode = (x, y, r) => (f.nodeRadius.push(r), f.node);
    f.pickArc = (x, y, r) => (f.arcRadius.push(r), f.settled ? f.arc : null);
    f.isSettled = () => f.settled;
    return f;
  }
  const setup = (opts) => {
    const store = createStore();
    const picker = fake(opts);
    return { store, picker, it: createInteraction({ store, picker }) };
  };

  it('ポインタが動くと、点が近ければ都道府県、そうでなければ弧を hover に入れる', () => {
    const { store, picker, it } = setup({ node: 12, arc: { o: 1, d: 2 } });
    it.move(10, 10);
    expect(store.get().hover).toEqual({ type: 'pref', code: 13 });
    picker.node = null;
    it.move(11, 11);
    expect(store.get().hover).toEqual({ type: 'arc', o: 1, d: 2 });
    picker.arc = null;
    it.move(12, 12);
    expect(store.get().hover).toBeNull();
    it.leave();
    expect(store.get().hover).toBeNull();
  });

  it('click で都道府県の点を選択する。弧は選択しない', () => {
    const { store, picker, it } = setup({ node: 26, arc: null });
    it.click(0, 0);
    expect(store.get().selection).toEqual({ type: 'pref', code: 27 });
    picker.node = null;
    picker.arc = { o: 1, d: 2 };
    it.click(0, 0);
    expect(store.get().selection).toEqual({ type: 'pref', code: 27 });
  });

  it('タッチ: 1 回目のタップでツールチップ(hover)、同じ都道府県の 2 回目で選択', () => {
    const { store, picker, it } = setup({ node: 12 });
    it.tap(5, 5);
    expect(store.get().hover).toEqual({ type: 'pref', code: 13 });
    expect(store.get().selection).toBeNull();
    it.tap(6, 6);
    expect(store.get().selection).toEqual({ type: 'pref', code: 13 });
    expect(store.get().hover).toBeNull();
    // 別の都道府県を押したら、そちらのツールチップになる
    picker.node = 26;
    it.tap(50, 50);
    expect(store.get().hover).toEqual({ type: 'pref', code: 27 });
    expect(store.get().selection).toEqual({ type: 'pref', code: 13 });
    // タッチは大きめの半径で判定する
    expect(picker.nodeRadius.at(-1)).toBeGreaterThan(14);
  });

  it('タッチ: 弧は 1 回目で出し、2 回目で閉じる(選ばない)。何もない所で閉じる', () => {
    const { store, picker, it } = setup({ node: null, arc: { o: 3, d: 4 } });
    it.tap(5, 5);
    expect(store.get().hover).toEqual({ type: 'arc', o: 3, d: 4 });
    it.tap(5, 5);
    expect(store.get().hover).toBeNull();
    expect(store.get().selection).toBeNull();
    it.tap(5, 5);
    expect(store.get().hover).toEqual({ type: 'arc', o: 3, d: 4 });
    picker.arc = null;
    it.tap(900, 900);
    expect(store.get().hover).toBeNull();
  });

  it('refresh: 作り直し・カメラが止まったときに、最後のポインタの位置で判定し直す', () => {
    const { store, picker, it } = setup({ node: null, arc: { o: 1, d: 2 } });
    it.move(10, 10);
    expect(store.get().hover).toEqual({ type: 'arc', o: 1, d: 2 });
    // カメラが動き出す(rebuild が呼ばれ、判定は null)
    picker.settled = false;
    picker.revision++;
    it.refresh();
    expect(store.get().hover).toBeNull();
    // 止まった
    picker.settled = true;
    it.refresh();
    expect(store.get().hover).toEqual({ type: 'arc', o: 1, d: 2 });
    // 年や選択が変わって、弧がなくなった
    picker.arc = null;
    picker.revision++;
    it.refresh();
    expect(store.get().hover).toBeNull();
  });

  it('refresh: ポインタがない(タッチ・キーボード)ときは hover を触らない', () => {
    const { store, picker, it } = setup({ node: null, arc: { o: 1, d: 2 } });
    store.set({ hover: { type: 'pref', code: 5 } });
    picker.revision++;
    it.refresh();
    expect(store.get().hover).toEqual({ type: 'pref', code: 5 });
  });
});
