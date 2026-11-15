import { start, openPage } from './common.mjs';
const env = await start();
const { page, close } = await openPage(env, 'cam=oblique&sel=tokyo&year=2025', [1440, 900]);
console.log(await page.evaluate(() => {
  const L = window.__app.renderer.layout; const C = window.__study.camera;
  return { northAngle: L.northAngle, topAz: C.topAzimuth(L.northAngle), view: window.__app.rig.getView(), state: window.__app.store.get() };
}));
await page.screenshot({ path: '/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/oblique-study/probe.png' });
await close(); await env.close();
