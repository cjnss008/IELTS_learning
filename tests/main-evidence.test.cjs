'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Records=require('../assets/learning-records.js');
const html=fs.readFileSync(path.join(__dirname,'..','开始学习.html'),'utf8');
const between=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const adapter=between('/* main-evidence:start */','function persist()');
const objective=between('function checkObjective()','function toggleDone()');
const vocabulary=between('function checkVocabSpelling()','function nextVocab()');
function fixture(options={}){
  const clock=options.clock||{now:Date.parse('2026-10-24T12:00:00.000Z')};let focused=true,id=0,profile='legacy';
  class Clock extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
  const store=options.store||Records.createStore(Records.createMemoryStore(),{now:()=>new Date(clock.now).toISOString()});
  const nodes=new Map(),events={},legacy={values:{},vocab:{}};
  function element(id){if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,open:false,hidden:false,disabled:false,isConnected:true,textContent:'',events:{},addEventListener(name,fn){(this.events[name]||=[]).push(fn);},fire(name){for(const fn of this.events[name]||[])fn();}});return nodes.get(id);}
  const doc={hidden:false,hasFocus:()=>focused,getElementById:element,addEventListener:(name,fn)=>events[name]=fn};
  const lessons=[{phrases:Array.from({length:6},(_,i)=>({hint:'搭配'+i,en:'answer '+i,answers:['answer '+i]})),grammarQuiz:{answers:['am'],why:'I 后用 am。'},questions:[{q:'What happened?'},{q:'Why?'}]}];
  const root={Date:Clock,document:doc,addEventListener:(name,fn)=>events[name]=fn,IELTSProfiles:{current:()=>({id:profile})},IELTSRecords:{makeId:()=>`lesson-test-${++id}-${clock.now}`,list:()=>store.list(),record:input=>store.record({...JSON.parse(JSON.stringify(input)),dayNumber:10}),update:(id,patch,changeId)=>store.update(id,JSON.parse(JSON.stringify(patch)),changeId)},LESSONS:lessons,VOCAB:{1:[{word:'example'}]},day:1,rec:()=>legacy,persist:()=>{},textSave:input=>legacy.values[input.id]=input.value,norm:s=>s.trim().toLowerCase().replace(/\s+/g,' '),wordRecord:word=>legacy.vocab[word]||(legacy.vocab[word]={}),vocabStats:()=>({meaning:legacy.vocab.example?.meaning?1:0,spell:legacy.vocab.example?.spell?1:0,wrong:0})};
  const context=vm.createContext(root);vm.runInContext(adapter+objective+vocabulary+';let vocabRun=null;',context);
  return{root,store,clock,legacy,element,run:code=>vm.runInContext(code,context),advance:ms=>clock.now+=ms,focus(value){focused=value;events[value?'focus':'blur']();},profile(value){profile=value;},idle:()=>root.IELTSMainEvidence.idle(),fillObjective(){for(let i=0;i<6;i++)element('p'+i).value='answer '+i;element('gq').value='am';}};
}

test('main objective answers and three self assessments become separate real records without double-counting totals',async()=>{
  const f=fixture();f.fillObjective();f.run('bindMainEvidence()');f.element('p0').fire('focus');f.advance(60000);
  assert.equal(f.run('checkObjective()'),7);await f.idle();let rows=await f.store.list();assert.equal(rows.length,7);
  assert.equal(rows.find(r=>r.materialId==='lesson-1-p0').answer,'answer 0');assert.equal(rows.find(r=>r.materialId==='lesson-1-p0').activeSeconds,60);
  assert.ok(rows.every(r=>r.evaluation.method==='objective'&&r.dayNumber===10&&r.quantity===1));
  assert.ok(rows.filter(r=>r.skill==='vocabulary').every(r=>r.unit==='条'));assert.equal(rows.find(r=>r.skill==='grammar').unit,'题');
  for(const [id,answer]of [['cq0','A student arrived.'],['cq1','Because it was late.'],['dictation','The train was late.']])f.element(id).value=answer;
  for(const id of ['cscore0','cscore1','dscore'])f.element(id).checked=true;
  f.advance(1000);f.run('checkTotal()');await f.idle();rows=await f.store.list();assert.equal(rows.length,10);assert.equal(f.legacy.score,10);
  const self=rows.filter(r=>r.evaluation.method==='self');assert.equal(self.length,3);assert.ok(self.every(r=>r.evaluation.result==='unverified'));
  assert.equal(JSON.parse(self.find(r=>r.skill==='listening').answer).text,'The train was late.');
  assert.equal(rows.filter(r=>r.evaluation.method==='objective').length,7);
  f.run('checkTotal()');await f.idle();assert.equal((await f.store.list()).length,10);
});

test('refresh deduplicates unchanged answers and changed answers preserve their original as assisted corrections',async()=>{
  const first=fixture();first.fillObjective();first.run('checkObjective()');await first.idle();const original=(await first.store.list()).find(r=>r.materialId==='lesson-1-p0');
  const reloaded=fixture({store:first.store,clock:first.clock});reloaded.fillObjective();reloaded.run('checkObjective()');await reloaded.idle();assert.equal((await first.store.list()).length,7);
  reloaded.advance(1000);reloaded.element('p0').value='a changed answer';reloaded.run('checkObjective()');await reloaded.idle();const rows=await first.store.list();assert.equal(rows.length,8);
  const correction=rows.find(r=>r.answer==='a changed answer');assert.equal(correction.kind,'correction');assert.equal(correction.parentId,original.id);assert.equal(correction.assistance.answer,true);assert.equal(correction.evaluation.result,'revise');
  assert.equal(rows.find(r=>r.id===original.id).answer,'answer 0');
});

