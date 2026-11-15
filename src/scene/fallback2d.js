// WebGL2 が使えない環境の代替表示。Canvas 2D で、真横の定位置の arc diagram と、静止した点描の粒子を描く(設計 §8)。
//   createFallback(canvas, data) → renderer(scene/renderer.js)と同じメソッドを持つオブジェクト
//     setView、setMorph、setLean、setSelection、setYear、setTheme、setReducedMotion、setStill、setHover、
//     resize、render、project、dispose、layout、getState、screenMatrix
//
// 描くもの(描く順序は設計 §5 のとおり: 地下の弧 → 地下の粒子 → 地上の弧 → 地上の粒子 → 都道府県の点)
//   - 弧: geometry/arc.js の arcPoint(morph = 0、lean = 0)を 48 区間で折れ線にして、墨の細い線で描く。
//   - 粒子: 1 粒 = 100 人。k 番目の粒子は弧の長さの割合 s = 0.04 + 0.92 * fract(k * φ + 弧ごとの乱数) に置き、
//     不透明度は clamp(人数 / 100 − k, 0, 1) に上限を掛けた値。動きを減らす設定と同じ静止した配置で、動かない。
//   - 都道府県の点: 墨の小さな点。選択中は朱の大きな点に紙色の輪。
// 真横の図だけを描く。カメラの定位置(斜め俯瞰・真上)や morph の変更には従わない
// (setView、setMorph、setLean は受け取るだけで、見た目は変えない)。
// 案内文(fallback.*)を、キャンバスの隣に出す。数値は ui/table.js の表で読める。
import { lineLayout, geoLayout } from '../geometry/layout.js';
import { arcPoint } from '../geometry/arc.js';
import { arcList } from '../geometry/flows.js';
import { screenAxes, viewFor } from './camera.js';
import { getLang, onLangChange, t } from '../i18n.js';
import { arcT, endFade, sideOfMask, slotS, slotWeight } from '../geometry/particles.js';
import { DESKTOP_BREAKPOINT } from './camera.js';
import { readStyle } from './shared.js';

const N = 47;
const SEGMENTS = 48; // 弧の折れ線の区間数(描画器の弧の区間数と同じ)
const MAX_DPR = 2;
const TWO_PI = Math.PI * 2;

// 粒子の計算(ハッシュ、弧の長さ→t、静止の配置、重み、端の薄め、側)は geometry/particles.js にある(シェーダと同じ式)。
// 色・不透明度・線幅・粒子径は scene/shared.js の readStyle(tokens.css の --gl-*)から読む。
const stillS = (o, d, k) => slotS(o, d, k, 0, true);
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// ---- 案内文 ----
function createNotice(canvas) {
  if (typeof document === 'undefined' || !canvas.parentNode) return null;
  const root = document.createElement('aside');
  root.className = 'fallback-notice';
  const heading = document.createElement('p');
  heading.className = 'fallback-heading';
  const body = document.createElement('p');
  body.className = 'fallback-body';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'fallback-open';
  open.setAttribute('data-open-table', '');
  root.append(heading, body, open);
  canvas.parentNode.insertBefore(root, canvas.nextSibling);
  const render = () => {
    const lang = getLang();
    root.lang = lang;
    heading.textContent = t('fallback.heading', lang);
    body.textContent = t('fallback.body', lang);
    open.textContent = t('table.toggle', lang);
  };
  render();
  const off = onLangChange(render);
  return {
    dispose() {
      off();
      root.remove();
    },
  };
}

