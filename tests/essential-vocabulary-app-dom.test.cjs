'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const assets=path.join(__dirname,'../assets'),M=require('../assets/memory-core.js'),E=require('../assets/essential-vocabulary-core.js'),Records=require('../assets/learning-records.js'),Dictionary=require('../assets/word-dictionary.js');
const copy=value=>JSON.parse(JSON.stringify(value));
class Element{
 constructor(tag,doc){this.nodeType=1;this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.attributes={};this.listeners={};this.className='';this.hidden=false;this.disabled=false;this.value='';this._text='';this.classList={add:value=>{this.className+=' '+value;}};}
 set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(item=>item.textContent??item.nodeValue??'').join('');}
 set innerHTML(_){throw Error('unsafe HTML rendering');}
 append(...items){for(const item of items){item.parentElement=this;item.parentNode=this;this.children.push(item);}}
 replaceChildren(...items){this._text='';this.children=[];this.append(...items);}
 setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key];}removeAttribute(key){delete this.attributes[key];}
 matches(selector){if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));if(selector==='[hidden]')return this.hidden;return this.tagName===selector.toUpperCase();}
 all(){return this.children.flatMap(item=>item.nodeType===1?[item,...item.all()]:[]);}
 querySelectorAll(selector){return this.all().filter(item=>selector.split(',').some(part=>item.matches(part.trim())));}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(item=>item!==fn);}
 async fire(type,extra={}){const event={type,target:this,preventDefault(){this.prevented=true;},...extra};if(typeof this['on'+type]==='function')await this['on'+type](event);for(const fn of [...(this.listeners[type]||[])])await fn(event);return event;}
 focus(){this.ownerDocument.activeElement=this;}select(){this.selectionStart=0;this.selectionEnd=this.value.length;}click(){if(!this.disabled)return this.fire('click');}scrollIntoView(){}
}
function fixture(options={}){
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},store=M.createStore(storage),listeners={},timers=new Map();let timerId=0,profile='isolated',sequence=0,current={phase:'idle',busy:false},recordCalls=0,recordFailures=options.recordFailures||0,speechFailures=options.speechFailures||0,durabilityFailures=options.durabilityFailures||0,latestController,latestOptions;
 const entries=(options.words||['student','teacher']).map((word,index)=>({id:'essential:'+word,word,ipa:Dictionary.safeEntry({word}).ipa,ipaAccent:'en-US',meaning:['学生','教师','苹果','书','咖啡','门','英语','家庭'][index]||word,example:'This is '+word+'.',exampleTranslation:'测试例句。',rank:index+1,stage:'starter'})),data={schema:1,target:8000,count:entries.length,entries},proofs=new Map(),mistakes=[];
 const memory={...M,read:()=>store.read(),capture:payload=>store.captureTraining(payload),record:(word,skill,evidence)=>store.observe(word,skill,evidence),saveDraft:(draft,expected)=>store.saveDraft(draft,expected),clearDraft:id=>store.clearDraft(id)},recordStore=Records.createStore(Records.createMemoryStore());
 const records={currentDay:()=>2,list:()=>recordStore.list(),async record(input){recordCalls++;const result=await recordStore.record(copy(input));await new Promise(resolve=>setImmediate(resolve));if(recordFailures-- >0){const error=Error('isolated folder unavailable');error.browserCached=true;throw error;}return result;}};
 const win={console,URLSearchParams,AbortSignal,crypto:require('node:crypto').webcrypto,IELTSWordDictionary:Dictionary,IELTSMemory:memory,IELTSEssentialVocabulary:E,IELTS_ESSENTIAL_VOCABULARY:data,IELTSRecords:records,IELTSProfiles:{storage:()=>storage,current:()=>({id:profile}),assertFresh(){},isPreview:()=>true},IELTSMistakes:{async captureVocabulary(event){mistakes.push(copy(event));}},location:{search:'?preview=1&day=2'},setInterval(fn){timers.set(++timerId,fn);return timerId;},clearInterval(id){timers.delete(id);},setTimeout,clearTimeout,CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},addEventListener(type,fn){(listeners[type]||=[]).push(fn);},removeEventListener(type,fn){listeners[type]=(listeners[type]||[]).filter(value=>value!==fn);},dispatchEvent(event){for(const fn of [...(listeners[event.type]||[])])fn(event);}};
 const doc=new Element('document');doc.nodeType=9;doc.ownerDocument=doc;doc.defaultView=win;doc.createElement=tag=>new Element(tag,doc);doc.createTextNode=value=>({nodeType:3,textContent:String(value)});doc.body=new Element('body',doc);doc.append(doc.body);doc.activeElement=doc.body;doc.getElementById=id=>doc.all().find(item=>item.id===id)||null;doc.hasFocus=()=>true;win.document=doc;
 const dashboard=doc.createElement('section'),practice=doc.createElement('section');dashboard.id='essentialVocabularyDashboard';practice.id='essentialVocabularyPractice';doc.body.append(dashboard,practice);
 vm.runInNewContext(fs.readFileSync(path.join(assets,'vocabulary-practice.js'),'utf8'),win);
 const V=win.IELTSVocabularyPractice;
 const speakerFactory=callbacks=>({getState:()=>current,async start(word,context){current={phase:'recording',busy:true,context:{...context,word}};callbacks.onState(current);},async stop(){const context=current.context,index=++sequence,workId='work-essential-test-'+String(index).padStart(8,'0'),proof={wordIndex:context.wordIndex,workId,reference:context.word,hash:String(index).padStart(64,'0'),evidenceId:'essential-evidence-'+index,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:new Date().toISOString(),result:{accuracy:90,fluency:90,completeness:95}};proofs.set(workId,proof);await callbacks.onSaved({id:workId},context);current={phase:'idle',busy:false,context};if(speechFailures-- >0){callbacks.onState(current);throw Error('isolated assessment failed; original retained');}await callbacks.onAttempt(proof);callbacks.onState(current);},async retry(id,context){await callbacks.onAttempt({...proofs.get(id),wordIndex:context.wordIndex});current={phase:'idle',busy:false,context};callbacks.onState(current);},async restore(id,context){return {...proofs.get(id),wordIndex:context.wordIndex};},cancel(){current={phase:'idle',busy:false};},destroy(){},play(){}});
 const vocabulary={...V,mount(host,value){latestOptions=value;latestController=V.mount(host,{...value,speakerFactory,player:{cancel(){},async play(){return{kind:'browser-tts',started:true,completed:true,completedAt:new Date().toISOString()};}}});return latestController;}};
 vm.runInNewContext(fs.readFileSync(path.join(assets,'essential-vocabulary-app.js'),'utf8'),win);
 const API=win.IELTSEssentialVocabularyApp;
 const mount=(extra={})=>API.mount({dashboard,practice,data,memory,essential:E,vocabulary,records,contextWords:entries,courseDay:2,getBudget:()=>({remainingMinutes:360,exhausted:false}),async durable(){if(durabilityFailures-- >0)throw Error('isolated durability failure');},...extra});
 return{win,doc,dashboard,practice,API,memory,storage,records,entries,mistakes,mount,vocabulary,get recordCalls(){return recordCalls;},get controller(){return latestController;},get practiceOptions(){return latestOptions;},switchProfile(){profile='other';win.dispatchEvent({type:'ielts:profile-changed'});}};
}
const button=(box,label)=>box.querySelectorAll('button').find(item=>item.textContent===label);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function train(f){
 const words=f.controller.getState().words;
 for(let index=0;index<words.length;index++){
  for(let trial=0;trial<3;trial++){const card=f.practice.querySelectorAll('.vocab-word-card')[index],input=card.querySelector('input');input.value=words[index].word;await input.fire('input');await button(card,'核对本遍输入').click();}
  for(let trial=0;trial<3;trial++){let card=f.practice.querySelectorAll('.vocab-word-card')[index];await button(card,'开始第 '+(trial+1)+' 次跟读录音').click();await button(card,'结束本次录音并评测').click();card=f.practice.querySelectorAll('.vocab-word-card')[index];const retry=button(card,'重试这份原音评测');if(!retry.hidden&&!retry.disabled)await retry.click();}
 }
 await button(f.practice,'学完了，开始第 1 轮').click();
 for(let round=0;round<3;round++){
  const state=f.controller.getState(),mode=state.phase,order=state.roundOrders[mode],inputs=f.practice.querySelectorAll('input');
  for(let position=0;position<order.length;position++){inputs[position].value=round===0&&position===0?'incorrect':words[order[position]].word;await inputs[position].fire('input');}
  if(mode==='dictation')for(const play of f.practice.querySelectorAll('button').filter(item=>item.textContent.startsWith('播放第 ')))await play.click();
  await f.practice.querySelector('form').fire('submit');await button(f.practice,round===2?'查看三轮总成绩':'继续第 '+(round+2)+' 轮').click();
 }
}

