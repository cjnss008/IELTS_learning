(function(root,factory){'use strict';const api=factory(root);root.IELTSYearFirstUseRuntime=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const KEY='ielts52-year-first-use-v1',HASH=/^[a-f0-9]{64}$/,ID=/^expand-[a-z0-9-]{1,100}$/,STATUS=new Set(['pending','reserved','in-progress','complete']);
const clone=value=>JSON.parse(JSON.stringify(value)),keyOf=job=>job.materialId+'@'+job.materialHash;
const CONTRACT_KEYS=['inputHash','coreHash','publicPlanHash','contextCatalogHash'];
const State=root.IELTSYearFirstUseState||(typeof module==='object'&&module.exports?require('./year-first-use-state.js'):null);
function sameContract(value,expected){return !!value&&CONTRACT_KEYS.every(key=>HASH.test(expected?.[key])&&value[key]===expected[key]);}
const dateKey=value=>{const d=new Date(value);if(!Number.isFinite(d.getTime()))throw error('INVALID_CLOCK');return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function error(code,message=code){const e=new Error(message);e.code=code;return e;}
function requireValue(condition,code){if(!condition)throw error(code);}
function validRef(ref,kind){const re=kind==='index'?/^curriculum\/year-first-use\/index\.[a-f0-9]{16}\.json$/:/^curriculum\/year-first-use\/materials\/expand-[a-z0-9-]{1,100}\.[a-f0-9]{16}\.json$/;return Boolean(ref&&re.test(ref.path)&&HASH.test(ref.sha256)&&Number.isInteger(ref.bytes)&&ref.bytes>0&&ref.bytes<=(kind==='index'?2000000:131072));}
function validateIndex(value,manifest){
 requireValue(value?.schema===1&&value.kind==='year-first-use-index'&&value.version===manifest.version&&value.planSha256===manifest.planSha256&&sameContract(value,manifest)&&Array.isArray(value.jobs)&&value.jobs.length<=5000,'INVALID_INDEX');
 const ids=new Set();for(const job of value.jobs){requireValue(ID.test(job.materialId)&&!ids.has(job.materialId)&&HASH.test(job.materialHash)&&job.ref?.sha256===job.materialHash&&validRef(job.ref,'material'),'INVALID_JOB_REFERENCE');ids.add(job.materialId);requireValue(['reading','listening','writing','grammar','vocabulary','speaking'].includes(job.skill)&&['source','derived'].includes(job.kind)&&Number.isFinite(job.estimatedStudyMinutes)&&job.estimatedStudyMinutes>0&&Number.isInteger(job.releaseCourseIndex)&&job.releaseCourseIndex>=2&&job.releaseCourseIndex<=365&&(job.parentMaterialId===null||ID.test(job.parentMaterialId)),'INVALID_JOB_CONTRACT');}
 for(const job of value.jobs)if(job.parentMaterialId)requireValue(ids.has(job.parentMaterialId)&&job.parentMaterialId!==job.materialId&&value.jobs.find(j=>j.materialId===job.parentMaterialId).kind==='source','INVALID_PARENT');
 requireValue(value.jobs.length===manifest.counts.total&&value.jobs.filter(j=>j.staticStatus==='assigned-first-use').length===manifest.counts.assigned&&value.jobs.filter(j=>j.staticStatus==='pending').length===manifest.counts.pending,'INDEX_ACCOUNTING_MISMATCH');return value;
}
function parseState(raw,profileId){
 requireValue(State,'QUEUE_STATE_MODULE_UNAVAILABLE');return State.parseState(raw,profileId);
}
function forecastBudget(study,snapshot,timerCore,now){
 requireValue(Number.isFinite(study)&&study>=0&&snapshot&&snapshot.date===dateKey(now)&&Number.isFinite(snapshot.spentMinutes)&&snapshot.spentMinutes>=0&&Number.isFinite(snapshot.budgetMinutes)&&snapshot.budgetMinutes>0&&snapshot.budgetMinutes<=360&&snapshot.spentIncludesRest===true&&Number.isFinite(snapshot.remainingRequiredStudyMinutes)&&snapshot.remainingRequiredStudyMinutes>=0&&snapshot.requiredScope==='core-public-context-essential-due-excluding-year-runtime','INVALID_CALENDAR_BUDGET');
 requireValue(snapshot.timerState&&typeof timerCore?.forecast==='function','TIMER_STATE_REQUIRED');
 // Disabled timer UI must not silently turn planned rest into free capacity.
 const timer={...snapshot.timerState,enabled:true},forecast=timerCore.forecast(study,timer);
 requireValue(Number.isFinite(forecast.studyMinutes)&&forecast.studyMinutes===study&&Number.isFinite(forecast.breakMinutes)&&forecast.breakMinutes>=0&&Number.isFinite(forecast.totalMinutes)&&forecast.totalMinutes>=study,'INVALID_REST_FORECAST');
 const total=snapshot.spentMinutes+forecast.totalMinutes;return{date:snapshot.date,spentMinutes:snapshot.spentMinutes,remainingStudyMinutes:study,futureBreakMinutes:forecast.breakMinutes,predictedCalendarMinutes:total,budgetMinutes:snapshot.budgetMinutes,withinBudget:!snapshot.dayEnded&&total<=snapshot.budgetMinutes+1e-8};
}
function create(options={}){
 const manifest=clone(options.manifest||{}),cryptoAPI=options.crypto||root.crypto,fetcher=options.fetch||root.fetch?.bind(root),now=()=>{const n=options.now?options.now():Date.now();requireValue(Number.isFinite(n),'INVALID_CLOCK');return n;};
 let owner=null,index=null,prepared=false,disposed=false,serial=Promise.resolve();const controllers=new Set(),materials=new Map(),inflight=new Map(),verifiedProofs=new Map();
 const notify=value=>options.notify?.(clone(value));
 function current(){requireValue(!disposed,'DISPOSED');const c=options.getContext?.();requireValue(c&&typeof c.profileId==='string'&&c.profileId&&typeof c.generation==='string'&&c.generation&&c.ready===true&&['string','number'].includes(typeof c.evidenceRevision)&&String(c.evidenceRevision)!==''&&Number.isInteger(c.courseIndex)&&c.courseIndex>=1&&c.courseIndex<=365,'OWNER_CONTEXT_NOT_READY');options.assertFresh?.();return{...c,evidenceRevision:String(c.evidenceRevision)};}
 const ownerKey=c=>c.profileId+'\u0000'+c.generation+'\u0000'+manifest.index?.sha256;
 function contract(c){requireValue(sameContract(c.courseContract,manifest),'COURSE_CONTRACT_CHANGED_REPLAN');}
 function enabled(c){return manifest.active===true&&c.yearActive===true;}
 function invalidate(reason='OWNER_CHANGED'){for(const controller of controllers)controller.abort();controllers.clear();materials.clear();inflight.clear();verifiedProofs.clear();owner=null;index=null;prepared=false;notify({status:'invalidated',reason});}
 function capture(){const c=current();requireValue(enabled(c),'INACTIVE');contract(c);const token=ownerKey(c);if(owner!==token){invalidate('OWNER_CHANGED');owner=token;}return{...c,ownerToken:token};}
 function assertLive(c){const live=current();requireValue(enabled(live)&&ownerKey(live)===c.ownerToken&&owner===c.ownerToken,'STALE_OWNER');contract(live);return{...live,ownerToken:c.ownerToken};}
 function run(fn){const task=serial.catch(()=>{}).then(fn);serial=task.catch(()=>{});return task;}
 function failed(e,materialId){return{status:e.code==='INACTIVE'?'inactive':'pending',reason:e.code||'UNEXPECTED_FAILURE',materialId:materialId||null};}
 async function digest(bytes){requireValue(cryptoAPI?.subtle?.digest,'SHA256_UNAVAILABLE');const hash=await cryptoAPI.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
 async function fetchJSON(ref,kind,c){
  requireValue(validRef(ref,kind),'INVALID_CONTENT_PATH');requireValue(typeof fetcher==='function','FETCH_UNAVAILABLE');assertLive(c);const controller=new AbortController();controllers.add(controller);
  try{const response=await fetcher(ref.path,{signal:controller.signal,credentials:'same-origin',cache:'force-cache'});assertLive(c);requireValue(response?.ok,'CONTENT_FETCH_FAILED');const bytes=await response.arrayBuffer();assertLive(c);requireValue(bytes.byteLength===ref.bytes,'CONTENT_LENGTH_MISMATCH');requireValue(await digest(bytes)===ref.sha256,'CONTENT_HASH_MISMATCH');assertLive(c);let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch(_){throw error('CONTENT_JSON_INVALID');}return value;}finally{controllers.delete(controller);}
 }
 function binding(c){assertLive(c);const b=options.getStorage?.(c);requireValue(b?.profileId===c.profileId&&b.generation===c.generation&&typeof b.storage?.getItem==='function'&&typeof b.storage?.setItem==='function','OWNER_STORAGE_NOT_BOUND');assertLive(c);return b.storage;}
 function read(c){const storage=binding(c),state=parseState(storage.getItem(KEY),c.profileId);assertLive(c);return state;}
 async function transact(c,change){
  const lock=options.withLock||(root.navigator?.locks?.request?((name,fn)=>root.navigator.locks.request(name,fn)):null);requireValue(typeof lock==='function','QUEUE_LOCK_UNAVAILABLE');
  return lock('ielts-year-first-use:'+c.profileId,async()=>{assertLive(c);const storage=binding(c),state=parseState(storage.getItem(KEY),c.profileId),before=JSON.stringify(state),result=await change(state);assertLive(c);parseState(state,c.profileId);if(JSON.stringify(state)===before)return{state:clone(state),result};state.revision++;const raw=JSON.stringify(parseState(state,c.profileId));requireValue(raw.length<=3000000,'QUEUE_STORAGE_TOO_LARGE');storage.setItem(KEY,raw);assertLive(c);notify({status:'queue-updated',revision:state.revision,profileId:c.profileId});return{state:clone(state),result};});
 }
 function event(job,status,reason){job.status=status;job.reason=reason;job.updatedAt=new Date(now()).toISOString();job.history.push({status,reason,at:job.updatedAt});job.history=job.history.slice(-12);}
 function complete(job,p){
  if(job.status==='complete'&&job.reason==='BOUND_ORDINARY_COMPLETION'&&job.completedAt&&job.reservation===null&&job.proof?.evidenceRevision===p.evidenceRevision&&JSON.stringify(job.proof.recordIds)===JSON.stringify(p.recordIds))return;
  event(job,'complete','BOUND_ORDINARY_COMPLETION');job.proof=p;job.completedAt=job.completedAt||new Date(now()).toISOString();job.reservation=null;
 }
 async function ensure(c){
  requireValue(manifest.schema===1&&manifest.kind==='year-first-use-manifest'&&validRef(manifest.index,'index')&&HASH.test(manifest.planSha256)&&sameContract(manifest,manifest),'INVALID_MANIFEST');
  if(!index){const value=validateIndex(await fetchJSON(manifest.index,'index',c),manifest);assertLive(c);index=value;}
  if(!prepared){await transact(c,state=>{for(const meta of index.jobs){const key=keyOf(meta),prior=Object.values(state.jobs).find(j=>j.meta.materialId===meta.materialId&&j.meta.materialHash!==meta.materialHash&&['in-progress','complete'].includes(j.status));if(!state.jobs[key])state.jobs[key]={meta:clone(meta),status:'pending',reason:prior?'CONTENT_CHANGED_REVIEW_REQUIRED':meta.staticStatus==='pending'?'STATIC_PENDING_REAL_CAPACITY_REQUIRED':'READINESS_PENDING',history:[],startedAt:null,completedAt:null,proof:null,reservation:null};else if(state.jobs[key].status!=='in-progress')state.jobs[key].meta=clone(meta);}state.indexSha256=manifest.index.sha256;});assertLive(c);prepared=true;}
  return index;
 }
 function metaFor(id){const meta=index?.jobs.find(j=>j.materialId===id);requireValue(meta,'UNKNOWN_YEAR_MATERIAL');return meta;}
 function storedMeta(id,materialHash,c){requireValue(ID.test(id)&&HASH.test(materialHash),'INVALID_JOB_REFERENCE');const meta=read(c).jobs[id+'@'+materialHash]?.meta;requireValue(meta,'UNKNOWN_QUEUE_JOB');return meta;}
 async function hydrate(meta,c){
  const key=keyOf(meta),cached=materials.get(key);if(cached)return cached;
  if(inflight.has(key))return inflight.get(key);
  const task=(async()=>{
   const currentMeta=index.jobs.find(job=>keyOf(job)===key);let value,version=manifest.version;
   if(currentMeta)value=await fetchJSON(meta.ref,'material',c);
   else{
    const frozen=await options.getFrozenMaterial?.(clone(meta),clone(c));assertLive(c);
    requireValue(frozen?.material&&typeof frozen.version==='string'&&frozen.version.length>0,'HISTORICAL_MATERIAL_BINDING_REQUIRED');
    value=clone(frozen.material);version=frozen.version;const bytes=new TextEncoder().encode(JSON.stringify(value));
    requireValue(bytes.byteLength===meta.ref.bytes&&await digest(bytes)===meta.materialHash,'HISTORICAL_MATERIAL_HASH_MISMATCH');assertLive(c);
   }
   requireValue(value?.id===meta.materialId&&value.skill===meta.skill&&value.level===meta.level&&value.pool==='training'&&value.fullTest===false&&!value.independentBank&&!value.assessmentGroup&&!value.form&&value.source?.verification==='reviewed'&&value.source?.yearExpansion===version&&value.source?.practiceOnly===true&&value.source?.independentAssessmentEligible===false&&value.source?.independentTransferEligible===false&&(value.sourceMaterialId||null)===meta.parentMaterialId,'MATERIAL_SCOPE_MISMATCH');assertLive(c);materials.set(key,value);return value;
  })();inflight.set(key,task);try{return await task;}finally{if(inflight.get(key)===task)inflight.delete(key);}
 }
 async function proof(meta,c){
  requireValue(typeof options.verifyOrdinaryCompletion==='function','COMPLETION_VERIFIER_UNAVAILABLE');const p=await options.verifyOrdinaryCompletion(clone(meta),clone(c));const live=assertLive(c);
  if(!p||p.ordinaryComplete!==true){verifiedProofs.delete(keyOf(meta));return null;}
  requireValue(p.authoritative===true&&p.profileId===c.profileId&&p.generation===c.generation&&String(p.evidenceRevision)===live.evidenceRevision&&p.materialId===meta.materialId&&p.materialHash===meta.materialHash&&p.fullyAnswered===true&&p.correctionCleared===true&&Array.isArray(p.recordIds)&&p.recordIds.length>0&&p.recordIds.every(id=>typeof id==='string'&&id.length>0&&id.length<240),'COMPLETION_PROOF_INVALID');
  const result={recordIds:[...new Set(p.recordIds)],evidenceRevision:live.evidenceRevision,verifiedAt:new Date(now()).toISOString()};verifiedProofs.set(keyOf(meta),{ownerToken:c.ownerToken,...result});return result;
 }
 async function readiness(meta,c,resume){
  const self=await proof(meta,c);if(self)return{completed:self};
  if(resume){const p=await options.verifyResumeBinding?.(clone(meta),clone(c));assertLive(c);if(p?.valid===true&&p.profileId===c.profileId&&p.generation===c.generation&&p.materialId===meta.materialId&&p.materialHash===meta.materialHash&&typeof p.draftId==='string'&&p.draftId)return{resumeDraftId:p.draftId};}
  const live=assertLive(c);requireValue(live.courseIndex>=meta.releaseCourseIndex,'SOURCE_PREREQUISITE_COURSE_PENDING');const placement=await options.verifyPlacement?.(clone(meta),clone(live));assertLive(c);
  requireValue(placement?.eligible===true&&placement.verified===true&&placement.prerequisitesVerified===true&&placement.profileId===c.profileId&&placement.generation===c.generation&&String(placement.evidenceRevision)===current().evidenceRevision,'ACTUAL_PLACEMENT_PENDING');
  if(meta.parentMaterialId){const parent=metaFor(meta.parentMaterialId),p=await proof(parent,c);requireValue(p,'ACTUAL_PARENT_COMPLETION_PENDING');}
  return{};
 }
 async function estimate(meta,c,material){
  const observed=await options.estimateStudy?.(clone(meta),material?clone(material):null,clone(c));assertLive(c);
  if(observed?.source==='verified-observed'&&observed.validatedSamples===true&&Array.isArray(observed.sampleMaterialIds)&&new Set(observed.sampleMaterialIds).size>=3&&Number.isFinite(observed.studyMinutes)&&observed.studyMinutes>0)return{studyMinutes:observed.studyMinutes,source:'verified-observed',sampleCount:new Set(observed.sampleMaterialIds).size};
  return{studyMinutes:meta.estimatedStudyMinutes,source:'unit-aware-engineering-estimate',sampleCount:0};
 }
 function reservationMinutes(state,key,c){const today=dateKey(now());return Object.entries(state.jobs).reduce((sum,[id,j])=>{const r=j.reservation;return sum+(id!==key&&['reserved','in-progress'].includes(j.status)&&r?.date===today&&r.ownerToken===c.ownerToken&&Number.isFinite(r.studyMinutes)&&r.studyMinutes>0&&(j.status==='in-progress'||r.expiresAt>now())?r.studyMinutes:0);},0);}
 async function budgetFor(meta,c,estimateValue,state){
  const snapshot=await options.readBudget?.({context:clone(c),excludeYearJobKeys:Object.keys(state.jobs)}),live=assertLive(c);requireValue(snapshot?.profileId===c.profileId&&snapshot.generation===c.generation&&String(snapshot.evidenceRevision)===live.evidenceRevision,'BUDGET_OWNER_OR_REVISION_MISMATCH');
  return forecastBudget(snapshot.remainingRequiredStudyMinutes+reservationMinutes(state,keyOf(meta),c)+estimateValue.studyMinutes,snapshot,options.timerCore,now());
 }
 function ticket(){requireValue(cryptoAPI?.getRandomValues,'SECURE_TOKEN_UNAVAILABLE');return Array.from(cryptoAPI.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');}
 async function pending(meta,c,reason,expectedRevision){await transact(c,state=>{if(expectedRevision!==undefined)requireValue(state.revision===expectedRevision,'QUEUE_CHANGED_RETRY');const job=state.jobs[keyOf(meta)];if(job.status!=='in-progress')event(job,'pending',reason);else job.reason=reason;job.reservation=null;});return{status:'pending',reason,materialId:meta.materialId};}
 async function admitInternal(id,c,config={}){
  await ensure(c);const meta=config.meta||metaFor(id),key=keyOf(meta);let state=read(c),job=state.jobs[key];requireValue(job,'UNKNOWN_QUEUE_JOB');
  if(job.reason==='CONTENT_CHANGED_REVIEW_REQUIRED')return{status:'pending',reason:job.reason,materialId:id};
  try{
   let ready=await readiness(meta,c,job.status==='in-progress');if(ready.completed){await transact(c,s=>complete(s.jobs[key],ready.completed));return{status:'complete',materialId:id,proof:ready.completed};}
   let estimated=await estimate(meta,c,null),budget=await budgetFor(meta,c,estimated,state);if(!budget.withinBudget)return pending(meta,c,'SHARED_CALENDAR_CAPACITY_PENDING',state.revision);
   const material=await hydrate(meta,c);c=assertLive(c);ready=await readiness(meta,c,job.status==='in-progress');if(ready.completed)return admitInternal(id,c,config);
   estimated=await estimate(meta,c,material);
   const transaction=await transact(c,async s=>{
    const j=s.jobs[key];requireValue(j.meta.materialHash===meta.materialHash,'QUEUE_CONTENT_CHANGED');const live=assertLive(c),freshReady=await readiness(meta,live,j.status==='in-progress');
    if(freshReady.completed){complete(j,freshReady.completed);return{status:'complete',materialId:id,proof:freshReady.completed};}
    for(const [otherKey,other]of Object.entries(s.jobs))if(otherKey!==key&&other.status==='in-progress'){const p=await proof(other.meta,live);if(p)complete(other,p);else return{status:'pending',reason:'ACTIVE_YEAR_DRAFT_FIRST',materialId:id};}
    const evidenceRevision=current().evidenceRevision;budget=await budgetFor(meta,assertLive(c),estimated,s);requireValue(current().evidenceRevision===evidenceRevision&&budget.date===dateKey(now()),'EVIDENCE_OR_DATE_CHANGED_RETRY');
    if(!budget.withinBudget){if(j.status!=='in-progress')event(j,'pending','SHARED_CALENDAR_CAPACITY_PENDING');j.reservation=null;return{status:'pending',reason:'SHARED_CALENDAR_CAPACITY_PENDING',materialId:id};}
    const token=ticket();if(config.start){event(j,'in-progress','EXPLICIT_START');j.startedAt=j.startedAt||new Date(now()).toISOString();}else if(j.status!=='in-progress')event(j,'reserved','READY_AWAITING_EXPLICIT_START');j.reservation={ticket:token,date:budget.date,ownerToken:c.ownerToken,evidenceRevision,studyMinutes:estimated.studyMinutes,expiresAt:now()+120000};
    return{status:config.start?'in-progress':'ready',materialId:id,jobKey:key,ticket:token,budget,estimate:estimated,meta:clone(meta),version:material.source.yearExpansion,requiresExplicitStart:!config.start,queueScope:'independent-ordinary-year-entry',mutatesCoursePlan:false,independentAssessmentEligible:false,masteryCredit:false,...(config.start?{material:clone(material)}:{})};
   });assertLive(c);return transaction.result;
  }catch(e){if(['SOURCE_PREREQUISITE_COURSE_PENDING','ACTUAL_PLACEMENT_PENDING','ACTUAL_PARENT_COMPLETION_PENDING'].includes(e.code))return pending(meta,c,e.code,state.revision);throw e;}
 }
 async function prepare(){if(manifest.active!==true)return{status:'inactive',reason:'INACTIVE'};try{const c=capture();await ensure(c);return{status:'prepared',profileId:c.profileId,jobs:index.jobs.length,indexSha256:manifest.index.sha256};}catch(e){return failed(e);}}
 function peek(){if(manifest.active!==true)return{status:'inactive',jobs:[]};try{const c=capture();requireValue(prepared&&index,'PREPARATION_PENDING');const s=read(c);return{status:'ready',revision:s.revision,indexSha256:s.indexSha256,jobs:Object.values(s.jobs).map(j=>({...clone(j.meta),status:j.status==='complete'&&(verifiedProofs.get(keyOf(j.meta))?.ownerToken!==c.ownerToken||verifiedProofs.get(keyOf(j.meta))?.evidenceRevision!==c.evidenceRevision)?'completion-needs-current-verification':j.status,reason:j.reason,startedAt:j.startedAt,completedAt:j.completedAt,recordIds:j.proof?.recordIds||[]}))};}catch(e){return{...failed(e),jobs:[]};}}
 async function snapshot(){if(manifest.active!==true)return{status:'inactive',jobs:[]};try{const c=capture();await ensure(c);return peek();}catch(e){return{...failed(e),jobs:[]};}}
 async function resume(id,materialHash){try{
  const c=capture();await ensure(c);const meta=storedMeta(id,materialHash,c),job=read(c).jobs[keyOf(meta)];
  requireValue(job.status==='in-progress','EXISTING_DRAFT_MUST_BE_PRESERVED');
  const bound=await options.verifyResumeBinding?.(clone(meta),clone(c));assertLive(c);
  requireValue(bound?.valid===true&&bound.profileId===c.profileId&&bound.generation===c.generation&&String(bound.evidenceRevision)===current().evidenceRevision&&bound.materialId===meta.materialId&&bound.materialHash===meta.materialHash&&typeof bound.draftId==='string'&&bound.draftId,'HISTORICAL_DRAFT_BINDING_REQUIRED');
  return await admitInternal(id,c,{start:true,meta});
 }catch(e){return failed(e,id);}}
 function resolveMaterial(id,materialHash){try{const c=capture(),meta=materialHash?storedMeta(id,materialHash,c):metaFor(id),j=read(c).jobs[keyOf(meta)],r=j?.reservation;requireValue(j?.status==='in-progress'&&r?.ownerToken===c.ownerToken,'MATERIAL_NOT_STARTED');const m=materials.get(keyOf(meta));return m?clone(m):null;}catch(_){return null;}}
 async function releaseFailedStart(id,expectedTicket){try{const c=capture();await ensure(c);const meta=metaFor(id),key=keyOf(meta);return(await transact(c,async state=>{const job=state.jobs[key];requireValue(job?.reservation?.ticket===expectedTicket&&job.reservation.ownerToken===c.ownerToken,'ADMISSION_TICKET_EXPIRED');const bound=await options.verifyResumeBinding?.(clone(meta),clone(c));assertLive(c);requireValue(bound?.valid===false&&bound.profileId===c.profileId&&bound.generation===c.generation&&String(bound.evidenceRevision)===current().evidenceRevision,'EXISTING_DRAFT_MUST_BE_PRESERVED');requireValue(!await proof(meta,c),'EXISTING_COMPLETION_MUST_BE_PRESERVED');event(job,'pending','START_NOT_SAVED_RETRY');job.reservation=null;return{status:'pending',reason:'START_NOT_SAVED_RETRY',materialId:id};})).result;}catch(e){return failed(e,id);}}
 async function refreshEvidence(ids){try{const c=capture();await ensure(c);const state=read(c),targets=ids?ids.map(metaFor):Object.values(state.jobs).filter(j=>['in-progress','complete'].includes(j.status)).map(j=>j.meta),proofs=[];for(const meta of targets)proofs.push({meta,proof:await proof(meta,c)});await transact(c,s=>{for(const row of proofs){const j=s.jobs[keyOf(row.meta)];if(!j)continue;if(row.proof)complete(j,row.proof);else if(j.status==='complete'){event(j,'pending','COMPLETION_EVIDENCE_RECHECK_REQUIRED');j.proof=null;j.reservation=null;}}});return{status:'refreshed',verifiedComplete:proofs.filter(p=>p.proof).map(p=>p.meta.materialId)};}catch(e){return failed(e);}}
 return Object.freeze({prepare:()=>run(prepare),snapshot:()=>run(snapshot),peek,admit:id=>run(async()=>{try{return await admitInternal(id,capture());}catch(e){return failed(e,id);}}),start:(id,expectedTicket)=>run(async()=>{try{const c=capture();await ensure(c);const j=read(c).jobs[keyOf(metaFor(id))];requireValue(j?.reservation?.ticket===expectedTicket&&j.reservation.expiresAt>now()&&j.reservation.date===dateKey(now())&&j.reservation.ownerToken===c.ownerToken,'ADMISSION_TICKET_EXPIRED');return await admitInternal(id,c,{start:true});}catch(e){return failed(e,id);}}),resume:(id,hash)=>run(()=>resume(id,hash)),releaseFailedStart:(id,ticket)=>run(()=>releaseFailedStart(id,ticket)),refreshEvidence:ids=>run(()=>refreshEvidence(ids)),invalidate,resolveMaterial,dispose:()=>{disposed=true;invalidate('DISPOSED');}});
}
return Object.freeze({KEY,create,dateKey,keyOf,validRef,validateIndex,parseState,forecastBudget});
});
