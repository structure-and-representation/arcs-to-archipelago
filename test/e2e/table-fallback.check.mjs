#!/usr/bin/env node
// 数値の表と Canvas 2D の代替表示を、実際のブラウザ(Playwright の Chromium)で確かめて撮影する。
//   npm run build && node test/e2e/table-fallback.check.mjs [--out docs/screenshots/table-fallback]
// vitest の対象ではない(`*.check.mjs`)。失敗があれば終了コード 1。
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outIdx = process.argv.indexOf('--out');
const outDir = resolve(root, outIdx > 0 ? process.argv[outIdx + 1] : 'docs/screenshots/table-fallback');
mkdirSync(outDir, { recursive: true });

const server = await preview({ root, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
const base = server.resolvedUrls.local[0];

// WebGL を使える起動(shot.mjs と同じ)と、GPU と WebGL を無効にした起動
const withGl = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const noGl = await chromium.launch({ args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });

let failures = 0;
const ok = (cond, msg) => {
  if (!cond) {
    failures++;
    console.error(`NG  ${msg}`);
  } else console.log(`ok  ${msg}`);
};

async function open(browser, query, size, { expectFallback = false } = {}) {
  const [w, h] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'ja-JP' });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    // WebGL2 を作れなかったときに three.js と main.js が出す想定内のメッセージだけを除く
    if (expectFallback && /WebGL|webgl/.test(m.text())) return;
    // この検査スクリプト自身の getImageData の読み出しへの警告
    if (/willReadFrequently/.test(m.text())) return;
    problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`http ${r.status()} ${r.url()}`));
  await page.goto(`${base}?${query}&still=1`);
  await page.waitForSelector('html[data-ready="1"], html[data-error]', { timeout: 60000 });
  await page.waitForTimeout(300);
  return { page, problems };
}

const shot = (page, name) => page.screenshot({ path: resolve(outDir, name) });

// ---- 0. WebGL2 が本当に無効か ----
{
  const { page } = await open(noGl, 'year=2014', '1440x900', { expectFallback: true });
  const gl2 = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  ok(!gl2, 'WebGL2 を無効にした Chromium では webgl2 コンテキストが作れない');
  ok(await page.evaluate(() => document.documentElement.dataset.fallback === '2d'), '<html data-fallback="2d"> が付く');
  await page.close();
}

// ---- 1. 代替表示 ----
const inkPixels = (page) =>
  page.evaluate(() => {
    const c = document.getElementById('stage');
    const g = c.getContext('2d');
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
    let n = 0;
    let sum = 0;
    const rows = new Set();
    for (let i = 3, p = 0; i < data.length; i += 4, p++) {
      if (data[i] > 0) {
        n++;
        sum += data[i];
        rows.add(Math.floor(p / width));
      }
    }
    return { n, sum, rows: rows.size, width, height };
  });

for (const [size, tag] of [['1440x900', '1440x900'], ['390x844', '390x844']]) {
  for (const [query, name] of [['year=2014', 'national'], ['year=2014&sel=tokyo', 'tokyo']]) {
    const { page, problems } = await open(noGl, query, size, { expectFallback: true });
    const info = await inkPixels(page);
    ok(info.n > 5000, `[${name} ${tag}] 代替表示の図が描かれている(インクの画素 ${info.n})`);
    const notice = await page.evaluate(() => {
      const n = document.querySelector('.fallback-notice');
      const r = n?.getBoundingClientRect();
      return n ? { text: n.textContent, w: r.width, h: r.height, vis: getComputedStyle(n).display !== 'none' } : null;
    });
    ok(notice?.vis && /WebGL2/.test(notice.text) && /この作品は表示できません/.test(notice.text), `[${name} ${tag}] 案内文が出ている`);
    ok(problems.length === 0, `[${name} ${tag}] コンソールにエラーがない ${problems.join(' | ')}`);
    await shot(page, `fallback-${name}-${tag}.png`);

    if (name === 'tokyo' && tag === '1440x900') {
      // 都道府県のラベルは別の担当の部品。project(i) が点の位置と一致することを、仮の札で目で確かめる
      await page.evaluate(() => {
        const { renderer, data } = window.__app;
        const layer = document.createElement('div');
        layer.id = 'verify-labels';
        layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3';
        for (let i = 0; i < 47; i++) {
          const [x, y] = renderer.project(i);
          const s = document.createElement('span');
          s.textContent = data.prefectures[i].ja.replace(/[都道府県]$/, '') || data.prefectures[i].ja;
          s.style.cssText = `position:absolute;left:${x}px;top:${y + 8}px;transform:translateX(-50%);writing-mode:vertical-rl;font:11px sans-serif;color:var(--fg-2)`;
          if (i === 12) s.style.color = 'var(--accent)';
          layer.append(s);
        }
        document.body.append(layer);
      });
      await shot(page, 'fallback-tokyo-1440x900-project-check.png');
    }
    await page.close();
  }
}

