'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../assets/course-player.js'),A=require('../assets/assessment-core.js'),R=require('../assets/learning-records.js');
const BASE='2026-10-24T12:00:00.000Z';
function material(skill='reading'){return{id:'binding-'+skill,version:'1',skill,title:'Original task',type:'practice',pool:'training',week:1,level:'A0',estimatedMinutes:10,passage:'Lin has a red bag.',transcript:'A separate unused source.',instructions:'Read the original task.',questions:skill==='reading'?[{id:'q1',type:'single',prompt:'Which bag?',options:['red','blue'],optionsEnglish:['red bag','blue bag'],answers:['red'],explanation:'The original says red.',evidence:'a red bag'}]:[],source:{verification:'reviewed',rights:'original',contentHash:'source-a'},prompt:'Give your original answer.'};}
function draft(m,binding){return{id:'course-binding-test',materialId:m.id,taskId:m.skill,courseDay:1,mode:'practice',kind:'original',parentId:null,startedAt:'2026-10-24T11:59:00.000Z',submittedAt:BASE,activeSeconds:20,activityByDate:{'2026-10-24':20},exposureAtStart:'seen',answers:{q1:'red'},userEvidence:{q1:'original evidence'},text:'my input',transcript:'my spoken words',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[{id:'work-original-binding-00000001',name:'Original voice',mime:'audio/webm',durationSeconds:2}],...(binding?{materialBinding:binding}:{})};}

test('new bindings freeze one material and its task contract, independent of later same-ID content',()=>{
 const m=material(),binding=P.freezeMaterialBinding(m,{task:{id:'reading',mode:'practice',instructions:'Original task instructions',deliverable:'Original answers'}}),old=structuredClone(binding);
 assert.equal(binding.contentHash,A.materialContentHash(binding.material));assert.equal(binding.gradingPolicy,'canonical-v2');assert.equal(binding.material.transcript,undefined,'an unrelated source is not copied into a reading draft');
 m.passage='A different passage.';m.questions[0].prompt='A new question';m.questions[0].answers=['blue'];m.version='2';
 const resolved=P.resolveDraftMaterial(draft(old.material,binding),m);assert.equal(resolved.compatible,true);assert.equal(resolved.material.passage,'Lin has a red bag.');assert.deepEqual(resolved.material.questions[0].answers,['red']);assert.equal(resolved.material.version,'1');assert.deepEqual(binding,old);
});

test('submit and subsequent grading use the frozen questions, version and original policy',()=>{
 const m=material(),binding=P.freezeMaterialBinding(m),owner=draft(m,binding),changed={...m,version:'2',questions:[{...m.questions[0],answers:['blue']}]};
 const record=P.toRecord(owner,changed,1,A),artifact=A.decodeArtifact(record);assert.equal(record.materialVersion,'1');assert.equal(record.evaluation.score,1);assert.equal(artifact.objectiveGrading,'canonical-v2');assert.deepEqual(artifact.materialBinding,binding);
 assert.equal(A.gradeMaterialForArtifact(changed,artifact).correct,1);assert.equal(P.objectiveSubmissionComplete(record,{...changed,questions:[]},A),true);assert.equal(P.objectiveSubmissionComplete(record,undefined,A),true);assert.equal(R.put(R.newState(),record,BASE).record.answer,record.answer);assert.equal(changed.questions[0].answers[0],'blue');
});

test('listening and speaking retain their actual audio and example references instead of a later companion material',()=>{
 const listening=material('listening'),listen=P.freezeMaterialBinding({...listening,audio:'audio/old-listening.mp3',audioVoice:'en-US-AriaNeural'});
 assert.equal(listen.material.passage,undefined);assert.equal(listen.material.transcript,listening.transcript);assert.equal(listen.material.audio,'audio/old-listening.mp3');
 const speaking=material('speaking'),data={materials:[{id:'companion',pool:'training',passage:'An original spoken example.'}],days:[{day:1,tasks:[{id:'reading',materialIds:['companion']}]}]},spoken=P.freezeMaterialBinding(speaking,{data,courseDay:1});
 data.materials[0].passage='A replacement example.';assert.equal(spoken.material.reference,'An original spoken example.');assert.equal(P.modelReadingReference(spoken.material,data,1),'An original spoken example.');assert.equal(spoken.gradingPolicy,'existing-subjective-v1');
});

