'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../assets/mistake-book.js'),A=require('../assets/assessment-core.js'),Profiles=require('../assets/profile-store.js');
const NOW='2026-10-24T12:00:00.000Z',clone=v=>JSON.parse(JSON.stringify(v));
function input(overrides={}){return{dayNumber:1,source:'course-player',materialId:'read-1',recordId:'record-1',recordVersion:1,skill:'reading',questionId:'q1',title:'A short reading',question:{id:'q1',type:'short',prompt:'Who is Li?',answers:['A student','student'],explanation:'The passage says student.'},originalAnswer:'teacher',evaluation:{method:'objective',result:'revise',score:0,maxScore:1},at:NOW,...overrides};}
function stateWith(...inputs){let state=M.newState();for(const value of inputs.length?inputs:[input()])state=M.capture(state,value,NOW).state;return state;}
function memory(){const values=new Map();return{get length(){return values.size;},getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k),key:n=>[...values.keys()][n]??null,values};}
function passAll(state,id='round-1'){return M.submitRound(state,1,Object.fromEntries(M.summary(state,1).remainingItems.map(i=>[i.id,i.question.answers[0]])),{id,now:NOW});}
function review(text,goal=true){return{ok:true,status:'complete',requiresRetest:false,rounds:[1,2].map(round=>({ok:true,round,summary:'保留原文并按目标检查。',criteria:[],levelCheck:{meetsGoal:goal,evidence:[{quote:text,comment:'原稿证据'}]}}))};}
function writing(overrides={}){return input({skill:'writing',materialId:'write-1',questionId:'output',question:{id:'output',type:'subjective',prompt:'Introduce yourself.',answers:[],task:'foundation',level:'A0'},originalAnswer:'I student.',evaluation:{method:'none',result:'pending'},status:'pending',...overrides});}

