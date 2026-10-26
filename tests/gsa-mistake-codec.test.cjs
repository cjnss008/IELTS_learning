'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const A=require('../assets/assessment-core.js'),P=require('../assets/course-player.js'),M=require('../assets/mistake-book.js'),Gsa=require('../tools/build-gsa-graded-course.cjs');
const root=path.resolve(__dirname,'..'),materials=Gsa.load({root,releasePath:'curriculum/gsa-graded-course/release.json'}).materials,NOW='2026-10-27T00:00:00.000Z',copy=value=>JSON.parse(JSON.stringify(value));
function wrongRecord(material){const binding=P.freezeMaterialBinding(material,{assessment:A}),answers=Object.fromEntries(binding.material.questions.map(q=>[q.id,q.type==='single'?q.options.find(v=>!q.answers.includes(v)):'not an original answer'])),attempt={id:'gsa-codec-'+material.source.publicSourceId,materialId:material.id,taskId:'reading',courseDay:173,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-26T23:59:00.000Z',submittedAt:NOW,activeSeconds:60,exposureAtStart:'seen',answers,userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[],materialBinding:binding};return{...P.toRecord(attempt,material,173,A),version:1};}
function changed(record,change){const result=copy(record),artifact=A.decodeArtifact(result);change(artifact.materialBinding.material.questions,artifact.materialBinding.material);artifact.materialBinding.contentHash=A.materialContentHash(artifact.materialBinding.material);result.answer=JSON.stringify(artifact);return result;}

test('every real GSA question can enter, persist and leave the mistake book without losing its original answer or explanation',()=>{
 for(const material of materials){const record=wrongRecord(material),before=JSON.stringify(record),inputs=M.captureInputs(record,{materials});assert.equal(inputs.length,6,material.id);let state=M.newState();for(const input of inputs)state=M.capture(state,input,NOW).state;state=M.parseState(JSON.stringify(state));
  for(const item of state.items){const original=material.questions.find(q=>q.id===item.questionId);assert.equal(item.question.explanation,original.explanation);assert.deepEqual(item.question.answers,original.answers);assert.equal(item.question.maxWords,original.maxWords);for(const reason of original.distractorReasons||[])assert.ok(item.question.explanation.includes(reason)||item.question.distractorReasons?.includes(reason));}
  const round=M.submitRound(state,173,Object.fromEntries(state.items.map(i=>[i.id,i.question.answers[0]])),{id:'gsa-correct-'+material.source.publicSourceId,now:NOW});assert.equal(round.state.items.filter(i=>i.status!=='passed').length,0);assert.equal(M.recordCorrectionStatus(record,round.state).corrected,true);assert.equal(JSON.stringify(record),before);
 }
});

test('only the released institution question preserves its four reviewed punctuation forms and still rejects singular or unrelated forms',()=>{
 const material=materials.find(m=>m.source.publicSourceId==='gsa-plain-language-03'),record=wrongRecord(material),item=M.captureInputs(record,{materials}).find(i=>i.questionId==='q4');assert.ok(item);assert.deepEqual(item.question.answers,['The U.S. Courts','U.S. Courts','The US Courts','US Courts']);
 for(const answer of item.question.answers)assert.equal(M.gradeObjective(item.question,answer).status,'passed');for(const answer of ['US Court','The U.S. Court','many agencies','US Courts additional invented words here'])assert.notEqual(M.gradeObjective(item.question,answer).status,'passed');
 for(const change of [q=>{q[3].sourceCanonicalAnswers=['The U.S. Court','U.S. Court'];},q=>{q[3].answerAliases=['The US Court','US Court'];},q=>{q[3].answers.push('US Court');},q=>{q[3].answerAliasPolicy='synonym';},q=>{delete q[3].sourceCanonicalAnswers;},q=>{q[3].maxWords=8;},q=>{delete q[3].sourceCanonicalAnswers;delete q[3].answerAliasPolicy;q[3].answers.push('US Court');}])assert.throws(()=>M.captureInputs(changed(record,change),{materials}),/答案|别名|标准/);
});

test('source annotations are accepted only in their strict verified shape; malformed positions and unexplained omitted feedback still fail',()=>{
 const material=materials[0],record=wrongRecord(material);
 for(const patch of [{start:0,end:1,offsetUnit:'bytes'},{start:0,end:1,offsetUnit:'UTF-16-code-unit',unit:'UTF-16-code-unit'},{start:0,end:1},{...material.questions[0].evidenceOffsets,extra:'unsupported'},{...material.questions[0].evidenceOffsets,end:999999}])assert.throws(()=>M.captureInputs(changed(record,q=>{q[0].evidenceOffsets=patch;}),{materials}),/单位|位置|字段/);
 assert.throws(()=>M.captureInputs(changed(record,q=>{q[0].unrecognizedAuthorMetadata='must not be ignored';}),{materials}),/字段/);
 assert.throws(()=>M.captureInputs(changed(record,q=>{const fill=q.find(v=>v.type==='fill');fill.distractorReasons=['This feedback is absent from the original explanation.'];}),{materials}),/解释/);
 assert.throws(()=>M.captureInputs(changed(record,(_q,m)=>{m.source.gradedCourseRelease.sha256='0'.repeat(64);}),{materials}),/位置|注释|核验/);
});
