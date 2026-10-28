'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const F=require('./family-lessons-v95-fixture.cjs'),Actual=require('./actual-lessons-fixture.cjs');

test('a calendar or selected later lesson cannot outrank an unfinished earlier course; real completion unlocks it',async()=>{
 const p=F.packageData(),prior={...F.copy(p.day),day:1,tasks:[F.copy(p.day.tasks.find(t=>t.id==='reading'))]};
 p.data.days.unshift(prior);
 const f=await F.mounted(p,{dictionary:true}),nav=f.win.IELTSTodayNavigation,api=f.win.IELTSFamilyLessonExpansionV95.runtime();
 let prepared=await api.prepareVocabularyUnit({courseDay:2});
 const blocked=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
 assert.equal(blocked.status,'pending');assert.equal(blocked.reason,'family-earlier-course-pending');
 for(const currentDay of [2,169]){
  const queue=f.win.IELTSDailyLearningLoad.build({...nav.yearContext(),currentDay,selectedDay:2});
  assert.equal(queue.entries.some(e=>e.familyVocabularyContinuation),false);
 }
 assert.equal((await f.R.list()).length,0);assert.equal(nav.allDrafts().length,0);
 const m=p.data.materials.find(m=>m.id==='base-reading'),input=Actual.original(1,prior.tasks[0],m,Date.parse('2026-10-24T08:00:00Z'),false);delete input.version;delete input.history;
 f.context.__prior=JSON.stringify(input);await vm.runInContext('window.IELTSRecords.record(JSON.parse(__prior))',f.context);
 const summary=f.M.forDay(1);f.context.__recap=JSON.stringify({token:summary.token,recap:{ok:true,status:'complete',text:'Synthetic verified recap response.'}});
 vm.runInContext('window.IELTSMistakes.finishRecap(1,JSON.parse(__recap))',f.context);
 await nav.refreshYearRecords();prepared=await api.prepareVocabularyUnit({courseDay:2});
 const ready=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
 assert.equal(ready.status,'ready',ready.reason);
 assert.ok(nav.learningQueue().entries.some(e=>e.familyVocabularyContinuation));
 assert.equal((await f.R.list()).length,1);
});
