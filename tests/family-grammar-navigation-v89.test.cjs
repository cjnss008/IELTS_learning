'use strict';
// Synthetic DOM consumers only. No browser, learner directory, service or credentials.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const D=require('../assets/curriculum-data.js'),P=require('../assets/course-player.js'),A=require('../assets/assessment-core.js'),Flow=require('../assets/course-expansion.js'),Adaptive=require('../assets/adaptive-plan.js'),Hub=require('../assets/today-hub.js'),Load=require('../assets/daily-learning-load.js'),Year=require('../assets/year-planner.js');
const {original}=require('./actual-lessons-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x)),NOW=Date.parse('2026-10-24T12:00:00.000Z'),NEW='day02-expansion-grammar',OLD='w01-read-2-grammar',grammar=d=>d.tasks.find(t=>t.id==='grammar');
function fixtureFactory(){const file=path.join(__dirname,'course-player-dom.test.cjs'),source=fs.readFileSync(file,'utf8');return new Function('require','__dirname',source.slice(0,source.indexOf('\ntest('))+'\nreturn fixture;')(createRequire(file),__dirname);}
const playerFixture=fixtureFactory(),settle=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
function newOnlyDay(){const day=clone(D.days[1]),task=grammar(day);task.materialIds=[NEW];if(task.coreMaterialIds)task.coreMaterialIds=[NEW];if(task.materialPractice)task.materialPractice=task.materialPractice.filter(r=>r.materialId===NEW);task.quantity=10;return day;}
async function mounted(day,{search='?day=2',storage=new Map(),queue=true}={}){
 const preserved=clone(day),f=playerFixture(D.materials.find(m=>m.id==='w01-read-2'),{search,storage,queue,window:{IELTSCourseExpansion:Flow,IELTSYearPlanner:Year,IELTSAdaptivePlan:{getDay:base=>base.day===preserved.day?clone(preserved):base,adoptStarted(){},markStarted(){},validDayBinding:Adaptive.validDayBinding,read:()=>({frozenDays:{[preserved.day]:clone(preserved)}})}},setup:data=>{data.days=[clone(preserved)];data.materials=D.materials;data.weeks=D.weeks;}});await settle();return f;
}
async function mountToday(f){vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/today-hub.js'),'utf8'),{window:f.win,globalThis:f.win,URLSearchParams,URL,console});await settle();return f;}
const questionCards=f=>f.nodes.get('courseQuestions').children.filter(n=>n.className==='course-question');
function assertOriginalQuestions(f,m,answers){const cards=questionCards(f);assert.equal(cards.length,m.questions.length);for(const q of m.questions){const card=cards.find(c=>c.dataset.questionId===q.id);assert.ok(card);assert.ok(card.textContent.includes(q.prompt));const inputs=card.querySelectorAll('input,textarea');if(['single','multi'].includes(q.type)){assert.deepEqual(inputs.map(i=>i.value).sort(),q.options.slice().sort());const expected=Array.isArray(answers[q.id])?answers[q.id]:[answers[q.id]];assert.deepEqual(inputs.filter(i=>i.checked).map(i=>i.value).sort(),expected.filter(x=>x!==undefined).sort());}else assert.equal(inputs[0].value,answers[q.id]||'');}}
function legacyDraft(){const day=D.days[1],task=grammar(day),m=D.materials.find(x=>x.id===OLD),id='family-nav-retained-input';return{id,materialId:m.id,taskId:'grammar',courseDay:2,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-24T10:00:00.000Z',activeSeconds:30,exposureAtStart:'unseen',answers:{q1:m.questions[0].answers[0]},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:P.freezeMaterialBinding(m,{assessment:A,data:D,task,courseDay:2,attemptId:id}),dayPlanBinding:{schema:1,contentHash:A.materialContentHash(day),day:clone(day)}};}
function legacyRecord(){const day=D.days[1],task=grammar(day),m=D.materials.find(x=>x.id===OLD),r=original(2,task,m,NOW-60000),artifact=A.decodeArtifact(r);artifact.materialBinding=P.freezeMaterialBinding(m,{assessment:A,data:D,task,courseDay:2,attemptId:r.id});artifact.dayPlanBinding={schema:1,contentHash:A.materialContentHash(day),day:clone(day)};artifact.gradingPolicy=artifact.objectiveGrading=artifact.materialBinding.gradingPolicy;r.answer=JSON.stringify(artifact);delete r.version;return r;}

test('frozen/raw day2 actual Today step, Load queue and Player continuation agree on the new ten-question pack',async()=>{
 const before=JSON.stringify(D.days[1]),raw=clone(D.days[1]),task=grammar(raw),f=await mountToday(await mounted(raw));
 const step=f.nodes.get('todayRoute').children.find(n=>n.children.some(c=>c.tagName==='STRONG'&&c.textContent==='语法'));assert.ok(step,'real Today route mounted');await step.fire('click');assert.equal(f.win.IELTSTodayNavigation.current().materialId,NEW);
 assert.equal(Hub.taskState(task,[],{data:D,dayNumber:2}).nextMaterialId,NEW);
 const queue=f.win.IELTSTodayNavigation.learningQueue();assert.ok(queue);assert.equal(queue.entries.find(e=>e.taskId==='grammar'&&e.kind==='material').materialId,NEW);assert.equal(queue.next.materialId,NEW);
 assert.equal(P.nextDestination({...D,days:[raw]},2,'grammar',[],{hub:Hub,adaptivePlan:null}).materialId,NEW);
 assert.equal(await f.win.IELTSTodayNavigation.openQueued(),true);assert.equal(f.win.IELTSTodayNavigation.current().materialId,NEW);assert.equal(f.win.IELTSTodayNavigation.current().active,true);assert.equal(questionCards(f).length,10);assert.equal(JSON.stringify(D.days[1]),before);assert.equal(f.records().length,0);
});

test('actual URL mount rejects a removed old preferred material and opens the new ten-question member',async()=>{
 const day=newOnlyDay(),before=JSON.stringify(day),f=await mounted(day,{search:'?day=2&material='+OLD});assert.equal(f.win.IELTSTodayNavigation.current().materialId,NEW);assert.ok(f.nodes.get('courseMaterialIntro').textContent.includes(D.materials.find(m=>m.id===NEW).title));
 await f.win.IELTSTodayNavigation.begin();assert.equal(questionCards(f).length,10);assert.equal(f.win.IELTSTodayNavigation.current().materialId,NEW);assert.equal(JSON.stringify(day),before);assert.equal(f.records().length,0);
});

test('actual submitted-original continuation button goes to the new grammar before other retained foundation packs',async()=>{
 const f=await mounted(D.days[1],{queue:false}),r=legacyRecord();await f.win.IELTSRecords.record(r);await f.win.IELTSTodayNavigation.showLatestRecord('grammar',OLD);assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);
 const go=f.nodes.get('courseResult').querySelector('.course-continue-queue');assert.ok(go,'real saved-original continuation rendered');assert.equal(go.disabled,false);await go.fire('click');await settle();assert.equal(f.win.IELTSTodayNavigation.current().materialId,NEW);assert.equal(f.win.IELTSTodayNavigation.current().submitted,false);assert.equal(questionCards(f).length,10);assert.equal(f.records().length,1);assert.equal(f.records()[0].id,r.id);
});

test('bound old answered draft restores the original four questions, input and task contract outside the new task membership',async()=>{
 const draft=legacyDraft(),bytes=JSON.stringify(draft),state=P.newState();state.day=2;state.drafts[draft.id]=clone(draft);const storage=new Map([[P.KEY,JSON.stringify(state)]]),f=await mounted(newOnlyDay(),{storage,search:'?day=2&material='+OLD});
 await f.win.IELTSTodayNavigation.resumeDraft(draft.id);const current=f.win.IELTSTodayNavigation.current(),restored=f.win.IELTSTodayNavigation.allDrafts().find(x=>x.id===draft.id);assert.equal(current.materialId,OLD);assert.equal(current.active,true);assert.equal(current.submitted,false);assert.equal(JSON.stringify(restored),bytes);assert.deepEqual(P.resolveDraftMaterial(restored,D.materials.find(m=>m.id===OLD)).material.questions,draft.materialBinding.material.questions);assertOriginalQuestions(f,draft.materialBinding.material,draft.answers);assert.equal(f.records().length,0);assert.equal(JSON.stringify(draft),bytes);
});

test('actual saved history opens original material/questions/answers without retargeting, rewriting or creating a draft',async()=>{
 const f=await mounted(newOnlyDay(),{search:'?day=2&material='+OLD}),r=legacyRecord(),stored=(await f.win.IELTSRecords.record(r)).record,bytes=JSON.stringify(stored),artifact=A.decodeArtifact(stored);await f.win.IELTSTodayNavigation.showLatestRecord('grammar',OLD);
 assert.equal(f.win.IELTSTodayNavigation.current().materialId,OLD);assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);assertOriginalQuestions(f,artifact.materialBinding.material,artifact.answers);assert.equal(f.nodes.get('courseSubmit').disabled,true);assert.equal(f.win.IELTSTodayNavigation.allDrafts().length,0);assert.equal(f.records().length,1);assert.equal(JSON.stringify(f.records()[0]),bytes);
});

test('day1 keeps its exact original grammar order, material selection and complete source day contract',async()=>{
 const protectedDay=require('../curriculum/stable-lessons-02-10/manifest.json').protectedDay1;assert.equal(A.materialContentHash(D.days[0]),protectedDay.dayContentHash);for(const pin of protectedDay.materials)assert.equal(A.materialContentHash(D.materials.find(m=>m.id===pin.id)),pin.contentHash,pin.id);
 const day=D.days[0],before=JSON.stringify(day),f=await mounted(day,{search:'?day=1'});await f.nodes.get('courseTasks').children.find(n=>n.dataset.taskId==='grammar').fire('click');const buttons=f.nodes.get('courseMaterials').children.filter(n=>n.className==='course-material-button');assert.deepEqual(buttons.map(n=>n.dataset.materialId),grammar(day).materialIds);assert.equal(f.win.IELTSTodayNavigation.current().materialId,grammar(day).materialIds[0]);assert.equal(JSON.stringify(D.days[0]),before);assert.equal(f.records().length,0);
});
