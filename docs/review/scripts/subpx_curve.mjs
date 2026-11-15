import fs from 'node:fs';
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/';
const { arcPoint } = await import(R+'n/src/geometry/arc.js');
const { lineLayout } = await import(R+'n/src/geometry/layout.js');
const { selectionMask } = await import(R+'n/src/geometry/flows.js');
const line=lineLayout();
for (const name of ['okinawa','kagoshima','tokyo']) {
  const {sel,info}=JSON.parse(fs.readFileSync(R+`sp_${name}.json`));
  const mask=selectionMask(/^\d+$/.test(sel)?{type:'pref',code:+sel}:{type:'metro',id:sel});
  const m=info.m; const curves=[];
  for(let o=0;o<47;o++)for(let d=0;d<47;d++){ if(o===d)continue; const so=mask[o],sd=mask[d]; if(so===sd)continue; const side=sd?1:-1;
    const pts=[];for(let k=0;k<=600;k++){const p=arcPoint(line[o],line[d],side,0,k/600);pts.push([m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3], m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7]]);} curves.push({o,d,pts}); }
  fs.writeFileSync(R+`sp_${name}_curves.json`,JSON.stringify(curves));
}
