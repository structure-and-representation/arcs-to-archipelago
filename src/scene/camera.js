// カメラの定位置と補間。担当: カメラの実装者が、このファイルだけを磨く(純関数。store も renderer も触らない)。
//   viewFor(preset, aspect, layout) → { azimuth, elevation, zoom, center, roll, morph, lean }
//     preset: 'side' | 'oblique' | 'top'、aspect: 画面の幅 / 高さ、layout: renderer.layout。
//     azimuth ... roll は renderer.setView にそのまま渡せる。morph は state.morph の目標値、lean は renderer.setLean の値。
//   tween(a, b, s) → 2つの視点(viewFor の戻り値)を s(0〜1)で補間した視点。角度は短い側へ回る。
// store と renderer をつなぐ部分(状態の変化の検知、時間をかけた補間)は scene/cameraRig.js が受け持つ。
//
// 視点の座標の約束(renderer.setView と同じ):
//   azimuth   Y 軸まわり。0 でカメラは +z 側にあり、-z 向きを見る(真横で x が右)
//   elevation 仰角。0 で真横、π/2 で真上
//   zoom      ワールド 1 単位が画面の高さの何分の一か(画面の大きさに依らない)
//   center    [x, y, z] 注視点
//   roll      画面の像を時計まわりに回す角度。縦長の真横では π/2(北海道が上)
import { CAMERA_PRESETS, CX, H, K, STEP } from '../geometry/constants.js';

export const VIEWS = CAMERA_PRESETS;

const TWO_PI = Math.PI * 2;
const norm = (a) => ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + norm(b - a) * t;

/** 真上で北が画面の上になる azimuth。 */
export function topAzimuth(northAngle) {
  return Math.atan2(-Math.cos(northAngle), -Math.sin(northAngle));
}

/** カメラの向きから、画面の右・上のワールドでの単位ベクトルを返す。 */
export function screenAxes(azimuth, elevation, roll) {
  const sa = Math.sin(azimuth), ca = Math.cos(azimuth);
  const se = Math.sin(elevation), ce = Math.cos(elevation);
  const f = [-ce * sa, -se, -ce * ca];
  let u = [-se * sa, ce, -se * ca];
  // 上向きを視線の逆向きの軸まわりに roll だけ回す(renderer と同じ規約)
  const axis = [-f[0], -f[1], -f[2]];
  const c = Math.cos(roll), s = Math.sin(roll);
  const dot = axis[0] * u[0] + axis[1] * u[1] + axis[2] * u[2];
  const cr = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
  u = [0, 1, 2].map((k) => u[k] * c + cr[k] * s + axis[k] * dot * (1 - c));
  const r = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  return { right: r, up: u };
}

/**
 * 定位置 preset の視点。aspect は画面の幅 / 高さ、layout は renderer.layout。
 * 戻り値: { azimuth, elevation, zoom, center, roll, morph, lean }
 */
export function viewFor(preset, aspect, layout) {
  const p = CAMERA_PRESETS[preset] ?? CAMERA_PRESETS.side;
  const portrait = aspect < 1;
  const azimuth = p.azimuth ?? topAzimuth(layout.northAngle);
  const roll = preset === 'side' && portrait ? Math.PI / 2 : 0;
  const b = layout.bounds;
  // 収めたい直方体: morph = 0 なら一直線、1 なら地理配置の範囲。弧の高さと倒れぶんの余白を足す
  const xr = p.morph === 0 ? [-CX, CX] : [Math.min(b.minX, -CX), Math.max(b.maxX, CX)];
  const zr = p.morph === 0 ? [0, 0] : [b.minZ, b.maxZ];
  const arcH = 0.68 * K * 46 * STEP; // 最長の弧の高さの目安(約 150)
  const lateral = p.lean ? arcH * Math.sin(p.lean) : 0;
  const box = {
    x: [xr[0] - lateral, xr[1] + lateral],
    y: [-arcH, arcH],
    z: [zr[0] - lateral, zr[1] + lateral],
  };
  const { right, up } = screenAxes(azimuth, p.elevation, roll);
  let rMin = Infinity, rMax = -Infinity, uMin = Infinity, uMax = -Infinity;
  for (const x of box.x) for (const y of box.y) for (const z of box.z) {
    const rr = x * right[0] + y * right[1] + z * right[2];
    const uu = x * up[0] + y * up[1] + z * up[2];
    rMin = Math.min(rMin, rr); rMax = Math.max(rMax, rr);
    uMin = Math.min(uMin, uu); uMax = Math.max(uMax, uu);
  }
  const keep = 1 - 2 * 0.04; // 四辺に 4% の余白
  const visibleHeight = Math.max((uMax - uMin) / keep, (rMax - rMin) / keep / aspect, 1);
  const center = [(xr[0] + xr[1]) / 2, 0, (zr[0] + zr[1]) / 2];
  return { azimuth, elevation: p.elevation, zoom: 1 / visibleHeight, center, roll, morph: p.morph, lean: p.lean };
}

/** 2つの視点 a、b を s(0〜1)で補間する。角度は短い側へ回り、zoom は対数で補間する。 */
export function tween(a, b, s) {
  return {
    azimuth: lerpAngle(a.azimuth, b.azimuth, s),
    elevation: lerp(a.elevation, b.elevation, s),
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), s)),
    center: [0, 1, 2].map((k) => lerp(a.center[k], b.center[k], s)),
    roll: lerpAngle(a.roll, b.roll, s),
    morph: lerp(a.morph, b.morph, s),
    lean: lerp(a.lean, b.lean, s),
  };
}
