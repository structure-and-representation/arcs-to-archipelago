// 全層(弧・粒子・地面・都道府県の点)が共有する uniform と GLSL 断片。
//
//   createShared(data) → {
//     uniforms,      全素材が同じ { value } を共有する(素材の uniforms に展開して使う)
//       uNodes       47×1 RGBA32F(lineX, lineZ, geoX, geoZ)、NearestFilter
//       uMorph, uLean, uK
//       uRes         描画バッファの実ピクセル数(vec2)、uPixelRatio
//       uTime        秒
//       uInk, uPaper, uAccent   現在のテーマの 前景 / 地 / 朱。トークンの sRGB の値をそのまま持つ
//                               (THREE.Color の線形への変換をしない。各層は出力時に色空間を変換しない)
//     style,         描画の値(readStyle): 色、弧・粒子・地面・境界線の不透明度、線幅、粒子径(テーマ・縦画面ごと)。
//                    styles/tokens.css の --gl-* をここだけが読む。各層は毎フレーム、または setTheme のときにここから読む
//     portrait,      縦画面の構成か(描画バッファの CSS 幅が 1024px 未満)
//     layout,        { line, geo, toWorld, northAngle, kmPerUnit, bounds }
//     setMorph(m), setLean(l), setTime(sec),
//     setSize(bufferWidth, bufferHeight, pixelRatio),  // 縦画面かどうかが変わると style を読み直す
//     setTheme(theme),  // 'paper' | 'ink'。style と色の uniform を読み直す(<html data-theme> を先に変えておく)
//     refreshStyle(),
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

// デザイン仕様 6 節「three.js に渡す値」の既定値。styles/tokens.css の --gl-* が読めないとき(テストなど)に使う。
export const STYLE_DEFAULTS = Object.freeze({
  paper: {
    bg: '#F3F0E8', fg: '#1C1B18', accent: '#C23B22',
    arcAll: 0.1, arcSel: 0.3, arcHover: 0.95, particle: 0.6, particleSel: 0.75, ground: 0.3, border: 0.22,
  },
  ink: {
    bg: '#1C1B18', fg: '#F3F0E8', accent: '#E5603F',
    arcAll: 0.085, arcSel: 0.26, arcHover: 0.95, particle: 0.5, particleSel: 0.65, ground: 0.35, border: 0.2,
  },
  size: {
    lineWidth: 0.7, lineWidthSel: 0.8, lineWidthHover: 1,
    particleSize: 2, particleSizeSel: 2.2, particleSizeHover: 2.2,
    particleSizePortrait: 1.8, particleSizePortraitSel: 2, particleSizePortraitHover: 2,
  },
});

// style のキー → tokens.css のカスタムプロパティ
const COLOR_VARS = { bg: '--bg', fg: '--gl-fg', accent: '--gl-accent' };
const NUMBER_VARS = {
  arcAll: '--gl-arc-all', arcSel: '--gl-arc-sel', arcHover: '--gl-arc-hover',
  particle: '--gl-particle', particleSel: '--gl-particle-sel',
  ground: '--gl-ground', border: '--gl-border',
  lineWidth: '--gl-line-width', lineWidthSel: '--gl-line-width-sel', lineWidthHover: '--gl-line-width-hover',
  particleSize: '--gl-particle-size', particleSizeSel: '--gl-particle-size-sel', particleSizeHover: '--gl-particle-size-hover',
  particleSizePortrait: '--gl-particle-size-portrait',
  particleSizePortraitSel: '--gl-particle-size-portrait-sel',
  particleSizePortraitHover: '--gl-particle-size-portrait-hover',
};

/** この幅(CSS px)より狭い画面は縦画面の構成(scene/camera.js の DESKTOP_BREAKPOINT と同じ)。 */
const PORTRAIT_BELOW = 1024;

/**
 * テーマの描画の値を tokens.css から読む。read(name) はカスタムプロパティの値を返す関数(省略時は document から読む)。
 * 縦画面のときは、粒子の径を縦画面の値に差し替える。
 * 戻り値: { theme, portrait, bg, fg, accent(#RRGGBB)、arcAll … border(不透明度)、lineWidth*、particleSize*(CSS px) }
 */
export function readStyle(theme, { portrait = false, read } = {}) {
  const base = STYLE_DEFAULTS[theme] ?? STYLE_DEFAULTS.paper;
  const out = { theme: STYLE_DEFAULTS[theme] ? theme : 'paper', portrait, ...base, ...STYLE_DEFAULTS.size };
  let get = read;
  if (!get && typeof document !== 'undefined' && typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(document.documentElement);
    get = (name) => cs.getPropertyValue(name);
  }
  if (get) {
    for (const [key, name] of Object.entries(COLOR_VARS)) {
      const v = String(get(name) ?? '').trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) out[key] = v;
    }
    for (const [key, name] of Object.entries(NUMBER_VARS)) {
      const v = parseFloat(get(name));
      if (Number.isFinite(v)) out[key] = v;
    }
  }
  if (portrait) {
    out.particleSize = out.particleSizePortrait;
    out.particleSizeSel = out.particleSizePortraitSel;
    out.particleSizeHover = out.particleSizePortraitHover;
  }
  return out;
}

/**
 * #RRGGBB を、その sRGB の値のまま THREE.Color に入れる(線形への変換をしない)。
 * 各層の ShaderMaterial は出力時に色空間を変換しないので、uniform の値がそのまま画面の画素の値になる。
 */
export function setSrgbColor(color, hex) {
  const n = parseInt(hex.slice(1), 16);
  return color.setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, THREE.LinearSRGBColorSpace);
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

  let theme = 'paper';
  let portrait = false;
  const api = {
    uniforms,
    layout,
    /** 描画の値(readStyle の結果)。テーマと画面の構成が変わると読み直す。各層は毎フレームここから読む。 */
    style: readStyle(theme),
    /** 縦画面の構成か(描画バッファの CSS 幅が 1024px 未満)。 */
    get portrait() {
      return portrait;
    },
    refreshStyle() {
      api.style = readStyle(theme, { portrait });
      setSrgbColor(uniforms.uPaper.value, api.style.bg);
      setSrgbColor(uniforms.uInk.value, api.style.fg);
      setSrgbColor(uniforms.uAccent.value, api.style.accent);
      return api.style;
    },
  };

  Object.assign(api, {
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
      // CSS の @media と同じ条件(スクロールバーを含む幅)。ブラウザの外では描画バッファの CSS 幅で判定する
      const next = typeof globalThis.matchMedia === 'function'
        ? globalThis.matchMedia('(max-width: 1023.98px)').matches
        : bufferWidth / (pixelRatio || 1) < PORTRAIT_BELOW;
      if (next !== portrait) {
        portrait = next;
        api.refreshStyle();
      }
    },
    setTheme(name) {
      theme = STYLE_DEFAULTS[name] ? name : 'paper';
      api.refreshStyle();
    },
    dispose() {
      nodeTex.dispose();
    },
  });
  api.refreshStyle();
  return api;
}
