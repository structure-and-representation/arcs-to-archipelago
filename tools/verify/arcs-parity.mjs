#!/usr/bin/env node
// 真横の定位置で描いた弧が、原作(D3 v3 の arc diagram、1px の線)と ±1px で一致することを画像で比べる。
//
//   node tools/verify/arcs-parity.mjs [--build] [--size 1440x900] [--year 2014] [--out shots/parity]
//
// 手順:
//   1. アプリを ?morph=0&cam=side&year=N で開き、弧の線幅 1px・不透明度 1 に固定して(globalThis.__ARCS_DEBUG)、
//      キャンバスだけを撮る(DPR 1)。都道府県の点は比較から除く。
//   2. 同じ画面の座標へ、原作の式(d3.svg.line().interpolate('basis') に [A, M, B])で作った path を
//      非表示の SVG として 1px の黒い線で描き、撮る。
//   3. 線の画素(被覆率 ≥ しきい値)について、一方の画素から ±1px(3×3 の近傍)以内にもう一方の線の画素があるかを数える。
// 終了コード: 0 = 両方向とも 100% が ±1px 以内、1 = そうでない。
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const d3 = require('d3');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const args = process.argv.slice(2);
const opt = { build: false, size: '1440x900', year: 2014, out: null, threshold: 0.25 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--build') opt.build = true;
  else if (a === '--size') opt.size = args[++i];
  else if (a === '--year') opt.year = Number(args[++i]);
  else if (a === '--out') opt.out = resolve(args[++i]);
  else if (a === '--threshold') opt.threshold = Number(args[++i]);
  else throw new Error(`不明な引数: ${a}`);
}
const [W, H] = opt.size.split('x').map(Number);

