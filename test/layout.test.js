import { describe, expect, it } from 'vitest';
import { CX, STEP } from '../src/geometry/constants.js';
import { geoLayout, lineLayout, nodePos } from '../src/geometry/layout.js';
import { IDX, prefectures } from './helpers.js';

describe('lineLayout', () => {
  it('原作と同じ並び(i * STEP - CX)で、z は 0', () => {
    const line = lineLayout();
    expect(line).toHaveLength(47);
    line.forEach(([x, z], i) => {
      expect(x).toBeCloseTo(i * STEP - CX, 10);
      expect(z).toBe(0);
    });
    expect(line[0][0]).toBeCloseTo(-CX, 10);
    expect(line[46][0]).toBeCloseTo(CX, 10);
  });
});

describe('geoLayout', () => {
  const geo = geoLayout(prefectures());
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

  it('47 点全体の x 方向の広がりが 46 * STEP で、最小が -CX、最大が CX(一直線の両端と同じ幅)', () => {
    const { minX, maxX } = geo.bounds;
    expect(maxX - minX).toBeCloseTo(46 * STEP, 6);
    expect(minX).toBeCloseTo(-CX, 6);
    expect(maxX).toBeCloseTo(CX, 6);
    expect(geo.pos.map((p) => p[0]).reduce((a, b) => Math.min(a, b))).toBeCloseTo(-CX, 6);
  });

  it('北海道から鹿児島へ向かう向きが +x 軸(z の差は 0)', () => {
    const d = sub(geo.pos[IDX.kagoshima], geo.pos[IDX.sapporo]);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[1]).toBeCloseTo(0, 6);
  });

  it('z の範囲は 0 を中心にしている', () => {
    const { minZ, maxZ } = geo.bounds;
    expect(minZ + maxZ).toBeCloseTo(0, 6);
  });

  it('toWorld は pos と同じ変換で、境界線の頂点にも使える', () => {
    const p = prefectures();
    for (const i of [0, 12, 26, 45, 46]) {
      const w = geo.toWorld(p[i].x, p[i].y);
      expect(w[0]).toBeCloseTo(geo.pos[i][0], 9);
      expect(w[1]).toBeCloseTo(geo.pos[i][1], 9);
    }
  });

  it('向きが鏡像になっていない: 東京から見て大阪が西、札幌が北', () => {
    // 北と東は toWorld から取る(northAngle には頼らない)
    const o = geo.toWorld(0, 0);
    const north = sub(geo.toWorld(0, 1), o);
    const east = sub(geo.toWorld(1, 0), o);
    // 真上から北を画面の上にして見たとき、右が東になる関係: 右 = (-up.z, up.x)
    expect(east[0]).toBeCloseTo(-north[1], 9);
    expect(east[1]).toBeCloseTo(north[0], 9);

    const tokyo = geo.pos[IDX.tokyo];
    const toOsaka = sub(geo.pos[IDX.osaka], tokyo);
    const toSapporo = sub(geo.pos[IDX.sapporo], tokyo);
    expect(dot(toOsaka, east)).toBeLessThan(0); // 大阪は東京の西
    expect(dot(toSapporo, north)).toBeGreaterThan(0); // 札幌は東京の北
    // 沖縄は鹿児島の南西
    const toOkinawa = sub(geo.pos[IDX.okinawa], geo.pos[IDX.kagoshima]);
    expect(dot(toOkinawa, north)).toBeLessThan(0);
    expect(dot(toOkinawa, east)).toBeLessThan(0);
  });

  it('northAngle: 北の向きの単位ベクトルが [cos, sin]、東がその右', () => {
    const o = geo.toWorld(0, 0);
    const north = sub(geo.toWorld(0, 1), o);
    const len = Math.hypot(...north);
    expect(Math.cos(geo.northAngle)).toBeCloseTo(north[0] / len, 9);
    expect(Math.sin(geo.northAngle)).toBeCloseTo(north[1] / len, 9);
  });

  it('kmPerUnit は拡大率の逆数(1 単位が何 km か)', () => {
    const p = prefectures();
    const kmDist = Math.hypot(p[IDX.sapporo].x - p[IDX.tokyo].x, p[IDX.sapporo].y - p[IDX.tokyo].y);
    const worldDist = Math.hypot(...[geo.pos[IDX.sapporo][0] - geo.pos[IDX.tokyo][0], geo.pos[IDX.sapporo][1] - geo.pos[IDX.tokyo][1]]);
    expect(worldDist * geo.kmPerUnit).toBeCloseTo(kmDist, 6);
  });

  it('47 件でなければ例外', () => {
    expect(() => geoLayout([])).toThrow();
  });
});

describe('nodePos', () => {
  const line = lineLayout();
  const geo = geoLayout(prefectures()).pos;
  it('morph = 0 で一直線、1 で地理配置、その間は線形補間', () => {
    for (const i of [0, 12, 46]) {
      expect(nodePos(line, geo, i, 0)).toEqual(line[i]);
      expect(nodePos(line, geo, i, 1)).toEqual(geo[i]);
      const m = nodePos(line, geo, i, 0.25);
      expect(m[0]).toBeCloseTo(line[i][0] * 0.75 + geo[i][0] * 0.25, 9);
      expect(m[1]).toBeCloseTo(line[i][1] * 0.75 + geo[i][1] * 0.25, 9);
    }
  });
});
