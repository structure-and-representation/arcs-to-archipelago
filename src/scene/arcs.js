// 弧の描画。担当: 弧の描画の実装者が、このファイルの中身だけを書く。
// 弧は 1 本ぶん(48 区間)のリボンの InstancedBufferGeometry で、頂点シェーダで画面上の法線方向へ押し出す(設計 §5)。
// 地下(side = -1)と地上(side = +1)の 2 つの Mesh を、RENDER_ORDER.arcsBelow / arcsAbove で描く。
//
// 層の約束(arcs / particles / ground で共通):
//   createXxxLayer(ctx) → { object3D, update(frame), setYear(a, b, mix), setSelection(mask),
//                           setTheme(theme), setHover(arc | null), dispose() }
//   ctx = { shared, data, arcList }
//     shared    scene/shared.js の createShared の結果(uniforms、layout、GLSL_COMMON、RENDER_ORDER)
//     data      loadData() の結果(matrix(year)、prefectures、topology …)
//     arcList   geometry/flows.js の arcList()(弧の固定の順序。弧・粒子・当たり判定・表で共有)
//   frame = { time(秒)、dt(秒)、reducedMotion、still }。毎フレーム update(frame) が呼ばれる。
//   setYear(a, b, mix): a、b は西暦。setSelection(mask): Uint8Array(47)。setHover: { o, d } | null。
//   層に関係のないメソッドは何もしない実装でよい。
//   描く順序: object3D の中の Mesh / Points(葉のオブジェクト)に shared.js の RENDER_ORDER を renderOrder として付ける。
//   (Group に付けると、層をまたいだ並べ替えがされない)
//
// この層の構成:
//   - ジオメトリは最初に 1 回だけ作る。ribbon(48 区間 × 左右の 2 頂点)と、弧ごとの aArc(o, d)は不変で、
//     弧ごとの aDyn(side, alpha)だけが選択の切り替えで更新される(side は -1〜+1 に補間される)。
//   - 地下・地上の 2 つの Mesh は同じジオメトリを共有し、頂点シェーダが side の符号で自分の側の弧だけを残す
//     (side が 0 をまたぐ瞬間は弧の高さが 0 で、どちらの Mesh に属しても連続して見える)。
//   - side = 0 の弧(選択地域の内部どうしと、選択に関わらない移動)は、side を保ったまま alpha を 0 へ落とす。
//   - ホバー中の弧は、専用の 1 インスタンスの Mesh を朱で最前面に描く。
//   - 線幅は CSS px で、DPR に依らない(シェーダが uPixelRatio を掛けて実ピクセルにする)。
//   - 色は shared の uInk / uAccent(トークンの sRGB の値)をそのまま出す。不透明度と線幅は shared.style(tokens.css の --gl-*)から読む。
import * as THREE from 'three';
import { GLSL_COMMON, RENDER_ORDER } from './shared.js';

const SEG = 48; // 1 本の弧の区間数(設計 §5)
const TRANSITION_SEC = 0.6; // side と選択の見た目の切り替えの時間(--dur-year と同じ)

