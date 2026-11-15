const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const p = await b.newPage({ viewport: { width: 1200, height: 500 } });
  p.on('console', m => console.log('console:', m.text())); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8765/svg.html'); await p.waitForFunction('window.ready', null, {timeout: 120000});
  console.log(JSON.stringify(await p.evaluate('window.result')));
  await p.screenshot({ path: 'ref_svg.png' });
  await p.goto('http://localhost:8765/index.html?parts=0&nodes=0'); await p.waitForFunction('window.ready', null, {timeout: 60000});
  console.log('gl', await p.evaluate(()=>{const gl=state.renderer.getContext();const e=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(e?e.UNMASKED_RENDERER_WEBGL:gl.RENDERER)}));
  await p.screenshot({ path: 'gl_side_arcs.png' });
  await b.close();
})();
