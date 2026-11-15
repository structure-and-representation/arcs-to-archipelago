const { chromium } = require('playwright');
const fs=require('fs');
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/';
(async()=>{
  const { preview } = await import(R+'n/node_modules/vite/dist/node/index.js');
  const server=await preview({root:R+'n',logLevel:'error',preview:{port:0,host:'127.0.0.1',open:false}});
  const base=server.resolvedUrls.local[0];
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  for (const [name,query] of [['okinawa','sel=47'],['hokkaido','sel=1']]) {
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    await page.addInitScript(()=>{globalThis.__ARCS_DEBUG={width:1,alpha:0}});
    await page.goto(`${base}?morph=0&cam=side&${query}&still=1`);
    await page.waitForSelector('html[data-ready="1"]');
    await page.addStyleTag({content:'html,body{background:#fff !important}#app>*:not(#stage){display:none !important}#stage{background:transparent !important}'});
    await page.evaluate(()=>new Promise(res=>{let n=0;const f=()=>{if(++n>=6){window.requestAnimationFrame=()=>0;res();}else requestAnimationFrame(f)};requestAnimationFrame(f)}));
    await page.waitForTimeout(400);
    const info=await page.evaluate(()=>({m:Array.from(window.__app.renderer.screenMatrix()),nodes:Array.from({length:47},(_,i)=>window.__app.renderer.project(i)),year:window.__app.store.get().year}));
    await page.screenshot({path:R+`pt_${name}.png`,timeout:120000});
    fs.writeFileSync(R+`pt_${name}.json`,JSON.stringify(info));
    await page.close();
  }
  await browser.close(); server.httpServer.close();
})();
