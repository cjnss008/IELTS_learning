'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const Hub=require('../assets/today-hub.js'),A=require('../assets/assessment-core.js'),Records=require('../assets/learning-records.js');
// Reuse the existing lightweight DOM fixture, with the real player and Records
// functions. This is a DOM regression, not native browser/media acceptance.
const filename=path.join(__dirname,'course-player-dom.test.cjs'),source=fs.readFileSync(filename,'utf8'),marker=source.indexOf("test('vocabulary continuation");
assert.ok(marker>0);const fixtures=new Module(filename,module);fixtures.filename=filename;fixtures.paths=Module._nodeModulePaths(__dirname);fixtures._compile(source.slice(0,marker)+'\nmodule.exports={fixture,vocabularyModuleFixture};',filename);
const {fixture,vocabularyModuleFixture}=fixtures.exports;
const settle=()=>new Promise(r=>setImmediate(r));
async function answer(f,value='red'){const input=f.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value===value);assert.ok(input);input.checked=true;await input.fire('change');f.advance(1000);await f.nodes.get('courseSubmit').fire('click');await settle();}
async function open(f,skill='reading'){await settle();await f.nodes.get('courseTasks').children.find(n=>n.dataset.taskId===skill).fire('click');}

test('submitted selections reopen read-only, reload from Records, and three relearnings keep every original answer',async()=>{
 const f=fixture();await open(f);await f.nodes.get('courseBegin').fire('click');await answer(f);const original=JSON.stringify(f.records()[0]);
 await open(f);let chosen=f.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value==='red');assert.equal(chosen.checked,true);assert.equal(chosen.disabled,true);assert.match(f.nodes.get('courseResult').textContent,/已完成.*已学习 1 次/);
 const reloaded=fixture({}, {storage:f.map,window:{IELTSRecords:f.win.IELTSRecords}});await open(reloaded);chosen=reloaded.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value==='red');assert.equal(chosen.checked,true);
 for(let i=0;i<2;i++){await f.nodes.get('courseResult').querySelector('.course-relearn').fire('click');assert.equal(f.win.IELTSTodayNavigation.current().submitted,false);assert.equal(f.nodes.get('courseQuestions').querySelectorAll('input').some(n=>n.checked),false);await answer(f,i?'red':'blue');}
 assert.equal(f.records().length,3);assert.equal(JSON.stringify(f.records()[0]),original);assert.match(f.nodes.get('courseResult').textContent,/已完成.*已学习 3 次/);
 const repeated=f.records().slice(1);for(const r of repeated){assert.equal(r.kind,'retest');assert.equal(r.exposure,'seen');assert.equal(A.decodeArtifact(r).mode,'practice');assert.equal(r.assistance.answer,true);assert.ok(r.parentId);assert.equal(A.evidenceFor(r,reloaded.mat).pass,false);}
 const t=reloaded.win.IELTSCurriculumData.days[0].tasks.find(t=>t.id==='reading');assert.equal(Hub.taskState(t,f.records(),{dayNumber:1,materials:[reloaded.mat]}).done,true);assert.equal(Records.parseState({schemaVersion:1,records:f.records()},'2026-10-25T00:00:00.000Z').records.length,3);
});

test('an unfinished relearning resumes the same draft and does not increment the submitted count',async()=>{
 const f=fixture();await open(f);await f.nodes.get('courseBegin').fire('click');await answer(f);await f.nodes.get('courseResult').querySelector('.course-relearn').fire('click');const draft=f.win.IELTSTodayNavigation.allDrafts()[0];assert.ok(draft);await open(f);assert.match(f.nodes.get('courseResult').textContent,/已学习 1 次/);await f.nodes.get('courseResult').querySelector('.course-relearn').fire('click');assert.equal(f.win.IELTSTodayNavigation.allDrafts()[0].id,draft.id);assert.equal(f.records().length,1);
});

test('a saved answer displays its original question after the current curriculum changed',async()=>{
 const f=fixture();await open(f);await f.nodes.get('courseBegin').fire('click');await answer(f);const before=JSON.stringify(f.records());const fresh=fixture({version:'2',questions:[{id:'q2',type:'single',prompt:'New question only',options:['green','yellow'],answers:['green']}]},{storage:f.map,window:{IELTSRecords:f.win.IELTSRecords}});await open(fresh);assert.match(fresh.nodes.get('courseQuestions').textContent,/What colour is the bag/);assert.doesNotMatch(fresh.nodes.get('courseQuestions').textContent,/New question only/);assert.equal(fresh.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value==='red').checked,true);assert.equal(JSON.stringify(f.records()),before);
});

