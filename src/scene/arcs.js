// 弧の描画。担当: 弧の描画の実装者がこのファイルの中身を書く。
//
// 約束:
//   createArcs(ctx) → {
//     below, above,                 // THREE.Object3D。below は地下の弧、above は地上の弧
//     setSelection(mask),           // Uint8Array(47)。選択中の都道府県が 1。sideOf(o, d, ...) と整合させる
//     setYear(a, b, mix),           // 年 a と b の人数を mix で補間(a, b は西暦)
//     setHover(arc | null),         // { o, d } | null。ホバー中の弧だけ朱にする
//     setTheme(theme),              // 'paper' | 'ink'
//     setQuality({ segments }),     // 弧の区間数(負荷が高いときに下げる)
//     update(timeSec),
//     dispose()
//   }
// ctx(scene/renderer.js が作る共有物):
//   ctx.data      loadData() の結果(matrix(year)、prefectures …)
//   ctx.layout    { line, geo, toWorld, northAngle, kmPerUnit, bounds }
//   ctx.uniforms  { uNodes, uMorph, uLean, uK, uRes(描画バッファの実ピクセル), uPixelRatio, uTime, uInk, uPaper, uAccent }
//                 各 { value } で、全素材が共有する。GLSL_ARC(geometry/arc.js)と併用する
//   ctx.getState() 描画側の現在値 { mask, yearA, yearB, mix, hover, theme, reducedMotion }
import * as THREE from 'three';

export function createArcs(ctx) {
  const below = new THREE.Group();
  const above = new THREE.Group();
  below.name = 'arcs-below';
  above.name = 'arcs-above';
  return {
    below,
    above,
    setSelection() {},
    setYear() {},
    setHover() {},
    setTheme() {},
    setQuality() {},
    update() {},
    dispose() {},
  };
}