// 年・選択・テーマの切り替えが効く
{
  const { page, problems } = await open(noGl, 'year=2014', '1440x900', { expectFallback: true });
  const a = await inkPixels(page);
  await page.evaluate(() => window.__app.store.set({ selection: { type: 'pref', code: 13 } }));
  await page.waitForTimeout(300);
  const b = await inkPixels(page);
  ok(b.sum !== a.sum && b.n < a.n, `選択すると図が変わる(画素 ${a.n} → ${b.n})`);
  await page.evaluate(() => window.__app.store.set({ selection: null, year: 2020 }));
  await page.waitForTimeout(300);
  const c = await inkPixels(page);
  ok(c.sum !== a.sum && c.n > b.n, `年を変えると図が変わる(画素 ${a.n} → ${c.n})`);
  const cssBefore = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gl-fg').trim());
  await page.evaluate(() => window.__app.store.set({ theme: 'ink' }));
  await page.waitForTimeout(300);
  const rgb = await page.evaluate(() => {
    const cv = document.getElementById('stage');
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] > 20) return [data[i - 3], data[i - 2], data[i - 1]];
    return null;
  });
  ok(rgb && rgb[0] > 200, `ダークテーマでは紙の色で描く(${cssBefore} → ${rgb})`);
  await page.evaluate(() => window.__app.store.set({ lang: 'en' }));
  const text = await page.evaluate(() => document.querySelector('.fallback-notice').textContent);
  ok(/This piece can't be shown here/.test(text) && /Show the numbers/.test(text), '英語に切り替えると案内文も英語になる');
  // 画面の大きさの変化
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const pts = await page.evaluate(() => [window.__app.renderer.project(0), window.__app.renderer.project(46)]);
  ok(Math.abs(pts[0][0] - pts[1][0]) < 1e-6 && pts[0][1] < pts[1][1], `画面を縦長にすると並びが縦になる ${JSON.stringify(pts)}`);
  const resized = await page.evaluate(() => {
    const c = document.getElementById('stage');
    return [c.width, c.height, c.clientWidth, c.clientHeight, devicePixelRatio];
  });
  ok(resized[0] === Math.round(resized[2] * Math.min(resized[4], 2)), `キャンバスの描画バッファが画面に追従する ${resized}`);
  ok(problems.length === 0, `切り替えのあいだ、コンソールにエラーがない ${problems.join(' | ')}`);
  await page.close();
}

// ---- 2. 数値の表(WebGL あり) ----
async function openTable(page) {
  await page.click('#table > summary');
  await page.waitForSelector('dialog.table-dialog[open]');
  await page.waitForTimeout(200);
}

