const { chromium } = require('playwright');
const fs=require('fs');
const OUT='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/review/shots/';
const root=process.argv[2]||'n'; const prefix=process.argv[3]||'m';
(async()=>{
  const { preview } = await import(`/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/n/node_modules/vite/dist/node/index.js`);
  const server=await preview({root:`/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/${root}`,logLevel:'error',preview:{port:0,host:'127.0.0.1',open:false}});
  const base=server.resolvedUrls.local[0];
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const scenes={national:'',tokyo:'&sel=tokyo',osaka:'&sel=osaka',nagoya:'&sel=nagoya'};
  const vps={'1440':[1440,900],'390':[390,844]};
  const report=[];
  
  const cfgs=JSON.parse(process.argv[4]); for (const [vp,sc,cam,theme,lang] of cfgs) {
    const [w,h]=vps[vp]; const name=`${prefix}-${vp}-${sc}-${cam}-${theme}-${lang}`;
    const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
    const page=await ctx.newPage(); const logs=[];
    page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.type()+': '+m.text().slice(0,140))});
    page.on('pageerror',e=>logs.push('pageerror: '+e.message.slice(0,140)));
    page.on('response',r=>{if(r.status()>=400)logs.push('http '+r.status()+' '+r.url())});
    await page.goto(`${base}?cam=${cam}&theme=${theme}&lang=${lang}${scenes[sc]}&still=1`);
    try{await page.waitForSelector('html[data-ready="1"]',{timeout:60000});}catch(e){logs.push('timeout')}
    await page.evaluate(()=>new Promise(res=>{let n=0;const f=()=>{if(++n>=5){window.requestAnimationFrame=()=>0;res();}else requestAnimationFrame(f)};requestAnimationFrame(f)}));await page.waitForTimeout(300);
    const info=await page.evaluate(()=>{
      const vw=innerWidth,vh=innerHeight; const out={overlaps:[],offscreen:[],overflow:[]};
      const q=(s)=>[...document.querySelectorAll(s)].filter(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&cs.opacity!=='0'});
      const targets=[['tools','.ctl-tools'],['camera','.ctl-camera'],['selector','#selector .sel'],['timeline','#timeline .tl'],['tablesum','#table summary'],['chapterH','#chapters .chapter h2'],['chapterP','#chapters .chapter p'],['tooltip','#tooltip.on']];
      const rects=[];
      for(const [n,s] of targets){for(const e of q(s)){const r=e.getBoundingClientRect();rects.push({n,r:{l:r.left,t:r.top,r:r.right,b:r.bottom}});if(r.left<-1||r.top<-1||r.right>vw+1||r.bottom>vh+1)out.offscreen.push(n+':'+[r.left,r.top,r.right,r.bottom].map(Math.round).join(','));}}
      for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.n===b.n)continue;const ox=Math.min(a.r.r,b.r.r)-Math.max(a.r.l,b.r.l),oy=Math.min(a.r.b,b.r.b)-Math.max(a.r.t,b.r.t);if(ox>2&&oy>2)out.overlaps.push(`${a.n}x${b.n}(${Math.round(ox)}x${Math.round(oy)})`)}
      for(const e of document.querySelectorAll('#controls *, #selector *, #timeline *, #table *')){if(e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflow!=='visible'&&e.clientWidth>0)out.overflow.push(e.className||e.tagName)}
      out.docScrollW=document.documentElement.scrollWidth; out.docW=vw;
      return out;
    });
    await page.screenshot({path:OUT+name+'.png',timeout:150000});
    report.push({name,logs,...info});
    await ctx.close();
  }
  fs.writeFileSync(OUT+`${prefix}-report.json`,JSON.stringify(report,null,1));
  await browser.close(); server.httpServer.close();
  for(const r of report){ if(r.logs.length||r.overlaps.length||r.offscreen.length||r.overflow.length||r.docScrollW>r.docW) console.log(r.name,JSON.stringify({logs:r.logs.slice(0,2),ov:r.overlaps,off:r.offscreen,of:r.overflow.slice(0,3),sw:r.docScrollW>r.docW?r.docScrollW:undefined})); }
  console.log('done',report.length);
})();
