'use strict';
// Merge acceptance through production consumers with synthetic DOM/source IO.
// No browser, learner profile, credentials, media or NAS access.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const base=path.resolve(__dirname,'..'),A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js'),{fixture,close}=require('./source-authority-fixture.cjs');
function familyHelpers(){
 const file=path.join(__dirname,'family-grammar-actual-flow-v89.test.cjs'),source=fs.readFileSync(file,'utf8'),prefix=source.slice(0,source.indexOf('\ntest('));assert.ok(prefix&&prefix.length<source.length);
 return new Function('require','__dirname',prefix+'\nreturn {mounted,openGrammar,answer,submit,completion,entriesFor,settle};')(createRequire(file),__dirname);
}
const copy=value=>JSON.parse(JSON.stringify(value));

test('merged Player keeps the real family grammar binding, quote exposure and10Q save alongside Year APIs',async()=>{
 const H=familyHelpers(),f=await H.mounted(3);try{
  const nav=f.win.IELTSTodayNavigation,oldDraft=JSON.stringify(f.seed.draft),m=await H.openGrammar(f),draft=nav.allDrafts().find(d=>d.materialId===m.id),reading=m.sourceConnections.find(link=>link.materialId.startsWith('w01-read-')),listening=m.sourceConnections.find(link=>link.materialId.startsWith('w01-listen-'));
  assert.equal(typeof nav.openYear,'function');assert.equal(typeof nav.refreshYearRecords,'function');assert.equal(typeof nav.yearContext,'function');assert.equal(typeof f.win.IELTSCoursePlayer.quotedGrammarSourceIds,'function');
  assert.match(f.nodes.get('courseMaterialIntro').textContent,/本课新语法单元/);assert.ok(f.nodes.get('courseMaterialIntro').textContent.includes(m.title));assert.equal(draft.dayPlanBinding.day.familyGrammar.materialId,m.id);assert.ok(nav.exposures()[reading.materialId]);assert.equal(nav.exposures()[listening.materialId],undefined);assert.equal(draft.audioCompleted,false);
  await H.answer(f,m);const record=await H.submit(f),artifact=A.decodeArtifact(record);assert.equal(record.quantity,10);assert.equal(record.evaluation.score,10);assert.equal(artifact.dayPlanBinding.contentHash,draft.dayPlanBinding.contentHash);assert.equal(artifact.materialBinding.contentHash,draft.materialBinding.contentHash);assert.equal(H.completion(f).dataset.complete,'true');assert.equal(JSON.stringify(nav.allDrafts().find(d=>d.id===f.seed.draft.id)),oldDraft);
  const entries=await H.entriesFor(f);assert.ok(f.Backup.validate(P.KEY,entries[P.KEY]));assert.ok(f.Backup.validate(f.R.KEY,entries[f.R.KEY]));assert.equal(f.idb.events.some(e=>e.kind==='complete'&&e.mode==='readwrite'&&e.stores.includes('records')),true);
 }finally{f.win.dispatchEvent(new f.context.CustomEvent('pagehide'));await H.settle();}
});

test('merged Player retains ordinary Year mode, exact assignment and durable-start lease lifecycle',async()=>{
 const f=await fixture();try{
  const nav=f.win.IELTSTodayNavigation,entry=nav.learningQueue().next;assert.equal(entry.kind,'year-first-use');assert.equal(await nav.openYear(entry),true);await f.flush();const draft=nav.allDrafts().find(d=>d.yearAssignment);assert.ok(draft);assert.equal(draft.exposureAtStart,'seen');assert.equal(f.nodes.get('courseMode').value,'practice');assert.equal(f.nodes.get('courseMode').disabled,true);assert.match(f.nodes.get('courseMaterialIntro').textContent,/全年适级普通练习/);assert.equal(f.locks.held().some(name=>name.startsWith('ielts-year-start:')),false);
  const input=f.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value==='red');assert.ok(input);input.checked=true;await input.fire('change');f.advance(60000);await f.nodes.get('courseSubmit').fire('click');await f.flush();const record=f.control.raw().records.find(r=>r.id===draft.id);assert.ok(record,f.nodes.get('courseSubmitStatus').textContent);const artifact=A.decodeArtifact(record);assert.deepEqual(copy(artifact.yearAssignment),copy(draft.yearAssignment));assert.equal(record.dayNumber,2);assert.equal(A.evidenceFor(record,artifact.materialBinding.material).pass,false);
 }finally{await close(f);}
});

test('merged Player returns the exact current branded collection instead of overlaying an older open history result',async()=>{
 const f=await fixture();try{
  const nav=f.win.IELTSTodayNavigation,target=f.control.raw().records.find(r=>r.dayNumber===2&&r.skill==='writing');await nav.showLatestRecord('writing',target.materialId);assert.equal(nav.current().submitted,true);const originalAnswer=target.answer;
  await f.win.IELTSRecords.update(target.id,{evaluation:{method:'none',result:'pending',feedback:'Synthetic new authoritative evaluation after history opened'}},'merge-pending-after-history');await f.flush();const fresh=await nav.refreshYearRecords(),current=nav.yearContext().records,index=f.win.IELTSRecordSnapshotIndex;
  assert.equal(current,fresh,'the current Records brand and array order must be preserved');assert.ok(index.receipt(current));assert.equal(index.isCurrent(current),true);assert.ok(Object.isFrozen(current)&&Object.isFrozen(current[0]));const row=current.find(r=>r.id===target.id);assert.equal(row.evaluation.result,'pending');assert.ok(row.version>target.version);assert.equal(row.answer,originalAnswer);assert.equal(nav.learningQueue().currentComplete,false);assert.notEqual(nav.learningQueue().next.kind,'year-first-use');assert.equal(nav.allDrafts().some(d=>d.yearAssignment),false);
 }finally{await close(f);}
});

test('merged Player still confirms authoritative core state after Year hydration and releases a rejected start',async()=>{
 const f=await fixture();try{
  const nav=f.win.IELTSTodayNavigation,api=f.win.IELTSYearFirstUseCourse,entry=nav.learningQueue().next,target=f.control.raw().records.find(r=>r.dayNumber===2&&r.skill==='writing');assert.equal(entry.kind,'year-first-use');let changed=false;
  f.win.IELTSYearFirstUseCourse={...api,start:async value=>{const started=await api.start(value);assert.ok(f.locks.held().some(name=>name.startsWith('ielts-year-start:')));await f.win.IELTSRecords.update(target.id,{evaluation:{method:'none',result:'pending',feedback:'Synthetic pending core after admission before Player begin'}},'merge-late-pending-core');changed=true;return started;}};
  assert.equal(await nav.openYear(entry),false);assert.equal(changed,true);await f.flush();assert.equal(nav.allDrafts().some(d=>d.yearAssignment),false);assert.equal(nav.exposures()[entry.materialId],undefined);assert.equal(f.locks.held().some(name=>name.startsWith('ielts-year-start:')),false);const state=JSON.parse(f.map.get('ielts52-year-first-use-v1'));assert.equal(Object.values(state.jobs).some(job=>job.status==='in-progress'||job.reservation),false);assert.equal(nav.learningQueue().currentComplete,false);
 }finally{await close(f);}
});
