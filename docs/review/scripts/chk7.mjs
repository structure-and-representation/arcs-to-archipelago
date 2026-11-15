import fs from 'node:fs';
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/n/';
const od=JSON.parse(fs.readFileSync(R+'public/data/od.json'));
const M={tokyo:[11,12,13,14],nagoya:[21,23,24],osaka:[26,27,28,29]};
const flow=(from,to,y)=>{let s=0;for(const a of from)for(const b of to)s+=od.matrices[y][(a-1)*47+(b-1)];return s;};
const rest=(ex)=>Array.from({length:47},(_,i)=>i+1).filter(c=>!ex.flat().includes(c));
const outside3=rest([M.tokyo,M.nagoya,M.osaka]);
for(const y of [2012,2014,2018,2022,2025]){
 console.log(y,'Nagoya->Tokyo net loss',flow(M.nagoya,M.tokyo,y)-flow(M.tokyo,M.nagoya,y),'Nagoya->Osaka net loss',flow(M.nagoya,M.osaka,y)-flow(M.osaka,M.nagoya,y),'Osaka->Tokyo net loss',flow(M.osaka,M.tokyo,y)-flow(M.tokyo,M.osaka,y),'Osaka net gain from outside-3',flow(outside3,M.osaka,y)-flow(M.osaka,outside3,y));
}
// share of moves with Tokyo area as origin or dest 2025
const tot=od.totals[2025]; let inv=0; for(let a=1;a<=47;a++)for(let b=1;b<=47;b++){ if(a===b)continue; if(M.tokyo.includes(a)||M.tokyo.includes(b)) inv+=od.matrices[2025][(a-1)*47+(b-1)];} console.log('share involving Tokyo area 2025',(inv/tot*100).toFixed(1)+'%');
// number of prefectures with net gain 2025
const m=od.matrices[2025];let g=0;for(let i=0;i<47;i++){let inn=0,out=0;for(let j=0;j<47;j++){if(i===j)continue;inn+=m[j*47+i];out+=m[i*47+j];}if(inn>out)g++;} console.log('net-gain prefs 2025',g);
