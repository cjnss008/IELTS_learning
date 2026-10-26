(function(root,factory){'use strict';const api=factory();root.IELTSYearFirstUseState=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const KEY='ielts52-year-first-use-v1',HASH=/^[a-f0-9]{64}$/,ID=/^expand-[a-z0-9-]{1,100}$/,STATUSES=['pending','reserved','in-progress','complete'];
const clone=value=>JSON.parse(JSON.stringify(value));
function fail(){const e=Error('全年练习队列无法校验；原记录保留，不用空队列覆盖。');e.code='QUEUE_STORAGE_INVALID';throw e;}
function check(ok){if(!ok)fail();}
function object(value,fields){check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>fields.includes(key)));}
function text(value,max=240){return typeof value==='string'&&value.length>0&&value.length<=max;}
function owner(value){return text(value,120)&&!/[\x00-\x1f\x7f]/.test(value);}
function iso(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
function revision(value){return typeof value==='string'&&text(value,240)||typeof value==='number'&&Number.isFinite(value);}
function ref(value,id,hash){object(value,['path','sha256','bytes']);check(value.path==='curriculum/year-first-use/materials/'+id+'.'+hash.slice(0,16)+'.json'&&value.sha256===hash&&Number.isInteger(value.bytes)&&value.bytes>0&&value.bytes<=131072);}
function meta(value){
 object(value,['materialId','materialHash','skill','level','kind','parentMaterialId','sourceWeek','releaseCourseIndex','plannedCourseIndex','staticStatus','staticReason','estimatedStudyMinutes','ref']);
 check(ID.test(value.materialId)&&HASH.test(value.materialHash)&&['reading','listening','writing','grammar','vocabulary','speaking'].includes(value.skill)&&text(value.level,24)&&['source','derived'].includes(value.kind));
 check(value.kind==='source'?value.parentMaterialId===null:ID.test(value.parentMaterialId)&&value.parentMaterialId!==value.materialId);
 check(Number.isInteger(value.releaseCourseIndex)&&value.releaseCourseIndex>=2&&value.releaseCourseIndex<=365&&Number.isFinite(value.estimatedStudyMinutes)&&value.estimatedStudyMinutes>0&&value.estimatedStudyMinutes<=1440);
 check(value.sourceWeek===undefined||Number.isInteger(value.sourceWeek)&&value.sourceWeek>=1&&value.sourceWeek<=52);
 check(value.plannedCourseIndex===undefined||value.plannedCourseIndex===null||Number.isInteger(value.plannedCourseIndex)&&value.plannedCourseIndex>=2&&value.plannedCourseIndex<=365);
 check(['assigned-first-use','pending'].includes(value.staticStatus)&&(value.staticReason===undefined||value.staticReason===null||text(value.staticReason)));
 ref(value.ref,value.materialId,value.materialHash);
}
function proof(value){if(value===null||value===undefined)return;object(value,['recordIds','evidenceRevision','verifiedAt']);check(Array.isArray(value.recordIds)&&value.recordIds.length>0&&value.recordIds.length<=200&&new Set(value.recordIds).size===value.recordIds.length&&value.recordIds.every(id=>text(id))&&revision(value.evidenceRevision)&&iso(value.verifiedAt));}
function reservation(value){if(value===null||value===undefined)return;object(value,['ticket','date','ownerToken','evidenceRevision','studyMinutes','expiresAt']);check(/^[a-f0-9]{32}$/.test(value.ticket)&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&Number.isFinite(Date.parse(value.date))&&new Date(value.date).toISOString().slice(0,10)===value.date&&text(value.ownerToken,2048)&&revision(value.evidenceRevision)&&Number.isFinite(value.studyMinutes)&&value.studyMinutes>0&&value.studyMinutes<=360&&Number.isFinite(value.expiresAt)&&value.expiresAt>0);}
function newState(profileId){check(owner(profileId));return{schema:1,profileId,revision:0,indexSha256:null,jobs:{}};}
function parseState(raw,profileId){
 if(raw===null||raw===undefined||raw==='')return newState(profileId);
 if(typeof raw==='string'){check(raw.length<=3000000);try{raw=JSON.parse(raw);}catch(_){fail();}}
 object(raw,['schema','profileId','revision','indexSha256','jobs']);check(raw.schema===1&&owner(raw.profileId)&&(profileId===undefined||raw.profileId===profileId)&&Number.isSafeInteger(raw.revision)&&raw.revision>=0&&raw.revision<=1000000000&&(raw.indexSha256===null||HASH.test(raw.indexSha256)));
 check(raw.jobs&&typeof raw.jobs==='object'&&!Array.isArray(raw.jobs)&&Object.keys(raw.jobs).length<=10000);
 for(const [key,job]of Object.entries(raw.jobs)){
  object(job,['meta','status','reason','history','startedAt','completedAt','proof','reservation','updatedAt']);meta(job.meta);check(key===job.meta.materialId+'@'+job.meta.materialHash&&STATUSES.includes(job.status)&&text(job.reason)&&Array.isArray(job.history)&&job.history.length<=12);
  for(const row of job.history){object(row,['status','reason','at']);check(STATUSES.includes(row.status)&&text(row.reason)&&iso(row.at));}
  check((job.startedAt===null||iso(job.startedAt))&&(job.completedAt===null||iso(job.completedAt))&&(job.updatedAt===undefined||iso(job.updatedAt)));proof(job.proof);reservation(job.reservation);
 }
 check(JSON.stringify(raw).length<=3000000);return clone(raw);
}
// Reservations and proof caches belong to the live session. Learner records and
// frozen task content live in their existing stores and are never rewritten here.
function restoreState(raw,profileId){const state=parseState(raw);check(profileId===undefined||owner(profileId));state.profileId=profileId||state.profileId;for(const job of Object.values(state.jobs)){job.reservation=null;job.proof=null;if(job.status==='reserved')job.status='pending';}return parseState(state,state.profileId);}
function identity(value){return JSON.stringify([value.materialId,value.materialHash,value.skill,value.level,value.kind,value.parentMaterialId,value.ref.path,value.ref.sha256,value.ref.bytes]);}
function first(a,b){return[a,b].filter(Boolean).sort()[0]||null;}
function mergeStates(current,incoming,options={}){
 const a=parseState(current),b=parseState(incoming);if(!options.profileId)check(a.profileId===b.profileId);const target=options.profileId||a.profileId;check(owner(target));const out=restoreState(a,target),other=restoreState(b,target);
 for(const [key,job]of Object.entries(other.jobs)){
  const prior=out.jobs[key];if(!prior){out.jobs[key]=clone(job);continue;}
  check(identity(prior.meta)===identity(job.meta));const latest=String(job.updatedAt||'')>String(prior.updatedAt||'')?job:prior,merged=clone(latest);
  merged.status=[prior.status,job.status].includes('complete')?'complete':[prior.status,job.status].includes('in-progress')?'in-progress':'pending';
  merged.startedAt=first(prior.startedAt,job.startedAt);merged.completedAt=first(prior.completedAt,job.completedAt);merged.proof=null;merged.reservation=null;
  const histories=new Map([...prior.history,...job.history].map(row=>[JSON.stringify(row),row]));merged.history=[...histories.values()].sort((x,y)=>x.at.localeCompare(y.at)||JSON.stringify(x).localeCompare(JSON.stringify(y))).slice(-12);out.jobs[key]=merged;
 }
 out.revision=Math.max(a.revision,b.revision)+1;return parseState(out,target);
}
return Object.freeze({KEY,newState,parseState,restoreState,mergeStates});
});
