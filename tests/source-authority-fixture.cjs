'use strict';
// Executes the existing real Load/Controller/Player fixture with a real Records
// store. Only source IO, the public clock and Web Locks are synthetic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{manager}=require('./lease-locks.cjs');
const base=path.resolve(process.env.CACHE_AUDIT_BASE||path.join(__dirname,'..')),full=path.join(base,'tests/year-first-use-consumers.test.cjs'),text=fs.readFileSync(full,'utf8'),prefix=text.slice(0,text.indexOf('\ntest(')),anchor='if(options.window)Object.assign(win,options.window);',box={exports:{}};
assert.equal(prefix.split(anchor).length,2);new Function('require','__dirname','module',prefix.replace(anchor,anchor+'options.beforePlayer?.(win,context);').replace('search:options.yearEnd?', 'storage:options.sharedStorage,search:options.yearEnd?')+'\nmodule.exports={flow,pack};')(createRequire(full),path.dirname(full),box);
async function fixture(options={}){
 if(process.env.CACHE_AUDIT_NO_BRAND==='1')options={...options,noBrand:true};
 let state=options.initialRecords?{schemaVersion:1,records:options.initialRecords}:null,gate=null,pending=new Set(),control={};const locks=Object.hasOwn(options,'locks')?options.locks:manager();
 const f=await box.exports.flow({actual:true,...options,beforePlayer(win,context){
  win.navigator.locks=locks;win.IELTSProfiles.isPreview=()=>false;win.IELTSUserData.syncNow=async()=>{};
  const seed=win.IELTSRecords.list(),source=file=>{const local=path.join(base,'assets',file);assert.ok(fs.existsSync(local),'required real test asset '+file);return fs.readFileSync(local,'utf8');};
  for(const file of ['assessment-core.js','record-snapshot-index.js','learning-records.js','year-planner.js']){if(file==='record-snapshot-index.js'&&options.noBrand&&!fs.existsSync(path.join(base,'assets',file)))continue;vm.runInNewContext(source(file),context,{filename:file});}
  if(options.noBrand)win.IELTSRecordSnapshotIndex={...win.IELTSRecordSnapshotIndex,available:()=>false};
  const realm=vm.runInNewContext('JSON',context),copy=value=>realm.parse(JSON.stringify(value)),adapter={read:async()=>{if(options.failRead)throw Error('synthetic source read unavailable');if(gate){gate.enter();await gate.promise;}if(!state)state={schemaVersion:1,records:await seed};options.beforeSourceReturn?.(control);return copy(state);},transaction:async fn=>{if(!state)state={schemaVersion:1,records:await seed};const result=fn(copy(state));state=JSON.parse(JSON.stringify(result.state));return copy(result.value);}},api=win.IELTSRecords,store=api.createStore(adapter,{now:()=>new context.Date().toISOString(),notify:record=>win.dispatchEvent(new context.CustomEvent('ielts:records-changed',{detail:{profileId:'legacy',id:record?.id}}))});
  win.IELTSRecords={...api,list:filter=>{const promise=store.list(filter);pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;},update:(id,patch,key)=>store.update(id,copy(patch),key),record:input=>store.record(copy(input))};
  control={raw:()=>state,replace(next){state=JSON.parse(JSON.stringify(next));},hold(){let release,enter;const promise=new Promise(r=>release=r),entered=new Promise(r=>enter=r);gate={promise,enter};return{entered,release(){gate=null;release();}};}};options.ready?.({win,context,control});
 }});
 const flush=async()=>{for(let i=0;i<30;i++){if(!gate&&pending.size)await Promise.allSettled([...pending]);await new Promise(setImmediate);}};await flush();await f.refresh();await flush();await f.refresh();return{...f,control,flush,locks};
}
const tick=()=>new Promise(setImmediate),close=async f=>{f.win.dispatchEvent(new f.context.CustomEvent('pagehide'));for(let i=0;i<10;i++)await tick();};
module.exports={fixture,pack:box.exports.pack,base,tick,close};
