'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const F=require('./family-lessons-v95-fixture.cjs'),Actual=require('./actual-lessons-fixture.cjs');

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
// Delay only the requested calls after the real family API has produced its
// branded record snapshot. All other source and authorization logic remains real.
function gateFamilyReads(win,count){
  const source=win.IELTSFamilyLessonExpansionV95,api=source.runtime(),slots=Array.from({length:count},()=>({entered:deferred(),release:deferred()}));let index=0;
  const wrapped={...api,async prepareCourseRecords(){const n=index++,rows=await api.prepareCourseRecords();if(slots[n]){slots[n].entered.resolve();await slots[n].release.promise;}return rows;}};
  win.IELTSFamilyLessonExpansionV95={...source,runtime:()=>wrapped};
  return{slots,restore(){for(const slot of slots)slot.release.resolve();win.IELTSFamilyLessonExpansionV95=source;}};
}
function packWithOldVocabulary(){
  const pack=F.packageData();pack.data.materials.find(m=>m.id==='base-vocabulary').vocabulary=[{word:'pen',meaning:'synthetic pen',ipa:'/pen/',audio:'audio/synthetic.wav',example:'This is a pen.'}];return pack;
}
function completeOldVocabularyInput(f){
  const p=f.pack,task=p.day.tasks.find(t=>t.id==='vocabulary'),base=p.data.materials.find(m=>m.id==='base-vocabulary'),current=f.win.IELTSCurriculumData.materials.find(m=>m.id===base.id),input=Actual.original(2,task,base,Date.parse('2026-10-24T10:00:00Z'),false);
  const binding=f.win.IELTSCoursePlayer.freezeMaterialBinding(current,{assessment:f.win.IELTSAssessment,data:f.win.IELTSCurriculumData,task,courseDay:2,attemptId:input.id});
  const session=f.win.IELTSVocabularyPractice.createSession({material:binding.material,courseDay:2}),word=session.words[0].word;
  for(let i=0;i<3;i++)session.recordSpelling(0,word);
  for(let i=0;i<3;i++)session.recordSpeaking(0,{workId:'work-synthetic-'+i+'123456789',reference:word,hash:String(i+1).repeat(64),evidenceId:'synthetic-evidence-'+i,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:'2026-10-24T10:00:00Z',result:{accuracy:90,fluency:90,completeness:95}});
  session.begin();for(let i=0;i<3;i++){if(i===2)session.markPlayed(0,{kind:'local-audio',started:true,completed:true,completedAt:'2026-10-24T10:00:00Z'});session.setAnswer(0,word);session.submitRound();session.next();}
  const payload=session.getSubmission(),artifact={...JSON.parse(input.answer),...JSON.parse(payload.answer),schema:1,trainingSchema:2,materialBinding:binding,materialVersion:'1',gradingPolicy:binding.gradingPolicy};input.answer=JSON.stringify(artifact);input.evaluation=payload.evaluation;delete input.version;delete input.history;return input;
}
async function recordWithoutNotification(f,input){
  // Control only event delivery; this is the real record writer and verifier.
  const dispatch=f.win.dispatchEvent;f.win.dispatchEvent=()=>true;
  try{f.context.__syntheticOldInput=JSON.stringify(input);return(await vm.runInContext('window.IELTSRecords.record(JSON.parse(__syntheticOldInput))',f.context)).record;}finally{f.win.dispatchEvent=dispatch;}
}

test('hydrating an old vocabulary overview leaves a concurrent full-year read valid and the saved original unopened', {timeout:20000},async()=>{
  const f=await F.mounted(packWithOldVocabulary(),{protectedDay:true,dictionary:true}),nav=f.win.IELTSTodayNavigation,intro=f.nodes.get('courseMaterialIntro');
  assert.match(intro.textContent,/30 个主题词/);const record=await recordWithoutNotification(f,completeOldVocabularyInput(f)),before=JSON.stringify(await f.R.list());
  const events={view:0,progress:0};f.win.addEventListener('ielts:course-view',()=>events.view++);f.win.addEventListener('ielts:course-progress',()=>events.progress++);const gate=gateFamilyReads(f.win,2);
  try{
    f.win.dispatchEvent({type:'ielts:records-changed'});const refreshing=nav.refreshYearRecords();refreshing.catch(()=>{});
    await Promise.all(gate.slots.map(slot=>slot.entered.promise));gate.slots[0].release.resolve();await F.settle();
    gate.slots[1].release.resolve();const rows=await refreshing;
    assert.doesNotMatch(intro.textContent,/30 个主题词/);assert.match(intro.textContent,/本课词汇共 1 个词项/);
    assert.equal(intro.querySelectorAll('.course-vocabulary-overview').length,1);assert.equal(f.nodes.get('courseStart').hidden,false);
    assert.equal(events.view,0,'same-view hydration is not navigation');assert.ok(events.progress>0,'normal progress still refreshes the hub');
    assert.equal(nav.current().active,false);assert.equal(nav.current().submitted,false);assert.equal(f.nodes.get('courseBegin').textContent,'查看原作答');
    assert.ok(rows.some(row=>row.id===record.id));assert.equal(JSON.stringify(await f.R.list()),before);
    await f.nodes.get('courseBegin').fire('click');assert.equal(nav.current().submitted,true);assert.match(f.nodes.get('courseSubmitStatus').textContent,/只读查看/);assert.equal(JSON.stringify(await f.R.list()),before);
  }finally{gate.restore();}
});

