// 章の本文の見せ方の撮影と検算(Playwright)。vite preview を立てて、ページを上から下までスクロールして撮る。
//   node docs/screenshots/chapters-one-card/shoot.mjs [--out DIR] [--only 1440x900,390x844] [--variants] [--no-shots]
// 位置(章ごと): start(章の先頭)/ switch(場面の切り替わりの途中)/ mid(章の途中)/ bound(次の章との境の手前)/ xfade(境を越えて 0.25 秒後)/ end(ページの最後)。
// 各位置で、見えているカードの数と、カードが上の帯・目次・凡例・ドックと重なっていないかを数える。
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(resolve(root, 'package.json'));
const { chromium } = require('playwright');
const { build, preview } = await import(resolve(root, 'node_modules/vite/dist/node/index.js'));

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const outDir = resolve(opt('--out', resolve(root, 'docs/screenshots/chapters-one-card')));
const only = opt('--only', '1440x900,1024x768,390x844,360x640').split(',');
const variants = args.includes('--variants');
const noShots = args.includes('--no-shots');
mkdirSync(outDir, { recursive: true });

if (!args.includes('--no-build')) await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const wait = (page, ms) => page.waitForTimeout(ms);
let problems = 0;
const rows = [];

async function run({ w, h, lang, theme, positions }) {
  const portrait = w < 1024;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (['error'].includes(m.type())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${base}?still=1&lang=${lang}&theme=${theme}`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 90000 });
  await wait(page, 500);
  const geo = await page.evaluate(() => [...document.querySelectorAll('.chapter')].map((e) => { const r = e.getBoundingClientRect(); return { top: r.top + scrollY, height: r.height }; }));
  const ratio = portrait ? 0.3 : 0.5;
  const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const steps = [2, 3, 3, 3, 4];
  const tag = `${w}x${h}-${lang}-${theme}`;
  const yFor = (c, frac) => Math.round(geo[c].top + geo[c].height * frac - h * ratio);
  const list = [];
  for (let c = 0; c < 5; c++) {
    const n = steps[c];
    const all = {
      start: [c, 0.02], // 章の先頭(前の章との境を越えた直後)
      switch: [c, 1 / n + 0.02], // 場面の切り替わりの途中
      mid: [c, 0.5],
      bound: [c, 1 - 30 / geo[c].height], // 次の章との境の手前(最後の章は「end」)
    };
    for (const [k, [cc, f]] of Object.entries(all)) {
      if (k === 'bound' && c === 4) continue;
      if (positions && !positions(c, k)) continue;
      list.push({ name: `c${c + 1}-${k}`, y: Math.min(maxY, Math.max(0, yFor(cc, f))) });
    }
    if (c === 0 && (!positions || positions(0, 'xfade'))) list.push({ name: 'c1-xfade', y: yFor(1, 30 / geo[1].height), quick: true }); // 境を越えて 0.25 秒後(入れ替わりの途中)
  }
  if (!positions || positions(4, 'end')) list.push({ name: 'end', y: maxY });
  for (const p of list) {
    await page.evaluate((y) => window.scrollTo(0, y), p.y);
    await wait(page, p.quick ? 250 : p.name.endsWith('switch') ? 900 : 1100);
    const r = await page.evaluate(() => {
      const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const cards = [...document.querySelectorAll('.chapter-card')].map((el) => { const cs = getComputedStyle(el); return { el, op: +cs.opacity, vis: cs.visibility }; });
      const shown = cards.filter((c) => c.op > 0.02 && c.vis === 'visible');
      const card = shown[0]?.el;
      const cur = document.querySelector('.chapter[data-current]')?.dataset.chapter;
      const vis = (sel) => { const e = document.querySelector(sel); return e && getComputedStyle(e).display !== 'none' ? rect(e) : null; };
      return {
        shown: shown.length, cur, st: window.__app.store.get().chapter, opacity: shown[0]?.op,
        card: rect(card), h2: card ? card.querySelector('h2').textContent : '',
        toc: vis('.toc'), legend: vis('#legend'), mast: vis('#masthead'), dock: vis('#dock'), prog: vis('.progress'),
        scene: (({ year, selection, camera }) => ({ year, sel: selection && (selection.id ?? selection.code), camera }))(window.__app.store.get()),
      };
    });
    const issues = [];
    if (r.shown !== 1 && !p.quick) issues.push(`カード ${r.shown} 枚`);
    if (String(r.st) !== r.cur) issues.push(`章 ${r.st} と data-current ${r.cur} が違う`);
    const hit = (a, b) => a && b && a.x < b.r && a.r > b.x && a.y < b.b && a.b > b.y;
    if (r.card) {
      const c = r.card;
      if (!portrait) {
        if (c.y < (r.toc?.b ?? 0)) issues.push(`目次(下端 ${Math.round(r.toc.b)})に重なる: カード上端 ${Math.round(c.y)}`);
        if (c.y < 72) issues.push('上の帯に重なる');
        const lg = r.legend && { x: r.legend.x, r: r.legend.r, y: r.legend.y, b: r.legend.b };
        if (hit(c, lg)) issues.push(`凡例(上端 ${Math.round(r.legend.y)})に重なる: カード下端 ${Math.round(c.b)}`);
      } else {
        if (p.name.endsWith('start')) {
          // 章の先頭のカード(現れた位置)は、上の帯・章の位置の表示とドックの間に収まる。通り過ぎたあと(mid)は画面の外でよい。
        }
        if (hit(c, r.dock) && c.y < r.dock.y) issues.push(`ドック(上端 ${Math.round(r.dock.y)})に重なる: カード下端 ${Math.round(c.b)}`);
        if (c.h > h * 0.4) issues.push(`カードが高さの ${Math.round((c.h / h) * 100)}%`);
      }
    }
    rows.push({ tag, pos: p.name, y: p.y, ...r, issues });
    console.log(`${issues.length ? 'NG' : 'ok'} ${tag} ${p.name} y=${p.y} cards=${r.shown} ch=${r.st} card=${r.card ? `${Math.round(r.card.y)}-${Math.round(r.card.b)} (${Math.round((r.card.h / h) * 100)}%)` : '-'} scene=${JSON.stringify(r.scene)} ${issues.join(' / ')}`);
    problems += issues.length ? 1 : 0;
    if (!noShots) await page.screenshot({ path: resolve(outDir, `${tag}-${p.name}.jpg`), type: 'jpeg', quality: 72 });
  }
  if (errs.length) { console.log('  console errors:', errs.slice(0, 3)); problems++; }
  await page.close();
}

for (const vp of only) {
  const [w, h] = vp.split('x').map(Number);
  await run({ w, h, lang: 'ja', theme: 'paper' });
}
if (variants) {
  const keep = (c, k) => (c === 0 && k === 'start') || (c === 1 && k === 'start') || (c === 4 && (k === 'mid' || k === 'end'));
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await run({ w, h, lang: 'en', theme: 'paper', positions: keep });
    await run({ w, h, lang: 'ja', theme: 'ink', positions: keep });
    await run({ w, h, lang: 'en', theme: 'ink', positions: (c, k) => c === 1 && k === 'mid' });
  }
}
await browser.close();
server.httpServer.close();
console.log(problems ? `\n${problems} 件 NG` : '\nすべて ok');
process.exit(problems ? 1 : 0);
