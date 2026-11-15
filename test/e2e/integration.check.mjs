#!/usr/bin/env node
// 統合の確認(Playwright)。作品をひとつの画面として通しで確かめる。
//   npm run build && node test/e2e/integration.check.mjs
//   1. ページを上から下までスクロールして 5 章を通り、年・選択・カメラが確定稿(content/chapters.js)どおりに切り替わる
//   2. 年を切り替えると、描画器の年が前の年から次の年へ補間される(still なし)。読み出しは切り替え先の年の値
//   3. キーボードだけで、目次・数値の表・言語・テーマ・地域・年・カメラ・図の回転を操作できる
//   4. 朱の点(選択中の都道府県)の画素値がトークンの値(紙 #C23B22、墨 #E5603F)と一致する
//   5. 1〜4 の間、コンソールにエラー・警告がない
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { CHAPTERS } from '../../src/content/chapters.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const server = await preview({ root, logLevel: 'warn', preview: { port: 0, host: '127.0.0.1', open: false } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'ok ' : 'NG '} ${msg}`);
  if (!cond) failures++;
};
const sameSel = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function open(query, { viewport = { width: 1440, height: 900 }, dpr = 1 } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, locale: 'ja-JP' });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console.${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`${base}?${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('html[data-ready="1"]', { timeout: 120000 });
  return {
    page,
    problems,
    async close() {
      await page.evaluate(() => window.__app?.dispose?.()).catch(() => {});
      await context.close();
    },
  };
}
/** pred(state) が真になるまで(最長 ms)待って、最後の state を返す。描画が重い環境でスクロールの反映を待つ。 */
async function waitState(page, pred, ms = 8000) {
  const t0 = Date.now();
  let s;
  do {
    s = await state(page);
    if (pred(s)) return s;
    await page.waitForTimeout(150);
  } while (Date.now() - t0 < ms);
  return s;
}
const state = (page) => page.evaluate(() => {
  const s = window.__app.store.get();
  return { chapter: s.chapter, year: s.year, selection: s.selection, camera: s.camera, theme: s.theme, lang: s.lang };
});

// ---- 1. スクロールで 5 章を通る ----
for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const tag = `${viewport.width}x${viewport.height}`;
  const { page, problems, close } = await open('lang=ja&still=1', { viewport });
  const first = await state(page);
  const open0 = CHAPTERS[0].steps[0];
  ok(first.chapter === 0 && first.year === open0.year && first.camera === open0.camera && first.selection === null, `[${tag}] 開幕は 0 章の最初の場面 ${JSON.stringify(first)}`);
  let all = true;
  for (let c = 0; c < CHAPTERS.length; c++) {
    const steps = CHAPTERS[c].steps;
    for (let k = 0; k < steps.length; k++) {
      // 画面の高さの中央の線が、c 章の k 番目の場面の中ほどに来る位置へスクロールする
      await page.evaluate(([c, k, n]) => {
        const sec = document.querySelectorAll('#chapters section.chapter')[c];
        const r = sec.getBoundingClientRect();
        const top = r.top + scrollY;
        window.scrollTo({ top: top + (r.height / n) * (k + 0.5) - innerHeight / 2, behavior: 'auto' });
      }, [c, k, steps.length]);
      const want = steps[k];
      const s = await waitState(page, (s) => s.chapter === c && s.year === want.year && s.camera === want.camera && sameSel(s.selection, want.selection));
      const good = s.chapter === c && s.year === want.year && s.camera === want.camera && sameSel(s.selection, want.selection);
      if (!good) all = false;
      ok(good, `[${tag}] ${c} 章 ${k} 場面: ${s.year} ${JSON.stringify(s.selection)} ${s.camera}`);
    }
  }
  ok(all, `[${tag}] 5 章のすべての場面で、年・選択・カメラが確定稿どおり`);
  // 上へ戻ると、前の章の場面に戻る
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  const back = await waitState(page, (s) => s.chapter === 0 && s.year === open0.year && s.camera === open0.camera);
  ok(back.chapter === 0 && back.year === open0.year && back.camera === open0.camera, `[${tag}] 先頭へ戻ると開幕の場面 ${JSON.stringify(back)}`);
  ok(problems.length === 0, `[${tag}] スクロールのあいだ、コンソールにエラーがない ${problems.join(' | ')}`);
  await close();
}

// ---- 2. 年の補間 ----
{
  const { page, problems, close } = await open('lang=ja&ch=4');
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__app.years.get());
  ok(before.a === 2025 && before.b === 2025 && before.mix === 0, `補間の前は (2025, 2025, 0) ${JSON.stringify(before)}`);
  // 年の切り替えにキーボードの Home を送り、同じページの中で毎フレームの補間の状態を記録する
  // (ソフトウェア描画では 1 フレームが長いので、Playwright のキー入力の往復を待つと補間が終わってしまう)
  const samples = await page.evaluate(async () => {
    const slider = document.querySelector('#timeline [role="slider"]');
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      const y = window.__app.years.get();
      const r = window.__app.renderer.getState();
      out.push({ t: Math.round(performance.now() - t0), ...y, ra: r.yearA, rb: r.yearB, rmix: r.mix });
      if (y.a === 2012 && y.b === 2012) break;
      await new Promise((d) => requestAnimationFrame(d));
    }
    return out;
  });
  const mids = samples.filter((s) => s.mix > 0.02 && s.mix < 0.98);
  ok(mids.length > 0 && mids.every((s) => s.ra === 2025 && s.rb === 2012), `前の年(2025)から次の年(2012)へ補間する(途中の ${mids.length} フレーム、mix ${mids.map((s) => s.mix.toFixed(2)).join(' ')})`);
  const end = samples[samples.length - 1];
  ok(end.a === 2012 && end.b === 2012 && end.mix === 0, `補間の後は (2012, 2012, 0) ${JSON.stringify(end)}`);
  const doneAt = samples.find((s) => s.a === 2012 && s.b === 2012)?.t;
  // 1 フレームの dt は 0.1 秒で打ち切るので、描画の遅い環境では実時間で 600ms より長くかかる
  ok(doneAt >= 500, `補間に 600ms 程度以上かかる(${doneAt}ms で終わった、${samples.length} フレーム)`);
  // 自由探索の章は選択つきの場面(補間の速さは、弧の少ないこの状態で測る)。読み出しは全国の総数で確かめる
  await page.evaluate(() => window.__app.store.set({ selection: null }));
  await page.waitForTimeout(300);
  const readout = await page.evaluate(() => document.querySelector('#selector').innerText);
  ok(/2012/.test(readout) && /2,317,856/.test(readout), '読み出しは切り替え先の年(2012 年の総数)');
  // still=1 と動きを減らす設定では即時
  await page.evaluate(() => window.__app.store.set({ reducedMotion: true, year: 2019 }));
  const rm = await page.evaluate(() => window.__app.years.get());
  ok(rm.a === 2019 && rm.b === 2019 && rm.mix === 0, `動きを減らす設定では即座に切り替える ${JSON.stringify(rm)}`);
  ok(problems.length === 0, `年の補間のあいだ、コンソールにエラーがない ${problems.join(' | ')}`);
  await close();
}

// ---- 3. キーボードだけの操作 ----
{
  const { page, problems, close } = await open('lang=ja&still=1');
  const active = () => page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a.tagName, cls: a.className?.baseVal ?? a.className, id: a.id, text: (a.textContent || '').trim().slice(0, 20), role: a.getAttribute('role') };
  });
  /** Tab を押して pred(activeElement) が真になる要素まで進む。 */
  async function tabTo(pred, label, max = 120) {
    for (let i = 0; i < max; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(pred)) return true;
    }
    ok(false, `Tab で ${label} に届く`);
    return false;
  }
  // 目次: 3 番目の章へ
  if (await tabTo(() => document.activeElement.closest?.('.toc a') && document.activeElement.textContent.includes('大阪圏'), '目次の「大阪圏」')) {
    await page.keyboard.press('Enter');
    const s = await waitState(page, (s) => s.chapter === 2 && s.selection?.id === 'osaka', 15000);
    ok(s.chapter === 2 && sameSel(s.selection, { type: 'metro', id: 'osaka' }), `目次を Enter で第 3 章へ ${JSON.stringify(s)}`);
  }
  // 数値の表: 開いて Esc で閉じる
  await page.evaluate(() => document.body.focus());
  if (await tabTo(() => document.activeElement.classList.contains('ctl-table'), '「数値の表」')) {
    await page.keyboard.press('Enter');
    const opened = await page.waitForSelector('dialog.table-dialog[open]', { timeout: 5000 }).then(() => true, () => false);
    ok(opened, '「数値の表」を Enter で開く');
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => !document.querySelector('dialog.table-dialog').open && document.activeElement.classList.contains('ctl-table'));
    ok(closed, 'Esc で閉じて、ボタンへフォーカスが戻る');
  }
  // 言語とテーマ
  if (await tabTo(() => document.activeElement.dataset?.value === 'en', '言語の「EN」')) {
    await page.keyboard.press('Enter');
    ok((await state(page)).lang === 'en', '言語を Enter で英語へ');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    ok((await state(page)).lang === 'ja', 'Shift+Tab と Enter で日本語へ戻す');
  }
  if (await tabTo(() => document.activeElement.dataset?.value === 'ink', 'テーマの「墨」')) {
    await page.keyboard.press('Enter');
    const s = await state(page);
    ok(s.theme === 'ink' && (await page.evaluate(() => document.documentElement.dataset.theme)) === 'ink', 'テーマを Enter で墨へ');
  }
  // 地域: 選択のボタンから一覧を開き、絞り込んで選ぶ
  if (await tabTo(() => !!document.activeElement.closest?.('#selector') && document.activeElement.getAttribute('aria-haspopup') === 'listbox', '地域の選択のボタン')) {
    await page.keyboard.press('Enter');
    await page.keyboard.type('なごや');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    ok(sameSel((await state(page)).selection, { type: 'metro', id: 'nagoya' }), '一覧を開き「なごや」で絞り込み、Enter で名古屋圏を選ぶ');
  }
  // 年: スライダーを ← で 1 年前へ
  if (await tabTo(() => document.activeElement.getAttribute('role') === 'slider', '年の切り替え')) {
    const y0 = (await state(page)).year;
    await page.keyboard.press('ArrowLeft');
    ok((await state(page)).year === y0 - 1, `年を ← で 1 年前へ (${y0} → ${(await state(page)).year})`);
  }
  // カメラ: グループに入り、→ で移動して Enter
  if (await tabTo(() => !!document.activeElement.closest?.('.ctl-camera'), 'カメラの定位置')) {
    const cur = await page.evaluate(() => document.activeElement.dataset.camera);
    await page.keyboard.press('ArrowRight');
    const next = await page.evaluate(() => document.activeElement.dataset.camera);
    await page.keyboard.press('Enter');
    ok(next !== cur && (await state(page)).camera === next, `カメラを → と Enter で切り替える (${cur} → ${next})`);
  }
  // 図: キャンバスにフォーカスして矢印キーで回す
  const rotated = await page.evaluate(async () => {
    const c = document.getElementById('stage');
    c.focus();
    const a = window.__app.rig.getView().azimuth;
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await new Promise((d) => setTimeout(d, 100));
    return [a, window.__app.rig.getView().azimuth, document.activeElement === c];
  });
  ok(rotated[2], 'キャンバスに Tab でフォーカスできる(tabindex)');
  ok(Math.abs(rotated[1] - rotated[0]) > 1e-6, `キャンバスで ← を押すと図が回る (${rotated[0].toFixed(3)} → ${rotated[1].toFixed(3)})`);
  // Esc で選択を解除(キャンバスの上の Esc は図の向きを戻す操作なので、フォーカスを外してから)
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Escape');
  ok((await state(page)).selection === null, 'Esc で選択を解除する');
  ok(problems.length === 0, `キーボード操作のあいだ、コンソールにエラーがない ${problems.join(' | ')}`);
  await close();
}

// ---- 4. 朱の点の画素値 ----
for (const [theme, hex] of [['paper', '#c23b22'], ['ink', '#e5603f']]) {
  const { page, problems, close } = await open(`lang=ja&still=1&theme=${theme}&cam=oblique&sel=13`, { dpr: 2 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__app.pause());
  const [x, y] = await page.evaluate(() => window.__app.renderer.project(12));
  const png = await page.screenshot({ clip: { x: x - 4, y: y - 4, width: 8, height: 8 } });
  const center = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const counts = new Map();
    const d = g.getImageData(img.width / 2 - 3, img.height / 2 - 3, 6, 6).data; // 中心の 3×3 CSS px
    for (let i = 0; i < d.length; i += 4) {
      const h = `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, png.toString('base64'));
  ok(center[0][0] === hex && center[0][1] >= 30, `[${theme}] 東京都の朱の点の中心(3×3 CSS px、36 画素)の値が ${hex}: ${JSON.stringify(center)}`);
  ok(problems.length === 0, `[${theme}] コンソールにエラーがない ${problems.join(' | ')}`);
  await close();
}

await browser.close();
server.httpServer.close();
if (failures) {
  console.error(`\n${failures} 件の失敗`);
  process.exit(1);
}
console.log('\nすべて成功');
