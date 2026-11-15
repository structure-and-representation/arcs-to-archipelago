import { describe, expect, it } from 'vitest';
import { arcList, selectionMask, sideOf } from '../src/geometry/flows.js';
import { createArcsLayer } from '../src/scene/arcs.js';
import { RENDER_ORDER, createShared } from '../src/scene/shared.js';
import { prefectures } from './helpers.js';

const list = arcList();
const make = () => {
  const shared = createShared({ prefectures: prefectures() });
  shared.setTheme('paper');
  const layer = createArcsLayer({ shared, data: {}, arcList: list });
  const [below, above, hover] = layer.object3D.children;
  return { shared, layer, below, above, hover, dyn: below.geometry.getAttribute('aDyn').array };
};
const still = { time: 0, dt: 0.016, reducedMotion: true };
const sideAt = (dyn, k) => dyn[k * 2];
const alphaAt = (dyn, k) => dyn[k * 2 + 1];
const sels = [null, { type: 'pref', code: 13 }, { type: 'metro', id: 'tokyo' }, { type: 'metro', id: 'osaka' }];

describe('createArcsLayer の構成', () => {
  it('地下・地上・ホバーの 3 つの Mesh を、RENDER_ORDER どおりに持つ', () => {
    const { layer, below, above, hover } = make();
    expect(layer.object3D.children).toHaveLength(3);
    expect(below.renderOrder).toBe(RENDER_ORDER.arcsBelow);
    expect(above.renderOrder).toBe(RENDER_ORDER.arcsAbove);
    expect(hover.renderOrder).toBeGreaterThan(RENDER_ORDER.nodes);
    expect(layer.object3D.renderOrder).toBe(0); // Group には付けない
  });

  it('1 本ぶんのリボン(48 区間)を全弧ぶんのインスタンスで描き、地下と地上でジオメトリを共有する', () => {
    const { below, above } = make();
    const g = below.geometry;
    expect(above.geometry).toBe(g);
    expect(g.instanceCount).toBe(2162);
    expect(g.getAttribute('position').count).toBe(49 * 2);
    expect(g.index.count).toBe(48 * 6);
    const arc = g.getAttribute('aArc').array;
    for (const k of [0, 1, 45, 46, 1000, 2161]) {
      expect([arc[k * 2], arc[k * 2 + 1]]).toEqual(list.pair(k));
    }
  });

  it('素材は透明・DoubleSide・深度なし', () => {
    const { below, above } = make();
    for (const m of [below, above]) {
      expect(m.material.transparent).toBe(true);
      expect(m.material.side).toBe(2); // THREE.DoubleSide
      expect(m.material.depthTest).toBe(false);
    }
    expect(below.material.uniforms.uHalf.value).toBe(-1);
    expect(above.material.uniforms.uHalf.value).toBe(1);
  });
});

describe('side(setSelection)', () => {
  it('選択なしの初期状態は sideOf と同じで、すべての弧が見える', () => {
    const { dyn } = make();
    for (let k = 0; k < list.length; k++) {
      expect(sideAt(dyn, k)).toBe(sideOf(list.o[k], list.d[k], null));
      expect(alphaAt(dyn, k)).toBe(1);
    }
  });

  for (const selection of sels) {
    it(`選択 ${JSON.stringify(selection)}: 落ち着いたあとの side が sideOf と一致し、side = 0 の弧は消える`, () => {
      const { layer, dyn } = make();
      layer.setSelection(new Uint8Array(47)); // 最初の呼び出し(アニメーションなし)
      layer.setSelection(selectionMask(selection));
      layer.update(still); // 動きを減らす設定は即座に切り替わる
      for (let k = 0; k < list.length; k++) {
        const s = sideOf(list.o[k], list.d[k], selection);
        if (s === 0) {
          expect(alphaAt(dyn, k)).toBe(0);
        } else {
          expect(sideAt(dyn, k)).toBe(s);
          expect(alphaAt(dyn, k)).toBe(1);
        }
      }
    });
  }

  it('最初の setSelection はアニメーションせずに置く', () => {
    const { layer, dyn } = make();
    layer.setSelection(selectionMask(sels[1]));
    for (let k = 0; k < list.length; k++) {
      const s = sideOf(list.o[k], list.d[k], sels[1]);
      expect(alphaAt(dyn, k)).toBe(s === 0 ? 0 : 1);
    }
  });

  it('side は滑らかに補間される(地下 → 地上は 0 を通り、単調)', () => {
    const { layer, dyn } = make();
    layer.setSelection(new Uint8Array(47));
    layer.setSelection(selectionMask(sels[1]));
    // 東京(添字 12)へ向かう弧のうち、選択なしでは地下(o < d)で、選択すると地上(転入)になるもの
    const k = list.indexOf(0, 12);
    expect(sideOf(0, 12, null)).toBe(-1);
    expect(sideOf(0, 12, sels[1])).toBe(1);
    const trace = [];
    for (let i = 0; i < 60; i++) {
      layer.update({ time: i, dt: 0.02, reducedMotion: false });
      trace.push(sideAt(dyn, k));
    }
    expect(trace[0]).toBeGreaterThan(-1);
    for (let i = 1; i < trace.length; i++) expect(trace[i]).toBeGreaterThanOrEqual(trace[i - 1]);
    expect(trace.some((v) => Math.abs(v) < 0.1)).toBe(true);
    expect(trace[trace.length - 1]).toBe(1);
  });

  it('描かなくなる弧は、側を保ったまま薄くなる。現れる弧は新しい側で薄いところから現れる', () => {
    const { layer, dyn } = make();
    layer.setSelection(new Uint8Array(47));
    layer.setSelection(selectionMask(sels[1]));
    const hidden = list.indexOf(5, 6); // 東京に関わらない
    const shown = list.indexOf(0, 12);
    const sideBefore = sideAt(dyn, hidden);
    layer.update({ time: 0, dt: 0.3, reducedMotion: false });
    expect(alphaAt(dyn, hidden)).toBeGreaterThan(0);
    expect(alphaAt(dyn, hidden)).toBeLessThan(1);
    expect(sideAt(dyn, hidden)).toBe(sideBefore);
    layer.update({ time: 0, dt: 1, reducedMotion: false });
    expect(alphaAt(dyn, hidden)).toBe(0);

    // 選択を外すと、消えていた弧は新しい側(元の side)で現れる
    layer.setSelection(new Uint8Array(47));
    layer.update({ time: 0, dt: 0.02, reducedMotion: false });
    expect(sideAt(dyn, hidden)).toBe(sideOf(5, 6, null));
    expect(alphaAt(dyn, hidden)).toBeGreaterThan(0);
    layer.update({ time: 0, dt: 1, reducedMotion: false });
    expect(alphaAt(dyn, shown)).toBe(1);
    expect(sideAt(dyn, shown)).toBe(-1);
  });

  it('補間の途中で選択が変わったら、そのときの値から新しい目標へ向かう', () => {
    const { layer, dyn } = make();
    layer.setSelection(new Uint8Array(47));
    layer.setSelection(selectionMask(sels[1]));
    const k = list.indexOf(0, 12);
    layer.update({ time: 0, dt: 0.3, reducedMotion: false });
    const mid = sideAt(dyn, k);
    layer.setSelection(new Uint8Array(47));
    layer.update({ time: 0, dt: 0.001, reducedMotion: false });
    expect(Math.abs(sideAt(dyn, k) - mid)).toBeLessThan(0.05);
    layer.update({ time: 0, dt: 2, reducedMotion: false });
    expect(sideAt(dyn, k)).toBe(-1);
  });

  it('ジオメトリと属性は作り直さず、選択の切り替えは aDyn の更新だけで済む', () => {
    const { layer, below, dyn } = make();
    const g = below.geometry, arc = g.getAttribute('aArc'), pos = g.getAttribute('position');
    layer.setSelection(new Uint8Array(47));
    layer.setSelection(selectionMask(sels[2]));
    layer.update(still);
    layer.setHover({ o: 0, d: 12 });
    expect(below.geometry).toBe(g);
    expect(g.getAttribute('aArc')).toBe(arc);
    expect(g.getAttribute('position')).toBe(pos);
    expect(g.getAttribute('aDyn').array).toBe(dyn);
  });
});

