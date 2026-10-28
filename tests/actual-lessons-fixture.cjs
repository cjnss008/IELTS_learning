'use strict';
// All reviews, speech evidence and answers below are synthetic engineering fixtures.
// They demonstrate software reachability; they are not learner, service, or Band evidence.
const crypto=require('node:crypto'),D=require('./published-public-baseline-fixture.cjs')(require('../assets/curriculum-data.js')),P=require('../assets/course-player.js'),A=require('../assets/assessment-core.js'),V=require('../assets/vocabulary-practice.js'),O=require('../assets/oral-practice.js'),M=require('../assets/mistake-book.js');
require('../assets/daily-plan-state.js');
const START=Date.parse('2025-01-01T12:00:00.000Z'),DAY=86400000,map=new Map(D.materials.map(m=>[m.id,m])),clone=v=>JSON.parse(JSON.stringify(v));
function original(day,task,m,at,unseen=true){
 const id='stage-fixture-'+day+'-'+m.id,full=m.fullTest===true,duration=m.skill==='speaking'?(full?700:60):60;
 const attempt={id,materialId:m.id,taskId:task.id,courseDay:day,mode:task.mode||'practice',kind:'original',parentId:null,startedAt:new Date(at-duration*1000).toISOString(),submittedAt:new Date(at).toISOString(),activeSeconds:duration,activityByDate:{[new Date(at).toISOString().slice(0,10)]:duration},exposureAtStart:unseen?'unseen':'seen',answers:{},userEvidence:{},text:'',transcript:'',audioAvailable:m.skill==='listening',audioCompleted:m.skill==='listening',transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[]};
 if(['reading','listening','grammar'].includes(task.id))attempt.answers=Object.fromEntries(m.questions.map(q=>[q.id,q.type==='multi'?q.answers.slice():q.answers[0]]));
 if(['speaking','writing'].includes(task.id)){
  const text=Array.from({length:Math.ceil(Math.max(m.minWords||12,60)/15)},()=> 'I describe this example with clear reasons and explain what the available information can show.').join(' ');attempt[task.id==='speaking'?'transcript':'text']=text;
  if(task.id==='speaking'){
   attempt.media=[{id:'work-free-'+id,name:'Synthetic engineering speech fixture',mime:'audio/wav',durationSeconds:duration}];
   const reference=P.modelReadingReference(m,D,day);attempt.modelReading=P.modelReadingSnapshot({segments:O.splitReference(reference,65).map((text,i)=>({reference:text,workId:'work-model-'+id+'-'+i,evidenceId:'model-'+id+'-'+i,status:'complete',professional:{result:{text,accuracy:90,fluency:90,completeness:95}},coach:{feedbackFormat:'oral-coach-v1',evidenceId:'model-'+id+'-'+i}}))},m.id,day);
  }
 }
 let r={...P.toRecord(attempt,m,day,A),version:1};
 if(task.id==='vocabulary'){
  const s=V.createSession({material:m,courseDay:day});for(const[w,word]of s.words.entries()){for(let i=0;i<3;i++)s.recordSpelling(w,word.word);for(let i=0;i<3;i++){const hash=crypto.createHash('sha256').update(id+':'+w+':'+i).digest('hex');s.recordSpeaking(w,{workId:'work-'+hash.slice(0,40),reference:word.word,hash,evidenceId:hash,provider:'Alibaba oral assessment',verified:true,nonSilent:true,durationSeconds:1,recordedAt:new Date(at).toISOString(),result:{accuracy:90,fluency:90,completeness:95}});}}
  s.begin();for(let i=0;i<3;i++){s.words.forEach((w,index)=>{s.setAnswer(index,w.word);if(i===2)s.markPlayed(index,{kind:'local-audio',started:true,completed:true,completedAt:new Date(at).toISOString()});});s.submitRound();s.next();}
  const p=s.getSubmission();r={...r,source:'vocabulary-practice',evaluation:p.evaluation,answer:JSON.stringify({...JSON.parse(r.answer),...JSON.parse(p.answer),schema:1,trainingSchema:2})};
 }
 if(['writing','speaking'].includes(task.id)){
  const artifact=JSON.parse(r.answer),text=artifact.text||artifact.transcript,review={status:'complete',requiresRetest:false,rounds:[1,2].map(round=>({ok:true,round,task:full?'full_test':m.type==='foundation'?'foundation':m.skill==='speaking'?'part2':m.type,levelCheck:{meetsGoal:true,evidence:[{quote:text.slice(0,10),comment:'Synthetic stage evidence'}]},criteria:(m.skill==='speaking'?['fluency','lexical','grammar','pronunciation']:['task','coherence','lexical','grammar']).map(d=>({id:d,band:7.5,evidence:[{quote:text.slice(0,10),comment:'Synthetic evidence'}],audioEvidence:[{id:d+'-fixture',dimension:d,quote:'synthetic acoustic evidence',startSeconds:0,endSeconds:1}]}))}))};
  if(m.skill==='speaking'){
   review.pronunciationSource={provider:'ali',recordId:r.id,evidenceId:'free-'+id,reference:text,completeCoverage:true,mediaIds:r.media.map(m=>m.id),durationSeconds:duration,result:{accuracy:90,fluency:90,completeness:95}};
   review.audioAnalysisEvidence=true;review.audioSource={recordId:r.id,task:full?'full_test':'part2',completeCoverage:true,mediaIds:r.media.map(m=>m.id),durationSeconds:duration,segments:[{startSeconds:0,endSeconds:duration,audible:true,fluencyIds:['fluency-fixture'],pronunciationIds:['pronunciation-fixture']}]};
  }
  r.evaluation={method:'ai',result:'pass',feedback:JSON.stringify(review)};
 }
 return r;
}
function ledgerFor(records){
 const byDay=new Map();for(const r of records){if(!byDay.has(r.dayNumber))byDay.set(r.dayNumber,[]);byDay.get(r.dayNumber).push(r);}const ledger=M.newState();
 for(const [day,own]of byDay){let raw=null;const store=M.createStore({getItem:()=>raw,setItem:(_,v)=>{raw=v;}},{now:()=>new Date(Math.max(...own.map(r=>Date.parse(r.submittedAt)))+1000).toISOString()});for(const r of own)store.captureRecord(r,{material:map.get(r.materialId),materials:D.materials});const summary=store.summary(day);if(summary.remaining)throw Error('Synthetic correct-answer fixture unexpectedly produced mistakes on day '+day+': '+summary.remaining);store.completeRecap(day,{token:summary.token,recap:{ok:true,status:'complete',text:'Synthetic recap for regression only.'}});const s=store.read();ledger.days[day]=s.days[day];ledger.items.push(...s.items);}
 return ledger;
}
function makeFixture(){
 const records=[],seen=new Set(),byDay=new Map();let calendarOffset=0;
 for(const day of D.days.filter(d=>d.day<=364)){
  const own=[],at=START+calendarOffset*DAY;for(const task of day.tasks.filter(t=>t.id!=='reflection'))for(const id of task.materialIds){const r=original(day.day,task,map.get(id),at,!seen.has(id));seen.add(id);records.push(r);own.push(r);}byDay.set(day.day,own);
  const retests=day.day%7===0?D.materials.filter(m=>m.pool==='gate'&&m.form==='B'&&m.week===day.week):[];
  for(const m of retests){const r=original(day.day,{id:m.skill,mode:'assessment'},m,at+2*DAY+800000,true);records.push(r);own.push(r);}
  if(retests.length)calendarOffset+=2;calendarOffset++;
 }
 const ledger=ledgerFor(records);
 function through(week){const own=records.filter(r=>map.get(r.materialId).pool==='gate'&&map.get(r.materialId).form==='B'?map.get(r.materialId).week<=week:r.dayNumber<=week*7),last=Math.max(...own.map(r=>Date.parse(r.submittedAt))),state=clone(ledger);for(const key of Object.keys(state.days))if(+key>week*7)delete state.days[key];return{records:own,mistakeState:state,now:last+2000,currentWeek:week,drafts:[]};}
 return{records,ledger,through,calendarSpanDays:calendarOffset};
}
module.exports={D,P,A,V,M,START,DAY,map,clone,original,ledgerFor,makeFixture};
