'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../assets/mistake-book.js'),D=require('../assets/curriculum-data.js'),Oral=require('../assets/oral-practice.js');
const ROOT=path.resolve(__dirname,'..'),NOW='2026-10-24T12:00:00.000Z',DEPENDENCIES=['assets/mistake-book.js','assets/curriculum-data.js','assets/passage-format.js','assets/oral-practice.js','assets/backup-core.js'];
function scripts(page){return [...fs.readFileSync(path.join(ROOT,page),'utf8').matchAll(/<script\b[^>]*(?:data-src|src)="([^"]+)"[^>]*><\/script>/g)].map(match=>match[1]);}
function browser(page,{omitReferences=false}={}){
 const context=vm.createContext({Blob,URLSearchParams,Map,Set,console});
 for(const file of scripts(page).filter(file=>DEPENDENCIES.includes(file)&&(!omitReferences||!['assets/curriculum-data.js','assets/passage-format.js','assets/oral-practice.js'].includes(file))))vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),context,{filename:file});
 return context;
}
function passedStates(){
 const source=D.materials.find(m=>m.id==='w01-read-1').passage,reference=Oral.splitReference(source)[0],spoken=Oral.spokenReferenceParts(source)[0],context={provider:'ali',verified:true,dayNumber:1,materialId:'w01-read-1-speaking',workId:'work-browser-original-fail',evidenceId:'browser-original-proof',reference,submittedAt:NOW,result:{text:reference,accuracy:40,fluency:95,completeness:95}},input=M.oralInputs([{questionId:'browser-student',word:'student',quote:'student'}],context)[0],state=M.capture(M.newState(),input,NOW).state,item=state.items[0],result={text:spoken,accuracy:95,fluency:95,completeness:95,words:[{word:'student',accuracy:95}]},fresh={...context,workId:'work-browser-fresh-pass',evidenceId:'browser-fresh-proof',reference:spoken,result};
 const attached=M.attachOralEvidence(state,fresh),live=M.submitRound(attached,1,{[item.id]:'New checked recording'},{id:'round-browser-fresh',now:NOW,subjective:{[item.id]:attached.items[0].oralEvidence}}).state;
 const work={id:'work-browser-archive-pass',kind:'audio',mode:'daily_reading',task:'oral_reading',materialId:context.materialId,dayNumber:1,originalText:spoken,prompt:spoken,createdAt:'2026-10-24T12:01:00.000Z',updatedAt:'2026-10-24T12:02:00.000Z',version:3,queueStatus:'reviewed',durationSeconds:6,blob:new Blob(['isolated archive only'],{type:'audio/webm'}),evidenceId:'browser-archive-proof',diagnosis:{provider:'Alibaba oral assessment',evidenceId:'browser-archive-proof',result},audioReview:{feedbackFormat:'oral-coach-v1',evidenceId:'browser-archive-proof'}},archived=M.attachArchivedOralEvidence(state,item.id,work),archive=M.submitRound(archived,1,{[item.id]:'Checked local archive'},{id:'round-browser-archive',now:NOW,subjective:{[item.id]:archived.items[0].oralEvidence}}).state;
 return{live:JSON.stringify(live),archive:JSON.stringify(archive)};
}

test('the actual backup page restores passed oral proofs without a Node require fallback',async()=>{
 const states=passedStates(),missing=browser('备份中心.html',{omitReferences:true});assert.throws(()=>missing.IELTSBackup.validate(M.KEY,states.archive),/通过标记/);
 const context=browser('备份中心.html');assert.equal(vm.runInContext('typeof require',context),'undefined');for(const raw of Object.values(states)){
  context.__fixture=raw;assert.equal(context.IELTSBackup.validate(M.KEY,raw).items[0].status,'passed');const values=new Map();context.__storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  await vm.runInContext('IELTSBackup.restoreAll(__storage,{[IELTSMistakes.KEY]:__fixture},[IELTSMistakes.KEY])',context);assert.equal(context.IELTSMistakes.parseState(values.get(M.KEY)).items[0].status,'passed');
 }
});

test('every page using the mistake parser can read valid fresh and archived oral rounds in its own browser script order',()=>{
 const states=passedStates(),pages=fs.readdirSync(ROOT).filter(file=>file.endsWith('.html')&&scripts(file).includes('assets/mistake-book.js'));assert.ok(pages.length>3);
 for(const page of pages){const context=browser(page);for(const raw of Object.values(states))assert.equal(context.IELTSMistakes.parseState(raw).items[0].status,'passed',page);}
});
