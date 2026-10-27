'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const base=path.resolve(process.env.ESSENTIAL_REPLAY_PROJECT_ROOT||path.join(__dirname,'..'));
const appSource=path.resolve(process.env.ESSENTIAL_REPLAY_APP_SOURCE||path.join(__dirname,'../assets/essential-vocabulary-app.js'));
const memoryAppSource=path.resolve(process.env.ESSENTIAL_REPLAY_MEMORY_SOURCE||path.join(__dirname,'../assets/memory-app.js'));
const filename=path.join(base,'tests/essential-vocabulary-app-dom.test.cjs'),text=fs.readFileSync(filename,'utf8'),marker=text.indexOf("test('day 1 keeps"),needle="path.join(assets,'essential-vocabulary-app.js')";
if(marker<0||text.slice(0,marker).split(needle).length!==2)throw Error('Existing real vocabulary DOM fixture seam changed');
const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
m._compile(text.slice(0,marker).replace(needle,JSON.stringify(appSource))+'\nmodule.exports={fixture,train,button,tick};',filename);
const {fixture,train,button,tick}=m.exports;
const copy=value=>JSON.parse(JSON.stringify(value)),settle=async()=>{for(let i=0;i<14;i++)await tick();};
function nativeFixture(options={}) {
 const f=fixture(options),context=vm.createContext(f.win);
 Object.assign(f.win,{queueMicrotask,setImmediate});
 vm.runInContext("globalThis.structuredClone=function clone(v){if(v===null||v===undefined||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);const out={};for(const k of Object.keys(v))out[k]=clone(v[k]);return out;};",context);
 const cache=vm.runInContext('(function(){const module={exports:{}};'+fs.readFileSync(path.join(base,'tests/user-data-cache-fixture.cjs'),'utf8')+';return module.exports;})()',context).fakeBrowser();
 f.win.indexedDB=cache.indexedDB;f.win.IELTSProfiles.scopeKey=key=>'essential-replay-isolated:'+key;
 f.storage.setItem('ielts52-daily-plan-v1',JSON.stringify({schema:1,startDate:new Date(Date.now()-5*86400000).toISOString().slice(0,10)}));
 // The native Records transaction is production code; only IndexedDB is a public synthetic double.
 vm.runInContext(fs.readFileSync(path.join(base,'assets/assessment-core.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(base,'assets/mistake-book.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(base,'assets/learning-records.js'),'utf8'),context);
 const native=f.win.IELTSRecords,encode=value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context);
 const R={...native,record:input=>native.record(encode(input)),update:(id,patch,key)=>native.update(id,encode(patch),key),importState:(value,opts)=>native.importState(encode(value),opts)};
 f.win.IELTSRecords=R;
 return Object.assign(f,{R,cache,context,nativeMount:extra=>f.mount({records:R,...extra}),loadMemoryApp(){f.win.IELTSMemorySession=require(path.join(base,'assets/memory-session.js'));f.win.window=f.win;vm.runInContext(fs.readFileSync(memoryAppSource,'utf8'),context);}});
}
async function committed(options={}) {
 const f=nativeFixture(options);let now=Date.now();const app=f.nativeMount({inline:true,now:()=>Math.max(now,Date.now())});await app.start();await train(f);await button(f.practice,'提交三轮原稿').click();await settle();
 const works=await f.R.list();now=Math.max(Date.now(),...works.map(r=>Date.parse(r.submittedAt)));
 app.setRecords(works);const batch=Object.values(f.memory.read().essential.batches)[0];
 return{f,app,batch,record:works[0],setNow:value=>{now=value;},now:()=>now};
}
async function learn(f){
 const words=f.controller.getState().words;
 for(let index=0;index<words.length;index++){
  for(let trial=0;trial<3;trial++){const card=f.practice.querySelectorAll('.vocab-word-card')[index],input=card.querySelector('input');input.value=words[index].word;await input.fire('input');await button(card,'核对本遍输入').click();}
  for(let trial=0;trial<3;trial++){const card=f.practice.querySelectorAll('.vocab-word-card')[index];await button(card,'开始第 '+(trial+1)+' 次跟读录音').click();await button(card,'结束本次录音并评测').click();}
 }
 await button(f.practice,'学完了，开始第 1 轮').click();
}
module.exports={base,appSource,memoryAppSource,copy,settle,train,learn,button,nativeFixture,committed};
