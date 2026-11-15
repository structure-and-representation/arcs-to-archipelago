// store と renderer をつなぐカメラの配線(骨格の担当が完成させたもの。カメラの実装者は camera.js を磨く)。
//   createCameraRig({ store, renderer, immediate }) → { update(dtSec), resize(), dispose() }
//   state.camera が変わると、現在の視点から新しい定位置まで補間する(state.morph も書き換える)。
//   reducedMotion のとき、または immediate のときは即座に切り替える。
//   毎フレーム update(dtSec) を呼ぶ。画面の大きさが変わったら resize() を呼ぶ。
import { tween, viewFor } from './camera.js';

const ease = (t) => t * t * (3 - 2 * t);

export function createCameraRig({ store, renderer, immediate = false, duration = 1.6 }) {
  const target = () => {
    const { width, height } = renderer.getState();
    return viewFor(store.get().camera, width / height, renderer.layout);
  };
  let to = target();
  // 初期の morph は URL などで指定された state の値を尊重する
  let current = { ...to, morph: store.get().morph };
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
    to = target();
    from = current;
    if (s.reducedMotion || immediate) {
      current = to;
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
      current = tween(from, to, ease(progress));
      push();
    },
    resize() {
      to = target();
      if (progress >= 1) {
        current = { ...to, morph: current.morph };
        push();
      } else {
        renderer.setView(current);
      }
    },
    dispose() {
      off();
    },
  };
}
