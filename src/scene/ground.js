// 地面(y = 0 の xz 平面)と境界線の描画。
// 紙の色の半透明の面と、都道府県の境界(県境と海岸線)。RENDER_ORDER.ground で描く。
// 境界線の頂点は、data.topology(座標は prefectures.json と同じ平面座標、km)を shared.layout.toWorld(mapX, mapY) → [x, z] でワールド座標へ移す。
// 境界線と地面は、morph が 0 に近いほど薄く、真横(カメラが地面と平行)では描かない。
//
// 層の約束(arcs / particles / ground で共通):
//   createXxxLayer(ctx) → { object3D, update(frame), setYear(a, b, mix), setSelection(mask),
//                           setTheme(theme), setHover(arc | null), dispose() }
//   ctx = { shared, data, arcList }
//   描く順序: object3D の中の Mesh / Points(葉のオブジェクト)に shared.js の RENDER_ORDER を renderOrder として付ける。
import * as THREE from 'three';
import { RENDER_ORDER } from './shared.js';

// 不透明度の出どころ: docs/design/spec.md「6. three.js に渡す値」(--gl-ground、--gl-border)を shared.style から読む。
// 県境と海岸線の太さは CSS px で一定。
// 海岸線を基準(1)にした、県境の不透明度の比。
const BORDER_RATIO = 0.7;
const COAST_WIDTH = 0.8; // CSS px
const BORDER_WIDTH = 0.6; // CSS px
// morph がこの区間で、地面と境界線が 0 → 1 に現れる(smoothstep)。
export const APPEAR = Object.freeze({ from: 0.55, to: 0.95 });
// 地面の面は、境界線の範囲より外側へこの距離(ワールド単位)だけ広げ、縁をなめらかに消す。
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
uniform vec3 uInk;
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
  outColor = vec4(uInk, a); // uInk はトークンの sRGB の値。色空間は変換しない
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
  outColor = vec4(uPaper, a);
}`;

export function createGroundLayer(ctx) {
  const { shared, data } = ctx;
  const { uniforms } = shared;
  const object3D = new THREE.Group();
  object3D.name = 'ground';

  const { border, coast } = extractBoundaryLines(data.topology, shared.layout.toWorld);
  const rect = boundsOfLines([...border, ...coast]);

  // 地面: 境界線の範囲を覆う面。縁は GROUND_FEATHER の幅でなめらかに消える。
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

  const makeLines = (name, lines, width) => {
    const geom = buildRibbonGeometry(lines);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uRes: uniforms.uRes,
        uPixelRatio: uniforms.uPixelRatio,
        uInk: uniforms.uInk,
        uWidth: { value: width },
        uOpacity: { value: 0 },
      },
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = RENDER_ORDER.ground;
    return mesh;
  };
  const borderMesh = makeLines('ground-border', border, BORDER_WIDTH);
  const coastMesh = makeLines('ground-coast', coast, COAST_WIDTH);
  // 同じ renderOrder の中では、先に追加したものが先に描かれる(面 → 県境 → 海岸線)
  object3D.add(groundMesh, borderMesh, coastMesh);

  // テーマで決まる基準の不透明度。morph の現れ方(appear)を掛けて素材へ渡す。
  const base = { ground: 0, border: 0, coast: 0 };
  let appear = appearance(uniforms.uMorph.value);
  const apply = () => {
    groundMat.uniforms.uOpacity.value = base.ground * appear;
    borderMesh.material.uniforms.uOpacity.value = base.border * appear;
    coastMesh.material.uniforms.uOpacity.value = base.coast * appear;
    const on = appear > 0.002;
    groundMesh.visible = borderMesh.visible = coastMesh.visible = on;
  };
  const setTheme = () => {
    const o = shared.style; // renderer が先に shared.setTheme を呼ぶ
    base.ground = o.ground;
    base.coast = o.border;
    base.border = o.border * BORDER_RATIO;
    apply();
  };
  setTheme();

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
    setSelection() {},
    setTheme,
    setHover() {},
    /** 地面・県境・海岸線の基準の不透明度を個別に変える({ ground, border, coast } の一部)。 */
    setOpacity(o) {
      Object.assign(base, o);
      apply();
    },
    dispose() {
      for (const m of [groundMesh, borderMesh, coastMesh]) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
