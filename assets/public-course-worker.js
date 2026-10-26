(function(root,factory){
 'use strict';const api=factory(root);root.IELTSPublicCourseWorkerProtocol=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof root.importScripts==='function'&&typeof root.postMessage==='function'&&typeof root.document==='undefined')api.install(root);
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const SCHEMA=1,REQUEST='prepare-public-course',RESPONSE='public-course-prepared',READY='public-course-worker-ready';
 const DATA_KEYS=['schema','version','days','materials','yearExpansion','lessonExpansions','gates'];
 const OPTION_KEYS=['startDay','protectedDays','retainedAssignments','verifiedCapabilities','verifiedSkillLevels','seenSourceGroups'];
 const RETAINED_KEYS=['assignmentId','day','materialId','materialVersion','materialContentHash','sourceId','sourceTextSha256','exposureGroup','skill','status'];
 const SENSITIVE=new Set(['records','learnerRecords','learningRecords','rawRecords','drafts','artifacts','userAnswer','userAnswers','recordId','recordIds','answer','answers','apiKey','api_key','accessToken','refreshToken','authorization','Authorization','credentials','privateKey','secret','secrets','password','profileState','localStorage','indexedDB','workId','evidenceId','mediaData','audioBase64']);
 const ERROR_TEXT={INVALID_REQUEST:'公开课程准备请求格式无效。',PRIVATE_INPUT_REJECTED:'Worker只接收公开课程及最小保护摘要。',PUBLIC_DATA_TOO_LARGE:'公开课程准备数据超出协议大小限制。',SCOPE_MISMATCH:'公开课程准备请求的计划或摘要范围不一致。',PLAN_CONTRACT_INVALID:'课程计划或公开材料合同无法核验，原日程保留。',PLAN_BLOCKED:'尚有材料无法适级安置，未把空计划当成成功。',EMPTY_PLAN_UNEXPLAINED:'未返回可解释的安排、保留或豁免结果。',WORKER_DEPENDENCY_UNAVAILABLE:'课程准备Worker依赖未加载。',WORKER_COMPUTATION_FAILED:'课程准备未成功，原日程及草稿保留。'};
 const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),opaque=(v,n=256)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\r\n\u0000-\u001f]/.test(v);
 function failure(code){const error=new Error(ERROR_TEXT[code]||ERROR_TEXT.WORKER_COMPUTATION_FAILED);error.code=code;return error;}
 function plain(v){return !!v&&Object.prototype.toString.call(v)==='[object Object]';}
 function only(value,keys){if(!plain(value)||Object.keys(value).some(k=>!keys.includes(k)))throw failure('INVALID_REQUEST');}
 function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])]));return v;}
 function hash(v){const text=JSON.stringify(stable(v));if(typeof root.IELTSPublicCoursePlanner?.hash==='function')return root.IELTSPublicCoursePlanner.hash(v);if(typeof root.IELTSAssessment?.sourceTextHash==='function')return root.IELTSAssessment.sourceTextHash(text);if(typeof require==='function')return require('node:crypto').createHash('sha256').update(text).digest('hex');throw failure('WORKER_DEPENDENCY_UNAVAILABLE');}
 function array(v){if(v===undefined)return[];if(Array.isArray(v))return v.slice();if(Object.prototype.toString.call(v)==='[object Set]')return Array.from(v);throw failure('INVALID_REQUEST');}
 function noPrivate(value,publicDefinitions=false){
  const visited=new WeakSet(),active=new WeakSet();let objects=0;
  function visit(v,depth,where){if(!v||typeof v!=='object')return;if(depth>80||++objects>200000)throw failure('PUBLIC_DATA_TOO_LARGE');if(active.has(v))throw failure('INVALID_REQUEST');if(visited.has(v))return;active.add(v);for(const key of Object.keys(v)){const canonicalAnswer=publicDefinitions&&['answer','answers'].includes(key)&&where[0]==='materials'&&/^\d+$/.test(where[1])&&(where.length===4&&where[2]==='questions'&&/^\d+$/.test(where[3])||where.length===5&&where[2]==='grammar'&&where[3]==='questions'&&/^\d+$/.test(where[4]));if(SENSITIVE.has(key)&&!canonicalAnswer||['__proto__','constructor','prototype'].includes(key))throw failure('PRIVATE_INPUT_REJECTED');visit(v[key],depth+1,[...where,key]);}active.delete(v);visited.add(v);}
  visit(value,0,[]);
 }
 function canonicalOptions(options={}){
  only(options,OPTION_KEYS);noPrivate(options);const startDay=options.startDay??2;if(!Number.isInteger(startDay)||startDay<2||startDay>365)throw failure('INVALID_REQUEST');
  const protectedDays=[...new Set(array(options.protectedDays))].sort((a,b)=>a-b);if(protectedDays.some(n=>!Number.isInteger(n)||n<1||n>365))throw failure('INVALID_REQUEST');
  const verifiedCapabilities=[...new Set(array(options.verifiedCapabilities))].sort(),seenSourceGroups=[...new Set(array(options.seenSourceGroups))].sort();if(verifiedCapabilities.some(v=>!opaque(v,100))||seenSourceGroups.some(v=>!opaque(v,160)))throw failure('INVALID_REQUEST');
  const verifiedSkillLevels=options.verifiedSkillLevels||{};only(verifiedSkillLevels,['reading','listening']);for(const level of Object.values(verifiedSkillLevels))if(typeof level!=='string'||!/^(A0|A1|A2|B1|B2|C1)(?:[–-](A0|A1|A2|B1|B2|C1))?$/.test(level))throw failure('INVALID_REQUEST');
  const retainedAssignments=array(options.retainedAssignments).map(item=>{if(!plain(item))throw failure('INVALID_REQUEST');const row=Object.fromEntries(RETAINED_KEYS.filter(k=>item[k]!==undefined).map(k=>[k,item[k]]));if(!Number.isInteger(row.day)||row.day<2||row.day>365||!opaque(row.materialId,160)||!hex(row.materialContentHash)||!hex(row.sourceTextSha256)||!opaque(row.exposureGroup,160))throw failure('INVALID_REQUEST');for(const [key,v]of Object.entries(row))if(key!=='day'&&!opaque(v,key==='materialContentHash'||key==='sourceTextSha256'?64:160))throw failure('INVALID_REQUEST');return row;}).sort((a,b)=>a.materialId.localeCompare(b.materialId,'en'));
  if(new Set(retainedAssignments.map(v=>v.materialId)).size!==retainedAssignments.length||retainedAssignments.length>200)throw failure('INVALID_REQUEST');
  return{startDay,protectedDays,retainedAssignments,verifiedCapabilities,verifiedSkillLevels:Object.fromEntries(Object.entries(verifiedSkillLevels)),seenSourceGroups};
 }
 function summaryHash(options){return hash(canonicalOptions(options));}
 function dataContractHash(basePlan){if(!plain(basePlan)||!plain(basePlan.input))throw failure('INVALID_REQUEST');return hash(basePlan.input);}
 function projectPublicData(data){
  if(!plain(data)||!Array.isArray(data.days)||!Array.isArray(data.materials))throw failure('INVALID_REQUEST');
  // Keep canonical public definitions intact: question standard answers and
  // source metadata are needed by full material-content hashes. They are NOT
  // learner record.answer/userAnswer values. No runtime/audit/profile attached
  // fields survive this top-level whitelist.
  const projected={schema:1,...Object.fromEntries(DATA_KEYS.filter(k=>k!=='schema'&&data[k]!==undefined).map(k=>[k,data[k]]))};
  if(projected.days.length>365||projected.materials.length>10000||!projected.days.length)throw failure('PUBLIC_DATA_TOO_LARGE');noPrivate(projected,true);return projected;
 }
 function scopeOf(scope){
  only(scope,['profileFence','generation','planHash','dataContractHash','summaryHash']);if(!opaque(scope.profileFence)||!(opaque(scope.generation,128)||Number.isSafeInteger(scope.generation)&&scope.generation>=0)||!hex(scope.planHash)||!hex(scope.dataContractHash)||!hex(scope.summaryHash))throw failure('INVALID_REQUEST');
  return{profileFence:scope.profileFence,generation:scope.generation,planHash:scope.planHash,dataContractHash:scope.dataContractHash,summaryHash:scope.summaryHash};
 }
 function createRequest(input){
  only(input,['requestId','scope','data','basePlan','options']);if(!opaque(input.requestId,160)||!plain(input.scope))throw failure('INVALID_REQUEST');only(input.scope,['profileFence','generation','planHash','dataContractHash','summaryHash']);
  const options=canonicalOptions(input.options||{}),basePlan=input.basePlan;if(!hex(basePlan?.planHash)||!Array.isArray(basePlan?.input?.materials)||!basePlan.input.materials.length)throw failure('INVALID_REQUEST');noPrivate(basePlan);
  const expected={planHash:basePlan.planHash,dataContractHash:dataContractHash(basePlan),summaryHash:summaryHash(options)};for(const key of Object.keys(expected))if(input.scope[key]!==undefined&&input.scope[key]!==expected[key])throw failure('SCOPE_MISMATCH');
  return{schema:1,type:REQUEST,requestId:input.requestId,scope:scopeOf({...input.scope,...expected}),data:projectPublicData(input.data),basePlan,options};
 }
 function safeScope(request){try{return scopeOf(request?.scope);}catch(_){return null;}}
 function blockedRows(rows){return(Array.isArray(rows)?rows:[]).slice(0,200).map(row=>Object.fromEntries(['materialId','sourceId','reason'].filter(k=>typeof row?.[k]==='string').map(k=>[k,row[k].slice(0,200)])));}
 function errorResponse(request,code,blocked=[]){return{schema:1,type:RESPONSE,requestId:opaque(request?.requestId,160)?request.requestId:null,scope:safeScope(request),ok:false,error:{code:ERROR_TEXT[code]?code:'WORKER_COMPUTATION_FAILED',message:ERROR_TEXT[code]||ERROR_TEXT.WORKER_COMPUTATION_FAILED},blocked:blockedRows(blocked)};}
 function sizeInWorker(value){const raw=JSON.stringify(value);const size=typeof TextEncoder==='function'?new TextEncoder().encode(raw).byteLength:typeof Buffer!=='undefined'?Buffer.byteLength(raw,'utf8'):unescape(encodeURIComponent(raw)).length;if(size>24*1024*1024)throw failure('PUBLIC_DATA_TOO_LARGE');}
 function createHandler(dependencies={}){
  const post=dependencies.postMessage||((value)=>root.postMessage(value)),planner=dependencies.planner||root.IELTSPublicCoursePlanner;if(typeof post!=='function')throw failure('WORKER_DEPENDENCY_UNAVAILABLE');
  return async function handle(request){
   let response;
   try{
    only(request,['schema','type','requestId','scope','data','basePlan','options']);if(request.schema!==SCHEMA||request.type!==REQUEST||!opaque(request.requestId,160))throw failure('INVALID_REQUEST');
    const scope=scopeOf(request.scope);only(request.data,DATA_KEYS);if(request.data.schema!==1)throw failure('INVALID_REQUEST');noPrivate(request.data,true);noPrivate(request.basePlan);const options=canonicalOptions(request.options||{});
    if(!planner||typeof planner.replan!=='function')throw failure('WORKER_DEPENDENCY_UNAVAILABLE');
    if(scope.planHash!==request.basePlan?.planHash||scope.dataContractHash!==dataContractHash(request.basePlan)||scope.summaryHash!==summaryHash(options))throw failure('SCOPE_MISMATCH');
    sizeInWorker(request);
    // replan validates full plan hash, raw/expanded days, source text,
    // complete core/public question contracts and active expansion boundaries.
    const plan=await planner.replan(request.basePlan,request.data,options);
    if(plan?.valid!==true||plan.replanOf!==scope.planHash)throw failure('PLAN_CONTRACT_INVALID');
    if(!Array.isArray(plan.assignments)||!Array.isArray(plan.retainedAssignments)||!Array.isArray(plan.exemptions)||!Array.isArray(plan.blocked))throw failure('EMPTY_PLAN_UNEXPLAINED');
    {
     const expected=request.basePlan.input.materials.map(m=>m.id),accounted=[...plan.assignments.map(a=>a.materialId),...plan.retainedAssignments.map(a=>a.materialId),...plan.exemptions.map(e=>e.materialId),...plan.blocked.map(e=>e.materialId)];
     if(!expected.length||new Set(accounted).size!==expected.length||accounted.length!==expected.length||expected.some(id=>!accounted.includes(id))||!hex(plan.planHash))throw failure('EMPTY_PLAN_UNEXPLAINED');
     // A valid, fully accounted partial plan is ready for ordinary base
     // courses. Unplaced variants stay explicit pending work; they neither
     // fabricate completion nor turn a missing prerequisite into a global
     // technical lock on every new course day.
     response={schema:1,type:RESPONSE,requestId:request.requestId,scope,ok:true,status:plan.blocked.length?'ready-with-unassigned-public-materials':'ready',pending:blockedRows(plan.blocked),plan};
    }
   }catch(error){response=errorResponse(request,error?.code);}
   post(response);return response;
  };
 }
 function install(worker=root){
  try{
   worker.importScripts('assessment-core.js','course-expansion.js','public-course-planner.js');if(typeof worker.IELTSAssessment?.sourceTextHash!=='function'||typeof worker.IELTSPublicCoursePlanner?.replan!=='function')throw failure('WORKER_DEPENDENCY_UNAVAILABLE');
   const handler=createHandler({planner:worker.IELTSPublicCoursePlanner,postMessage:value=>worker.postMessage(value)});worker.onmessage=event=>{void handler(event.data);};worker.postMessage({schema:1,type:READY,ok:true,capability:'public-course-worker/1'});
  }catch(_){worker.onmessage=event=>worker.postMessage(errorResponse(event?.data,'WORKER_DEPENDENCY_UNAVAILABLE'));worker.postMessage({schema:1,type:READY,ok:false,error:{code:'WORKER_DEPENDENCY_UNAVAILABLE',message:ERROR_TEXT.WORKER_DEPENDENCY_UNAVAILABLE}});}
 }
 return Object.freeze({SCHEMA,REQUEST,RESPONSE,READY,canonicalOptions,summaryHash,dataContractHash,projectPublicData,createRequest,createHandler,errorResponse,install});
});
