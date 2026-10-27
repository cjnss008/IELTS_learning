'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {base,D,P,A,copy,settle,mount,inputFor}=require('./answer-replay-fixture-v95.cjs');
const day=D.days.find(d=>d.day===2),taskOf=skill=>day.tasks.find(t=>t.id===skill),materialOf=skill=>D.materials.find(m=>m.id===taskOf(skill).materialIds[0]);
const beforePlayer=path.join(__dirname,'fixtures/course-player-before-replay-v94.js');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(beforePlayer)).digest('hex'),'9f39c45343ebae35c67f44f0d5b7c9474adead894771a7d4f305ec3aef56d7e5','The historical producer is exactly published 94, not a test recreation');
for(const skill of ['grammar','listening','reading','writing','speaking','vocabulary'])test('continue preserves saved '+skill+' original instead of creating an empty attempt',async()=>{
 const f=mount(),m=materialOf(skill);await settle();const result=await f.R.record(inputFor(2,skill,m.id));await settle();
 const before=JSON.stringify(await f.R.list());
 await f.win.IELTSTodayNavigation.resumeNext(skill,m.id);await settle();
 assert.equal(f.win.IELTSTodayNavigation.current().submitted,true,f.nodes.get('courseNotice').textContent);
 assert.match(f.nodes.get('courseSubmitStatus').textContent,/已保存的原作答/);
 assert.equal(f.win.IELTSTodayNavigation.allDrafts().length,0);
 assert.equal(JSON.stringify(await f.R.list()),before);
 assert.equal((await f.R.list())[0].answer,result.record.answer);
});
test('partial submitted answers are opened read-only; correction requires an explicit action',async()=>{
 const f=mount(),m=materialOf('reading'),q=m.questions[0],input=inputFor(2,'reading',m.id,{answers:{[q.id]:q.answers[0]}});await settle();
 assert.equal(A.decodeArtifact(input).submissionComplete,false);
 await f.R.record(input);await settle();const before=JSON.stringify(await f.R.list());
 await f.win.IELTSTodayNavigation.resumeNext('reading',m.id);await settle();
 assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);
 assert.equal(f.win.IELTSTodayNavigation.allDrafts().length,0);
 assert.equal(JSON.stringify(await f.R.list()),before);
 const correction=f.nodes.get('courseResult').querySelectorAll('button').find(b=>b.textContent==='建立订正版本');assert.ok(correction);await correction.fire('click');await settle();
 const resumed=f.win.IELTSTodayNavigation.allDrafts()[0];assert.equal(resumed.kind,'correction');assert.equal(resumed.parentId,input.id);assert.equal(resumed.answers[q.id],q.answers[0]);assert.equal(JSON.stringify(await f.R.list()),before);
});
test('module card offers saved second-material answer without starting the first material',async()=>{
 const f=mount(),id='day02-expansion-reading';await settle();const r=(await f.R.record(inputFor(2,'reading',id))).record;await settle();
 f.win.IELTSTodayNavigation.showTask('reading');await settle();
 const saved=f.nodes.get('courseMaterials').querySelectorAll('.course-saved-work').flatMap(row=>row.querySelectorAll('button')).find(b=>b.dataset.recordId===r.id);
 assert.ok(saved,'The saved second material must be reachable from its module card');
 await saved.fire('click');await settle();
 assert.equal(f.win.IELTSTodayNavigation.current().materialId,id);
 assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);
 assert.equal(f.win.IELTSTodayNavigation.allDrafts().length,0);
});
test('a real filled draft wins over an older saved original through module/start and continue entries',async()=>{
 const f=mount(),m=materialOf('reading'),q=m.questions[0];await settle();
 const r=(await f.R.record(inputFor(2,'reading',m.id))).record;await settle();
 const binding=P.freezeMaterialBinding(m,{assessment:A,task:taskOf('reading'),data:D,courseDay:2,attemptId:'draft-replay-real'});
 const draft={id:'draft-replay-real',materialId:m.id,materialBinding:binding,taskId:'reading',courseDay:2,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-24T11:30:00.000Z',activeSeconds:12,exposureAtStart:'seen',answers:{[q.id]:'preserved draft answer'},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[]};
 const state=P.newState();state.day=2;state.drafts[draft.id]=draft;f.map.set(P.KEY,JSON.stringify(state));
 // Re-enter through the actual draft reader first, then the module card.
 await f.win.IELTSTodayNavigation.resumeDraft(draft.id);await settle();
 f.win.IELTSTodayNavigation.showTask('reading',m.id);await settle();
 await f.nodes.get('courseBegin').fire('click');await settle();
 assert.equal(f.win.IELTSTodayNavigation.current().submitted,false);
 assert.equal(f.win.IELTSTodayNavigation.allDrafts()[0].id,draft.id);
 assert.equal(f.win.IELTSTodayNavigation.allDrafts()[0].answers[q.id],'preserved draft answer');
 await f.win.IELTSTodayNavigation.resumeNext('reading',m.id);await settle();
 assert.equal(f.win.IELTSTodayNavigation.allDrafts()[0].id,draft.id);
 assert.equal((await f.R.list())[0].answer,r.answer);
});
test('pending subjective output keeps its saved text and opens no new draft',async()=>{
 const f=mount(),m=materialOf('writing'),input=inputFor(2,'writing',m.id);input.evaluation={method:'none',result:'pending',feedback:'Synthetic service retry, original retained.'};await settle();
 const saved=(await f.R.record(input)).record;await settle();
 await f.win.IELTSTodayNavigation.resumeNext('writing',m.id);await settle();
 assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);
 assert.equal(f.nodes.get('courseOutput').querySelector('textarea').value,A.decodeArtifact(saved).text);
 assert.equal(f.win.IELTSTodayNavigation.allDrafts().length,0);
 assert.equal((await f.R.list())[0].answer,saved.answer);
});
test('latest-record entry includes the latest explicit same-material relearning submission',async()=>{
 const f=mount(),m=materialOf('reading'),q=m.questions[0],wrong=q.options.find(v=>!q.answers.includes(v));await settle();
 const original=(await f.R.record(inputFor(2,'reading',m.id))).record;
 const answers=copy(A.decodeArtifact(original).answers);answers[q.id]=wrong;
 const next=inputFor(2,'reading',m.id,{id:'replay-explicit-relearning',at:'2026-10-24T11:30:00.000Z',answers});next.kind='retest';next.parentId=original.id;
 const saved=(await f.R.record(next)).record;await settle();
 await f.win.IELTSTodayNavigation.showLatestRecord('reading',m.id);await settle();
 const checked=f.nodes.get('courseQuestions').querySelectorAll('input:checked');assert.ok(checked.some(input=>input.value===wrong),'Must display the latest actual submitted answers, including explicit relearning');
 assert.equal((await f.R.list()).find(r=>r.id===saved.id).answer,saved.answer);
 assert.equal(f.win.IELTSTodayNavigation.allDrafts().length,0);
});
test('a missing legacy taskId is normalized by actual Records; another lesson is not silently credited',async()=>{
 const f=mount(),m=materialOf('reading'),input=inputFor(2,'reading',m.id);delete input.taskId;await settle();
 const r=(await f.R.record(input)).record;assert.equal(r.taskId,'reading');await settle();
 f.win.IELTSTodayNavigation.showTask('reading',m.id);assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);
 f.win.IELTSTodayNavigation.showDay(3);f.win.IELTSTodayNavigation.showTask('reading',m.id);await settle();
 assert.equal(f.win.IELTSTodayNavigation.current().submitted,false);
 assert.equal(f.nodes.get('courseMaterials').querySelectorAll('.course-saved-work').length,0);
 assert.equal((await f.R.list())[0].answer,r.answer);
});
test('profile changes while actual Records is being read cannot create or reveal an old-profile attempt',async()=>{
 const f=mount(),m=materialOf('reading');await settle();await f.R.record(inputFor(2,'reading',m.id));await settle();
 f.win.IELTSTodayNavigation.showTask('listening');await settle();
 const originalList=f.R.list;let release,entered;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
 f.R.list=async(...args)=>{const rows=await originalList(...args);entered();await wait;return rows;};
 const pending=f.win.IELTSTodayNavigation.showLatestRecord('reading',m.id);await ready;
 f.win.IELTSProfiles.current=()=>({id:'another-isolated-profile'});f.win.dispatchEvent({type:'ielts:profile-changed',detail:{profileId:'another-isolated-profile'}});release();await pending;await settle();
 assert.equal(f.win.IELTSTodayNavigation.current().submitted,false);assert.equal(f.win.IELTSTodayNavigation.allDrafts().length,0);
});
for(const skill of ['reading','writing','speaking'])test('upgrading a real 94 empty '+skill+' original preserves it but defaults to the saved answers',async()=>{
 const selectedSource=process.env.REPLAY_PLAYER_SOURCE;process.env.REPLAY_PLAYER_SOURCE=beforePlayer;
 const old=mount(),m=materialOf(skill);if(selectedSource)process.env.REPLAY_PLAYER_SOURCE=selectedSource;else delete process.env.REPLAY_PLAYER_SOURCE;
 await settle();await old.R.record(inputFor(2,skill,m.id));await settle();await old.win.IELTSTodayNavigation.resumeNext(skill,m.id);await settle();
 const empty=old.win.IELTSTodayNavigation.allDrafts()[0];assert.ok(empty,'94 must actually produce the old empty original');if(skill==='speaking'){assert.ok(empty.modelReading.segments.length);assert.ok(empty.modelReading.segments.every(s=>!s.workId&&!s.evidenceId&&!s.professional&&!s.coach));assert.ok(JSON.parse(empty.text).workIds.every(id=>!id));}else assert.equal(P.draftProgress(empty,m).score.some(Boolean),false);
 const original=await old.R.exportState(),draftRaw=old.map.get(P.KEY),answer=original.records[0].answer;
 const upgraded=mount({storage:old.map});await settle();await upgraded.R.importState(original,{mode:'replace'});await settle();
 upgraded.win.IELTSTodayNavigation.showTask(skill,m.id);await settle();
 assert.equal(upgraded.win.IELTSTodayNavigation.current().submitted,true);
 await upgraded.nodes.get('courseBegin').fire('click');await settle();
 assert.equal(upgraded.win.IELTSTodayNavigation.current().submitted,true);
 await upgraded.win.IELTSTodayNavigation.resumeNext(skill,m.id);await settle();
 assert.equal(upgraded.win.IELTSTodayNavigation.current().submitted,true);
 assert.equal(upgraded.map.get(P.KEY),draftRaw,'No migration/deletion/rewrite of the old blank draft');
 assert.equal((await upgraded.R.list())[0].answer,answer);
});
test('a delayed latest-record read and an old saved-module link cannot replace a later view',async()=>{
 const f=mount(),m=materialOf('reading');await settle();await f.R.record(inputFor(2,'reading',m.id));await settle();f.win.IELTSTodayNavigation.showTask('reading');
 const oldLink=f.nodes.get('courseMaterials').querySelector('.course-saved-work')?.querySelector('button');
 const originalList=f.R.list;let release,entered;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
 f.R.list=async(...args)=>{const rows=await originalList(...args);entered();await wait;return rows;};
 const pending=f.win.IELTSTodayNavigation.showLatestRecord('reading',m.id);await ready;f.win.IELTSTodayNavigation.showTask('listening');const before=copy(f.win.IELTSTodayNavigation.current());release();await pending;await settle();
 assert.deepEqual(copy(f.win.IELTSTodayNavigation.current()),before);await oldLink?.fire('click');await settle();assert.deepEqual(copy(f.win.IELTSTodayNavigation.current()),before);
});
test('an explicitly started empty relearning draft keeps its parent/ID and wins over the old original',async()=>{
 const f=mount(),m=materialOf('reading');await settle();const r=(await f.R.record(inputFor(2,'reading',m.id))).record;await settle();
 await f.win.IELTSTodayNavigation.showLatestRecord('reading',m.id);await settle();await f.nodes.get('courseResult').querySelector('.course-relearn').fire('click');await settle();
 const draft=f.win.IELTSTodayNavigation.allDrafts()[0];assert.ok(draft);assert.equal(draft.kind,'retest');assert.equal(draft.parentId,r.id);assert.equal(Object.keys(draft.answers).length,0);
 f.win.IELTSTodayNavigation.showTask('reading',m.id);await f.nodes.get('courseBegin').fire('click');await settle();
 assert.equal(f.win.IELTSTodayNavigation.current().submitted,false);assert.equal(f.win.IELTSTodayNavigation.allDrafts()[0].id,draft.id);assert.equal(f.win.IELTSTodayNavigation.allDrafts()[0].parentId,r.id);assert.equal((await f.R.list())[0].answer,r.answer);
});
test('an old bound grammar answer remains reachable after actual Adaptive family projection replaces its required IDs',async()=>{
 const Adaptive=require(path.join(base,'assets/adaptive-plan.js')),Flow=require(path.join(base,'assets/course-expansion.js')),Hub=require(path.join(base,'assets/today-hub.js'));
 const state=Adaptive.newState();state.startedDays=[2];state.frozenDays[2]=copy(day);const backing=new Map([[Adaptive.KEY,JSON.stringify(state)]]);let adaptive;
 const f=mount({storage:backing,beforePlayer(win){adaptive=Adaptive.createStore({data:win.IELTSCurriculumData,storage:win.IELTSProfiles.storage(),profileId:'replay-isolated',contextReady:true,assessment:A,player:P,hub:Hub,now:()=>Date.parse('2026-10-24T12:00:00.000Z')});win.IELTSCourseExpansion=Flow;win.IELTSAdaptivePlan=adaptive;}});await settle();
 const m=materialOf('grammar'),r=(await f.R.record(inputFor(2,'grammar',m.id))).record;await settle();adaptive.adoptStarted({records:await f.R.list(),drafts:[]});const effective=adaptive.getDay(day);
 assert.ok(effective.familyGrammar);assert.ok(!effective.tasks.find(t=>t.id==='grammar').materialIds.includes(m.id));
 f.win.IELTSTodayNavigation.showTask('grammar');await settle();const link=f.nodes.get('courseMaterials').querySelectorAll('.course-saved-work').flatMap(row=>row.querySelectorAll('button')).find(b=>b.dataset.recordId===r.id);assert.ok(link,'Removed foundation IDs must keep a direct saved-answer entry');
 await link.fire('click');await settle();assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);assert.equal(f.win.IELTSTodayNavigation.current().materialId,m.id);assert.equal((await f.R.list())[0].answer,r.answer);assert.equal(backing.get(Adaptive.KEY),JSON.stringify(state));
});
test('an actual oral progress draft with a pending work reference is kept ahead of its old saved original',async()=>{
 const selectedSource=process.env.REPLAY_PLAYER_SOURCE;process.env.REPLAY_PLAYER_SOURCE=beforePlayer;const f=mount(),m=materialOf('speaking');if(selectedSource)process.env.REPLAY_PLAYER_SOURCE=selectedSource;else delete process.env.REPLAY_PLAYER_SOURCE;
 await settle();const saved=(await f.R.record(inputFor(2,'speaking',m.id))).record;await settle();await f.win.IELTSTodayNavigation.resumeNext('speaking',m.id);await settle();
 const state=P.parseState(f.map.get(P.KEY)),draft=Object.values(state.drafts)[0];draft.modelReading.segments[0].workId='work-preserved-pending-oral';const progress=JSON.parse(draft.text);progress.workIds[0]='work-preserved-pending-oral';draft.text=JSON.stringify(progress);
 const raw=JSON.stringify(P.parseState(state));const map=new Map(f.map);map.set(P.KEY,raw);const next=mount({storage:map});await settle();await next.R.importState(await f.R.exportState(),{mode:'replace'});await settle();
 next.win.IELTSTodayNavigation.showTask('speaking',m.id);await settle();assert.equal(next.win.IELTSTodayNavigation.current().submitted,false);assert.equal(next.nodes.get('courseBegin').textContent,'继续未提交原稿');
 await next.nodes.get('courseBegin').fire('click');await settle();assert.equal(next.win.IELTSTodayNavigation.current().submitted,false);assert.equal(next.win.IELTSTodayNavigation.allDrafts().find(d=>d.id===draft.id).id,draft.id);assert.equal((await next.R.list())[0].answer,saved.answer);
});
