// 地面(y = 0 の xz 平面)と境界線の描画。担当: 地面の実装者がこのファイルの中身を書く。
//
// 約束:
//   createGround(ctx) → {
//     object,                       // THREE.Object3D。紙の色の半透明(不透明度 0.35 以下)と、都道府県の境界線
//     setTheme(theme),
//     update(timeSec),              // ctx.uniforms.uMorph を見て、morph = 0 では地理の形を出さない、などの制御をここで行う
//     dispose()
//   }
// 境界線の頂点は、ctx.data.topology(座標は prefectures.json と同じ平面座標、km)を
// ctx.layout.toWorld(mapX, mapY) → [x, z] でワールド座標へ移す。
// ctx は scene/arcs.js の先頭を参照。
import * as THREE from 'three';

export function createGround(ctx) {
  const object = new THREE.Group();
  object.name = 'ground';
  return {
    object,
    setTheme() {},
    update() {},
    dispose() {},
  };
}