const VERT = /* glsl */ `
${GLSL_COMMON}
in vec2 aArc;   // o, d(都道府県の添字)
in vec2 aDyn;   // side(-1〜+1 に補間される)、alpha(0〜1)
uniform vec2 uRes;     // 描画バッファの実ピクセル数(shared)
uniform float uPixelRatio;
uniform float uHalf;   // -1: 地下の弧だけ、+1: 地上の弧だけ、0: すべて
uniform float uWidth;  // CSS px
uniform float uAlpha;
out float vEdge;
out float vAlpha;

// 一様 3 次 B スプラインの 1 区間の、パラメータ f についての導関数(向きだけを使う)
vec3 bspDeriv(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float f){
  float f2 = f * f; float a = 1.0 - f;
  return (-3.0 * a * a * p0 + (9.0 * f2 - 12.0 * f) * p1 + (-9.0 * f2 + 6.0 * f + 3.0) * p2 + 3.0 * f2 * p3) / 6.0;
}

void main(){
  float t = position.x;
  float e = position.y; // リボンの左右(-1 / +1)
  float side = aDyn.x;
  bool below = side < 0.0;
  if (aDyn.y <= 0.002 || (uHalf < -0.5 && !below) || (uHalf > 0.5 && below)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // 画面の外へ(この Mesh が描かない弧)
    vEdge = 0.0; vAlpha = 0.0;
    return;
  }
  vec3 R;
  vec3 p = arcPoint(aArc.x, aArc.y, side, t, R);

  // 接線は制御点 [A, A, A, M, B, B, B] から解析的に求める(端点の近くは位置の差分が桁落ちするため)。
  // t = 0.5 は区間 2 の始点で、そこの点は (A + 4M + B) / 6 になる。そこから M を逆算する。
  vec3 Rm;
  vec3 pm = arcPoint(aArc.x, aArc.y, side, 0.5, Rm);
  vec2 a2 = nodePos(aArc.x), b2 = nodePos(aArc.y);
  vec3 A = vec3(a2.x, 0.0, a2.y), B = vec3(b2.x, 0.0, b2.y);
  vec3 m = (6.0 * (pm - A) - (B - A)) / 4.0; // M - A
  vec3 b = B - A;
  float u = clamp(t, 0.02, 0.98) * 4.0; float j = floor(u); float f = u - j;
  vec3 z = vec3(0.0);
  vec3 tan3;
  if (j < 0.5) tan3 = bspDeriv(z, z, z, m, f);
  else if (j < 1.5) tan3 = bspDeriv(z, z, m, b, f);
  else if (j < 2.5) tan3 = bspDeriv(z, m, b, b, f);
  else tan3 = bspDeriv(m, b, b, b, f);

  mat4 pv = projectionMatrix * viewMatrix;
  vec4 c = pv * vec4(p, 1.0);
  vec4 dc = pv * vec4(tan3, 0.0);
  vec2 dir = dc.xy * 0.5 * uRes; // 正投影なので、方向はそのまま画面上のピクセルの向きになる
  float len = length(dir);
  dir = len > 1e-9 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  float wpx = uWidth * uPixelRatio;      // 実ピクセルでの線幅
  float hw = max(wpx, 1.0) * 0.5 + 0.5;  // 縁のなだらかな部分のぶん 0.5px 太らせる
  c.xy += nrm * e * hw / (0.5 * uRes) * c.w;
  vEdge = e * hw;
  vAlpha = aDyn.y;
  gl_Position = c;
}`;

const FRAG = /* glsl */ `
uniform float uWidth, uPixelRatio, uAlpha, uUseAccent;
uniform vec3 uInk, uAccent;
in float vEdge;
in float vAlpha;
out vec4 outColor;
void main(){
  float wpx = uWidth * uPixelRatio;
  float hw = max(wpx, 1.0) * 0.5;
  float a = clamp(hw + 0.5 - abs(vEdge), 0.0, 1.0);
  a *= min(wpx, 1.0) * vAlpha * uAlpha; // 1px 未満の線は、細くせずに薄くする
  if (a <= 0.0) discard;
  vec3 col = uUseAccent > 0.5 ? uAccent : uInk;
  outColor = vec4(col, a); // uInk / uAccent はトークンの sRGB の値。色空間は変換しない
}`;

const smooth01 = (x) => x * x * (3 - 2 * x);

