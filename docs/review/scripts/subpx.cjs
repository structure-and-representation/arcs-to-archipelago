const { chromium } = require('playwright');
const fs=require('fs');
(async()=>{
  const { preview } = await import('/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/n/node_modules/vite/dist/node/index.js');
  const root='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/n';
  const server=await preview({root,logLevel:'error',preview:{port:0,host:'127.0.0.1',open:false}});
  const base=server.resolvedUrls.local[0];
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const W=1440,H=900;
  const out={};
  for (const [name,sel] of [['okinawa','47'],['kagoshima','46'],['tokyo','13']]) {
    const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
    await page.addInitScript(()=>{globalThis.__ARCS_DEBUG={width:1,alpha:1}});
    await page.goto(`${base}?morph=0&cam=side&year=2014&sel=${sel}&still=1`);
    await page.waitForSelector('html[data-ready="1"]');
    await page.addStyleTag({content:'html,body{background:#fff !important}#app>*:not(#stage){display:none !important}#stage{background:transparent !important}'});
    await page.waitForTimeout(1500);
    const info=await page.evaluate(()=>({m:Array.from(window.__app.renderer.screenMatrix()),nodes:Array.from({length:47},(_,i)=>window.__app.renderer.project(i))}));
    await page.screenshot({path:`/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/sp_${name}.png`});
    fs.writeFileSync(`/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/sp_${name}.json`,JSON.stringify({sel,info}));
    await page.close();
  }
  await browser.close(); server.httpServer.close();
})();
