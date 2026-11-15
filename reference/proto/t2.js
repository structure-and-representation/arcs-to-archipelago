const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 500 } });
  await p.goto('http://localhost:8765/svg1.html'); await p.waitForFunction('window.ready');
  await p.screenshot({ path: 'ref_svg_1px.png' }); await b.close();
})();
