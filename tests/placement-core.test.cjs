'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../assets/placement-core.js'),Profiles=require('../assets/profile-store.js');
const AT='2026-10-25T00:00:00.000Z',ID='placement-core-fixture-12345678';
function storage(){const values=new Map();return{get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
function assessment(id=ID,profileId='legacy'){return{id,profileId,createdAt:AT,status:'ready',tasks:P.SKILLS.map(skill=>({id:skill,skill,prompt:'Isolated core fixture.'}))};}
function report(id=ID,levels=['A2','B1','A1','B2'],recommended='A1'){return{assessmentId:id,complete:true,status:'complete',provisional:false,skills:Object.fromEntries(P.SKILLS.map((skill,index)=>[skill,{level:levels[index],confidence:'medium',evidence:[{taskId:skill,quote:'Isolated original evidence.',comment:'Storage regression fixture.'}],gaps:[],verified:true,verification:skill==='speaking'?'audio':skill==='writing'?'text':'objective'}])),recommendation:{level:recommended,day:P.STARTS[recommended],week:Math.ceil(P.STARTS[recommended]/7),reason:'按四项最低阶段保守安排',gaps:[]},rounds:[]};}
function completed(options={}){return{version:1,sessions:[{id:ID,createdAt:AT,updatedAt:AT,revision:2,status:'complete',assessment:assessment(),answers:{writing:'I learn English.'},report:report(ID,options.levels,options.recommended)}],adopted:options.adopted===false?null:{sessionId:ID,adoptedAt:AT}};}
function fixture(){const raw=storage(),notifications=[];let at=AT,fresh=true;const store=P.createStore({storage:raw,now:()=>at,assertFresh:()=>{if(!fresh)throw Error('stale profile');},notify:value=>notifications.push(value),data:{days:Object.values(P.STARTS).map(day=>({day}))}});return{raw,store,notifications,setTime:value=>{at=value;},makeStale:()=>{fresh=false;}};}

test('four-skill placement chooses a conservative minimum and preserves provisional speech limitations',()=>{
 const value=completed(),route=P.routeFromState(value);assert.equal(route.level,'A1');assert.equal(route.startDay,8);assert.equal(route.startWeek,2);assert.equal(route.sessionId,ID);assert.equal(route.provisional,false);
 const cautious=completed({recommended:'A0'});assert.equal(P.routeFromState(cautious).startDay,1);
 value.sessions[0].report.skills.speaking.verified=false;value.sessions[0].report.skills.speaking.verification='limited';value.sessions[0].report.skills.speaking.gaps=['Free speech audio remains unverified.'];assert.equal(P.routeFromState(value).provisional,true);assert.deepEqual(P.routeFromState(value).skills.speaking.gaps,['Free speech audio remains unverified.']);
});

test('complete reports reject raised levels, forged day/week mappings, mismatched IDs and missing skill dimensions',()=>{
 const changes=[value=>{value.sessions[0].report.recommendation={level:'B1',day:99,week:15,reason:'Too high.'};},value=>{value.sessions[0].report.recommendation.day=99;},value=>{value.sessions[0].report.recommendation.week=15;},value=>{value.sessions[0].report.assessmentId='another-assessment-12345678';},value=>{delete value.sessions[0].report.skills.listening;},value=>{value.sessions[0].report.skills.speaking.confidence=2;},value=>{value.sessions[0].report.skills.reading.verified='true';},value=>{value.sessions[0].report.skills.writing.evidence='missing';},value=>{value.sessions[0].report.recommendation.reason=' ';}];
 for(const change of changes){const value=completed();change(value);assert.equal(P.validReport(value.sessions[0].report,ID),false);assert.throws(()=>P.parseState(value));assert.throws(()=>P.routeFromState(value));}
});

test('drafts and partial feedback cannot be adopted or masquerade as completed placement',()=>{
 const f=fixture();assert.deepEqual(f.store.load(),P.newState());const first=f.store.add(assessment());assert.equal(first.status,'draft');assert.equal(first.revision,1);assert.equal(f.store.currentRoute(),null);assert.throws(()=>f.store.adopt(ID),/先完成四项/);
 const partial={assessmentId:ID,status:'pending',complete:false,skills:{writing:{level:'A1'}}};f.store.update(ID,{status:'evaluating',report:partial},1);assert.equal(f.store.load().sessions[0].status,'evaluating');assert.equal(f.store.currentRoute(),null);assert.throws(()=>f.store.adopt(ID),/先完成四项/);
 const before=f.raw.getItem(P.KEY);assert.throws(()=>f.store.update(ID,{status:'complete',report:partial},2),/结论尚不完整/);assert.equal(f.raw.getItem(P.KEY),before);assert.equal(f.notifications.length,2);
});

test('draft updates retain originals and revision conflicts or unknown fields do not overwrite saved answers',()=>{
 const f=fixture();f.store.add(assessment());f.setTime('2026-10-25T01:00:00.000Z');const saved=f.store.update(ID,{answers:{writing:'My own original answer.'}},1);assert.equal(saved.revision,2);assert.equal(saved.createdAt,AT);assert.equal(saved.updatedAt,'2026-10-25T01:00:00.000Z');
 const before=f.raw.getItem(P.KEY);assert.throws(()=>f.store.update(ID,{answers:{writing:'Stale answer.'}},1),/另一页面/);assert.throws(()=>f.store.update(ID,{id:'forged-assessment-1234'},2),/更新字段/);assert.throws(()=>f.store.add(assessment()),/已存在/);assert.equal(f.raw.getItem(P.KEY),before);
 saved.answers.writing='External mutation.';assert.equal(f.store.load().sessions[0].answers.writing,'My own original answer.');
});

test('completed and adopted sessions are immutable while adopting keeps their original assessment and report',()=>{
 const f=fixture();f.store.add(assessment());f.store.update(ID,{answers:{writing:'I learn English.'},status:'complete',report:report()},1);const before=f.store.load().sessions[0];assert.throws(()=>f.store.update(ID,{answers:{writing:'Overwrite completed answer.'}},2),/已完成测评原稿不能覆盖/);
 const adopted=f.store.adopt(ID);assert.equal(adopted.startDay,8);assert.deepEqual(f.store.load().sessions[0],before);assert.deepEqual(f.store.load().adopted,{sessionId:ID,adoptedAt:AT});assert.throws(()=>f.store.update(ID,{report:report(ID,['B2','B2','B2','B2'],'B2')},2),/已完成测评原稿不能覆盖/);
 adopted.skills.writing.level='B2';assert.equal(f.store.currentRoute().skills.writing.level,'A1');
});

test('adopting the same completed session again is idempotent and retains the original schedule date',()=>{
 const f=fixture();f.store.add(assessment());f.store.update(ID,{status:'complete',report:report()},1);const first=f.store.adopt(ID),raw=f.raw.getItem(P.KEY),notices=f.notifications.length;f.setTime('2026-11-25T00:00:00.000Z');assert.deepEqual(f.store.adopt(ID),first);assert.equal(f.raw.getItem(P.KEY),raw);assert.equal(f.store.load().adopted.adoptedAt,AT);assert.equal(f.notifications.length,notices);
});

test('an adopted route requires a matching server report and verification survives only its exact profile and report fingerprint',async()=>{
 let state=completed(),profile='legacy',calls=0;const before=JSON.stringify(state),authoritative=structuredClone(state.sessions[0].report),v=P.createVerifier({getState:()=>state,getProfile:()=>profile,fetch:async(url,options)=>{calls++;assert.equal(url,'/api/placement/'+ID+'?profileId=legacy');assert.equal(options.method,'GET');assert.equal(options.credentials,'same-origin');return{ok:true,json:async()=>({ok:true,report:authoritative})};}});
 assert.equal(v.currentRoute(),null);assert.equal(v.verificationStatus().state,'pending');assert.equal((await v.verifyAdopted()).ok,true);assert.equal(v.currentRoute().startDay,8);assert.equal(v.verificationStatus().state,'verified');await v.verifyAdopted();assert.equal(calls,1);assert.equal(JSON.stringify(state),before);
 state.sessions[0].report.recommendation.reason='Structurally valid, changed locally.';assert.equal(v.currentRoute(),null);assert.equal((await v.verifyAdopted()).ok,false);assert.equal(v.verificationStatus().state,'failed');assert.match(v.verificationStatus().reason,/不一致/);assert.equal(v.currentRoute(),null);profile='p-new-profile-1234';assert.equal(v.currentRoute(),null);assert.equal(v.verificationStatus().state,'pending');
});

test('empty or preview placement does not contact the server, and a failed or timed-out source check leaves all stored records intact',async()=>{
 let state=completed(),preview=true,calls=0;const original=JSON.stringify(state),v=P.createVerifier({getState:()=>state,isPreview:()=>preview,fetch:async()=>{calls++;return{ok:false,json:async()=>({ok:false,error:{message:'Private report unavailable.'}})};}});assert.equal((await v.verifyAdopted()).ok,true);assert.equal(calls,0);assert.equal(v.currentRoute(),null);assert.equal(v.verificationStatus().preview,true);preview=false;assert.equal((await v.verifyAdopted()).ok,false);assert.equal(calls,1);assert.match(v.verificationStatus().reason,/unavailable/);assert.equal(JSON.stringify(state),original);state=P.newState();assert.equal((await v.verifyAdopted()).ok,true);assert.equal(calls,1);
 state=completed();const timed=P.createVerifier({getState:()=>state,timeoutMs:5,fetch:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('network aborted')),{once:true}))});assert.equal((await timed.verifyAdopted()).ok,false);assert.equal(timed.currentRoute(),null);assert.match(timed.verificationStatus().reason,/15秒/);assert.equal(JSON.stringify(state),original);
});

