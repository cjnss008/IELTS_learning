(function(root,factory){'use strict';const api=factory(root);root.IELTSRecordSnapshotIndex=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function createIndex(root){
'use strict';
// Derived memory only. No persistent key, score, answer or caller revision is written.
const GENERATION='ielts52-data-generation-v1',arrays=new WeakMap(),records=new WeakMap(),objects=new WeakMap();let latest=null,sourceEpoch=0,projectionOwner=null;
const error=(code,message='学习档案刚发生变化，请刷新后继续；原稿与原音保留。')=>Object.assign(Error(message),{code});
function available(){return!!(root.document&&root.IELTSProfiles?.current&&root.IELTSProfiles?.storage&&root.IELTSRecords?.parseState&&(root.crypto?.subtle?.digest||root.IELTSAssessment?.sourceTextHash));}
function owner(){return projectionOwner||readOwner();}
function readOwner(){
 const fresh=root.IELTSProfiles?.assertFresh?.();root.IELTSUserData?.assertReady?.();const status=root.IELTSUserData?.status?.();
 if(status&&(['loading','error'].includes(status.state)||['loading','error'].includes(status.operationState)))throw error('RECORD_SNAPSHOT_NOT_READY');
 // assertFresh reads the live registry, descriptor and generation together.
 // Reuse only this call's result; never retain it across reads or async work.
 let bound;if(fresh&&typeof fresh.profileId==='string'&&fresh.profileId&&typeof fresh.generation==='string'&&fresh.generation&&!fresh.generation.startsWith('busy:'))bound=fresh;
 else{const profileId=root.IELTSProfiles?.current?.()?.id,storage=root.IELTSProfiles?.storage?.(),raw=storage?.getItem(GENERATION),generation=raw===null?'initial':String(raw);
  if(typeof profileId!=='string'||!profileId||!storage||raw===undefined||generation.startsWith('busy:'))throw error('RECORD_SNAPSHOT_OWNER_CHANGED');bound={profileId,generation};}
 if(status){
  const blocked=status.blockedProfileIds,conflicts=status.conflicts;
  if(Array.isArray(blocked)&&blocked.includes(bound.profileId)||Array.isArray(conflicts)&&conflicts.some(item=>item?.profileId===bound.profileId))throw error('RECORD_SNAPSHOT_NOT_READY');
  if(status.state==='conflict'){
   // A global warning may describe other profiles. Only a complete, consistent
   // conflict list and an independently healthy operation can establish that.
   const valid=Array.isArray(blocked)&&blocked.length>0&&blocked.every(id=>typeof id==='string'&&id)&&new Set(blocked).size===blocked.length&&Array.isArray(conflicts)&&conflicts.length===blocked.length&&conflicts.every(item=>item&&typeof item.profileId==='string'&&blocked.includes(item.profileId))&&new Set(conflicts.map(item=>item.profileId)).size===blocked.length&&blocked.includes(status.profileId);
   const operation=status.operationState,allowed=['conflict','ready','pending','syncing'].includes(operation),failedCode=status.errorCode&&!(operation==='conflict'&&status.errorCode==='USER_DATA_CONFLICT'),failedOperation=operation!=='conflict'&&status.error;
   if(!valid||!allowed||failedCode||failedOperation)throw error('RECORD_SNAPSHOT_NOT_READY');
  }
 }
 return bound;
}
const same=(a,b)=>a&&b&&a.profileId===b.profileId&&a.generation===b.generation;
// A synchronous read projection has one before/after ownership boundary.
// No proof survives an await or the return of this function; writes do not use it.
function projectRead(read){
 if(typeof read!=='function')throw TypeError('A synchronous read is required');
 if(projectionOwner)return read();
 const captured=readOwner(),epoch=sourceEpoch;projectionOwner=captured;
 try{const value=read();if(value&&typeof value.then==='function')throw error('RECORD_PROJECTION_ASYNC');return value;}
 finally{projectionOwner=null;if(!same(captured,readOwner())||epoch!==sourceEpoch)throw error('RECORD_SNAPSHOT_SOURCE_CHANGED');}
}
function live(bound){if(!same(owner(),bound))throw error('RECORD_SNAPSHOT_OWNER_CHANGED');}
function lease(bound){live(bound);return{...bound,epoch:sourceEpoch};}
function verify(token){live(token);if(token.epoch!==sourceEpoch)throw error('RECORD_SNAPSHOT_SOURCE_CHANGED');}
function freeze(value,bound,seen=new WeakSet(),depth=0){
 if(value===null||typeof value!=='object')return value;if(depth>50)throw error('RECORD_SNAPSHOT_DEPTH');if(seen.has(value))return value;seen.add(value);
 if(Object.keys(value).some(key=>['__proto__','constructor','prototype'].includes(key)))throw error('RECORD_SNAPSHOT_FIELD');for(const child of Object.values(value))freeze(child,bound,seen,depth+1);Object.freeze(value);objects.set(value,bound);return value;
}
async function digest(text,token){
 let hash;if(root.crypto?.subtle?.digest){const bytes=new TextEncoder().encode(text);const value=await root.crypto.subtle.digest('SHA-256',bytes);hash=Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('');}
 else hash=root.IELTSAssessment.sourceTextHash(text);verify(token);return hash;
}
function receipt(value){const data=arrays.get(value);if(!data)return null;live(data);return data.receipt;}
function isCurrent(value){const data=arrays.get(value);if(!data)return false;live(data);return data.epoch===sourceEpoch;}
function parsedAnswer(record){const data=records.get(record);if(!data)return null;live(data);return data.answer;}
function parsedReview(record){const data=records.get(record);if(!data)return null;live(data);return data.review;}
function immutable(value){const bound=objects.get(value);if(!bound)return false;live(bound);return true;}
function memoizeTrustedObject(build){
 if(typeof build!=='function')throw TypeError('A projection function is required');const values=new WeakMap();return value=>{if(!value||typeof value!=='object'||!immutable(value))return build(value);if(values.has(value))return values.get(value);const result=build(value);values.set(value,result);return result;};
}
function memoizeRecordsProjection(build){
 if(typeof build!=='function')throw TypeError('A records projection function is required');const values=new WeakMap();return input=>{const proof=receipt(input);if(!proof)return null;if(!values.has(input)){const result=build(input);freeze(result,{profileId:proof.profileId,generation:proof.generation});values.set(input,result);}return{available:true,value:values.get(input)};};
}
function createStoreBoundary(){
 if(!available())return null;const bound=owner();
 async function read(readSource,now){
  const token=lease(bound),raw=await readSource();verify(token);const state=root.IELTSRecords.parseState(raw,typeof now==='function'?now():now),serialized=JSON.stringify(state),hash=await digest(serialized,token);verify(token);
  if(latest&&same(latest,bound)&&latest.digest===hash){latest.epoch=token.epoch;return latest.records;}
  freeze(state,bound);for(const record of state.records){const parsed=text=>{let value=null,cacheable=true;try{value=JSON.parse(text||'{}');freeze(value,bound);}catch(cause){if(cause?.code)cacheable=false;}return cacheable?Object.freeze({available:true,value}):null;};
   records.set(record,{...bound,answer:parsed(record.answer),review:parsed(record.evaluation.feedback)});
  }
  const metadata={...bound,epoch:token.epoch,digest:hash,records:state.records,receipt:Object.freeze({schema:1,profileId:bound.profileId,generation:bound.generation,digest:hash,count:state.records.length})};arrays.set(state.records,metadata);latest=metadata;return state.records;
 }
 function select(input,filter={}){
  const source=receipt(input);if(!source)throw error('RECORD_SNAPSHOT_NOT_VALIDATED');const keys=Object.keys(filter);if(!keys.length)return input;
  const indices=[],selected=input.filter((record,index)=>{const keep=keys.every(key=>['dayNumber','taskId','skill'].includes(key)&&record[key]===filter[key]);if(keep)indices.push(index);return keep;});Object.freeze(selected);
  // The source content digest plus exact selected positions binds every child.
  const sha=root.IELTSAssessment?.sourceTextHash;if(!sha)return selected;const hash=sha(JSON.stringify([source.digest,indices]));arrays.set(selected,{...bound,epoch:arrays.get(input).epoch,digest:hash,receipt:Object.freeze({schema:1,profileId:bound.profileId,generation:bound.generation,digest:hash,count:selected.length})});return selected;
 }
 return Object.freeze({read,select});
}
if(root.addEventListener)for(const name of ['ielts:records-changed','ielts:profile-changed','ielts:profile-reset'])root.addEventListener(name,event=>{if(name==='ielts:records-changed'&&event.detail?.profileId&&root.IELTSProfiles?.current?.()?.id!==event.detail.profileId)return;sourceEpoch++;if(name!=='ielts:records-changed')latest=null;});
return Object.freeze({create:createIndex,available,createStoreBoundary,receipt,isCurrent,parsedAnswer,parsedReview,memoizeTrustedObject,memoizeRecordsProjection,projectRead});
});
