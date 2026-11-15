const { chromium } = require('playwright');
const path = require('path');
const D = path.join(__dirname, '..', 'mock'); const OUT = path.join(__dirname, '..', 'shots');
const combos = [];
for (const dev of ['desktop', 'mobile']) for (const state of ['side', 'tokyo']) for (const theme of ['light', 'dark']) combos.push({ dev, state, theme, lang: 'ja' });
combos.push({ dev: 'desktop', state: 'side', theme: 'light', lang: 'en' }, { dev: 'desktop', state: 'tokyo', theme: 'dark', lang: 'en' }, { dev: 'mobile', state: 'tokyo', theme: 'light', lang: 'en' });
const only = process.argv[2];
(async () => {
  const b = await chromium.launch();
  for (const c of combos) {
    const name = `${c.dev}-${c.state}-${c.theme}${c.lang === 'en' ? '-en' : ''}`;
    if (only && !name.includes(only)) continue;
    const vp = c.dev === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: c.dev === 'mobile' ? 2 : 1 });
    p.on('pageerror', e => console.log('ERR', name, e.message));
    await p.goto(`file://${D}/mock.html?dev=${c.dev}&state=${c.state}&theme=${c.theme}&lang=${c.lang}`, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    await p.evaluate(() => window.placeLabels());
    await p.screenshot({ path: `${OUT}/${name}.png` });
    console.log('shot', name);
    await p.close();
  }
  await b.close();
})();