test('vocabulary reentry shows saved rounds and original spellings without starting a new word session',async()=>{
 const f=vocabularyModuleFixture();await open(f,'vocabulary');await f.nodes.get('courseBegin').fire('click');await f.submitVocabulary();await settle();const original=JSON.stringify(f.records()[0]);await open(f,'vocabulary');assert.match(f.nodes.get('courseResult').textContent,/三轮|training|训练版本/);assert.match(f.nodes.get('courseResult').textContent,/hello/);assert.ok(f.nodes.get('courseResult').querySelector('.course-relearn'));assert.equal(f.win.IELTSTodayNavigation.current().submitted,true);assert.equal(JSON.stringify(f.records()[0]),original);
});

test('counts require complete submitted work, collapse correction/history updates and use full-module cycles',()=>{
 const m=id=>({id,skill:'grammar',questions:[{id:'q',type:'single',options:['a','b'],answers:['a']}]}),materials=[m('g1'),m('g2')],task={id:'grammar',materialIds:['g1','g2']};
 const r=(id,materialId,extra={})=>({id,materialId,taskId:'grammar',skill:'grammar',dayNumber:1,kind:'original',answer:JSON.stringify({schema:1,answers:{q:'a'},mode:'practice'}),submittedAt:'2026-10-24T12:00:00.000Z',evaluation:{result:'pass'},...extra});
 const a=r('a','g1'),b=r('b','g2'),again=r('again','g1',{kind:'retest',parentId:'a'}),correction=r('c','g1',{kind:'correction',parentId:'a'});
 assert.equal(Hub.learningCount(task,[a,b,again,correction],{dayNumber:1,materials}),1);assert.equal(Hub.learningCount({...task,materialIds:['g1']},[a,again,correction,{...correction,version:2}],{dayNumber:1,materials}),2);
 assert.equal(Hub.learningCount(task,[a,{...b,answer:'{broken'}],{dayNumber:1,materials}),0);assert.equal(Hub.learningCount(task,[a,{...b,dayNumber:2}],{dayNumber:1,materials}),0);
 assert.equal(Hub.relearningRecord(r('child','g1',{kind:'correction',parentId:'again'}),[a,again]),true);
});

test('word help marks active practice as assisted and pre-start help makes a later attempt seen',async()=>{
 const f=fixture();await open(f);f.win.dispatchEvent({type:'ielts:learning-assistance',detail:{source:'word-hover',materialId:f.mat.id,word:'bag'}});await f.nodes.get('courseBegin').fire('click');assert.match(f.nodes.get('courseExposure').textContent,/已见/);
 f.win.dispatchEvent({type:'ielts:learning-assistance',detail:{source:'word-hover',materialId:f.mat.id,word:'red'}});await answer(f);assert.equal(f.records()[0].assistance.hint,true);assert.equal(f.records()[0].exposure,'seen');
});

test('grammar and listening readback retain multi-selection, short answers, and the saved listening flag',async()=>{
 for(const skill of ['grammar','listening']){
  const f=fixture({skill,questions:[{id:'q1',type:'multi',prompt:'Choose both colours.',options:['red','blue','green'],answers:['red','blue']},{id:'q2',type:'short',prompt:'Write a word.',answers:['bag']}]});await open(f,skill);
  const P=f.win.IELTSCoursePlayer,t=f.win.IELTSCurriculumData.days[0].tasks.find(t=>t.id===skill),at='2026-10-24T12:00:00.000Z',attempt={id:'course-saved-'+skill,materialId:f.mat.id,taskId:skill,courseDay:1,mode:'practice',kind:'original',parentId:null,startedAt:at,submittedAt:at,activeSeconds:0,exposureAtStart:'seen',answers:{q1:['red','blue'],q2:'bag'},userEvidence:{},text:'',transcript:'',audioAvailable:true,audioCompleted:true,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[]};
  attempt.materialBinding=P.freezeMaterialBinding(f.mat,{assessment:A,task:t,data:f.win.IELTSCurriculumData,courseDay:1,attemptId:attempt.id});await f.win.IELTSRecords.record(P.toRecord(attempt,f.mat,1,A));
  const next=fixture({...f.mat},{window:{IELTSRecords:f.win.IELTSRecords}});await open(next,skill);assert.deepEqual(next.nodes.get('courseQuestions').querySelectorAll('input').filter(n=>n.checked).map(n=>n.value).sort(),['blue','red']);assert.equal(next.nodes.get('courseQuestions').querySelectorAll('textarea')[0].value,'bag');assert.ok(next.nodes.get('courseQuestions').querySelectorAll('input').every(n=>n.disabled));assert.equal(JSON.parse(f.records()[0].answer).audioCompleted,true);
 }
});

