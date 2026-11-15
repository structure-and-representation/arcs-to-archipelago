// 全層(弧・粒子・地面・都道府県の点)が共有する uniform と GLSL 断片。
//
//   createShared(data) → {
//     uniforms,      全素材が同じ { value } を共有する(素材の uniforms に展開して使う)
//       uNodes       47×1 RGBA32F(lineX, lineZ, geoX, geoZ)、NearestFilter
//       uMorph, uLean, uK
//       uRes         描画バッファの実ピクセル数(vec2)、uPixelRatio
//       uTime        秒
//       uInk, uPaper, uAccent   現在のテーマの 前景 / 地 / 朱(THREE.Color)
//     layout,        { line, geo, toWorld, northAngle, kmPerUnit, bounds }
//     setMorph(m), setLean(l), setTime(sec),
//     setSize(bufferWidth, bufferHeight, pixelRatio),
//     setTheme(theme),  // 'paper' | 'ink'。色は styles/tokens.css の --bg / --fg / --accent から読む
//     dispose()
//   }
//   GLSL_NODES   uNodes、uMorph、nodePos(i)(補間後の位置 [x, z])
//   GLSL_COMMON  GLSL_NODES + geometry/arc.js の GLSL_ARC(頂点シェーダの先頭に置く)
//   RENDER_ORDER 層をまたいだ描く順序。各層は自分の Mesh / Points(葉のオブジェクト)に renderOrder を付ける
//                (Group に付けると、three.js が層をまたいだ並べ替えをしなくなる)
import * as THREE from 'three';
import { K } from '../geometry/constants.js';
import { GLSL_ARC } from '../geometry/arc.js';
import { lineLayout, geoLayout } from '../geometry/layout.js';

export const GLSL_NODES = /* glsl */ `
uniform sampler2D uNodes;
uniform float uMorph;
vec2 nodePos(float i){ vec4 v = texelFetch(uNodes, ivec2(int(i + 0.5), 0), 0); return mix(v.xy, v.zw, uMorph); }
`;

export const GLSL_COMMON = GLSL_NODES + GLSL_ARC;

// 小さいほど先に描く: 地下の弧、地下の粒子、地面、地上の弧、地上の粒子、都道府県の点
export const RENDER_ORDER = Object.freeze({
  arcsBelow: 0,
  particlesBelow: 1,
  ground: 2,
  arcsAbove: 3,
  particlesAbove: 4,
  nodes: 5,
});

const FALLBACK_COLORS = {
  paper: { bg: '#f6f3ec', fg: '#1b1a17', accent: '#c9331f' },
  ink: { bg: '#1b1a17', fg: '#f6f3ec', accent: '#e5533b' },
};

function readColors(theme) {
  const out = { ...(FALLBACK_COLORS[theme] ?? FALLBACK_COLORS.paper) };
  if (typeof document !== 'undefined') {
    const cs = getComputedStyle(document.documentElement);
    for (const [key, v] of [['bg', '--bg'], ['fg', '--fg'], ['accent', '--accent']]) {
      const s = cs.getPropertyValue(v).trim();
      if (/^#[0-9a-f]{6}$/i.test(s)) out[key] = s;
    }
  }
  return out;
}

export function createShared(data) {
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

  return {
    uniforms,
    layout,
    setMorph(m) {
      uniforms.uMorph.value = Math.min(1, Math.max(0, m));
    },
    setLean(l) {
      uniforms.uLean.value = l;
    },
    setTime(sec) {
      uniforms.uTime.value = sec;
    },
    setSize(bufferWidth, bufferHeight, pixelRatio) {
      uniforms.uRes.value.set(bufferWidth, bufferHeight);
      uniforms.uPixelRatio.value = pixelRatio;
    },
    setTheme(theme) {
      const c = readColors(theme);
      uniforms.uPaper.value.set(c.bg);
      uniforms.uInk.value.set(c.fg);
      uniforms.uAccent.value.set(c.accent);
    },
    dispose() {
      nodeTex.dispose();
    },
  };
}
