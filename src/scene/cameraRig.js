// store と renderer をつなぐカメラの配線。
//   createCameraRig({ store, renderer, immediate, duration, element, partners }) → { update(dtSec), resize(), reset(), orbit(dAz, dEl), zoomBy(f), dispose() }
//   state.camera(定位置)と state.selection(選択時の構図)が変わると、現在の視点から新しい視点まで補間する(state.morph も書き換える)。
//   reducedMotion のとき、または immediate のときは即座に切り替える。
//   partners(selection) → 選択地域の主要な相手先の添字(選択時の構図に収める。省略可)。
//   毎フレーム update(dtSec) を呼ぶ。画面の大きさが変わったら resize() を呼ぶ。
//   自由探索: element(既定は #stage)の上のドラッグで方位と仰角を、ホイール・ピンチで拡大縮小を、矢印キーと +/- で同じことを行う。
//     範囲は camera.js の USER_LIMITS。定位置を選び直す(state.camera が変わる)と、利用者の操作は消える。
import {
  TRANSITION_SECONDS, USER_LIMITS, clampOrbit, dragToAngles, easeCamera, reorient, tween, viewFor, viewOptions,
} from './camera.js';

const KEY_ANGLE = 0.08; // 矢印キー 1 回の回転(ラジアン)
const KEY_ZOOM = 1.15;
const DRAG_THRESHOLD = 4; // この距離(CSS px)を超えて動いたらドラッグ。クリックによる選択と区別する

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const near = (a, b) => Math.abs(a - b) < 1e-9;
const sameView = (a, b) =>
  near(a.azimuth, b.azimuth) && near(a.elevation, b.elevation) && near(a.roll, b.roll) && near(a.zoom, b.zoom) &&
  a.center.every((v, k) => near(v, b.center[k]));