test('reset, profile change or report replacement during source verification cannot release an old route',async()=>{
 let state=completed(),release;const report=structuredClone(state.sessions[0].report),v=P.createVerifier({getState:()=>state,fetch:()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({ok:true,report})});})});const pending=v.verifyAdopted();await Promise.resolve();state=P.newState();v.invalidate();release();await pending;assert.equal(v.currentRoute(),null);assert.equal(v.verificationStatus().state,'none');
 state=completed();const second=v.verifyAdopted();await Promise.resolve();state.sessions[0].report.recommendation.reason='New restored report.';release();await second;assert.equal(v.currentRoute(),null);assert.equal(v.verificationStatus().state,'pending');
});

test('adoption can mark an already compared report verified without persisting verification or accepting a different report',()=>{
 const state=completed(),v=P.createVerifier({getState:()=>state});const bad=structuredClone(state.sessions[0].report);bad.recommendation.reason='Other result.';assert.throws(()=>v.markVerified(bad),/不一致/);assert.equal(v.currentRoute(),null);assert.equal(v.markVerified(state.sessions[0].report).startDay,8);assert.equal(v.verificationStatus().state,'verified');const reloaded=P.createVerifier({getState:()=>state});assert.equal(reloaded.currentRoute(),null);assert.equal(reloaded.verificationStatus().state,'pending');
});

