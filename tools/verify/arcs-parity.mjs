#!/usr/bin/env node
// 真横の定位置で描いた弧が、原作の arc diagram の曲線と ±1px で一致することを、疎な弧で測って確かめる。
// (npm test の対象外。Playwright と開発サーバを使う)
//
//   node tools/verify/arcs-parity.mjs [--size 1440x900] [--year 2014] [--out <dir>]
//
// 方法(docs/review/integration-review.md の A1 の独立の検証と同じ):
//   1. 開発サーバ(vite)でアプリを開き、1 つの地域だけを選んで(沖縄県、鹿児島県、東京都。各 92 本)真横で撮る。
//      弧の線幅 1px・不透明度 1、粒子なし(globalThis.__ARCS_DEBUG。開発サーバでだけ有効)、DPR 1、キャンバスだけ。
//   2. 同じ弧の曲線を、geometry/arc.js の arcPoint(原作の d3.svg.line().interpolate('basis') と一致することを
//      test/arc.test.js で確かめている)で作り、アプリの screenMatrix() で画面へ射影する。
//   3. 曲線上の点のうち、ほかの弧から 5px 以上離れ、都道府県の点から 10px 以上離れた点で、曲線の法線方向 ±3px の
//      画素の濃さの重心を求め、曲線からの垂直方向のずれを測る。
// 判定(終了コード 0): 3 つの地域すべてで、ずれの最大が 1px 以下、99 パーセンタイルが 0.5px 以下、標本が 500 以上。
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const args = process.argv.slice(2);
const opt = { size: '1440x900', year: 2014, out: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--size') opt.size = args[++i];
  else if (a === '--year') opt.year = Number(args[++i]);
  else if (a === '--out') opt.out = resolve(args[++i]);
  else throw new Error(`不明な引数: ${a}`);
}
const [W, H] = opt.size.split('x').map(Number);

const { arcPoint } = await import(resolve(root, 'src/geometry/arc.js'));
const { lineLayout } = await import(resolve(root, 'src/geometry/layout.js'));
const { selectionMask } = await import(resolve(root, 'src/geometry/flows.js'));
const line = lineLayout();

const server = await createServer({ root, logLevel: 'warn', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const quantile = (xs, q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
let failed = false;
try {
  for (const [name, sel] of [['沖縄県', '47'], ['鹿児島県', '46'], ['東京都', '13']]) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.addInitScript(() => {
      globalThis.__ARCS_DEBUG = { width: 1, alpha: 1, hideParticles: true };
    });
    await page.goto(`${base}?morph=0&cam=side&year=${opt.year}&sel=${sel}&still=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('html[data-ready="1"]', { timeout: 120000 });
    await page.addStyleTag({
      content: 'html,body{background:#fff !important}body::before,body::after{display:none !important}#app>*:not(#stage){display:none !important}',
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__app.pause());
    const info = await page.evaluate(() => ({
      m: Array.from(window.__app.renderer.screenMatrix()),
      nodes: Array.from({ length: 47 }, (_, i) => window.__app.renderer.project(i)),
    }));
    const png = await page.screenshot();
    if (opt.out) {
      mkdirSync(opt.out, { recursive: true });
      writeFileSync(resolve(opt.out, `parity-${sel}.png`), png);
    }
    // 画素の濃さ(白 = 0、黒 = 1)を、ブラウザで PNG を読んで取り出す
    const ink = await page.evaluate(async ([b64, w, h]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      const out = new Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = Math.round(255 - (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3);
      return out;
    }, [png.toString('base64'), W, H]);
    await page.close();

    // 弧の曲線(画面座標)
    const mask = selectionMask(/^\d+$/.test(sel) ? { type: 'pref', code: Number(sel) } : { type: 'metro', id: sel });
    const m = info.m;
    const curves = [];
    for (let o = 0; o < 47; o++) {
      for (let d = 0; d < 47; d++) {
        if (o === d || mask[o] === mask[d]) continue;
        const side = mask[d] ? 1 : -1;
        const pts = [];
        const p = [0, 0, 0];
        for (let k = 0; k <= 600; k++) {
          arcPoint(line[o], line[d], side, 0, k / 600, p);
          pts.push([m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7]]);
        }
        curves.push(pts);
      }
    }
    // ほかの弧に近い点を除くための格子(1px の升に、通る弧の番号を入れる)
    const grid = new Map();
    curves.forEach((pts, ci) => {
      for (const [x, y] of pts) {
        const key = `${Math.round(x)},${Math.round(y)}`;
        if (!grid.has(key)) grid.set(key, new Set());
        grid.get(key).add(ci);
      }
    });
    const isolated = (x, y, ci, r = 5) => {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const s = grid.get(`${Math.round(x) + dx},${Math.round(y) + dy}`);
          if (s && [...s].some((c) => c !== ci)) return false;
        }
      }
      return true;
    };
    const devs = [];
    curves.forEach((pts, ci) => {
      for (let k = 5; k < pts.length - 5; k += 1) {
        const [x, y] = pts[k];
        if (x < 4 || y < 4 || x > W - 5 || y > H - 5) continue;
        if (info.nodes.some(([nx, ny]) => Math.hypot(nx - x, ny - y) < 10)) continue;
        if (!isolated(x, y, ci)) continue;
        const tx = pts[k + 1][0] - pts[k - 1][0], ty = pts[k + 1][1] - pts[k - 1][1];
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        // 曲線の点のまわりの画素(中心は整数 + 0.5)のうち、接線方向に ±0.5px、法線方向に ±3px の範囲の濃さの重心
        let sw = 0, swt = 0;
        for (let j = Math.floor(y) - 4; j <= Math.floor(y) + 4; j++) {
          for (let i = Math.floor(x) - 4; i <= Math.floor(x) + 4; i++) {
            const cx = i + 0.5 - x, cy = j + 0.5 - y;
            const along = (cx * tx + cy * ty) / tl, t = cx * nx + cy * ny;
            if (Math.abs(along) > 0.5 || Math.abs(t) > 3) continue;
            const v = ink[j * W + i] / 255;
            if (v > 0.03) {
              sw += v;
              swt += v * t;
            }
          }
        }
        if (sw > 0.3) devs.push(Math.abs(swt / sw));
      }
    });
    devs.sort((a, b) => a - b);
    const st = { n: devs.length, median: quantile(devs, 0.5), p95: quantile(devs, 0.95), p99: quantile(devs, 0.99), max: devs[devs.length - 1] };
    const ok = st.n >= 500 && st.max <= 1 && st.p99 <= 0.5;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'ok ' : 'NG '} ${name}を選んだ真横: 標本 ${st.n}、垂直方向のずれ 中央値 ${st.median?.toFixed(2)}px、` +
        `95% ${st.p95?.toFixed(2)}px、99% ${st.p99?.toFixed(2)}px、最大 ${st.max?.toFixed(2)}px`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
if (failed) {
  console.error('原作の曲線から ±1px を超えるずれがありました。');
  process.exit(1);
}
console.log('弧は原作の arc diagram の曲線と ±1px 以内で一致しました。');
