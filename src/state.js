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
 * 通知の順序: 購読関数の中で set したときは、その通知を待ち行列に積み、いまの通知をすべての購読関数に
 *   配り終えてから配る。どの購読関数も、set された順に (その時点の state, 変わったキー) を受け取る。
 *   (get() は常に最新の state を返す)
 */
export function createStore(initial = {}) {
  let state = { ...DEFAULT_STATE, ...initial };
  const listeners = new Set();
  const queue = [];
  let notifying = false;
  return {
    get: () => state,
    set(patch) {
      const changed = Object.keys(patch).filter((k) => !same(state[k], patch[k]));
      if (!changed.length) return;
      state = { ...state, ...Object.fromEntries(changed.map((k) => [k, patch[k]])) };
      queue.push([state, changed]);
      if (notifying) return;
      notifying = true;
      try {
        while (queue.length) {
          const [snapshot, keys] = queue.shift();
          for (const fn of [...listeners]) {
            if (listeners.has(fn)) fn(snapshot, keys);
          }
        }
      } finally {
        notifying = false;
        queue.length = 0;
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
