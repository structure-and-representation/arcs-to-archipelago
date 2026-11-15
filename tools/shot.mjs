#!/usr/bin/env node
// Vite のプレビューサーバを立てて、Playwright(Chromium)で画面を撮影する。
//
// 使い方(--query と --size は、次に変えるまで引き継がれる。--out で1枚撮る):
//   node tools/shot.mjs --query "morph=0&cam=side" --size 1440x900 --out shots/side-desktop.png \
//                       --size 390x844 --out shots/side-mobile.png \
//                       --query "morph=1&cam=top" --size 1440x900 --out shots/top-desktop.png
//
// オプション:
//   --build        撮影の前に必ず vite build する(dist がなければ自動で build する)
//   --dpr N        deviceScaleFactor(既定 2)
//   --no-still     query に still=1 を足さない(既定は足して、時間と乱数を固定する)
//   --wait MS      描画が整ってから撮るまでの待ち(既定 400)
// コンソールのエラー・警告、読み込みに失敗した要求があれば表示し、終了コード 1 で終わる。
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

const require = createRequire(import.meta.url); // NODE_PATH のグローバルな playwright を使う
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const opts = { build: false, dpr: 2, still: true, wait: 400 };
const shots = [];
let query = '';
let size = '1440x900';
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => {
    if (i + 1 >= args.length) throw new Error(`${a} に値がありません`);
    return args[++i];
  };
  if (a === '--query') query = next().replace(/^\?/, '');
  else if (a === '--size') size = next();
  else if (a === '--out') shots.push({ query, size, out: resolve(next()) });
  else if (a === '--build') opts.build = true;
  else if (a === '--dpr') opts.dpr = Number(next());
  else if (a === '--no-still') opts.still = false;
  else if (a === '--wait') opts.wait = Number(next());
  else throw new Error(`不明な引数: ${a}`);
}
if (!shots.length) {
  console.error('撮影先がありません。--out <ファイル> を指定してください(先頭のコメントを参照)。');
  process.exit(2);
}

if (opts.build || !existsSync(resolve(root, 'dist/index.html'))) {
  await build({ root, logLevel: 'warn' });
}
const server = await preview({ root, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
const base = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let problems = 0;
try {
  for (const shot of shots) {
    const [w, h] = shot.size.split('x').map(Number);
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: opts.dpr });
    const log = (kind, text) => {
      problems++;
      console.error(`[${shot.out}] ${kind}: ${text}`);
    };
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') log(`console.${m.type()}`, m.text());
    });
    page.on('pageerror', (e) => log('pageerror', e.message));
    page.on('requestfailed', (r) => log('requestfailed', `${r.url()} ${r.failure()?.errorText}`));
    page.on('response', (r) => {
      if (r.status() >= 400) log('http', `${r.status()} ${r.url()}`);
    });
    const q = new URLSearchParams(shot.query);
    if (opts.still && !q.has('still')) q.set('still', '1');
    const url = `${base}?${q}`;
    await page.goto(url);
    try {
      await page.waitForSelector('html[data-ready="1"], html[data-error]', { timeout: 60000 });
    } catch {
      log('timeout', '描画の準備が整いませんでした');
    }
    const err = await page.evaluate(() => document.documentElement.dataset.error);
    if (err) log('app-error', err);
    await page.waitForTimeout(opts.wait);
    mkdirSync(dirname(shot.out), { recursive: true });
    await page.screenshot({ path: shot.out });
    console.log(`${shot.out}  ${shot.size}  ?${q}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
if (problems) {
  console.error(`問題が ${problems} 件ありました。`);
  process.exit(1);
}