export function createArcsLayer(ctx) {
  const { shared, arcList } = ctx;
  const count = arcList.length;
  const arcO = arcList.o;
  const arcD = arcList.d;

  const object3D = new THREE.Group();
  object3D.name = 'arcs';

  // ---- ジオメトリ(1 回だけ作る) ----
  // 頂点: position = (t, 左右) を (SEG + 1) × 2 個
  const posArr = new Float32Array((SEG + 1) * 2 * 3);
  for (let i = 0; i <= SEG; i++) {
    posArr.set([i / SEG, -1, 0, i / SEG, 1, 0], i * 6);
  }
  const index = [];
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const position = new THREE.BufferAttribute(posArr, 3);
  const indexAttr = new THREE.BufferAttribute(new Uint16Array(index), 1);

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setIndex(indexAttr);
  const arcAttrArr = new Float32Array(count * 2);
  for (let k = 0; k < count; k++) arcAttrArr.set([arcO[k], arcD[k]], k * 2);
  geometry.setAttribute('aArc', new THREE.InstancedBufferAttribute(arcAttrArr, 2));
  const dynAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  dynAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aDyn', dynAttr);
  geometry.instanceCount = count;
  const dyn = dynAttr.array; // [side, alpha] × count

  // ホバー中の弧: 1 インスタンスだけのジオメトリ(頂点と index は共有する)
  const hoverGeometry = new THREE.InstancedBufferGeometry();
  hoverGeometry.setAttribute('position', position);
  hoverGeometry.setIndex(indexAttr);
  const hoverArcAttr = new THREE.InstancedBufferAttribute(new Float32Array(2), 2);
  const hoverDynAttr = new THREE.InstancedBufferAttribute(new Float32Array(2), 2);
  hoverDynAttr.setUsage(THREE.DynamicDrawUsage);
  hoverGeometry.setAttribute('aArc', hoverArcAttr);
  hoverGeometry.setAttribute('aDyn', hoverDynAttr);
  hoverGeometry.instanceCount = 0;

  // ---- 素材 ----
  const makeMaterial = (half, accent) =>
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        ...shared.uniforms,
        uHalf: { value: half },
        uWidth: { value: shared.style.lineWidth },
        uAlpha: { value: 0 },
        uUseAccent: { value: accent ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
  const makeMesh = (geom, mat, order, name) => {
    const m = new THREE.Mesh(geom, mat);
    m.name = name;
    m.frustumCulled = false;
    m.renderOrder = order;
    object3D.add(m);
    return m;
  };
  const below = makeMesh(geometry, makeMaterial(-1, false), RENDER_ORDER.arcsBelow, 'arcs-below');
  const above = makeMesh(geometry, makeMaterial(1, false), RENDER_ORDER.arcsAbove, 'arcs-above');
  const hoverMesh = makeMesh(hoverGeometry, makeMaterial(0, true), RENDER_ORDER.nodes + 1, 'arcs-hover');
  hoverMesh.visible = false;

  // ---- 状態 ----
  // 検証用: 比較の画像を撮るときだけ、外から線幅と不透明度を固定できる(tools/verify/arcs-parity.mjs)
  const debug = globalThis.__ARCS_DEBUG;
  const debugStyle = debug && Number.isFinite(debug.width) && Number.isFinite(debug.alpha) ? debug : null;

  const targetSide = new Int8Array(count); // いまの選択での side(-1 / 0 / +1)
  const fromSide = new Float32Array(count);
  const fromAlpha = new Float32Array(count);
  const toSide = new Float32Array(count);
  const toAlpha = new Float32Array(count);
  let currentMask = new Uint8Array(47);
  let selFrom = 0;
  let selTo = 0;
  let progress = 1;
  let firstSelection = true;
  let lastWall = null;
  let hover = null; // { o, d }

  function computeTargets(mask) {
    let any = false;
    for (let i = 0; i < 47; i++) if (mask[i]) any = true;
    for (let k = 0; k < count; k++) {
      const o = arcO[k], d = arcD[k];
      if (!any) targetSide[k] = o > d ? 1 : -1;
      else {
        const so = mask[o] ? 1 : 0, sd = mask[d] ? 1 : 0;
        targetSide[k] = so === sd ? 0 : sd ? 1 : -1;
      }
    }
    return any;
  }

  // 初期状態(選択なし)
  computeTargets(currentMask);
  for (let k = 0; k < count; k++) {
    dyn[k * 2] = targetSide[k];
    dyn[k * 2 + 1] = 1;
  }
  dynAttr.needsUpdate = true;
  let selCur = 0;

  function applyStyle() {
    const st = shared.style;
    const w = debugStyle ? debugStyle.width : st.lineWidth + (st.lineWidthSel - st.lineWidth) * selCur;
    const a = debugStyle ? debugStyle.alpha : st.arcAll + (st.arcSel - st.arcAll) * selCur;
    for (const m of [below, above]) {
      m.material.uniforms.uWidth.value = w;
      m.material.uniforms.uAlpha.value = a;
    }
    hoverMesh.material.uniforms.uWidth.value = debugStyle ? debugStyle.width : st.lineWidthHover;
    hoverMesh.material.uniforms.uAlpha.value = debugStyle ? debugStyle.alpha : st.arcHover;
  }

  function updateHover() {
    const k = hover ? arcList.indexOf(hover.o, hover.d) : -1;
    // 描かない弧(side = 0)にはホバーの朱を出さない。補間中は、下の弧と同じ側・同じ高さで重ねる
    if (k < 0 || targetSide[k] === 0) {
      hoverGeometry.instanceCount = 0;
      hoverMesh.visible = false;
      return;
    }
    hoverArcAttr.array[0] = arcO[k];
    hoverArcAttr.array[1] = arcD[k];
    hoverDynAttr.array[0] = dyn[k * 2];
    hoverDynAttr.array[1] = 1;
    hoverArcAttr.needsUpdate = true;
    hoverDynAttr.needsUpdate = true;
    hoverGeometry.instanceCount = 1;
    hoverMesh.visible = true;
  }

  function snap() {
    for (let k = 0; k < count; k++) {
      dyn[k * 2] = toSide[k];
      dyn[k * 2 + 1] = toAlpha[k];
    }
    selCur = selTo;
    progress = 1;
    dynAttr.needsUpdate = true;
  }

  function setSelection(mask) {
    const next = Uint8Array.from(mask);
    if (!firstSelection && next.every((v, i) => v === currentMask[i])) return;
    currentMask = next;
    const any = computeTargets(next);
    for (let k = 0; k < count; k++) {
      const curSide = dyn[k * 2], curAlpha = dyn[k * 2 + 1];
      const tgt = targetSide[k];
      fromAlpha[k] = curAlpha;
      if (tgt === 0) {
        // 描かない弧: 側は保ったまま薄くして消す
        fromSide[k] = curSide;
        toSide[k] = curSide;
        toAlpha[k] = 0;
      } else {
        // 見えていなかった弧は、新しい側へ最初から置いて薄いところから現す
        fromSide[k] = curAlpha < 0.01 ? tgt : curSide;
        toSide[k] = tgt;
        toAlpha[k] = 1;
      }
    }
    selFrom = selCur;
    selTo = any ? 1 : 0;
    progress = 0;
    if (firstSelection) {
      // 最初の選択は、アニメーションせずに置く
      firstSelection = false;
      snap();
    }
  }

  function update(frame) {
    let dt = frame && frame.dt > 0 ? frame.dt : 0;
    if (!(dt > 0)) {
      // 撮影用の still(時間を 0 に固定)では frame.dt が 0 のままなので、実時間で進める
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      dt = lastWall == null ? 0 : Math.min(0.1, (now - lastWall) / 1000);
      lastWall = now;
    } else {
      lastWall = null;
    }
    if (progress < 1) {
      if (frame && (frame.reducedMotion || frame.still)) {
        snap();
      } else {
        progress = Math.min(1, progress + dt / TRANSITION_SEC);
        const s = smooth01(progress);
        for (let k = 0; k < count; k++) {
          dyn[k * 2] = fromSide[k] + (toSide[k] - fromSide[k]) * s;
          dyn[k * 2 + 1] = fromAlpha[k] + (toAlpha[k] - fromAlpha[k]) * s;
        }
        selCur = selFrom + (selTo - selFrom) * s;
        dynAttr.needsUpdate = true;
        if (progress >= 1) snap();
      }
    }
    applyStyle();
    updateHover();
  }

  applyStyle();

  return {
    object3D,
    update,
    setYear() {},
    setSelection,
    setTheme() {
      applyStyle(); // 値は shared.style(renderer が先に shared.setTheme を呼ぶ)
    },
    setHover(arc) {
      hover = arc ? { o: arc.o, d: arc.d } : null;
      updateHover();
    },
    dispose() {
      geometry.dispose();
      hoverGeometry.dispose();
      for (const m of [below, above, hoverMesh]) m.material.dispose();
    },
  };
}
