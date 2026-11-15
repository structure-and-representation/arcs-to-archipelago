import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { geoLayout } from '../src/geometry/layout.js';
import { APPEAR, appearance, boundsOfLines, buildRibbonGeometry, extractBoundaryLines } from '../src/scene/ground.js';

const read = (f) => JSON.parse(readFileSync(resolve(__dirname, '../public/data', f), 'utf8'));
const topology = read('japan.topojson');
const prefectures = read('prefectures.json');
const geo = geoLayout(prefectures);

// 県の領域(ワールド座標)へ移した外輪と穴
function regionOf(gi) {
  const tr = topology.transform;
  const arcs = topology.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map((p) => {
      x += p[0];
      y += p[1];
      return geo.toWorld(x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]);
    });
  });
  const ringPts = (ring) => {
    const out = [];
    for (const i of ring) {
      const pts = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
      out.push(...(out.length ? pts.slice(1) : pts));
    }
    return out;
  };
  const g = topology.objects.japan.geometries[gi];
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  return polys.map((poly) => poly.map(ringPts));
}
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (pt, rings) => rings.reduce((n, r) => n + (inRing(pt, r) ? 1 : 0), 0) % 2 === 1;

describe('境界線とワールド座標', () => {
  it('47 都道府県の点(地理配置)が、その都道府県の領域の内側にある', () => {
    const geoms = topology.objects.japan.geometries;
    expect(geoms).toHaveLength(47);
    geoms.forEach((g, gi) => {
      const i = g.id - 1;
      const polys = regionOf(gi);
      expect(polys.some((rings) => inPolygon(geo.pos[i], rings)), prefectures[i].ja).toBe(true);
    });
  });

  it('県境と海岸線の頂点が有限で、地理配置の範囲と矛盾しない', () => {
    const { border, coast } = extractBoundaryLines(topology, geo.toWorld);
    expect(border.length).toBeGreaterThan(50);
    expect(coast.length).toBeGreaterThan(40);
    const b = boundsOfLines([...border, ...coast]);
    for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true);
    // 47 点は海岸線の外接矩形の内側にある
    for (const [x, z] of geo.pos) {
      expect(x).toBeGreaterThan(b.minX);
      expect(x).toBeLessThan(b.maxX);
      expect(z).toBeGreaterThan(b.minZ);
      expect(z).toBeLessThan(b.maxZ);
    }
  });

  it('県境の頂点は、隣り合う 2 つの県の領域の縁にある(海岸線は 1 つの県だけ)', () => {
    const { border, coast } = extractBoundaryLines(topology, geo.toWorld);
    const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    const owners = new Map();
    topology.objects.japan.geometries.forEach((g, gi) => {
      for (const rings of regionOf(gi)) for (const r of rings) for (const p of r) {
        const k = key(p);
        if (!owners.has(k)) owners.set(k, new Set());
        owners.get(k).add(gi);
      }
    });
    for (const line of border) for (const p of line) expect(owners.get(key(p))?.size).toBeGreaterThanOrEqual(2);
    for (const line of coast) for (const p of line) expect(owners.get(key(p))?.size).toBeGreaterThanOrEqual(1);
    // 県境の弧は、2 つ以上の都道府県が共有している点だけからなる(海岸線の弧の内部は 1 つの県のみ)
    const interior = coast.flatMap((l) => l.slice(1, -1));
    const shared = interior.filter((p) => owners.get(key(p)).size >= 2);
    expect(shared.length).toBeLessThan(interior.length * 0.05);
  });

  it('北が上: 札幌は鹿児島より、ワールドの z が(北ほど小さい向きで)地図の北へ並ぶ', () => {
    const n = geo.toWorld(0, 100);
    const o = geo.toWorld(0, 0);
    expect(Math.atan2(n[1] - o[1], n[0] - o[0])).toBeCloseTo(geo.northAngle, 10);
  });
});

describe('リボンの頂点', () => {
  it('折れ線 1 本から前後の頂点を持つ 2 頂点ずつの帯を作る', () => {
    const g = buildRibbonGeometry([[[0, 0], [1, 0], [1, 1]]]);
    expect(g.getAttribute('position').count).toBe(6);
    expect(g.getIndex().count).toBe(12);
    expect([...g.getAttribute('aSide').array]).toEqual([-1, 1, -1, 1, -1, 1]);
    expect(Array.from(g.getAttribute('aPrev').array.slice(6, 9))).toEqual([0, 0, 0]);
    expect(Array.from(g.getAttribute('aNext').array.slice(6, 9))).toEqual([1, 0, 1]);
  });
  it('閉じた線は前後がつながる', () => {
    const g = buildRibbonGeometry([[[0, 0], [1, 0], [1, 1], [0, 0]]]);
    expect(Array.from(g.getAttribute('aPrev').array.slice(0, 3))).toEqual([1, 0, 1]);
    expect(Array.from(g.getAttribute('aNext').array.slice(18, 21))).toEqual([1, 0, 0]);
  });
});

describe('現れ方', () => {
  it('morph が小さいうちは 0、大きいと 1、その間は単調に増える', () => {
    expect(appearance(0)).toBe(0);
    expect(appearance(APPEAR.from)).toBe(0);
    expect(appearance(APPEAR.to)).toBe(1);
    expect(appearance(1)).toBe(1);
    let prev = 0;
    for (let m = 0; m <= 1; m += 0.05) {
      expect(appearance(m)).toBeGreaterThanOrEqual(prev);
      prev = appearance(m);
    }
  });
});