export function createCameraRig({ store, renderer, immediate = false, duration = TRANSITION_SECONDS, element, partners }) {
  const el = element ?? (typeof document !== 'undefined' ? document.getElementById('stage') : null);

  // 利用者の操作: 定位置の方位・仰角からの差と、拡大の倍率
  const user = { dAz: 0, dEl: 0, zoom: 1 };

  const baseView = () => {
    const { width, height } = renderer.getState();
    const s = store.get();
    return viewFor(s.camera, width / height, renderer.layout, viewOptions(width, height, s.selection, partners?.(s.selection)));
  };
  const target = () => {
    const base = baseView();
    if (!user.dAz && !user.dEl && user.zoom === 1) return base;
    const { azimuth, elevation } = clampOrbit(base, base.azimuth + user.dAz, base.elevation + user.dEl);
    return reorient(base, { azimuth, elevation, zoomScale: user.zoom });
  };

  let to = target();
  // 初期の morph は URL などで指定された state の値を尊重する
  let current = { ...to, morph: store.get().morph };
  let from = current;
  let progress = 1;

  // state.morph は、この配線だけが書く値。自分が書いた変化と、外から書かれた変化を区別する
  let writing = false;
  const push = () => {
    renderer.setView(current);
    renderer.setLean(current.lean);
    writing = true;
    try { store.set({ morph: current.morph }); } finally { writing = false; }
  };
  push();

  // 目標が変わったとき: 動きを減らす設定・immediate なら即座に、そうでなければ今の位置から向かい直す
  const retarget = () => {
    to = target();
    from = current;
    if (store.get().reducedMotion || immediate) {
      current = to;
      progress = 1;
      push();
    } else {
      progress = 0;
    }
  };

  const off = store.subscribe((s, changed) => {
    // 外から書かれた morph は巻き戻さず、今の値として受け入れる(遷移の途中でも、その値を保つ。次の定位置の変更で動き出す)
    if (!writing && changed.includes('morph')) {
      current = { ...current, morph: s.morph };
      if (progress < 1) {
        from = { ...from, morph: s.morph };
        to = { ...to, morph: s.morph };
      }
    }
    if (changed.includes('camera')) {
      user.dAz = 0; user.dEl = 0; user.zoom = 1;
      retarget();
    } else if (changed.includes('selection')) {
      user.zoom = 1; // 新しい構図に合わせて拡大は戻す。回した向きは保つ
      const next = target();
      if (progress >= 1 && sameView(next, current)) return; // 構図が変わらない(真横など)
      retarget();
    } else if (changed.includes('reducedMotion') && s.reducedMotion && progress < 1) {
      current = to;
      progress = 1;
      push();
    }
  });

  // 利用者の操作を反映する。静止中は即座に、遷移中は目標だけを更新する
  const applyUser = () => {
    to = { ...target(), morph: to.morph }; // morph の目標は変えない
    if (progress >= 1) {
      current = { ...to, morph: current.morph, lean: current.lean };
      renderer.setView(current);
    }
  };
  const orbit = (dAz, dEl) => {
    const base = baseView();
    const { azimuth, elevation } = clampOrbit(base, base.azimuth + user.dAz + dAz, base.elevation + user.dEl + dEl);
    user.dAz = azimuth - base.azimuth;
    user.dEl = elevation - base.elevation;
    applyUser();
  };
  const zoomBy = (f) => {
    user.zoom = clamp(user.zoom * f, USER_LIMITS.zoomMin, USER_LIMITS.zoomMax);
    applyUser();
  };
  const reset = () => {
    user.dAz = 0; user.dEl = 0; user.zoom = 1;
    retarget();
  };

  // ---- ポインタ・ホイール・キーボード ----
  const pointers = new Map(); // pointerId → { x, y }
  let dragging = false;
  let suppressClick = false;
  let pinchStart = null; // { dist, zoom }
  const cleanups = [];
  const on = (type, fn, opts) => {
    el.addEventListener(type, fn, opts);
    cleanups.push(() => el.removeEventListener(type, fn, opts));
  };

  if (el) {
    if (el.tabIndex < 0) el.tabIndex = 0; // キーボードで操作できるようにする
    // 縦のスクロールはページに任せる(縦にドラッグすると、ページが動く)。横のドラッグとピンチは受け取る
    el.style.touchAction = 'pan-y';

    on('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* 捕捉できなくても動く */ }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: user.zoom };
        dragging = true;
      }
    });
    on('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size >= 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        user.zoom = clamp(pinchStart.zoom * (dist / pinchStart.dist), USER_LIMITS.zoomMin, USER_LIMITS.zoomMax);
        applyUser();
        return;
      }
      if (!dragging && Math.hypot(p.x - p.x0, p.y - p.y0) < DRAG_THRESHOLD) return;
      dragging = true;
      const a = dragToAngles(dx, dy, current.roll);
      orbit(a.dAzimuth, a.dElevation);
    });
    const end = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      try { el.releasePointerCapture(e.pointerId); } catch { /* 既に解放済み */ }
      if (pointers.size < 2) pinchStart = null;
      if (!pointers.size) {
        if (dragging) suppressClick = true; // ドラッグの終わりのクリックで、地域を選んでしまわない
        dragging = false;
      }
    };
    on('pointerup', end);
    on('pointercancel', end);
    // main.js のクリック(選択)より先に呼ばれるよう、捕捉の段階で止める
    on('click', (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    }, true);

    // ホイール: Ctrl / ⌘ を押しているとき(トラックパッドのピンチもこの形)だけ拡大縮小する。
    // それ以外はページのスクロールに任せる(自由探索の章でも、ページを前の章へ戻せるように)。
    on('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      // マウスのホイール 1 ノッチ(約 100)でも、1 回の倍率が大きくなりすぎないよう上限を付ける
      const dy = clamp(e.deltaY * unit, -80, 80);
      zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });

    on('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === 'ArrowLeft') orbit(KEY_ANGLE, 0);
      else if (k === 'ArrowRight') orbit(-KEY_ANGLE, 0);
      else if (k === 'ArrowUp') orbit(0, -KEY_ANGLE);
      else if (k === 'ArrowDown') orbit(0, KEY_ANGLE);
      else if (k === '+' || k === '=') zoomBy(KEY_ZOOM);
      else if (k === '-' || k === '_') zoomBy(1 / KEY_ZOOM);
      else if (k === 'Home' || k === 'Escape') reset();
      else return;
      e.preventDefault();
    });
  }

  return {
    update(dt) {
      if (progress >= 1) return;
      progress = Math.min(1, progress + dt / duration);
      current = tween(from, to, easeCamera(progress), renderer.layout);
      push();
    },
    resize() {
      to = { ...target(), morph: to.morph }; // 画面の大きさが変わっても、morph の目標は変えない
      if (progress >= 1) {
        current = { ...to, morph: current.morph, lean: current.lean };
        push();
      } else {
        renderer.setView(current);
      }
    },
    reset,
    orbit,
    zoomBy,
    /** 今の視点(テストや撮影用)。 */
    getView: () => current,
    dispose() {
      off();
      cleanups.forEach((fn) => fn());
    },
  };
}
