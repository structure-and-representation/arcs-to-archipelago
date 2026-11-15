#!/usr/bin/env node
// 年・地域・カメラ・テーマ・言語の操作を、キーボードだけで確かめる Playwright のテスト。
//   node test/e2e/controls.mjs        (vite build してプレビューサーバを立て、Chromium で確かめる。失敗すると終了コード 1)
// 確かめること: Tab だけで各部品に届く / 操作が URL の引数に反映される / その URL を開き直すと同じ状態になる /
//   テーマの初期値が OS の設定に従う / コンソールにエラーがない。
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { build, preview } from 'vite';

const require = createRequire(import.meta.url); // NODE_PATH のグローバルな playwright を使う
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

let failures = 0;
const problems = [];
const opened = [];
async function openPage(query, { colorScheme = 'light', viewport = { width: 1440, height: 900 } } = {}) {
  // 前に開いたページの描画ループを止める(走り続けると、SwiftShader の描画を奪い合って読み込みが時間切れになる)
  for (const old of opened.splice(0)) await old.evaluate(() => window.__app?.pause?.()).catch(() => {});
  const ctx = await browser.newContext({ viewport, colorScheme, locale: 'ja-JP' });
  const page = await ctx.newPage();
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console.${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?${query}&still=1`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 60000 });
  opened.push(page);
  return page;
}
const state = (page) => page.evaluate(() => window.__app.store.get());
const search = async (page) => {
  await page.waitForTimeout(400); // URL への反映は変化が 250ms 止まってから
  return new URLSearchParams(await page.evaluate(() => location.search));
};
/** Tab だけを押して、match(document.activeElement) が真になる要素までフォーカスを送る。 */
async function tabTo(page, selector, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s), selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab で ${selector} に届きません`);
}
async function test(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.error(`FAIL ${name}\n     ${e.message}`);
  }
}

await test('年: キーボードで切り替わり、URL に反映され、開き直すと同じ年になる', async () => {
  const page = await openPage('lang=ja&year=2014');
  await tabTo(page, '#timeline [role="slider"]');
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).year, 2015);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state(page)).year, 2013);
  await page.keyboard.press('Home');
  assert.equal((await state(page)).year, 2012);
  await page.keyboard.press('PageUp');
  assert.equal((await state(page)).year, 2017);
  await page.keyboard.press('End');
  assert.equal((await state(page)).year, 2025);
  await page.keyboard.press('ArrowRight'); // 端で止まる
  assert.equal((await state(page)).year, 2025);
  await page.keyboard.press('PageDown');
  await page.keyboard.press('ArrowDown');
  assert.equal((await state(page)).year, 2019);
  const slider = page.locator('#timeline [role="slider"]');
  assert.equal(await slider.getAttribute('aria-valuenow'), '2019');
  assert.match(await slider.getAttribute('aria-valuetext'), /^2019年 移動者 [\d,]+人$/);
  const q = await search(page);
  assert.equal(q.get('year'), '2019');
  const again = await openPage(q.toString());
  assert.equal((await state(again)).year, 2019);
});

await test('年: ポインタで列を押す、押したまま動かすと年が順に変わる', async () => {
  const page = await openPage('lang=ja&year=2014');
  const box = await page.locator('#timeline .tl').boundingBox();
  const col = (i) => box.x + (box.width / 14) * (i + 0.5);
  await page.mouse.move(col(10), box.y + 30);
  await page.mouse.down();
  assert.equal((await state(page)).year, 2022);
  await page.mouse.move(col(5), box.y + 30, { steps: 5 });
  assert.equal((await state(page)).year, 2017);
  await page.mouse.up();
});

await test('地域: キーボードだけで一覧を開き、絞り込み、選び、解除できる。URL に反映される', async () => {
  const page = await openPage('lang=ja&year=2014');
  await tabTo(page, '#selector .sel-btn');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#selector .sel-btn').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'combobox');
  await page.keyboard.type('とう');
  const shown = await page.locator('#selector .sel-opt:not([hidden])').allTextContents();
  assert.deepEqual(shown, ['東京圏', '東京']);
  await page.keyboard.press('ArrowDown'); // 東京へ
  assert.match(await page.locator('#selector .sel-input').getAttribute('aria-activedescendant'), /pref-13$/);
  await page.keyboard.press('Enter');
  assert.deepEqual((await state(page)).selection, { type: 'pref', code: 13 });
  assert.equal(await page.evaluate(() => document.activeElement.className), 'sel-btn'); // ボタンへフォーカスが戻る
  assert.equal((await page.locator('#selector .sel-btn .sel-name').textContent()), '東京都');
  let q = await search(page);
  assert.equal(q.get('sel'), '13');
  // 開き直す
  const again = await openPage(q.toString());
  assert.deepEqual((await state(again)).selection, { type: 'pref', code: 13 });
  // 圏を選ぶ(→ 同じ組の中の移動と Home / End)
  await page.keyboard.press('Enter');
  await page.keyboard.type('nago');
  await page.keyboard.press('Enter');
  assert.deepEqual((await state(page)).selection, { type: 'metro', id: 'nagoya' });
  assert.equal((await search(page)).get('sel'), 'nagoya');
  // Esc で選ばずに閉じ、もう一度 Esc で選択を解除する
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#selector .sel-btn').getAttribute('aria-expanded'), 'false');
  assert.deepEqual((await state(page)).selection, { type: 'metro', id: 'nagoya' });
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).selection, null);
  assert.equal((await search(page)).has('sel'), false);
});

