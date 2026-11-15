// 粒子の描画。担当: 粒子の実装者が、このファイルの中身だけを書く。設計 §5 の粒子の規則に従う。
// 動きを減らす設定(frame.reducedMotion)では時間を 0 に固定し、位相を (k + 0.5) / n に並べた静止した点描にする。
// 地下と地上の 2 つの Points を、RENDER_ORDER.particlesBelow / particlesAbove で描く。
//
// 層の約束(arcs / particles / ground で共通):
//   createXxxLayer(ctx) → { object3D, update(frame), setYear(a, b, mix), setSelection(mask),
//                           setTheme(theme), setHover(arc | null), dispose() }
//   ctx = { shared, data, arcList }
//     shared    scene/shared.js の createShared の結果(uniforms、layout、GLSL_COMMON、RENDER_ORDER)
//     data      loadData() の結果(matrix(year)、prefectures、topology …)
//     arcList   geometry/flows.js の arcList()(弧の固定の順序。弧・粒子・当たり判定・表で共有)
//   frame = { time(秒)、dt(秒)、reducedMotion }。毎フレーム update(frame) が呼ばれる。
//   setYear(a, b, mix): a、b は西暦。setSelection(mask): Uint8Array(47)。setHover: { o, d } | null。
//   層に関係のないメソッドは何もしない実装でよい。
//   描く順序: object3D の中の Mesh / Points(葉のオブジェクト)に shared.js の RENDER_ORDER を renderOrder として付ける。
//   (Group に付けると、層をまたいだ並べ替えがされない)
import * as THREE from 'three';

export function createParticlesLayer(ctx) {
  const object3D = new THREE.Group();
  object3D.name = 'particles';
  return {
    object3D,
    update() {},
    setYear() {},
    setSelection() {},
    setTheme() {},
    setHover() {},
    dispose() {},
  };
}
