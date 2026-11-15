const { chromium } = require('playwright');
(async () => {
  const [,, out, qs, w, h] = process.argv;
  const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const p = await b.newPage({ viewport: { width: +(w||1200), height: +(h||500) } });
  p.on('console', m => console.log('console:', m.text().slice(0,400))); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8765/index.html?'+qs); await p.waitForFunction('window.ready', null, {timeout: 120000});
  await p.waitForTimeout(300);
  await p.screenshot({ path: out });
  if (process.env.BENCH) console.log('ms/frame', await p.evaluate(n=>bench(n), +process.env.BENCH), 'particles', await p.evaluate('window.particleCount'));
  await b.close();
})();
