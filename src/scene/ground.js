// 地面(y = 0 の xz 平面)の描画。「線はデータだけ」: 地形は線ではなく面で示す。
//   1. 紙の色の半透明の面(地下の弧と粒子を一段沈めて見せる)
//   2. 陸地: 墨の色のごく薄い面(都道府県ごとに三角形分割。海は紙のまま、海岸線は描かない)。選択地域は少し濃い
//   3. 県境: 陸地の面の中に入れる、紙の色の極細の線(面より明るく、抜いたように見える)
// RENDER_ORDER.ground で描く。
// 頂点は、data.topology(座標は prefectures.json と同じ平面座標、km)を shared.layout.toWorld(mapX, mapY) → [x, z] でワールド座標へ移す。
// 地面は、morph が 0 に近いほど薄く、真横(カメラが地面と平行)では描かない。
//
// 層の約束(arcs / particles / ground で共通):
//   createXxxLayer(ctx) → { object3D, update(frame), setYear(a, b, mix), setSelection(mask),
//                           setTheme(theme), setHover(arc | null), dispose() }
//   ctx = { shared, data, arcList }
//   描く順序: object3D の中の Mesh / Points(葉のオブジェクト)に shared.js の RENDER_ORDER を renderOrder として付ける。
import * as THREE from 'three';
import { RENDER_ORDER } from './shared.js';

// 地面の紙色の面の不透明度は、docs/design/spec.md「3. three.js に渡す値」の --gl-ground から読む。
// 陸地の面(uInk)・選択地域の面(uInk)・県境(uPaper)の不透明度はこのファイルの値。色は shared の uInk / uPaper だけを使う。
// 撮影した画面で比べて決めた(docs/screenshots/ground-fill/)。
const FALLBACK_GROUND = { paper: 0.3, ink: 0.35 };
export const LAND_OPACITY = Object.freeze({
  paper: { land: 0.08, selected: 0.13, border: 0.85 },
  ink: { land: 0.09, selected: 0.15, border: 0.85 },
});
const BORDER_WIDTH = 0.6; // CSS px。県境の太さは一定
// morph がこの区間で、地面と境界線が 0 → 1 に現れる(smoothstep)。
export const APPEAR = Object.freeze({ from: 0.55, to: 0.95 });
// 紙色の面は、陸地の範囲より外側へこの距離(ワールド単位)だけ広げ、縁をなめらかに消す。
const GROUND_FEATHER = 40;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** morph(0〜1)に対する、地面と境界線の現れ方(0〜1)。 */
export function appearance(morph) {
  return smoothstep(APPEAR.from, APPEAR.to, morph);
}

// ---- TopoJSON の展開(依存を足さずに、県境と海岸線の折れ線を取り出す) ----

function decodeArcs(topology) {
  const tr = topology.transform;
  return topology.arcs.map((arc) => {
    const out = [];
    let x = 0;
    let y = 0;
    for (const p of arc) {
      x += p[0];
      y += p[1];
      out.push(tr ? [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]] : [x, y]);
    }
    return out;
  });
}

function* ringArcIndices(geom) {
  const polys = geom.type === 'MultiPolygon' ? geom.arcs : geom.type === 'Polygon' ? [geom.arcs] : [];
  for (const poly of polys) for (const ring of poly) for (const i of ring) yield i < 0 ? ~i : i;
}

/**
 * 都道府県の境界を、県境(2つの都道府県が共有する arc)と海岸線(1つだけが持つ arc)の折れ線へ分ける。
 * 頂点は toWorld(mapX, mapY) → [x, z] でワールド座標へ移す。
 * 戻り値: { border: [x, z][][], coast: [x, z][][] }(折れ線の配列。最初と最後の頂点が同じなら閉じた線)
 */
export function extractBoundaryLines(topology, toWorld) {
  const arcs = decodeArcs(topology);
  const owners = new Map(); // arc の添字 → その arc を持つ都道府県(geometry の添字)の集合
  const geoms = topology.objects.japan.geometries;
  geoms.forEach((geom, gi) => {
    for (const a of ringArcIndices(geom)) {
      let s = owners.get(a);
      if (!s) owners.set(a, (s = new Set()));
      s.add(gi);
    }
  });
  const border = [];
  const coast = [];
  for (const [a, set] of owners) {
    const line = arcs[a].map(([mx, my]) => toWorld(mx, my));
    (set.size >= 2 ? border : coast).push(line);
  }
  return { border, coast };
}

