#!/usr/bin/env node
// Vite のプレビューサーバを立てて、Playwright(Chromium)で画面を撮影する。
//
// 使い方(--query と --size は、次に変えるまで引き継がれる。--out で1枚撮る):
//   node tools/shot.mjs --query "morph=0&cam=side" --size 1440x900 --out shots/side-desktop.png \
//                       --size 390x844 --out shots/side-mobile.png \
//                       --query "morph=1&cam=top" --size 1440x900 --out shots/top-desktop.png
//
// オプション:
//   --build        撮影の前に必ず vite build する(dist がないとき、ソースが dist より新しいときは自動で build する)
//   --dpr N        deviceScaleFactor(既定 2)
//   --no-still     query に still=1 を足さない(既定は足して、時間と乱数を固定する)
//   --wait MS      描画が整ってから撮るまでの待ち(既定 400)
// コンソールのエラー・警告、読み込みに失敗した要求があれば表示し、終了コード 1 で終わる。
//
// 続けて撮るときの約束(前の撮影の状態を次へ持ち越さない):
//   - 1 枚ごとに新しいブラウザのコンテキストを作り、撮り終えたら描画ループを止め、WebGL の文脈を解放してから閉じる。
//   - 読み込みは DOMContentLoaded までを待ち(Web フォントの読み込みの遅れで goto が時間切れにならないように)、
//     準備の合図(data-ready)と document.fonts.ready を待つ。撮る前に描画ループを止めて、重い描画が撮影を妨げないようにする。
//   - 1 枚の撮影で例外が出ても、そこで止めずに 1 回だけ撮り直し、残りを撮り続ける(撮り直せても問題として数える)。
//   - dist を自動で作り直すので、同じ作業ツリーで 2 本を同時に起動しない(作り直しの間、もう一方の読み込みが失敗する)。
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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

/** dir 以下(または file)の最も新しい更新時刻。 */
function newest(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  return readdirSync(path).reduce((m, name) => Math.max(m, newest(resolve(path, name))), st.mtimeMs);
}
const distIndex = resolve(root, 'dist/index.html');
const sourceTime = Math.max(...['src', 'public', 'index.html', 'vite.config.js', 'package.json'].map((p) => newest(resolve(root, p))));
const stale = !existsSync(distIndex) || statSync(distIndex).mtimeMs < sourceTime;
if (opts.build || stale) {
  if (stale && !opts.build) console.log('ソースが dist より新しいので、作り直します。');
  await build({ root, logLevel: 'warn' });
}
const server = await preview({ root, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
const base = server.resolvedUrls.local[0];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let problems = 0;

async function takeShot(shot) {
  const [w, h] = shot.size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opts.dpr });
  const page = await context.newPage();
  const found = [];
  const log = (kind, text) => found.push(`[${shot.out}] ${kind}: ${text}`);
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log(`console.${m.type()}`, m.text());
  });
  page.on('pageerror', (e) => log('pageerror', e.message));
  page.on('requestfailed', (r) => {
    // ページを閉じるときに打ち切られた要求(Web フォントなど)は問題にしない
    if (r.failure()?.errorText !== 'net::ERR_ABORTED' || r.url().startsWith(base)) log('requestfailed', `${r.url()} ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) log('http', `${r.status()} ${r.url()}`);
  });
  const q = new URLSearchParams(shot.query);
  if (opts.still && !q.has('still')) q.set('still', '1');
  try {
    await page.goto(`${base}?${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    try {
      await page.waitForSelector('html[data-ready="1"], html[data-error]', { timeout: 120000 });
    } catch {
      log('timeout', '描画の準備が整いませんでした');
    }
    const err = await page.evaluate(() => document.documentElement.dataset.error);
    if (err) log('app-error', err);
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(opts.wait);
    // 最後のフレームを描かせてから描画ループを止める(撮影の間に重い描画が走らないように)
    await page.evaluate(() => window.__app?.pause?.());
    mkdirSync(dirname(shot.out), { recursive: true });
    await page.screenshot({ path: shot.out, timeout: 120000 });
    console.log(`${shot.out}  ${shot.size}  ?${q}`);
  } finally {
    await page.evaluate(() => window.__app?.dispose?.()).catch(() => {});
    await context.close().catch(() => {});
  }
  return found;
}

try {
  for (const shot of shots) {
    let found;
    try {
      found = await takeShot(shot);
    } catch (e) {
      const first = `[${shot.out}] 撮影に失敗しました(撮り直します): ${e.message}`;
      try {
        found = [first, ...(await takeShot(shot))];
      } catch (e2) {
        found = [first, `[${shot.out}] 撮り直しにも失敗しました: ${e2.message}`];
      }
    }
    for (const line of found) console.error(line);
    problems += found.length;
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
if (problems) {
  console.error(`問題が ${problems} 件ありました。`);
  process.exit(1);
}