test('writing reentry retains the exact original text, without a new draft or review request',async()=>{
 const text='My family lives near the park. We study English together.',f=fixture({skill:'writing',prompt:'Describe your family.',questions:[]});await open(f,'writing');await f.nodes.get('courseBegin').fire('click');const area=f.nodes.get('courseOutput').querySelectorAll('textarea')[0];area.value=text;await area.fire('input');f.advance(1000);await f.nodes.get('courseSubmit').fire('click');await settle();assert.equal(f.records().length,1);const original=JSON.stringify(f.records()[0]);await open(f,'writing');const saved=f.nodes.get('courseOutput').querySelectorAll('textarea')[0];assert.equal(saved.value,text);assert.equal(saved.disabled,true);assert.equal(f.records().length,1);assert.equal(JSON.stringify(f.records()[0]),original);assert.ok(f.nodes.get('courseResult').querySelector('.course-relearn'));
});

test('a more advanced draft for another reading never displaces this material unfinished relearning',async()=>{
 const second={id:'reading-two',skill:'reading',title:'Another reading',version:'1',week:1,level:'A0',pool:'training',source:{rights:'原创',verification:'reviewed'},questions:[{id:'q1',type:'single',prompt:'Choose red.',options:['red','blue'],answers:['red']}]};
 const f=fixture({}, {extraMaterials:[second],setup(data,mat,tasks){tasks.find(t=>t.id==='reading').materialIds=[mat.id,second.id];}});await open(f);await f.nodes.get('courseBegin').fire('click');await answer(f);await f.nodes.get('courseResult').querySelector('.course-relearn').fire('click');const saved=f.win.IELTSTodayNavigation.allDrafts().find(d=>d.materialId===f.mat.id);assert.ok(saved);
 await f.nodes.get('courseMaterials').children.find(n=>n.dataset.materialId===second.id).fire('click');await f.nodes.get('courseBegin').fire('click');const input=f.nodes.get('courseQuestions').querySelectorAll('input')[0];input.checked=true;await input.fire('change');await f.nodes.get('courseMaterials').children.find(n=>n.dataset.materialId===f.mat.id).fire('click');await f.nodes.get('courseResult').querySelector('.course-relearn').fire('click');
 const drafts=f.win.IELTSTodayNavigation.allDrafts().filter(d=>d.materialId===f.mat.id);assert.equal(drafts.length,1);assert.equal(drafts[0].id,saved.id);
});

test('material status does not repeatedly copy a thousand unrelated Records',()=>{
 let copied=0;class MeasuredMap extends Map{constructor(entries){if(entries){entries=[...entries];copied+=entries.length;}super(entries);}}
 const win={IELTSCoursePlayer:{objectiveSubmissionComplete:()=>true}},context={window:win,globalThis:win,Map:MeasuredMap,Set,console};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/today-hub.js'),'utf8'),context);
 const records=Array.from({length:1000},(_,i)=>({id:'old-'+i,taskId:'grammar',skill:'grammar',kind:'original',materialId:'unrelated-'+i,dayNumber:1,answer:'{}',submittedAt:'2026-10-24T00:00:00.000Z',evaluation:{result:'pass'}}));
 assert.equal(win.IELTSTodayHub.latestForMaterial({id:'grammar',materialIds:['required']},records,1,[]).size,0);assert.ok(copied<1000,'unrelated records must not trigger quadratic index rebuilding');
});

test('background history refresh does not activate a session; the explicit saved-answer button opens it',async()=>{
 const f=fixture();await open(f);await f.nodes.get('courseBegin').fire('click');await answer(f);const next=fixture({}, {storage:f.map,window:{IELTSRecords:f.win.IELTSRecords},search:'?day=1&material=reading-one'});await settle();await settle();assert.equal(next.win.IELTSTodayNavigation.current().active,false);assert.match(next.nodes.get('courseMaterialIntro').textContent,/查看已保存的原作答/);await next.nodes.get('courseBegin').fire('click');assert.equal(next.win.IELTSTodayNavigation.current().submitted,true);assert.equal(next.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value==='red').checked,true);assert.equal(f.records().length,1);
});

