'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {helper}=require('./daily-review-fixture.cjs');
const {Element,fixture}=helper('course-player-dom.test.cjs','Element,fixture');
const A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js'),Oral=require('../assets/oral-practice.js');
const reference='A. This is the first spoken segment.\nB. This is the second spoken segment.';
const parts=Oral.spokenReferenceParts(reference,65),hash='a'.repeat(64);
const audio=(text,src,extra={})=>({text,src,sha256:hash,bytes:1000,...extra});
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
Element.prototype.pause=function(){this.paused=true;};
Element.prototype.load=function(){};
Element.prototype.play=async function(){this.paused=false;};

async function mounted(rows,{storage,globalAudio,materialReference=reference,id='speaking-model-fixture'}={}){
  const f=fixture({id,skill:'speaking',title:'Synthetic model reading',type:'foundation',week:1,level:'A2',pool:'training',reference:materialReference,prompt:'Describe a plan.',questions:[],rubric:{taskType:'foundation'},...(rows===undefined?{}:{oralModelAudio:rows})},{storage,window:{IELTSMediaLibrary:{list:async()=>[],get:async()=>null}}});
  Object.assign(f.win,{setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},...(globalAudio?{IELTSOralModelAudio:globalAudio}:{})});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/oral-practice.js'),'utf8'),f.win,{filename:'oral-practice.js'});
  await settle();
  return f;
}
async function open(f){await f.win.IELTSTodayNavigation.resumeNext('speaking',f.mat.id);await settle();}
function controls(f){const host=f.nodes.get('courseOutput'),section=host.querySelector('.oral-practice');assert.ok(section,'real oral-practice DOM should be mounted');const demo=section.querySelectorAll('button').find(button=>/听本段正确读音/.test(button.textContent));const select=section.querySelector('select'),playback=section.querySelector('audio');assert.ok(demo&&select&&playback);return{demo,select,playback,section};}

test('real course and oral DOM play exact per-part model audio, not full-reference audio',async()=>{
  assert.equal(parts.length,2);
  const f=await mounted([audio(reference,'audio/curriculum/full.mp3'),audio(parts[0],'audio/curriculum/first.mp3'),audio(parts[1],'audio/curriculum/second.mp3')]);
  await open(f);const ui=controls(f);await ui.demo.fire('click');assert.equal(ui.playback.src,'audio/curriculum/first.mp3');assert.equal(ui.playback.paused,false);
  ui.select.value='1';await ui.select.fire('change');await ui.demo.fire('click');assert.equal(ui.playback.src,'audio/curriculum/second.mp3');
  const draft=Object.values(JSON.parse(f.map.get(P.KEY)).drafts)[0];assert.deepEqual(draft.materialBinding.material.oralModelAudio,f.mat.oralModelAudio);
  assert.equal(draft.materialBinding.contentHash,A.materialContentHash(draft.materialBinding.material));assert.equal(f.records().length,0);
});

test('unsafe paths, invalid metadata and non-exact or full text fall back to the existing global library',async()=>{
  const fallbackCalls=[],globalAudio={get(text){fallbackCalls.push(text);return{reference:text,src:'audio/oral-models/legacy.mp3'};}};
  for(const bad of [audio(reference,'audio/curriculum/full.mp3'),audio(parts[0]+' ','audio/curriculum/wrong.mp3'),audio(parts[0],'https://foreign.example/model.mp3'),audio(parts[0],'audio/../wrong.mp3'),audio(parts[0],'audio//wrong.mp3'),audio(parts[0],'audio/%2e%2e/wrong.mp3'),audio(parts[0],'audio/curriculum/bad.mp3',{sha256:'bad'}),audio(parts[0],'audio/curriculum/bad.mp3',{bytes:0})]){
    const f=await mounted([bad],{globalAudio});await open(f);const ui=controls(f);await ui.demo.fire('click');assert.equal(ui.playback.src,'audio/oral-models/legacy.mp3');
  }
  assert.equal(fallbackCalls.length,8);assert.ok(fallbackCalls.every(text=>text===parts[0]));
});

test('conflicting entries cannot associate different files or different parts with the same source',async()=>{
  for(const rows of [[audio(parts[0],'audio/one.mp3'),audio(parts[0],'audio/two.mp3')],[audio(parts[0],'audio/same.mp3'),audio(parts[1],'audio/same.mp3')]]){
    const f=await mounted(rows,{globalAudio:{get:text=>({reference:text,src:'audio/oral-models/legacy.mp3'})}});await open(f);const ui=controls(f);await ui.demo.fire('click');assert.equal(ui.playback.src,'audio/oral-models/legacy.mp3');
    ui.select.value='1';await ui.select.fire('change');await ui.demo.fire('click');assert.equal(ui.playback.src,'audio/oral-models/legacy.mp3');
  }
});

test('a frozen draft retains the original segment audio when the current material later differs',async()=>{
  const original=[audio(parts[0],'audio/curriculum/original-one.mp3'),audio(parts[1],'audio/curriculum/original-two.mp3')],f=await mounted(original);await open(f);
  const saved=JSON.parse(f.map.get(P.KEY)),draft=Object.values(saved.drafts)[0],before=JSON.stringify(draft.materialBinding);
  const altered=reference.replace('first spoken','changed spoken'),f2=await mounted([audio(parts[0],'audio/curriculum/new.mp3')],{storage:f.map,materialReference:altered});
  await f2.win.IELTSTodayNavigation.resumeDraft(draft.id);await settle();const ui=controls(f2);assert.equal(ui.section.querySelector('.oral-practice-reference').textContent,parts[0]);await ui.demo.fire('click');assert.equal(ui.playback.src,'audio/curriculum/original-one.mp3');
  const reloaded=JSON.parse(f2.map.get(P.KEY)).drafts[draft.id];assert.equal(JSON.stringify(reloaded.materialBinding),before);assert.equal(f2.records().length,0);
});

test('legacy material binding bytes and resolution stay unchanged when the new field is absent',()=>{
  const material={id:'saved-speaking-before-audio',version:'1',title:'Saved speaking material',skill:'speaking',type:'foundation',week:1,level:'A2',pool:'training',reference:'A. This is the first segment.\nB. This is the second segment.',prompt:'Talk about a plan.',questions:[]};
  const binding=P.freezeMaterialBinding(material,{assessment:A});assert.equal(binding.contentHash,'46169d6f27cfe1833b05c06f03118b3777b22a4973e68c5bfa5f9d5797d2e360');assert.equal(Object.hasOwn(binding.material,'oralModelAudio'),false);
  const draft={materialId:material.id,taskId:'speaking',materialBinding:binding};const restored=P.resolveDraftMaterial(draft,material,{assessment:A});assert.equal(restored.compatible,true);assert.deepEqual(restored.binding,binding);
});
