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
const mode = process.argv[2] || 'desktop'; // desktop(1440×900)| short(1024×768)| mobile(390×844)| small(360×640)
const viewport = { desktop: { width: 1440, height: 900 }, short: { width: 1024, height: 768 }, mobile: { width: 390, height: 844 }, small: { width: 360, height: 640 } }[mode];
const portrait = viewport.width < 1024;
const ANCHOR = portrait ? 0.3 : 0.5; // ui/chapters.js の基準の線(縦画面は ANCHOR_PORTRAIT)
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
/** 見えているカード(不透明度と visibility で判定)と、その位置・現在の章 */
const cards = async (page) => {
  // 入れ替わりのアニメーション(消える・現れる)が終わるまで待つ(描画が重いと、決めた待ち時間より長くかかる)
  await page.waitForTimeout(150);
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.effect?.target?.classList?.contains('chapter-card') && a.playState !== 'finished'), null, { timeout: 15000 }).catch(() => {});
  return cardsNow(page);
};
const cardsNow = (page) => page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const shown = [...document.querySelectorAll('.chapter-card')].map((el) => ({ el, cs: getComputedStyle(el) })).filter(({ cs }) => +cs.opacity > 0.02 && cs.visibility === 'visible');
  const rectOf = (sel) => { const e = document.querySelector(sel); return e && getComputedStyle(e).display !== 'none' ? r(e) : null; };
  return {
    n: shown.length,
    chapters: shown.map(({ el }) => el.closest('.chapter').dataset.chapter),
    current: document.querySelector('.chapter[data-current]')?.dataset.chapter ?? null,
    currentCount: document.querySelectorAll('.chapter[data-current]').length,
    card: shown[0] ? r(shown[0].el) : null,
    toc: rectOf('.toc'), legend: rectOf('#legend'), dock: rectOf('#dock'),
  };
});
const hit = (a, b) => a && b && a.x < b.r && a.r > b.x && a.y < b.b && a.b > b.y;

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
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(anchor - vh * ANCHOR));
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
  // 期待: 場面の並びで camera が変わる回数(0 章の side→oblique の 1 回だけ。以降は oblique のまま)
  const seq = COPY.flatMap((c) => c.steps.map((s) => s.camera));
  const expectCam = seq.filter((c, i) => i > 0 && c !== seq[i - 1]).length;
  ok(cameraWrites === expectCam, `camera の書き込み ${cameraWrites} 回 == 期待 ${expectCam} 回`);
  const sceneWrites = log.filter((e) => e.ch.includes('chapter') || e.ch.includes('year')).length;
  const nScenes = COPY.reduce((a, c) => a + c.steps.length, 0);
  ok(log.length <= nScenes + 1, `state 書き込みは場面数(${nScenes})+α のみ: ${log.length} 回`);
  const years = log.map((e) => e.year);
  console.log('   years:', years.join(','));
  await page.close();
}