/** 折れ線の集まりの外接矩形(ワールド座標)。 */
export function boundsOfLines(lines) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const line of lines) {
    for (const [x, z] of line) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  return { minX, maxX, minZ, maxZ };
}

// ---- 陸地の面(都道府県ごとの三角形分割) ----

function ringPoints(arcs, ring) {
  const out = [];
  for (const i of ring) {
    const pts = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
    out.push(...(out.length ? pts.slice(1) : pts));
  }
  // 閉じた環の末尾(先頭と同じ点)を除く
  const a = out[0], b = out[out.length - 1];
  if (out.length > 1 && a[0] === b[0] && a[1] === b[1]) out.pop();
  return out;
}

/**
 * 都道府県の領域を三角形に分割する(穴のある領域も扱う)。
 * 頂点は toWorld(mapX, mapY) → [x, z] でワールド座標へ移す。
 * 戻り値: { positions: Float32Array(x, 0, z の並び)、prefs: Float32Array(頂点ごとの都道府県の添字 0〜46)、index: 三角形の頂点の添字 }
 */
export function buildLandFill(topology, toWorld) {
  const arcs = decodeArcs(topology).map((line) => line.map(([mx, my]) => toWorld(mx, my)));
  const positions = [];
  const prefs = [];
  const index = [];
  topology.objects.japan.geometries.forEach((geom) => {
    const pref = geom.id - 1;
    const polys = geom.type === 'MultiPolygon' ? geom.arcs : geom.type === 'Polygon' ? [geom.arcs] : [];
    for (const poly of polys) {
      const rings = poly.map((ring) => ringPoints(arcs, ring));
      const [outer, ...holes] = rings;
      if (!outer || outer.length < 3) continue;
      const toV = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, z));
      const tris = THREE.ShapeUtils.triangulateShape(toV(outer), holes.filter((h) => h.length >= 3).map(toV));
      const flat = [...outer, ...holes.filter((h) => h.length >= 3).flat()];
      const base = positions.length / 3;
      for (const [x, z] of flat) {
        positions.push(x, 0, z);
        prefs.push(pref);
      }
      for (const t of tris) index.push(base + t[0], base + t[1], base + t[2]);
    }
  });
  return { positions: new Float32Array(positions), prefs: new Float32Array(prefs), index: new Uint32Array(index) };
}

// ---- 線のリボン(頂点シェーダで、画面上の法線方向へ CSS px の幅だけ押し出す) ----

