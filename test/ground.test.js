import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { geoLayout } from '../src/geometry/layout.js';
import { RENDER_ORDER } from '../src/scene/shared.js';
import {
  APPEAR,
  GROUND_ORDER,
  ISLAND_MIN_PX,
  LAND_OPACITY,
  appearance,
  boundsOfLines,
  buildLandFill,
  buildRibbonGeometry,
  extractBoundaryLines,
} from '../src/scene/ground.js';

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

describe('陸地の面の三角形分割', () => {
  const land = buildLandFill(topology, geo.toWorld);
  const triCount = land.index.length / 3;
  const tri = (k) => {
    const v = [0, 1, 2].map((j) => {
      const i = land.index[k * 3 + j];
      return [land.positions[i * 3], land.positions[i * 3 + 2]];
    });
    return { v, pref: land.prefs[land.index[k * 3]] };
  };
  const area2 = ([a, b, c]) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const inTri = (p, [a, b, c]) => {
    const d1 = area2([a, b, p]), d2 = area2([b, c, p]), d3 = area2([c, a, p]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };

  it('頂点と添字が有限で、三角形が 47 都道府県すべてにある', () => {
    expect(triCount).toBeGreaterThan(1000);
    expect(land.positions.every(Number.isFinite)).toBe(true);
    expect(land.prefs.length * 3).toBe(land.positions.length);
    expect(Math.max(...land.index)).toBeLessThan(land.prefs.length);
    const seen = new Set();
    for (let k = 0; k < triCount; k++) seen.add(tri(k).pref);
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 47 }, (_, i) => i));
  });

  it('47 都道府県の代表点が、その都道府県の面(三角形)の内側にある', () => {
    const byPref = Array.from({ length: 47 }, () => []);
    for (let k = 0; k < triCount; k++) {
      const t = tri(k);
      byPref[t.pref].push(t.v);
    }
    prefectures.forEach((p, i) => {
      expect(byPref[i].some((t) => inTri(geo.pos[i], t)), p.ja).toBe(true);
    });
  });

  it('三角形の面積の和が、各都道府県の領域(外輪 − 穴)の面積と一致する(分割の取りこぼしがない)', () => {
    const ringArea = (r) => {
      let a = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
      return Math.abs(a) / 2;
    };
    const expected = new Array(47).fill(0);
    topology.objects.japan.geometries.forEach((g, gi) => {
      for (const [outer, ...holes] of regionOf(gi)) {
        expected[g.id - 1] += ringArea(outer) - holes.reduce((s, h) => s + ringArea(h), 0);
      }
    });
    const got = new Array(47).fill(0);
    for (let k = 0; k < triCount; k++) {
      const t = tri(k);
      got[t.pref] += Math.abs(area2(t.v)) / 2;
    }
    prefectures.forEach((p, i) => {
      expect(Math.abs(got[i] - expected[i]) / expected[i], p.ja).toBeLessThan(1e-3); // 頂点は Float32 に丸めるので、小さな島の多い県で 1e-4 台のずれが出る
    });
  });
});

describe('不透明度', () => {
  it('紙・墨の両テーマで、陸地の面は薄く(0.04〜0.10)、選択地域はそれより濃く、県境は面より強い', () => {
    for (const o of Object.values(LAND_OPACITY)) {
      expect(o.land).toBeGreaterThanOrEqual(0.04);
      expect(o.land).toBeLessThanOrEqual(0.1);
      expect(o.selected).toBeGreaterThan(o.land);
      expect(o.border).toBeGreaterThan(o.selected);
    }
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

describe('量の見え方を変えない描く順序と、小さな島', () => {
  it('地面の層は、地下の弧の後、地下の粒子の前に描く(紙色の面が地下の粒子を薄くしない)', () => {
    expect(GROUND_ORDER).toBeGreaterThan(RENDER_ORDER.arcsBelow);
    expect(GROUND_ORDER).toBeLessThan(RENDER_ORDER.particlesBelow);
  });

  it('陸地の面の頂点は、属する島の面積を持つ。粒子ほどの島は 1440 幅の全国の画面で描かない大きさになる', () => {
    const land = buildLandFill(topology, geo.toWorld);
    expect(land.areas.length).toBe(land.prefs.length);
    expect([...land.areas].every((a) => Number.isFinite(a) && a >= 0)).toBe(true);
    const unique = [...new Set(land.areas)].sort((a, b) => a - b);
    // 全国の斜め俯瞰(1440 × 900)で、ワールド 1 単位はおよそ 0.6 CSS px。最も小さい島は 12 px² に届かない
    const px = 0.6;
    expect(unique[0] * px * px).toBeLessThan(ISLAND_MIN_PX);
    // 本州は十分に大きい
    expect(unique[unique.length - 1] * px * px).toBeGreaterThan(100 * ISLAND_MIN_PX);
  });
});
