import { describe, expect, it } from 'vitest';
import { screenAxes, tween, viewFor } from '../src/scene/camera.js';
import { geoLayout } from '../src/geometry/layout.js';
import { CX } from '../src/geometry/constants.js';
import { prefectures } from './helpers.js';

const geo = geoLayout(prefectures());
const layout = { bounds: geo.bounds, northAngle: geo.northAngle };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('viewFor', () => {
  it('定位置の morph と lean は設計 §6 どおり(side: 0/0、oblique・top: 1)', () => {
    expect(viewFor('side', 1.6, layout)).toMatchObject({ elevation: 0, azimuth: 0, morph: 0, lean: 0, roll: 0 });
    expect(viewFor('oblique', 1.6, layout)).toMatchObject({ elevation: 0.6, azimuth: -0.35, morph: 1 });
    const top = viewFor('top', 1.6, layout);
    expect(top.morph).toBe(1);
    expect(top.elevation).toBeCloseTo(Math.PI / 2, 9);
    expect(top.lean).toBeGreaterThanOrEqual(0.5);
    expect(top.lean).toBeLessThanOrEqual(0.9);
  });

  it('真上では、北が画面の上で、右が東になる', () => {
    const v = viewFor('top', 1.6, layout);
    const { right, up } = screenAxes(v.azimuth, v.elevation, v.roll);
    const north = [Math.cos(geo.northAngle), 0, Math.sin(geo.northAngle)];
    const east = [-Math.sin(geo.northAngle), 0, Math.cos(geo.northAngle)];
    expect(dot(up, north)).toBeCloseTo(1, 9);
    expect(dot(right, east)).toBeCloseTo(1, 9);
  });

  it('縦長の真横は 90° 回して、北海道(x が小さい側)が上になる', () => {
    const wide = viewFor('side', 1.6, layout);
    const tall = viewFor('side', 0.46, layout);
    expect(wide.roll).toBe(0);
    expect(tall.roll).toBeCloseTo(Math.PI / 2, 9);
    const { up } = screenAxes(tall.azimuth, tall.elevation, tall.roll);
    expect(dot(up, [-1, 0, 0])).toBeCloseTo(1, 9);
    // 横長では右が +x
    const { right } = screenAxes(wide.azimuth, wide.elevation, wide.roll);
    expect(dot(right, [1, 0, 0])).toBeCloseTo(1, 9);
  });

  it('真横は、一直線の全体が画面に収まる', () => {
    for (const aspect of [1.6, 0.46, 1]) {
      const v = viewFor('side', aspect, layout);
      const visibleH = 1 / v.zoom;
      const { right, up } = screenAxes(v.azimuth, v.elevation, v.roll);
      const span = 2 * CX;
      const onScreenW = Math.abs(span * right[0]) , onScreenH = Math.abs(span * up[0]);
      expect(onScreenW).toBeLessThanOrEqual(visibleH * aspect);
      expect(onScreenH).toBeLessThanOrEqual(visibleH);
      expect(v.zoom).toBeGreaterThan(0);
    }
  });

  it('画面の縦横比が変わっても、収まる大きさだけが変わる(zoom は画面の高さに対する割合)', () => {
    const a = viewFor('top', 1.6, layout), b = viewFor('top', 0.5, layout);
    expect(b.zoom).toBeLessThan(a.zoom);
    expect(b.center).toEqual(a.center);
  });
});

describe('tween', () => {
  const a = viewFor('side', 1.6, layout);
  const b = viewFor('top', 1.6, layout);

  it('s = 0 で a、s = 1 で b', () => {
    const t0 = tween(a, b, 0), t1 = tween(a, b, 1);
    for (const k of ['azimuth', 'elevation', 'zoom', 'roll', 'morph', 'lean']) {
      expect(t0[k]).toBeCloseTo(a[k], 9);
      expect(t1[k]).toBeCloseTo(b[k], 9);
    }
    t1.center.forEach((v, i) => expect(v).toBeCloseTo(b.center[i], 9));
  });

  it('角度は短い側へ回る(+179° と -179° の間は 2° だけ動く)', () => {
    const p = { ...a, azimuth: Math.PI - 0.01, roll: 0 };
    const q = { ...a, azimuth: -Math.PI + 0.01, roll: 0 };
    const m = tween(p, q, 0.5);
    expect(Math.abs(Math.cos(m.azimuth) + 1)).toBeLessThan(1e-4); // ほぼ ±π
  });

  it('zoom は対数で補間する(幾何平均)', () => {
    const m = tween({ ...a, zoom: 0.002 }, { ...a, zoom: 0.008 }, 0.5);
    expect(m.zoom).toBeCloseTo(0.004, 9);
  });
});
