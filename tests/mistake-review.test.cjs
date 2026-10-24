'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),M=require('../assets/mistake-book.js'),UI=require('../assets/mistake-review.js');
const NOW='2026-10-24T12:00:00.000Z';
class Element{
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.events={};this.dataset={};this.attributes={};this.className='';this.value='';this.checked=false;this.disabled=false;this.textContent='';this.classList={add:()=>{},toggle:()=>{}};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}setAttribute(k,v){this.attributes[k]=String(v);}addEventListener(k,fn){(this.events[k]||=[]).push(fn);}querySelectorAll(selector){return this.children.flatMap(n=>[...(selector==='input'&&n.tagName==='INPUT'?[n]:[]),...n.querySelectorAll(selector)]);}
}
function nodes(root,predicate){return[root,...root.children.flatMap(n=>nodes(n,predicate))].filter(predicate);}
function fixture({subjective=false,...options}={}){
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))},store=M.createStore(storage,{now:()=>NOW});
 const doc={createElement:tag=>new Element(tag,doc)},host=new Element('section',doc);
 function capture(n,extra={}){return store.capture({dayNumber:1,source:'test',materialId:'m1',recordId:'rec-'+n,skill:subjective?'writing':'reading',questionId:'q'+n,title:'Question '+n,question:{id:'q'+n,type:subjective?'subjective':'short',prompt:'Question '+n,answers:subjective?[]:['correct'+n]},originalAnswer:'wrong'+n,evaluation:{method:subjective?'none':'objective',result:subjective?'pending':'revise'},at:NOW,...extra});}
 capture(1);if(!subjective)capture(2);let recapCalls=0,completionCalls=0;
 const handle=UI.mount({container:host,day:1,mistakes:M,store,sync:false,records:async()=>[{id:'rec-1',answer:'Real daily work'}],requestRecap:async()=>{recapCalls++;return{ok:true,status:'complete',recap:'Today, review the word student.'};},onComplete:async()=>{completionCalls++;},...options});
 return{store,host,handle,capture,get recapCalls(){return recapCalls;},get completionCalls(){return completionCalls;},cards:()=>nodes(host,n=>n.className==='mistake-card'),draft(n,value){const item=store.summary(1).items.find(i=>i.questionId==='q'+n);store.saveDraft(1,item.id,{answer:value,media:[]});}};
}
test('one page shows all daily errors and blocks recap until every remaining answer passes',async()=>{
 const f=fixture();await f.handle.ready;assert.equal(f.cards().length,2);assert.equal(f.recapCalls,0);assert.equal(f.handle.isComplete(),false);
 f.draft(1,'correct1');f.draft(2,'wrong2');await f.handle.refresh(false);await f.handle.submitPage();assert.equal(f.cards().length,1);assert.equal(f.store.summary(1).passed,1);assert.equal(f.recapCalls,0);
 f.draft(2,'correct2');await f.handle.refresh(false);await f.handle.submitPage();assert.equal(f.cards().length,0);assert.equal(f.recapCalls,1);assert.equal(f.completionCalls,1);assert.equal(f.handle.isComplete(),true);assert.equal(f.store.summary(1).rounds,2);
 await f.handle.refresh(false);assert.equal(f.completionCalls,1);assert.equal(f.recapCalls,1);f.handle.destroy();
});
test('a blank item blocks the whole submission and keeps the entered draft',async()=>{
 const f=fixture();await f.handle.ready;f.draft(1,'correct1');await f.handle.refresh(false);await f.handle.submitPage();assert.equal(f.store.summary(1).rounds,0);assert.equal(f.store.summary(1).drafts[f.store.summary(1).items[0].id].answer,'correct1');assert.equal(f.cards().length,2);assert.equal(f.recapCalls,0);f.handle.destroy();
});
test('reopening the review restores drafts, original errors and unresolved-only rounds',async()=>{
 const f=fixture();await f.handle.ready;f.draft(1,'correct1');f.draft(2,'wrong2');await f.handle.refresh(false);await f.handle.submitPage();const remaining=f.store.summary(1).remainingItems[0];f.store.saveDraft(1,remaining.id,{answer:'still editing',media:[]});f.handle.destroy();
 const reopened=UI.mount({container:f.host,day:1,mistakes:M,store:f.store,sync:false,requestRecap:async()=>{throw Error('should not request');}});await reopened.ready;assert.equal(nodes(f.host,n=>n.className==='mistake-card').length,1);assert.equal(nodes(f.host,n=>n.dataset.answerFor===remaining.id)[0].value,'still editing');assert.equal(f.store.summary(1).items[0].originalAnswer,'wrong1');reopened.destroy();
});
test('a failed subjective service preserves the new answer as pending and cannot produce recap',async()=>{
 const f=fixture({subjective:true,evaluateSubjective:async()=>{throw Error('provider unavailable');}});await f.handle.ready;f.draft(1,'I am a student.');await f.handle.refresh(false);await f.handle.submitPage();const s=f.store.summary(1),r=f.store.read().days[1].rounds[0].results[0];assert.equal(s.pending,1);assert.equal(s.remaining,1);assert.equal(r.answer,'I am a student.');assert.match(r.feedback,/provider unavailable/);assert.equal(f.recapCalls,0);f.handle.destroy();
 assert.equal(s.drafts[s.items[0].id].answer,'I am a student.');
});
test('a new pending writing original prevents recap without being added as a wrong answer',async()=>{
 const pending={id:'pending-writing',dayNumber:1,materialId:'write-pending',skill:'writing',source:'course-player',title:'Pending writing',answer:'I am a student.',evaluation:{method:'none',result:'pending',feedback:'Waiting.'}},f=fixture({records:async()=>[pending]});await f.handle.ready;f.draft(1,'correct1');f.draft(2,'correct2');await f.handle.refresh(false);await f.handle.submitPage();assert.equal(f.store.summary(1).allCorrect,true);assert.equal(f.store.summary(1).total,2);assert.equal(f.recapCalls,0);assert.equal(f.handle.isComplete(),false);f.handle.destroy();
});
test('an AI recap error remains unfinished and retry preserves all successful corrections',async()=>{
 let calls=0;const f=fixture({requestRecap:async()=>{calls++;if(calls===1)throw Error('AI disconnected');return{ok:true,status:'complete',recap:'Try recalling student tomorrow.'};}});await f.handle.ready;f.draft(1,'correct1');f.draft(2,'correct2');await f.handle.refresh(false);await f.handle.submitPage();assert.equal(f.store.summary(1).allCorrect,true);assert.equal(f.handle.isComplete(),false);assert.equal(f.store.summary(1).rounds,1);assert.equal(nodes(f.host,n=>n.dataset.action==='retry-recap').length,1);await f.handle.generateRecap();assert.equal(f.handle.isComplete(),true);assert.equal(f.store.summary(1).rounds,1);f.handle.destroy();
});
test('a new error arriving during AI recap prevents stale completion',async()=>{
 let resolve;const f=fixture({requestRecap:()=>new Promise(r=>resolve=r)});await f.handle.ready;f.draft(1,'correct1');f.draft(2,'correct2');await f.handle.refresh(false);const submitting=f.handle.submitPage();await new Promise(r=>setImmediate(r));f.capture(3);resolve({ok:true,status:'complete',recap:'An obsolete recap'});await submitting;assert.equal(f.handle.isComplete(),false);assert.equal(f.store.summary(1).remaining,1);assert.equal(f.store.summary(1).completionValid,false);f.handle.destroy();
});