test('document runtime verifies each adopted page against its profile and never carries authorization across preview, reset or profile changes',async()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),raw=JSON.stringify(completed()),maps=new Map([['legacy',new Map([[P.KEY,raw]])],['p-second-profile-1234',new Map([[P.KEY,raw]])]]),events={},calls=[];let profile='legacy',preview=false;
 const root={document:{},setTimeout,clearTimeout,IELTSProfiles:{current:()=>({id:profile}),isPreview:()=>preview,assertFresh(){},scopeKey:key=>profile==='legacy'?key:'ielts52-profile:'+profile+':'+key,storage:()=>{const captured=profile;return{getItem:key=>maps.get(captured).get(key)||null,setItem:(key,value)=>maps.get(captured).set(key,value)};}},addEventListener:(name,fn)=>(events[name]||=[]).push(fn),dispatchEvent:event=>(events[event.type]||[]).forEach(fn=>fn(event)),fetch:async(url,options)=>{calls.push(url);assert.equal(options.method,'GET');const who=new URL(url,'http://127.0.0.1').searchParams.get('profileId');return{ok:true,json:async()=>({ok:true,report:JSON.parse(maps.get(who).get(P.KEY)).sessions[0].report})};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/placement-core.js'),'utf8'),{globalThis:root,AbortController,setTimeout,clearTimeout,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}}});const core=root.IELTSPlacement;assert.equal(core.currentRoute(),null);await core.verifyAdopted();assert.equal(core.currentRoute().startDay,8);assert.equal(calls.length,1);
 maps.get('legacy').delete(P.KEY);root.dispatchEvent({type:'storage',key:P.KEY});assert.equal(core.currentRoute(),null);assert.equal(core.verificationStatus().state,'none');maps.get('legacy').set(P.KEY,raw);root.dispatchEvent({type:'storage',key:P.KEY});assert.equal(core.currentRoute(),null);await core.verifyAdopted();assert.equal(core.currentRoute().startDay,8);assert.equal(calls.length,2);
 profile='p-second-profile-1234';root.dispatchEvent({type:'ielts:profile-changed'});assert.equal(core.currentRoute(),null);await core.verifyAdopted();assert.equal(core.currentRoute().startDay,8);assert.ok(calls.at(-1).includes('profileId=p-second-profile-1234'));preview=true;assert.equal(core.currentRoute(),null);await core.verifyAdopted();assert.equal(calls.length,3);assert.equal(core.verificationStatus().preview,true);preview=false;assert.equal(core.currentRoute(),null);await core.verifyAdopted();assert.equal(calls.length,4);root.dispatchEvent({type:'ielts:user-data-reset'});assert.equal(core.currentRoute(),null);
});

