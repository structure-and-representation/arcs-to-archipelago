// 粒子の描画。担当: 粒子の実装者がこのファイルの中身を書く。設計 §5 の粒子の規則に従う。
//
// 約束:
//   createParticles(ctx) → {
//     below, above,                 // THREE.Object3D(地下・地上の粒子)
//     setSelection(mask),           // Uint8Array(47)
//     setYear(a, b, mix),
//     setHover(arc | null),
//     setTheme(theme),
//     setReducedMotion(bool),       // true なら時間を 0 に固定し、位相を (k + 0.5) / n に並べた静止した点描にする
//     update(timeSec),
//     dispose()
//   }
// ctx は scene/arcs.js の先頭を参照。
import * as THREE from 'three';

export function createParticles(ctx) {
  const below = new THREE.Group();
  const above = new THREE.Group();
  below.name = 'particles-below';
  above.name = 'particles-above';
  return {
    below,
    above,
    setSelection() {},
    setYear() {},
    setHover() {},
    setTheme() {},
    setReducedMotion() {},
    update() {},
    dispose() {},
  };
}
