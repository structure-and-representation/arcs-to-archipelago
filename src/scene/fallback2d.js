// WebGL2 が使えない環境の代替表示。担当: 代替表示の実装者が、このファイルの中身だけを書く。
//   createFallback(canvas, data) → renderer(scene/renderer.js)と同じメソッドを持つオブジェクト
//     setView、setMorph、setLean、setSelection、setYear、setTheme、setReducedMotion、setHover、
//     resize、render、project、dispose、layout、getState、screenMatrix
// Canvas 2D で、真横の図(morph = 0、lean = 0 の原作と同じ arc diagram)と、静止した点描(粒子を (k + 0.5) / n に並べたもの)を描く(設計 §8)。
// 弧の点は geometry/arc.js の arcPoint、位置は geometry/layout.js、向きは geometry/flows.js の sideOf と arcList を使う。
// いまは、都道府県の位置と射影だけが動く(描画はしない)。
import { geoLayout, lineLayout, nodePos } from '../geometry/layout.js';

export function createFallback(canvas, data) {
  const line = lineLayout();
  const geo = geoLayout(data.prefectures);
  const layout = { line, geo: geo.pos, toWorld: geo.toWorld, northAngle: geo.northAngle, kmPerUnit: geo.kmPerUnit, bounds: geo.bounds };
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
    view: { azimuth: 0, elevation: 0, zoom: 0.003, center: [0, 0, 0], roll: 0 },
    width: 1,
    height: 1,
    time: 0,
  };
  return {
    layout,
    getState: () => st,
    setView(v) {
      st.view = { ...st.view, ...v };
    },
    setMorph(m) {
      st.morph = Math.min(1, Math.max(0, m));
    },
    setLean(l) {
      st.lean = l;
    },
    setSelection(mask) {
      st.mask = mask;
    },
    setYear(a, b, mix) {
      st.yearA = a;
      st.yearB = b;
      st.mix = mix;
    },
    setTheme(theme) {
      st.theme = theme;
    },
    setReducedMotion(on) {
      st.reducedMotion = !!on;
    },
    setHover(arc) {
      st.hover = arc;
    },
    resize() {
      st.width = Math.max(1, canvas.clientWidth);
      st.height = Math.max(1, canvas.clientHeight);
    },
    render(timeSec) {
      st.time = timeSec;
    },
    // 真横(azimuth = 0、elevation = 0、roll = 0)だけを正しく射影する暫定の実装
    project(i) {
      const p = nodePos(line, geo.pos, i, st.morph);
      const s = st.view.zoom * st.height;
      return [st.width / 2 + (p[0] - st.view.center[0]) * s, st.height / 2 - (0 - st.view.center[1]) * s];
    },
    screenMatrix() {
      const s = st.view.zoom * st.height;
      const c = st.view.center;
      return Float64Array.of(s, 0, 0, st.width / 2 - c[0] * s, 0, -s, 0, st.height / 2 + c[1] * s);
    },
    dispose() {},
  };
}