test('placement route requires an adopted complete session and a present curriculum start day',()=>{
 const value=completed();assert.equal(P.routeFromState(value,{days:[{day:1}]}),null);assert.equal(P.routeFromState(value,{days:[]}),null);assert.equal(P.routeFromState(value,{days:[{day:8}]}).startDay,8);assert.equal(P.routeFromState(completed({adopted:false})),null);
 for(const change of [state=>{state.adopted.sessionId='missing-session-12345678';},state=>{state.adopted.adoptedAt='not-a-date';},state=>{state.sessions[0].status='draft';}]){const invalid=structuredClone(value);change(invalid);assert.throws(()=>P.parseState(invalid),/课程起点缺少完整/);}
});

test('profile-scoped placement stores stay isolated and old profile/reset views cannot recreate cleared progress',()=>{
 const raw=storage(),manager=Profiles.createManager(raw,{idFactory:()=> 'p-placement-other-1234',userData:null}),legacy=P.createStore({storage:manager.storage(),now:()=>AT});legacy.add(assessment());
 const other=manager.create('第二档案');manager.activate(other.id);const independent=P.createStore({storage:manager.storage(),now:()=>AT});assert.deepEqual(independent.load(),P.newState());independent.add(assessment(ID,other.id));independent.update(ID,{answers:{writing:'Other profile answer.'}},1);assert.throws(()=>legacy.update(ID,{answers:{writing:'Stale cross-profile answer.'}},1),/切换/);
 manager.activate('legacy');assert.deepEqual(legacy.load().sessions[0].answers,{});const current=P.createStore({storage:manager.storage(),now:()=>AT});raw.removeItem(P.KEY);raw.setItem('ielts52-data-generation-v1','reset:isolated-generation');assert.throws(()=>current.add(assessment('placement-new-after-reset-1234')),/已重置或恢复/);assert.equal(raw.getItem(P.KEY),null);assert.ok(raw.getItem(manager.scopeKey(P.KEY,other.id)).includes('Other profile answer.'));
});

test('corrupt placement storage and a stale profile guard preserve the existing raw data',()=>{
 const f=fixture();f.raw.setItem(P.KEY,'{"version":1,"sessions":"damaged","adopted":null}');const damaged=f.raw.getItem(P.KEY);assert.throws(()=>f.store.load());assert.throws(()=>f.store.add(assessment()));assert.equal(f.raw.getItem(P.KEY),damaged);f.raw.removeItem(P.KEY);f.makeStale();assert.throws(()=>f.store.add(assessment()),/stale profile/);assert.equal(f.raw.getItem(P.KEY),null);
});