test('a fully submitted wrong answer is learned once but is not labelled completed before real correction',async()=>{
 const f=fixture();await open(f);await f.nodes.get('courseBegin').fire('click');await answer(f,'blue');const task=f.win.IELTSCurriculumData.days[0].tasks.find(t=>t.id==='reading'),options={data:f.win.IELTSCurriculumData,dayNumber:1,materials:[f.mat]},record=f.records()[0],before=JSON.stringify(record);
 assert.equal(Hub.taskState(task,f.records(),options).done,true);assert.equal(Hub.learningCount(task,f.records(),options),1);assert.equal(Hub.learningStatus(task,f.records(),options).done,false);assert.doesNotMatch(f.nodes.get('courseResult').textContent,/已完成 · 已学习/);
 const M=require('../assets/mistake-book.js'),now='2026-10-24T12:00:02.000Z';let book=M.capture(M.newState(),{dayNumber:1,source:record.source,materialId:record.materialId,recordId:record.id,recordVersion:record.version,skill:record.skill,questionId:'q1',title:record.title,question:f.mat.questions[0],originalAnswer:'blue',evaluation:record.evaluation,at:record.submittedAt},now).state;
 const helper=r=>M.recordCorrectionStatus(r,book);assert.equal(Hub.learningStatus(task,[record],{...options,recordCorrectionStatus:helper}).done,false);book=M.submitRound(book,1,{[book.items[0].id]:'red'},{id:'real-objective-redo',now}).state;assert.equal(M.recordCorrectionStatus(record,book).corrected,true);assert.equal(Hub.learningStatus(task,[record],{...options,recordCorrectionStatus:helper}).done,true);assert.equal(JSON.stringify(record),before);
});

test('an internal threshold pass with a remaining wrong answer is still awaiting correction',async()=>{
 const questions=Array.from({length:10},(_,i)=>({id:'q'+i,type:'single',prompt:'Choose red.',options:['red','blue'],answers:['red']})),f=fixture({questions});await open(f);const P=f.win.IELTSCoursePlayer,task=f.win.IELTSCurriculumData.days[0].tasks.find(t=>t.id==='reading'),at='2026-10-24T12:00:00.000Z',attempt={id:'threshold-pass',materialId:f.mat.id,taskId:'reading',courseDay:1,mode:'practice',kind:'original',startedAt:at,submittedAt:at,activeSeconds:0,exposureAtStart:'seen',answers:Object.fromEntries(questions.map((q,i)=>[q.id,i===9?'blue':'red'])),userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[]};
 attempt.materialBinding=P.freezeMaterialBinding(f.mat,{assessment:A,task,data:f.win.IELTSCurriculumData,courseDay:1,attemptId:attempt.id});await f.win.IELTSRecords.record(P.toRecord(attempt,f.mat,1,A));const r=f.records()[0];assert.equal(r.evaluation.result,'pass');assert.equal(Hub.learningStatus(task,[r],{data:f.win.IELTSCurriculumData,dayNumber:1,materials:[f.mat]}).done,false);assert.equal(r.evaluation.score,9);
});

test('submitted vocabulary rounds with failed pronunciation do not receive a completed badge',async()=>{
 const f=vocabularyModuleFixture({low:true});await open(f,'vocabulary');await f.nodes.get('courseBegin').fire('click');await f.submitVocabulary();await settle();const task=f.win.IELTSCurriculumData.days[0].tasks.find(t=>t.id==='vocabulary');assert.equal(Hub.learningStatus(task,f.records(),{data:f.win.IELTSCurriculumData,dayNumber:1,materials:[f.mat]}).done,false);assert.doesNotMatch(f.nodes.get('courseResult').textContent,/已完成 · 已学习/);
});

test('late input events cannot edit a submitted answer or the next independent draft',async()=>{
 const f=fixture();await open(f);await f.nodes.get('courseBegin').fire('click');const old=f.nodes.get('courseQuestions').querySelectorAll('input').find(n=>n.value==='red');await answer(f);const original=JSON.stringify(f.records()[0]);old.checked=false;await old.fire('change');assert.equal(JSON.stringify(f.records()[0]),original);
 await f.nodes.get('courseResult').querySelector('.course-relearn').fire('click');await old.fire('change');assert.equal(Object.keys(f.win.IELTSTodayNavigation.allDrafts()[0].answers).length,0);assert.equal(JSON.stringify(f.records()[0]),original);
});