/** 折れ線 → 前後の頂点を持つリボンの BufferGeometry。各頂点 2 つ(side = ∓1)。 */
export function buildRibbonGeometry(lines) {
  const pos = [];
  const prev = [];
  const next = [];
  const side = [];
  const index = [];
  for (const raw of lines) {
    // 連続する同じ点を除く
    const pts = [];
    for (const p of raw) {
      const q = pts[pts.length - 1];
      if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p);
    }
    if (pts.length < 2) continue;
    const closed = pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    const n = pts.length;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      let pi = i - 1;
      let ni = i + 1;
      if (closed) {
        if (i === 0) pi = n - 2;
        if (i === n - 1) ni = 1;
      } else {
        if (pi < 0) pi = 0;
        if (ni > n - 1) ni = n - 1;
      }
      for (const s of [-1, 1]) {
        pos.push(pts[i][0], 0, pts[i][1]);
        prev.push(pts[pi][0], 0, pts[pi][1]);
        next.push(pts[ni][0], 0, pts[ni][1]);
        side.push(s);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPrev', new THREE.Float32BufferAttribute(prev, 3));
  g.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(index);
  return g;
}

// 真横(カメラの視線が地面と平行)に近いほど 0 になる係数。地面と線は真横では描かない。
const FACING_GLSL = /* glsl */ `
float groundFacing(){
  // 視線の y 成分 = viewMatrix の (y 行, z 列)。仰角のおよそ 0〜9° で 0 → 1
  return smoothstep(0.0, 0.15, abs(viewMatrix[1][2]));
}`;

const LINE_VERT = /* glsl */ `
${FACING_GLSL}
in vec3 aPrev;
in vec3 aNext;
in float aSide;
uniform vec2 uRes;
uniform float uPixelRatio;
uniform float uWidth;
out float vDist;
out float vFacing;
vec2 toPx(vec3 p){
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  return c.xy / c.w * uRes * 0.5;
}
void main(){
  vec4 clip = projectionMatrix * viewMatrix * vec4(position, 1.0);
  vec2 cur = clip.xy / clip.w * uRes * 0.5;
  vec2 dp = cur - toPx(aPrev);
  vec2 dn = toPx(aNext) - cur;
  float lp = length(dp), ln = length(dn);
  vec2 tp = lp > 1e-4 ? dp / lp : vec2(0.0);
  vec2 tn = ln > 1e-4 ? dn / ln : vec2(0.0);
  if (lp <= 1e-4) tp = tn;
  if (ln <= 1e-4) tn = tp;
  vec2 nn = vec2(-tn.y, tn.x);
  vec2 tm = tp + tn;
  float tl = length(tm);
  vec2 nm = tl > 1e-4 ? vec2(-tm.y, tm.x) / tl : nn;
  float k = 1.0 / max(dot(nm, nn), 0.45); // ミター結合(鋭い角は 2.2 倍で打ち切る)
  float half_ = 0.5 * uWidth * uPixelRatio + 0.5; // 0.5 は縁をなめらかにする余白(実ピクセル)
  vec2 off = nm * aSide * half_ * k;
  clip.xy += off / (uRes * 0.5) * clip.w;
  gl_Position = clip;
  vDist = aSide * half_;
  vFacing = groundFacing();
}`;

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uWidth;
uniform float uPixelRatio;
uniform float uOpacity;
in float vDist;
in float vFacing;
out vec4 outColor;
void main(){
  float halfW = 0.5 * uWidth * uPixelRatio;
  float a = clamp(halfW + 0.5 - abs(vDist), 0.0, 1.0);
  a *= uOpacity * vFacing;
  if (a <= 0.0) discard;
  outColor = linearToOutputTexel(vec4(uColor, a)); // uColor は線形の THREE.Color。画面の色空間へ戻す
}`;

const GROUND_VERT = /* glsl */ `
${FACING_GLSL}
out vec2 vXZ;
out float vFacing;
void main(){
  vXZ = position.xz;
  vFacing = groundFacing();
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const GROUND_FRAG = /* glsl */ `
uniform vec3 uPaper;
uniform float uOpacity;
uniform vec4 uCore;      // 縁が消え始める矩形 (minX, minZ, maxX, maxZ)
uniform float uFeather;
in vec2 vXZ;
in float vFacing;
out vec4 outColor;
void main(){
  vec2 c = (uCore.xy + uCore.zw) * 0.5;
  vec2 h = (uCore.zw - uCore.xy) * 0.5;
  float d = length(max(abs(vXZ - c) - h, 0.0));
  float edge = 1.0 - smoothstep(0.0, uFeather, d);
  float a = uOpacity * edge * vFacing;
  if (a <= 0.0) discard;
  outColor = linearToOutputTexel(vec4(uPaper, a));
}`;

const LAND_VERT = /* glsl */ `
${FACING_GLSL}
in float aPref;
uniform float uSelect[47];
out float vSel;
out float vFacing;
void main(){
  vSel = uSelect[int(aPref + 0.5)];
  vFacing = groundFacing();
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;

const LAND_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform float uLand;
uniform float uLandSelected;
in float vSel;
in float vFacing;
out vec4 outColor;
void main(){
  float a = mix(uLand, uLandSelected, vSel) * vFacing;
  if (a <= 0.0) discard;
  outColor = linearToOutputTexel(vec4(uInk, a));
}`;

function readGroundOpacity(theme) {
  let v = FALLBACK_GROUND[theme] ?? FALLBACK_GROUND.paper;
  if (typeof document !== 'undefined') {
    const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gl-ground'));
    if (Number.isFinite(n)) v = n;
  }
  return v;
}

export function createGroundLayer(ctx) {
  const { shared, data } = ctx;
  const { uniforms } = shared;
  const object3D = new THREE.Group();
  object3D.name = 'ground';

  const { border, coast } = extractBoundaryLines(data.topology, shared.layout.toWorld);
  const rect = boundsOfLines([...border, ...coast]);

  // 紙色の面: 陸地の範囲を覆う。縁は GROUND_FEATHER の幅でなめらかに消える。
  const x0 = rect.minX - GROUND_FEATHER, x1 = rect.maxX + GROUND_FEATHER;
  const z0 = rect.minZ - GROUND_FEATHER, z1 = rect.maxZ + GROUND_FEATHER;
  const groundGeom = new THREE.BufferGeometry();
  groundGeom.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1], 3),
  );
  groundGeom.setIndex([0, 1, 2, 0, 2, 3]);
  const groundMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uPaper: uniforms.uPaper,
      uOpacity: { value: 0 },
      uCore: { value: new THREE.Vector4(rect.minX, rect.minZ, rect.maxX, rect.maxZ) },
      uFeather: { value: GROUND_FEATHER },
    },
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
  });
  const groundMesh = new THREE.Mesh(groundGeom, groundMat);
  groundMesh.name = 'ground-plane';
  groundMesh.frustumCulled = false;
  groundMesh.renderOrder = RENDER_ORDER.ground;

  // 陸地の面: 墨の色のごく薄い面。選択地域の都道府県だけ少し濃い。
  const land = buildLandFill(data.topology, shared.layout.toWorld);
  const landGeom = new THREE.BufferGeometry();
  landGeom.setAttribute('position', new THREE.BufferAttribute(land.positions, 3));
  landGeom.setAttribute('aPref', new THREE.BufferAttribute(land.prefs, 1));
  landGeom.setIndex(new THREE.BufferAttribute(land.index, 1));
  const select = new Float32Array(47);
  const landMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uInk: uniforms.uInk,
      uLand: { value: 0 },
      uLandSelected: { value: 0 },
      uSelect: { value: select },
    },
    vertexShader: LAND_VERT,
    fragmentShader: LAND_FRAG,
  });
  const landMesh = new THREE.Mesh(landGeom, landMat);
  landMesh.name = 'ground-land';
  landMesh.frustumCulled = false;
  landMesh.renderOrder = RENDER_ORDER.ground;

  // 県境: 陸地の面の中の、紙の色の極細の線。海岸線は線にしない(陸と海の境は面の縁として見える)。
  const borderGeom = buildRibbonGeometry(border);
  const borderMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uRes: uniforms.uRes,
      uPixelRatio: uniforms.uPixelRatio,
      uColor: uniforms.uPaper,
      uWidth: { value: BORDER_WIDTH },
      uOpacity: { value: 0 },
    },
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
  });
  const borderMesh = new THREE.Mesh(borderGeom, borderMat);
  borderMesh.name = 'ground-border';
  borderMesh.frustumCulled = false;
  borderMesh.renderOrder = RENDER_ORDER.ground;
  // 同じ renderOrder の中では、先に追加したものが先に描かれる(紙色の面 → 陸地 → 県境)
  object3D.add(groundMesh, landMesh, borderMesh);

  // テーマで決まる基準の不透明度。morph の現れ方(appear)を掛けて素材へ渡す。
  const base = { ground: 0, land: 0, selected: 0, border: 0 };
  let appear = appearance(uniforms.uMorph.value);
  const apply = () => {
    groundMat.uniforms.uOpacity.value = base.ground * appear;
    landMat.uniforms.uLand.value = base.land * appear;
    landMat.uniforms.uLandSelected.value = base.selected * appear;
    borderMat.uniforms.uOpacity.value = base.border * appear;
    const on = appear > 0.002;
    groundMesh.visible = landMesh.visible = borderMesh.visible = on;
  };
  const setTheme = (theme) => {
    const o = LAND_OPACITY[theme] ?? LAND_OPACITY.paper;
    base.ground = readGroundOpacity(theme);
    base.land = o.land;
    base.selected = o.selected;
    base.border = o.border;
    apply();
  };
  setTheme('paper');

  return {
    object3D,
    update() {
      const a = appearance(uniforms.uMorph.value);
      if (a !== appear) {
        appear = a;
        apply();
      }
    },
    setYear() {},
    /** 選択地域(mask: Uint8Array(47))の都道府県の面を、ほかの陸地より少し濃くする。 */
    setSelection(mask) {
      for (let i = 0; i < 47; i++) select[i] = mask && mask[i] ? 1 : 0;
    },
    setTheme,
    setHover() {},
    /** 基準の不透明度を個別に変える({ ground, land, selected, border } の一部)。 */
    setOpacity(o) {
      Object.assign(base, o);
      apply();
    },
    dispose() {
      for (const m of [groundMesh, landMesh, borderMesh]) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
