const http=require('http'),fs=require('fs'),path=require('path');
const { chromium } = require('playwright');
const DIST='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/m/dist';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.topojson':'application/json'};
const srv=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'); let p=u.pathname;
  if(!p.startsWith('/works/arcs')) {res.statusCode=404;return res.end('nf');}
  let rel=p.slice('/works/arcs'.length);
  if(rel===''||rel==='/') rel='/index.html';
  const f=path.join(DIST,rel);
  if(fs.existsSync(f)&&fs.statSync(f).isFile()){res.setHeader('content-type',types[path.extname(f)]||'application/octet-stream');return res.end(fs.readFileSync(f));}
  res.statusCode=404;res.end('nf '+rel);
}).listen(0,async()=>{
  const port=srv.address().port;
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  async function run(label,url,opts={}){
    const ctx=await browser.newContext({viewport:{width:1000,height:700}});
    const page=await ctx.newPage(); const logs=[];
    page.on('console',m=>{ if(['error','warning'].includes(m.type())) logs.push(m.type()+': '+m.text().slice(0,160))});
    page.on('pageerror',e=>logs.push('pageerror: '+e.message.slice(0,160)));
    page.on('response',r=>{if(r.status()>=400)logs.push('http '+r.status()+' '+r.url())});
    await page.goto(url);
    await page.waitForTimeout(2500);
    const info=await page.evaluate(()=>({ready:document.documentElement.dataset.ready,error:document.documentElement.dataset.error,fallback:document.documentElement.dataset.fallback,msg:document.getElementById('message').hidden?null:document.getElementById('message').textContent, base:document.baseURI}));
    console.log(label,JSON.stringify(info),logs);
    await ctx.close();
  }
  const b=`http://127.0.0.1:${port}`;
  await run('slashless',b+'/works/arcs');
  await run('slash',b+'/works/arcs/');
  await run('slashless+query',b+'/works/arcs?cam=top&sel=osaka');
  await run('sel=constructor',b+'/works/arcs/?sel=constructor');
  await run('cam=toString',b+'/works/arcs/?cam=toString');
  await browser.close();
  // no-webgl
  const b2=await chromium.launch({args:['--disable-gpu','--disable-3d-apis','--disable-webgl','--disable-webgl2']});
  const ctx=await b2.newContext(); const page=await ctx.newPage(); const logs=[];
  page.on('console',m=>{ if(['error','warning'].includes(m.type())) logs.push(m.type()+': '+m.text().slice(0,200))});
  page.on('pageerror',e=>logs.push('pageerror: '+e.message.slice(0,160)));
  await page.goto(b+'/works/arcs/'); await page.waitForTimeout(2500);
  console.log('nowebgl',JSON.stringify(await page.evaluate(()=>({ready:document.documentElement.dataset.ready,error:document.documentElement.dataset.error,fallback:document.documentElement.dataset.fallback,msg:document.getElementById('message').hidden?null:document.getElementById('message').textContent}))),logs);
  await b2.close(); srv.close();
});
