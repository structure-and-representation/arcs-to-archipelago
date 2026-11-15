// 章のスクロール連動の確認(Playwright)。node <このファイル> [desktop|mobile]
import { createRequire } from 'node:module';
const { build, preview } = await import('/home/user/arcs-to-archipelago/node_modules/vite/dist/node/index.js');
const require = createRequire('/home/user/arcs-to-archipelago/package.json');
const { chromium } = require('playwright');
const { chapters: COPY } = await import('/home/user/arcs-to-archipelago/docs/copy/chapters.js');
const root = '/home/user/arcs-to-archipelago';
await build({ root, logLevel: 'warn' });
const server = await preview({ root, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
const base = server.resolvedUrls.local[0];
const mode = process.argv[2] || 'desktop';
const viewport = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  NG', msg); } else console.log('  ok', msg); };

const sel = (s) => (s ? (s.type === 'metro' ? { type: 'metro', id: s.id } : { type: 'pref', code: Number(s.code) }) : null);
async function open(query, opts = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, ...opts });
  const errs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${base}?${query}`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 60000 });
  await page.waitForTimeout(300);
  page.errs = errs;
  return page;
}
const state = (page) => page.evaluate(() => { const s = window.__app.store.get(); return { chapter: s.chapter, year: s.year, selection: s.selection, camera: s.camera, lang: s.lang }; });
const geom = (page) => page.evaluate(() => [...document.querySelectorAll('.chapter')].map((e) => { const r = e.getBoundingClientRect(); return { top: r.top + scrollY, height: r.height }; }));
const settle = (page, ms = 350) => page.waitForTimeout(ms);

// ---- 1. 各場面で state が確定稿どおり ----
console.log(`[${mode}] 1. スクロールで場面ごとに state が切り替わる`);
{
  const page = await open('lang=ja&still=1');
  const s0 = await state(page);
  ok(s0.chapter === 0 && s0.year === COPY[0].steps[0].year && s0.selection === null && s0.camera === COPY[0].steps[0].camera, `はじめは 0章0場面 ${JSON.stringify(s0)}`);
  const g = await geom(page);
  const vh = viewport.height;
  for (let c = 0; c < COPY.length; c++) {
    const n = COPY[c].steps.length;
    for (let k = 0; k < n; k++) {
      const anchor = g[c].top + ((k + 0.5) / n) * g[c].height;
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(anchor - vh * 0.5));
      const want = COPY[c].steps[k];
      await page.waitForFunction(([c, w]) => { const s = window.__app.store.get(); return s.chapter === c && s.year === w.year && s.camera === w.camera; }, [c, want], { timeout: 4000 }).catch(() => {});
      const s = await state(page);
      ok(s.chapter === c && s.year === want.year && s.camera === want.camera && JSON.stringify(s.selection) === JSON.stringify(sel(want.selection)),
        `章${c + 1} 場面${k + 1}: ${JSON.stringify(s)} == ${JSON.stringify({ y: want.year, sel: sel(want.selection), cam: want.camera })}`);
    }
  }
  ok(page.errs.length === 0, `コンソールにエラーなし ${page.errs.join('|')}`);
  await page.close();
}

// ---- 2. 連続スクロールで、カメラは場面の境で一度だけ動く(書き込み回数を数える) ----
console.log(`[${mode}] 2. 連続スクロール: 書き込みは場面の境だけ`);
{
  const page = await open('lang=ja&still=1');
  await page.evaluate(() => {
    window.__log = [];
    window.__app.store.subscribe((s, ch) => window.__log.push({ y: scrollY, ch: ch.filter((k) => k !== 'morph'), camera: s.camera, year: s.year, chapter: s.chapter }));
  });
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= total; y += 40) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); }
  await page.waitForTimeout(300);
  const log = (await page.evaluate(() => window.__log)).filter((e) => e.ch.length);
  const cameraWrites = log.filter((e) => e.ch.includes('camera')).length;
  // 期待: 場面の並びで camera が変わる回数(0:side→oblique の 1 回だけ。以降は oblique のまま)
  const seq = COPY.flatMap((c) => c.steps.map((s) => s.camera));
  const expectCam = seq.filter((c, i) => i > 0 && c !== seq[i - 1]).length;
  ok(cameraWrites === expectCam, `camera の書き込み ${cameraWrites} 回 == 期待 ${expectCam} 回`);
  const sceneWrites = log.filter((e) => e.ch.includes('chapter') || e.ch.includes('year')).length;
  ok(log.length <= 14, `state 書き込みは場面数(13)+αのみ: ${log.length} 回`);
  const years = log.map((e) => e.year);
  console.log('   years:', years.join(','));
  await page.close();
}

// ---- 3. 目次から章へ移る ----
if (mode === 'desktop') {
  console.log(`[${mode}] 3. 目次から章へ移る`);
  const page = await open('lang=ja&still=1');
  await page.evaluate(() => { window.__log = []; window.__app.store.subscribe((s, ch) => window.__log.push({ y: Math.round(scrollY), ch: ch.filter((k) => k !== 'morph'), chapter: s.chapter, year: s.year })); });
  for (const c of [3, 1, 4, 0, 2]) {
    await page.evaluate(() => { window.__log.length = 0; });
    await page.click(`.toc li:nth-child(${c + 1}) a`);
    await page.waitForFunction((c) => window.__app.store.get().chapter === c, c, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const s = await state(page);
    const want = COPY[c].steps[0];
    const log = (await page.evaluate(() => window.__log)).filter((e) => e.ch.length);
    ok(s.chapter === c && s.year === want.year && s.camera === want.camera, `目次 ${c + 1} → 章${s.chapter + 1} 年${s.year} ${s.camera}`);
    ok(log.length <= 1, `移動中の章の場面は書かない(書き込み ${log.length} 回 ${JSON.stringify(log)})`);
    const cur = await page.evaluate(() => document.querySelector('.toc a[aria-current="step"]')?.textContent);
    ok(cur?.startsWith(`0${c + 1}`), `目次の現在の章 = ${cur}`);
  }
  await page.close();
}

// ---- 4. 自由探索で読者の操作が保たれる ----
console.log(`[${mode}] 4. 自由探索: 読者の操作を上書きしない`);
{
  const page = await open('lang=ja&still=1');
  const g = await geom(page);
  const vh = viewport.height;
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(g[4].top));
  await settle(page, 400);
  ok((await state(page)).chapter === 4, '第5章に入る');
  await page.evaluate(() => window.__app.store.set({ year: 2018, selection: { type: 'pref', code: 13 }, camera: 'top' }));
  await settle(page, 100);
  for (const dy of [60, 200, 90, -150, 400]) {
    await page.evaluate((d) => window.scrollBy(0, d), dy);
    await settle(page, 150);
  }
  const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.evaluate((y) => window.scrollTo(0, y), maxY);
  await settle(page, 200);
  const s = await state(page);
  ok(s.chapter === 4 && s.year === 2018 && s.camera === 'top' && JSON.stringify(s.selection) === JSON.stringify({ type: 'pref', code: 13 }), `操作が保たれる ${JSON.stringify(s)}`);
  // 第4章へ戻ると場面の値になり、戻ると第5章の場面の値になる
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(g[3].top + g[3].height * 0.9 - vh * 0.5));
  await page.waitForFunction(() => window.__app.store.get().chapter === 3, null, { timeout: 4000 }).catch(() => {});
  const s3 = await state(page);
  ok(s3.chapter === 3 && s3.year === 2025 && JSON.stringify(s3.selection) === JSON.stringify({ type: 'metro', id: 'nagoya' }), `第4章へ戻ると場面の値 ${JSON.stringify(s3)}`);
  await page.close();
}

// ---- 5. 言語・縦画面用の本文・URL ----
console.log(`[${mode}] 5. 言語と本文`);
{
  const page = await open('lang=ja&still=1');
  const body = () => page.evaluate(() => document.querySelector('.chapter[data-chapter="0"] .body').textContent);
  const ja = await body();
  const portrait = mode === 'mobile';
  ok(portrait ? ja.includes('線より右の弧は北へ、左の弧は南へ') : ja.includes('線より上の弧は北へ、下の弧は南へ'), `ja 第1章の本文(${portrait ? '縦画面用' : '横長用'})`);
  await page.evaluate(() => window.__app.store.set({ lang: 'en' }));
  await settle(page, 100);
  const en = await body();
  ok(portrait ? en.includes('Arcs right of the line head north') : en.includes('Arcs above the line head north'), 'en に切り替わる');
  ok(await page.evaluate(() => document.documentElement.lang === 'en' && document.title.startsWith('Arcs Become')), 'html lang と title');
  const h2 = await page.evaluate(() => document.querySelector('.chapter[data-chapter="1"] h2').textContent);
  ok(h2 === 'A Dip, Then a Return', `見出し en: ${h2}`);
  const legend = await page.evaluate(() => document.querySelector('#legend').innerText);
  console.log('   legend(en):', JSON.stringify(legend));
  await page.evaluate(() => window.__app.store.set({ lang: 'ja', selection: { type: 'metro', id: 'tokyo' } }));
  await settle(page, 100);
  console.log('   legend(ja, 東京圏):', JSON.stringify(await page.evaluate(() => document.querySelector('#legend').innerText)));
  await page.evaluate(() => window.__app.store.set({ selection: null, camera: 'oblique' }));
  await settle(page, 100);
  console.log('   legend(ja, oblique):', JSON.stringify(await page.evaluate(() => document.querySelector('#legend').innerText)));
  await page.close();
}

// ---- 6. 動きを減らす設定 ----
console.log(`[${mode}] 6. 動きを減らす設定で目次の移動は即時`);
{
  const page = await open('lang=ja&still=1', { reducedMotion: 'reduce' });
  ok(await page.evaluate(() => window.__app.store.get().reducedMotion === true), 'state.reducedMotion が真');
  if (mode === 'desktop') {
    await page.click('.toc li:nth-child(3) a');
    await page.waitForTimeout(400);
    const y = await page.evaluate(() => scrollY);
    const g = await geom(page);
    ok(Math.abs(y - g[2].top) < 2, `即座に章へ移る (scrollY=${y}, top=${g[2].top})`);
  }
  await page.close();
}

// ---- 7. URL の指定が優先される ----
console.log(`[${mode}] 7. URL に year / sel / cam があれば、はじめの場面を書かない`);
{
  const page = await open('lang=ja&still=1&year=2018&sel=13&cam=top');
  const s = await state(page);
  ok(s.year === 2018 && s.camera === 'top' && s.selection?.code === 13, `URL が正 ${JSON.stringify(s)}`);
  await page.close();
  const p2 = await open('lang=ja&still=1&ch=2');
  const s2 = await state(p2);
  ok(s2.chapter === 2 && s2.year === 2014 && s2.selection?.id === 'osaka', `?ch=2 → 第3章の場面 ${JSON.stringify(s2)}`);
  await p2.close();
}

await browser.close();
server.httpServer.close();
console.log(fails ? `\n${fails} 件 NG` : '\nすべて ok');
process.exit(fails ? 1 : 0);
