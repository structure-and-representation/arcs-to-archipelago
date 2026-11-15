import fs from 'node:fs';
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/n/';
const { parseData } = await import(R+'src/data/loader.js');
const S = await import(R+'src/data/stats.js');
const T = await import(R+'src/data/tableStats.js');
const { selectionMask } = await import(R+'src/geometry/flows.js');
const data = parseData({od:JSON.parse(fs.readFileSync(R+'public/data/od.json')),prefectures:JSON.parse(fs.readFileSync(R+'public/data/prefectures.json')),topology:JSON.parse(fs.readFileSync(R+'public/data/japan.topojson'))});
let bad=0, n=0;
const sels=[null,...['tokyo','osaka','nagoya'].map(id=>({type:'metro',id})),...Array.from({length:47},(_,i)=>({type:'pref',code:i+1}))];
for (const y of data.years) for (const s of sels) {
  const m=data.matrix(y);
  const a=S.regionFlows(m,s); const b=T.tableRows(m,s);
  if(!s){ const f=S.prefFlows(m); const g=T.prefectureFlows(m); for(let i=0;i<47;i++){ n++; if(f.in[i]!==g.in[i]||f.out[i]!==g.out[i]||f.net[i]!==g.net[i]) bad++; } continue; }
  n++; if(a.in!==b.total.in||a.out!==b.total.out||a.net!==b.total.net) {bad++; console.log('MISMATCH',y,s,a,b.total);}
  // rows sum
  const sum=b.rows.reduce((q,r)=>q+r.net,0); if(sum!==b.total.net){bad++;console.log('row sum mismatch',y,s);}
}
console.log('compared',n,'mismatches',bad);
const net=(id,y)=>S.regionFlows(data.matrix(y),{type:'metro',id});
console.log('Tokyo area net 2019',net('tokyo',2019).net,'2021',net('tokyo',2021).net,' (copy: 145,576 / 80,441)');
console.log('Osaka net 2014',net('osaka',2014).net,'2023',net('osaka',2023).net,'2025',net('osaka',2025).net,' (copy: -11,722 / +235 / +7,503)');
console.log('Nagoya net 2012',net('nagoya',2012).net,'2022',net('nagoya',2022).net,'2025',net('nagoya',2025).net,' (copy: -276 / -15,872 / -11,542)');
const p=S.regionFlows(data.matrix(2019),{type:'pref',code:13}).net, p2=S.regionFlows(data.matrix(2021),{type:'pref',code:13}).net;
console.log('Tokyo pref 2019',p,'2021',p2,'(copy 86,575 -> 10,815)');
// metro selection: sum of pref-level nets != metro net? show difference
const m=data.matrix(2025); const f=S.prefFlows(m); const mask=selectionMask({type:'metro',id:'tokyo'});
let sumNet=0; mask.forEach((v,i)=>{if(v)sumNet+=f.net[i]}); console.log('Tokyo area: sum of 4 prefs national net',sumNet,'vs metro (outside-only) net',net('tokyo',2025).net);
console.log('total 2025',S.yearTotal(data,2025),'sum matrix',S.totalMovers(data.matrix(2025)));
