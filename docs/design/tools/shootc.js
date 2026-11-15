const { chromium } = require('playwright'); const path = require('path'); const D = path.join(__dirname, '..', 'mock'); const OUT = path.join(__dirname, '..', 'shots');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(`file://${D}/components.html`, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/components.png`, fullPage: true }); await b.close(); })();
