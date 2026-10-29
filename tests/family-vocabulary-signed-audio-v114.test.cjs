'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const F=require('./family-lessons-v95-fixture.cjs'),D=require('../assets/curriculum-data.js'),Data=require('../assets/essential-vocabulary-data.js');
const {binding}=require('./daily-review-fixture.cjs').helper('family-multibatch-runtime.test.cjs','binding');
const root=path.resolve(__dirname,'..'),fields=['word','meaning','ipa','example','audio'];
async function mounted(){
 const f=await F.mounted({root,data:D,day:D.days[0]},{dictionary:true}),win=f.win,prior=win.fetch;
 win.fetch=async(url,...args)=>{if(String(url).startsWith('/audio/')){const file=path.resolve(root,String(url).slice(1));assert.ok(file.startsWith(root+path.sep));const bytes=fs.readFileSync(file);return{ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return prior(url,...args);};
 for(const name of ['american-pronunciations.js','word-dictionary.js','vocabulary-practice.js','contextual-vocabulary-course.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),f.context,{filename:name});
 win.Blob=Blob;win.URL=URL;const runtime=win.IELTSFamilyLessonExpansionV95.runtime();await runtime.ensureReady();runtime.publicPlanningData();
 vm.runInContext(fs.readFileSync(path.join(root,'assets/public-course-planner.js'),'utf8'),f.context,{filename:'public-course-planner.js'});
 const adaptive=win.IELTSAdaptivePlan.createStore({data:win.IELTSCurriculumData,storage:win.IELTSProfiles.storage(),contextReady:true,synchronousPublicCourse:true,publicCoursePlanner:win.IELTSPublicCoursePlanner,automaticAdjustments:false});win.IELTSAdaptivePlan={...win.IELTSAdaptivePlan,...adaptive};adaptive.adoptStarted({records:await runtime.prepareCourseRecords(),drafts:[]});assert.equal(adaptive.verifiedPublicCourseState().ready,true);
 return f;
}
async function unitContext(f,day){
 const runtime=f.win.IELTSFamilyLessonExpansionV95.runtime(),ready=await runtime.prepareVocabularyUnit({courseDay:day});assert.equal(ready.status,'ready',JSON.stringify(ready));
 const unit=f.win.IELTSCurriculumData.familyLessonRelease.units.find(value=>value.day===day),raw=binding(unit,f.win.IELTSCurriculumData);f.context.__binding=JSON.stringify(raw);const bound=vm.runInContext('JSON.parse(__binding)',f.context),context=runtime.readVocabularyContext({courseDay:day,records:ready.records,drafts:[],binding:bound});assert.equal(context.status,'ready',JSON.stringify(context));return{ready,context};
}
function batchOptions(f,context,records,day,words,id='essential-batch-signed-audio'){
 const E=f.win.IELTSEssentialVocabulary,M=f.win.IELTSMemory,state=E.startBatch(M.newState(),{id,words,courseDay:day,now:f.context.Date.now(),contextSource:{type:'family-lesson-v95-context',binding:context.binding}}),batch=state.essential.batches[id],material={id:batch.materialId,version:'1',vocabulary:batch.words};
 return{state,batch,options:{material,courseDay:day,familyBatch:batch,familyRecords:records,vocabularyData:Data}};
}

test('the browser-order pronunciation stack preserves all 210 v109 and 300 v114 signed word snapshots',async()=>{
 const f=await mounted(),V=f.win.IELTSVocabularyPractice,totals={};
 for(const day of Array.from({length:17},(_,i)=>i+4)){
  const {ready,context}=await unitContext(f,day);assert.equal(context.targets.length,30);const release=context.binding.releaseId;totals[release]??=0;
  for(let i=0;i<30;i+=6){const {state,batch,options}=batchOptions(f,context,ready.records,day,context.targets.slice(i,i+6),'essential-batch-real-'+day+'-'+i),before=JSON.stringify(state),session=V.createSession(options);
   assert.equal(session.words.length,batch.words.length);for(let n=0;n<batch.words.length;n++)for(const key of fields)assert.equal(session.words[n][key],batch.words[n][key],day+'/'+batch.words[n].word+'/'+key);assert.equal(JSON.stringify(state),before);totals[release]+=batch.words.length;
  }
 }
 assert.equal(totals['family-linked-days04-10-v109'],210);assert.equal(totals['family-linked-days11-20-v114'],300);
});

test('signed audio unlocks in the click and plays only verified bytes; failures preserve the draft',async()=>{
 const f=await mounted(),{ready,context}=await unitContext(f,13),V=f.win.IELTSVocabularyPractice,word=context.targets.find(value=>value.word==='kilogram'),{batch,options}=batchOptions(f,context,ready.records,13,[word]),session=V.createSession(options),draft=JSON.stringify(session.getDraft()),actualPath=batch.words[0].audio,events=[],decoded=[],tts=[];
 class AudioContext{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={};events.push('new');}
  resume(){events.push('resume');this.state='running';return Promise.resolve();}
  decodeAudioData(bytes){events.push('decode');decoded.push(Buffer.from(bytes));return Promise.resolve({duration:1});}
  createBufferSource(){const context=this;return{connect(){events.push('connect');},disconnect(){},start(){events.push('start');queueMicrotask(()=>{context.currentTime=1;this.onended?.();});},stop(){events.push('stop');}};}
  close(){events.push('close');this.state='closed';return Promise.resolve();}
 }
 const originalFetch=f.win.fetch;f.win.fetch=(...args)=>{events.push('fetch');return originalFetch(...args);};
 f.win.AudioContext=AudioContext;const player=V.createAudioPlayer({...options,root:f.win,synthesis:{getVoices:()=>[{lang:'en-US'}],speak:()=>tts.push(true)},Utterance:class {}}),promise=player.play(session.words[0]);
 assert.deepEqual(events,['new','resume'],'resume must happen synchronously before the first await');const played=await promise;
 assert.equal(played.kind,'local-audio');assert.equal(played.source,actualPath);assert.deepEqual(events,['new','resume','fetch','decode','connect','start','close']);const pin=f.win.IELTSCurriculumData.familyLessonRelease.units.find(u=>u.day===13).targets.find(t=>t.canonicalId==='extension:kilogram').audioRef;assert.equal(decoded[0].length,pin.bytes);assert.equal(F.sha(decoded[0]),pin.sha256);assert.equal(tts.length,0);
 events.length=0;f.win.fetch=async(url,...args)=>{events.push('fetch');const response=await originalFetch(url,...args),original=Buffer.from(await response.arrayBuffer());original[original.length-1]^=1;return{ok:true,arrayBuffer:async()=>original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength)};};
 await assert.rejects(player.play(session.words[0]),/词音或档案已变化/);assert.ok(!events.includes('decode')&&!events.includes('start'));assert.equal(tts.length,0);assert.equal(JSON.stringify(session.getDraft()),draft);
 events.length=0;class BlockedContext extends AudioContext{resume(){events.push('blocked-resume');return Promise.reject(Error('autoplay blocked'));}}f.win.AudioContext=BlockedContext;const blocked=V.createAudioPlayer({...options,root:f.win});await assert.rejects(blocked.play(session.words[0]),/autoplay blocked/);assert.ok(!events.includes('fetch')&&!events.includes('start'));assert.ok(events.includes('close'));assert.equal(JSON.stringify(session.getDraft()),draft);f.win.AudioContext=AudioContext;
 events.length=0;f.win.fetch=originalFetch;class DecodeFailure extends AudioContext{decodeAudioData(){events.push('decode-failed');return Promise.reject(Error('bad mp3'));}}f.win.AudioContext=DecodeFailure;const undecodable=V.createAudioPlayer({...options,root:f.win});await assert.rejects(undecodable.play(session.words[0]),/词音解码失败/);assert.ok(!events.includes('start'));assert.ok(events.includes('close'));assert.equal(JSON.stringify(session.getDraft()),draft);f.win.AudioContext=AudioContext;
 events.length=0;const current=f.win.IELTSProfiles.current;f.win.fetch=async(...args)=>{const response=await originalFetch(...args);f.win.IELTSProfiles.current=()=>({id:'another-owner'});return response;};await assert.rejects(player.play(session.words[0]),/档案已变化/);f.win.IELTSProfiles.current=current;assert.ok(!events.includes('start'));assert.equal(JSON.stringify(session.getDraft()),draft);
 events.length=0;let release;f.win.fetch=()=>new Promise(resolve=>{release=resolve;});const pending=player.play(session.words[0]);await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof release,'function');player.cancel();await assert.rejects(pending,/播放已取消/);release({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});assert.ok(!events.includes('start'));assert.equal(JSON.stringify(session.getDraft()),draft);
 f.win.fetch=originalFetch;const stale={...options,familyRecords:[...ready.records]};assert.throws(()=>V.createSession(stale),/来源或档案已变化/);
 const changed=F.copy(batch);changed.words[0].ipa='/tampered/';assert.throws(()=>V.createSession({...options,familyBatch:changed,material:{...options.material,vocabulary:changed.words}}),/来源或档案已变化/);
 const altered=F.copy(options.material);altered.vocabulary[0].audio='audio/curriculum/other.mp3';assert.throws(()=>V.createSession({...options,material:altered}),/原绑定不一致/);
 const noAuthority=V.createSession({material:options.material,courseDay:13});assert.notEqual(noAuthority.words[0].audio,actualPath);
 noAuthority.recordSpelling(0,noAuthority.words[0].word);const oldDraft=noAuthority.getDraft(),oldBytes=JSON.stringify(oldDraft),restored=V.createSession({...options,draft:oldDraft});assert.equal(JSON.stringify(oldDraft),oldBytes);assert.equal(JSON.stringify(restored.getDraft()),oldBytes);assert.equal(restored.words[0].ipa,batch.words[0].ipa);assert.equal(restored.words[0].audio,actualPath);
});


test('real signed kilogram and liter complete training and pass the native family record guard',async()=>{
 const f=await mounted(),win=f.win,{ready,context}=await unitContext(f,13),selected=['kilogram','liter'].map(value=>context.targets.find(word=>word.word===value));assert.ok(selected.every(Boolean));
 for(const name of ['contextual-vocabulary-exposure.js','essential-vocabulary-app.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),f.context,{filename:name});win.IELTSMediaLibrary={list:async()=>[]};win.IELTSPlacement={currentRoute:()=>({startDay:13,skills:{}})};
 const {state:initial,options}=batchOptions(f,context,ready.records,13,selected,'essential-batch-native-114'),E=win.IELTSEssentialVocabulary,M=win.IELTSMemory,V=win.IELTSVocabularyPractice,now=f.context.Date.now();let state=initial,batch=state.essential.batches[options.familyBatch.id];
 class AudioContext{constructor(){this.state='suspended';this.currentTime=0;this.destination={};}resume(){this.state='running';return Promise.resolve();}decodeAudioData(){return Promise.resolve({duration:1});}createBufferSource(){const context=this;return{connect(){},disconnect(){},start(){queueMicrotask(()=>{context.currentTime=1;this.onended?.();});},stop(){}};}close(){this.state='closed';return Promise.resolve();}}
 win.AudioContext=AudioContext;const player=V.createAudioPlayer({...options,root:win}),session=V.createSession(options);
 session.words.forEach((word,i)=>{for(let n=0;n<3;n++)session.recordSpelling(i,word.word);for(let n=0;n<3;n++){const hash=String(i*3+n+1).padStart(64,'0'),workId='work-'+hash.slice(-40);session.registerStudyWork(i,workId);session.recordSpeaking(i,{workId,hash,evidenceId:hash,provider:'Alibaba oral assessment',verified:true,nonSilent:true,reference:word.word,recordedAt:new Date(now).toISOString(),durationSeconds:1,result:{accuracy:90,fluency:90,completeness:95}});}});
 session.begin();for(let round=0;round<3;round++){for(let i=0;i<session.words.length;i++){session.setAnswer(i,session.words[i].word);if(round===2){const proof=await player.play(session.words[i]);assert.equal(proof.source,batch.words[i].audio);session.markPlayed(i,proof);}}session.submitRound();session.next();}
 const payload=session.getSubmission();state=E.saveBatchDraft(state,batch.id,{draft:session.getDraft(),activeSeconds:0,activityByDate:{}},now,{expectedDraft:null});const store=M.createStore(win.IELTSProfiles.storage());store.read();store.save(state);batch=M.read().essential.batches[batch.id];const raw=win.IELTSProfiles.storage().getItem(M.KEY),input=win.IELTSEssentialVocabularyApp.recordForBatch(batch,payload,{now});
 await assert.rejects(f.R.record(input),/家人课程词组/);const receipt=await win.IELTSFamilyLessonExpansionV95.runtime().prepareVocabularyBatch(context.binding,{courseDay:13,draftId:payload.id,words:batch.words,wordKeys:batch.wordKeys,expectedMemoryRaw:raw}),result=await f.R.record(input,{familyVocabularyReceipt:receipt}),stored=JSON.parse(result.record.answer);
 for(let i=0;i<batch.words.length;i++)for(const key of ['word','meaning','ipa','example'])assert.equal(stored.words[i][key],batch.words[i][key],batch.words[i].word+'/'+key);for(const word of batch.words)assert.equal(stored.rounds[2].attempts.find(attempt=>attempt.word===word.word).audio.source,word.audio);
});
