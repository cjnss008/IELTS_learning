'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('./family-lessons-v95-fixture.cjs'),D=require('../assets/curriculum-data.js'),root=path.resolve(__dirname,'..');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(read,predicate,label){let last;const end=Date.now()+30000;while(Date.now()<end){last=await read();if(predicate(last))return last;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Timed out waiting for '+label+': '+String(last).slice(0,1000));}

test('standalone family vocabulary updates when the real public plan finishes without rechecking unchanged audio',async()=>{
 const f=await F.mounted({root,data:D,day:D.days[3]},{dictionary:true});const win=f.win,context=f.context,data=win.IELTSCurriculumData;
 // A standalone page has its own adaptive instance and no course-player mount.
 delete win.IELTSTodayNavigation;
 const handlers=new Map();win.addEventListener=(name,fn)=>{const list=handlers.get(name)||[];list.push(fn);handlers.set(name,list);};win.removeEventListener=(name,fn)=>handlers.set(name,(handlers.get(name)||[]).filter(value=>value!==fn));win.dispatchEvent=event=>{for(const fn of [...(handlers.get(event.type)||[])])fn(event);};
 const oldFetch=win.fetch;let audioReads=0;
 win.fetch=async(url,options)=>{if(String(url).startsWith('/audio/')){audioReads++;const bytes=fs.readFileSync(path.join(root,String(url).slice(1)));return{ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}return oldFetch(url,options);};
 for(const name of ['public-course-planner.js','public-course-worker.js','public-material-selector.js','contextual-vocabulary-exposure.js','contextual-vocabulary-course.js','essential-vocabulary-app.js'])vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),context,{filename:name});
 win.IELTSPlacement={currentRoute:()=>({startDay:4,level:'A0',skills:{}})};
 const realContextual=win.IELTSContextualVocabulary;let pendingAccesses=0;
 win.IELTSContextualVocabulary={...realContextual,batchTrainingAccess(...args){const result=realContextual.batchTrainingAccess(...args);if(result.reason==='family-public-course-plan-pending')pendingAccesses++;return result;}};
 let request,release,requests=0,holdLater=false;const adaptive=win.IELTSAdaptivePlan.createStore({data,storage:win.IELTSProfiles.storage(),profileId:'legacy',getProfile:()=>win.IELTSProfiles.current().id,automaticAdjustments:false,preparePublicCourse:value=>{request=value;requests++;return new Promise(resolve=>{const complete=async()=>{let response;const handle=win.IELTSPublicCourseWorkerProtocol.createHandler({planner:win.IELTSPublicCoursePlanner,postMessage:value=>{response=value;}});await handle(value);resolve(response);};release=complete;if(requests>2&&!holdLater)setImmediate(complete);});}});
 win.IELTSAdaptivePlan={...win.IELTSAdaptivePlan,...adaptive};
 win.document.createTextNode=value=>{const node=win.document.createElement('span');node.textContent=String(value);return node;};
 const dashboard=win.document.createElement('section'),practice=win.document.createElement('section'),records=await f.R.list();
 const app=win.IELTSEssentialVocabularyApp.mount({document:win.document,dashboard,practice,initialRecords:records,courseDay:4,getBudget:()=>({remainingMinutes:360,exhausted:false})});assert.ok(app);
 await until(()=>dashboard.textContent,value=>value.includes('family-public-course-plan-pending'),'pending public plan');
 await until(()=>release,value=>typeof value==='function','real worker request');
 assert.match(dashboard.textContent,/family-public-course-plan-pending/);const before=audioReads;assert.ok(before>0);
 await tick();await tick();const beforeForeign=dashboard.children[0];win.dispatchEvent({type:'ielts:public-course-plan-changed',detail:{profileId:'different-profile'}});await tick();assert.equal(dashboard.children[0],beforeForeign,'another profile cannot refresh this view');assert.equal(audioReads,before);
 const prepared=adaptive.preparePublicCourse();await release();await prepared;
 await until(()=>dashboard.textContent,value=>!value.includes('family-public-course-plan-pending'),'automatic vocabulary refresh');
 assert.equal(adaptive.verifiedPublicCourseState().ready,true);const plan=app.getPlan();assert.equal(plan.familyContext.status,'ready');assert.ok(plan.newWords.some(word=>word.familyCanonicalId),'signed family words become available');const start=dashboard.querySelectorAll('button').find(button=>/^开始本组/.test(button.textContent));assert.ok(start&&!start.disabled,'the family word group can be opened');assert.equal(audioReads,before,'a current signed audio proof is reused');
 assert.equal(adaptive.read().startedDays.includes(4),false,'opening the word page must not freeze an unstarted lesson');
 await tick();await tick();let renders=0;const replace=dashboard.replaceChildren.bind(dashboard);dashboard.replaceChildren=(...items)=>{renders++;return replace(...items);};
 for(let i=0;i<3;i++)win.dispatchEvent({type:'ielts:public-course-plan-changed',detail:{profileId:'legacy'}});
 await until(()=>renders,value=>value>0,'coalesced refresh');await tick();assert.equal(renders,1,'a burst of notifications triggers one redraw');assert.equal(audioReads,before);
 // Saving a new group changes the real adaptive context and starts a second
 // public-plan job. The same click must wait for it, without losing the group.
 win.IELTSMediaLibrary={list:async()=>[]};const firstRelease=release;let openDone=false,openError;
 const opening=app.start().then(()=>{openDone=true;},error=>{openDone=true;openError=error;});
 await until(()=>({second:release!==firstRelease,openDone}),value=>value.second||value.openDone,'new-group planning');
 if(openError)throw openError;assert.notEqual(release,firstRelease,'saving the new group starts a fresh public-plan job');
 await until(()=>({pendingAccesses,openDone}),value=>value.pendingAccesses>0||value.openDone,'open while the new plan is pending');
 assert.ok(pendingAccesses>0,'real source verification observes the pending second plan');
 await tick();assert.equal(openDone,false,'the original click waits for the new plan');
 assert.doesNotMatch(practice.textContent,/签审原文、原音或授权尚未核验/);
 await release();await opening;if(openError)throw openError;
 assert.match(practice.textContent,/本组必学 6 词/,'the first click opens the real vocabulary practice');
 assert.equal(Object.values(win.IELTSMemory.read().essential.batches).filter(row=>row.status==='learning').length,1);
 // A real component click must resume audio before the first asynchronous
 // fetch and play the verified family file, not the global fallback.
 const events=[],decoded=[];win.AudioContext=class{constructor(){this.state='suspended';this.currentTime=0;this.destination={};events.push('new');}resume(){events.push('resume');this.state='running';return Promise.resolve();}decodeAudioData(bytes){events.push('decode');decoded.push(Buffer.from(bytes));return Promise.resolve({duration:1});}createBufferSource(){const context=this;return{connect(){},disconnect(){},start(){events.push('start');queueMicrotask(()=>{context.currentTime=1;this.onended?.();});},stop(){}};}close(){events.push('close');this.state='closed';return Promise.resolve();}};
 const firstBatch=Object.values(win.IELTSMemory.read().essential.batches).find(row=>row.status==='learning'),word=firstBatch.words[0],button=practice.querySelectorAll('button').find(value=>value.textContent==='听读');assert.ok(button);
 const playing=button.fire('click');assert.deepEqual(events,['new','resume']);await playing;assert.deepEqual(events,['new','resume','decode','start','close']);const pin=data.familyLessonRelease.units.find(unit=>unit.day===4).targets.find(target=>target.canonicalWord.toLowerCase()===word.word.toLowerCase()).audioRef;assert.equal(word.audio,pin.src);assert.equal(F.sha(decoded[0]),pin.sha256);assert.match(practice.textContent,/已完成听读/);
 const savedBefore=win.IELTSProfiles.storage().getItem(win.IELTSMemory.KEY),priorFetch=win.fetch;win.fetch=async(url,options)=>{const response=await priorFetch(url,options);if(String(url)!=='/'+word.audio)return response;const bytes=Buffer.from(await response.arrayBuffer());bytes[bytes.length-1]^=1;return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};events.length=0;await button.fire('click');assert.ok(!events.includes('start'));assert.match(practice.textContent,/词音或档案已变化/);assert.equal(win.IELTSProfiles.storage().getItem(win.IELTSMemory.KEY),savedBefore);win.fetch=priorFetch;
 await until(()=>adaptive.verifiedPublicCourseState().ready,value=>value,'stable public plan');await tick();await tick();
 const batchId=Object.values(win.IELTSMemory.read().essential.batches).find(row=>row.status==='learning').id,storage=win.IELTSProfiles.storage();
 let profile='legacy';win.IELTSProfiles.current=()=>({id:profile});holdLater=true;
 async function holdPlanning(marker){const previous=release,records=await f.R.list(),memory=win.IELTSMemory.read(),drafts=[...realContextual.courseContext({storage}).drafts,...win.IELTSEssentialVocabulary.activityDrafts(memory)];adaptive.adoptStarted({records,drafts,exposures:{[marker]:{count:1}}});adaptive.publicCourseState();await until(()=>release,value=>value!==previous,'held real worker');return release;}
 async function beginHeldOpen(){const beforePending=pendingAccesses;let done=false,error;const operation=app.openBatch(batchId).then(()=>{done=true;},value=>{done=true;error=value;});await until(()=>({pending:pendingAccesses>beforePending,done}),value=>value.pending||value.done,'held source check');assert.ok(pendingAccesses>beforePending);await tick();assert.equal(done,false);return{operation,error:()=>error};}
 let finish=await holdPlanning('profile-race'),held=await beginHeldOpen(),raw=storage.getItem(win.IELTSMemory.KEY);profile='other';await finish();await held.operation;assert.match(held.error()?.message||'',/档案已切换/);assert.equal(storage.getItem(win.IELTSMemory.KEY),raw,'switching owners cannot change the saved group');profile='legacy';
 finish=await holdPlanning('draft-race');held=await beginHeldOpen();const changed=win.IELTSMemory.read(),saved=changed.essential.batches[batchId];saved.updatedAt=new Date(Date.parse(saved.updatedAt)+1000).toISOString();const changedRaw=JSON.stringify(changed);storage.setItem(win.IELTSMemory.KEY,changedRaw);await finish();await held.operation;assert.match(held.error()?.message||'',/词组草稿已变化/);assert.equal(storage.getItem(win.IELTSMemory.KEY),changedRaw,'another tab’s changed group is preserved');
 const count=(handlers.get('ielts:public-course-plan-changed')||[]).length;assert.ok(count>0);app.destroy();assert.equal((handlers.get('ielts:public-course-plan-changed')||[]).length,count-1);const afterDestroy=renders;win.dispatchEvent({type:'ielts:public-course-plan-changed',detail:{profileId:'legacy'}});await tick();assert.equal(renders,afterDestroy);
});
