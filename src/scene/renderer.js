// three.js の描画器。透明なキャンバスに正投影カメラで描く。
// 自分で描くのは 47 都道府県の点だけ(一直線 ↔ 地理配置の補間つき)。
// 弧・粒子・地面は層(scene/arcs.js、particles.js、ground.js)が受け持ち、ここは層を登録して呼び出す。
import * as THREE from 'three';
import { GLSL_NODES, RENDER_ORDER, createShared } from './shared.js';
import { nodePos } from '../geometry/layout.js';
import { arcList } from '../geometry/flows.js';
import { createArcsLayer } from './arcs.js';
import { createParticlesLayer } from './particles.js';
import { createGroundLayer } from './ground.js';

const MAX_DPR = 2;

// 都道府県の点(デザイン仕様 6 節): 墨の直径 3 CSS px。選択中は朱の直径 6 CSS px に、紙色の 1.5 CSS px の輪。
const NODE_DOT = 3;
const NODE_SEL = 6;
const NODE_RING = 1.5;

const NODE_VERT = /* glsl */ `
${GLSL_NODES}
in float aI;
in float aSel;
uniform float uPixelRatio;
out float vSel;
out float vSize;
void main(){
  vec2 p = nodePos(aI);
  vSel = aSel;
  gl_Position = projectionMatrix * viewMatrix * vec4(p.x, 0.0, p.y, 1.0);
  // 実ピクセルでの外径(選択中は輪を含む)。+1 は縁をなめらかにする余白
  vSize = (aSel > 0.5 ? ${(NODE_SEL + 2 * NODE_RING).toFixed(1)} : ${NODE_DOT.toFixed(1)}) * uPixelRatio;
  gl_PointSize = vSize + 1.0;
}`;
const NODE_FRAG = /* glsl */ `
uniform vec3 uInk, uAccent, uPaper;
uniform float uPixelRatio;
in float vSel;
in float vSize;
out vec4 outColor;
void main(){
  float r = length(gl_PointCoord * 2.0 - 1.0) * (vSize + 1.0) * 0.5; // 中心からの距離(実ピクセル)
  float outer = clamp(vSize * 0.5 - r + 0.5, 0.0, 1.0);
  if (outer <= 0.0) discard;
  if (vSel < 0.5) { outColor = vec4(uInk, outer); return; }
  // 選択中: 朱の円と、その外側の紙色の輪(色はトークンの sRGB の値のまま出す)
  float inner = clamp(${(NODE_SEL / 2).toFixed(1)} * uPixelRatio - r + 0.5, 0.0, 1.0);
  outColor = vec4(mix(uPaper, uAccent, inner), outer);
}`;

/**
 * createRenderer(canvas, data) → {
 *   setView({ azimuth, elevation, zoom, center, roll }),
 *     azimuth: Y 軸まわり(0 でカメラは +z 側にあり、x が右)、elevation: 仰角(π/2 で真上)、
 *     zoom: ワールド 1 単位が画面の高さの何分の一か(画面の大きさに依らない。CSS px = zoom * 画面の高さ)、
 *     center: [x, y, z] 注視点、roll: 画面の像を時計まわりに回す角度(ラジアン)
 *   setMorph(m), setLean(l), setSelection(Uint8Array(47)), setYear(a, b, mix), setTheme('paper' | 'ink'),
 *   setReducedMotion(bool), setStill(bool), setHover(arc | null), resize(), render(timeSec),
 *   project(i) → [x, y](CSS px), dispose()
 *   ほかに: layout(配置の情報)、getState()、screenMatrix()(world → CSS px のアフィン 2x4)
 * }
 * scene/fallback2d.js の createFallback も、同じメソッドを持つ。
 */
export function createRenderer(canvas, data) {
  const gl = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  gl.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);

  const shared = createShared(data);
  const { uniforms, layout } = shared;
  const line = layout.line;

  const st = {
    mask: new Uint8Array(47),
    yearA: data.years[data.years.length - 1],
    yearB: data.years[data.years.length - 1],
    mix: 0,
    hover: null,
    theme: 'paper',
    reducedMotion: false,
    still: false,
    morph: 0,
    lean: 0,
    view: { azimuth: 0, elevation: 0, zoom: 0.003, center: [0, 0, 0], roll: 0 },
    width: 1,
    height: 1,
    time: 0,
  };

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
    uniforms: { ...uniforms },
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
  });
  const nodes = new THREE.Points(nodeGeom, nodeMat);
  nodes.frustumCulled = false;
  nodes.renderOrder = RENDER_ORDER.nodes;
  scene.add(nodes);

  // 層(弧・粒子・地面)。中身は各層の担当が実装する
  const ctx = { shared, data, arcList: arcList() };
  const layers = [createArcsLayer(ctx), createParticlesLayer(ctx), createGroundLayer(ctx)];
  for (const layer of layers) scene.add(layer.object3D);
  const each = (name, ...args) => layers.forEach((l) => l[name]?.(...args));

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
      // 像が時計まわりに roll 回るよう、上向きを視線の逆向きの軸まわりに反時計回りへ回す
      vUp.applyAxisAngle(vTmp.copy(vFwd).negate(), roll);
    }
    camera.up.copy(vUp);
    camera.zoom = zoom * st.height;
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

  shared.setTheme(st.theme);
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
      shared.setMorph(m);
      st.morph = uniforms.uMorph.value;
    },
    setLean(l) {
      st.lean = l;
      shared.setLean(l);
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
      shared.setTheme(theme);
      each('setTheme', theme);
    },
    setReducedMotion(on) {
      st.reducedMotion = !!on;
    },
    /** 撮影用の固定(URL の still=1)。粒子は静止の配置になる。 */
    setStill(on) {
      st.still = !!on;
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
      const buf = gl.getDrawingBufferSize(new THREE.Vector2());
      shared.setSize(buf.x, buf.y, dpr);
      applyFrustum();
      applyView();
    },
    render(timeSec) {
      const dt = Math.max(0, timeSec - st.time);
      st.time = timeSec;
      shared.setTime(timeSec);
      const frame = { time: timeSec, dt, reducedMotion: st.reducedMotion, still: st.still };
      each('update', frame);
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
      shared.dispose();
      gl.dispose();
    },
  };
  api.resize();
  return api;
}