test('day 1 keeps its original course and day 2 opens a saved six-word group without granting mastery',async()=>{
 const f=fixture({words:['student','teacher','apple','book','coffee','door','english','family']});let app=f.mount({courseDay:1});assert.match(f.dashboard.textContent,/从第2课开始/);await app.start();assert.equal(Object.keys(f.memory.read().essential.batches).length,0);app.destroy();app=f.mount();await app.start();
 const first=Object.values(f.memory.read().essential.batches)[0];assert.equal(first.words.length,6);assert.match(f.practice.textContent,/\/ˈstudənt\//);assert.match(f.dashboard.textContent,/待补训练/);assert.equal(app.getPlan().stats.delayedVerifiedWords,0);
 let input=f.practice.querySelector('input');input.value='stu';await input.fire('input');await input.fire('compositionstart');await input.fire('keydown',{key:'Enter',isComposing:true});assert.equal(f.controller.getState().learning.items[0].spellings,0);await input.fire('compositionend');assert.equal(f.memory.read().essential.batches[first.id].draft.study.input[0],'stu');
 const order=copy(first.draft.roundOrders);await button(f.practice,'保存并收起').click();await app.start();assert.equal(f.practice.querySelector('input').value,'stu');assert.deepEqual(copy(f.controller.getDraft().roundOrders),order);assert.match(f.practiceOptions.returnUrl,new RegExp('batch='+first.id));app.destroy();
});

test('real vocabulary DOM retains failed speech and original answers, retries a committed record once, and returns to the saved batch',async()=>{
 const f=fixture({recordFailures:1,speechFailures:1}),app=f.mount();await app.start();await train(f);assert.equal(f.controller.getSubmission().trainingVersion,2);assert.equal(f.mistakes.length,1);assert.ok(f.mistakes[0].userAnswer==='incorrect');
 const batchId=Object.keys(f.memory.read().essential.batches)[0],timing=f.API.recordForBatch({...f.memory.read().essential.batches[batchId],activeSeconds:120,activityByDate:{'2026-10-26':120}},f.controller.getSubmission(),{now:Date.now()+600000});assert.ok(timing.elapsedSeconds>=600);assert.equal(timing.activeSeconds,120);assert.equal(Object.values(JSON.parse(timing.answer).activityByDate).reduce((n,value)=>n+value,0),120);
 const send=button(f.practice,'提交三轮原稿'),first=send.click();await send.click();await first;assert.equal(f.recordCalls,1);assert.match(f.practice.textContent,/请重试/);assert.ok(f.memory.read().essential.batches[batchId].draft);
 const original=(await f.records.list())[0];await button(f.practice,'提交三轮原稿').click();assert.equal(f.recordCalls,1);assert.equal((await f.records.list()).length,1);assert.equal((await f.records.list())[0].answer,original.answer);assert.equal(f.memory.read().essential.batches[batchId].draft,null);assert.equal(app.getPlan().stats.initialCompleted,2);assert.equal(app.getPlan().stats.delayedVerifiedWords,0);
 await app.openBatch(batchId);assert.match(f.practice.textContent,/本组初学原稿已提交/);assert.match(f.practice.textContent,/incorrect/);assert.equal(f.practice.querySelectorAll('.vocab-word-card').length,0);app.destroy();
});

test('folder durability failure keeps a completed draft, and a retry neither writes a second original nor repeats training',async()=>{
 const f=fixture({durabilityFailures:1}),app=f.mount();await app.start();await train(f);await button(f.practice,'提交三轮原稿').click();const batch=Object.values(f.memory.read().essential.batches)[0];assert.equal(batch.status,'submitted');assert.ok(batch.draft);assert.equal(f.recordCalls,1);await button(f.practice,'提交三轮原稿').click();assert.equal(f.recordCalls,1);assert.equal(Object.values(f.memory.read().essential.batches)[0].draft,null);app.destroy();
});

test('switching profile stops an open group and leaves its saved original input in its own profile',async()=>{
 const f=fixture(),app=f.mount();await app.start();const input=f.practice.querySelector('input');input.value='stud';await input.fire('input');const before=f.storage.getItem(M.KEY);f.switchProfile();assert.match(f.dashboard.textContent,/档案已切换/);assert.ok(f.practice.querySelectorAll('input,button').every(item=>item.disabled));assert.equal(f.storage.getItem(M.KEY),before);app.destroy();
});

test('the memory page boots the 8000 route, saves real due recall first, and retains IME input without submitting',async()=>{
 const f=fixture(),at=new Date(Date.now()-3*86400000).toISOString(),state=M.observe(M.newState(),f.entries[0],'spelling',{id:'legacy-study',at,correct:true,assisted:true,source:'old-practice',answer:'student'});f.storage.setItem(M.KEY,JSON.stringify(state));
 for(const id of ['memoryDashboard','memoryPractice','memoryRetention','saveMemoryRetention','memoryModelState','memorySettingsStatus']){const node=f.doc.createElement(id==='memoryRetention'?'input':'section');node.id=id;f.doc.body.append(node);}
 f.win.IELTSMemorySession=require('../assets/memory-session.js');f.win.window=f.win;
 vm.runInNewContext(fs.readFileSync(path.join(assets,'memory-app.js'),'utf8'),f.win);await tick();await tick();
 const host=f.doc.getElementById('memoryPractice');assert.match(f.dashboard.textContent,/先复习/);assert.match(host.textContent,/到期回忆/);let input=host.querySelector('input');input.value='stud';await input.fire('input');await input.fire('compositionstart');await host.querySelector('form').fire('submit',{isComposing:true});assert.equal((await f.records.list()).length,0);assert.equal(Object.values(f.memory.read().drafts)[0].answer,'stud');
 await input.fire('compositionend');input.value='student';await input.fire('input');await host.querySelector('form').fire('submit');assert.equal((await f.records.list()).length,1);assert.equal((await f.records.list())[0].source,'memory-review');assert.equal(Object.keys(f.memory.read().drafts).length,0);await button(host,'继续本轮复习').click();assert.match(host.textContent,/当前已到期复习已处理/);
});

test('a failed draft save keeps the current input and asks the browser to stay until the same draft can be saved',async()=>{
 const f=fixture(),app=f.mount();await app.start();const write=f.storage.setItem;f.storage.setItem=()=>{throw Error('isolated quota exhausted');};const input=f.practice.querySelector('input');input.value='stud';await input.fire('input');assert.equal(input.value,'stud');let prevented=false;f.win.dispatchEvent({type:'beforeunload',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.match(f.dashboard.textContent,/quota exhausted/);f.storage.setItem=write;app.save();assert.equal(Object.values(f.memory.read().essential.batches)[0].draft.study.input[0],'stud');prevented=false;f.win.dispatchEvent({type:'beforeunload',preventDefault(){prevented=true;}});assert.equal(prevented,false);app.destroy();
});

test('inline context vocabulary starts a real group only after pausing the owner and keeps the original draft',async()=>{
 const f=fixture({words:['student','teacher','apple','book','coffee','door','english','family','room','list','spare','ready','home','blue','green','red','yellow','white','black','chair','table','window','water','bread','orange']}),calls=[];f.win.IELTSMemorySession=require('../assets/memory-session.js');vm.runInNewContext(fs.readFileSync(path.join(assets,'essential-vocabulary-inline.js'),'utf8'),f.win);const inline=f.win.IELTSEssentialVocabularyInline.mount(f.practice,{app:f.API,memory:f.memory,records:f.records,vocabulary:f.vocabulary,contextWords:f.entries,courseDay:2,getBudget:()=>({remainingMinutes:360}),pauseCourse(){calls.push('pause');assert.equal(f.controller,undefined);},resumeCourse(){calls.push('resume');}});await inline.ready;assert.ok(f.practice.querySelectorAll('.essential-word-chip').length>0);assert.doesNotMatch(f.practice.textContent,/至少22|固定每日22/);await inline.start();assert.equal(calls[0],'pause');assert.equal((await f.records.list()).length,0);assert.equal(f.practice.querySelectorAll('.vocab-word-card').length,6);assert.ok(f.practice.querySelectorAll('.essential-word-chip').length>0);assert.doesNotMatch(f.practice.textContent,/至少22|固定每日22/);assert.ok(f.memory.read().essential.batches);assert.match(f.practiceOptions.returnUrl,/今日学习\.html\?day=2&task=vocabulary&essentialBatch=essential-batch-/);const input=f.practice.querySelector('.vocab-answer');input.value='stu';await input.fire('input');await button(f.practice,'保存并收起').click();await button(f.practice,'练习原课语境与旧稿').click();assert.equal(calls.at(-1),'resume');assert.equal(Object.values(f.memory.read().essential.batches)[0].draft.study.input[0],'stu');inline.destroy();
});

test('inline due recall stays in the workspace, hides the new-word answer list, and saves its separate original',async()=>{
 const f=fixture(),at=new Date(Date.now()-3*86400000).toISOString();f.storage.setItem(M.KEY,JSON.stringify(M.observe(M.newState(),f.entries[0],'spelling',{id:'legacy-exposure',at,correct:true,assisted:true,answer:'student'})));f.win.IELTSMemorySession=require('../assets/memory-session.js');vm.runInNewContext(fs.readFileSync(path.join(assets,'essential-vocabulary-inline.js'),'utf8'),f.win);let paused=0;const inline=f.win.IELTSEssentialVocabularyInline.mount(f.practice,{app:f.API,memory:f.memory,records:f.records,vocabulary:f.vocabulary,contextWords:f.entries,courseDay:2,getBudget:()=>({remainingMinutes:360}),pauseCourse(){paused++;}});await inline.ready;await inline.openReview();assert.equal(paused,1);assert.equal(f.practice.querySelector('.essential-new-list').hidden,true);const input=f.practice.querySelector('.memory-answer');assert.ok(input);input.value='student';await input.fire('input');await f.practice.querySelector('form').fire('submit');const saved=await f.records.list();assert.equal(saved.length,1);assert.equal(saved[0].source,'memory-review');assert.equal(Object.keys(f.memory.read().drafts).length,0);inline.destroy();
});

test('opening the vocabulary UI never creates or saves a fixed daily plan, and absent context supplies no required new words',()=>{
 const f=fixture(),before=f.storage.getItem(M.KEY);let calls=0;const app=f.mount({contextWords:[],essential:{...E,ensureDailyPlan(){calls++;throw Error('automatic plan write forbidden');}}});app.getPlan();assert.equal(calls,0);assert.equal(f.storage.getItem(M.KEY),before);assert.equal(app.getPlan().newWords.length,0);app.destroy();
});
