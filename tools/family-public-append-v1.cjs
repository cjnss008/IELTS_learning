'use strict';
// Append linked lessons without changing the published public-course source.
// These source pins are shared by v98-v107; approval stays in the release loader.
const A=require('../assets/assessment-core.js');
const Planner=require('../assets/public-course-planner.js');
const Expansion=require('../assets/course-expansion.js');
const Loader=require('./apply-family-lessons-v95.cjs');
const BASE={
  fingerprint:'44c886857f9292aa0b44f2dffd740df33d5676750407c958f3d66eb5ca844213',
  core:'a96364d85cfcac0be004a4f2e9146e608dc5a68e56b285b0170ccc09c89a31d9',
  plan:'58ed4123517b79d688642843c1e8fb72c80114d5ea9c3fcabd7781335a16c251',
  planBytes:'b4b3fdfc60c95da655a0b0380cfb716b168d1630230cb3bf1b7f8df167c463a9',
  count:1842
};
const FIELDS=['version','status','createdDate','scope','weeks','materials','days','gates','lessonExpansions','familyLessonRelease'];
const textHash=value=>A.sourceTextHash(JSON.stringify(value));
const core=data=>Object.fromEntries(FIELDS.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
const baseline=data=>{const value={...data};delete value.audit;delete value.yearFirstUse;delete value.familyLessonRelease;return value;};
const check=(ok,why)=>{if(!ok)throw Error('family-public-append-v1: '+why);};
function append(data,options={}){
 check(data&&!data.familyLessonRelease&&Array.isArray(data.materials)&&data.materials.length===BASE.count,'wrong original set');
 check(A.materialContentHash(baseline(data))===BASE.fingerprint&&textHash(core(data))===BASE.core,'original data mismatch');
 check((data.yearFirstUse===undefined||data.yearFirstUse?.coreHash===BASE.core)&&data.publicCoursePlan?.planHash===BASE.plan,'original contract mismatch');
 check(A.sourceTextHash(JSON.stringify(data.publicCoursePlan,null,2)+'\n')===BASE.planBytes,'original public plan bytes differ');
 const verified=Planner.validatePlan(data.publicCoursePlan,data,{assessment:A,materialContentHash:A.materialContentHash,expandDay:Expansion.overlay});
 check(verified.valid,'original planner invalid: '+verified.reasons.join(','));
 const before=JSON.stringify(baseline(data));
 const result=Loader.apply(data,{...options,assessment:A});
 check(result?.active===true&&Number.isSafeInteger(result.added)&&result.added>0,'loader did not append');
 const release=data.familyLessonRelease,added=data.materials.slice(BASE.count);
 check(added.length===result.added&&JSON.stringify(baseline({...data,materials:data.materials.slice(0,BASE.count)}))===before,'loader changed original');
 const ids=new Set(data.materials.map(m=>m.id));check(ids.size===data.materials.length,'duplicate material');
 const references=new Map();
 for(const unit of release.units){const payload={...unit};delete payload.unitSha256;check(A.materialContentHash(payload)===unit.unitSha256,'unit hash');
  for(const task of unit.tasks)for(const ref of task.materialRefs){if(!added.some(m=>m.id===ref.materialId))continue;check(!references.has(ref.materialId),'duplicate appended reference');references.set(ref.materialId,{unit,ref});}}
 const appended=added.map(m=>{const owner=references.get(m.id),marker=m.source?.familyLessonV95;check(owner&&marker?.unitId===owner.unit.id&&marker.day===owner.unit.day&&marker.releaseId===release.id&&A.materialContentHash(m)===owner.ref.contentHash,'append binding');return{id:m.id,contentHash:owner.ref.contentHash,unitId:owner.unit.id,day:owner.unit.day};});
 check(references.size===appended.length,'orphan append');
 release.publicAppendReceipt={schema:1,kind:'family-public-append-v1',originalFingerprint:BASE.fingerprint,originalCoreHash:BASE.core,originalPublicPlanHash:BASE.plan,originalMaterialCount:BASE.count,releaseId:release.id,releaseSha256:release.releaseSha256,rootReviewSha256:release.rootReviewSha256,appended};
 return {result,receipt:JSON.parse(JSON.stringify(release.publicAppendReceipt)),combinedCoreHash:textHash(core(data))};
}
module.exports={append,BASE,core,baseline,textHash};