for (const theme of ['paper', 'ink']) {
  for (const [size, tag] of [['1440x900', '1440x900'], ['390x844', '390x844']]) {
    for (const [query, name] of [['year=2014', 'national'], ['year=2014&sel=tokyo', 'tokyo']]) {
      const { page, problems } = await open(withGl, `${query}&theme=${theme === 'ink' ? 'ink' : 'paper'}`, size);
      await openTable(page);
      const info = await page.evaluate(() => {
        const rows = document.querySelectorAll('dialog.table-dialog tbody.table-rows tr');
        const sel = document.querySelector('dialog.table-dialog tr.sel');
        const head = document.querySelector('.table-heading').textContent;
        const cell = rows[0].querySelector('td');
        const th = document.querySelector('dialog.table-dialog thead th:nth-child(2)');
        const rc = cell.getBoundingClientRect();
        const rh = th.getBoundingClientRect();
        const tnum = getComputedStyle(cell).fontVariantNumeric;
        const nameColor = sel ? getComputedStyle(sel.querySelector('th')).color : null;
        return {
          rows: rows.length, head, sel: sel?.textContent.slice(0, 20) ?? null, tnum,
          rightGap: Math.round((rh.right - rc.right) * 10) / 10,
          align: getComputedStyle(cell).textAlign, nameColor, focus: document.activeElement.className,
          focusInDialog: document.querySelector('dialog.table-dialog').contains(document.activeElement),
        };
      });
      if (theme === 'paper') {
        ok(info.rows === (name === 'national' ? 47 : 43), `[表 ${name} ${tag}] 行数 ${info.rows}`);
        ok(/tabular-nums/.test(info.tnum), `[表 ${name} ${tag}] 数字は等幅(${info.tnum})`);
        ok(info.align === 'right' && Math.abs(info.rightGap) < 0.6, `[表 ${name} ${tag}] 数は右に揃う(見出しとの差 ${info.rightGap}px)`);
        ok(info.focus === 'table-close', `[表 ${name} ${tag}] 開いた直後のフォーカスは「閉じる」`);
        if (name === 'tokyo') ok(info.sel && info.sel.startsWith('東京圏') && info.nameColor !== null, `[表 ${name} ${tag}] 選択中の行は圏の名前 ${info.nameColor}`);
      }
      ok(problems.length === 0, `[表 ${name} ${tag} ${theme}] コンソールにエラーがない ${problems.join(' | ')}`);
      await shot(page, `table-${name}-${tag}-${theme}.png`);
      await page.close();
    }
  }
}