export function createFallback(canvas, data) {
  const line = lineLayout();
  const geo = geoLayout(data.prefectures);
  const layout = { line, geo: geo.pos, toWorld: geo.toWorld, northAngle: geo.northAngle, kmPerUnit: geo.kmPerUnit, bounds: geo.bounds };
  const arcs = arcList();
  const ctx2d = canvas.getContext?.('2d') ?? null;
  const notice = createNotice(canvas);

  const st = {
    mask: new Uint8Array(N),
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
    dpr: 1,
    time: 0,
  };
  let dirty = true;
  // ワールド → CSS px のアフィン(2×4)。真横(azimuth = 0、elevation = 0)の定位置だけを使う
  const m = new Float64Array(8);

  function updateMatrix() {
    const { zoom, center, roll } = st.view;
    const { right, up } = screenAxes(0, 0, roll);
    const s = zoom * st.height;
    const cr = center[0] * right[0] + center[1] * right[1] + center[2] * right[2];
    const cu = center[0] * up[0] + center[1] * up[1] + center[2] * up[2];
    for (let k = 0; k < 3; k++) {
      m[k] = s * right[k];
      m[4 + k] = -s * up[k];
    }
    m[3] = st.width / 2 - s * cr;
    m[7] = st.height / 2 + s * cu;
  }
  updateMatrix();

  const nodeXY = (i, out) => {
    const x = line[i][0];
    out[0] = m[0] * x + m[3];
    out[1] = m[4] * x + m[7];
    return out;
  };

  // ---- 描画 ----
  const pt = [0, 0, 0];
  const A = [0, 0];
  const B = [0, 0];
  const people = new Float64Array(N * N);

  function fillPeople() {
    const a = data.matrix(st.yearA);
    const b = data.matrix(st.yearB);
    const mix = st.mix;
    for (let i = 0; i < N * N; i++) people[i] = mix > 0 && a !== b ? a[i] + (b[i] - a[i]) * mix : a[i];
  }

  function arcPath(o, d, side, x, y) {
    A[0] = line[o][0]; A[1] = line[o][1];
    B[0] = line[d][0]; B[1] = line[d][1];
    for (let j = 0; j <= SEGMENTS; j++) {
      arcPoint(A, B, side, 0, j / SEGMENTS, pt);
      x[j] = m[0] * pt[0] + m[1] * pt[1] + m[2] * pt[2] + m[3];
      y[j] = m[4] * pt[0] + m[5] * pt[1] + m[6] * pt[2] + m[7];
    }
  }

  function drawArcLine(c, color, alpha, width, x, y) {
    c.beginPath();
    c.moveTo(x[0], y[0]);
    for (let j = 1; j <= SEGMENTS; j++) c.lineTo(x[j], y[j]);
    c.strokeStyle = rgba(color, alpha);
    c.lineWidth = width;
    c.stroke();
  }

  function drawParticles(c, o, d, side, v, color, maxAlpha, radius) {
    A[0] = line[o][0]; A[1] = line[o][1];
    B[0] = line[d][0]; B[1] = line[d][1];
    const n = Math.ceil(v / 100);
    c.fillStyle = rgba(color, 1);
    for (let k = 0; k < n; k++) {
      const w = slotWeight(v, k);
      if (w <= 0) continue;
      const s = stillS(o, d, k);
      arcPoint(A, B, side, 0, arcT(s), pt);
      const x = m[0] * pt[0] + m[1] * pt[1] + m[2] * pt[2] + m[3];
      const y = m[4] * pt[0] + m[5] * pt[1] + m[6] * pt[2] + m[7];
      c.globalAlpha = maxAlpha * w * endFade(s);
      c.beginPath();
      c.arc(x, y, radius, 0, TWO_PI);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function redraw() {
    dirty = false;
    const c = ctx2d;
    if (!c) return;
    const colors = readStyle(st.theme, { portrait: st.width < DESKTOP_BREAKPOINT });
    const selecting = st.mask.some(Boolean);
    const lineWidth = selecting ? colors.lineWidthSel : colors.lineWidth;
    const radius = (selecting ? colors.particleSizeSel : colors.particleSize) / 2;
    const arcAlpha = selecting ? colors.arcSel : colors.arcAll;
    const partAlpha = selecting ? colors.particleSel : colors.particle;
    fillPeople();

    c.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    c.clearRect(0, 0, st.width, st.height);
    c.lineJoin = 'round';
    c.lineCap = 'butt';

    const xs = new Float64Array(SEGMENTS + 1);
    const ys = new Float64Array(SEGMENTS + 1);
    for (const side of [-1, 1]) {
      for (let k = 0; k < arcs.length; k++) {
        const o = arcs.o[k], d = arcs.d[k];
        const v = people[o * N + d];
        if (v <= 0 || sideOfMask(o, d, st.mask) !== side) continue;
        arcPath(o, d, side, xs, ys);
        drawArcLine(c, colors.fg, arcAlpha, lineWidth, xs, ys);
      }
      for (let k = 0; k < arcs.length; k++) {
        const o = arcs.o[k], d = arcs.d[k];
        const v = people[o * N + d];
        if (v <= 0 || sideOfMask(o, d, st.mask) !== side) continue;
        drawParticles(c, o, d, side, v, colors.fg, partAlpha, radius);
      }
    }

    // ホバー中の弧(線も粒子も朱)
    const h = st.hover;
    if (h && h.o !== h.d) {
      const side = sideOfMask(h.o, h.d, st.mask);
      const v = people[h.o * N + h.d];
      if (side !== 0 && v > 0) {
        arcPath(h.o, h.d, side, xs, ys);
        drawArcLine(c, colors.accent, colors.arcHover, colors.lineWidthHover, xs, ys);
        drawParticles(c, h.o, h.d, side, v, colors.accent, partAlpha, colors.particleSizeHover / 2);
      }
    }

    // 都道府県の点: 墨の 3px、選択中は朱の 6px に紙色の 1.5px の輪
    const p = [0, 0];
    for (let i = 0; i < N; i++) {
      nodeXY(i, p);
      if (st.mask[i]) continue;
      c.fillStyle = rgba(colors.fg, 1);
      c.beginPath();
      c.arc(p[0], p[1], 1.5, 0, TWO_PI);
      c.fill();
    }
    for (let i = 0; i < N; i++) {
      if (!st.mask[i]) continue;
      nodeXY(i, p);
      c.fillStyle = rgba(colors.bg, 1);
      c.beginPath();
      c.arc(p[0], p[1], 4.5, 0, TWO_PI); // 半径 3(直径 6)+ 輪 1.5
      c.fill();
      c.fillStyle = rgba(colors.accent, 1);
      c.beginPath();
      c.arc(p[0], p[1], 3, 0, TWO_PI);
      c.fill();
    }
  }

  const touch = () => {
    dirty = true;
  };

  return {
    layout,
    getState: () => st,
    // 真横の図だけを描くので、カメラと morph の指示は受け取るだけにする
    setView() {},
    setMorph() {},
    setLean() {},
    setSelection(mask) {
      st.mask = mask;
      touch();
    },
    setYear(a, b, mix) {
      st.yearA = a;
      st.yearB = b;
      st.mix = mix;
      touch();
    },
    setTheme(theme) {
      st.theme = theme;
      touch();
    },
    setReducedMotion(on) {
      st.reducedMotion = !!on;
    },
    setStill() {}, // 粒子はもともと静止の配置で描く
    setHover(arc) {
      st.hover = arc;
      touch();
    },
    resize() {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
      st.width = w;
      st.height = h;
      st.dpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const v = viewFor('side', w / h, layout);
      st.view = { azimuth: v.azimuth, elevation: v.elevation, zoom: v.zoom, center: v.center, roll: v.roll };
      updateMatrix();
      touch();
    },
    // 静止した図なので、状態が変わったときだけ描き直す
    render(timeSec) {
      st.time = timeSec;
      if (dirty) redraw();
    },
    /** 都道府県 i の画面位置(キャンバス左上からの CSS px)。 */
    project(i) {
      return nodeXY(i, [0, 0]);
    },
    /** ワールド → CSS px のアフィン 2×4(描画器の screenMatrix と同じ形)。 */
    screenMatrix() {
      return Float64Array.from(m);
    },
    dispose() {
      notice?.dispose();
      ctx2d?.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
    },
  };
}
