'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js');
const materials=require('../tools/build-gsa-graded-course.cjs').load({root,releasePath:'curriculum/gsa-graded-course/release.json'}).materials;
const NOW='2026-10-27T00:00:00.000Z';
function input(material){
 const binding=P.freezeMaterialBinding(material,{assessment:A});
 const answers=Object.fromEntries(binding.material.questions.map(q=>[q.id,q.type==='single'?q.options.find(v=>!q.answers.includes(v)):'not an original answer']));
 return P.toRecord({id:'immutable-gsa-'+material.source.publicSourceId,materialId:material.id,taskId:'reading',courseDay:173,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-26T23:59:00.000Z',submittedAt:NOW,activeSeconds:60,exposureAtStart:'seen',answers,userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:binding},material,173,A);
}
function environment(){
 const values=new Map([['ielts52-data-generation-v1','synthetic-cache-gsa']]),events=new Map(),storage={profileId:'legacy',getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[Date.parse(NOW)+60000]));}static now(){return Date.parse(NOW)+60000;}}
 const context=vm.createContext({console,queueMicrotask,setImmediate,TextEncoder,TextDecoder,URLSearchParams,URL,location:{search:''},Date:Clock,crypto:crypto.webcrypto,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}}});
 vm.runInContext('globalThis.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));',context);
 const helper=vm.runInContext('(function(){const module={exports:{}};'+fs.readFileSync(path.join(__dirname,'records-archive-idb-fixture.cjs'),'utf8')+';return module.exports;})()',context);
 context.indexedDB=helper.createIndexedDBFixture().indexedDB;
 context.IELTSProfiles={current:()=>({id:'legacy'}),storage:()=>storage,scopeKey:key=>'synthetic-immutable-gsa:'+key,assertFresh(){},isPreview:()=>false};
 context.addEventListener=(type,fn)=>{if(!events.has(type))events.set(type,[]);events.get(type).push(fn);};
 context.dispatchEvent=event=>{for(const fn of events.get(event.type)||[])fn(event);};
 for(const name of ['record-snapshot-index','assessment-core','course-player','mistake-book','learning-records'])vm.runInContext(fs.readFileSync(path.join(root,'assets',name+'.js'),'utf8'),context,{filename:name+'.js'});
 context.document={};context.IELTSUserData={assertReady(){},status:()=>({state:'ready'}),syncNow:async()=>{}};
 return{context,values,client:value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context)};
}
test('immutable authoritative Records preserve all new public errors through Mistakes capture, sync and correction',async()=>{
 const f=environment(),R=f.context.IELTSRecords,M=f.context.IELTSMistakes,I=f.context.IELTSRecordSnapshotIndex;
 for(const material of materials)await R.record(f.client(input(material)));
 const rows=await R.list(),original=JSON.stringify(rows),bookBefore=f.values.get(M.KEY);
 assert.equal(rows.length,5);assert.ok(I.receipt(rows));assert.ok(Object.isFrozen(rows));
 for(const row of rows){assert.ok(Object.isFrozen(row));const cached=I.parsedAnswer(row);assert.equal(cached.available,true);assert.ok(Object.isFrozen(cached.value));M.captureRecord(row,{materials:f.client(materials)});}
 await M.syncRecords(rows);
 assert.equal(M.forDay(173).items.length,30);assert.equal(f.values.get(M.KEY),bookBefore,'Read-only consumers cannot rewrite historical errors');
 assert.equal(JSON.stringify(rows),original);
 const summary=M.summary(173),answers=Object.fromEntries(summary.remainingItems.map(item=>[item.id,{answer:item.question.answers[0],media:[]}])) ;
 M.submitPage(173,f.client(answers),{token:summary.token});
 assert.equal(M.summary(173).remaining,0);
 for(const row of rows)assert.equal(M.recordCorrectionStatus(row).corrected,true);
 assert.equal(JSON.stringify(await R.list()),original,'Correction cannot overwrite the immutable original attempts');
});
