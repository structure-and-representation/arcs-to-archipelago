import { describe, expect, it } from 'vitest';
import {
  clampOrbit, cubicBezier, dragToAngles, easeCamera, figureRegion, isPortrait, MORPH_DELAY, projectPoint, reorient,
  screenAxes, SELECTION_ZOOM, topAzimuth, tween, USER_LIMITS, viewFor, viewOptions,
} from '../src/scene/camera.js';
import { createCameraRig } from '../src/scene/cameraRig.js';
import { createStore } from '../src/state.js';
import { geoLayout, lineLayout, nodePos } from '../src/geometry/layout.js';
import { selectionMask } from '../src/geometry/flows.js';
import { CAMERA_PRESETS, CX } from '../src/geometry/constants.js';
import { prefectures } from './helpers.js';

const geo = geoLayout(prefectures());
const layout = { line: lineLayout(), geo: geo.pos, northAngle: geo.northAngle, bounds: geo.bounds };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const SIZES = [[1440, 900], [390, 844]];

/** 視点 v での、47 都道府県の画面位置(CSS px)。 */
function nodesOnScreen(v, size) {
  return Array.from({ length: 47 }, (_, i) => {
    const p = nodePos(layout.line, layout.geo, i, v.morph);
    return projectPoint(v, [p[0], 0, p[1]], size);
  });
}
const inside = (pt, r, eps = 0.5) => pt[0] >= r.x0 - eps && pt[0] <= r.x1 + eps && pt[1] >= r.y0 - eps && pt[1] <= r.y1 + eps;
const opts = (w, h, selection = null) => viewOptions(w, h, selection);
const view = (preset, w, h, selection = null) => viewFor(preset, w / h, layout, opts(w, h, selection));