// ---- 3. 目次から章へ移る ----
if (!portrait) {
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

// ---- 4. 自由探索: 本文の例を場面で見せ、最後の場面に入ってからは読者の操作を上書きしない ----
console.log(`[${mode}] 4. 自由探索: 例の場面、最後の場面からは読者の操作を上書きしない`);
{
  const page = await open('lang=ja&still=1');
  const g = await geom(page);
  const vh = viewport.height;
  const n = COPY[4].steps.length;
  const yOf = (k) => Math.round(g[4].top + ((k + 0.5) / n) * g[4].height - vh * ANCHOR);
  // 最初の 3 場面は、大阪府 2025、千葉県 2012、千葉県 2025(本文の例)
  for (let k = 0; k < n - 1; k++) {
    await page.evaluate((y) => window.scrollTo(0, y), yOf(k));
    const want = COPY[4].steps[k];
    await page.waitForFunction((w) => { const s = window.__app.store.get(); return s.chapter === 4 && s.year === w.year && s.selection && s.selection.code === Number(w.selection.code); }, want, { timeout: 4000 }).catch(() => {});
    const s = await state(page);
    ok(s.chapter === 4 && s.year === want.year && s.selection?.type === 'pref' && s.selection.code === Number(want.selection.code) && s.camera === 'oblique', `第5章 場面${k + 1}: ${JSON.stringify(s)}`);
  }
  // 最後の場面(全国 2025)に入る
  await page.evaluate((y) => window.scrollTo(0, y), yOf(n - 1));
  await page.waitForFunction(() => { const s = window.__app.store.get(); return s.chapter === 4 && s.selection === null && s.year === 2025; }, null, { timeout: 4000 }).catch(() => {});
  const last = await state(page);
  ok(last.chapter === 4 && last.selection === null && last.year === 2025, `最後の場面 ${JSON.stringify(last)}`);
  await page.evaluate(() => window.__app.store.set({ year: 2018, selection: { type: 'pref', code: 13 }, camera: 'top' }));
  await settle(page, 100);
  const base = yOf(n - 1);
  for (const dy of [30, -20, 60, -40, 90]) {
    await page.evaluate((d) => window.scrollBy(0, d), dy);
    await settle(page, 150);
  }
  await page.evaluate((y) => window.scrollTo(0, y), base);
  const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.evaluate((y) => window.scrollTo(0, y), maxY);
  await settle(page, 200);
  const s = await state(page);
  ok(s.chapter === 4 && s.year === 2018 && s.camera === 'top' && JSON.stringify(s.selection) === JSON.stringify({ type: 'pref', code: 13 }), `操作が保たれる ${JSON.stringify(s)}`);
  // 第4章へ戻ると場面の値になる
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(g[3].top + g[3].height * 0.9 - vh * ANCHOR));
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
  ok(portrait ? ja.includes('線より右の弧は北へ、左の弧は南へ') : ja.includes('線より上の弧は北へ、下の弧は南へ'), `ja 第1章の本文(${portrait ? '縦画面用' : '横長用'})`);
  await page.evaluate(() => window.__app.store.set({ lang: 'en' }));
  await settle(page, 100);
  const en = await body();
  ok(portrait ? en.includes('Arcs right of the line head north') : en.includes('Arcs above the line head north'), 'en に切り替わる');
  ok(await page.evaluate(() => document.documentElement.lang === 'en' && document.title.startsWith('Arcs Become')), 'html lang と title');
  const h2 = await page.evaluate(() => document.querySelector('.chapter[data-chapter="1"] h2').textContent);
  ok(h2 === COPY[1].heading.en, `見出し en: ${h2}`);
  const h0 = await page.evaluate(() => document.querySelector('.chapter[data-chapter="0"] h2').textContent);
  ok(h0 === 'In 2025, 2.1 Million People Moved Across Prefectures', `1 章の見出し en: ${h0}`);
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
  if (!portrait) {
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

// ---- 8. 本文のカードは一度に 1 枚。章の境でも、ページの最後でも ----
console.log(`[${mode}] 8. 全ページをスクロールして、見えるカードは常に 1 枚(現在の章)`);
{
  const page = await open('lang=ja&still=1');
  const g = await geom(page);
  const vh = viewport.height;
  const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const positions = [];
  g.forEach((sec, c) => {
    const n = COPY[c].steps.length;
    for (const f of [0.02, 1 / n + 0.02, 0.5, 0.97]) positions.push([`章${c + 1} ${f.toFixed(2)}`, sec.top + sec.height * f - vh * ANCHOR]);
    positions.push([`章${c + 1}/${c + 2} の境の手前`, sec.top + sec.height - 30 - vh * ANCHOR]);
    positions.push([`章${c + 1}/${c + 2} の境の直後`, sec.top + sec.height + 30 - vh * ANCHOR]);
  });
  positions.push(['ページの最後', maxY]);
  let bad = 0;
  for (const [name, y0] of positions) {
    const y = Math.min(maxY, Math.max(0, Math.round(y0)));
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await settle(page, 700);
    const c = await cards(page);
    const issues = [];
    if (c.n !== 1) issues.push(`見えるカード ${c.n} 枚`);
    if (c.currentCount !== 1 || c.chapters[0] !== c.current) issues.push(`data-current ${c.current}(${c.currentCount} 個)と見えるカード ${c.chapters}`);
    if (c.card && !portrait) {
      if (c.card.y < (c.toc?.b ?? 0) + 4) issues.push(`目次に重なる(上端 ${Math.round(c.card.y)} < 目次の下端 ${Math.round(c.toc.b)})`);
      if (hit(c.card, c.legend)) issues.push(`凡例に重なる(下端 ${Math.round(c.card.b)}、凡例の上端 ${Math.round(c.legend.y)})`);
      if (c.card.x < 0 || c.card.r > vh * 2) issues.push('カードが画面の外');
    }
    if (issues.length) { bad++; console.log('  NG', name, y, issues.join(' / ')); }
  }
  ok(bad === 0, `${positions.length} 位置のどこでも、カードは現在の章の 1 枚で、目次・凡例・上の帯・ドックに重ならない`);
  // 最後の位置: 最後の章のカードが見え、画面に収まる
  const end = await cards(page);
  ok(end.n === 1 && end.chapters[0] === '4' && (portrait || (end.card.b <= viewport.height - 100 && end.card.y >= end.toc.b)), `ページの最後は第5章のカード ${JSON.stringify(end.card)}`);
  await page.close();
}

// ---- 9. URL で直接開いたときも、現在の章のカードだけ ----
console.log(`[${mode}] 9. URL から直接入る: 現在の章のカードだけ`);
for (const q of ['sel=tokyo&year=2021&cam=oblique', 'sel=13&cam=top', 'cam=top', 'ch=4', 'ch=2&year=2023']) {
  const page = await open(`lang=ja&still=1&${q}`);
  await settle(page, 500);
  const c = await cards(page);
  const s = await state(page);
  const okVisible = c.n === 1 && c.chapters[0] === String(s.chapter) && c.current === String(s.chapter);
  // 縦画面の章の途中(場面 2 以降)は、カードが通り過ぎたあと(画面の外)でもよい。そのときは見えるカードが 0 枚になりうる
  ok(okVisible || (portrait && c.n === 0), `?${q} → 章${s.chapter + 1} のカード ${JSON.stringify(c.chapters)}、目次の下端 ${c.toc ? Math.round(c.toc.b) : '-'}、カード上端 ${c.card ? Math.round(c.card.y) : '-'}`);
  if (c.card && !portrait) ok(c.card.y >= c.toc.b, `  目次の下から始まる`);
  await page.close();
}

// ---- 10. 縦画面: 図が見え、カードの下の点を押せる ----
if (portrait) {
  console.log(`[${mode}] 10. 縦画面: カードは画面の 4 割以下で、指を受けない`);
  const page = await open('lang=ja&still=1');
  const g = await geom(page);
  const vh = viewport.height;
  let tall = 0;
  for (let c = 0; c < COPY.length; c++) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(g[c].top + 0.02 * g[c].height - vh * ANCHOR)));
    await settle(page, 700);
    const k = await cards(page);
    if (k.card && k.card.h > vh * 0.4) { tall++; console.log('  NG 章', c + 1, 'カードの高さ', Math.round(k.card.h), '/', vh); }
    const pe = await page.evaluate(() => getComputedStyle(document.querySelector('.chapter-card')).pointerEvents);
    if (pe !== 'none') tall++;
  }
  ok(tall === 0, '各章の先頭のカードは画面の 4 割以下で、pointer-events: none');
  // 章 2 の先頭: カードの上の点に指で触れると、図(canvas)が受ける
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(g[1].top + 0.02 * g[1].height - vh * ANCHOR));
  await settle(page, 700);
  const k = await cards(page);
  const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.tagName, [viewport.width / 2, (k.card.y + k.card.b) / 2]);
  ok(top === 'stage', `カードの中央の点を指すと図(#stage)が受ける: ${top}`);
  await page.close();
}

await browser.close();
server.httpServer.close();
console.log(fails ? `\n${fails} 件 NG` : '\nすべて ok');
process.exit(fails ? 1 : 0);
