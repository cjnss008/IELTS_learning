'use strict';
// Trusted parsed-answer reuse only for the official, unchanged index/assessment pair.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const H=require('./record-snapshot-index-fixture.cjs');
function player(env){if(env.document&&typeof env.document.getElementById!=='function')env.document.getElementById=()=>null;if(env.document&&typeof env.document.querySelector!=='function')env.document.querySelector=()=>null;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/course-player.js'),'utf8'),env,{filename:'course-player.js'});return env.IELTSCoursePlayer;}
async function branded(){const f=H.environment(),rows=await f.store.list(),P=player(f.env);return{f,rows,P,A:f.env.IELTSAssessment,record:rows[0]};}
test('a branded record reuses the frozen parsed answer without reparsing or hashing',async()=>{
 const {f,rows,P,A}=await branded(),r=rows[0];assert.equal(P.objectiveSubmissionComplete(r,H.material,A),true);f.reset();
 for(let i=0;i<20;i++)assert.equal(P.objectiveSubmissionComplete(r,H.material,A),true);
 assert.equal(f.stats.answerParses,0);assert.equal(f.stats.hashCalls,0);
});
test('copied, direct-object, invalid-JSON, legacy-schema and custom-assessment inputs keep the old path',async()=>{
 const {f,rows,P,A}=await branded(),r=rows[0];
 const plain=H.copy(r);f.answers.add(plain.answer);f.reset();assert.equal(P.objectiveSubmissionComplete(plain,H.material,A),true);assert.ok(f.stats.answerParses>0,'copied records must JSON.parse');
 const direct={...r,answer:JSON.parse(r.answer)};f.reset();assert.equal(P.objectiveSubmissionComplete(direct,H.material,A),true);assert.equal(f.stats.answerParses,0);
 const invalid={...r,id:'invalid',answer:'{'};f.reset();assert.equal(P.objectiveSubmissionComplete(invalid,H.material,A),false);assert.equal(H.P.objectiveSubmissionComplete(invalid,H.material,H.A),false);
 const legacy={...r,answer:JSON.stringify({answers:JSON.parse(r.answer).answers})};f.answers.add(legacy.answer);f.reset();assert.equal(P.objectiveSubmissionComplete(legacy,H.material,A),true);assert.ok(f.stats.answerParses>0);
 const custom={...A,resolveArtifactMaterial:()=>({valid:true,material:H.material}),gradeMaterialForArtifact:()=>({allGradable:true,total:H.material.questions.length,answered:H.material.questions.length})};f.reset();assert.equal(P.objectiveSubmissionComplete(r,H.material,custom),true);assert.ok(f.stats.answerParses>0,'custom assessment must never receive the frozen internal value');
});
test('a replaced index, changed owner or corrupted material cannot use the trusted shortcut',async()=>{
 const {f,rows,P,A}=await branded(),r=rows[0],original=f.env.IELTSRecordSnapshotIndex;
 f.env.IELTSRecordSnapshotIndex={parsedAnswer:()=>({available:true,value:{answers:{}}})};
 f.reset();assert.equal(P.objectiveSubmissionComplete(r,H.material,A),true);assert.ok(f.stats.answerParses>0,'replaced index must fall back to the real answer');
 f.env.IELTSRecordSnapshotIndex=original;
 f.setProfile('other');f.reset();assert.equal(P.objectiveSubmissionComplete(r,H.material,A),false);assert.equal(f.stats.answerParses,0,'owner failure must not retry JSON.parse');
 f.setProfile('legacy');const changed={...H.material,id:'not-the-bound-material',version:'999'};f.reset();assert.equal(P.objectiveSubmissionComplete(r,changed,A),false);
 const before=JSON.stringify(r.answer);f.reset();assert.equal(P.objectiveSubmissionComplete(r,H.material,A),true);assert.equal(f.stats.answerParses,0);assert.equal(JSON.stringify(r.answer),before);
});