describe('viewFor: 定位置', () => {
  it('定位置の値は設計 §6 どおり(side: 0/0、oblique: -0.35/0.6、top: 真上)', () => {
    expect(CAMERA_PRESETS.side).toMatchObject({ azimuth: 0, elevation: 0, morph: 0, lean: 0 });
    expect(CAMERA_PRESETS.oblique).toMatchObject({ azimuth: -0.35, elevation: 0.6, morph: 1 });
    expect(CAMERA_PRESETS.oblique.lean).toBeGreaterThanOrEqual(0.5);
    expect(CAMERA_PRESETS.oblique.lean).toBeLessThanOrEqual(0.9);
    expect(viewFor('side', 1.6, layout)).toMatchObject({ elevation: 0, azimuth: 0, morph: 0, lean: 0, roll: 0 });
    expect(viewFor('oblique', 1.6, layout)).toMatchObject({ elevation: 0.6, azimuth: -0.35, morph: 1, lean: CAMERA_PRESETS.oblique.lean });
    const top = viewFor('top', 1.6, layout);
    expect(top.morph).toBe(1);
    expect(top.elevation).toBeCloseTo(Math.PI / 2, 9);
    expect(top.lean).toBeGreaterThanOrEqual(0.5);
    expect(top.lean).toBeLessThanOrEqual(0.9);
  });

  it('真上では、北が画面の上で、右が東になる(横長でも縦長でも)', () => {
    for (const [w, h] of SIZES) {
      const v = view('top', w, h);
      const { right, up } = screenAxes(v.azimuth, v.elevation, v.roll);
      const north = [Math.cos(geo.northAngle), 0, Math.sin(geo.northAngle)];
      const east = [-Math.sin(geo.northAngle), 0, Math.cos(geo.northAngle)];
      expect(dot(up, north)).toBeCloseTo(1, 9);
      expect(dot(right, east)).toBeCloseTo(1, 9);
      expect(v.azimuth).toBeCloseTo(topAzimuth(geo.northAngle), 9);
    }
  });

  it('縦長では、真横も斜め俯瞰も 90° 回して、北海道(x が小さい側)が上になる', () => {
    for (const preset of ['side', 'oblique']) {
      const wide = view(preset, 1440, 900);
      const tall = view(preset, 390, 844);
      expect(wide.roll).toBe(0);
      expect(tall.roll).toBeCloseTo(Math.PI / 2, 9);
      const { up } = screenAxes(tall.azimuth, tall.elevation, tall.roll);
      // 斜め俯瞰は方位が -0.35 なので、真上方向(画面の上)は -x 側へ向く
      expect(dot(up, [-1, 0, 0])).toBeGreaterThan(preset === 'side' ? 1 - 1e-9 : 0.9);
      const { right } = screenAxes(wide.azimuth, wide.elevation, wide.roll);
      expect(dot(right, [1, 0, 0])).toBeGreaterThan(0.9);
    }
    // 画面の上に北海道、下に沖縄が映る
    const v = view('oblique', 390, 844);
    const pts = nodesOnScreen(v, [390, 844]);
    expect(pts[0][1]).toBeLessThan(pts[46][1]);
    expect(pts[0][1]).toBeLessThan(pts[12][1]);
  });

  it('縦長の定位置でも、北が画面の上になるのは真上だけで、そこでは北海道が最も上に映る', () => {
    const v = view('top', 390, 844);
    const pts = nodesOnScreen(v, [390, 844]);
    const ys = pts.map((p) => p[1]);
    expect(ys[0]).toBe(Math.min(...ys));
  });

  it('図の領域: デスクトップは左の柱と上下の帯を除いた右側、縦画面は上の帯と下のドックの間', () => {
    expect(isPortrait(1440)).toBe(false);
    expect(isPortrait(390)).toBe(true);
    expect(isPortrait(1023)).toBe(true); // 幅 1024 未満は縦画面の構成
    expect(isPortrait(1024)).toBe(false);
    expect(isPortrait(1100, 1400)).toBe(false); // 縦横比では判定しない
    expect(figureRegion(1100, 1400).x0).toBe(424);
    expect(figureRegion(1440, 900)).toEqual({ x0: 424, y0: 96, x1: 1400, y1: 800 });
    expect(figureRegion(390, 844)).toEqual({ x0: 16, y0: 72, x1: 374, y1: 678 });
    expect(figureRegion(1920, 1080).x1).toBe(1880);
  });

  it('3 つの定位置で、47 都道府県の点が領域に収まり、図の中心が領域の中心にある', () => {
    for (const [w, h] of SIZES) {
      const r = figureRegion(w, h);
      for (const preset of ['side', 'oblique', 'top']) {
        const v = view(preset, w, h);
        const pts = nodesOnScreen(v, [w, h]);
        const rr = preset === 'side' && w < 1024 ? { ...r, x1: r.x1 - 80 } : r; // 縦画面の真横は右に索引の余白
        for (const pt of pts) expect(inside(pt, rr), `${preset} ${w}x${h} ${pt}`).toBe(true);
        // 図の中心(anchor)が領域の中心に映る
        const c = projectPoint(v, v.anchor, [w, h]);
        expect(c[0]).toBeCloseTo((rr.x0 + rr.x1) / 2, 6);
        expect(c[1]).toBeCloseTo((rr.y0 + rr.y1) / 2, 6);
      }
    }
  });

  it('デスクトップの真横は、一直線が領域の幅の 9 割強、縦画面の真横は領域の高さの 9 割強になる', () => {
    const d = nodesOnScreen(view('side', 1440, 900), [1440, 900]);
    const xs = d.map((p) => p[0]);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width / 976).toBeGreaterThan(0.9);
    expect(width / 976).toBeLessThan(0.96);
    expect(d.every((p) => Math.abs(p[1] - 448) < 1e-6)).toBe(true);
    const m = nodesOnScreen(view('side', 390, 844), [390, 844]);
    const ys = m.map((p) => p[1]);
    expect((Math.max(...ys) - Math.min(...ys)) / 606).toBeGreaterThan(0.9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(72);
    expect(Math.max(...ys)).toBeLessThanOrEqual(678 - 12); // ドックの上端(694)から 12px 以上上
  });

  it('真横は、一直線の全体が画面に収まる(領域を渡さなくても)', () => {
    for (const aspect of [1.6, 0.46, 1]) {
      const v = viewFor('side', aspect, layout);
      const visibleH = 1 / v.zoom;
      const { right, up } = screenAxes(v.azimuth, v.elevation, v.roll);
      const span = 2 * CX;
      expect(Math.abs(span * right[0])).toBeLessThanOrEqual(visibleH * aspect);
      expect(Math.abs(span * up[0])).toBeLessThanOrEqual(visibleH);
      expect(v.zoom).toBeGreaterThan(0);
    }
  });

  it('画面の縦横比が変わっても、収まる大きさだけが変わる(zoom は画面の高さに対する割合)', () => {
    const a = viewFor('top', 1.6, layout), b = viewFor('top', 0.5, layout);
    expect(b.zoom).toBeLessThan(a.zoom);
  });
});