test('whole-text dictation explicitly submits immutable works, keeps existing drafts and records revealed references',async()=>{
  assert.match(html,/onclick="submitFullDictation\(\)"/);
  const f=fixture();f.run('bindMainEvidence()');f.element('fullDictationAnswer').value='I am writing my original answer.';f.element('fullDictationCorrections').value='Check the article.';
  f.element('fullDictationAnswer').fire('focus');f.advance(120000);await f.run('submitFullDictation()');let rows=await f.store.list();assert.equal(rows.length,1);
  assert.equal(rows[0].evaluation.method,'none');assert.equal(rows[0].evaluation.result,'pending');assert.equal(rows[0].minutes,2);assert.equal(rows[0].answer,f.legacy.values.fullDictationAnswer);assert.equal(rows[0].quantity,6);assert.equal(rows[0].unit,'词');
  assert.equal(f.legacy.values.fullDictationCorrections,'Check the article.');await f.run('submitFullDictation()');assert.equal((await f.store.list()).length,1);
  f.element('fullDictationReference').open=true;f.element('fullDictationReference').fire('toggle');f.advance(1000);f.element('fullDictationAnswer').value='I have revised my original answer.';
  await f.run('submitFullDictation()');rows=await f.store.list();assert.equal(rows.length,2);const correction=rows.find(r=>r.kind==='correction');assert.equal(correction.parentId,rows.find(r=>r.kind==='original').id);assert.equal(correction.assistance.answer,true);
  f.element('fullDictationAnswer').value='';await f.run('submitFullDictation()');assert.equal((await f.store.list()).length,2);
});

test('vocabulary spelling retains the typed answer while meaning recall stays self-reported',async()=>{
  const f=fixture();f.element('vocabAnswer').value='exampel';f.run("vocabRun={mode:'spell',indices:[0],pos:0,score:0,revealed:false,answered:false};checkVocabSpelling()");await f.idle();let rows=await f.store.list();assert.equal(rows[0].answer,'exampel');assert.equal(rows[0].evaluation.method,'objective');assert.equal(rows[0].evaluation.result,'revise');
  f.advance(1000);f.element('vocabAnswer').value='example';f.run("vocabRun={mode:'spell',indices:[0],pos:0,score:0,revealed:false,answered:false};checkVocabSpelling()");await f.idle();rows=await f.store.list();assert.equal(rows.length,2);assert.equal(rows.find(r=>r.answer==='example').kind,'correction');assert.equal(f.legacy.vocab.example.spell,true);
  f.advance(1000);f.run("vocabRun={mode:'meaning',indices:[0],pos:0,score:0,revealed:true,answered:false};gradeVocab(true)");await f.idle();rows=await f.store.list();const meaning=rows.find(r=>r.evaluation.method==='self');assert.equal(meaning.evaluation.result,'unverified');assert.equal(meaning.assistance.answer,true);assert.equal(JSON.parse(meaning.answer).recalled,true);
});

test('personal expression preserves raw text and keeps rubric edits as self-review history without adding works',async()=>{
  const f=fixture();f.element('output').value='I travelled to a quiet village.';for(let i=0;i<4;i++)f.element('rubric'+i).value='1';
  await f.run('submitPersonalOutput()');let rows=await f.store.list();assert.equal(rows.length,1);assert.equal(rows[0].answer,'I travelled to a quiet village.');assert.equal(rows[0].evaluation.method,'self');assert.equal(rows[0].evaluation.result,'unverified');assert.equal(rows[0].evaluation.score,4);assert.equal(rows[0].quantity,6);assert.equal(rows[0].unit,'词');
  f.advance(1000);f.element('rubric0').value='2';await f.run('submitPersonalOutput()');rows=await f.store.list();assert.equal(rows.length,1);assert.equal(rows[0].evaluation.score,5);assert.equal(rows[0].history.length,2);
  await f.run('submitPersonalOutput()');assert.equal((await f.store.list())[0].history.length,2);
});

test('blank answers do not create records and hidden or unfocused time is excluded',async()=>{
  const f=fixture();f.run('checkTotal()');await f.idle();assert.equal((await f.store.list()).length,0);
  f.fillObjective();f.run('bindMainEvidence()');f.element('p0').fire('focus');f.advance(30000);f.focus(false);f.advance(600000);f.focus(true);f.advance(30000);f.run('checkObjective()');await f.idle();const record=(await f.store.list()).find(r=>r.materialId==='lesson-1-p0');assert.equal(record.activeSeconds,60);assert.equal(record.elapsedSeconds,660);
});

test('a profile switch during record lookup cannot save into the other profile',async()=>{
  const f=fixture();let release;f.root.IELTSRecords.list=()=>new Promise(resolve=>release=resolve);
  const operation=f.run("mainEvidence.save({materialId:'lesson-1-p0',title:'A question',skill:'grammar',answer:'am',quantity:1,unit:'题',evaluation:{method:'objective',result:'pass',score:1,maxScore:1,threshold:1,feedback:''}})");
  await new Promise(resolve=>setImmediate(resolve));f.profile('different-profile');release([]);await assert.rejects(operation,/档案已切换/);assert.equal((await f.store.list()).length,0);
});
