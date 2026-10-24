'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),adaptive=require('../assets/adaptive-plan.js'),server=require('../server/adaptation.cjs'),profiles=require('../assets/profile-store.js');
const NOW=Date.parse('2026-10-24T15:00:00.000Z'),SKILLS=[...adaptive.SKILLS,'reflection'];
function memory(){const map=new Map();return{map,get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
function curriculum(){
 const source={verification:'reviewed',kind:'original'},minutes=[45,30,75,60,60,75,15];
 const materials=SKILLS.map(skill=>({id:'core-'+skill,version:'1',skill,week:1,level:'A0',pool:'training',estimatedMinutes:15,source,questions:['reading','grammar','listening'].includes(skill)?[{id:'q1',type:'short',answers:['red']}]:[],...(skill==='vocabulary'?{vocabulary:[{word:'hello'}]}:{})}));
 for(const [id,skill,extra]of[['extra-reading','reading',{}],['second-reading','reading',{}],['extra-listening','listening',{}],['extra-vocabulary','vocabulary',{}],['extra-writing','writing',{}],['future-reading','reading',{week:2}],['higher-reading','reading',{level:'A2'}],['gate-reading','reading',{pool:'gate'}],['final-reading','reading',{pool:'final'}],['held-training','reading',{fullTest:true}],['unreviewed-reading','reading',{source:{verification:'pending'}}]])materials.push({id,version:'1',skill,week:1,level:'A0',pool:'training',estimatedMinutes:20,source,...extra});
 const days=Array.from({length:20},(_,i)=>({day:i+1,week:Math.ceil((i+1)/7),tasks:SKILLS.map((id,j)=>({id,skill:id,minutes:minutes[j],mode:'practice',materialIds:['core-'+id],instructions:'原核心练习'})),totalMinutes:360}));days[4].tasks.find(t=>t.id==='reading').mode='assessment';days[4].tasks.find(t=>t.id==='reading').materialIds=['gate-reading'];days[5].tasks.find(t=>t.id==='reading').materialIds=['final-reading'];
 return{days,materials,weeks:[{week:1,level:'A0'},{week:2,level:'A1'},{week:3,level:'A1'}]};
}
function proposal(skill='reading',ids=['extra-reading']){return{prioritySkills:[skill],reason:'本次原始作答显示需要更多同级练习。',strategies:[{skill,action:'先独立回答，再定位证据；错题订正后换题检验。'}],reinforcementMaterialIds:ids};}
function record(skill='reading',extra={}){return{id:'record-'+skill,materialId:'core-'+skill,materialVersion:'1',skill,dayNumber:1,kind:'original',minutes:10,activeSeconds:600,submittedAt:new Date(NOW).toISOString(),startedAt:new Date(NOW-600000).toISOString(),assistance:{hint:false,answer:false,ai:false},media:[],evaluation:{method:'objective',result:'pass'},answer:JSON.stringify({schema:1,mode:'practice',interrupted:false,answers:{q1:'red'},text:'I live in a small city.',transcript:'I live in a small city.',audioAvailable:true,audioCompleted:true,transcriptViewed:false}),...extra};}

test('server adaptation validates skill counts, source week, held-out protection, concrete strategies and score promises',()=>{
 const data=curriculum();assert.deepEqual(server.normalize(proposal(),data,1),proposal());
 for(const bad of [{...proposal(),prioritySkills:['reading','writing','speaking']},{...proposal(),strategies:[]},{...proposal(),reason:'保证考到雅思7分。'},...['future-reading','gate-reading','final-reading','held-training','invented','unreviewed-reading','extra-writing'].map(id=>proposal('reading',[id]))])assert.throws(()=>server.normalize(bad,data,1),{code:'INVALID_ADAPTATION'});
 const protectedText=server.normalize({...proposal(),reason:'fake-secret <策略>'},data,1,'fake-secret');assert.equal(protectedText.reason,'[已隐藏] ＜策略＞');
 assert.equal(server.normalize({...proposal(),reason:'不保证雅思成绩，仍需新题核对。'},data,1).reason,'不保证雅思成绩，仍需新题核对。');
 assert.equal(adaptive.promiseOfScore('确保每个词完成三写三读后再进入测试。'),false);assert.equal(adaptive.promiseOfScore('你将达到雅思7分。'),true);assert.equal(adaptive.promiseOfScore('You will achieve IELTS band 7.'),true);assert.equal(adaptive.promiseOfScore('训练目标为四项7.0，实际结果须验证。'),false);
});

test('all subsequent unstarted regular days retain all core materials, total 360 and transparent suggested transfers',()=>{
 const data=curriculum(),before=JSON.stringify(data),store=adaptive.createStore({data,storage:memory(),now:()=>NOW});
 const result=store.apply(1,proposal(),{recapToken:'recap-one'});assert.deepEqual(result.targetDays,[2,3,4,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
 for(const n of result.targetDays){const base=data.days[n-1],day=store.getDay(base);assert.equal(day.totalMinutes,360);assert.equal(day.tasks.find(t=>t.id==='reading').minutes,120);assert.equal(day.adaptation.transferredMinutes,60);assert.equal(day.adaptation.minutesAreSuggestions,true);for(const task of day.tasks){assert.ok(task.minutes>=15);assert.ok(task.coreMaterialIds.every(id=>task.materialIds.includes(id)));const change=base.tasks.find(t=>t.id===task.id).minutes-task.minutes;if(change>0)assert.ok(change<=30);}assert.equal(day.tasks.find(t=>t.id==='reading').materialIds.includes('extra-reading'),day.week<=2,'source reinforcement is not repeated throughout the whole year');}
 assert.equal(JSON.stringify(data),before);assert.deepEqual(store.getDay(data.days[4]),data.days[4]);
});

test('two priorities share up to 90 suggested minutes and no time is added to the day budget',()=>{
 const data=curriculum(),store=adaptive.createStore({data,storage:memory(),now:()=>NOW}),p={prioritySkills:['reading','speaking'],reason:'阅读与表达需要补强。',strategies:[{skill:'reading',action:'先定位原句再回答。'},{skill:'speaking',action:'先录原音，再按证据重练。'}],reinforcementMaterialIds:[]};
 store.apply(1,p,{recapToken:'two'});const day=store.getDay(data.days[1]);assert.equal(day.tasks.find(t=>t.id==='reading').minutes,105);assert.equal(day.tasks.find(t=>t.id==='speaking').minutes,105);assert.equal(day.tasks.reduce((s,t)=>s+t.minutes,0),360);
});

test('new recaps supersede only unstarted future plans, while started days and duplicate recaps stay stable',()=>{
 const data=curriculum(),storage=memory();let time=NOW;const store=adaptive.createStore({data,storage,now:()=>time});
 const original=store.apply(1,proposal(),{recapToken:'first'});store.markStarted(2);const frozen=store.getDay(data.days[1]);time+=1000;
 const next=store.apply(2,proposal('writing',['extra-writing']),{recapToken:'second',startedDays:[3]});
 assert.deepEqual(store.getDay(data.days[1]),frozen);assert.equal(store.getDay(data.days[2]).adaptation.planId,original.plan.id);assert.equal(next.targetDays.includes(3),false);assert.equal(store.getDay(data.days[3]).adaptation.planId,next.plan.id);
 const state=store.read(),duplicate=store.apply(1,proposal(),{recapToken:'first'});assert.equal(duplicate.duplicate,true);assert.equal(store.read().activePlanId,state.activePlanId);
});

test('legacy submitted records freeze their real course days even without drafts or existing adaptive state',()=>{
 const data=curriculum(),store=adaptive.createStore({data,storage:memory(),now:()=>NOW}),legacy=[
  record('reading',{dayNumber:2,evaluation:{method:'objective',result:'pending'}}),
  {courseDay:3,answer:'malformed legacy answer'},
  {answer:JSON.stringify({schema:1,courseDay:4})},
  {answer:{courseDay:8}},
  {dayNumber:0,courseDay:365,answer:'{"courseDay":"9"}'},null
 ];
 const next=store.apply(1,proposal(),{recapToken:'legacy-safe',records:legacy});
 assert.deepEqual(next.targetDays,[7,9,10,11,12,13,14,15,16,17,18,19,20]);
 assert.deepEqual(store.read().startedDays,[2,3,4,8,365]);
 for(const n of [2,3,4,8])assert.deepEqual(store.getDay(data.days[n-1]),data.days[n-1]);
 const before=store.getDay(data.days[6]);
 store.apply(1,proposal('writing',['extra-writing']),{recapToken:'new-recap',records:[...legacy,{dayNumber:7}]});
 assert.deepEqual(store.getDay(data.days[6]),before,'a record also freezes an existing overlay');
 assert.equal(store.read().assignments['2'],undefined,'a legacy started baseline must remain unadapted');
});

test('strict parse and merge preserve plan history and refuse conflicting changes to an already-started day',()=>{
 const data=curriculum(),a=adaptive.createStore({data,storage:memory(),now:()=>NOW}),b=adaptive.createStore({data,storage:memory(),now:()=>NOW+1000});
 a.apply(1,proposal(),{recapToken:'a'});b.apply(1,proposal('writing',['extra-writing']),{recapToken:'b'});
 const merged=adaptive.mergeStates(a.read(),b.read());assert.equal(merged.history.length,2);assert.equal(merged.activePlanId,b.read().activePlanId);
 a.markStarted(2);b.markStarted(2);assert.throws(()=>adaptive.mergeStates(a.read(),b.read()),/已开始/);
 const baseline=adaptive.createStore({data,storage:memory(),now:()=>NOW});baseline.markStarted(3);const preserved=adaptive.mergeStates(a.read(),baseline.read());assert.equal(preserved.assignments['3'],undefined,'a started unadapted day must not receive an incoming future overlay');
 assert.throws(()=>adaptive.parseState({...adaptive.newState(),abilityPassed:true}));
 const bad=a.read();bad.assignments['2']='missing';assert.throws(()=>adaptive.parseState(bad));
});

test('profile and preview stores isolate adaptations and a captured old profile cannot apply a late recap',()=>{
 const raw=memory(),prod=profiles.createManager(raw),preview=profiles.createManager(raw,{preview:true}),data=curriculum();
 const a=adaptive.createStore({data,storage:prod.storage(),getProfile:()=>prod.current().id}),b=adaptive.createStore({data,storage:preview.storage(),getProfile:()=>preview.current().id});a.apply(1,proposal(),{recapToken:'prod'});assert.equal(b.read().history.length,0);b.apply(1,proposal('writing',['extra-writing']),{recapToken:'preview'});assert.equal(a.read().history[0].recapToken,'prod');
 const p=prod.create('另一个档案');prod.activate(p.id);assert.throws(()=>a.apply(1,proposal(),{recapToken:'late'}),/档案已改变/);assert.equal(raw.getItem(prod.scopeKey(adaptive.KEY)),null);
});

test('a ten-minute independent accurate reading can add same-level unseen work without waiting for its suggested block',()=>{
 const data=curriculum(),r=record(),result=adaptive.planRemaining(1,[r],proposal(),{data,now:NOW});
 assert.equal(result.remainingBudget,350);assert.deepEqual(result.verifiedSkills,['reading']);assert.ok(result.tasks.some(t=>t.kind==='new-practice'));
 assert.ok(result.tasks.every(t=>t.skill==='reading'&&!['future-reading','higher-reading','gate-reading','final-reading','held-training'].includes(t.materialId)));assert.ok(result.estimatedMinutes<=result.remainingBudget);
});

test('speed and a self-reported pass cannot unlock new materials without independent correct evidence',()=>{
 const data=curriculum(),bad=record('reading',{activeSeconds:30,minutes:0.5,answer:JSON.stringify({schema:1,mode:'practice',answers:{q1:'blue'}})}),result=adaptive.planRemaining(1,[bad],proposal(),{data,now:NOW});
 assert.deepEqual(result.verifiedSkills,[]);assert.equal(result.tasks[0].kind,'verification');assert.equal(result.tasks[0].materialId,'core-reading');assert.ok(result.tasks[0].estimatedMinutes<=10);
 const helped=adaptive.planRemaining(1,[record('reading',{assistance:{hint:true}})],proposal(),{data,now:NOW});assert.equal(helped.tasks.some(t=>t.kind==='new-practice'),false);
});

test('a newer failure prevents an earlier pass from unlocking new work, and incomplete listening stays a short check',()=>{
 const data=curriculum(),old=record('reading',{submittedAt:new Date(NOW-1000).toISOString()}),latest=record('reading',{id:'new-failure',answer:JSON.stringify({schema:1,answers:{q1:'wrong'}})});
 assert.equal(adaptive.planRemaining(1,[old,latest],proposal(),{data,now:NOW}).tasks.some(t=>t.kind==='new-practice'),false);
 for(const field of ['audioAvailable','audioCompleted']){const artifact=JSON.parse(record('listening').answer);artifact[field]=false;const result=adaptive.planRemaining(1,[record('listening',{answer:JSON.stringify(artifact)})],proposal('listening',['extra-listening']),{data,now:NOW});assert.equal(result.tasks.some(t=>t.kind==='new-practice'),false);}
 const valid=adaptive.planRemaining(1,[record('listening')],proposal('listening',['extra-listening']),{data,now:NOW});assert.ok(valid.tasks.some(t=>t.materialId==='extra-listening'));
});

test('vocabulary readiness uses the shared v2 three-writing and three-speaking verifier, never old pass flags',()=>{
 const data=curriculum(),vocab=require('../assets/vocabulary-practice.js'),raw={schema:2,trainingVersion:2,trainingComplete:true,kind:'vocabulary-three-modes',words:[{word:'hello'}],learning:[{word:'hello',spellings:['hello','hello','hello'],speaking:[1,2,3].map(n=>({workId:'work-original-'+n,hash:String(n).repeat(64),evidenceId:'professional-'+n,provider:'Alibaba oral assessment',recordedAt:new Date(NOW).toISOString(),durationSeconds:1,result:{accuracy:80,fluency:75,completeness:90}}))}],rounds:vocab.MODES.map(mode=>({mode,attempts:[{mode,word:'hello',expectedAnswer:'hello',userAnswer:'HELLO',correct:true,...(mode==='dictation'?{audio:{kind:'local-audio',started:true,completed:true,completedAt:new Date(NOW).toISOString()}}:{})}]}))};
 const make=()=>record('vocabulary',{answer:JSON.stringify(raw)});
 assert.equal(adaptive.verifiedRecord(make(),data.materials[0],NOW),true);raw.rounds[0].attempts[0].userAnswer='wrong';assert.equal(adaptive.verifiedRecord(make(),data.materials[0],NOW),false);raw.rounds[0].attempts[0].userAnswer='hello';raw.learning[0].speaking[0].result.accuracy=10;raw.learning[0].speaking[0].passed=true;assert.equal(adaptive.verifiedRecord(make(),data.materials[0],NOW),false);
 assert.equal(adaptive.verifiedRecord(record('vocabulary',{answer:JSON.stringify({schema:1,kind:'vocabulary-three-modes',pass:true})}),data.materials[0],NOW),false);
});

test('writing needs two real grounded AI reviews; speaking also needs full original-audio coverage',()=>{
 const data=curriculum(),review={status:'complete',rounds:[1,2].map(round=>({ok:true,round,levelCheck:{meetsGoal:true,evidence:[{quote:'I live in a small city.'}]}}))};
 const writing=record('writing',{evaluation:{method:'ai',result:'pass',feedback:JSON.stringify(review)}});assert.equal(adaptive.verifiedRecord(writing,data.materials.find(m=>m.skill==='writing'),NOW),true);
 review.rounds[1].levelCheck.evidence[0].quote='not in original';writing.evaluation.feedback=JSON.stringify(review);assert.equal(adaptive.verifiedRecord(writing,data.materials.find(m=>m.skill==='writing'),NOW),false);review.rounds[1].levelCheck.evidence[0].quote='I live in a small city.';
 const speaking=record('speaking',{media:[{id:'original-audio'}],evaluation:{method:'ai',result:'pass',feedback:JSON.stringify({...review,audioAnalysisEvidence:true,audioSource:{recordId:'record-speaking',completeCoverage:true,mediaIds:['original-audio'],durationSeconds:10,segments:[{startSeconds:0,endSeconds:10,audible:true}]}})}});
 assert.equal(adaptive.verifiedRecord(speaking,data.materials.find(m=>m.skill==='speaking'),NOW),true);const invalid=JSON.parse(speaking.evaluation.feedback);invalid.audioSource.segments[0].startSeconds=5;speaking.evaluation.feedback=JSON.stringify(invalid);assert.equal(adaptive.verifiedRecord(speaking,data.materials.find(m=>m.skill==='speaking'),NOW),false);
});

test('budget caps, explicit old-material reinforcement and in-progress retention protect the daily time and exposure rules',()=>{
 const data=curriculum(),r=record(),prior=record('reading',{id:'earlier',dayNumber:0,materialId:'extra-reading'});
 const baseline=adaptive.planRemaining(1,[r,prior],null,{data,now:NOW});assert.equal(baseline.tasks.some(t=>t.materialId==='extra-reading'),false);
 const reinforced=adaptive.planRemaining(1,[r,prior],proposal(),{data,now:NOW});assert.equal(reinforced.tasks.find(t=>t.materialId==='extra-reading').kind,'reinforcement');assert.equal(reinforced.tasks.find(t=>t.materialId==='extra-reading').unseen,false);
 const retained=adaptive.planRemaining(1,[r],proposal(),{data,now:NOW,startedMaterialIds:['extra-reading']});assert.equal(retained.retained[0].materialId,'extra-reading');assert.equal(retained.tasks.some(t=>t.materialId==='extra-reading'),false);
 const spent=adaptive.planRemaining(1,[record('reading',{activeSeconds:21600,minutes:360})],proposal(),{data,now:NOW});assert.equal(spent.remainingBudget,0);assert.deepEqual(spent.tasks,[]);
 const assessmentDay=adaptive.planRemaining(5,[],null,{data,now:NOW});assert.deepEqual(assessmentDay.tasks,[]);
});

test('foundation Ali evidence must match the same spoken original and all three professional thresholds',()=>{
 const data=curriculum(),m=data.materials.find(m=>m.skill==='speaking');m.rubric={taskType:'foundation'};
 const review={status:'complete',rounds:[1,2].map(round=>({ok:true,round,levelCheck:{meetsGoal:true,evidence:[{quote:'I live in a small city.'}]}})),pronunciationSource:{provider:'ali',recordId:'record-speaking',evidenceId:'current-professional',reference:'I live in a small city.',durationSeconds:10,mediaIds:['original-audio'],completeCoverage:true,result:{accuracy:80,fluency:75,completeness:90}}};
 const make=()=>record('speaking',{media:[{id:'original-audio'}],evaluation:{method:'ai',result:'pass',feedback:JSON.stringify(review)}});
 assert.equal(adaptive.verifiedRecord(make(),m,NOW),true);review.pronunciationSource.reference='a different original';assert.equal(adaptive.verifiedRecord(make(),m,NOW),false);review.pronunciationSource.reference='I live in a small city.';review.pronunciationSource.result.completeness=null;assert.equal(adaptive.verifiedRecord(make(),m,NOW),false);
});

test('unresolved core mistakes block new content for that material and applying an overlay twice is idempotent',()=>{
 const data=curriculum(),store=adaptive.createStore({data,storage:memory(),now:()=>NOW});store.apply(1,proposal(),{recapToken:'x'});const day=store.getDay(data.days[1]);assert.deepEqual(store.getDay(day),day);
 const result=adaptive.planRemaining(1,[record()],null,{data,now:NOW,mistakes:[{materialId:'core-reading',status:'pending'}]});assert.equal(result.tasks.some(t=>t.kind==='new-practice'),false);
 const later=record('reading',{dayNumber:2}),additional=adaptive.planRemaining(day,[later],null,{data,now:NOW});assert.equal(additional.tasks.some(t=>t.materialId==='extra-reading'),false,'an already assigned reinforcement cannot also be recommended as an extra task');
});

test('actual curriculum transitions and final weeks keep the budget and reserved assessments intact',()=>{
 const data=require('../assets/curriculum-data.js'),p={prioritySkills:['reading','listening'],reason:'用真实作答安排同级输入练习。',strategies:[{skill:'reading',action:'每题独立定位原文依据。'},{skill:'listening',action:'先完整听音，再闭卷回答。'}],reinforcementMaterialIds:[]};
 for(const source of [1,26,54,82,140,258,335,360]){
  const store=adaptive.createStore({data,storage:memory(),now:()=>NOW}),plan=store.apply(source,p,{recapToken:'actual-'+source});
  assert.ok(plan.targetDays.length<=365&&plan.targetDays.every(n=>n<365));for(const number of plan.targetDays){const base=data.days.find(d=>d.day===number),adjusted=store.getDay(base);assert.equal(adjusted.totalMinutes,360);assert.equal(adaptive.regularDay(base,data),true);assert.equal(adjusted.tasks.reduce((n,t)=>n+t.minutes,0),360);assert.ok(adjusted.tasks.every(t=>t.minutes>=15));}
 }
});
