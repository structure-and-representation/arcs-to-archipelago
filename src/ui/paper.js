// 和紙の繊維のマスクを、起動時に 1 回だけ手続き的に描く(画像ファイルを足さない)。
// 結果は <html> のカスタムプロパティ --paper-fiber(url(blob:…))に入れ、base.css の body::before が
// 細かな地のノイズと重ねて mask-image に使う。色は持たない(アルファだけ)。色は CSS が fg の不透明度で付ける。
//
// - タイルは FIBER_TILE CSS px の正方形で、端をまたぐ繊維は反対側にも描くので、つなぎ目が見えない。
// - 乱数は種を固定する(撮影の結果を再現できるように)。
// - canvas が使えない環境では何もしない(CSS の既定のノイズだけになる)。
export const FIBER_TILE = 560; // CSS px。画面の幅で 2〜3 回しか繰り返さない大きさ
const SCALE = 2; // DPR 2 の画面で繊維が滲まないように、2 倍の解像度で描く

/** 0〜1 の一様乱数(mulberry32、種を固定)。 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 繊維を ctx(FIBER_TILE * SCALE 四方)に描く。
 * 楮の長い繊維(ゆるく曲がる細い線)と、短い繊維、塵のような小さな点の 3 種。
 */
export function drawFibers(ctx, seed = 7) {
  const r = rng(seed);
  const T = FIBER_TILE;
  ctx.save();
  ctx.scale(SCALE, SCALE);
  ctx.lineCap = 'round';
  const strokeWrapped = (draw) => {
    for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
      ctx.save();
      ctx.translate(dx, dy);
      draw();
      ctx.restore();
    }
  };
  const fiber = (len, width, alpha) => {
    const x = r() * T, y = r() * T;
    // 漉くときの流れで、繊維はやや横向きにそろう
    const ang = (r() - 0.5) * Math.PI * 0.9 + (r() < 0.3 ? Math.PI / 2 : 0);
    const bend = (r() - 0.5) * len * 0.9;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    const cx = (x + ex) / 2 - Math.sin(ang) * bend, cy = (y + ey) / 2 + Math.cos(ang) * bend;
    strokeWrapped(() => {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
    });
  };
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  for (let i = 0; i < 90; i++) fiber(22 + r() * 55, 0.3 + r() * 0.45, 0.25 + r() * 0.4); // 長い繊維
  for (let i = 0; i < 320; i++) fiber(5 + r() * 18, 0.3 + r() * 0.45, 0.3 + r() * 0.45); // 短い繊維
  for (let i = 0; i < 140; i++) {
    // 塵(ごく小さな点)
    const x = r() * T, y = r() * T, s = 0.3 + r() * 0.7, a = 0.25 + r() * 0.5;
    const sy = s * (0.5 + r() * 0.5), rot = r() * Math.PI;
    strokeWrapped(() => {
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(x, y, s, sy, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.restore();
}

/** --paper-fiber を <html> に設定する。戻り値は後片付けの関数。 */
export function installPaperFibers(root = document.documentElement) {
  if (typeof document === 'undefined') return () => {};
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FIBER_TILE * SCALE;
  const ctx = canvas.getContext?.('2d');
  if (!ctx || typeof canvas.toBlob !== 'function') return () => {};
  drawFibers(ctx);
  let url = null;
  let disposed = false;
  canvas.toBlob((blob) => {
    if (!blob || disposed) return;
    url = URL.createObjectURL(blob);
    root.style.setProperty('--paper-fiber', `url("${url}")`);
  }, 'image/png');
  return () => {
    disposed = true;
    root.style.removeProperty('--paper-fiber');
    if (url) URL.revokeObjectURL(url);
  };
}
