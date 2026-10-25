'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../assets/course-player.js'),V=require('../assets/vocabulary-practice.js'),Load=require('../assets/daily-learning-load.js');
const AT='2026-10-24T10:00:00.000Z',material={id:'vocab-progress',version:'1',skill:'vocabulary',type:'vocabulary',title:'Isolated vocabulary',level:'A0',pool:'training',estimatedMinutes:20,vocabulary:['student','teacher','desk','book','bag','pen','home','work'].map((word,index)=>({word,meaning:'词义'+index}))};
function draft(id,{advanced=false,startedAt=AT,version='1',profileId,materialId=material.id}={}){
 const value=V.createSession({material}).getDraft();value.startedAt=AT;value.materialVersion=version;value.materialId=materialId;
 if(advanced){value.phase='dictation';value.round=2;value.roundSubmittedAt=[AT,AT];for(const mode of ['completion','meaning'])value.answers[mode]=Object.fromEntries(material.vocabulary.map((w,i)=>[i,w.word]));value.answers.dictation=Object.fromEntries(material.vocabulary.slice(0,6).map((w,i)=>[i,w.word]));value.study.s=material.vocabulary.map(w=>[w.word,w.word,w.word]);value.study.w=material.vocabulary.map((_,i)=>[0,1,2].map(trial=>'work-progress-'+i+'-'+trial));}
 return{id,taskId:'vocabulary',materialId,courseDay:1,startedAt,text:JSON.stringify(value),answers:{},media:[],...(profileId?{profileId}:{})};
}
test('an older third-round vocabulary draft outranks four newer empty sessions without changing any original',()=>{
 const advanced=draft('course-advanced',{advanced:true}),empty=[1,2,3,4].map(n=>draft('course-empty-'+n,{startedAt:'2026-10-24T1'+n+':00:00.000Z'})),all=[...empty,advanced],before=JSON.stringify(all),chosen=P.preferredDraft(all,{courseDay:1,taskId:'vocabulary',material,records:[]});
 assert.equal(chosen.id,advanced.id);assert.match(P.draftProgress(chosen,material).label,/第 3 轮听写/);assert.match(P.draftProgress(chosen,material).label,/6\/8/);assert.equal(JSON.stringify(all),before);
});
test('equal progress chooses the newest compatible draft without merging conflicting originals',()=>{
 const a=draft('course-first',{advanced:true}),b=draft('course-second',{advanced:true,startedAt:'2026-10-24T11:00:00.000Z'}),value=JSON.parse(b.text);value.answers.dictation[0]='a different original';b.text=JSON.stringify(value);const before=JSON.stringify([a,b]);
 assert.equal(P.preferredDraft([a,b],{material}).id,b.id);assert.equal(JSON.stringify([a,b]),before);assert.notEqual(JSON.parse(a.text).answers.dictation[0],JSON.parse(b.text).answers.dictation[0]);
});
test('submitted, foreign profile, different material and incompatible material version cannot win draft selection',()=>{
 const valid=draft('course-valid'),submitted=draft('course-submitted',{advanced:true}),foreign=draft('course-foreign',{advanced:true,profileId:'p-another-profile'}),other=draft('course-other',{advanced:true,materialId:'other-material'}),old=draft('course-old-version',{advanced:true,version:'0'}),candidates=[submitted,foreign,other,old,valid],before=JSON.stringify(candidates);
 assert.equal(P.preferredDraft(candidates,{courseDay:1,taskId:'vocabulary',material,profileId:'legacy',records:[{id:submitted.id}]}).id,valid.id);assert.equal(P.draftProgress(old,material).compatible,false);assert.equal(JSON.stringify(candidates),before);
});
test('the daily learning queue resumes the same advanced draft even when empty duplicates occur first',()=>{
 const advanced=draft('course-advanced',{advanced:true}),empty=draft('course-new-empty',{startedAt:'2026-10-24T11:00:00.000Z'}),data={weeks:[{week:1,level:'A0'}],materials:[material],days:[{day:1,week:1,tasks:[{id:'vocabulary',minutes:20,materialIds:[material.id]}]}]},queue=Load.build({data,records:[],drafts:[empty,advanced],currentDay:1,today:'2026-10-24',now:Date.parse(AT),budget:{remainingMinutes:360,spentMinutes:0,exhausted:false},summaryForDay:()=>({remaining:0,completionValid:false}),vocabulary:V});
 assert.equal(queue.next.draftId,advanced.id);
});
