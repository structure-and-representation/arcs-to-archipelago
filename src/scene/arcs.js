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
//   frame = { time(秒)、dt(秒)、reducedMotion }。毎フレーム update(frame) が呼ばれる。
//   setYear(a, b, mix): a、b は西暦。setSelection(mask): Uint8Array(47)。setHover: { o, d } | null。
//   層に関係のないメソッドは何もしない実装でよい。
//   描く順序: object3D の中の Mesh / Points(葉のオブジェクト)に shared.js の RENDER_ORDER を renderOrder として付ける。
//   (Group に付けると、層をまたいだ並べ替えがされない)
import * as THREE from 'three';

export function createArcsLayer(ctx) {
  const object3D = new THREE.Group();
  object3D.name = 'arcs';
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
