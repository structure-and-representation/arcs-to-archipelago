import * as G from './geometry.js';
import fs from 'fs';
const links = JSON.parse(fs.readFileSync('data.json')).links;
const line = G.lineLayout(), geo = G.geoLayout().pos;
const S = 24, morph = 0.7, lean = 0.4;
// precompute polyline cache (recomputed only when morph/lean change), then per-move: project + seg distance
const cache = new Float32Array(links.length*(S+1)*3);
let t0 = performance.now();
for (let r=0;r<10;r++) links.forEach((l,i)=>{ const A=G.nodePos(line,geo,l.source,morph), B=G.nodePos(line,geo,l.target,morph);
  for (let k=0;k<=S;k++){ const p=G.arcPoint(A,B,l.source>l.target?1:-1,lean,k/S); cache.set(p,(i*(S+1)+k)*3); } });
console.log('rebuild cache ms', (performance.now()-t0)/10);
// orthographic projection = affine 3x4
const M = [0.8,0,0.6,0, 0.3,0.9,-0.4,0]; const mx=100,my=50;
t0 = performance.now(); let best=-1,bd=1e9;
for (let r=0;r<10;r++){ best=-1;bd=1e9;
  for (let i=0;i<links.length;i++){ let px,py;
    for (let k=0;k<=S;k++){ const o=(i*(S+1)+k)*3; const x=M[0]*cache[o]+M[1]*cache[o+1]+M[2]*cache[o+2], y=M[4]*cache[o]+M[5]*cache[o+1]+M[6]*cache[o+2];
      if (k){ const dx=x-px, dy=y-py, L=dx*dx+dy*dy||1e-9; let u=((mx-px)*dx+(my-py)*dy)/L; u=u<0?0:u>1?1:u; const ex=px+u*dx-mx, ey=py+u*dy-my, d=ex*ex+ey*ey; if(d<bd){bd=d;best=i;} }
      px=x;py=y; } } }
console.log('pick ms', (performance.now()-t0)/10, best, Math.sqrt(bd));