test('real navigation invalidates a concurrent year read and keeps the answer in its original draft', {timeout:20000},async()=>{
  const f=await F.mounted(packWithOldVocabulary(),{protectedDay:true,dictionary:true}),nav=f.win.IELTSTodayNavigation;
  await nav.resumeNext('grammar','base-grammar');await F.answer(f);const draft=nav.allDrafts().find(d=>d.materialId==='base-grammar');assert.ok(draft);assert.equal(draft.answers['base-grammar-q1'],'on the table');
  let viewEvents=0;f.win.addEventListener('ielts:course-view',()=>viewEvents++);const gate=gateFamilyReads(f.win,1);
  try{
    const refreshing=nav.refreshYearRecords();await gate.slots[0].entered.promise;nav.showDay(2,'base-reading');gate.slots[0].release.resolve();
    await assert.rejects(refreshing,/学习档案已变化/);assert.equal(nav.current().materialId,'base-reading');assert.ok(viewEvents>0,'user navigation still announces its new view');
    const kept=nav.allDrafts().find(d=>d.id===draft.id);assert.equal(kept.answers['base-grammar-q1'],'on the table');assert.equal((await f.R.list()).length,0);
  }finally{gate.restore();}
});

test('a profile change still invalidates a concurrent year read and retains unsaved input', {timeout:20000},async()=>{
  const f=await F.mounted(packWithOldVocabulary(),{protectedDay:true,dictionary:true}),nav=f.win.IELTSTodayNavigation;
  await nav.resumeNext('grammar','base-grammar');await F.answer(f);await f.nodes.get('coursePause').fire('click');const raw=f.map.get(f.win.IELTSCoursePlayer.KEY);assert.ok(raw);
  const gate=gateFamilyReads(f.win,1);
  try{
    const refreshing=nav.refreshYearRecords();await gate.slots[0].entered.promise;f.win.IELTSProfiles.current=()=>({id:'synthetic-other-owner'});f.win.dispatchEvent({type:'ielts:profile-changed'});gate.slots[0].release.resolve();
    await assert.rejects(refreshing,/学习档案已变化/);assert.equal(f.map.get(f.win.IELTSCoursePlayer.KEY),raw);assert.equal(f.nodes.get('courseSubmit').disabled,true);assert.match(f.nodes.get('courseNotice').textContent,/档案已切换/);
  }finally{gate.restore();}
});

test('a delayed old-overview read cannot replace an explicitly started attempt or its entered answer', {timeout:20000},async()=>{
  const f=await F.mounted(packWithOldVocabulary(),{protectedDay:true,dictionary:true}),nav=f.win.IELTSTodayNavigation;
  const saved=await recordWithoutNotification(f,completeOldVocabularyInput(f)),gate=gateFamilyReads(f.win,1);
  try{
    f.win.dispatchEvent({type:'ielts:records-changed'});await gate.slots[0].entered.promise;
    await nav.resumeNext('grammar','base-grammar');await F.answer(f);const draft=nav.allDrafts().find(d=>d.materialId==='base-grammar');assert.ok(draft);assert.equal(nav.current().active,true);
    gate.slots[0].release.resolve();await F.settle();assert.equal(nav.current().active,true);assert.equal(nav.current().materialId,'base-grammar');
    assert.equal(nav.allDrafts().find(d=>d.id===draft.id).answers['base-grammar-q1'],'on the table');assert.equal(f.nodes.get('courseSession').hidden,false);assert.equal((await f.R.list()).find(r=>r.id===saved.id).answer,saved.answer);
  }finally{gate.restore();}
});

test('a delayed old-overview read cannot replace an explicitly opened read-only original', {timeout:20000},async()=>{
  const f=await F.mounted(packWithOldVocabulary(),{protectedDay:true,dictionary:true}),nav=f.win.IELTSTodayNavigation;
  const saved=await recordWithoutNotification(f,completeOldVocabularyInput(f)),before=JSON.stringify(await f.R.list()),gate=gateFamilyReads(f.win,1);
  try{
    f.win.dispatchEvent({type:'ielts:records-changed'});await gate.slots[0].entered.promise;await nav.showLatestRecord('vocabulary','base-vocabulary');
    assert.equal(nav.current().submitted,true);assert.match(f.nodes.get('courseSubmitStatus').textContent,/只读查看/);gate.slots[0].release.resolve();await F.settle();
    assert.equal(nav.current().submitted,true);assert.equal(nav.current().materialId,'base-vocabulary');assert.match(f.nodes.get('courseSubmitStatus').textContent,/只读查看/);assert.equal(JSON.stringify(await f.R.list()),before);assert.equal((await f.R.list())[0].id,saved.id);
  }finally{gate.restore();}
});