test('legacy drafts remain readable without proof and a supplied reliable legacy proof binds only on explicit resume',()=>{
 const m=material(),old=draft(m),raw=JSON.stringify(old),state=P.newState();state.drafts[old.id]=old;
 assert.equal(P.resolveDraftMaterial(old,m,{legacyMaterials:null}).compatible,false);assert.throws(()=>P.bindDraftMaterial(old,m,{legacyMaterials:null}),/原材料|版本|历史证据/);assert.equal(JSON.stringify(P.parseState(state).drafts[old.id]),raw);
 assert.equal(P.draftProgress(old,m).compatible,true,'ranking and visibility do not require permission to grade');assert.equal(P.draftProgress(old,m).restorable,false);assert.equal(P.preferredDraft([old],{material:m}).id,old.id,'an unproved draft remains visible in the learning queue');
 const index=A.createLegacyMaterialCompatibilityIndex([{kind:'git',revision:'synthetic-published-history',materials:[m]},{kind:'current',revision:'synthetic-current',materials:[m]}],{evidenceScope:'Synthetic unique published history fixture'});
 const prepared=P.bindDraftMaterial(old,m,{legacyMaterials:index});assert.equal(prepared.draft.materialBinding.gradingPolicy,'legacy-normalized-v1');assert.equal(prepared.draft.materialBinding.legacyProof.proofId,index.entries[m.id].proofId);
 const expected=structuredClone(prepared.draft);delete expected.materialBinding;assert.equal(JSON.stringify(expected),raw);assert.equal(JSON.stringify(old),raw);assert.equal(P.toRecord(prepared.draft,m,1,A).evaluation.score,1);
});

test('an ambiguous published history cannot rebind an old answer to the current same-ID question',()=>{
 const m=material(),changed={...m,questions:[{...m.questions[0],answers:['blue']}]},old=draft(m),before=JSON.stringify(old),index=A.createLegacyMaterialCompatibilityIndex([{kind:'git',revision:'first-release',materials:[m]},{kind:'git',revision:'second-release',materials:[changed]},{kind:'current',revision:'current',materials:[changed]}]);
 assert.equal(index.entries[m.id].variantCount,2);assert.equal(P.resolveDraftMaterial(old,changed,{legacyMaterials:index}).compatible,false);assert.throws(()=>P.bindDraftMaterial(old,changed,{legacyMaterials:index}),/版本|语义|候选/);assert.equal(JSON.stringify(old),before);
});

test('snapshot tampering and unsupported policies never silently use the current material',()=>{
 const m=material(),binding=P.freezeMaterialBinding(m),state=P.newState();state.drafts['course-binding-test']=draft(m,binding);const before=JSON.stringify(state);
 const bad=structuredClone(state);bad.drafts['course-binding-test'].materialBinding.material.questions[0].answers=['blue'];assert.throws(()=>P.parseState(bad),/快照/);assert.equal(JSON.stringify(state),before);
 const unsupported=structuredClone(binding);unsupported.gradingPolicy='future-policy';assert.equal(P.resolveDraftMaterial(draft(m,unsupported),m).compatible,false);assert.throws(()=>P.toRecord(draft(m,unsupported),m,1,A),/快照/);
 const restored=P.parseState(before);assert.deepEqual(restored.drafts['course-binding-test'],state.drafts['course-binding-test']);assert.deepEqual(P.mergeState(state,state).drafts,state.drafts);assert.deepEqual(require('../assets/backup-core.js').validate(P.KEY,before).drafts,state.drafts);
});

test('oversized material snapshots fail before creating a draft, without truncating task content',()=>{
 const m={...material(),passage:'x'.repeat(P.MATERIAL_SNAPSHOT_LIMIT)},before=JSON.stringify(m);assert.throws(()=>P.freezeMaterialBinding(m),/快照/);assert.equal(JSON.stringify(m),before);
});
