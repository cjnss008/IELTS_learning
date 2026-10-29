'use strict';
// All work, recordings, results, profiles and releases below are synthetic.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const F=require('./family-lessons-v95-fixture.cjs'),Actual=require('./actual-lessons-fixture.cjs');
const clone=F.copy,dir=path.join(__dirname,'../assets');
function readingPack(){const p=F.packageData({simple:true});p.data.days[0].tasks[0].mode='assessment';return p;}
function vocabularyPack(){const p=F.packageData(),day=p.data.days[0],v=day.tasks.find(t=>t.id==='vocabulary'),r=day.tasks.find(t=>t.id==='reading');v.minutes=r.minutes=180;r.mode='assessment';day.tasks=[v,r];p.data.materials.find(m=>m.id==='base-vocabulary').vocabulary=[{word:'hello',meaning:'你好',ipa:'/həloʊ/',example:'Hello.',audio:''}];return p;}
async function recap(f){const s=f.M.forDay(2);f.context.__recap=JSON.stringify({token:s.token,recap:{ok:true,status:'complete',text:'Synthetic recap for software testing.'}});vm.runInContext('window.IELTSMistakes.finishRecap(2,JSON.parse(__recap))',f.context);await F.settle();}
async function finishReading(f){await F.answer(f);f.advance(1000);await f.nodes.get('courseSubmit').fire('click');await F.settle();await recap(f);}
async function seedCore(f,p){f.advance(180000);const inputs=[];for(const task of p.data.days[0].tasks){const m=p.data.materials.find(x=>x.id===task.materialIds[0]),r=Actual.original(2,task,m,f.context.Date.now(),false);delete r.version;delete r.history;const a=JSON.parse(r.answer);a.materialBinding=F.P.freezeMaterialBinding(m,{assessment:F.A,task,courseDay:2,attemptId:r.id});r.answer=JSON.stringify(a);inputs.push(r);}f.context.__rows=JSON.stringify(inputs);await vm.runInContext('(async()=>{for(const row of JSON.parse(__rows))await window.IELTSRecords.record(row)})()',f.context);await recap(f);}
async function queue(f,extra={}){const api=f.win.IELTSFamilyLessonExpansionV95.runtime(),records=await api.prepareCourseRecords(),data=f.win.IELTSCurriculumData,drafts=f.win.IELTSTodayNavigation.allDrafts();return api.queueEntries({data,records,drafts,currentDay:3,current:{day:3},getDay:raw=>f.win.IELTSAdaptivePlan.getDay(raw),budget:{remainingMinutes:360},...extra});}
async function openVocabulary(f){const w=f.win;w.CustomEvent=f.context.CustomEvent;w.document.createTextNode=value=>{const n=w.document.createElement('span');n.textContent=value;return n;};for(const name of ['contextual-vocabulary-exposure.js','contextual-vocabulary-course.js','essential-vocabulary-app.js'])vm.runInContext(fs.readFileSync(path.join(dir,name),'utf8'),f.context,{filename:name});let session,handlers;const vocabulary={...w.IELTSVocabularyPractice,mount(_host,o){handlers=o;session=w.IELTSVocabularyPractice.createSession(o);o.onChange(session.getState());return{ready:Promise.resolve(),pause(){},destroy(){},getState:session.getState,getDraft:session.getDraft};}};const dashboard=w.document.createElement('div'),practice=w.document.createElement('div'),words=w.IELTS_ESSENTIAL_VOCABULARY.entries.slice(35,41);const app=w.IELTSEssentialVocabularyApp.mount({document:w.document,dashboard,practice,vocabulary,contextWords:words,courseDay:2,getBudget:()=>({remainingMinutes:360}),async durable(){}});await app.start();await F.settle();return{app,dashboard,practice,get session(){return session;},get handlers(){return handlers;}};}
async function submitVocabulary(f,view){const s=view.session;f.advance(120000);for(const [i,word]of s.words.entries()){for(let j=0;j<3;j++)s.recordSpelling(i,word.word);for(let j=0;j<3;j++){const id=(i*3+j+1).toString().padStart(64,'0'),workId='work-'+id.slice(-40);s.registerStudyWork(i,workId);s.recordSpeaking(i,{workId,reference:word.word,hash:id,evidenceId:id,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:new Date(f.context.Date.now()).toISOString(),result:{accuracy:90,fluency:90,completeness:95}});}}s.begin();for(let round=0;round<3;round++){s.words.forEach((word,i)=>{s.setAnswer(i,word.word);if(round===2)s.markPlayed(i,{kind:'local-audio',started:true,completed:true,completedAt:new Date(f.context.Date.now()).toISOString()});});s.submitRound();s.next();}view.handlers.onChange(s.getState());return view.handlers.onSubmit(s.getSubmission());}


