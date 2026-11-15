import { readFileSync } from 'node:fs';
const M='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/m/';
const { geoLayout } = await import(M+'src/geometry/layout.js');
const { parseParams } = await import(M+'src/params.js');
const { selectionMask, sideOf } = await import(M+'src/geometry/flows.js');
const { viewFor } = await import(M+'src/scene/camera.js');
const real = JSON.parse(readFileSync(M+'public/data/prefectures.json','utf8'));
const fix = JSON.parse(readFileSync(M+'test/fixtures/prefectures.json','utf8'));
const g = geoLayout(real), f = geoLayout(fix);
console.log('real bounds', g.bounds, 'north', g.northAngle, 'kmPerUnit', g.kmPerUnit);
console.log('fix  bounds', f.bounds, 'north', f.northAngle);
let maxd=0; real.forEach((p,i)=>{maxd=Math.max(maxd,Math.hypot(p.x-fix[i].x,p.y-fix[i].y))}); console.log('max capital diff km real vs fixture', maxd.toFixed(2));
const xs=g.pos.map(p=>p[0]); console.log('argmin x',xs.indexOf(Math.min(...xs)),'argmax x',xs.indexOf(Math.max(...xs)));
console.log('Okinawa/Kagoshima x', g.pos[46][0], g.pos[45][0], 'Hokkaido', g.pos[0]);
// prototype keys
for (const q of ['sel=constructor','sel=toString','sel=__proto__','sel=hasOwnProperty','cam=toString','cam=constructor']) {
  const r = parseParams(q); console.log(q, JSON.stringify(r.patch));
}
try { selectionMask({type:'metro', id:'constructor'}); console.log('mask ok'); } catch(e) { console.log('selectionMask(constructor) throws:', e.message); }
try { selectionMask(parseParams('sel=toString').patch.selection); console.log('ok'); } catch(e) { console.log('toString throws:', e.message); }
try { console.log('viewFor(toString)', JSON.stringify(viewFor('toString', 1.6, {bounds:g.bounds,northAngle:g.northAngle})).slice(0,120)); } catch(e){console.log('viewFor err',e.message)}
console.log('morph for cam=toString:', parseParams('cam=toString').patch.morph);
