'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./family-lessons-v95-fixture.cjs');

test('a concurrent full-record refresh retains the verified audio receipt for the same immutable record snapshot',async()=>{
 const p=F.packageData(),f=await F.mounted(p,{dictionary:true}),api=f.win.IELTSFamilyLessonExpansionV95.runtime();
 const fetch=f.win.fetch;let refreshed=false;
 f.win.fetch=async(...args)=>{
  if(String(args[0]).startsWith('/audio/')&&!refreshed){refreshed=true;await api.prepareCourseRecords();}
  return fetch(...args);
 };
 const prepared=await api.prepareVocabularyUnit({courseDay:2});
 assert.equal(refreshed,true);
 let result=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
 assert.equal(result.status,'ready',result.reason);
 await api.prepareCourseRecords();
 result=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
 assert.equal(result.status,'ready',result.reason);
 assert.equal(result.targets.length,30);
 assert.equal(api.readVocabularyContext({courseDay:2,records:prepared.records.slice(),drafts:[]}).status,'pending','cloned records still cannot claim the private audio proof');
});

test('an unchanged background record refresh cannot cancel the vocabulary-to-grammar navigation',async()=>{
 const p=F.packageData(),f=await F.mounted(p,{dictionary:true,completeFamilyPrerequisites:true,vocabularyOnly:true}),nav=f.win.IELTSTodayNavigation;
 await nav.refreshYearRecords();
 const next=nav.learningQueue().next;
 assert.equal(next.materialId,'new-grammar');
 const list=f.win.IELTSRecords.list;
 let first=true,unblock,announce;
 const entered=new Promise(resolve=>{announce=resolve;}),gate=new Promise(resolve=>{unblock=resolve;});
 f.win.IELTSRecords={...f.win.IELTSRecords,list:async(...args)=>{const rows=await list(...args);if(first){first=false;announce();await gate;}return rows;}};
 const opening=nav.openQueued(next);
 await entered;await nav.refreshYearRecords();unblock();
 assert.equal(await opening,true);
 assert.equal(nav.current().materialId,'new-grammar');
 assert.equal(nav.allDrafts().filter(d=>d.materialId==='new-grammar').length,1);
});

test('an immediate family submission flushes the pending answer draft before obtaining its save permit',async()=>{
 const f=await F.mounted(F.packageData(),{dictionary:true,completeFamilyPrerequisites:true,vocabularyOnly:true}),nav=f.win.IELTSTodayNavigation;
 assert.equal(await nav.openQueued(nav.learningQueue().next),true);
 let id=0;const pending=new Map();
 f.context.setTimeout=(fn,delay)=>{const token=++id;if(delay===350)pending.set(token,fn);return token;};
 f.context.clearTimeout=token=>pending.delete(token);
 await F.answer(f);assert.equal(pending.size,1);
 const fetch=f.win.fetch;f.win.fetch=async(...args)=>{assert.equal(pending.size,0,'answer debounce must be cancelled before authorization');return fetch(...args);};
 await f.nodes.get('courseSubmit').fire('click');await F.settle();
 const record=(await f.R.list()).find(r=>r.materialId==='new-grammar');
 assert.ok(record,f.nodes.get('courseSubmitStatus').textContent);
 assert.equal(f.win.IELTSAssessment.decodeArtifact(record).answers['new-grammar-q1'],'on the table');
});


test('lesson four vocabulary sidebar and module navigation open the same admitted thirty-word route',async()=>{
 const Actual=require('./actual-lessons-fixture.cjs'),D=require('../assets/curriculum-data.js'),X=require('../assets/course-expansion.js'),Adaptive=require('../assets/adaptive-plan.js'),Plan=require('../assets/daily-plan-state.js');
 const adaptive=Adaptive.newState(),records=[];
 for(let day=1;day<=3;day++){
  const d=X.overlay(Actual.D.days[day-1],Actual.D),at=Date.parse('2026-10-24T08:00:00Z')+(day-1)*86400000;adaptive.startedDays.push(day);adaptive.frozenDays[day]=d;
  for(const task of d.tasks.filter(t=>t.id!=='reflection'))for(const id of task.materialIds){const m=Actual.D.materials.find(m=>m.id===id),r=Actual.original(day,task,m,at,false),a=JSON.parse(r.answer);a.materialBinding=Actual.P.freezeMaterialBinding(m,{data:Actual.D,task,courseDay:day,attemptId:r.id});r.answer=JSON.stringify(a);delete r.version;delete r.history;records.push(r);}
 }
 let stored=F.R.newState();for(const r of records)stored=F.R.put(stored,r,r.submittedAt).state;
 const entries={[F.R.KEY]:JSON.stringify(stored),[Actual.M.KEY]:JSON.stringify(Actual.ledgerFor(records)),[Adaptive.KEY]:JSON.stringify(adaptive),'ielts52-daily-plan-v1':JSON.stringify(Plan.newState('2026-10-25'))};
 const f=await F.mounted({root:require('path').resolve(__dirname,'..'),data:D,day:D.days[3]},{entries,dictionary:true,now:Date.parse('2026-10-28T08:00:00Z')}),nav=f.win.IELTSTodayNavigation;
 for(const name of ['public-course-planner.js','public-material-selector.js','public-context-data.js','contextual-vocabulary-exposure.js','contextual-vocabulary-course.js'])require('vm').runInContext(require('fs').readFileSync(require('path').join(__dirname,'../assets',name),'utf8'),f.context,{filename:name});
 nav.showDay(4);await nav.refreshYearRecords();await F.settle();assert.equal(nav.learningQueue().next.familyVocabularyContinuation,true);
 assert.match(f.nodes.get('courseMaterialIntro').textContent,/30 个主题词/);for(const target of D.familyLessonRelease.units.find(u=>u.day===4).targets)assert.ok(f.nodes.get('courseMaterialIntro').textContent.includes(target.canonicalWord),'Overview must show '+target.canonicalWord);assert.equal(f.nodes.get('courseStart').hidden,true);
 assert.equal(await nav.showTask('vocabulary'),true);assert.equal(f.win.location.href,'词汇记忆.html?day=4');
 f.win.location.href='';await f.nodes.get('courseTasks').children.find(b=>b.dataset.taskId==='vocabulary').fire('click');assert.equal(f.win.location.href,'词汇记忆.html?day=4');
 assert.equal((await f.R.list()).length,records.length,'navigation cannot erase old answers or create fake completion');
});

test('periodic family record preparation reuses only an unchanged privately validated immutable snapshot',async()=>{
 const f=await F.mounted(F.packageData(),{dictionary:true,complete:true}),api=f.win.IELTSFamilyLessonExpansionV95.runtime();
 const first=await api.prepareCourseRecords(),A=f.win.IELTSAssessment,hash=A.materialContentHash;let recordHashes=0;
 f.win.IELTSAssessment={...A,materialContentHash(value){if(Array.isArray(value)&&value.some(row=>row?.answer))recordHashes++;return hash(value);}};
 assert.equal(await api.prepareCourseRecords(),first);assert.equal(recordHashes,0);
 const patch=require('vm').runInContext('({notes:"Changed synthetic original metadata"})',f.context);await f.R.update(first[0].id,patch,'audit-refresh');
 const changed=await api.prepareCourseRecords();assert.notEqual(changed,first);assert.ok(recordHashes>0,'changed source must receive the full private validation');
});