test('independent: unavailable future family audio should not prevent starting original vocabulary',async()=>{
 const p=vocabularyPack(),f=await F.mounted(p,{dictionary:true});
 const fetch=f.win.fetch;f.win.fetch=async url=>url==='/audio/synthetic.wav'?{ok:false}:fetch(url);
 const view=await openVocabulary(f);assert.ok(view.session,'native word group must still open');
 assert.equal((await queue(f)).length,0,'unverified family tasks must not be offered');
});
test('independent: unavailable signed batch should not prevent saving the original vocabulary',async()=>{
 const p=vocabularyPack(),f=await F.mounted(p,{dictionary:true}),view=await openVocabulary(f);
 f.win.IELTSCurriculumData.familyLessonRelease.active=false;
 const saved=await submitVocabulary(f,view);assert.equal(saved.source,'essential-vocabulary');
 const art=F.A.decodeArtifact(saved),frozen=f.win.IELTSAdaptivePlan.read().frozenDays[2];assert.deepEqual(clone(art.dayPlanBinding.day),clone(frozen));
});
test('independent: updated public day should leave an explicit held claim for the bound older original',async()=>{
 const p=readingPack(),f=await F.mounted(p);await f.win.IELTSTodayNavigation.resumeNext('reading','base-reading');await finishReading(f);
 assert.equal((await queue(f)).length,6,'the old bound obligation exists before upgrade');
 const saved=await f.entries(),updated=clone(p);updated.data.days[0].title='Revised public lesson title';updated.day=clone(updated.data.days[0]);
 const reopened=await F.mounted(updated,{entries:saved}),rows=await queue(reopened);
 assert.equal((await reopened.R.list()).length,1);assert.ok(reopened.win.IELTSAdaptivePlan.read().frozenDays[2].familyAfterCore);assert.equal(reopened.M.forDay(2).completionValid,true);
 assert.ok(rows.some(x=>x.kind==='blocked'&&x.required),'old bound obligation must remain visible when the current public day changes');
});
test('independent: changed day plus orphan marker cannot invent a held obligation',async()=>{
 const p=readingPack(),f=await F.mounted(p),api=f.win.IELTSFamilyLessonExpansionV95.runtime(),records=await api.prepareCourseRecords(),base=f.win.IELTSCurriculumData.days[0];
 const marked=api.beginAssessmentDay(base,{records,drafts:[],kind:'course-player',source:{id:'course-never-saved',taskId:'reading',materialId:'base-reading',mode:'assessment',kind:'original'}});
 f.win.IELTSAdaptivePlan.markStarted(2,marked);await seedCore(f,p);
 const saved=await f.entries(),updated=clone(p);updated.data.days[0].title='Revised public lesson title';updated.day=clone(updated.data.days[0]);
 const reopened=await F.mounted(updated,{entries:saved});assert.equal((await queue(reopened)).length,0);
});
test('independent: non-audio source verification failure does not take audio-only fallback',async()=>{
 const p=vocabularyPack(),f=await F.mounted(p,{dictionary:true}),api=f.win.IELTSFamilyLessonExpansionV95,real=api.runtime();let fallbackCalls=0;
 f.win.IELTSFamilyLessonExpansionV95={...api,runtime:()=>({...real,prepareVocabularyUnit:async()=>{throw Object.assign(Error('synthetic changed unit'),{reason:'family-vocabulary-unit-hash-changed'});},prepareCourseRecords:async()=>{fallbackCalls++;return real.prepareCourseRecords();}})};
 await assert.rejects(()=>openVocabulary(f),/assessment-start-full-context-pending/);assert.equal(fallbackCalls,0);assert.equal(Object.keys(f.win.IELTSMemory.read().essential.batches).length,0);
});
test('independent: owner switch during audio fetch cannot start a batch through fallback',async()=>{
 const p=vocabularyPack(),f=await F.mounted(p,{dictionary:true}),fetch=f.win.fetch;let switched=false;
 f.win.fetch=async url=>{if(url==='/audio/synthetic.wav'&&!switched){switched=true;f.win.IELTSProfiles.current=()=>({id:'other'});}return fetch(url);};
 await assert.rejects(()=>openVocabulary(f),/学习档案已切换|family-capability-base-changed/);assert.equal(switched,true);assert.equal(Object.keys(f.win.IELTSMemory.read().essential.batches).length,0);
});
