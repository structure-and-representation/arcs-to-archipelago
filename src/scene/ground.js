// 地面(y = 0 の xz 平面)と境界線の描画。担当: 地面の実装者が、このファイルの中身だけを書く。
// 紙の色の半透明(不透明度 0.35 以下)と、都道府県の境界線。RENDER_ORDER.ground で描く。
// 境界線の頂点は、data.topology(座標は prefectures.json と同じ平面座標、km)を shared.layout.toWorld(mapX, mapY) → [x, z] でワールド座標へ移す。
// morph = 0 では地理の形を出さない、などの制御は update(frame) で shared.uniforms.uMorph を見て行う。
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

export function createGroundLayer(ctx) {
  const object3D = new THREE.Group();
  object3D.name = 'ground';
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