describe('viewFor: 地域を選んでいるとき', () => {
  const selections = [
    ['東京圏', { type: 'metro', id: 'tokyo' }],
    ['大阪圏', { type: 'metro', id: 'osaka' }],
    ['名古屋圏', { type: 'metro', id: 'nagoya' }],
    ['北海道', { type: 'pref', code: 1 }],
    ['東京都', { type: 'pref', code: 13 }],
    ['大阪府', { type: 'pref', code: 27 }],
    ['沖縄県', { type: 'pref', code: 47 }],
  ];

  it('選択地域の点が、斜め俯瞰でも真上でも、領域の中(四辺から 18% の内側)に入る', () => {
    for (const [w, h] of SIZES) {
      const r = figureRegion(w, h);
      const mx = (r.x1 - r.x0) * 0.18, my = (r.y1 - r.y0) * 0.18;
      const comfort = { x0: r.x0 + mx, x1: r.x1 - mx, y0: r.y0 + my, y1: r.y1 - my };
      for (const preset of ['oblique', 'top']) {
        for (const [name, sel] of selections) {
          const v = view(preset, w, h, sel);
          const pts = nodesOnScreen(v, [w, h]);
          const mask = selectionMask(sel);
          pts.forEach((pt, i) => {
            if (mask[i]) expect(inside(pt, comfort, 1), `${name} ${preset} ${w}x${h} ${pt}`).toBe(true);
          });
        }
      }
    }
  });

  it('拡大率は、選択なしの 2.5 倍(正投影のまま拡大するので、量の比は崩れない)', () => {
    expect(SELECTION_ZOOM).toBe(2.5);
    for (const [w, h] of SIZES) {
      for (const [, sel] of selections) {
        const a = view('oblique', w, h), b = view('oblique', w, h, sel);
        expect(b.zoom / a.zoom).toBeCloseTo(2.5, 9);
        expect([b.azimuth, b.elevation, b.roll, b.lean]).toEqual([a.azimuth, a.elevation, a.roll, a.lean]);
      }
    }
  });

  it('東京圏を選ぶと、東京圏が領域の中央寄りに来る', () => {
    const v = view('oblique', 1440, 900, { type: 'metro', id: 'tokyo' });
    const mask = selectionMask({ type: 'metro', id: 'tokyo' });
    const pts = nodesOnScreen(v, [1440, 900]).filter((_, i) => mask[i]);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    // 領域は x 424〜1400。東京圏は、左の柱の側に寄りすぎない
    expect(cx).toBeGreaterThan(424 + 0.15 * 976);
    expect(cx).toBeLessThan(1400 - 0.15 * 976);
  });

  it('真横では選択しても構図を変えない', () => {
    const a = view('side', 1440, 900), b = view('side', 1440, 900, { type: 'metro', id: 'tokyo' });
    expect(b).toEqual(a);
  });
});

