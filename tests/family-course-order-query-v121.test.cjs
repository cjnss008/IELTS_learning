'use strict';
// 0.0.120: family course-order uses the shared narrow query and treats unknown as held.
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('./family-lessons-v95-fixture.cjs');

test('family checks course order through courseDayOnly with the requested day and no selected floor',async()=>{
 const p=F.packageData(),prior={...F.copy(p.day),day:1,tasks:[F.copy(p.day.tasks.find(t=>t.id==='reading'))]};p.data.days.unshift(prior);
 const f=await F.mounted(p,{dictionary:true}),api=f.win.IELTSFamilyLessonExpansionV95.runtime(),prepared=await api.prepareVocabularyUnit({courseDay:2});
 const real=f.win.IELTSDailyLearningLoad,calls=[];
 f.win.IELTSDailyLearningLoad={build(options){calls.push({courseDayOnly:options.courseDayOnly===true,currentDay:options.currentDay,selectedDay:options.selectedDay});return real.build(options);}};
 try{
  const blocked=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
  assert.equal(blocked.status,'pending');assert.equal(blocked.reason,'family-earlier-course-pending');
  assert.ok(calls.length>=1);assert.ok(calls.every(call=>call.courseDayOnly===true&&call.selectedDay===undefined&&call.currentDay===2));
 }finally{f.win.IELTSDailyLearningLoad=real;}
});

test('family refuses a ready courseDay when the day summary or route is unknown',async()=>{
 const p=F.packageData(),prior={...F.copy(p.day),day:1,tasks:[F.copy(p.day.tasks.find(t=>t.id==='reading'))]};p.data.days.unshift(prior);
 const f=await F.mounted(p,{dictionary:true}),api=f.win.IELTSFamilyLessonExpansionV95.runtime(),prepared=await api.prepareVocabularyUnit({courseDay:2});
 const real=f.win.IELTSDailyLearningLoad;
 try{
  f.win.IELTSDailyLearningLoad={build:()=>({courseDay:2,currentComplete:false,unreadable:true,reason:''})};
  const unreadable=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
  assert.equal(unreadable.status,'pending');assert.equal(unreadable.reason,'family-course-summary-pending');
  f.win.IELTSDailyLearningLoad={build:()=>({reason:'BUDGET_REFRESH_REQUIRED'})};
  const noRoute=api.readVocabularyContext({courseDay:2,records:prepared.records,drafts:[]});
  assert.equal(noRoute.status,'pending');assert.equal(noRoute.reason,'family-course-route-pending');
 }finally{f.win.IELTSDailyLearningLoad=real;}
});
