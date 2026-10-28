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
 assert.deepEqual(appended.map(m=>m.id),receipt.appended.map(m=>m.id));
 for(const m of appended)assert.equal(A.materialContentHash(m),receipt.appended.find(r=>r.id===m.id).contentHash);
 delete data.familyLessonRelease;delete data.audit.familyLessons;delete data.audit.familyPublicAppend;
 assert.equal(A.materialContentHash(baseline(data)),BASE.fingerprint);
 assert.equal(textHash(core(data)),BASE.core);
 return data;
};
