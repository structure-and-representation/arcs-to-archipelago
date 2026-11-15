// 粒子の描画(確定仕様: docs/particles/spec.md)。1粒 = 100 人、1粒 = 1頂点の THREE.Points。
//   - 枠は弧ごとに全年の ceil(v / 100) の最大(計 26,206)。属性は aSlot = (o, d, k) だけ。
//   - 年ごとの人数は R32F のテクスチャ(47 × 47·年数)で渡し、2つの年を補間する。
//   - 粒子は弧の長さに沿って並べ(arcT)、すべての弧を 14 秒で流れる。
//   - 地下と地上の 2 つの Points を RENDER_ORDER.particlesBelow / particlesAbove で描く。
//     選択が変わるたびに CPU で枠を [地下 | 地上] に並べ直し、drawRange で分ける。
//   - 動きを減らす設定(frame.reducedMotion)と still=1(frame.still)では、静止の配置(0.04 + 0.92·g)にする。
//   - 不透明度の上限と径は shared.style(tokens.css の --gl-particle*、デザイン仕様 6 節)から読む。
//     地域を選んでいるときは *Sel の値。ホバー中の弧の粒子は朱で、径は *Hover の値。
//   計算の JavaScript 版は geometry/particles.js にある(当たり判定・代替表示・テストが使う)。
//
// 層の約束(arcs / particles / ground で共通):
//   createXxxLayer(ctx) → { object3D, update(frame), setYear(a, b, mix), setSelection(mask),
//                           setTheme(theme), setHover(arc | null), dispose() }
//   ctx = { shared, data, arcList }。frame = { time(秒)、dt(秒)、reducedMotion、still }。
import * as THREE from 'three';
import { GLSL_COMMON, RENDER_ORDER } from './shared.js';
import { N } from '../geometry/constants.js';
import {
  ARC_T,
  FADE,
  PHI,
  countsTextureData,
  orderSlots,
  phaseAt,
  slotBudget,
} from '../geometry/particles.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

