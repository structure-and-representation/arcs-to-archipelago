const { chromium } = require('playwright');
let preview;
(async()=>{ ({preview} = await import('/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/m/node_modules/vite/dist/node/index.js'));
  const server=await preview({root:'/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/m',logLevel:'error',preview:{port:0,host:'127.0.0.1',open:false}});
  const base=server.resolvedUrls.local[0];
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1000,height:700}}); const logs=[];
  page.on('console',m=>{ if(['error','warning'].includes(m.type())) logs.push(m.type()+': '+m.text().slice(0,200))});
  page.on('pageerror',e=>logs.push('pageerror: '+e.message.slice(0,200)));
  await page.goto(base+'?still=1'); await page.waitForSelector('html[data-ready="1"]');
  const r=await page.evaluate(async()=>{
    const out={};
    const gl=document.getElementById('stage').getContext('webgl2');
    const info=window.__app.renderer; 
    out.hasDispose=typeof window.__app.dispose;
    // count rAF after dispose
    window.__app.dispose();
    let frames=0; const orig=window.requestAnimationFrame; 
    window.requestAnimationFrame=(cb)=>orig((t)=>{frames++;return cb(t)});
    await new Promise(r=>setTimeout(r,800));
    out.framesAfterDispose=frames;
    out.lost=gl.isContextLost();
    return out;
  });
  console.log(JSON.stringify(r)); console.log(logs.slice(0,6));
  // second: store.set in a throwing subscriber kills loop?
  const page2=await browser.newPage({viewport:{width:1000,height:700}}); const logs2=[];
  page2.on('pageerror',e=>logs2.push('pageerror: '+e.message.slice(0,200)));
  await page2.goto(base+'?still=1'); await page2.waitForSelector('html[data-ready="1"]');
  const r2=await page2.evaluate(async()=>{
    // make a layer-like failure: a frame fn that throws once
    const rd=window.__app.renderer; const orig=rd.render.bind(rd); let n=0; let threw=false;
    rd.render=(t)=>{ if(!threw){threw=true; throw new Error('boom');} n++; return orig(t); };
    await new Promise(r=>setTimeout(r,800));
    return {rendersAfterThrow:n};
  });
  console.log('after one throw in render:',JSON.stringify(r2),logs2);
  await browser.close(); server.httpServer.close();
})();
