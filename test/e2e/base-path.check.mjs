#!/usr/bin/env node
// 末尾スラッシュなしの URL(例: /works/arcs)で dist を配信したとき、資産とデータの読み込みが 404 にならないことを確かめる。
//   node test/e2e/base-path.check.mjs   (dist がなければ先に npm run build)
// 配信: /works/arcs と /works/arcs/ は dist/index.html を返し(転送しない)、/works/arcs/<path> は dist/<path> を返す。
// それ以外の要求は 404。ページの読み込みで 400 以上の応答、読み込みの失敗、コンソールのエラーがあれば終了コード 1。
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('dist がありません。先に npm run build を実行してください。');
  process.exit(2);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.topojson': 'application/json' };
const PREFIX = '/works/arcs';
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = null;
  if (path === PREFIX || path === `${PREFIX}/`) file = resolve(dist, 'index.html');
  else if (path.startsWith(`${PREFIX}/`)) file = resolve(dist, `.${path.slice(PREFIX.length)}`);
  if (!file || !file.startsWith(dist) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let problems = 0;
try {
  for (const path of [PREFIX, `${PREFIX}/`]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const bad = (m) => {
      problems++;
      console.error(`[${path}] ${m}`);
    };
    page.on('response', (r) => {
      if (r.url().startsWith(base) && r.status() >= 400) bad(`${r.status()} ${r.url()}`);
    });
    page.on('requestfailed', (r) => {
      if (r.url().startsWith(base)) bad(`requestfailed ${r.url()} ${r.failure()?.errorText}`);
    });
    page.on('console', (m) => {
      if (m.type() === 'error') bad(`console.error ${m.text()}`);
    });
    page.on('pageerror', (e) => bad(`pageerror ${e.message}`));
    await page.goto(`${base}${path}?still=1`);
    await page.waitForSelector('html[data-ready="1"], html[data-error]', { timeout: 60000 });
    const err = await page.evaluate(() => document.documentElement.dataset.error);
    if (err) bad(`data-error=${err}`);
    console.log(`${path}: ${err ? 'NG' : 'ok'}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (problems) {
  console.error(`問題が ${problems} 件ありました。`);
  process.exit(1);
}
console.log('末尾スラッシュの有無に関わらず、資産とデータを読み込めました。');