describe('easeCamera と tween', () => {
  const a = view('side', 1440, 900);
  const b = view('oblique', 1440, 900);
  const c = view('top', 1440, 900);

  it('緩急は cubic-bezier(.65, 0, .35, 1): 両端が 0 と 1、中央が 0.5、単調増加', () => {
    expect(easeCamera(0)).toBe(0);
    expect(easeCamera(1)).toBe(1);
    expect(easeCamera(0.5)).toBeCloseTo(0.5, 6);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const y = easeCamera(i / 100);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
    // CSS の ease-in-out と同じ式であること(別の曲線と取り違えない)
    expect(cubicBezier(0.65, 0, 0.35, 1)(0.25)).toBeCloseTo(easeCamera(0.25), 12);
    expect(easeCamera(0.25)).toBeLessThan(0.25); // 出だしはゆっくり
  });

  it('s = 0 で a、s = 1 で b(定位置の組すべて)', () => {
    for (const [p, q] of [[a, b], [a, c], [b, c], [c, a]]) {
      const t0 = tween(p, q, 0), t1 = tween(p, q, 1);
      for (const k of ['azimuth', 'elevation', 'zoom', 'roll', 'morph', 'lean']) {
        expect(t0[k]).toBeCloseTo(p[k], 9);
        expect(t1[k]).toBeCloseTo(q[k], 9);
      }
      t0.center.forEach((v, i) => expect(v).toBeCloseTo(p.center[i], 6));
      t1.center.forEach((v, i) => expect(v).toBeCloseTo(q.center[i], 6));
    }
  });

  it('連続している(細かく刻んだ隣どうしの差が小さく、跳ばない)', () => {
    const N = 400;
    for (const [p, q] of [[a, b], [b, a], [a, c], [c, b]]) {
      let prev = tween(p, q, 0);
      for (let i = 1; i <= N; i++) {
        const cur = tween(p, q, i / N);
        for (const k of ['azimuth', 'elevation', 'roll', 'morph', 'lean']) expect(Math.abs(cur[k] - prev[k])).toBeLessThan(0.02);
        expect(Math.abs(Math.log(cur.zoom / prev.zoom))).toBeLessThan(0.02);
        prev = cur;
      }
    }
  });

  it('真横から立ち上がるとき、回転の最初の 15% の間は morph が 0 のまま、その後 1 まで動く', () => {
    expect(MORPH_DELAY).toBe(0.15);
    expect(tween(a, b, 0.1).morph).toBe(0);
    expect(tween(a, b, 0.15).morph).toBe(0);
    expect(tween(a, b, 0.3).morph).toBeGreaterThan(0);
    expect(tween(a, b, 0.575).morph).toBeCloseTo(0.5, 9);
    expect(tween(a, b, 1).morph).toBe(1);
    // 回転は最初から始まっている
    expect(tween(a, b, 0.1).elevation).toBeGreaterThan(0);
    // 真上へも同じ。戻るときは、回転の最後の 15% の前に morph が 0 になる
    expect(tween(a, c, 0.1).morph).toBe(0);
    expect(tween(b, a, 0.85).morph).toBe(0);
    expect(tween(b, a, 0.5).morph).toBeGreaterThan(0);
    // 斜め俯瞰 ↔ 真上は、morph が 1 のまま
    expect(tween(b, c, 0.5).morph).toBe(1);
  });

  it('途中から向かい直しても(morph が 0 でない視点から)跳ばない', () => {
    const mid = tween(a, b, 0.5);
    const back = tween(mid, a, 0);
    expect(back.morph).toBeCloseTo(mid.morph, 9);
    expect(tween(mid, a, 0.01).morph).toBeLessThanOrEqual(mid.morph);
  });

  it('途中でも、図の中心が領域の中心から動かない(中心を anchor から決める)', () => {
    const [w, h] = [1440, 900];
    for (const s of [0.2, 0.5, 0.8]) {
      const m = tween(a, c, s);
      const p = projectPoint(m, m.anchor, [w, h]);
      expect(p[0]).toBeCloseTo((a.target[0] + c.target[0]) / 2, 0);
    }
  });

  it('角度は短い側へ回る(+179° と -179° の間は 2° だけ動く)', () => {
    const p = { ...a, azimuth: Math.PI - 0.01, roll: 0 };
    const q = { ...a, azimuth: -Math.PI + 0.01, roll: 0 };
    const m = tween(p, q, 0.5);
    expect(Math.abs(Math.cos(m.azimuth) + 1)).toBeLessThan(1e-4);
  });

  it('zoom は対数で補間する(幾何平均)', () => {
    const m = tween({ ...a, zoom: 0.002, anchor: undefined }, { ...a, zoom: 0.008, anchor: undefined }, 0.5);
    expect(m.zoom).toBeCloseTo(0.004, 9);
  });
});

