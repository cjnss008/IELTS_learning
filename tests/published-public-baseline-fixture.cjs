'use strict';
// Older public/grammar fixtures exercise the immutable pre-family view. The
// active linked lessons have separate real-release admission/UI coverage.
const assert=require('node:assert/strict'),A=require('../assets/assessment-core.js');
const {BASE,baseline,core,textHash}=require('../tools/family-public-append-v1.cjs');
module.exports=function publishedBaseline(input){
 if(!input.familyLessonRelease?.active)return input;
 const receipt=input.familyLessonRelease.publicAppendReceipt;
 assert.equal(receipt?.originalMaterialCount,BASE.count);
 assert.equal(receipt.originalFingerprint,BASE.fingerprint);
 const data=JSON.parse(JSON.stringify(input));
 const appended=data.materials.splice(BASE.count);
 const release=data.familyLessonRelease;
 assert.deepEqual(appended.slice(0,receipt.appended.length).map(m=>m.id),receipt.appended.map(m=>m.id));
 for(const m of appended.slice(0,receipt.appended.length))assert.equal(A.materialContentHash(m),receipt.appended.find(r=>r.id===m.id).contentHash);
 if(!release.batches)assert.equal(appended.length,receipt.appended.length);
 else{
  const addedIds=new Set(appended.map(m=>m.id)),refs=new Map(),declared=release.batches.flatMap(batch=>batch.units.map(row=>({...row,releaseId:batch.id,releaseSha256:batch.releaseSha256})));
  assert.equal(declared.length,release.units.length);assert.equal(new Set(declared.map(row=>row.id)).size,declared.length);
  release.units.forEach((unit,i)=>{const row=declared[i],body={...unit};delete body.unitSha256;for(const key of ['id','day','releaseId','releaseSha256','unitSha256'])assert.equal(unit[key],row[key]);assert.equal(A.materialContentHash(body),unit.unitSha256);for(const task of unit.tasks)for(const ref of task.materialRefs){if(!addedIds.has(ref.materialId))continue;assert(!refs.has(ref.materialId));refs.set(ref.materialId,{unit,ref});}});
  assert.equal(refs.size,appended.length);for(const m of appended){const {unit,ref}=refs.get(m.id);assert.equal(A.materialContentHash(m),ref.contentHash);assert.deepEqual(m.source.familyLessonV95,{releaseId:unit.releaseId,unitId:unit.id,day:unit.day});}
 }
 delete data.familyLessonRelease;delete data.audit.familyLessons;delete data.audit.familyPublicAppend;
 assert.equal(A.materialContentHash(baseline(data)),BASE.fingerprint);
 assert.equal(textHash(core(data)),BASE.core);
 return data;
};
