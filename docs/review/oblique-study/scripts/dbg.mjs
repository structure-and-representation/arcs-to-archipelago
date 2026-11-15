import { start, openPage, applyPresets } from './common.mjs';
import { VARIANTS } from './variants.mjs';
const env = await start();
const { page, close } = await openPage(env, 'year=2025&lang=ja&sel=tokyo&cam=oblique', [390, 844]);
await applyPresets(page, { oblique: VARIANTS.C4.oblique });
console.log(await page.evaluate(() => {
  const v = window.__app.rig.getView(); const C = window.__study.camera; const L = window.__app.renderer.layout;
  const pts = [0, 12, 39, 46].map((i) => { const g = L.geo.pos ? L.geo.pos[i] : null; return g; });
  const st = window.__app.renderer.getState();
  return { st, region: C.figureRegion(st.width, st.height), target: v.target, size: v.size, geo0: pts, proj: pts.map((g) => g && C.projectPoint(v, [g[0], 0, g[1]], v.size)), inner: innerWidth };
}));
await close(); await env.close();
