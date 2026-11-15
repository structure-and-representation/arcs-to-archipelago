// カメラの定位置と補間。担当: カメラの実装者が、このファイルを磨く(滑らかな補間、縦長画面など)。
//
// いまの実装: 定位置から、画面に収まる視点を計算し(viewForPreset)、
// state.camera が変わったら視点と morph を補間する(createCameraRig)。
//
// 視点の座標の約束(renderer.setView と同じ):
//   azimuth   Y 軸まわり。0 でカメラは +z 側にあり、-z 向きを見る(真横で x が右)
//   elevation 仰角。0 で真横、π/2 で真上
//   zoom      ワールド 1 単位が何 CSS px か
//   center    [x, y, z] 注視点
//   roll      画面の像を時計まわりに回す角度。縦長の真横では π/2(北海道が上)
import { CAMERA_PRESETS, CX, H, K, STEP } from '../geometry/constants.js';

export const VIEWS = CAMERA_PRESETS;

const TWO_PI = Math.PI * 2;
const norm = (a) => ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => a + norm(b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

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
 * 定位置 name の視点。width / height は画面の CSS px、layout は renderer.layout。
 * 戻り値: { azimuth, elevation, zoom, center, roll, morph, lean }
 */
export function viewForPreset(name, { width, height, layout }) {
  const p = CAMERA_PRESETS[name] ?? CAMERA_PRESETS.side;
  const portrait = height > width;
  const azimuth = p.azimuth ?? topAzimuth(layout.northAngle);
  const roll = name === 'side' && portrait ? Math.PI / 2 : 0;
  const b = layout.bounds;
  // 収めたい直方体: morph = 0 なら一直線、1 なら地理配置の範囲。弧の高さと倒れぶんの余白を足す
  const lineSpan = [-CX, CX];
  const xr = p.morph === 0 ? lineSpan : [Math.min(b.minX, -CX), Math.max(b.maxX, CX)];
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
  const pad = 28; // CSS px
  const zoom = Math.max(
    0.05,
    Math.min((width - 2 * pad) / Math.max(rMax - rMin, 1), (height - 2 * pad) / Math.max(uMax - uMin, 1)),
  );
  const center = [(xr[0] + xr[1]) / 2, 0, (zr[0] + zr[1]) / 2];
  return { azimuth, elevation: p.elevation, zoom, center, roll, morph: p.morph, lean: p.lean };
}

/**
 * createCameraRig({ store, renderer, immediate }) → { update(dtSec), resize(), dispose() }
 *   store.camera が変わると、現在の視点から新しい定位置まで補間する(state.morph も書き換える)。
 *   reducedMotion のとき、または immediate のときは即座に切り替える。
 *   毎フレーム update(dtSec) を呼ぶ。画面の大きさが変わったら resize() を呼ぶ。
 */
export function createCameraRig({ store, renderer, immediate = false, duration = 1.6 }) {
  const size = () => ({ width: renderer.getState().width, height: renderer.getState().height, layout: renderer.layout });
  let target = viewForPreset(store.get().camera, size());
  // 初期の morph は URL などで指定された state の値を尊重する
  let current = { ...target, morph: store.get().morph };
  let from = current;
  let progress = 1;

  const push = () => {
    renderer.setView(current);
    renderer.setLean(current.lean);
    store.set({ morph: current.morph });
  };
  push();

  const off = store.subscribe((s, changed) => {
    if (!changed.includes('camera')) return;
    target = viewForPreset(s.camera, size());
    from = current;
    if (s.reducedMotion || immediate) {
      current = target;
      progress = 1;
      push();
    } else {
      progress = 0;
    }
  });

  return {
    update(dt) {
      if (progress >= 1) return;
      progress = Math.min(1, progress + dt / duration);
      const e = ease(progress);
      current = {
        azimuth: lerpAngle(from.azimuth, target.azimuth, e),
        elevation: lerp(from.elevation, target.elevation, e),
        zoom: Math.exp(lerp(Math.log(from.zoom), Math.log(target.zoom), e)),
        center: [0, 1, 2].map((k) => lerp(from.center[k], target.center[k], e)),
        roll: lerpAngle(from.roll, target.roll, e),
        morph: lerp(from.morph, target.morph, e),
        lean: lerp(from.lean, target.lean, e),
      };
      push();
    },
    resize() {
      target = viewForPreset(store.get().camera, size());
      if (progress >= 1) {
        current = { ...target, morph: current.morph };
        push();
      }
    },
    dispose() {
      off();
    },
  };
}
