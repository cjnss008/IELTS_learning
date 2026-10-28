'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Coach=require('../server/daily-coach.cjs'),Adaptation=require('../server/adaptation.cjs');
const SKILLS=['vocabulary','grammar','listening','reading','speaking','writing'];
function material(id,extra={}){return{id,title:id,skill:'reading',week:10,level:'A1',pool:'training',estimatedMinutes:15,source:{verification:'reviewed'},...extra};}
function data(materials,week=10){return{days:[{day:1,week,tasks:[{materialIds:materials.map(m=>m.id)}]}],materials};}
function request(){return{dayNumber:1,summary:{total:0,passed:0,rounds:0},records:[{id:'record-daily-original',skill:'reading',answer:'red',evaluation:{result:'pass'}}],mistakes:[]};}
function proposal(candidate){return{prioritySkills:[candidate.skill],reason:'根据真实原稿在同级材料中继续练习。',strategies:[{skill:candidate.skill,action:'先独立完成，再核对原文证据。'}],reinforcementMaterialIds:[candidate.id]};}

test('recap candidates match normalization eligibility and exclude future, held-out, malformed or unreviewed sources',()=>{
 const safe=SKILLS.map((skill,i)=>material('safe-'+skill,{skill,week:8+i%3})),unsafe=[material('future',{week:11}),material('too-old',{week:7}),material('gate',{pool:'gate'}),material('final',{pool:'final'}),material('full-training',{fullTest:true}),material('group-training',{assessmentGroup:'held-A'}),material('form-training',{form:'B'}),material('unreviewed',{source:{verification:'pending'}}),material('missing-source',{source:undefined}),material('reflection',{skill:'reflection'}),material('review',{skill:'review'}),material('fractional-week',{week:9.5}),material('string-week',{week:'10'})],curriculum=data([...safe,...unsafe]),before=JSON.stringify(curriculum),input=Coach.recap(request(),curriculum);
 assert.deepEqual(input.reinforcementCandidates.map(c=>c.id),safe.map(m=>m.id));assert.equal(JSON.stringify(curriculum),before);
 for(const candidate of input.reinforcementCandidates){assert.deepEqual(Adaptation.normalize(proposal(candidate),curriculum,1),proposal(candidate));assert.deepEqual(Object.keys(candidate).sort(),['id','level','skill','title']);}
});

test('candidate cap is applied after eligibility checks so protected tail materials cannot displace valid options',()=>{
 const safe=Array.from({length:60},(_,i)=>material('eligible-'+i)),unsafe=Array.from({length:60},(_,i)=>material('held-'+i,{fullTest:true})),curriculum=data([...safe,...unsafe]),input=Coach.recap(request(),curriculum);
 assert.equal(input.reinforcementCandidates.length,48);assert.deepEqual(input.reinforcementCandidates.map(c=>c.id),safe.slice(-48).map(m=>m.id));
});

test('actual curriculum candidate sets are accepted by normalization across early, gate and final weeks',()=>{
 const curriculum=require('../assets/curriculum-data.js');
 for(const dayNumber of [1,28,84,140,252,280,336,364]){
  const input=Coach.recap({...request(),dayNumber},curriculum),day=curriculum.days.find(d=>d.day===dayNumber);assert.ok(input.reinforcementCandidates.length<=48);
  for(const candidate of input.reinforcementCandidates){const source=curriculum.materials.find(m=>m.id===candidate.id);assert.ok(source.week>=Math.max(1,day.week-2)&&source.week<=day.week);assert.doesNotThrow(()=>Adaptation.normalize(proposal(candidate),curriculum,dayNumber));}
 }
});

test('recap prompt requires a fixed curriculum and feedback only',()=>{
 const input=Coach.recap(request(),data([material('read-10')])),prompt=Coach.messages('recap',input)[0].content;
 assert.match(prompt,/课程采用固定安排/);assert.match(prompt,/禁止修改后续课程、难度、题目、时间分配/);assert.match(prompt,/不返回 adaptation/);assert.match(prompt,/不能减少、跳过、隐藏/);assert.match(prompt,/不改变课程、复习或测评安排/);assert.deepEqual(JSON.parse(Coach.messages('recap',input)[1].content),input);
 assert.equal(Coach.messages('glossary',{word:'hello'})[0].content.includes('prioritySkills'),false);
});