describe('利用者の回転と拡大', () => {
  it('ドラッグで、近い側の点がドラッグの向きへ動く(縦画面の roll も考慮する)', () => {
    for (const [w, h] of SIZES) {
      const base = view('oblique', w, h);
      const P = [60, 0, 80];
      const p0 = projectPoint(base, P, [w, h]);
      for (const [dx, dy] of [[40, 0], [-40, 0], [0, 40], [0, -40]]) {
        const { dAzimuth, dElevation } = dragToAngles(dx, dy, base.roll);
        const o = clampOrbit(base, base.azimuth + dAzimuth, base.elevation + dElevation);
        const v = reorient(base, o);
        const p1 = projectPoint(v, P, [w, h]);
        // 画面での動きの向きが、ドラッグの向きと正の内積を持つ
        expect((p1[0] - p0[0]) * dx + (p1[1] - p0[1]) * dy, `${w}x${h} ${dx},${dy}`).toBeGreaterThan(0);
      }
    }
  });

  it('範囲: 方位は定位置の ±80°、仰角は 0〜90°(地面の下へ回り込まない)', () => {
    const base = view('oblique', 1440, 900);
    const hi = clampOrbit(base, base.azimuth + 10, 5);
    expect(hi.azimuth - base.azimuth).toBeCloseTo(USER_LIMITS.azimuth, 9);
    expect(hi.elevation).toBeCloseTo(Math.PI / 2, 9);
    const lo = clampOrbit(base, base.azimuth - 10, -3);
    expect(base.azimuth - lo.azimuth).toBeCloseTo(USER_LIMITS.azimuth, 9);
    expect(lo.elevation).toBe(0);
    expect(USER_LIMITS.azimuth).toBeLessThan(Math.PI / 2);
  });

  it('回転しても、図の中心は領域の中心に映ったまま。拡大は中心まわり', () => {
    const base = view('oblique', 1440, 900);
    const v = reorient(base, { azimuth: base.azimuth + 0.5, elevation: 0.9, zoomScale: 2 });
    const p = projectPoint(v, base.anchor, [1440, 900]);
    expect(p[0]).toBeCloseTo(base.target[0], 6);
    expect(p[1]).toBeCloseTo(base.target[1], 6);
    expect(v.zoom).toBeCloseTo(base.zoom * 2, 12);
  });
});

