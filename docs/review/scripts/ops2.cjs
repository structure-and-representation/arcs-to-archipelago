const { chromium } = require('playwright');
const R='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/';
(async()=>{
  const { preview } = await import(R+'n/node_modules/vite/dist/node/index.js');
  const server=await preview({root:R+'n',logLevel:'error',preview:{port:0,host:'127.0.0.1',open:false}});
  const base=server.resolvedUrls.local[0];
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  for (const [w,h] of [[1440,900],[390,844]]) {
    const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,reducedMotion:'reduce'});
    const page=await ctx.newPage();
    await page.goto(`${base}?lang=en&still=1`); await page.waitForSelector('html[data-ready="1"]'); await page.waitForTimeout(1200);
    try{await page.click('.ctl-cam[data-camera="top"]',{timeout:3000});console.log(w,'top click ok')}catch(e){console.log(w,e.message.split('\n').slice(0,6).join(' | ').slice(0,400))}
    const r=await page.evaluate(()=>{const b=document.querySelector('.ctl-cam[data-camera="top"]').getBoundingClientRect();const cx=b.left+b.width/2,cy=b.top+b.height/2;const e=document.elementFromPoint(cx,cy);const s=document.querySelector('#table summary').getBoundingClientRect();return {btn:[b.left,b.top,b.right,b.bottom].map(Math.round),centerHit:e&&(e.tagName+'#'+e.id+'.'+e.className),summary:[s.left,s.top,s.right,s.bottom].map(Math.round)}});
    console.log(JSON.stringify(r));
    // table open via controls button
    await page.evaluate(()=>document.querySelector('.ctl-table').click()); await page.waitForTimeout(800);
    console.log('dialog open after ctl-table click:',await page.evaluate(()=>[...document.querySelectorAll('dialog')].map(d=>d.open)), 'details open', await page.evaluate(()=>document.getElementById('table').open));
    await ctx.close();
  }
  await browser.close(); server.httpServer.close();
})();
