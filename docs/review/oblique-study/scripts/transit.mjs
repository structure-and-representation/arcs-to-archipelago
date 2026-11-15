// 使い方: node transit.mjs <出力ディレクトリ> <案> <状態> <幅x高さ> [path=linear|elfirst]
import { mkdirSync } from 'node:fs';
import { start, openPage } from './common.mjs';
import { VARIANTS, STATES } from './variants.mjs';
const [out, vk, st, sizeArg = '1440x900', path = 'linear'] = process.argv.slice(2);
const size = sizeArg.split('x').map(Number);
mkdirSync(out, { recursive: true });
const env = await start();
const { page, close } = await openPage(env, `${STATES[st].q}&cam=oblique&theme=paper`, size);
const legs = [['side', 'oblique'], ['oblique', 'top'], ['side', 'top']];
const S = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1];
for (const [a, b] of legs) {
  for (const p of S) {
    const v = await page.evaluate(({ a, b, p, ov, path }) => {
      const C = window.__study.camera, app = window.__app;
      const { width, height } = app.renderer.getState(); const s = app.store.get();
      const opts = C.viewOptions(width, height, s.selection, window.__study.partners(s.selection));
      const vf = (name) => C.viewFor(name, width / height, app.renderer.layout, { ...opts, override: name === 'oblique' ? ov : undefined });
      const A = vf(a), B = vf(b);
      const e = C.easeCamera(p);
      let v;
      if (path === 'elfirst' && a === 'side') {
        // 仰角を先に上げてから(方位 0 のまま)、高いところで方位を回す
        const k = Math.min(1, e / 0.5), m = Math.max(0, (e - 0.5) / 0.5);
        const mid = { ...B, azimuth: A.azimuth };
        v = e < 0.5 ? C.tween(A, { ...mid, elevation: Math.max(B.elevation, 1.25) }, k) : C.tween({ ...mid, elevation: Math.max(B.elevation, 1.25) }, B, m);
        v.morph = C.tween(A, B, e).morph;
      } else v = C.tween(A, B, e);
      globalThis.__forceView = v; app.rig.reset();
      return { az: v.azimuth, el: v.elevation, morph: v.morph, lean: v.lean };
    }, { a, b, p, ov: VARIANTS[vk].oblique ?? {}, path });
    await page.waitForTimeout(600);
    const f = `${out}/${vk}-${st}-${path}-${a}-${b}-${Math.round(p * 100)}.png`;
    await page.screenshot({ path: f });
    console.log(f, JSON.stringify(v));
  }
}
await close(); await env.close();
