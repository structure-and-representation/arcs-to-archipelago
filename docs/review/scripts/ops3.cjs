const { chromium } = require('playwright');
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/';
(async()=>{
  const { preview } = await import(R+'n/node_modules/vite/dist/node/index.js');
  const server=await preview({root:R+'n',logLevel:'error',preview:{port:0,host:'127.0.0.1',open:false}});
  const base=server.resolvedUrls.local[0];
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  for (const [w,h,q] of [[1440,900,'lang=en&sel=tokyo'],[390,844,'lang=ja&sel=osaka']]) {
    const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1});
    const page=await ctx.newPage();
    await page.goto(`${base}?${q}&still=1`); await page.waitForSelector('html[data-ready="1"]'); await page.waitForTimeout(1000);
    await page.evaluate(()=>document.querySelector('#table summary').click()); await page.waitForTimeout(800);
    const info=await page.evaluate(()=>{const d=document.querySelector('dialog');const rows=[...d.querySelectorAll('tbody.table-rows tr')].slice(0,3).map(r=>r.textContent.replace(/\s+/g,' ').trim());const sum=d.querySelector('tbody.table-summary tr, tbody:not(.table-rows) tr');return {open:d.open,rows:d.querySelectorAll('tbody.table-rows tr').length,first:rows,summary:sum&&sum.textContent.replace(/\s+/g,' ').trim(),caption:(d.querySelector('caption')||{}).textContent,r:(()=>{const b=d.getBoundingClientRect();return [b.left,b.top,b.right,b.bottom].map(Math.round)})()}});
    console.log(w,JSON.stringify(info));
    await page.screenshot({path:R+`review/shots/ops-table-${w}.png`,timeout:120000});
    await ctx.close();
  }
  await browser.close(); server.httpServer.close();
})();