test('daily core readiness blocks an early recap even when every real mistake is corrected',async()=>{
 let ready=false;const f=fixture({readyForRecap:()=>({ready,reason:'还缺本日听力、口语和阅读的完整提交。'})});await f.handle.ready;f.draft(1,'correct1');f.draft(2,'correct2');await f.handle.refresh(false);await f.handle.submitPage();assert.equal(f.store.summary(1).allCorrect,true);assert.equal(f.recapCalls,0);assert.equal(f.completionCalls,0);assert.equal(f.handle.isComplete(),false);assert.equal(nodes(f.host,n=>n.dataset.action==='check-day-readiness').length,1);assert.ok(nodes(f.host,n=>n.textContent.includes('还缺本日听力')).length>0);ready=true;await f.handle.refresh(false);assert.equal(f.recapCalls,1);assert.equal(f.completionCalls,1);assert.equal(f.handle.isComplete(),true);f.handle.destroy();
});

test('an old partial-day recap is preserved without being delivered as a complete daily result',async()=>{
 const f=fixture();await f.handle.ready;f.draft(1,'correct1');f.draft(2,'correct2');await f.handle.refresh(false);await f.handle.submitPage();assert.equal(f.store.summary(1).completionValid,true);f.handle.destroy();let deliveries=0,requests=0;const view=UI.mount({container:f.host,day:1,mistakes:M,store:f.store,sync:false,records:async()=>[{id:'old-work',answer:'A supplementary work.'}],readyForRecap:()=>false,requestRecap:async()=>{requests++;throw Error('should not request');},onComplete:()=>{deliveries++;}});await view.ready;assert.equal(view.isComplete(),false);assert.equal(f.store.summary(1).completionValid,true);assert.equal(deliveries,0);assert.equal(requests,0);view.destroy();
});

test('core readiness is checked again after an AI response before recording daily completion',async()=>{
 let ready=true,resolve;const f=fixture({readyForRecap:()=>ready,requestRecap:()=>new Promise(r=>resolve=r)});await f.handle.ready;f.draft(1,'correct1');f.draft(2,'correct2');await f.handle.refresh(false);const submitting=f.handle.submitPage();await new Promise(r=>setImmediate(r));ready=false;resolve({ok:true,status:'complete',recap:'A recap produced while the core status changed.'});await submitting;assert.equal(f.store.summary(1).completionValid,false);assert.equal(f.completionCalls,0);assert.equal(f.handle.isComplete(),false);f.handle.destroy();
});

test('a pending original has a direct retry action and reuses the same work before recap',async()=>{
 let calls=0;const pending={id:'writing-pending',dayNumber:1,materialId:'writing-pending',skill:'writing',source:'course-player',title:'Introduce yourself',answer:'I am Ben.',evaluation:{method:'none',result:'pending',feedback:'Waiting.'}},f=fixture({records:async()=>[pending],onPendingReview:async record=>{calls++;assert.equal(record.id,pending.id);pending.evaluation={method:'ai',result:'pass',feedback:'A real pipeline result supplied by the host callback.'};}});await f.handle.ready;f.draft(1,'correct1');f.draft(2,'correct2');await f.handle.refresh(false);await f.handle.submitPage();assert.equal(f.recapCalls,0);const retry=nodes(f.host,n=>n.dataset.action==='retry-original')[0];assert.equal(retry.dataset.recordId,pending.id);await retry.events.click[0]();assert.equal(calls,1);assert.equal(f.store.summary(1).total,2);assert.equal(f.recapCalls,1);assert.equal(f.handle.isComplete(),true);f.handle.destroy();
});
