const { chromium } = require('playwright');
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/';
(async()=>{
  const { preview } = await import(R+'n/node_modules/vite/dist/node/index.js');
  const server=await preview({root:R+'n2',logLevel:'error',preview:{port:0,host:'127.0.0.1',open:false}});
  const base=server.resolvedUrls.local[0];
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const ctx=await browser.newContext({viewport:{width:390,height:844}}); const page=await ctx.newPage();
  await page.goto(`${base}?lang=ja&sel=osaka&still=1`); await page.waitForSelector('html[data-ready="1"]'); await page.waitForTimeout(800);
  await page.evaluate(()=>document.querySelector('#table summary').click()); await page.waitForTimeout(600);
  console.log(JSON.stringify(await page.evaluate(()=>{const d=document.querySelector('dialog');const t=d.querySelector('table');const sc=[...d.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflowX!=='visible').map(e=>e.className||e.tagName);const ths=[...d.querySelectorAll('thead th')].map(th=>{const r=th.getBoundingClientRect();return [Math.round(r.left),Math.round(r.right)]});return {dlg:[d.clientWidth],table:[t.getBoundingClientRect().left,t.getBoundingClientRect().right].map(Math.round),ths,scrollable:sc}})));
  await browser.close(); server.httpServer.close();
})();
