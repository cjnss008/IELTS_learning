'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const Expansion=require('../tools/course-expansion69.cjs'),Shared=require('../assets/course-expansion.js'),A=require('../assets/assessment-core.js'),data=require('../assets/curriculum-data.js');
const originalDay1='81212d967b8ea40ce345c69ebc802086793e0cf347558cb25c201ee462a8b80d';
const loaded=Expansion.load({requireAudio:false}),all={...data,materials:[...new Map([...data.materials,...loaded.materials].map(material=>[material.id,material])).values()]};
const words=text=>(String(text).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
test('the lesson-2 expansion teaches new forms in five original compatible materials with supported answers',()=>{
 assert.equal(loaded.materials.length,6);
 for(const material of loaded.materials){assert.equal(material.availableFromDay,2);assert.equal(material.source.verification,'reviewed');for(const question of material.questions||[]){const grade=A.gradeQuestion(question,question.answers[0]);assert.equal(grade.correct,true,material.id+'/'+question.id);for(const wrong of (question.options||[]).filter(option=>!question.answers.includes(option)))assert.equal(A.gradeQuestion(question,wrong).correct,false,material.id+'/'+question.id+'/'+wrong);}}
 const grammar=loaded.materials.find(material=>material.skill==='grammar');assert.ok(grammar.questions.length>=8);assert.ok(grammar.learningScope.new.some(value=>value.includes('not')));assert.match(grammar.passage,/Are they teachers\?/);assert.match(grammar.passage,/aren't/);
 for(const skill of ['reading','listening']){const material=loaded.materials.find(value=>value.skill===skill),text=material.passage||material.transcript;assert.ok(words(text)>=100&&words(text)<=140);assert.equal(material.questions.length,8);for(const question of material.questions){assert.ok(text.includes(question.evidence));if(question.type==='fill')assert.equal(question.maxWords,1);}}
});
test('new listening questions are English and dialogue requires distinct speakers and paragraph gaps',()=>{
 const material=loaded.materials.find(value=>value.skill==='listening');for(const question of [...material.questions,...material.grammar.questions])assert.equal(/[\u3400-\u9fff]/.test(question.prompt+JSON.stringify(question.options||[])),false);assert.equal(material.audioRequirements.speakers.length,3);assert.equal(material.audioRequirements.speakLabels,false);assert.ok(material.audioRequirements.paragraphGapMs>material.audioRequirements.turnGapMs);assert.equal(material.transcript.split(/\n\s*\n/).length,3);assert.match(material.transcript,/No, I am not\. I am in Room Four\./);assert.match(material.transcript,/No\. The class is at seven\./);
});
test('first lesson schedule stays byte-identical and a frozen second lesson is extended without changing its original ids or minutes',()=>{
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(data.days[0])).digest('hex'),originalDay1);
 assert.equal(Shared.overlay(data.days[0],all),data.days[0]);
 const base=JSON.parse(JSON.stringify(data.days[1]));for(const task of base.tasks){task.materialIds=task.materialIds.filter(id=>!Object.values(Shared.IDS).includes(id));delete task.contentExpansion;task.instructions='saved instruction '+task.id;task.coreMaterialIds=task.materialIds.slice();}delete base.contentExpansion;
 const before=JSON.stringify(base),next=Shared.overlay(base,all);assert.equal(JSON.stringify(base),before);assert.equal(next.totalMinutes,360);
 for(const task of base.tasks){const actual=next.tasks.find(value=>value.id===task.id);assert.equal(actual.minutes,task.minutes);assert.deepEqual(actual.materialIds.slice(0,task.materialIds.length),task.materialIds);if(Shared.IDS[task.id]){assert.equal(actual.materialIds.at(-1),Shared.IDS[task.id]);assert.ok(actual.coreMaterialIds.includes(Shared.IDS[task.id]));}}
 assert.deepEqual(Shared.overlay(next,all),next);
});
test('fresh lesson-2 references share 360 minutes and later grammar keeps first material practice separate from one review pack',()=>{
 const source=JSON.parse(JSON.stringify(data.days.slice(0,8)));for(const day of source){delete day.contentExpansion;for(const task of day.tasks){delete task.contentExpansion;if(task.id==='grammar')task.materialIds=[1,2,3].map(index=>'grammar-'+day.week+'-'+((day.day+index-2)%6+1));}}
 const fakeGrammar=Array.from({length:6},(_,index)=>({id:'grammar-1-'+(index+1),skill:'grammar',questions:[{id:'q1'}]})),input={materials:[...all.materials,...fakeGrammar]};
 const output=Expansion.applySchedule(source,input);assert.equal(JSON.stringify(output[0]),JSON.stringify(source[0]));assert.equal(output[1].totalMinutes,360);assert.deepEqual(Object.fromEntries(output[1].tasks.map(task=>[task.id,task.minutes])),Shared.RECOMMENDED_MINUTES);
 const seen=new Set(output.slice(0,2).flatMap(day=>day.tasks.filter(task=>task.id==='grammar').flatMap(task=>task.materialIds)));
 for(const day of output.slice(2)){const task=day.tasks.find(task=>task.id==='grammar'),plan=task.grammarLearningPlan;assert.ok(plan.reviewMaterialIds.length<=1);assert.ok(plan.newMaterialIds.every(id=>!seen.has(id)));assert.ok(plan.reviewMaterialIds.every(id=>seen.has(id)));if(!plan.newMaterialIds.length)assert.match(task.instructions,/本日为已学语法巩固/);task.materialIds.forEach(id=>seen.add(id));assert.equal(day.totalMinutes,360);}
});
test('browser and build use one append-only overlay and new speech/writing require independent output',()=>{
 const web={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/course-expansion.js'),'utf8'),web);assert.equal(typeof web.IELTSCourseExpansion.overlay,'function');assert.equal(web.IELTSCourseExpansion.overlay({day:1,tasks:[]},all).day,1);
 const speaking=loaded.materials.find(value=>value.skill==='speaking'),writing=loaded.materials.find(value=>value.skill==='writing');assert.ok(words(speaking.reference)>=40);assert.doesNotMatch(speaking.reference,/^[A-D][.:：]\s/m);assert.match(speaking.reference,/We are not/);assert.match(speaking.reference,/They are/);assert.equal(writing.minWords,40);assert.match(writing.prompt,/6–8 complete sentences and at least 40 words/);assert.match(writing.prompt,/Do not copy/);
});
