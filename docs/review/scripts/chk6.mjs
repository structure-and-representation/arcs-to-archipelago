import fs from 'node:fs';
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/n/';
const od=JSON.parse(fs.readFileSync(R+'public/data/od.json'));
const net=(codes,y)=>{const m=od.matrices[y];const mask=new Set(codes.map(c=>c-1));let i=0,o=0;for(let a=0;a<47;a++)for(let b=0;b<47;b++){if(a===b)continue;const ma=mask.has(a),mb=mask.has(b);if(ma===mb)continue;if(ma)o+=m[a*47+b];else i+=m[a*47+b];}return i-o;};
const variants={'岐阜,愛知,三重':[21,23,24],'愛知':[23],'愛知,三重':[23,24],'愛知,岐阜':[21,23],'静岡,愛知,岐阜,三重':[21,22,23,24],'岐阜,静岡,愛知':[21,22,23]};
for(const [k,c] of Object.entries(variants)) console.log(k,[2012,2022,2025].map(y=>net(c,y)).join(' / '),' want -276 / -15872 / -11542');
const tk={'埼玉,千葉,東京,神奈川':[11,12,13,14]};console.log('tokyo 2019',net([11,12,13,14],2019),'want 145576');
// nagoya any year positive?
console.log('Nagoya (21,23,24) positive years',od.years.filter(y=>net([21,23,24],y)>0).join(','));
