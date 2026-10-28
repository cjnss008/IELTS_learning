'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('./record-snapshot-index-fixture.cjs');
function browser(){
 const f=H.environment([]),env=f.env,channels=[],pending=[],events=[];
 class Channel{
  constructor(name){this.name=name;channels.push(this);}
  postMessage(data){for(const other of channels)if(other!==this&&other.name===this.name&&!other.closed)pending.push(()=>other.onmessage?.({data}));}
  close(){this.closed=true;}
 }
 env.BroadcastChannel=Channel;env.queueMicrotask=queueMicrotask;env.setImmediate=setImmediate;
 vm.runInContext('globalThis.structuredClone=v=>JSON.parse(JSON.stringify(v));',env);
 const source=fs.readFileSync(path.join(__dirname,'user-data-cache-fixture.cjs'),'utf8');
 const cache=vm.runInContext('(function(){const module={exports:{}};'+source+';return module.exports.fakeBrowser();})()',env);
 env.indexedDB=cache.indexedDB;
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/learning-records.js'),'utf8'),env);
 env.addEventListener('ielts:records-changed',event=>events.push(event.detail));
 const sync=[];env.IELTSMistakes={syncRecords:rows=>sync.push(H.copy(rows))};
 return{...f,R:env.IELTSRecords,events,sync,deliver:()=>{while(pending.length)pending.shift()();},external:data=>{const sender=new Channel('legacy:ielts52-learning-records-v1');sender.postMessage(data);sender.close();}};
}
test('import can validate saved records while the same page receives its own asynchronous broadcast',async()=>{
 const f=browser(),incoming={schemaVersion:1,records:[H.record('synthetic-broadcast-import')]},gate=f.holdDigest();
 const importing=f.R.importState(f.realm(incoming),{mode:'merge'});await gate.entered;
 assert.equal(f.events.length,1);f.deliver();gate.release();
 assert.deepEqual(H.copy(await importing),{added:1,total:1});assert.equal(f.events.length,1,'one local commit must produce only one local invalidation');
 assert.equal(f.sync.length,1);assert.equal(f.sync[0][0].answer,incoming.records[0].answer);assert.equal((await f.R.exportState()).records.length,1);
});
test('a genuinely external page still invalidates an in-flight read, including older messages without a sender id',async()=>{
 for(const extra of [{},{senderId:'records-page-other'}]){
  const f=browser();await f.R.importState(f.realm({schemaVersion:1,records:[H.record()]}),{mode:'merge'});f.deliver();
  const gate=f.holdDigest(),reading=f.R.list();await gate.entered;f.external({profileId:'legacy',id:null,dayNumber:null,...extra});f.deliver();gate.release();
  await assert.rejects(reading,{code:'RECORD_SNAPSHOT_SOURCE_CHANGED'});assert.equal((await f.R.exportState()).records.length,1);
 }
});
