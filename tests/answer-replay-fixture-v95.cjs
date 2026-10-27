'use strict';
// Isolated synthetic DOM plus the production Records browser/IndexedDB adapter.
// The IndexedDB transaction implementation is the project's public test double;
// it never opens a user's browser or files. No network/audio calls are made.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const base=path.resolve(process.env.REPLAY_PROJECT_ROOT||path.join(__dirname,'..'));
const fixturePath=path.join(base,'tests/year-first-use-dom-fixture.cjs');
const fixtureModule=new Module(fixturePath,module);fixtureModule.filename=fixturePath;fixtureModule.paths=Module._nodeModulePaths(path.dirname(fixturePath));
const fixtureText=fs.readFileSync(fixturePath,'utf8'),needle="fs.readFileSync(path.join(__dirname,'../assets/course-player.js'),'utf8')";
if(fixtureText.split(needle).length!==2)throw Error('Exact Player fixture seam changed');
fixtureModule._compile(fixtureText.replace(needle,"fs.readFileSync(process.env.REPLAY_PLAYER_SOURCE||path.join(__dirname,'../assets/course-player.js'),'utf8')"),fixturePath);
const {fixture}=fixtureModule.exports;
const D=require(path.join(base,'assets/curriculum-data.js'));
const P=require(path.join(base,'assets/course-player.js'));
const A=require(path.join(base,'assets/assessment-core.js'));
const V=require(path.join(base,'assets/vocabulary-practice.js'));
const H=require(path.join(base,'tests/actual-lessons-fixture.cjs'));
const copy=v=>JSON.parse(JSON.stringify(v));
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
function mount(options={}){
 let native,cache;
 const map=options.storage||new Map();map.set('ielts52-daily-plan-v1',JSON.stringify({schema:1,startDate:'2026-10-23'}));
 const f=fixture({}, {search:options.search||'?day=2',storage:map,beforePlayer(win,context){
   Object.assign(win,{IELTSCurriculumData:copy(D),crypto:require('node:crypto').webcrypto});
   Object.assign(context,{queueMicrotask,setImmediate,structuredClone});
   vm.runInNewContext("globalThis.structuredClone=function clone(v){if(v===null||v===undefined||typeof v!=='object')return v;if(Array.isArray(v))return v.map(clone);const out={};for(const k of Object.keys(v))out[k]=clone(v[k]);return out;};",context);
   context.structuredClone=win.structuredClone;
   cache=vm.runInNewContext('(function(){const module={exports:{}};'+fs.readFileSync(path.join(base,'tests/user-data-cache-fixture.cjs'),'utf8')+';return module.exports;})()',context).fakeBrowser();
   win.indexedDB=cache.indexedDB;
   win.IELTSProfiles={current:()=>({id:'replay-isolated'}),storage:()=>({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}),scopeKey:k=>'replay-isolated:'+k,assertFresh(){},isPreview:()=>true};
   vm.runInNewContext(fs.readFileSync(path.join(base,'assets/learning-records.js'),'utf8'),context,{filename:'actual-learning-records.js'});
   native=win.IELTSRecords;
   const encode=v=>vm.runInNewContext('JSON.parse('+JSON.stringify(JSON.stringify(v))+')',context);
   const rawRecord=native.record;
   // Calls from this Node test cross a realm boundary; browser UI calls do not.
   win.IELTSRecords={...native,record:input=>rawRecord(encode(input)),importState:(state,opts)=>native.importState(encode(state),opts)};
   // Actual vocabulary session model with a rendering port; this matrix does
   // not claim the separate large vocabulary DOM/audio workflow is exercised.
   win.IELTSVocabularyPractice={...V,mount(host,value){const s=V.createSession(value);host.append(win.document.createElement('section'));return{getDraft:s.getDraft,getState:s.getState,pause(){},destroy(){},getMediaState:()=>({busy:false})};}};
   vm.runInNewContext(fs.readFileSync(path.join(base,'assets/oral-practice.js'),'utf8'),context,{filename:'actual-oral-practice.js'});
   options.beforePlayer?.(win,context);
 }});
 return {...f,R:f.win.IELTSRecords,cache:()=>cache};
}
function inputFor(day,taskId,materialId,options={}){
 const d=D.days.find(d=>d.day===day),task=d.tasks.find(t=>t.id===taskId),m=D.materials.find(m=>m.id===materialId);
 const at=Date.parse(options.at||'2026-10-24T11:00:00.000Z');
 const r=H.original(day,task,m,at,false);let a=A.decodeArtifact(r);
 if(options.id)r.id=options.id;
 a.materialBinding=P.freezeMaterialBinding(m,{assessment:A,task,data:D,courseDay:day,attemptId:r.id});
 if(options.courseDay!==undefined)a.courseDay=options.courseDay;
 if(options.answers){a.answers=copy(options.answers);const next=P.toRecord({...a,id:r.id,taskId,kind:r.kind,parentId:null,submittedAt:r.submittedAt,assistance:r.assistance,media:r.media},m,day,A);Object.assign(r,next);a=A.decodeArtifact(r);}
 r.answer=JSON.stringify(a);delete r.version;delete r.history;
 if(options.taskId!==undefined)r.taskId=options.taskId;
 return r;
}
module.exports={base,D,P,A,H,copy,settle,mount,inputFor};
