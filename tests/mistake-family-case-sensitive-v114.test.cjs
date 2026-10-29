'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../assets/curriculum-data.js'),A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js'),M=require('../assets/mistake-book.js');
const SUBMITTED='2026-10-24T12:00:00.000Z',CORRECTED='2026-10-24T12:01:00.000Z';

function syntheticRecord(unit,task,material,answers){
 const binding=P.freezeMaterialBinding(material,{assessment:A,attemptId:'mistake-fixture-'+unit.day+'-'+task.id,task,courseDay:unit.day});
 return{id:'mistake-fixture-'+unit.day+'-'+task.id,materialId:material.id,materialVersion:String(material.version),skill:task.id,taskId:task.id,source:'family-lesson-supplement-v95',dayNumber:unit.day,version:1,title:material.title,submittedAt:SUBMITTED,startedAt:'2026-10-24T11:59:00.000Z',media:[],evaluation:{method:'objective',result:'revise'},answer:JSON.stringify({schema:1,gradingPolicy:'canonical-v2',objectiveGrading:'canonical-v2',materialBinding:binding,materialVersion:String(material.version),answers})};
}
function realReading(day,id){
 const unit=D.familyLessonRelease.units.find(item=>item.day===day),task=unit.tasks.find(item=>item.id==='reading'),material=D.materials.find(item=>item.id===task.materialRefs[0].materialId),q=material.questions.find(item=>item.id===id);assert.ok(unit&&task&&material&&q);return{unit,task,material,q};
}
function store(){const values=new Map();return M.createStore({getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))},{now:()=>CORRECTED});}

test('every objective material in real v109 and v114 captures each wrong frozen question',()=>{
 let materials=0,questions=0,annotated=0;
 const releaseIds=new Set(['family-linked-days04-10-v109','family-linked-days11-20-v114']),units=D.familyLessonRelease.units.filter(unit=>releaseIds.has(unit.releaseId));
 assert.equal(units.length,17);assert.deepEqual([...new Set(units.map(unit=>unit.releaseId))],[...releaseIds]);
 for(const unit of units)for(const task of unit.tasks.filter(item=>['grammar','reading','listening'].includes(item.id)))for(const ref of task.materialRefs){
  const material=D.materials.find(item=>item.id===ref.materialId);assert.ok(material);const answers=Object.fromEntries(material.questions.map(q=>[q.id,'incorrect-synthetic-answer'])),record=syntheticRecord(unit,task,material,answers),original=record.answer,artifact=JSON.parse(record.answer);
  const inputs=M.captureInputs(record,{materials:[material]});assert.equal(inputs.length,material.questions.length,material.id);assert.equal(record.answer,original);assert.equal(A.materialContentHash(artifact.materialBinding.material),artifact.materialBinding.contentHash);
  for(const q of material.questions)if(Object.hasOwn(q,'caseSensitive')){assert.equal(q.caseSensitive,false);const input=inputs.find(item=>item.questionId===q.id);assert.ok(input);assert.equal(Object.hasOwn(input.question,'caseSensitive'),false);assert.equal(artifact.materialBinding.material.questions.find(item=>item.id===q.id).caseSensitive,false);annotated++;}
  materials++;questions+=inputs.length;
 }
 assert.equal(materials,51);assert.ok(questions>500);assert.equal(annotated,14);
});

for(const spec of [{day:5,id:'r04',flag:true},{day:11,id:'r02',flag:false}])test('real day '+spec.day+' short-answer original is captured and corrected case-insensitively',()=>{
 const {unit,task,material,q}=realReading(spec.day,spec.id);assert.equal(q.type,'short');assert.equal(Object.hasOwn(q,'caseSensitive'),spec.flag);if(spec.flag)assert.equal(q.caseSensitive,false);
 const answers=Object.fromEntries(material.questions.map(item=>[item.id,item.type==='multi'?item.answers.slice():item.answers[0]]));answers[q.id]='incorrect-synthetic-answer';const record=syntheticRecord(unit,task,material,answers),original=record.answer,binding=JSON.parse(original).materialBinding;
 const S=store(),captured=S.captureRecord(record,{materials:[material]});assert.equal(captured.captured,1);const before=S.summary(spec.day),item=before.items[0];assert.equal(item.questionId,q.id);assert.equal(item.originalAnswer,'incorrect-synthetic-answer');assert.equal(Object.hasOwn(item.question,'caseSensitive'),false);assert.equal(S.recordCorrectionStatus(record).corrected,false);
 const correct=q.answers[0].toUpperCase();assert.equal(A.gradeQuestion(q,correct).correct,true);assert.equal(M.gradeObjective(item.question,correct).status,'passed');S.submitRound(spec.day,{[item.id]:correct},{token:before.token,id:'round-real-'+spec.day});
 const after=S.summary(spec.day);assert.equal(after.remaining,0);assert.equal(after.items[0].status,'passed');assert.equal(S.recordCorrectionStatus(record).corrected,true);assert.equal(record.answer,original);assert.equal(A.materialContentHash(binding.material),binding.contentHash);assert.equal(after.items[0].originalAnswer,'incorrect-synthetic-answer');assert.equal(S.captureRecord(record,{materials:[material]}).captured,0);
});

test('an old unannotated mistake accepts a later false-annotated original without rewriting the original snapshot',()=>{
 const {unit,task,material,q}=realReading(5,'r04'),answers=Object.fromEntries(material.questions.map(item=>[item.id,item.answers[0]]));answers[q.id]='incorrect-synthetic-answer';const record=syntheticRecord(unit,task,material,answers),input=M.captureInputs(record,{materials:[material]})[0];
 const old=M.capture(M.newState(),{...input,recordId:'old-original'},SUBMITTED).state,oldBytes=JSON.stringify(old),questionBytes=JSON.stringify(old.items[0].question),updated=M.capture(old,input,CORRECTED).state;
 assert.equal(JSON.stringify(old),oldBytes);assert.equal(JSON.stringify(updated.items[0].question),questionBytes);assert.equal(updated.items[0].occurrences.length,2);assert.equal(updated.items[0].occurrences[0].recordId,'old-original');assert.equal(updated.items[0].occurrences[0].answer,'incorrect-synthetic-answer');
});

test('unsupported true or nonboolean case sensitivity and unknown fields fail closed',()=>{
 const record={id:'bad-flag',materialId:'bad-flag-material',skill:'reading',source:'course-player',dayNumber:1,version:1,title:'Fixture',submittedAt:SUBMITTED,answer:'wrong',evaluation:{method:'objective',result:'revise'}};
 const base={id:'q1',type:'short',prompt:'Fixture question',answers:['answer']};
 assert.equal(A.gradeQuestion({...base,caseSensitive:true},'ANSWER').correct,true,'the current canonical grader ignores even true');
 assert.equal(M.captureInputs(record,{question:{...base,caseSensitive:false}}).length,1);
 assert.throws(()=>M.captureInputs(record,{question:{...base,caseSensitive:true}}),/不支持区分大小写/);
 for(const value of ['false',0,null,undefined])assert.throws(()=>M.captureInputs(record,{question:{...base,caseSensitive:value}}),/布尔值/);
 assert.throws(()=>M.captureInputs(record,{question:{...base,unrecognizedFlag:false}}),/含不支持的字段/);
});
