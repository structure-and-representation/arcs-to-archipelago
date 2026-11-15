import { createRequire } from 'node:module';
const SRC = '/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/oblique-study/src';
const require = createRequire(SRC + '/package.json');
export const { chromium } = require('playwright');
const { preview } = await import(SRC + '/node_modules/vite/dist/node/index.js');
export async function start() {
  const server = await preview({ root: SRC, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
  const base = server.resolvedUrls.local[0];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  return { base, browser, close: async () => { await browser.close(); server.httpServer.close(); } };
}
export async function openPage(env, query, [w, h], dpr = 1) {
  const context = await env.browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto(`${env.base}?${query}&still=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('html[data-ready="1"], html[data-error]', { timeout: 120000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
  return { page, close: async () => { await page.evaluate(() => window.__app?.dispose?.()).catch(() => {}); await context.close(); } };
}
// 定位置の上書きを適用して再描画
export async function applyPresets(page, presets) {
  await page.evaluate((p) => { globalThis.__forceView = null; globalThis.__studyPresets = p; window.__app.rig.reset(); }, presets);
  await page.waitForTimeout(700);
}
