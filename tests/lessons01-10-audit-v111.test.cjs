'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {D,A,settle,mount,inputFor}=require('./answer-replay-fixture-v95.cjs');
const root=path.resolve(__dirname,'..'),byId=new Map(D.materials.map(m=>[m.id,m]));
const skills=['vocabulary','grammar','listening','reading','speaking','writing'];
test('saved-work header refreshes its learning count while a previous original stays open',async()=>{
 const f=mount(),m=byId.get(D.days[1].tasks.find(t=>t.id==='grammar').materialIds[0]);await settle();
 const first=(await f.R.record(inputFor(2,'grammar',m.id))).record;await settle();
 await f.win.IELTSTodayNavigation.resumeNext('grammar',m.id);await settle();
 assert.match(f.nodes.get('courseMaterialIntro').textContent,/已学习 1 次/);
 const next=inputFor(2,'grammar',m.id,{id:'audit111-relearn-header',at:'2026-10-24T11:30:00.000Z'});next.kind='retest';next.parentId=first.id;
 await f.R.record(next);await settle();
 assert.match(f.nodes.get('courseMaterialIntro').textContent,/已学习 2 次/);
 assert.equal((await f.R.list()).find(r=>r.id===first.id).answer,first.answer);
});
for(let day=1;day<=10;day++)test('lesson '+day+': all six saved module originals reopen without losing answers or creating empty replacements',async()=>{
 const f=mount({search:'?day='+day});await settle();
 const R=require('../assets/learning-records.js');let history=R.newState();
 for(const skill of skills){const id=D.days.find(d=>d.day===day).tasks.find(t=>t.id===skill).materialIds[0],r=inputFor(day,skill,id);history=R.put(history,r,r.submittedAt).state;}
 await f.R.importState(history,{mode:'replace'});await settle();
 for(const skill of skills){
  const task=D.days.find(d=>d.day===day).tasks.find(t=>t.id===skill),id=task.materialIds[0];
  const saved=(await f.R.list()).find(r=>r.materialId===id&&r.skill===skill);assert.ok(saved);
  await f.win.IELTSTodayNavigation.resumeNext(skill,id);await settle();
  assert.equal(f.win.IELTSTodayNavigation.current().submitted,true,day+'/'+skill+': '+f.nodes.get('courseNotice').textContent);
  assert.equal(f.win.IELTSTodayNavigation.current().materialId,id);
  assert.equal((await f.R.list()).find(r=>r.id===saved.id).answer,saved.answer);
  assert.equal(f.win.IELTSTodayNavigation.allDrafts().length,0);
  if(['grammar','reading','listening'].includes(skill)){
   const artifact=A.decodeArtifact(saved),nodes=f.nodes.get('courseQuestions').querySelectorAll('input');
   for(const q of byId.get(id).questions){
    if(q.type==='single')assert.ok(nodes.some(n=>n.checked&&n.value===artifact.answers[q.id]),day+'/'+skill+'/'+q.id);
   }
  }
  if(skill==='writing')assert.equal(f.nodes.get('courseOutput').querySelector('textarea').value,A.decodeArtifact(saved).text);
 }
 assert.equal((await f.R.list()).length,6);
});

test('lessons 1–10: every scheduled and linked objective question grades its answer, rejects unrelated input and has feedback; local material audio exists',()=>{
 const ids=new Set(D.days.slice(0,10).flatMap(d=>d.tasks.flatMap(t=>t.materialIds)));
 for(const unit of D.familyLessonRelease.units.filter(u=>u.day<=10))for(const task of unit.tasks)for(const ref of task.materialRefs)ids.add(ref.materialId);
 let questions=0,listening=0;
 for(const id of ids){
  const m=byId.get(id);assert.ok(m,'Missing '+id);
  for(const q of m.questions||[]){
   assert.equal(A.gradeQuestion(q,q.type==='multi'?q.answers:q.answers[0]).correct,true,id+'/'+q.id);
   assert.equal(A.gradeQuestion(q,'unrelated invalid answer 93841').correct,false,id+'/'+q.id);
   assert.ok(q.explanation?.trim(),id+'/'+q.id+' has no correction explanation');questions++;
  }
  if(m.skill==='listening'){
   const src=typeof m.audio==='string'?m.audio:m.audio?.src;assert.ok(src,id+' missing audio');
   assert.ok(fs.statSync(path.join(root,src)).size>100,id+' empty audio');listening++;
  }
 }
 assert.ok(questions>=242);assert.ok(listening>=7);
});
