// 固定の UI(上の帯、凡例、読み出し、年の切り替え、カメラ、表)の矩形を集める。
// ツールチップとラベルが、固定の UI の領域にかからないようにするために使う(デザイン仕様 5.5 節、5.9 節)。
// 要素の構造は別の担当が決めるので、既知の入れ物の id と `[data-avoid]` を見て、
// 入れ物が画面の大きな部分を占めるときは、中の子要素の矩形を使う。

const IDS = ['controls', 'timeline', 'selector', 'table', 'legend', 'readout'];

/**
 * @param {Document} doc
 * @returns {{left:number, top:number, right:number, bottom:number}[]}
 */
export function collectFixedRects(doc = document) {
  const vw = doc.documentElement.clientWidth || 1;
  const vh = doc.documentElement.clientHeight || 1;
  const big = vw * vh * 0.25;
  const out = [];
  const visit = (el, depth) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const cs = doc.defaultView?.getComputedStyle?.(el);
    if (cs && (cs.visibility === 'hidden' || cs.display === 'none')) return;
    if (r.width * r.height > big && depth < 3 && el.children.length) {
      for (const c of el.children) visit(c, depth + 1);
      return;
    }
    if (r.width * r.height > big) return; // 中身のない大きな入れ物は、避ける対象にしない
    out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };
  const seen = new Set();
  for (const id of IDS) {
    const el = doc.getElementById(id);
    if (el) seen.add(el);
  }
  for (const el of doc.querySelectorAll('[data-avoid]')) seen.add(el);
  for (const el of seen) visit(el, 0);
  return out;
}

/** 矩形 a と b が、pad px の余白を足して重なるか。 */
export function rectsOverlap(a, b, pad = 0) {
  return !(a.right + pad <= b.left || b.right + pad <= a.left || a.bottom + pad <= b.top || b.bottom + pad <= a.top);
}
