// three.js の描画器。透明なキャンバスに正投影カメラで描く。
// 最小実装: 47 都道府県を点として描き、一直線 ↔ 地理配置の補間(morph)ができる。
// 弧・粒子・地面は scene/arcs.js、particles.js、ground.js が受け持つ。
import * as THREE from 'three';
import { K } from '../geometry/constants.js';
import { GLSL_ARC } from '../geometry/arc.js';
import { lineLayout, geoLayout, nodePos } from '../geometry/layout.js';
import { createArcs } from './arcs.js';
import { createParticles } from './particles.js';
import { createGround } from './ground.js';

const MAX_DPR = 2;
// 描く順序(小さいほど先): 地下の弧と粒子、地面、地上の弧と粒子
const ORDER = { arcsBelow: 0, particlesBelow: 1, ground: 2, arcsAbove: 3, particlesAbove: 4, nodes: 5 };

// 色は styles/tokens.css の --bg / --fg / --accent から読む(読めなければ既定値)
const FALLBACK = {
  paper: { bg: '#f6f3ec', fg: '#1b1a17', accent: '#c9331f' },
  ink: { bg: '#1b1a17', fg: '#f6f3ec', accent: '#e5533b' },
};
function readColors(theme) {
  const out = { ...FALLBACK[theme] };
  if (typeof document !== 'undefined') {
    const cs = getComputedStyle(document.documentElement);
    for (const [key, v] of [['bg', '--bg'], ['fg', '--fg'], ['accent', '--accent']]) {
      const s = cs.getPropertyValue(v).trim();
      if (/^#[0-9a-f]{6}$/i.test(s)) out[key] = s;
    }
  }
  return out;
}

const NODE_VERT = /* glsl */ `
${GLSL_ARC}
in float aI;
in float aSel;
uniform float uPointSize;
out float vSel;
void main(){
  vec2 p = nodePos(aI);
  vSel = aSel;
  gl_Position = projectionMatrix * viewMatrix * vec4(p.x, 0.0, p.y, 1.0);
  gl_PointSize = uPointSize * (1.0 + aSel * 0.6);
}`;
const NODE_FRAG = /* glsl */ `
uniform vec3 uInk, uAccent;
in float vSel;
out vec4 outColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a = clamp((1.0 - r) * gl_PointSize * 0.5 + 0.5, 0.0, 1.0);
  if (a <= 0.0) discard;
  vec3 col = mix(uInk, uAccent, vSel);
  outColor = vec4(col, a * mix(0.85, 1.0, vSel));
}`;

/**
 * createRenderer(canvas, data) → {
 *   setView({ azimuth, elevation, zoom, center, roll }),
 *     azimuth: Y 軸まわり(+z から)、elevation: 仰角、zoom: ワールド 1 単位が何 CSS px か、
 *     center: [x, y, z] 注視点、roll: 画面の像を時計まわりに回す角度(ラジアン)
 *   setMorph(m), setLean(l), setSelection(Uint8Array(47)), setYear(a, b, mix), setTheme('paper' | 'ink'),
 *   setReducedMotion(bool), setHover(arc | null), resize(), render(timeSec),
 *   project(i) → [x, y](CSS px), dispose()
 *   ほかに: layout(配置の情報)、getState()、screenMatrix()(world → CSS px のアフィン 2x4)
 * }
 */
export function createRenderer(canvas, data) {
  const gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  gl.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);

  const line = lineLayout();
  const geo = geoLayout(data.prefectures);
  const layout = { line, geo: geo.pos, toWorld: geo.toWorld, northAngle: geo.northAngle, kmPerUnit: geo.kmPerUnit, bounds: geo.bounds };

  const nodeArr = new Float32Array(47 * 4);
  for (let i = 0; i < 47; i++) nodeArr.set([line[i][0], line[i][1], layout.geo[i][0], layout.geo[i][1]], i * 4);
  const nodeTex = new THREE.DataTexture(nodeArr, 47, 1, THREE.RGBAFormat, THREE.FloatType);
  nodeTex.minFilter = nodeTex.magFilter = THREE.NearestFilter;
  nodeTex.needsUpdate = true;

  const uniforms = {
    uNodes: { value: nodeTex },
    uMorph: { value: 0 },
    uLean: { value: 0 },
    uK: { value: K },
    uRes: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uTime: { value: 0 },
    uInk: { value: new THREE.Color() },
    uPaper: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
  };

  const st = {
    mask: new Uint8Array(47),
    yearA: data.years[data.years.length - 1],
    yearB: data.years[data.years.length - 1],
    mix: 0,
    hover: null,
    theme: 'paper',
    reducedMotion: false,
    morph: 0,
    lean: 0,
    view: { azimuth: 0, elevation: 0, zoom: 1, center: [0, 0, 0], roll: 0 },
    width: 1,
    height: 1,
  };
  const ctx = { data, layout, uniforms, getState: () => st };

  // 都道府県の点
  const nodeGeom = new THREE.BufferGeometry();
  nodeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(47 * 3), 3));
  nodeGeom.setAttribute('aI', new THREE.BufferAttribute(Float32Array.from({ length: 47 }, (_, i) => i), 1));
  const selAttr = new THREE.BufferAttribute(new Float32Array(47), 1);
  nodeGeom.setAttribute('aSel', selAttr);
  const nodeMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { ...uniforms, uPointSize: { value: 5 } },
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
  });
  const nodes = new THREE.Points(nodeGeom, nodeMat);
  nodes.frustumCulled = false;
  nodes.renderOrder = ORDER.nodes;
  scene.add(nodes);

  // 弧・粒子・地面。中身は各モジュールの担当が実装する
  const arcs = createArcs(ctx);
  const particles = createParticles(ctx);
  const ground = createGround(ctx);
  arcs.below.renderOrder = ORDER.arcsBelow;
  particles.below.renderOrder = ORDER.particlesBelow;
  ground.object.renderOrder = ORDER.ground;
  arcs.above.renderOrder = ORDER.arcsAbove;
  particles.above.renderOrder = ORDER.particlesAbove;
  scene.add(arcs.below, particles.below, ground.object, arcs.above, particles.above);
  const parts = [arcs, particles, ground];
  const each = (name, ...args) => parts.forEach((p) => p[name]?.(...args));

  const vFwd = new THREE.Vector3();
  const vUp = new THREE.Vector3();
  const vTmp = new THREE.Vector3();

  function applyView() {
    const { azimuth, elevation, zoom, center, roll } = st.view;
    const r = 2000;
    const ce = Math.cos(elevation), se = Math.sin(elevation);
    const sa = Math.sin(azimuth), ca = Math.cos(azimuth);
    camera.position.set(center[0] + r * ce * sa, center[1] + r * se, center[2] + r * ce * ca);
    // 上向きは仰角 90° でも定まる形(elevation = 0 で +y、90° で方位の反対向きの水平)
    vUp.set(-se * sa, ce, -se * ca);
    if (roll) {
      vFwd.set(-ce * sa, -se, -ce * ca); // カメラの向き
      // 像が時計まわりに roll 回るよう、上向きを視線まわり(視線の逆向きの軸)に反時計回りへ回す
      vUp.applyAxisAngle(vTmp.copy(vFwd).negate(), roll);
    }
    camera.up.copy(vUp);
    camera.zoom = zoom;
    camera.lookAt(center[0], center[1], center[2]);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function applyFrustum() {
    camera.left = -st.width / 2;
    camera.right = st.width / 2;
    camera.top = st.height / 2;
    camera.bottom = -st.height / 2;
    camera.updateProjectionMatrix();
  }

  function applyTheme() {
    const c = readColors(st.theme);
    uniforms.uPaper.value.set(c.bg);
    uniforms.uInk.value.set(c.fg);
    uniforms.uAccent.value.set(c.accent);
  }
  applyTheme();
  applyView();

  const api = {
    layout,
    getState: () => st,
    setView(v) {
      const cur = st.view;
      st.view = {
        azimuth: v.azimuth ?? cur.azimuth,
        elevation: v.elevation ?? cur.elevation,
        zoom: v.zoom ?? cur.zoom,
        center: v.center ?? cur.center,
        roll: v.roll ?? cur.roll,
      };
      applyView();
    },
    setMorph(m) {
      st.morph = Math.min(1, Math.max(0, m));
      uniforms.uMorph.value = st.morph;
    },
    setLean(l) {
      st.lean = l;
      uniforms.uLean.value = l;
    },
    setSelection(mask) {
      st.mask = mask;
      for (let i = 0; i < 47; i++) selAttr.array[i] = mask[i] ? 1 : 0;
      selAttr.needsUpdate = true;
      each('setSelection', mask);
    },
    setYear(a, b, mix) {
      st.yearA = a;
      st.yearB = b;
      st.mix = mix;
      each('setYear', a, b, mix);
    },
    setTheme(theme) {
      st.theme = theme;
      applyTheme();
      each('setTheme', theme);
    },
    setReducedMotion(on) {
      st.reducedMotion = !!on;
      each('setReducedMotion', !!on);
    },
    setHover(arc) {
      st.hover = arc;
      each('setHover', arc);
    },
    /** キャンバスの CSS サイズと devicePixelRatio(上限 2)に合わせて描画バッファを作り直す。 */
    resize() {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
      gl.setPixelRatio(dpr);
      gl.setSize(w, h, false);
      st.width = w;
      st.height = h;
      uniforms.uPixelRatio.value = dpr;
      gl.getDrawingBufferSize(uniforms.uRes.value);
      nodeMat.uniforms.uPointSize.value = 5 * dpr;
      applyFrustum();
      applyView();
    },
    render(timeSec) {
      uniforms.uTime.value = timeSec;
      each('update', timeSec);
      gl.render(scene, camera);
    },
    /** 都道府県 i の画面位置(キャンバス左上からの CSS px)。現在の morph を反映する。 */
    project(i) {
      const p = nodePos(line, layout.geo, i, uniforms.uMorph.value);
      vTmp.set(p[0], 0, p[1]).project(camera);
      return [((vTmp.x + 1) / 2) * st.width, ((1 - vTmp.y) / 2) * st.height];
    },
    /**
     * ワールド座標 (x, y, z) → CSS px のアフィン変換 [m0..m3, m4..m7]。
     *   sx = m0*x + m1*y + m2*z + m3,  sy = m4*x + m5*y + m6*z + m7
     * 当たり判定が、射影を何度も呼ばずに使うためのもの。
     */
    screenMatrix() {
      const e = camera.projectionMatrix.elements;
      const v = camera.matrixWorldInverse.elements;
      const m = new Float64Array(8);
      // 正投影なので、clip.x = e0 * view.x + e12、clip.y = e5 * view.y + e13、view = V * world
      const sxs = st.width / 2, sys = st.height / 2;
      for (let k = 0; k < 3; k++) {
        m[k] = sxs * e[0] * v[k * 4 + 0];
        m[4 + k] = -sys * e[5] * v[k * 4 + 1];
      }
      m[3] = sxs * (e[0] * v[12] + e[12] + 1);
      m[7] = sys * (-(e[5] * v[13] + e[13]) + 1);
      return m;
    },
    dispose() {
      each('dispose');
      nodeGeom.dispose();
      nodeMat.dispose();
      nodeTex.dispose();
      gl.dispose();
    },
  };
  api.resize();
  return api;
}