describe('createCameraRig', () => {
  function setup(patch = {}, extra = {}) {
    const store = createStore({ camera: 'side', ...patch });
    const calls = { view: [], lean: [] };
    const renderer = {
      layout,
      getState: () => ({ width: 1440, height: 900 }),
      setView: (v) => calls.view.push(v),
      setLean: (l) => calls.lean.push(l),
    };
    const rig = createCameraRig({ store, renderer, element: null, ...extra });
    return { store, renderer, rig, calls };
  }

  it('動きを減らす設定では、定位置を即座に切り替える', () => {
    const { store, rig, calls } = setup({ reducedMotion: true });
    store.set({ camera: 'oblique' });
    const want = view('oblique', 1440, 900);
    expect(calls.view.at(-1).elevation).toBeCloseTo(want.elevation, 9);
    expect(store.get().morph).toBe(1);
    expect(calls.lean.at(-1)).toBe(want.lean);
    rig.update(0.016); // 動かない
    expect(calls.view.at(-1).elevation).toBeCloseTo(want.elevation, 9);
  });

  it('immediate(still=1)でも即座に切り替える', () => {
    const { store, calls } = setup({}, { immediate: true });
    store.set({ camera: 'top' });
    expect(calls.view.at(-1).elevation).toBeCloseTo(Math.PI / 2, 9);
    expect(store.get().morph).toBe(1);
  });

  it('通常は 1600ms かけて、緩急つきで動く。morph は最初の 15% の間は 0', () => {
    const { store, rig } = setup();
    store.set({ camera: 'oblique' });
    expect(store.get().morph).toBe(0);
    rig.update(0.16); // 進み 10%、緩急をかけると 15% より手前
    expect(store.get().morph).toBe(0);
    for (let i = 0; i < 9; i++) rig.update(0.16);
    expect(store.get().morph).toBeCloseTo(1, 6);
    const want = view('oblique', 1440, 900);
    expect(rig.getView().elevation).toBeCloseTo(want.elevation, 9);
  });

  it('移動中に次の指示が来ても、今の位置から向かい直す(跳ばない)', () => {
    const { store, rig } = setup();
    store.set({ camera: 'oblique' });
    for (let i = 0; i < 4; i++) rig.update(0.16);
    const mid = rig.getView();
    store.set({ camera: 'side' });
    rig.update(0.001);
    const after = rig.getView();
    expect(Math.abs(after.elevation - mid.elevation)).toBeLessThan(0.01);
    expect(Math.abs(after.morph - mid.morph)).toBeLessThan(0.01);
  });

  it('地域を選ぶと、構図が寄る(東京圏で 2.5 倍)。定位置を選び直すと、利用者の操作は消える', () => {
    const { store, rig } = setup({ camera: 'oblique', reducedMotion: true });
    const z0 = rig.getView().zoom;
    store.set({ selection: { type: 'metro', id: 'tokyo' } });
    expect(rig.getView().zoom / z0).toBeCloseTo(2.5, 9);
    rig.orbit(0.3, 0.1);
    rig.zoomBy(1.5);
    expect(rig.getView().azimuth).toBeCloseTo(-0.35 + 0.3, 9);
    store.set({ camera: 'top' });
    const top = view('top', 1440, 900, { type: 'metro', id: 'tokyo' });
    expect(rig.getView().azimuth).toBeCloseTo(top.azimuth, 9);
    expect(rig.getView().zoom).toBeCloseTo(top.zoom, 9);
  });

  it('外から書かれた morph を巻き戻さない(resize のあとも、次の定位置の遷移でも)', () => {
    const { store, rig } = setup({ camera: 'oblique', reducedMotion: true, morph: 1 });
    expect(store.get().morph).toBe(1);
    store.set({ morph: 0.4 });
    rig.resize();
    expect(store.get().morph).toBe(0.4);
    expect(rig.getView().morph).toBe(0.4);
    rig.orbit(0.1, 0);
    expect(store.get().morph).toBe(0.4);
    // 次の定位置の変更は、その値から始まる
    store.set({ camera: 'top' });
    expect(store.get().morph).toBe(1); // reducedMotion なので即座に定位置の値
  });

  it('遷移の途中で外から morph が書かれても、そこから向かい直す', () => {
    const { store, rig } = setup();
    store.set({ camera: 'oblique' });
    for (let i = 0; i < 4; i++) rig.update(0.16);
    store.set({ morph: 0.2 });
    expect(rig.getView().morph).toBe(0.2);
    rig.resize(); // 遷移中の resize も値を戻さない
    expect(store.get().morph).toBe(0.2);
    rig.update(0.001);
    expect(store.get().morph).toBeCloseTo(0.2, 9);
    // 回転は続いている
    const el = rig.getView().elevation;
    rig.update(0.16);
    expect(rig.getView().elevation).toBeGreaterThan(el);
    expect(store.get().morph).toBeCloseTo(0.2, 9);
  });

  it('URL の morph で指定された初期値を尊重し、その値から補間を始める', () => {
    const { store, rig } = setup({ camera: 'side', morph: 0.5 });
    expect(store.get().morph).toBe(0.5);
    expect(rig.getView().morph).toBe(0.5);
    rig.resize();
    expect(store.get().morph).toBe(0.5);
    store.set({ camera: 'top' });
    rig.update(0.001);
    // 0.5 から 1 へ向かう(0 へ戻ってから始めない)
    expect(store.get().morph).toBeGreaterThanOrEqual(0.5);
    for (let i = 0; i < 12; i++) rig.update(0.16);
    expect(store.get().morph).toBeCloseTo(1, 6);
  });

  it('回転は範囲に収まり、reset で戻る', () => {
    const { rig } = setup({ camera: 'oblique', reducedMotion: true });
    rig.orbit(100, 100);
    expect(rig.getView().elevation).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    expect(rig.getView().azimuth - -0.35).toBeCloseTo(USER_LIMITS.azimuth, 9);
    rig.orbit(-100, -100);
    expect(rig.getView().elevation).toBeGreaterThanOrEqual(0);
    rig.zoomBy(1000);
    expect(rig.getView().zoom / view('oblique', 1440, 900).zoom).toBeCloseTo(USER_LIMITS.zoomMax, 9);
    rig.reset();
    expect(rig.getView().azimuth).toBeCloseTo(-0.35, 9);
    expect(rig.getView().elevation).toBeCloseTo(0.6, 9);
  });
});