test('partial aggregate passes capture every answered wrong question while leaving omitted work incomplete',()=>{
 const material={id:'read-1',skill:'reading',questions:[{id:'q1',type:'single',prompt:'Who?',options:['student','teacher'],answers:['student']},{id:'q2',type:'fill',prompt:'Where?',answers:['home'],answer:'home'},{id:'q3',type:'short',prompt:'When?',answers:['Monday']}]};
 const record={id:'record-1',dayNumber:1,source:'course-player',materialId:'read-1',skill:'reading',title:'Reading',version:1,answer:JSON.stringify({schema:1,answers:{q1:'student',q2:'school'}}),evaluation:{method:'objective',result:'pass',score:1,maxScore:3},submittedAt:NOW};
 const captured=M.captureInputs(record,{materials:[material]});assert.deepEqual(captured.map(i=>i.questionId),['q2']);assert.equal(captured[0].originalAnswer,'school');assert.equal(captured[0].question.type,'short');
});
test('selection exercises convert numeric option indexes before exact answer checks',()=>{
 const record={id:'sel-1',dayNumber:1,source:'selection-ai-practice',materialId:'selection-1',skill:'grammar',title:'Selected words',version:1,answer:JSON.stringify({schema:1,questions:[{id:'q1',prompt:'Choose.',options:['am','is','are'],answers:[2]}],answers:{q1:1}}),evaluation:{method:'objective',result:'revise'},submittedAt:NOW};
 const [item]=M.captureInputs(record);assert.deepEqual(item.question.answers,['are']);assert.equal(item.originalAnswer,'is');
});
test('capturing the same source attempt is idempotent and new wrong attempts preserve the first answer',()=>{
 const first=M.capture(M.newState(),input(),NOW),same=M.capture(first.state,input(),NOW);assert.equal(same.duplicate,true);assert.equal(same.item.occurrences.length,1);
 const again=M.capture(same.state,input({recordId:'record-2',originalAnswer:'doctor'}),NOW);assert.equal(again.state.items.length,1);assert.equal(again.item.originalAnswer,'teacher');assert.deepEqual(again.item.occurrences.map(o=>o.answer),['teacher','doctor']);assert.equal(again.item.recordId,'record-1');
});
test('different days, sources and questions remain independently traceable',()=>{
 const state=stateWith(input(),input({dayNumber:2}),input({source:'foundation'}),input({questionId:'q2',question:{id:'q2',type:'short',prompt:'Another?',answers:['yes']}}));assert.equal(state.items.length,4);assert.equal(M.summary(state,1).remaining,3);assert.equal(M.summary(state,2).remaining,1);
});
test('the whole page must be answered and validation never mutates the prior state',()=>{
 const state=stateWith(input(),input({questionId:'q2',question:{id:'q2',type:'short',prompt:'Where?',answers:['home']}})),before=clone(state),ids=state.items.map(i=>i.id);
 assert.throws(()=>M.submitRound(state,1,{[ids[0]]:'student'}),/每一道/);assert.throws(()=>M.submitRound(state,1,{[ids[0]]:'student',[ids[1]]:''}),/每一道/);assert.deepEqual(state,before);assert.equal(M.summary(state,1).rounds,0);
});
test('each whole-page submission removes passed items and only unresolved items enter the next round',()=>{
 let state=stateWith(input(),input({questionId:'q2',question:{id:'q2',type:'short',prompt:'Where?',answers:['home']}})),[first,second]=state.items;
 const round1=M.submitRound(state,1,{[first.id]:'student',[second.id]:'school'},{id:'round-1',now:NOW});state=round1.state;assert.equal(round1.summary.passed,1);assert.deepEqual(round1.summary.remainingItems.map(i=>i.id),[second.id]);
 assert.throws(()=>M.submitRound(state,1,{[first.id]:'student',[second.id]:'home'}),/整页/);
 const round2=M.submitRound(state,1,{[second.id]:'home'},{id:'round-2',now:NOW});assert.equal(round2.summary.allCorrect,true);assert.equal(round2.summary.passed,2);assert.equal(round2.summary.rounds,2);assert.equal(round2.state.days[1].rounds[1].results.length,1);assert.equal(round2.state.items[0].originalAnswer,'teacher');assert.throws(()=>passAll(round2.state,'round-3'),/全部通过/);
});
test('round ids deduplicate a retry without double credit and reject changed answers',()=>{
 const state=stateWith(),answers={[state.items[0].id]:'student'},first=M.submitRound(state,1,answers,{id:'round-1',now:NOW}),again=M.submitRound(first.state,1,answers,{id:'round-1',now:NOW});assert.equal(again.duplicate,true);assert.equal(again.summary.rounds,1);assert.equal(again.summary.passed,1);assert.throws(()=>M.submitRound(first.state,1,{[state.items[0].id]:'teacher'},{id:'round-1',now:NOW}),/不同答案/);
});
test('multi-select requires exactly all accepted choices and text limits remain strict',()=>{
 const q={id:'q1',type:'multi',prompt:'Select both.',answers:['A','C'],options:['A','B','C']};assert.equal(M.gradeObjective(q,['A']).status,'wrong');assert.equal(M.gradeObjective(q,['A','C','B']).status,'wrong');assert.equal(M.gradeObjective(q,['A','A','C']).status,'wrong');assert.equal(M.gradeObjective(q,['C','A']).status,'passed');assert.equal(M.gradeObjective({id:'q2',type:'short',prompt:'One word.',answers:['a student'],maxWords:1},'a student').status,'wrong');
});
test('dictation ignores punctuation and case while preserving every word and spelling',()=>{
 const q={id:'d1',type:'dictation',prompt:'Listen and write.',answers:['This is my book.']};assert.equal(M.gradeObjective(q,'THIS is my book!').status,'passed');assert.equal(M.gradeObjective(q,'This is book.').status,'wrong');assert.equal(M.gradeObjective(q,'This is my books.').status,'wrong');
});
test('choice questions preserve capitalization and dictation normalizes thousands separators',()=>{
 const q={id:'case',type:'single',prompt:'哪一句大小写正确？',options:['I am Ben.','i am Ben.','I am ben.'],answers:['I am Ben.']};assert.equal(M.gradeObjective(q,'I am Ben.').status,'passed');assert.equal(M.gradeObjective(q,'i am Ben.').status,'wrong');assert.equal(M.gradeObjective(q,'I am ben.').status,'wrong');assert.equal(M.gradeObjective({id:'num',type:'dictation',prompt:'Listen.',answers:['It is 5,000 kilometres.']},'It is 5000 kilometres').status,'passed');
});
test('saved drafts and complete raw attempts survive export and reopening',()=>{
 const storage=memory(),store=M.createStore(storage,{now:()=>NOW});store.capture(input());const id=store.summary(1).items[0].id;store.saveDraft(1,id,{answer:'my draft',media:[]});const reopened=M.createStore(storage,{now:()=>NOW});assert.equal(reopened.summary(1).drafts[id].answer,'my draft');assert.deepEqual(M.parseState(JSON.stringify(store.exportState())),store.exportState());assert.equal(reopened.summary(1).items[0].originalAnswer,'teacher');
});
test('reading an answer or revisiting a captured original cannot resolve its error',()=>{
 const state=stateWith();assert.equal(M.summary(state,1).remaining,1);const same=M.capture(state,input(),NOW);assert.equal(M.summary(same.state,1).remaining,1);const tampered=clone(state);tampered.items[0].status='passed';assert.throws(()=>M.parseState(tampered),/未经提交/);
});
test('a later error invalidates a finished recap and requires a new round',()=>{
 let state=passAll(stateWith()).state,s=M.summary(state,1);state=M.completeRecap(state,1,{token:s.token,recap:{ok:true,status:'complete',recap:'Review today.'}},NOW);assert.equal(M.summary(state,1).completionValid,true);
 state=M.capture(state,input({recordId:'record-2',originalAnswer:'teacher again'}),NOW).state;s=M.summary(state,1);assert.equal(s.completionValid,false);assert.equal(s.remaining,1);assert.equal(s.items[0].occurrences.length,2);assert.throws(()=>M.completeRecap(state,1,{token:s.token,recap:{ok:true,status:'complete'}}),/仍有错题/);
});
test('stale whole-page and AI recap tokens cannot finish after new errors appear',()=>{
 const first=stateWith(),old=M.summary(first,1),changed=M.capture(first,input({recordId:'record-2'}),NOW).state;assert.throws(()=>M.submitRound(changed,1,{[first.items[0].id]:'student'},{token:old.token}),/已改变/);
 const passed=passAll(changed).state;assert.throws(()=>M.completeRecap(passed,1,{token:old.token,recap:{ok:true,status:'complete'}}),/已更新/);assert.throws(()=>M.completeRecap(passed,1,{token:M.summary(passed,1).token,recap:{ok:true,status:'pending'}}),/尚未/);
});
test('new correct daily work invalidates a prior AI recap even when there are no new mistakes',()=>{
 const store=M.createStore(memory(),{now:()=>NOW}),r={id:'correct-1',dayNumber:1,materialId:'plain-1',source:'foundation',skill:'grammar',version:1,title:'A question',answer:'am',evaluation:{method:'objective',result:'pass',score:1,maxScore:1},submittedAt:NOW};store.captureRecord(r);let s=store.summary(1);store.completeRecap(1,{token:s.token,recap:{ok:true,status:'complete',recap:'Done'}});assert.equal(store.summary(1).completionValid,true);store.captureRecord({...r,id:'correct-2'});assert.equal(store.summary(1).allCorrect,true);assert.equal(store.summary(1).completionValid,false);assert.notEqual(store.summary(1).token,s.token);
});
test('service failures and a bare pass boolean leave subjective submissions pending',()=>{
 const state=stateWith(writing()),id=state.items[0].id;for(const proof of [undefined,{pass:true,status:'complete'},{status:'pending',feedback:'service failed'}]){const result=M.submitRound(state,1,{[id]:'I am a student.'},{subjective:{[id]:proof},now:NOW});assert.equal(result.summary.pending,1);assert.equal(result.summary.allCorrect,false);assert.equal(result.state.days[1].rounds[0].results[0].answer,'I am a student.');}
});
test('subjective corrections need two real rounds with grounded evidence and the actual stage goal',()=>{
 const state=stateWith(writing()),item=state.items[0],text='I am a student.';assert.equal(M.subjectiveGrade(item,text,{review:review(text)}).status,'passed');assert.equal(M.subjectiveGrade(item,text,{review:review(text,false)}).status,'wrong');assert.equal(M.subjectiveGrade(item,text,{review:review('Not in this answer.')}).status,'pending');const one=review(text);one.rounds.pop();assert.equal(M.subjectiveGrade(item,text,{review:one}).status,'pending');
});
test('subjective minimum length cannot be bypassed by favourable AI feedback',()=>{
 const item=stateWith(writing({question:{id:'output',type:'subjective',prompt:'Write three words.',answers:[],minWords:3}})).items[0];assert.equal(M.subjectiveGrade(item,'Hi',{review:review('Hi')}).status,'wrong');
});
test('academic full test output checks all four dimensions in both rounds',()=>{
 const item=stateWith(writing({question:{id:'output',type:'subjective',prompt:'Academic essay.',answers:[],fullTest:true,material:{id:'write-1',skill:'writing',fullTest:true}}})).items[0],text='I think cities need more green space.';
 const result=review(text);for(const round of result.rounds)round.criteria=['task','coherence','lexical','grammar'].map(id=>({id,band:7,evidence:[{quote:text,comment:'Evidence'}]}));assert.equal(M.subjectiveGrade(item,text,{review:result}).status,'passed');result.rounds[1].criteria[0].band=6.5;assert.equal(M.subjectiveGrade(item,text,{review:result}).status,'wrong');
});
test('speaking text alone cannot pass as new audio evidence',()=>{
 const item=stateWith(writing({skill:'speaking'})).items[0],text='I am a student.';assert.equal(M.subjectiveGrade(item,text,{review:review(text)}).status,'pending');
});
test('foundation speaking accepts only matched new Ali evidence plus two grounded stage checks',()=>{
 const old={id:'old-voice',name:'Original voice',mime:'audio/webm',durationSeconds:25},fresh={id:'new-voice',name:'Corrected voice',mime:'audio/webm',durationSeconds:35},item=stateWith(writing({skill:'speaking',materialId:'speak-stage',media:[old],question:{id:'output',type:'subjective',prompt:'Introduce yourself.',answers:[],task:'foundation',level:'A0',minWords:4}})).items[0],text='I am Ben and I am a student.';
 const record={id:'new-speaking-record',materialId:'speak-stage',skill:'speaking',answer:JSON.stringify({schema:1,transcript:text}),media:[fresh]},evaluated=review(text);evaluated.audioAnalysisEvidence=false;evaluated.pronunciationSource={provider:'ali',recordId:record.id,evidenceId:'ali-proof',mediaIds:[fresh.id],durationSeconds:35,reference:text,completeCoverage:true,result:{accuracy:80,fluency:75,completeness:90}};const proof={review:evaluated,record},grade=M.subjectiveGrade(item,text,proof);assert.equal(grade.status,'passed');assert.match(grade.feedback,/不代表完整自由口语 Band/);
 const state=stateWith(writing({skill:'speaking',materialId:'speak-stage',media:[old],question:item.question})),result=M.submitRound(state,1,{[state.items[0].id]:text},{id:'ali-round',now:NOW,subjective:{[state.items[0].id]:proof}});assert.equal(result.summary.allCorrect,true);assert.deepEqual(result.round.results[0].media,[fresh]);assert.equal(M.parseState(JSON.stringify(result.state)).items[0].status,'passed');
 const changed=fn=>{const p=clone(proof);fn(p);return M.subjectiveGrade(item,text,p).status;};assert.equal(changed(p=>{p.review.pronunciationSource.result.accuracy=79;}),'wrong');assert.equal(changed(p=>{delete p.review.pronunciationSource.result.completeness;}),'pending');assert.equal(changed(p=>{p.review.pronunciationSource.mediaIds=['unrelated'];}),'pending');assert.equal(changed(p=>{p.review.pronunciationSource.recordId='wrong-record';}),'pending');assert.equal(changed(p=>{p.review.pronunciationSource.reference='Other words.';}),'pending');assert.equal(changed(p=>{p.review.pronunciationSource.completeCoverage=false;}),'pending');assert.equal(changed(p=>{p.review.pronunciationSource.durationSeconds=181;}),'pending');assert.equal(changed(p=>{p.review.pronunciationSource.provider='self';}),'pending');assert.equal(changed(p=>{p.record.media=[old];p.review.pronunciationSource.mediaIds=[old.id];}),'pending');assert.equal(changed(p=>{p.review.rounds[1].levelCheck.meetsGoal=false;}),'wrong');assert.equal(changed(p=>{p.review.rounds[1].levelCheck.meetsGoal=null;}),'pending');
 assert.equal(M.subjectiveGrade({...item,question:{...item.question,fullTest:true}},text,proof).status,'pending');assert.equal(M.subjectiveGrade({...item,question:{...item.question,task:'part2'}},text,proof).status,'pending');
});
test('professional oral evidence requires a new recording, matching reference and all three training thresholds',()=>{
 const context={provider:'ali',verified:true,workId:'oral-old',evidenceId:'e-old',dayNumber:1,materialId:'speak-1',reference:'This is my book.',thresholds:{accuracy:80,fluency:75,completeness:90},result:{text:'This is my book.',accuracy:70,fluency:76,completeness:90}},[i]=M.oralInputs([],context),item=stateWith(i).items[0];
 assert.equal(M.oralGrade(item,context).status,'pending');const proof={...context,workId:'oral-new',evidenceId:'e-new',result:{accuracy:80,fluency:75,completeness:90}};assert.equal(M.oralGrade(item,proof).status,'passed');assert.equal(M.oralGrade(item,{...proof,result:{accuracy:80,fluency:74,completeness:90}}).status,'wrong');assert.equal(M.oralGrade(item,{...proof,result:{accuracy:90,fluency:90}}).status,'pending');assert.equal(M.oralGrade(item,{...proof,reference:'A different sentence.'}).status,'pending');assert.equal(M.oralGrade(item,{...proof,verified:false}).status,'pending');
});
test('returning from a new oral assessment preserves errors until the entire page is submitted',()=>{
 const store=M.createStore(memory(),{now:()=>NOW}),context={provider:'ali',verified:true,workId:'oral-old',evidenceId:'e-old',dayNumber:1,materialId:'speak-1',reference:'This is my book.',result:{accuracy:70,fluency:76,completeness:90}};store.captureOral([],context);const id=store.summary(1).items[0].id,token=store.summary(1).token;store.attachOralEvidence({...context,workId:'oral-new',evidenceId:'e-new',result:{accuracy:85,fluency:80,completeness:95}});let s=store.summary(1);assert.equal(s.remaining,1);assert.notEqual(s.token,token);s=store.submitRound(1,{[id]:'New recording'},{subjective:{[id]:s.items[0].oralEvidence}}).summary;assert.equal(s.allCorrect,true);
});
test('vocabulary mistakes retain unique attempts and exact expected spelling',()=>{
 const store=M.createStore(memory(),{now:()=>NOW}),event={attemptId:'vocab-1',courseDay:1,materialId:'vocab-day1',word:'student',meaning:'学生',mode:'completion',prompt:'s_u_e_t',userAnswer:'studant',expectedAnswer:'student',correct:false,submittedAt:NOW};store.captureVocabulary(event);store.captureVocabulary(event);store.captureVocabulary({...event,attemptId:'vocab-2',userAnswer:'studnt'});const s=store.summary(1);assert.equal(s.total,1);assert.equal(s.items[0].occurrences.length,2);assert.equal(s.items[0].originalAnswer,'studant');assert.equal(M.gradeObjective(s.items[0].question,'student').status,'passed');
});
test('vocabulary correction preserves accents, punctuation and internal phrase spacing used in the original tests',()=>{
 const base={attemptId:'vocab-1',courseDay:1,materialId:'vocab-day1',word:'get up',meaning:'起床',mode:'dictation',prompt:'听音写出完整英文',userAnswer:'get  up',expectedAnswer:'get up',correct:false,submittedAt:NOW},q=M.vocabularyInput(base).question;assert.equal(q.type,'spelling');assert.equal(M.gradeObjective(q,'get  up').status,'wrong');assert.equal(M.gradeObjective(q,' GET UP ').status,'passed');const accented=M.vocabularyInput({...base,word:'café',expectedAnswer:'café'}).question;assert.equal(M.gradeObjective(accented,'cafè').status,'wrong');assert.equal(M.gradeObjective(accented,'café').status,'passed');
});
test('a records-only vocabulary restore retains low or unverified study recordings without guessing missing scores',()=>{
 const record={id:'vocab-parent',dayNumber:1,materialId:'vocab-unit',skill:'vocabulary',source:'vocabulary-practice',title:'Vocabulary',submittedAt:NOW,version:1,evaluation:{method:'objective',result:'pass',score:3,maxScore:3,threshold:1},answer:JSON.stringify({schema:1,trainingSchema:2,kind:'vocabulary-three-modes',rounds:[],learning:[{word:'student',speaking:[{workId:'work-old-voice1',evidenceId:'old-evidence1',recordedAt:NOW,passed:false},{workId:'work-old-voice2',evidenceId:'old-evidence2',recordedAt:NOW,passed:false,result:{accuracy:70,fluency:80,completeness:95}}]}]})};const store=M.createStore(memory(),{now:()=>NOW});store.captureRecord(record);store.captureRecord(record);let s=store.summary(1);assert.equal(s.total,2);assert.equal(s.pending,2);assert.equal(s.items.every(i=>i.source==='vocabulary-speaking'),true);assert.equal(s.items[0].occurrences[0].recordId,'work-old-voice1');store.captureOral([],{source:'vocabulary-speaking',dayNumber:1,materialId:'vocab-unit',workId:'work-old-voice2',reference:'student',questionId:'vocab-word-0-trial-2',evidenceId:'old-evidence2',result:{accuracy:70,fluency:80,completeness:95}});assert.equal(store.summary(1).total,2);
});
test('profile views and preview storage never write mistakes into another profile or formal records',()=>{
 const raw=memory(),manager=Profiles.createManager(raw,{preview:true,idFactory:()=> 'p-testprofile01'}),legacy=manager.storage(),a=M.createStore(legacy,{now:()=>NOW});a.capture(input());const p=manager.create('Other');manager.activate(p.id);const b=M.createStore(manager.storage(),{now:()=>NOW});assert.equal(b.summary(1).total,0);assert.throws(()=>a.capture(input({recordId:'new-after-switch'})),/档案已/);assert.equal(raw.getItem(M.KEY),null);assert.ok(raw.getItem('ielts52-preview:'+M.KEY));
});
test('backup merge preserves later passed rounds and refuses branched histories',()=>{
 const before=stateWith(),after=passAll(before).state;assert.equal(M.summary(M.mergeStates(before,after),1).allCorrect,true);assert.equal(M.summary(M.mergeStates(after,before),1).allCorrect,true);const wrong=M.submitRound(before,1,{[before.items[0].id]:'doctor'},{id:'different-round',now:NOW}).state;assert.throws(()=>M.mergeStates(after,wrong),/分叉/);
});
test('backup merge preserves a new failure and rejects altered original content or answer keys',()=>{
 const before=stateWith(),passed=passAll(before).state,reopened=M.capture(passed,input({recordId:'record-2',originalAnswer:'doctor'}),NOW).state;assert.equal(M.summary(M.mergeStates(passed,reopened),1).remaining,1);const invalid=clone(before);invalid.items[0].originalAnswer='changed';assert.throws(()=>M.parseState(invalid),/不能被订正覆盖/);const changed=clone(before);changed.items[0].question.answers=['teacher'];assert.throws(()=>M.mergeStates(before,changed),/冲突/);
});
test('malformed restored state cannot invent passing status or unsafe fields',()=>{
 assert.throws(()=>M.parseState({...M.newState(),surprise:true}),/不支持/);const state=stateWith(),bad=clone(state);bad.items.push(clone(bad.items[0]));assert.throws(()=>M.parseState(bad),/无效/);const getter={schemaVersion:1,items:[],get days(){throw Error('accessed');}};assert.throws(()=>M.parseState(getter),/不支持/);
});
test('backup validation rejects fabricated passed rounds and an empty AI completion',()=>{
 const first=stateWith(),correct=passAll(first).state,forged=clone(correct);forged.days[1].rounds[0].results[0].answer='teacher';assert.throws(()=>M.parseState(forged),/通过标记/);assert.throws(()=>M.completeRecap(correct,1,{token:M.summary(correct,1).token,recap:{ok:true,status:'complete'}}),/尚未/);const noWork=M.newState();assert.throws(()=>M.completeRecap(noWork,1,{token:M.summary(noWork,1).token,recap:{ok:true,status:'complete',recap:'Invented review'}}),/没有真实/);
});
