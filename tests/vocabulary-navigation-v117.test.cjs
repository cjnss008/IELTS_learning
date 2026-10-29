'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {continueFamilyVocabulary}=require('../assets/course-player.js');
function button(){return {disabled:false,textContent:'继续本课词汇',attributes:{},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];}};}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
function harness(overrides={}){const b=button(),messages=[],opened=[],order=[];const args={button:b,paint:async()=>{order.push('paint');},readQueue:()=>{order.push('read');return{next:{day:3,kind:'essential-vocabulary',taskId:'vocabulary',materialId:'synthetic-day3',familyVocabularyContinuation:true}};},openQueued:async value=>{order.push('open');opened.push(value);return true;},isCurrent:()=>true,notice:(message,error)=>messages.push({message,error}),...overrides};return{b,messages,opened,order,args};}

test('day 4 overview hands the actual day 3 debt to the existing queue gate',async()=>{
 const h=harness();assert.equal(await continueFamilyVocabulary(h.args),true);assert.deepEqual(h.order,['paint','read','open']);assert.equal(h.opened.length,1);assert.equal(h.opened[0].day,3);assert.equal(h.opened[0].kind,'essential-vocabulary');assert.equal(h.b.disabled,false);assert.equal(h.b.textContent,'继续本课词汇');assert.equal(h.b.attributes['aria-busy'],undefined);
});
test('retained older drafts and saved work requests are forwarded intact',async()=>{
 for(const debt of [{day:3,kind:'material',taskId:'grammar',materialId:'old',draftId:'preserved-draft'},{day:3,kind:'view',taskId:'vocabulary',materialId:'old',recordId:'preserved-record',waiting:true}]){const h=harness({readQueue:()=>({next:debt})});assert.equal(await continueFamilyVocabulary(h.args),true);assert.equal(h.opened[0],debt);}
});
test('blocked, budget, rest, day-ended and missing entries explain waiting without opening',async()=>{
 for(const next of [{kind:'blocked',reason:'先核对旧草稿'},{kind:'budget',reason:'预算不足'},{kind:'rest',reason:'休息中'},{kind:'day-ended',reason:'今日已结束'},{kind:'essential-vocabulary',fitsBudget:false,reason:'预算不足'},{kind:'essential-vocabulary',waiting:true,reason:'同源原稿待核验'},null]){const h=harness({readQueue:()=>({next})});assert.equal(await continueFamilyVocabulary(h.args),false);assert.equal(h.opened.length,0);assert.ok(h.messages.at(-1).error);assert.match(h.messages.at(-1).message,next?.reason?new RegExp(next.reason):/队列/);assert.equal(h.b.disabled,false);}
});
test('the waiting feedback paints before queue work and a double click does not open twice',async()=>{
 const wait=deferred(),h=harness({paint:()=>wait.promise});const first=continueFamilyVocabulary(h.args);assert.equal(h.b.disabled,true);assert.equal(h.b.textContent,'正在核对学习队列…');assert.equal(h.b.attributes['aria-busy'],'true');assert.match(h.messages[0].message,/请稍候/);assert.equal(await continueFamilyVocabulary(h.args),false);assert.equal(h.opened.length,0);wait.resolve();assert.equal(await first,true);assert.equal(h.opened.length,1);assert.equal(h.b.disabled,false);
});
test('profile or view changes during paint stop navigation, and changed queue errors retain retry',async()=>{
 let current=true;const wait=deferred(),h=harness({paint:()=>wait.promise,isCurrent:()=>current});const first=continueFamilyVocabulary(h.args);current=false;wait.resolve();assert.equal(await first,false);assert.equal(h.opened.length,0);assert.equal(h.b.disabled,false);assert.match(h.messages.at(-1).message,/页面或档案已变化/);
 const failing=harness({openQueued:async()=>{throw Error('队列已变化');}});assert.equal(await continueFamilyVocabulary(failing.args),false);assert.match(failing.messages.at(-1).message,/队列已变化/);assert.equal(failing.b.disabled,false);assert.equal(failing.b.textContent,'继续本课词汇');
});