await test('地域: ←→ は同じ組の中、Home / End は先頭と末尾を指す', async () => {
  const page = await openPage('lang=ja&year=2014');
  await tabTo(page, '#selector .sel-btn');
  await page.keyboard.press('Enter');
  const active = () => page.locator('#selector .sel-opt.is-active').textContent();
  assert.equal(await active(), '全国');
  await page.keyboard.press('ArrowDown');
  assert.equal(await active(), '東京圏');
  await page.keyboard.press('ArrowRight');
  assert.equal(await active(), '名古屋圏');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); // 組の端で止まる
  assert.equal(await active(), '大阪圏');
  await page.keyboard.press('End');
  assert.equal(await active(), '沖縄');
  await page.keyboard.press('Home');
  assert.equal(await active(), '全国');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#selector .sel-btn').getAttribute('aria-expanded'), 'false');
});

await test('カメラ: Tab はグループに1回だけ止まり、←→ で移動し、Enter で切り替わる。URL に反映される', async () => {
  const page = await openPage('lang=ja&year=2014');
  await tabTo(page, '#controls .ctl-cam');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.camera), 'side');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.camera), 'oblique');
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).camera, 'oblique');
  assert.equal(await page.locator('#controls .ctl-cam[data-camera="oblique"]').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).camera, 'top');
  const q = await search(page);
  assert.equal(q.get('cam'), 'top');
  const again = await openPage(q.toString());
  assert.equal((await state(again)).camera, 'top');
  assert.equal(await again.locator('#controls .ctl-cam[data-camera="top"]').getAttribute('aria-pressed'), 'true');
  // Tab を1回押すとグループの外へ出る
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('.ctl-camera')), false);
});

await test('言語とテーマ: キーボードで切り替わり、html の属性と URL に反映され、開き直すと同じになる', async () => {
  const page = await openPage('year=2014', { colorScheme: 'light' });
  await page.evaluate(() => window.__app.store.set({ lang: 'ja' }));
  await tabTo(page, '.ctl-lang [data-value="en"]');
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).lang, 'en');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.match(await page.locator('#selector .sel-btn').textContent(), /All of Japan/);
  assert.equal(await page.locator('#controls .ctl-camera').getAttribute('aria-label'), 'View');
  await tabTo(page, '.ctl-theme [data-value="ink"]');
  await page.keyboard.press('Space');
  assert.equal((await state(page)).theme, 'ink');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'ink');
  const q = await search(page);
  assert.equal(q.get('lang'), 'en');
  assert.equal(q.get('theme'), 'ink');
  const again = await openPage(q.toString());
  const s = await state(again);
  assert.equal(s.lang, 'en');
  assert.equal(s.theme, 'ink');
  assert.equal(await again.evaluate(() => document.documentElement.dataset.theme), 'ink');
  // 紙へ戻す
  await again.focus('.ctl-theme [data-value="paper"]');
  await again.keyboard.press('Enter');
  assert.equal(await again.evaluate(() => document.documentElement.dataset.theme), 'paper');
});

await test('テーマの初期値は OS の設定に従い、URL の theme があればそれを優先する', async () => {
  const dark = await openPage('lang=ja', { colorScheme: 'dark' });
  assert.equal((await state(dark)).theme, 'ink');
  assert.equal(await dark.evaluate(() => document.documentElement.dataset.theme), 'ink');
  const light = await openPage('lang=ja', { colorScheme: 'light' });
  assert.equal((await state(light)).theme, 'paper');
  const forced = await openPage('lang=ja&theme=paper', { colorScheme: 'dark' });
  assert.equal((await state(forced)).theme, 'paper');
});

await test('縦画面: 言語とテーマは反対側のボタンだけが見え、押すと切り替わる。年と読み出しの要約が出る', async () => {
  const page = await openPage('lang=ja&year=2014&sel=tokyo', { viewport: { width: 390, height: 844 } });
  assert.deepEqual(await page.locator('.ctl-lang .ctl-tbtn:visible').allTextContents(), ['EN']);
  assert.deepEqual(await page.locator('.ctl-theme .ctl-tbtn:visible').allTextContents(), ['墨']);
  assert.equal((await page.locator('.sel-sum-sel').innerText()).replace(/\s+/g, ' '), '転入 46.9万 転出 35.9万 差引 +10.9万');
  await page.locator('.ctl-lang .ctl-tbtn:visible').click();
  assert.equal((await state(page)).lang, 'en');
  assert.deepEqual(await page.locator('.ctl-lang .ctl-tbtn:visible').allTextContents(), ['日本語']);
  assert.equal((await page.locator('.sel-sum-sel').innerText()).replace(/\s+/g, ' '), 'In 469k Out 359k Net +109k');
  assert.equal(await page.locator('#timeline .tl-yr').first().innerText(), '12');
});

await test('読み出し: 年を変えると数が変わる(全国は総数、地域は転入・転出・差引)', async () => {
  const page = await openPage('lang=ja&year=2014');
  assert.equal(await page.locator('.sel-all .sel-big .sel-v').textContent(), '2,259,688');
  await page.evaluate(() => window.__app.store.set({ year: 2025, selection: { type: 'metro', id: 'osaka' } }));
  const dd = await page.locator('.sel-dl dd .sel-v').allTextContents();
  assert.equal(dd[2], '+7,503');
  await page.locator('.sel-back').click();
  assert.equal((await state(page)).selection, null);
});

await browser.close();
server.httpServer.close();
if (problems.length) {
  failures++;
  console.error(`コンソールの問題 ${problems.length} 件:\n${[...new Set(problems)].join('\n')}`);
}
console.log(failures ? `\n${failures} 件失敗` : '\nすべて成功');
process.exit(failures ? 1 : 0);
