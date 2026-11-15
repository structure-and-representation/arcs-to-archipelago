import { readFileSync } from 'node:fs';
const M='/tmp/claude-0/-home-user/eb10e208-1ede-56b5-bfaa-91a18a149f17/scratchpad/n/';
const { geoLayout } = await import(M+'src/geometry/layout.js');
const { createStore } = await import(M+'src/state.js');
const { createCameraRig } = await import(M+'src/scene/cameraRig.js');
const real = JSON.parse(readFileSync(M+'public/data/prefectures.json','utf8'));
const g = geoLayout(real);
const renderer = { layout:{line:(await import(M+'src/geometry/layout.js')).lineLayout(),geo:g.pos,bounds:g.bounds,northAngle:g.northAngle}, st:{width:1440,height:900}, getState(){return this.st}, setView(){}, setLean(){} };
const store = createStore({});
const rig = createCameraRig({store, renderer});
console.log('start morph', store.get().morph);
// external writer (e.g. chapters scroll-linked morph)
store.set({morph:0.5});
console.log('after external set', store.get().morph);
renderer.st = {width:1440,height:901}; rig.resize();
console.log('after rig.resize()', store.get().morph, '(external 0.5 reverted?)');
// camera change after external morph
store.set({morph:0.5}); store.set({camera:'oblique'});
for (let i=0;i<5;i++) rig.update(0.2);
console.log('mid-tween morph', store.get().morph);
for (let i=0;i<20;i++) rig.update(0.2);
console.log('end morph', store.get().morph);
// external morph while tween in progress
store.set({camera:'top'}); rig.update(0.1); store.set({morph:0}); rig.update(0.1); console.log('external morph=0 during tween ->', store.get().morph);
// reentrancy order
const s2 = createStore({}); const log=[];
s2.subscribe((s,c)=>{log.push('A:'+c.join()+':'+s.year+'/'+s.chapter); if(c.includes('chapter')) s2.set({year:2013});});
s2.subscribe((s,c)=>{log.push('B:'+c.join()+':'+s.year+'/'+s.chapter)});
s2.set({chapter:2}); console.log(log);