describe('見た目の値(デザイン仕様 §6)', () => {
  const style = (m) => [m.material.uniforms.uWidth.value, m.material.uniforms.uAlpha.value];

  it('全国・紙: 線幅 0.7px、不透明度 0.10', () => {
    const { layer, below, above } = make();
    layer.update(still);
    expect(style(below)[0]).toBeCloseTo(0.7, 10);
    expect(style(below)[1]).toBeCloseTo(0.1, 10);
    expect(style(above)).toEqual(style(below));
  });

  it('全国・墨: 不透明度 0.085', () => {
    const { layer, below } = make();
    layer.setTheme('ink');
    layer.update(still);
    expect(style(below)[1]).toBeCloseTo(0.085, 10);
  });

  it('地域を選んでいるとき: 線幅 0.8px、不透明度 紙 0.30 / 墨 0.26', () => {
    const { layer, below } = make();
    layer.setSelection(new Uint8Array(47));
    layer.setSelection(selectionMask(sels[1]));
    layer.update(still);
    expect(style(below)[0]).toBeCloseTo(0.8, 10);
    expect(style(below)[1]).toBeCloseTo(0.3, 10);
    layer.setTheme('ink');
    expect(style(below)[1]).toBeCloseTo(0.26, 10);
  });

  it('選択の見た目は補間される(途中の値は全国と選択の間)', () => {
    const { layer, below } = make();
    layer.setSelection(new Uint8Array(47));
    layer.setSelection(selectionMask(sels[1]));
    layer.update({ time: 0, dt: 0.3, reducedMotion: false });
    const [w, a] = style(below);
    expect(w).toBeGreaterThan(0.7);
    expect(w).toBeLessThan(0.8);
    expect(a).toBeGreaterThan(0.1);
    expect(a).toBeLessThan(0.3);
  });
});

describe('setHover', () => {
  it('指定した弧を朱・線幅 1.0px・不透明度 0.95 で、最前面の Mesh に描く', () => {
    const { layer, hover } = make();
    expect(hover.visible).toBe(false);
    layer.setHover({ o: 26, d: 12 });
    layer.update(still);
    const g = hover.geometry;
    expect(hover.visible).toBe(true);
    expect(g.instanceCount).toBe(1);
    expect([...g.getAttribute('aArc').array]).toEqual([26, 12]);
    expect(g.getAttribute('aDyn').array[0]).toBe(sideOf(26, 12, null));
    expect(hover.material.uniforms.uUseAccent.value).toBe(1);
    expect(hover.material.uniforms.uWidth.value).toBe(1);
    expect(hover.material.uniforms.uAlpha.value).toBeCloseTo(0.95, 10);
    layer.setHover(null);
    expect(hover.visible).toBe(false);
    expect(g.instanceCount).toBe(0);
  });

  it('描かない弧(side = 0)にはホバーを出さない', () => {
    const { layer, hover } = make();
    layer.setSelection(new Uint8Array(47));
    layer.setSelection(selectionMask(sels[1]));
    layer.update(still);
    layer.setHover({ o: 5, d: 6 });
    expect(hover.visible).toBe(false);
    layer.setHover({ o: 0, d: 12 });
    expect(hover.visible).toBe(true);
  });
});