export const PARTICLE_VERT = /* glsl */ `
${GLSL_COMMON}
uniform sampler2D uCounts;   // R32F, 47 x (47*NY), Nearest; texel (d, year*47 + o) = 人数
uniform int   uYearA, uYearB;
uniform float uYearMix;      // 0..1(イージング済み)
uniform float uPhase;        // fract(timeSec / 14)、CPU で倍精度で計算する。静止では 0
uniform float uStill;        // 1 = 静止の配置
uniform float uSize;         // 直径(描画バッファの px = CSS px * DPR)
uniform float uAlpha;
uniform sampler2D uArcState; // shared: texel (d, o) = (side −1〜+1, alpha 0〜1)。弧の層が選択の切り替えに合わせて書く
uniform float uPass;         // +1 地上、-1 地下
uniform vec2  uHover;        // ホバー中の弧 (o, d)。なければ (-1, -1)
uniform float uSizeHover;
in vec3 aSlot;               // o, d, k
out float vA;
out float vHover;
out float vSize;

uint hash(uint x){ x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float u01(uint x){ return float(hash(x) >> 8) * (1.0 / 16777216.0); }

// 弧の長さの割合 s → B スプラインの媒介変数 t(すべての弧で同じ式)
float arcT(float s){
  const float C = ${f(ARC_T.C)}, S0 = ${f(ARC_T.S0)};
  if (s < S0)       return pow(max(s, 0.0) / C, 1.0 / 3.0);
  if (s > 1.0 - S0) return 1.0 - pow(max(1.0 - s, 0.0) / C, 1.0 / 3.0);
  float x = s - 0.5, x2 = x * x;
  return 0.5 + x * (${f(ARC_T.c1)} + x2 * (${f(ARC_T.c3)} + x2 * ${f(ARC_T.c5)}));
}

void main(){
  int o = int(aSlot.x + 0.5), d = int(aSlot.y + 0.5); float k = aSlot.z;
  // 側と濃さは弧の層と同じ値(選択の切り替えの間も、弧と同じ側・同じ濃さで描く)
  vec2 st = texelFetch(uArcState, ivec2(d, o), 0).rg;
  float side = st.r;
  bool vis = st.g > 0.002 && side * uPass > 0.0;
  float n = mix(texelFetch(uCounts, ivec2(d, uYearA * ${N} + o), 0).r,
                texelFetch(uCounts, ivec2(d, uYearB * ${N} + o), 0).r, uYearMix) * 0.01;
  float w = clamp(n - k, 0.0, 1.0);                  // Σk w = 人数 / 100
  if (!vis || w <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vHover = 0.0; vSize = 0.0; return; }
  vHover = (abs(aSlot.x - uHover.x) < 0.5 && abs(aSlot.y - uHover.y) < 0.5) ? 1.0 : 0.0;
  vSize = mix(uSize, uSizeHover, vHover);

  float g = fract(k * ${f(PHI)} + u01(uint(o * ${N} + d)));
  float s = uStill > 0.5 ? ${f(FADE)} + ${f(1 - 2 * FADE)} * g : fract(g + uPhase);
  float t = arcT(s);

  // 弧の式を 1 回だけ評価する(nodePos は 2 回、t の属する区間だけ)
  vec2 a2 = nodePos(aSlot.x), b2 = nodePos(aSlot.y);
  vec2 dd = b2 - a2; float ch = max(length(dd), 1e-4);
  vec3 R = vec3(-dd.y, 0.0, dd.x) / ch;
  vec3 A = vec3(a2.x, 0.0, a2.y), B = vec3(b2.x, 0.0, b2.y);
  vec3 M = (A + B) * 0.5 + vec3(sin(uLean) * R.x, side * cos(uLean), sin(uLean) * R.z) * (uK * ch);
  float u = min(t, 0.99999) * 4.0; float j = floor(u); float fr = u - j;
  vec3 p = j < 0.5 ? bsp(A, A, A, M, fr) : j < 1.5 ? bsp(A, A, M, B, fr) : j < 2.5 ? bsp(A, M, B, B, fr) : bsp(M, B, B, B, fr);

  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_PointSize = vSize + 1.0;                        // +1 px は縁のなめらかさのぶん
  vA = uAlpha * st.g * w * smoothstep(0.0, ${f(FADE)}, s) * smoothstep(1.0, ${f(1 - FADE)}, s);
}`;

export const PARTICLE_FRAG = /* glsl */ `
uniform vec3 uInk, uAccent;
in float vA; in float vHover; in float vSize; out vec4 outColor;
void main(){
  float r = length(gl_PointCoord * 2.0 - 1.0) * (vSize + 1.0) * 0.5;
  float a = clamp(vSize * 0.5 - r + 0.5, 0.0, 1.0) * vA;
  if (a <= 0.0) discard;
  outColor = vec4(mix(uInk, uAccent, vHover), a); // トークンの sRGB の値。色空間は変換しない
}`;