if (opt.build || !existsSync(resolve(root, 'dist/index.html'))) await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
const base = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let exitCode = 0;
try {
  // ---- 1. アプリの弧(線幅 1px・不透明度 1) ----
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await page.addInitScript(() => {
    globalThis.__ARCS_DEBUG = { width: 1, alpha: 1 };
  });
  await page.goto(`${base}?morph=0&cam=side&year=${opt.year}&still=1`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 60000 });
  await page.addStyleTag({
    content: 'html,body{background:#fff !important}#app>*:not(#stage){display:none !important}#stage{background:transparent !important}',
  });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const r = window.__app.renderer;
    return { m: Array.from(r.screenMatrix()), nodes: Array.from({ length: 47 }, (_, i) => r.project(i)) };
  });
  const glPng = await page.screenshot();
  await page.close();

  // ---- 2. 原作の arc diagram(同じ画面座標へ変換した SVG、1px の黒い線) ----
  const { CX, STEP, W: AW, H: AH } = await import(resolve(root, 'src/geometry/constants.js'));
  const m = info.m;
  const toScreen = ([x, y]) => {
    const wx = x - CX, wy = AH - y; // 原作の SVG 座標 → ワールド(x, y)。z = 0
    return [m[0] * wx + m[1] * wy + m[3], m[4] * wx + m[5] * wy + m[7]];
  };
  const line = d3.svg.line().interpolate('basis');
  const paths = [];
  for (let s = 0; s < 47; s++) {
    for (let t = 0; t < 47; t++) {
      if (s === t) continue;
      const sx = s * STEP, tx = t * STEP;
      const midPercent = Math.abs((sx - tx) / AW);
      const midY = sx > tx ? AH - midPercent * AH : AH + midPercent * AH; // 原作 arcDiagram.arc と同じ式
      const pts = [[sx, AH], [(sx + tx) / 2, midY], [tx, AH]].map(toScreen);
      paths.push(`<path d="${line(pts)}"/>`);
    }
  }
  const svg = `<!doctype html><html><body style="margin:0;background:#fff"><svg width="${W}" height="${H}" style="display:block" fill="none" stroke="#000" stroke-width="1">${paths.join('')}</svg></body></html>`;
  const page2 = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page2.setContent(svg);
  const svgPng = await page2.screenshot();
  await page2.close();

  // ---- 3. 比較(ブラウザ内で画素を読む) ----
  const page3 = await browser.newPage({ viewport: { width: W, height: H } });
  const result = await page3.evaluate(
    async ({ gl, sv, nodes, threshold, W, H }) => {
      const load = (b64) =>
        new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            res(g.getImageData(0, 0, W, H).data);
          };
          img.src = `data:image/png;base64,${b64}`;
        });
      const A = await load(gl), B = await load(sv);
      // 被覆率: GL は墨(#1C1B18)の上の不透明度、SVG は黒の上の不透明度
      const covA = new Float32Array(W * H), covB = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) {
        covA[i] = Math.min(1, (255 - A[i * 4 + 1]) / (255 - 27));
        covB[i] = (255 - B[i * 4 + 1]) / 255;
      }
      // 都道府県の点(半径 6px)は比較から除く
      const skip = new Uint8Array(W * H);
      for (const [nx, ny] of nodes) {
        for (let y = Math.max(0, Math.floor(ny) - 7); y < Math.min(H, Math.floor(ny) + 8); y++) {
          for (let x = Math.max(0, Math.floor(nx) - 7); x < Math.min(W, Math.floor(nx) + 8); x++) skip[y * W + x] = 1;
        }
      }
      const bin = (cov) => {
        const b = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) b[i] = !skip[i] && cov[i] >= threshold ? 1 : 0;
        return b;
      };
      const a = bin(covA), b = bin(covB);
      // x の方向と y の方向の近さ(0: 同じ画素、1: 3×3 の近傍、…)を、探索半径 3 まで調べる
      const nearest = (from, to) => {
        const hist = [0, 0, 0, 0, 0]; // 距離(Chebyshev)0, 1, 2, 3, それ以上
        let n = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!from[y * W + x]) continue;
            n++;
            let d = 4;
            for (let r = 0; r <= 3 && d === 4; r++) {
              for (let dy = -r; dy <= r && d === 4; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                  if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                  const xx = x + dx, yy = y + dy;
                  if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                  if (to[yy * W + xx]) { d = r; break; }
                }
              }
            }
            hist[d]++;
          }
        }
        return { n, hist };
      };
      let massA = 0, massB = 0;
      for (let i = 0; i < W * H; i++) if (!skip[i]) { massA += covA[i]; massB += covB[i]; }
      return { glToSvg: nearest(a, b), svgToGl: nearest(b, a), massA, massB };
    },
    { gl: glPng.toString('base64'), sv: svgPng.toString('base64'), nodes: info.nodes, threshold: opt.threshold, W, H },
  );
  await page3.close();

  if (opt.out) {
    mkdirSync(opt.out, { recursive: true });
    writeFileSync(resolve(opt.out, 'gl.png'), glPng);
    writeFileSync(resolve(opt.out, 'svg.png'), svgPng);
  }

  const pct = (x, n) => `${((100 * x) / n).toFixed(3)}%`;
  const report = (label, r) => {
    const within1 = r.hist[0] + r.hist[1];
    console.log(
      `${label}: 線の画素 ${r.n} 個  同じ画素 ${pct(r.hist[0], r.n)}  ±1px 以内 ${pct(within1, r.n)}  ` +
        `距離2 ${r.hist[2]}  距離3 ${r.hist[3]}  それ以上 ${r.hist[4]}`,
    );
    return within1 === r.n;
  };
  console.log(`size ${opt.size}  year ${opt.year}  しきい値(被覆率) ${opt.threshold}`);
  const ok1 = report('アプリ → 原作', result.glToSvg);
  const ok2 = report('原作 → アプリ', result.svgToGl);
  console.log(`線の濃さの総量(被覆率の合計): アプリ ${result.massA.toFixed(0)}  原作 ${result.massB.toFixed(0)}  比 ${(result.massA / result.massB).toFixed(4)}`);
  if (problems.length) {
    console.error('コンソールの問題:', problems);
    exitCode = 1;
  }
  console.log(ok1 && ok2 ? '結果: 一致(±1px)' : '結果: ±1px を超える画素があります');
  if (!(ok1 && ok2)) exitCode = 1;
} finally {
  await browser.close();
  server.httpServer.close();
}
process.exit(exitCode);
