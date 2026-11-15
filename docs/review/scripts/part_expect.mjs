import fs from 'node:fs';
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/';
const { arcPoint } = await import(R+'n/src/geometry/arc.js');
const { lineLayout } = await import(R+'n/src/geometry/layout.js');
const { selectionMask } = await import(R+'n/src/geometry/flows.js');
const P = await import(R+'n/src/geometry/particles.js');
const line=lineLayout(); const od=JSON.parse(fs.readFileSync(R+'n/public/data/od.json'));
for (const [name,sel] of [['okinawa',{type:'pref',code:47}],['hokkaido',{type:'pref',code:1}]]) {
  const info=JSON.parse(fs.readFileSync(R+`pt_${name}.json`)); const m=info.m; const mask=selectionMask(sel);
  const mat=od.matrices[info.year]; const pts=[];
  for(let o=0;o<47;o++)for(let d=0;d<47;d++){ if(o===d||mask[o]===mask[d])continue; const side=mask[d]?1:-1; const n=mat[o*47+d]/100; const slots=Math.ceil(n);
    for(let k=0;k<slots;k++){ const w=Math.min(Math.max(n-k,0),1); if(w<0.99) continue; const s=P.slotS(o,d,k,0,true); const t=P.arcT(s); const p=arcPoint(line[o],line[d],side,0,t);
      // tangent normal in screen
      const p2=arcPoint(line[o],line[d],side,0,Math.min(t+0.003,1)); const sx=(q)=>[m[0]*q[0]+m[1]*q[1]+m[2]*q[2]+m[3], m[4]*q[0]+m[5]*q[1]+m[6]*q[2]+m[7]];
      pts.push({o,d,k,w,s,a:sx(p),b:sx(p2)}); } }
  fs.writeFileSync(R+`pt_${name}_exp.json`,JSON.stringify(pts)); console.log(name,'expected full-weight particles',pts.length,'year',info.year);
}
