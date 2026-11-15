// 使い方: node shoot.mjs <出力ディレクトリ> <幅x高さ> <theme> <状態,...> <案,...>
import { mkdirSync } from 'node:fs';
import { start, openPage, applyPresets } from './common.mjs';
import { VARIANTS, STATES } from './variants.mjs';
const [out, sizeArg = '1440x900', theme = 'paper', states = Object.keys(STATES).join(','), vars = Object.keys(VARIANTS).join(',')] = process.argv.slice(2);
const size = sizeArg.split('x').map(Number);
mkdirSync(out, { recursive: true });
const env = await start();
try {
  for (const st of states.split(',')) {
    for (const cam of ['oblique', 'side', 'top']) {
      const list = vars.split(',').filter((k) => (VARIANTS[k].cam ?? 'oblique') === cam);
      if (!list.length) continue;
      const { page, close } = await openPage(env, `${STATES[st].q}&cam=${cam}&theme=${theme}`, size);
      for (const k of list) {
        await applyPresets(page, VARIANTS[k].oblique ? { oblique: VARIANTS[k].oblique } : {});
        const v = await page.evaluate(() => { const v = window.__app.rig.getView(); return { az: v.azimuth, el: v.elevation, lean: v.lean, zoom: v.zoom, roll: v.roll }; });
        const f = `${out}/${st}-${k}.png`;
        await page.screenshot({ path: f });
        console.log(f, JSON.stringify(v));
      }
      await close();
    }
  }
} finally { await env.close(); }
