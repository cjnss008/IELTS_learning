(function(root,factory){'use strict';const api=factory(root);root.IELTSPlacement=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const KEY='ielts52-placement-v1',SKILLS=['listening','reading','writing','speaking'],LEVELS=['A0','A1','A2','B1','B2'];
const STARTS=Object.freeze({A0:1,A1:8,A2:57,B1:99,B2:141});
const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,120}$/.test(value);
function bounded(value,depth=0){
 if(depth>18)throw Error('测评记录嵌套过深。');
 if(value===null||typeof value==='boolean')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(typeof value==='string'&&value.length<=100000)return;
 if(!value||typeof value!=='object')throw Error('测评记录含无效内容。');
 if(Object.keys(value).length>1000)throw Error('测评记录数量过多。');
 for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw Error('测评记录含不支持的字段。');bounded(item,depth+1);}
}
function newState(){return{version:1,sessions:[],adopted:null};}
// Recovery creates a local wrapper later than the original server task set.
// Prefer its issue time for chronology without rewriting legacy saved dates.
function sessionCreatedAt(session){return date(session?.assessment?.createdAt)?session.assessment.createdAt:session?.createdAt||'';}
function compareSessions(left,right){return Date.parse(sessionCreatedAt(left))-Date.parse(sessionCreatedAt(right))||left.id.localeCompare(right.id);}
function validReport(report,assessmentId){
 if(!plain(report)||report.assessmentId!==assessmentId||report.status!=='complete'||report.complete!==true||!plain(report.skills)||!plain(report.recommendation))return false;
 for(const skill of SKILLS){const s=report.skills[skill];if(!plain(s)||!LEVELS.includes(s.level)||!Array.isArray(s.evidence)||!Array.isArray(s.gaps)||typeof s.verified!=='boolean'||!(typeof s.confidence==='string'&&['low','medium','high'].includes(s.confidence)||typeof s.confidence==='number'&&s.confidence>=0&&s.confidence<=1))return false;}
 const r=report.recommendation,lowest=Math.min(...SKILLS.map(skill=>LEVELS.indexOf(report.skills[skill].level)));
 return LEVELS.includes(r.level)&&LEVELS.indexOf(r.level)<=lowest&&r.day===STARTS[r.level]&&r.week===Math.ceil(r.day/7)&&typeof r.reason==='string'&&r.reason.trim().length>0;
}
function parseState(raw){
 const value=typeof raw==='string'?JSON.parse(raw):raw;
 if(!plain(value)||value.version!==1||!Array.isArray(value.sessions)||value.sessions.length>200||!(value.adopted===null||plain(value.adopted)))throw Error('入学测评记录格式无效，原记录已保留。');
 if(JSON.stringify(value).length>8*1024*1024)throw Error('入学测评记录过大，请保留备份后处理。');bounded(value);
 const ids=new Set();
 for(const s of value.sessions){
  if(!plain(s)||!id(s.id)||ids.has(s.id)||!date(s.createdAt)||!date(s.updatedAt)||s.updatedAt<s.createdAt||!['draft','evaluating','complete'].includes(s.status)||!plain(s.assessment)||s.assessment.id!==s.id||!Array.isArray(s.assessment.tasks)||!s.assessment.tasks.length||s.assessment.tasks.length>32||!plain(s.answers))throw Error('测评场次或原始作答记录无效。');
  if(s.revision!==undefined&&(!Number.isInteger(s.revision)||s.revision<1))throw Error('测评记录版本无效。');
  const taskIds=new Set();for(const t of s.assessment.tasks){if(!plain(t)||typeof t.id!=='string'||taskIds.has(t.id)||!SKILLS.includes(t.skill))throw Error('测评题目身份无效。');taskIds.add(t.id);}
  if(Object.keys(s.answers).some(key=>!taskIds.has(key)))throw Error('测评答案与题目不匹配。');
  if(s.report!==null&&s.report!==undefined&&(!plain(s.report)||s.report.assessmentId!==s.id))throw Error('测评结论与当前试卷不匹配。');
  if(s.status==='complete'&&!validReport(s.report,s.id))throw Error('测评结论尚不完整，不能作为课程起点。');ids.add(s.id);
 }
 if(value.adopted){const a=value.adopted,s=value.sessions.find(s=>s.id===a.sessionId);if(!date(a.adoptedAt)||!s||s.status!=='complete'||!validReport(s.report,s.id))throw Error('课程起点缺少完整的四项测评依据。');}
 return clone(value);
}
function routeFromState(raw,data){
 const state=parseState(raw);if(!state.adopted)return null;
 const session=state.sessions.find(s=>s.id===state.adopted.sessionId),r=session.report.recommendation;
 if(data?.days&&!data.days.some(day=>day.day===r.day))return null;
 return{sessionId:session.id,adoptedAt:state.adopted.adoptedAt,level:r.level,startDay:r.day,startWeek:r.week,skills:clone(session.report.skills),reason:r.reason,provisional:session.report.provisional===true||SKILLS.some(skill=>session.report.skills[skill].verified===false)};
}
function createStore(options={}){
 const storage=options.storage;if(!storage?.getItem||!storage?.setItem)throw Error('测评档案存储未就绪。');
 const clock=options.now||(()=>new Date().toISOString());
 function load(){const raw=storage.getItem(KEY);return raw?parseState(raw):newState();}
 function save(value){options.assertFresh?.();const next=parseState(value);storage.setItem(KEY,JSON.stringify(next));options.notify?.(next);return next;}
 function add(assessment){const state=load();if(!id(assessment?.id))throw Error('AI测评题目未取得有效编号。');if(state.sessions.some(s=>s.id===assessment.id))throw Error('此份测评已存在，请继续原稿。');const now=clock(),session={id:assessment.id,createdAt:now,updatedAt:now,revision:1,status:'draft',assessment:clone(assessment),answers:{},report:null};state.sessions.push(session);save(state);return clone(session);}
 function update(sessionId,patch,expectedRevision){
  const state=load(),s=state.sessions.find(item=>item.id===sessionId);if(!s)throw Error('当前档案未找到这份测评。');
  if(expectedRevision!==undefined&&(s.revision||1)!==expectedRevision)throw Error('另一页面已更新本次测评，请重新打开后继续，当前输入已保留。');
  if(state.adopted?.sessionId===sessionId||s.status==='complete')throw Error('已完成测评原稿不能覆盖，请开始新一次测评。');
  if(Object.keys(patch).some(key=>!['answers','report','status','audioWorkId','lastError'].includes(key)))throw Error('测评更新字段无效。');
  Object.assign(s,clone(patch),{revision:(s.revision||1)+1,updatedAt:clock()});save(state);return clone(s);
 }
 function adopt(sessionId){const state=load(),s=state.sessions.find(item=>item.id===sessionId);if(!s||s.status!=='complete'||!validReport(s.report,s.id))throw Error('请先完成四项测评并取得AI结论，待评结果不能用于跳课。');if(state.adopted?.sessionId===sessionId)return routeFromState(state,options.data);state.adopted={sessionId,adoptedAt:clock()};save(state);return routeFromState(state,options.data);}
 return{load,save,add,update,adopt,currentRoute:data=>routeFromState(load(),data||options.data)};
}
function createVerifier(options={}){
 const timer=options.setTimeout||setTimeout,cancelTimer=options.clearTimeout||clearTimeout,timeoutMs=options.timeoutMs??15000;
 let active='',verified='',generation=0,controller=null,pending=null,status={state:'none',adopted:false,sessionId:null,reason:'',verifiedAt:null};
 const emit=()=>options.notify?.({...status});
 function capture(){
  if(options.isPreview?.())return{state:newState(),profileId:options.getProfile?.()||'legacy',fingerprint:'',preview:true};
  options.assertFresh?.();const state=parseState(options.getState()),profileId=options.getProfile?.()||'legacy',session=state.adopted&&state.sessions.find(s=>s.id===state.adopted.sessionId);
  return{state,profileId,session,fingerprint:session?stable({profileId,adopted:state.adopted,report:session.report}):'',preview:false};
 }
 function synchronize(){
  const snapshot=capture();if(snapshot.fingerprint!==active){generation++;controller?.abort();controller=null;pending=null;active=snapshot.fingerprint;verified='';status={state:active?'pending':'none',adopted:!!active,sessionId:snapshot.session?.id||null,reason:active?'已采用的入学测评起点尚待本机来源核验，请重试核验；原稿与课程记录保留。':'',verifiedAt:null};}status.preview=snapshot.preview;return snapshot;
 }
 function verificationStatus(){try{synchronize();}catch(error){verified='';status={...status,state:'failed',reason:'入学测评起点无法核验：'+error.message};}return{...status};}
 function invalidate(reason='学习档案已切换、清空或恢复，请重新核验入学起点。',notify=true){generation++;controller?.abort();controller=null;pending=null;active=null;verified='';status={...status,state:status.adopted?'pending':'none',reason:status.adopted?reason:'',verifiedAt:null};if(notify)emit();}
 function commit(snapshot,report){if(!snapshot.session||!validReport(report,snapshot.session.id)||stable(report)!==stable(snapshot.session.report))throw Error('本机权威测评结论与当前档案不一致；原始记录保留，请从能力测评重新核对。');verified=snapshot.fingerprint;status={state:'verified',adopted:true,sessionId:snapshot.session.id,reason:'',verifiedAt:new Date().toISOString(),preview:false};emit();return routeFromState(snapshot.state,options.data);}
 function markVerified(report){const snapshot=synchronize();generation++;controller?.abort();controller=null;pending=null;return commit(snapshot,report);}
 function currentRoute(data){const snapshot=synchronize();return snapshot.fingerprint&&verified===snapshot.fingerprint?routeFromState(snapshot.state,data||options.data):null;}
 function verifyAdopted(){
  let snapshot;try{snapshot=synchronize();}catch(error){verified='';status={...status,state:'failed',reason:'入学测评起点无法核验：'+error.message};emit();return Promise.resolve({ok:false,...status});}
  if(!snapshot.fingerprint)return Promise.resolve({ok:true,...status});if(verified===snapshot.fingerprint)return Promise.resolve({ok:true,...status});if(pending?.fingerprint===snapshot.fingerprint)return pending.promise;
  const token=++generation,own=new AbortController();controller=own;status={state:'pending',adopted:true,sessionId:snapshot.session.id,reason:'正在核验已采用的入学测评来源；原稿与课程记录保留。',verifiedAt:null,preview:false};emit();
  const promise=Promise.resolve().then(async()=>{let expired=false;const timeout=timer(()=>{expired=true;own.abort();},timeoutMs);try{
   const response=await options.fetch('/api/placement/'+encodeURIComponent(snapshot.session.id)+'?profileId='+encodeURIComponent(snapshot.profileId),{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:own.signal});
   const result=await response.json();if(own.signal.aborted)throw Error('来源核验已中止，请重试。');if(!response.ok||result.ok===false)throw Error(result.error?.message||'本机尚未返回这份测评的完整来源。');
   if(token!==generation||synchronize().fingerprint!==snapshot.fingerprint)throw Error('核验期间测评或档案已改变，请重新核验。');commit(snapshot,result.report);return{ok:true,...status};
  }catch(error){if(token===generation){verified='';status={state:'failed',adopted:true,sessionId:snapshot.session.id,reason:expired?'入学测评来源核验超过15秒，请检查本机服务后重试；原稿与课程记录保留。':'入学测评来源尚未核实：'+error.message,verifiedAt:null,preview:false};emit();}return{ok:false,...status};}finally{cancelTimer(timeout);if(token===generation){controller=null;pending=null;}}});pending={fingerprint:snapshot.fingerprint,promise};return promise;
 }
 return{verifyAdopted,verificationStatus,markVerified,currentRoute,invalidate};
}
let store,owner,verifier,verifierOwner;
function runtime(){
 const profile=root.IELTSProfiles?.current?.()?.id||'legacy';
 if(!store||owner!==profile){const storage=root.IELTSProfiles?.storage?.()||root.localStorage;if(!storage)return null;owner=profile;store=createStore({storage,assertFresh:()=>root.IELTSProfiles?.assertFresh?.(),notify:()=>root.dispatchEvent?.(new CustomEvent('ielts:placement-changed'))});}return store;
}
function runtimeVerifier(){const current=runtime();if(!current)return null;if(!verifier||verifierOwner!==owner){verifier?.invalidate(undefined,false);verifierOwner=owner;verifier=createVerifier({getState:()=>runtime().load(),getProfile:()=>root.IELTSProfiles?.current?.()?.id||'legacy',assertFresh:()=>root.IELTSProfiles?.assertFresh?.(),isPreview:()=>root.IELTSProfiles?.isPreview?.()===true,fetch:(...args)=>root.fetch(...args),setTimeout:root.setTimeout?.bind(root),clearTimeout:root.clearTimeout?.bind(root),notify:detail=>{if(root.dispatchEvent&&typeof CustomEvent==='function')root.dispatchEvent(new CustomEvent('ielts:placement-verification-changed',{detail}));}});}return verifier;}
function currentRoute(data){if(!root.document)return null;return runtimeVerifier()?.currentRoute(data)||null;}
function verificationStatus(){if(!root.document)return{state:'none',adopted:false,sessionId:null,reason:'',verifiedAt:null};try{return runtimeVerifier()?.verificationStatus()||{state:'none',adopted:false,sessionId:null,reason:'',verifiedAt:null};}catch(error){return{state:'failed',adopted:false,sessionId:null,reason:'入学测评记录无法读取：'+error.message,verifiedAt:null};}}
function verifyAdopted(){if(!root.document)return Promise.resolve({ok:true,...verificationStatus()});try{return runtimeVerifier()?.verifyAdopted()||Promise.resolve({ok:true,...verificationStatus()});}catch(error){return Promise.resolve({ok:false,state:'failed',adopted:false,reason:error.message});}}
function markVerified(report){if(!root.document)return null;return runtimeVerifier()?.markVerified(report)||null;}
if(root.addEventListener){for(const name of ['ielts:profile-changed','ielts:profile-reset','ielts:user-data-invalidated','ielts:user-data-reset'])root.addEventListener(name,()=>verifier?.invalidate());root.addEventListener('storage',event=>{try{const key=root.IELTSProfiles?.scopeKey?.(KEY)||KEY,generationKey=root.IELTSProfiles?.scopeKey?.('ielts52-data-generation-v1')||'ielts52-data-generation-v1';if(event.key===generationKey)verifier?.invalidate();else if(event.key===key){verifier?.verificationStatus();root.dispatchEvent?.(new CustomEvent('ielts:placement-changed'));}}catch(_){verifier?.invalidate();}});}
async function durable(){if(!root.IELTSProfiles?.isPreview?.())await root.IELTSUserData?.syncNow?.({profileId:root.IELTSProfiles?.current?.().id||'legacy'});}
return{KEY,SKILLS,LEVELS,STARTS,newState,sessionCreatedAt,compareSessions,parseState,validReport,routeFromState,createStore,createVerifier,currentRoute,verificationStatus,verifyAdopted,markVerified,durable,
 load:()=>runtime()?.load()||newState(),initialize:()=>{const s=runtime();return s.save(s.load());},add:assessment=>runtime().add(assessment),update:(...args)=>runtime().update(...args),adopt:id=>runtime().adopt(id)};
});
