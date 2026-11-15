import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AZIMUTH_FROM, ELEVATION_FROM, MORPH_TRANSITION_SECONDS, clampOrbit, cubicBezier, dragToAngles, easeCamera, ELEVATION_LEAD, figureRegion, isPortrait, portraitSplit, MORPH_DELAY, MORPH_END, projectPoint, reorient,
  DESKTOP_READOUT_BOTTOM, screenAxes, SELECTION_OBLIQUE, SELECTION_ZOOM, presetRegion, topAzimuth, tween, USER_LIMITS, viewFor, viewOptions,
} from '../src/scene/camera.js';
import { createCameraRig } from '../src/scene/cameraRig.js';
import { createStore } from '../src/state.js';
import { geoLayout, lineLayout, nodePos } from '../src/geometry/layout.js';
import { selectionMask } from '../src/geometry/flows.js';
import { CAMERA_PRESETS, CX } from '../src/geometry/constants.js';
import { arcPoint } from '../src/geometry/arc.js';
import { prefectures } from './helpers.js';
import { landHull } from '../src/scene/ground.js';

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
  it('定位置の値は設計 §6 どおり(side: 0/0、oblique: 北が上・仰角 36°・lean 0、top: 真上)', () => {
    expect(CAMERA_PRESETS.side).toMatchObject({ azimuth: 0, elevation: 0, morph: 0, lean: 0 });
    expect(CAMERA_PRESETS.oblique).toMatchObject({ azimuth: null, morph: 1, lean: 0 });
    expect(CAMERA_PRESETS.oblique.elevation).toBeCloseTo((36 * Math.PI) / 180, 12);
    expect(viewFor('side', 1.6, layout)).toMatchObject({ elevation: 0, azimuth: 0, morph: 0, lean: 0, roll: 0 });
    const ob = viewFor('oblique', 1.6, layout);
    expect(ob).toMatchObject({ morph: 1, lean: 0, roll: 0 });
    expect(ob.elevation).toBeCloseTo((36 * Math.PI) / 180, 12);
    expect(ob.azimuth).toBeCloseTo(topAzimuth(geo.northAngle), 12); // 方位は真上と同じ(北が画面の上)
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

  it('どの定位置も回さない(縦画面の真横も横長の並び。斜め俯瞰は北が上)', () => {
    for (const [w, h] of SIZES) {
      const v = view('side', w, h);
      expect(v.roll).toBe(0);
      const { right } = screenAxes(v.azimuth, v.elevation, v.roll);
      expect(dot(right, [1, 0, 0])).toBeGreaterThan(1 - 1e-9);
    }
    for (const [w, h] of SIZES) {
      const v = view('oblique', w, h);
      expect(v.roll).toBe(0);
      // 北海道が右上、鹿児島・沖縄が左下に映る(見慣れた日本列島の形)
      const pts = nodesOnScreen(v, [w, h]);
      expect(pts[0][1]).toBeLessThan(pts[12][1]);
      expect(pts[0][1]).toBeLessThan(pts[46][1]);
      expect(pts[0][0]).toBeGreaterThan(pts[45][0]);
      expect(pts[0][0]).toBeGreaterThan(pts[46][0]);
    }
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
    expect(figureRegion(1440, 900)).toEqual({ x0: 424, y0: 96, x1: 1400, y1: 764 });
    // 縦画面は、上の帯の下からドックの上までを図(上 55%)と本文(下)で分け合う
    expect(figureRegion(390, 844)).toEqual({ x0: 16, y0: 72, x1: 374, y1: portraitSplit(844) });
    expect(portraitSplit(844)).toBe(Math.round(72 + (844 - 180 - 72) * 0.55));
    expect(figureRegion(1920, 1080).x1).toBe(1880);
  });

  it('3 つの定位置で、47 都道府県の点が領域に収まり、図の中心が領域の中心にある', () => {
    for (const [w, h] of SIZES) {
      const r = figureRegion(w, h);
      for (const preset of ['side', 'oblique', 'top']) {
        const v = view(preset, w, h);
        const pts = nodesOnScreen(v, [w, h]);
        const rr = presetRegion(preset, r, w < 1024); // 縦画面の真横は右に索引の余白、斜め俯瞰と真上は読み出し・注記の下
        for (const pt of pts) expect(inside(pt, rr), `${preset} ${w}x${h} ${pt}`).toBe(true);
        // 図の中心(anchor)が領域の中心に映る
        const c = projectPoint(v, v.anchor, [w, h]);
        expect(c[0]).toBeCloseTo((rr.x0 + rr.x1) / 2, 6);
        expect(c[1]).toBeCloseTo((rr.y0 + rr.y1) / 2, 6);
      }
    }
  });

  it('真横は、デスクトップでも縦画面でも、一直線が領域の幅の 9 割強になる(回さない)', () => {
    const d = nodesOnScreen(view('side', 1440, 900), [1440, 900]);
    const xs = d.map((p) => p[0]);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width / 976).toBeGreaterThan(0.9);
    expect(width / 976).toBeLessThan(0.96);
    expect(d.every((p) => Math.abs(p[1] - 365) < 1e-6)).toBe(true);
    const m = nodesOnScreen(view('side', 390, 844), [390, 844]);
    const mx = m.map((p) => p[0]);
    expect((Math.max(...mx) - Math.min(...mx)) / 358).toBeGreaterThan(0.9);
    expect(m[0][0]).toBeLessThan(m[46][0]); // 北海道が左
    // 並びは本文のカードの領域(portraitSplit より下)に入らない
    expect(Math.max(...m.map((p) => p[1]))).toBeLessThan(portraitSplit(844));
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
          // 斜め俯瞰も真上も全体を収めるので、選択地域は領域の中にあればよい(内側へ寄せる移動は、全体がはみ出さない範囲に限る)
          const box = presetRegion(preset, r, w < 1024, true, true);
          void comfort;
          pts.forEach((pt, i) => {
            if (mask[i]) expect(inside(pt, box, 1), `${name} ${preset} ${w}x${h} ${pt}`).toBe(true);
          });
        }
      }
    }
  });

  it('地域を選んでいるときは、47 都道府県と、選択地域とすべての相手先の間の地上・地下の弧を領域に収める', () => {
    expect(SELECTION_ZOOM).toBe(2.5);
    for (const [w, h] of SIZES) {
      for (const [name, sel] of selections) {
        for (const preset of ['oblique', 'top']) {
          const v = view(preset, w, h, sel);
          // 主要な相手先の指定(viewOptions の partners)には依らない
          expect(viewFor(preset, w / h, layout, viewOptions(w, h, sel, [0])).zoom).toBeCloseTo(v.zoom, 12);
          expect([v.azimuth, v.roll]).toEqual([view(preset, w, h).azimuth, view(preset, w, h).roll]);
          const r = presetRegion(preset, figureRegion(w, h), w < 1024, true, true);
          const mask = selectionMask(sel);
          const P = Array.from({ length: 47 }, (_, i) => nodePos(layout.line, layout.geo, i, v.morph));
          const tmp = [0, 0, 0];
          for (let i = 0; i < 47; i++) {
            expect(inside(projectPoint(v, [P[i][0], 0, P[i][1]], [w, h]), r, 1), `${name} ${preset} ${w}x${h} ${i}`).toBe(true);
            if (mask[i]) continue;
            for (let m = 0; m < 47; m++) {
              if (!mask[m]) continue;
              for (const t of [0.25, 0.5, 0.75]) {
                arcPoint(P[i], P[m], 1, v.lean, t, tmp);
                expect(inside(projectPoint(v, tmp, [w, h]), r, 1), `${name} ${preset} in ${i}`).toBe(true);
                arcPoint(P[m], P[i], -1, v.lean, t, tmp);
                expect(inside(projectPoint(v, tmp, [w, h]), r, 1), `${name} ${preset} out ${i}`).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('デスクトップで地域を選ぶと、右の読み出しの列を図の領域から外す', () => {
    const r = figureRegion(1440, 900);
    expect(presetRegion('oblique', r, false, true, true)).toEqual({ ...r, x1: 1400 - 324 });
    expect(presetRegion('top', r, false, true, true)).toEqual({ ...r, x1: 1400 - 324 });
    expect(presetRegion('oblique', r, false, true, false).y0).toBe(250);
    expect(presetRegion('side', r, false, true, true)).toEqual({ ...r, y1: r.y1 - 130 });
  });

  it('幅 1280px 未満のデスクトップで地域を選ぶと、列は外さず、図の領域を読み出しの下端より下へ下げる(N-3)', () => {
    for (const [w, h] of [[1024, 768], [1100, 800], [1279, 800]]) {
      const r = figureRegion(w, h);
      for (const preset of ['oblique', 'top']) {
        expect(presetRegion(preset, r, false, true, true), `${w}x${h} ${preset}`).toEqual({ ...r, y0: DESKTOP_READOUT_BOTTOM });
      }
      expect(presetRegion('oblique', r, false, true, false).y0).toBe(250); // 選択なしは、いまのまま
    }
    // 幅 1280px ちょうどからは、読み出しの列を外す
    const r = figureRegion(1280, 800);
    expect(presetRegion('oblique', r, false, true, true)).toEqual({ ...r, x1: 1240 - 324 });
  });

  it('縦画面の斜め俯瞰と真上は、陸地の外形(landHull)も領域に収める。陸地を持たない layout では、いままでと同じ(N-9)', () => {
    const hullLayout = { ...layout, landHull: landHull(JSON.parse(readFileSync(resolve(__dirname, '../public/data/japan.topojson'), 'utf8')), geo.toWorld) };
    const [w, h] = [390, 844];
    const plain = viewFor('oblique', w / h, layout, viewOptions(w, h));
    const withLand = viewFor('oblique', w / h, hullLayout, viewOptions(w, h));
    expect(withLand.zoom).toBeLessThan(plain.zoom); // 北海道の陸地が右端で切れないよう、少し縮む
    for (const preset of ['oblique', 'top']) {
      for (const sel of [null, { type: 'pref', code: 27 }]) {
        const v = viewFor(preset, w / h, hullLayout, viewOptions(w, h, sel));
        const box = presetRegion(preset, figureRegion(w, h), true, true, !!sel);
        for (const [x, z] of hullLayout.landHull) expect(inside(projectPoint(v, [x, 0, z], [w, h]), box, 1), `${preset} ${JSON.stringify(sel)} ${x},${z}`).toBe(true);
      }
    }
    // デスクトップは、陸地を収める対象に加えない
    const d = viewFor('oblique', 1440 / 900, hullLayout, viewOptions(1440, 900));
    expect(d.zoom).toBeCloseTo(viewFor('oblique', 1440 / 900, layout, viewOptions(1440, 900)).zoom, 12);
  });

  it('相手先の点は、選択地域を領域の内側に置いても領域から大きくはみ出さない(デスクトップ)', () => {
    const partners = [26, 22, 7, 0, 21, 39, 27, 3]; // 東京圏の主要な相手先(大阪、愛知、茨城、北海道、静岡、福岡、兵庫、宮城)
    const v = viewFor('oblique', 1440 / 900, layout, viewOptions(1440, 900, { type: 'metro', id: 'tokyo' }, partners));
    const r = presetRegion('oblique', figureRegion(1440, 900), false, true, true);
    const pts = nodesOnScreen(v, [1440, 900]);
    for (const i of partners) expect(inside(pts[i], r, 60), `${i} ${pts[i]}`).toBe(true);
  });

  it('選択時の斜め俯瞰は、弧を立てたまま仰角を 26° へ下げる(地上と地下の厚みを見せる)', () => {
    expect(SELECTION_OBLIQUE.elevation).toBeCloseTo((26 * Math.PI) / 180, 12);
    expect(SELECTION_OBLIQUE.lean).toBe(0);
    const b = view('oblique', 1440, 900, { type: 'metro', id: 'osaka' });
    expect(b.lean).toBe(SELECTION_OBLIQUE.lean);
    expect(b.elevation).toBe(SELECTION_OBLIQUE.elevation);
    expect(view('top', 1440, 900, { type: 'metro', id: 'osaka' }).lean).toBe(view('top', 1440, 900).lean);
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

  it('真横から地図へは 2 段: まず真横のまま morph を 0 → 1、続いてカメラを起こす(戻るときは裏返し)', () => {
    expect(MORPH_DELAY).toBe(0);
    // 1 段目: カメラは真横のまま、morph だけが動く
    for (const s of [0.1, 0.25, 0.4]) {
      const m = tween(a, b, s);
      expect(m.elevation).toBe(0);
      expect(m.azimuth).toBeCloseTo(a.azimuth, 12);
      expect(m.morph).toBeGreaterThan(0);
    }
    expect(tween(a, b, MORPH_END / 2).morph).toBeCloseTo(0.5, 9);
    expect(tween(a, b, MORPH_END).morph).toBe(1);
    // 2 段目: morph は 1 のまま、カメラが起きる
    expect(tween(a, b, 0.6).morph).toBe(1);
    expect(tween(a, b, 0.6).elevation).toBeGreaterThan(0);
    expect(tween(a, b, 1).morph).toBe(1);
    // 真上へも同じ。戻るときは、先にカメラを寝かせてから並びへ戻す
    expect(tween(a, c, 0.3).elevation).toBe(0);
    expect(tween(b, a, 0.3).morph).toBe(1);
    expect(tween(b, a, 1 - MORPH_END / 2).morph).toBeCloseTo(0.5, 9);
    expect(tween(b, a, 1 - MORPH_END / 2).elevation).toBe(0);
    // 斜め俯瞰 ↔ 真上は、morph が 1 のまま
    expect(tween(b, c, 0.5).morph).toBe(1);
  });

  it('真横から地図へは、仰角を先に上げてから方位を回す(戻るときは、その裏返し)', () => {
    // 仰角は ELEVATION_LEAD で上がりきる。方位は AZIMUTH_FROM までは動かない
    expect(tween(a, b, AZIMUTH_FROM).azimuth).toBeCloseTo(a.azimuth, 12);
    expect(tween(a, b, ELEVATION_LEAD).elevation).toBeCloseTo(b.elevation, 12);
    expect(tween(a, b, (ELEVATION_FROM + ELEVATION_LEAD) / 2).elevation / b.elevation).toBeCloseTo(0.5, 9);
    expect(tween(b, a, 1 - ELEVATION_LEAD).elevation).toBeCloseTo(b.elevation, 12);
    expect(tween(b, a, 1 - AZIMUTH_FROM).azimuth).toBeCloseTo(a.azimuth, 12);
    // 斜め俯瞰 ↔ 真上は、方位を変えず(同じ方位)、仰角と lean だけを同じ進みで動かす
    const m = tween(b, c, 0.5);
    expect(m.azimuth).toBeCloseTo(b.azimuth, 12);
    expect(m.elevation).toBeCloseTo((b.elevation + c.elevation) / 2, 12);
    expect(m.lean).toBeCloseTo((b.lean + c.lean) / 2, 12);
  });

  it('layout を渡すと、遷移の途中でも図(都道府県と弧の点)が領域に収まる', () => {
    for (const [w, h] of SIZES) {
      for (const [p, q] of [['side', 'oblique'], ['oblique', 'side'], ['side', 'top'], ['oblique', 'top']]) {
        const A = view(p, w, h), B = view(q, w, h);
        for (let k = 0; k <= 10; k++) {
          const v = tween(A, B, k / 10, layout);
          const r = { x0: Math.min(A.fit.region.x0, B.fit.region.x0), y0: Math.min(A.fit.region.y0, B.fit.region.y0), x1: Math.max(A.fit.region.x1, B.fit.region.x1), y1: Math.max(A.fit.region.y1, B.fit.region.y1) };
          const P = Array.from({ length: 47 }, (_, i) => nodePos(layout.line, layout.geo, i, v.morph));
          const tmp = [0, 0, 0];
          for (const [o, d] of [[0, 46], [46, 0], [0, 12], [12, 46], [26, 0]]) {
            for (const t of [0, 0.5, 1]) {
              arcPoint(P[o], P[d], o > d ? 1 : -1, v.lean, t, tmp);
              expect(inside(projectPoint(v, tmp, [w, h]), r, 1), `${p}->${q} ${w}x${h} s=${k / 10}`).toBe(true);
            }
          }
        }
        // 端では、定位置そのものになる
        expect(tween(A, B, 1, layout).zoom).toBeCloseTo(B.zoom, 12);
        expect(tween(A, B, 0, layout).zoom).toBeCloseTo(A.zoom, 12);
      }
    }
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
      // カメラの側(手前)の地面の点
      const P = [Math.sin(base.azimuth) * 100, 0, Math.cos(base.azimuth) * 100];
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

  it('真横と地図の間の変形は 1800ms、斜め俯瞰と真上の間は 1600ms かけて動く', () => {
    expect(MORPH_TRANSITION_SECONDS).toBe(1.8);
    const { store, rig } = setup();
    store.set({ camera: 'oblique' });
    expect(store.get().morph).toBe(0);
    rig.update(0.18); // 進み 10%: morph は動き始め、カメラは真横のまま
    expect(store.get().morph).toBeGreaterThan(0);
    expect(rig.getView().elevation).toBe(0);
    for (let i = 0; i < 4; i++) rig.update(0.18); // 進み 50%: morph は 1
    expect(store.get().morph).toBe(1);
    for (let i = 0; i < 4; i++) rig.update(0.18); // 進み 90%: まだ回っている
    expect(rig.getView().azimuth).not.toBeCloseTo(view('oblique', 1440, 900).azimuth, 3);
    rig.update(0.18);
    const want = view('oblique', 1440, 900);
    expect(rig.getView().elevation).toBeCloseTo(want.elevation, 9);
    // 斜め俯瞰 → 真上
    store.set({ camera: 'top' });
    for (let i = 0; i < 9; i++) rig.update(0.16);
    expect(rig.getView().elevation).toBeLessThan(Math.PI / 2 - 1e-6);
    rig.update(0.16);
    expect(rig.getView().elevation).toBeCloseTo(Math.PI / 2, 9);
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

  it('地域を選ぶと、選択時の構図になる。定位置を選び直すと、利用者の操作は消える', () => {
    const { store, rig } = setup({ camera: 'oblique', reducedMotion: true });
    const z0 = rig.getView().zoom;
    store.set({ selection: { type: 'metro', id: 'tokyo' } });
    expect(rig.getView().zoom).toBeCloseTo(view('oblique', 1440, 900, { type: 'metro', id: 'tokyo' }).zoom, 9);
    expect(rig.getView().elevation).toBeCloseTo(SELECTION_OBLIQUE.elevation, 9);
    void z0;
    rig.orbit(0.3, 0.1);
    rig.zoomBy(1.5);
    expect(rig.getView().azimuth).toBeCloseTo(topAzimuth(geo.northAngle) + 0.3, 9);
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
    expect(rig.getView().azimuth - topAzimuth(geo.northAngle)).toBeCloseTo(USER_LIMITS.azimuth, 9);
    rig.orbit(-100, -100);
    expect(rig.getView().elevation).toBeGreaterThanOrEqual(0);
    rig.zoomBy(1000);
    expect(rig.getView().zoom / view('oblique', 1440, 900).zoom).toBeCloseTo(USER_LIMITS.zoomMax, 9);
    rig.reset();
    expect(rig.getView().azimuth).toBeCloseTo(topAzimuth(geo.northAngle), 9);
    expect(rig.getView().elevation).toBeCloseTo(CAMERA_PRESETS.oblique.elevation, 9);
  });
});
