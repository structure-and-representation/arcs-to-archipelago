#!/usr/bin/env node
// 紙と墨の質感の演出の、前後の比較画像を撮る(docs/screenshots/paper-ink/)。npm test の対象外。
//
//   node tools/verify/paper-ink-compare.mjs --before <前の版の dist> --out <dir> [--only 名前,名前] [--after <dist>]
//
// 前の版の dist は、比べたいコミットを別の作業ツリーで vite build して作る(例: git worktree add ../base <commit>)。
// 後の版は、この作業ツリーの dist(なければ作る)。同じ URL・同じ大きさ・同じ DPR で撮り、
// 左に前、右に後を並べた 1 枚にする。still=1(時間と乱数を固定)で撮るので、差は演出の差だけになる。
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const args = process.argv.slice(2);
const opt = { before: null, after: resolve(root, 'dist'), out: resolve(root, 'docs/screenshots/paper-ink'), only: null, build: true };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--before') opt.before = resolve(args[++i]);
  else if (a === '--after') { opt.after = resolve(args[++i]); opt.build = false; }
  else if (a === '--out') opt.out = resolve(args[++i]);
  else if (a === '--only') opt.only = args[++i].split(',');
  else throw new Error(`不明な引数: ${a}`);
}
if (!opt.before) throw new Error('--before <dist> を指定してください');

// 比べる場面。clip は CSS px(撮影は DPR 2 で、質感が潰れない大きさで見る)
const SCENES = [
  // 紙の地と文字(章の本文と地の繊維・むら)
  { name: 'paper', query: 'ch=0&cam=oblique', size: [1440, 900], clip: [0, 330, 720, 330] },
  // 陸地のむらと、にじんだ海岸線(九州〜中国)
  { name: 'land', query: 'sel=tokyo&cam=top', size: [1440, 900], clip: [520, 380, 520, 380] },
  // 弧の入りと抜き、かすれ(真横)
  { name: 'arcs-side', query: 'ch=0&cam=side', size: [1440, 900], clip: [420, 250, 560, 330] },
  // 地上の実線と地下の破線(選択時の斜め)
  { name: 'arcs-oblique', query: 'sel=tokyo&cam=oblique', size: [1440, 900], clip: [430, 330, 560, 320] },
  // 粒子(全国の斜め、本州の芯)
  { name: 'particles', query: 'ch=0&cam=oblique', size: [1440, 900], clip: [940, 400, 300, 200] },
  // 朱(選択地域の点、ラベル、読み出し)
  { name: 'accent', query: 'sel=osaka&cam=top', size: [1440, 900], clip: [880, 90, 520, 300] },
  // 文字と罫線(読み出しと年の切り替え)
  { name: 'rules', query: 'sel=tokyo&cam=oblique', size: [1440, 900], clip: [1150, 90, 270, 250] },
];
const THEMES = ['paper', 'ink'];

if (opt.build) await build({ root, logLevel: 'warn' });
const serve = async (outDir) =>
  preview({ root, logLevel: 'warn', build: { outDir }, preview: { port: 0, host: '127.0.0.1', open: false } });
const servers = { before: await serve(opt.before), after: await serve(opt.after) };
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function shoot(which, scene, theme) {
  const [w, h] = scene.size;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${which} ${scene.name} ${theme}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => console.error(`[${which} ${scene.name} ${theme}] ${e.message}`));
  try {
    const base = servers[which].resolvedUrls.local[0];
    await page.goto(`${base}?${scene.query}&theme=${theme}&still=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('html[data-ready="1"], html[data-error]', { timeout: 120000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__app?.pause?.());
    const [x, y, cw, ch] = scene.clip;
    return await page.screenshot({ clip: { x, y, width: cw, height: ch } });
  } finally {
    await page.evaluate(() => window.__app?.dispose?.()).catch(() => {});
    await context.close().catch(() => {});
  }
}

// 2 枚を左右に並べる(間に 8px の白)。ブラウザの canvas で合成する
async function sideBySide(a, b, theme) {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  const data = await page.evaluate(
    async ({ a, b, dark }) => {
      const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/png;base64,${s}`; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const gap = 8, label = 28;
      const c = document.createElement('canvas');
      c.width = ia.width + gap + ib.width;
      c.height = Math.max(ia.height, ib.height) + label;
      const g = c.getContext('2d');
      g.fillStyle = dark ? '#000' : '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = dark ? '#ccc' : '#333';
      g.font = '18px sans-serif';
      g.fillText('before', 6, 20);
      g.fillText('after', ia.width + gap + 6, 20);
      g.drawImage(ia, 0, label);
      g.drawImage(ib, ia.width + gap, label);
      return c.toDataURL('image/png').split(',')[1];
    },
    { a: a.toString('base64'), b: b.toString('base64'), dark: theme === 'ink' },
  );
  await context.close();
  return Buffer.from(data, 'base64');
}

mkdirSync(opt.out, { recursive: true });
try {
  for (const scene of SCENES) {
    if (opt.only && !opt.only.includes(scene.name)) continue;
    for (const theme of THEMES) {
      const a = await shoot('before', scene, theme);
      const b = await shoot('after', scene, theme);
      const file = resolve(opt.out, `${scene.name}-${theme}.png`);
      writeFileSync(file, await sideBySide(a, b, theme));
      console.log(file);
    }
  }
} finally {
  await browser.close();
  for (const s of Object.values(servers)) s.httpServer.close();
}