// ---- 3. 数値の表の操作 ----
{
  const { page, problems } = await open(withGl, 'year=2014', '1440x900');
  await openTable(page);
  // 値
  const tokyo = await page.evaluate(() => [...document.querySelectorAll('tbody.table-rows tr')].find((r) => r.dataset.code === '13').innerText.replace(/\s+/g, ' '));
  ok(tokyo === '東京都 404,736 331,456 +73,280', `2014年の東京都の行: ${tokyo}`);
  // 見出し
  const aria0 = await page.evaluate(() => document.querySelector('dialog.table-dialog thead th[aria-sort]')?.dataset.key);
  ok(aria0 === 'pref', `最初の並びは都道府県(aria-sort = ascending)`);
  // 並べ替え: 差引
  await page.click('thead button[data-key="net"]');
  let st = await page.evaluate(() => ({
    sort: document.querySelector('thead th[aria-sort]').getAttribute('aria-sort'),
    key: document.querySelector('thead th[aria-sort]').dataset.key,
    first: document.querySelector('tbody.table-rows tr').innerText.replace(/\s+/g, ' '),
    arrow: document.querySelector('thead th[aria-sort] .table-arrow').textContent,
    n: document.querySelectorAll('thead th[aria-sort]').length,
  }));
  ok(st.sort === 'descending' && st.key === 'net' && st.n === 1 && st.arrow === '↓', `差引を押すと降順 (${JSON.stringify(st)})`);
  ok(st.first === '東京都 404,736 331,456 +73,280', `差引の降順の先頭は東京都 (${st.first})`);
  await page.click('thead button[data-key="net"]');
  st = await page.evaluate(() => ({ sort: document.querySelector('thead th[aria-sort]').getAttribute('aria-sort'), arrow: document.querySelector('thead th[aria-sort] .table-arrow').textContent, first: document.querySelector('tbody.table-rows tr').innerText.replace(/\s+/g, ' ') }));
  ok(st.sort === 'ascending' && st.arrow === '↑', `もう一度押すと昇順 (${st.first})`);
  ok(/^\S+ [\d,]+ [\d,]+ −[\d,]+$/.test(st.first), `負の差引は U+2212 (${st.first})`);
  // 列見出しはボタン、scope=col
  const heads = await page.evaluate(() => [...document.querySelectorAll('thead th')].map((th) => [th.getAttribute('scope'), th.firstElementChild.tagName]));
  ok(heads.every((h) => h[0] === 'col' && h[1] === 'BUTTON'), '列見出しは <th scope="col"> の中の <button>');
  const cap = await page.evaluate(() => document.querySelector('table.data caption').textContent);
  ok(cap === '2014年の都道府県別の移動', `caption: ${cap}`);
  // キーボード: ↓ で行のボタン間を移る
  await page.focus('tbody.table-rows button.pref-btn');
  const first = await page.evaluate(() => document.activeElement.textContent);
  await page.keyboard.press('ArrowDown');
  const second = await page.evaluate(() => document.activeElement.textContent);
  ok(first !== second, `↓ で次の行へ (${first} → ${second})`);
  // 年と言語への追従(開いたまま store を変える)
  await page.evaluate(() => window.__app.store.set({ year: 2021 }));
  await page.waitForTimeout(100);
  const y21 = await page.evaluate(() => [...document.querySelectorAll('tbody.table-rows tr')].find((r) => r.dataset.code === '13').innerText.replace(/\s+/g, ' '));
  const h21 = await page.evaluate(() => document.querySelector('.table-heading').textContent);
  ok(/\+10,815$/.test(y21) && h21 === '2021年 · 都道府県別', `2021年に追従: ${y21} / ${h21}`);
  await page.evaluate(() => window.__app.store.set({ lang: 'en' }));
  const en = await page.evaluate(() => ({ h: document.querySelector('.table-heading').textContent, c: document.querySelector('.table-close').textContent, th: [...document.querySelectorAll('thead th')].map((x) => x.textContent.replace(/[↑↓]/g, '').trim()), first: document.querySelector('tbody.table-rows tr th').textContent }));
  ok(en.h === '2021 · By prefecture' && en.c === 'Close' && en.th.join() === 'Prefecture,In,Out,Net', `英語に切り替わる ${JSON.stringify(en)}`);
  await page.evaluate(() => window.__app.store.set({ lang: 'ja' }));
  // 選択への追従
  await page.evaluate(() => window.__app.store.set({ selection: { type: 'metro', id: 'osaka' } }));
  const osk = await page.evaluate(() => ({ rows: document.querySelectorAll('tbody.table-rows tr').length, sum: document.querySelector('tr.sel')?.innerText.replace(/\s+/g, ' '), h: document.querySelector('.table-heading').textContent }));
  ok(osk.rows === 43 && osk.sum.startsWith('大阪圏') && osk.h === '2021年 · 大阪圏との移動', `選択に追従: ${JSON.stringify(osk)}`);
  await page.evaluate(() => window.__app.store.set({ selection: null }));
  // 行を押すと選択して閉じる
  await page.click('tbody.table-rows button.pref-btn[data-code="27"]');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ sel: window.__app.store.get().selection, open: document.querySelector('dialog.table-dialog').open, focus: document.activeElement.tagName }));
  ok(after.sel?.type === 'pref' && after.sel.code === 27 && !after.open, `行を押すと大阪府を選んで閉じる ${JSON.stringify(after)}`);
  ok(after.focus === 'SUMMARY', '閉じたら、開いたボタンへフォーカスが戻る');
  // Esc で閉じて、フォーカスが戻る
  await page.focus('#table > summary');
  await page.keyboard.press('Enter');
  await page.waitForSelector('dialog.table-dialog[open]');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const esc = await page.evaluate(() => ({ open: document.querySelector('dialog.table-dialog').open, focus: document.activeElement.tagName }));
  ok(!esc.open && esc.focus === 'SUMMARY', `Esc で閉じて、フォーカスが戻る ${JSON.stringify(esc)}`);
  ok(problems.length === 0, `操作のあいだ、コンソールにエラーがない ${problems.join(' | ')}`);
  await page.close();
}

// ---- 4. WebGL2 が使えない環境でも、表が同じように開く ----
{
  const { page, problems } = await open(noGl, 'year=2014', '1440x900', { expectFallback: true });
  await page.click('.fallback-open');
  await page.waitForSelector('dialog.table-dialog[open]');
  const n = await page.evaluate(() => document.querySelectorAll('tbody.table-rows tr').length);
  ok(n === 47, '代替表示の案内のボタンから表が開く');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.activeElement.className === 'fallback-open'), '閉じると案内のボタンへフォーカスが戻る');
  await openTable(page);
  ok((await page.evaluate(() => document.querySelectorAll('tbody.table-rows tr').length)) === 47, '概要の summary からも開く');
  ok(problems.length === 0, `コンソールにエラーがない ${problems.join(' | ')}`);
  await shot(page, 'fallback-table-open-1440x900.png');
  await page.close();
}

await withGl.close();
await noGl.close();
server.httpServer.close();
if (failures) {
  console.error(`\n${failures} 件の失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
