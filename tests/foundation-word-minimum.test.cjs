'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Review=require('../server/review.cjs'),Guide=require('../server/review-rubric.cjs'),D=require('../assets/curriculum-data.js'),Player=require('../assets/course-player.js');
const text='My name is Mei. I am a student. I am happy. You are my teacher.';
test('real lessons 2–10 foundation speaking requests never inherit the full-speaking 40-word benchmark',()=>{
 const materials=new Map(D.materials.map(m=>[m.id,m]));let checked=0;
 for(const day of D.days.filter(d=>d.day>=2&&d.day<=10))for(const id of day.tasks.find(t=>t.id==='speaking').materialIds){const material=materials.get(id),request=Player.reviewRequest(material,{transcript:text}),input=Review.input(request);assert.equal(input.task,'foundation');assert.equal(material.minWords,id==='day02-expansion-speaking'?35:12);assert.equal(input.minWords,undefined);for(const round of [1,2]){const payload=JSON.parse(Review.messages(input,round)[1].content);assert.equal(payload.responseFacts.minimumWords,null);assert.equal(payload.responseFacts.wordCount,Guide.facts(input).wordCount);assert.equal(payload.stageGoal.targetLevel,material.level);assert.equal(payload.question,request.prompt);}checked++;}
 assert.equal(checked,10);
});
test('foundation and generic metadata have no invented uniform minimum while advanced constraints remain unchanged',()=>{
 for(const mode of ['writing','speaking_text','speaking_audio'])for(const task of ['foundation','generic'])assert.equal(Guide.facts({mode,task,text}).minimumWords,null);
 for(const task of ['part1','part2','part3','full_test',''])for(const mode of ['speaking_text','speaking_audio'])assert.equal(Guide.facts({mode,task,text}).minimumWords,40);
 assert.equal(Guide.facts({mode:'writing',task:'academic_task1',text}).minimumWords,150);assert.equal(Guide.facts({mode:'writing',task:'academic_task2',text}).minimumWords,250);
});
test('two genuine foundation stage judgments still produce no Band and short advanced text stays ineligible',()=>{
 for(const task of ['foundation','part2']){const input=Review.input({mode:'speaking_text',task,level:'A0',prompt:'Answer the simple questions in your own words.',text}),raw={criteria:Review.SPEAKING.map(id=>({id,band:9,evidence:[{quote:'I am a student.',comment:'真实原句'}],comment:'测试维度'})),corrections:[],summary:'测试',levelCheck:{meetsGoal:true,evidence:[{quote:'I am a student.',comment:'对应身份信息'}],gaps:[]}},rounds=[1,2].map(round=>Review.parse(JSON.stringify(raw),input,'',round));assert.ok(rounds.every(r=>r.criteria.every(c=>c.band===null)));if(task==='foundation'){assert.ok(rounds.every(r=>r.responseFacts.minimumWords===null));assert.equal(Review.combine(rounds,'fixture').requiresRetest,false);}else assert.ok(rounds.every(r=>r.responseFacts.minimumWords===40));}
});

