// 最小の store。get() は不変のスナップショットを返し、set(patch) は変わったキーだけを通知する。

export const DEFAULT_STATE = Object.freeze({
  year: 2025,
  chapter: 0,
  selection: null, // null | { type: 'pref', code } | { type: 'metro', id }
  camera: 'side', // 'side' | 'oblique' | 'top'
  morph: 0, // 0〜1
  theme: 'paper', // 'paper' | 'ink'
  lang: 'ja', // 'ja' | 'en'
  reducedMotion: false,
  hover: null, // null | { type: 'pref', code } | { type: 'arc', o, d }
});

function same(a, b) {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  }
  return false;
}

/**
 * createStore(initial) → { get(), set(patch), subscribe(fn) }
 * subscribe(fn): fn(state, changedKeys) を set のたびに(変化があったときだけ)同期で呼ぶ。
 *                戻り値は購読解除の関数。
 */
export function createStore(initial = {}) {
  let state = { ...DEFAULT_STATE, ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const changed = Object.keys(patch).filter((k) => !same(state[k], patch[k]));
      if (!changed.length) return;
      state = { ...state, ...Object.fromEntries(changed.map((k) => [k, patch[k]])) };
      for (const fn of [...listeners]) fn(state, changed);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
