// 年の補間の持ち主。state.year が変わったとき、描画器の年を前の年から次の年へ時間をかけて移す。
//   createYearTween({ renderer, year, duration, ease }) → { set(year, { immediate }), update(dtSec), get(), dispose() }
//     renderer.setYear(a, b, mix) を呼ぶのはここだけ(main.js が state.year の変化を set へ渡し、毎フレーム update を呼ぶ)。
//     duration は秒(既定 0.6 = tokens.css の --dur-year)。ease は 0〜1 → 0〜1(既定 ease-in-out。docs/particles/spec.md §6)。
//     immediate(動きを減らす設定、still=1)のときは補間せずに切り替える。
//     補間の途中で次の年が来たら、そのとき近いほうの年から新しい年へ向かい直す(2 つの年だけを直接補間する)。
// 読み出し・ツールチップ・表は state.year(切り替え先の年)を使うので、補間の途中でも切り替え先の値を出す。
import { easeInOut } from '../geometry/particles.js';

export const YEAR_SECONDS = 0.6;

/** CSS の時間('600ms'、'.6s'。ビルドの圧縮で単位が変わる)を秒にする。読めなければ null。 */
export function parseDuration(text) {
  const m = /^\s*(-?[\d.]+)\s*(ms|s)\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  return m[2].toLowerCase() === 'ms' ? v / 1000 : v;
}

export function createYearTween({ renderer, year, duration = YEAR_SECONDS, ease = easeInOut }) {
  let a = year;
  let b = year;
  let progress = 1;
  const push = () => renderer.setYear(a, b, progress >= 1 ? 0 : ease(progress));
  // 補間が終わったら (b, b, 0) にそろえる
  const settle = () => {
    a = b;
    progress = 1;
    push();
  };
  settle();

  return {
    /** 年を next へ変える。immediate なら即座に、そうでなければ duration をかけて補間する。 */
    set(next, { immediate = false } = {}) {
      if (next === b && progress >= 1) return;
      if (immediate || !(duration > 0)) {
        b = next;
        settle();
        return;
      }
      // 補間の途中なら、いま見た目が近いほうの年から始める
      const from = progress < 1 && ease(progress) >= 0.5 ? b : a;
      if (from === next) {
        b = next;
        settle();
        return;
      }
      a = from;
      b = next;
      progress = 0;
      push();
    },
    update(dt) {
      if (progress >= 1) return;
      progress = Math.min(1, progress + Math.max(0, dt) / duration);
      if (progress >= 1) settle();
      else push();
    },
    /** いまの補間の状態 { a, b, mix }(確認用)。 */
    get: () => ({ a, b, mix: progress >= 1 ? 0 : ease(progress) }),
    /** 補間中か。 */
    get busy() {
      return progress < 1;
    },
    dispose() {},
  };
}