export function createParticlesLayer(ctx) {
  const { shared, data } = ctx;
  const years = data.years;
  const matrixOf = (y) => data.matrix(y);

  const object3D = new THREE.Group();
  object3D.name = 'particles';
  // 検証用(tools/verify/arcs-parity.mjs): 弧の線だけを撮るときに粒子を隠す。開発サーバ(と Vitest)でだけ有効
  if (import.meta.env?.DEV && globalThis.__ARCS_DEBUG?.hideParticles) object3D.visible = false;

  // 枠の予算と属性(年や負荷で変えない)
  const { per, total } = slotBudget(years, matrixOf);
  const slotArr = new Float32Array(total * 3);
  const slotAttr = new THREE.BufferAttribute(slotArr, 3);
  const posAttr = new THREE.BufferAttribute(new Float32Array(total * 3), 3); // Points の頂点数のためだけ

  // 人数テクスチャ
  const countsTex = new THREE.DataTexture(
    countsTextureData(years, matrixOf),
    N,
    N * years.length,
    THREE.RedFormat,
    THREE.FloatType,
  );
  countsTex.internalFormat = 'R32F';
  countsTex.minFilter = countsTex.magFilter = THREE.NearestFilter;
  countsTex.generateMipmaps = false;
  countsTex.needsUpdate = true;

  const last = years.length - 1;
  const own = {
    uCounts: { value: countsTex },
    uYearA: { value: last },
    uYearB: { value: last },
    uYearMix: { value: 0 },
    uPhase: { value: 0 },
    uStill: { value: 0 },
    uSize: { value: shared.style.particleSize },
    uSizeHover: { value: shared.style.particleSizeHover },
    uAlpha: { value: shared.style.particle },
    uHover: { value: new THREE.Vector2(-1, -1) },
  };

  const passes = [
    { pass: -1, order: RENDER_ORDER.particlesBelow, name: 'particles-below' },
    { pass: 1, order: RENDER_ORDER.particlesAbove, name: 'particles-above' },
  ].map(({ pass, order, name }) => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', posAttr);
    geom.setAttribute('aSlot', slotAttr);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { ...shared.uniforms, ...own, uPass: { value: pass } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
    });
    const points = new THREE.Points(geom, mat);
    points.name = name;
    points.frustumCulled = false;
    points.renderOrder = order;
    object3D.add(points);
    return { geom, mat, points };
  });

  const yearIndex = (y) => {
    const i = years.indexOf(y);
    return i >= 0 ? i : last;
  };

  // 枠の並び: 選択が決まっているときは [地下 | 地上] に並べて描かない弧を除き(orderSlots)、
  // 弧の層が選択の切り替えを補間している間は、すべての枠を並べて、シェーダが弧の側と濃さ(uArcState)で振り分ける
  let target = new Uint8Array(N);
  let orderKey = null;
  function applyOrder(key, mask) {
    if (key === orderKey) return;
    orderKey = key;
    const ranges = orderSlots(per, mask, slotArr);
    slotAttr.needsUpdate = true;
    if (key === 'all') {
      const n = ranges.below.count + ranges.above.count;
      for (const p of passes) p.geom.setDrawRange(0, n);
    } else {
      passes[0].geom.setDrawRange(ranges.below.start, ranges.below.count);
      passes[1].geom.setDrawRange(ranges.above.start, ranges.above.count);
    }
  }
  function syncOrder() {
    if (shared.arcState?.transitioning) applyOrder('all', null);
    else applyOrder(target.join(''), target);
  }
  function setSelection(mask) {
    const m = new Uint8Array(N);
    if (mask) for (let i = 0; i < N; i++) m[i] = mask[i] ? 1 : 0;
    target = m;
    syncOrder();
  }
  setSelection(null);

  return {
    object3D,
    /** 弧ごとの枠の数(per[o * 47 + d])と合計。代替表示や確認に使う。 */
    slots: { per, total },
    /** 2つの Points の drawRange(確認用)。 */
    ranges: () => passes.map((p) => ({ ...p.geom.drawRange })),
    update(frame) {
      const motionless = !!frame?.still || !!frame?.reducedMotion;
      own.uStill.value = motionless ? 1 : 0;
      own.uPhase.value = phaseAt(frame?.time ?? 0, motionless);
      syncOrder();
      const st = shared.style;
      // 全国 ↔ 地域の見た目は、弧の層の補間(selMix)に合わせて移る
      const k = shared.arcState?.selMix ?? (target.some(Boolean) ? 1 : 0);
      const dpr = shared.uniforms.uPixelRatio.value;
      own.uSize.value = (st.particleSize + (st.particleSizeSel - st.particleSize) * k) * dpr;
      own.uSizeHover.value = st.particleSizeHover * dpr;
      own.uAlpha.value = st.particle + (st.particleSel - st.particle) * k;
    },
    setYear(a, b, mix) {
      own.uYearA.value = yearIndex(a);
      own.uYearB.value = yearIndex(b ?? a);
      own.uYearMix.value = Math.min(1, Math.max(0, mix ?? 0));
    },
    setSelection,
    setTheme() {}, // 色は shared.uniforms の uInk / uAccent、不透明度は update で shared.style から読む
    setHover(arc) {
      own.uHover.value.set(arc ? arc.o : -1, arc ? arc.d : -1);
    },
    dispose() {
      for (const p of passes) {
        p.geom.dispose();
        p.mat.dispose();
      }
      countsTex.dispose();
    },
  };
}
