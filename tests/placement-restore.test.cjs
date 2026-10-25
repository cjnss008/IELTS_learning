'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createUserData,DATABASES}=require('../server/user-data.cjs'),{createDailyBackups}=require('../server/daily-backups.cjs'),{createPlacement}=require('../server/placement.cjs'),Placement=require('../assets/placement-core.js'),{responsesFor}=require('../assets/placement-app.js');
const KEY=Placement.KEY,AT='2026-10-25T00:00:00.000Z',ORIGINAL='I study English at home every evening.',PASSAGE='The library opens at seven. It is near a small park in the town centre. People can read newspapers, borrow books and use a quiet room upstairs. A local group meets there every Friday to talk about books. Visitors do not need to pay to enter the building.';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),clone=value=>JSON.parse(JSON.stringify(value));
const sourcePolicy=()=>({eligible:true,priority:0,category:'isolated-fixture',reason:'test-only',basis:{}});
function questions(){return[{id:'q1',type:'single',prompt:'When does the library open?',options:['six','seven','eight'],answer:'seven',evidence:'The library opens at seven.',explanation:'原文给出时间。'},{id:'q2',type:'single',prompt:'What is near the library?',options:['a small park','a museum','a station'],answer:'a small park',evidence:'It is near a small park in the town centre.',explanation:'原文给出地点。'},{id:'q3',type:'single',prompt:'When does the group meet?',options:['Friday','Monday','Wednesday'],answer:'Friday',evidence:'A local group meets there every Friday to talk about books.',explanation:'原文给出日期。'}];}
function curriculum(rootDir){
 const audioDir=path.join(rootDir,'audio'),auditDir=path.join(rootDir,'curriculum','independent-bank');fs.mkdirSync(audioDir);fs.mkdirSync(auditDir,{recursive:true});
 const materials=['A1','A2','B1','B2'].map(level=>{const audio='audio/'+level+'.mp3',bytes=Buffer.alloc(1024,1);fs.writeFileSync(path.join(rootDir,audio),bytes);const material={id:'restore-source-'+level,title:level+' library',skill:'listening',pool:'independent',level,transcript:PASSAGE,audio,audioSynthetic:true,audioDurationSeconds:15,questions:questions().map(q=>({...q,answers:[q.answer]})),source:{verification:'reviewed',contentHashFields:['title','transcript','questions']}};material.source.contentHash=hash(JSON.stringify(Object.fromEntries(material.source.contentHashFields.map(key=>[key,material[key]]))));return material;});
 fs.writeFileSync(path.join(auditDir,'audio-audit.json'),JSON.stringify({items:materials.map(material=>({id:material.id,audio:material.audio,bytes:1024,audioHash:hash(fs.readFileSync(path.join(rootDir,material.audio))),transcriptHash:hash(material.transcript)}))}));
 return{days:[1,8,57,99,141].map(day=>({day,week:Math.ceil(day/7),title:'Isolated restore course '+day})),materials};
}
function writingFixture(input,response){
 const criteria=input.writingScale.criteria.map(definition=>{
  const notElicited=['relevant_support','extended_organisation'].includes(definition.id),insufficient=['simple_linking','linear_progression'].includes(definition.id);
  return{id:definition.id,applicability:notElicited?'not_elicited':'applicable',status:notElicited?'not_applicable':insufficient?'insufficient_evidence':'met',issueType:insufficient?'sample_insufficient':null,evidence:notElicited?[]:[{quote:response.text,comment:insufficient?'本稿只有一条日常陈述，尚无多句连接或信息推进样本。':'本稿单句实际传递了清楚的日常学习信息。'}],links:[],comment:notElicited?'本题未要求理由展开或长文组织，不据此降级。':insufficient?'仅记录当前短稿的采样不足，不推断学习者不会。':'隔离模拟评阅当前单句，不代表真实能力标定。'};
 });
 return{criteria,levelBasis:{supportingCriterionIds:criteria.filter(criterion=>criterion.status==='met').map(criterion=>criterion.id),limitingCriterionIds:[],uncertainCriterionIds:criteria.filter(criterion=>criterion.status==='insufficient_evidence').map(criterion=>criterion.id)}};
}
async function runAI(messages,{round=1}={}){
 const input=JSON.parse(messages[1].content);let value;
 if(input.listeningSources)value={listening:input.listeningSources.map(source=>({taskId:source.taskId,questions:questions()})),reading:['A1','A2','B1','B2'].map(level=>({taskId:'read-'+level.toLowerCase(),level,title:level+' reading',passage:PASSAGE,questions:questions()})),writing:{prompt:'Describe your usual day.',instructions:'按真实能力写。'},speaking:{prompt:'Describe your home.',instructions:'按真实能力回答。'}};
 else if(input.responses)value={skills:['listening','reading','writing','speaking'].map(skill=>{const response=input.responses.find(item=>item.taskId===skill),task=input.tasks.find(item=>item.skill===skill),explicit=response?.unanswered===true;return{skill,level:skill==='writing'&&!explicit?'A1':'A0',confidence:'low',evidence:[{taskId:task.taskId,quote:explicit?'[explicit-unanswered]':skill==='writing'?response.text:'The library opens at seven.',comment:'隔离恢复回归证据。'}],...(skill==='writing'&&!explicit?writingFixture(input,response):{}),gaps:[]};}),summary:'Isolated restore evaluation.'};
 else value={checks:input.tasks.flatMap(task=>task.questions.map(question=>({taskId:task.taskId,questionId:question.id,supported:true,uniqueAnswer:true,plausibleDistractors:true,selfContainedEvidence:true,comment:'隔离审题回归。'})))};
 return{content:JSON.stringify(value),reviewer:{model:'isolated-model',providerHost:'fixture.invalid',round}};
}
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-placement-restore-')),rootDir=path.join(dir,'app'),dataDir=path.join(dir,'isolated-data');fs.mkdirSync(rootDir);let time=AT;const data=curriculum(rootDir),options={rootDir,dataDir,migrateLegacy:false,now:()=>new Date(time)};let userData=createUserData(options),placement=createPlacement({rootDir,userData,curriculum:data,evidenceStore:{get:()=>null},sourcePolicy,now:options.now}),backups=createDailyBackups({userData,now:options.now});
 t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('ielts-placement-restore-'));fs.rmSync(dir,{recursive:true,force:true});});
 const empty={schemaVersion:1,profile:{id:'legacy',name:'Isolated restore profile',createdAt:AT},entries:{},session:{},databases:Object.entries(DATABASES).map(([name,store])=>({name,stores:[{name:store,rows:[]}]}))};await userData.putSnapshot('legacy',{expectedRevision:0,snapshot:empty,activate:true});
 const memory=new Map(),store=Placement.createStore({storage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},now:()=>time});
 async function generated(){const result=await placement.generate({profileId:'legacy'},runAI),session=store.add(result.assessment),answers=Object.fromEntries(session.assessment.tasks.map(task=>[task.id,task.questions?{skipped:true}:task.skill==='writing'?{text:ORIGINAL}:{unanswered:true}]));store.update(session.id,{answers},session.revision);return result.assessment;}
 async function commit(state=store.load(),extra=()=>{}){const previous=await userData.getSnapshot('legacy'),snapshot=clone(previous.snapshot);snapshot.entries[KEY]=JSON.stringify(state);extra(snapshot);await userData.putSnapshot('legacy',{expectedRevision:previous.revision,expectedResetEpoch:previous.resetEpoch,snapshot});return snapshot;}
 function restart(){userData=createUserData(options);placement=createPlacement({rootDir,userData,curriculum:data,evidenceStore:{get:()=>null},sourcePolicy,now:options.now});backups=createDailyBackups({userData,now:options.now});}
 return{dir,rootDir,dataDir,data,store,generated,commit,restart,setTime:value=>{time=value;},get userData(){return userData;},get placement(){return placement;},get backups(){return backups;}};
}

test('a genuine complete backup restores an unfinished placement with its original writing and audio and permits continuation',async t=>{
 const f=await fixture(t),assessment=await f.generated(),audio=Buffer.from('isolated original audio bytes'),audioSha=hash(audio);await f.userData.putBlob(audioSha,audio,'audio/wav');
 const source=await f.commit(undefined,snapshot=>snapshot.databases.find(db=>db.name==='ielts-media-v1').stores[0].rows.push({key:'work-restore-original',value:{id:'work-restore-original',blob:{__ieltsBlob:{sha256:audioSha,mime:'audio/wav',size:audio.length}}}}));
 await f.backups.create({dayKey:'2026-10-25'});await f.backups.restore('2026-10-25');f.restart();
 const snapshot=(await f.userData.getSnapshot('legacy')).snapshot,state=JSON.parse(snapshot.entries[KEY]);assert.equal(state.sessions[0].answers.writing.text,ORIGINAL);assert.equal(f.userData.getBlob(audioSha).equals(audio),true);assert.deepEqual((await f.placement.get('legacy',assessment.id)).assessment,assessment);
 const completed=await f.placement.evaluate({profileId:'legacy',assessmentId:assessment.id,responses:responsesFor(state.sessions[0])},runAI);assert.equal(completed.complete,true);assert.equal(completed.recommendation.day,1);assert.equal((await f.placement.get('legacy',assessment.id)).responses.find(response=>response.taskId==='writing').text,ORIGINAL);
 const proof=fs.readFileSync(path.join(f.dataDir,'config','placement-restore-bindings.json'),'utf8');assert.ok(!proof.includes(ORIGINAL));assert.ok(!proof.includes(PASSAGE));assert.ok(Buffer.byteLength(proof)<=2*1024*1024);assert.equal(source.profile.createdAt,snapshot.profile.createdAt);
});

test('repeated full restores before the first private-record rebind retain the same unfinished assessment',async t=>{
 const f=await fixture(t),assessment=await f.generated();await f.commit();await f.backups.create({dayKey:'2026-10-25'});await f.backups.restore('2026-10-25');f.restart();
 f.setTime('2026-10-26T00:00:00.000Z');await f.backups.create({dayKey:'2026-10-26'});await f.backups.restore('2026-10-26');f.restart();assert.equal((await f.placement.get('legacy',assessment.id)).assessment.id,assessment.id);const state=JSON.parse((await f.userData.getSnapshot('legacy')).snapshot.entries[KEY]);assert.equal((await f.placement.evaluate({profileId:'legacy',assessmentId:assessment.id,responses:responsesFor(state.sessions[0])},runAI)).complete,true);
});

test('a backup captured during slow AI evaluation retains raw answers and a restored attempt can retry without the abandoned lease',async t=>{
 const f=await fixture(t),assessment=await f.generated();f.store.update(assessment.id,{status:'evaluating'},2);await f.commit();let release,entered;const holding=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),request={profileId:'legacy',assessmentId:assessment.id,responses:responsesFor(f.store.load().sessions[0])};
 const pending=f.placement.evaluate(request,async()=>{entered();await holding;throw Error('isolated upstream interruption');});await started;await assert.rejects(f.placement.evaluate(request,runAI),error=>error.code==='PLACEMENT_BUSY');await f.backups.create({dayKey:'2026-10-25'});release();const failed=await pending;assert.equal(failed.complete,false);await f.backups.restore('2026-10-25');f.restart();
 const original=await f.placement.get('legacy',assessment.id);assert.equal(original.responses.find(response=>response.taskId==='writing').text,ORIGINAL);const retried=await f.placement.evaluate(request,runAI);assert.equal(retried.complete,true);const doc=JSON.parse(fs.readFileSync(path.join(f.dataDir,'config','placement','legacy',assessment.id+'.json'),'utf8'));assert.equal(doc.attempts.length,2);assert.equal(doc.attempts[0].rawResponses.find(response=>response.taskId==='writing').text,ORIGINAL);
});

test('reset and a forged client restore marker cannot revive either an unfinished or completed assessment',async t=>{
 for(const complete of [false,true])await t.test(complete?'complete':'draft',async t=>{
  const f=await fixture(t),assessment=await f.generated();if(complete){const result=await f.placement.evaluate({profileId:'legacy',assessmentId:assessment.id,responses:responsesFor(f.store.load().sessions[0])},runAI);f.store.update(assessment.id,{status:'complete',report:result},2);}const saved=await f.commit(),before=await f.userData.getSnapshot('legacy'),reset=await f.userData.resetProfile('legacy',before.revision);await assert.rejects(f.placement.get('legacy',assessment.id),error=>error.code==='PLACEMENT_PROFILE_RESET');saved.entries['ielts52-data-generation-v1']='restore:'+reset.resetEpoch;await f.userData.putSnapshot('legacy',{expectedRevision:reset.revision,expectedResetEpoch:reset.resetEpoch,snapshot:saved});
  await assert.rejects(f.placement.get('legacy',assessment.id),error=>error.code==='PLACEMENT_PROFILE_RESET');await assert.rejects(f.placement.evaluate({profileId:'legacy',assessmentId:assessment.id,responses:responsesFor(f.store.load().sessions[0])},runAI),error=>error.code==='PLACEMENT_PROFILE_RESET');
 });
});

test('a real full backup never grants a private assessment absent from or changed in its saved browser snapshot',async t=>{
 for(const mode of ['absent','changed-assessment','different-profile-identity'])await t.test(mode,async t=>{
  const f=await fixture(t),assessment=await f.generated(),state=f.store.load();if(mode==='absent')state.sessions=[];if(mode==='changed-assessment')state.sessions[0].assessment.tasks.find(task=>task.id==='writing').prompt='A changed task not issued by the private assessment.';await f.commit(state);
  if(mode==='different-profile-identity'){const file=path.join(f.dataDir,'config','placement','legacy',assessment.id+'.json'),doc=JSON.parse(fs.readFileSync(file));doc.profileCreatedAt='2026-10-24T00:00:00.000Z';fs.writeFileSync(file,JSON.stringify(doc));}
  await f.backups.create({dayKey:'2026-10-25'});await f.backups.restore('2026-10-25');f.restart();await assert.rejects(f.placement.get('legacy',assessment.id),error=>['PLACEMENT_PROFILE_RESET','PLACEMENT_PROFILE_CHANGED'].includes(error.code));
 });
});

test('restoring a backup made after reset cannot authorize an old private record injected into its snapshot',async t=>{
 const f=await fixture(t),assessment=await f.generated(),saved=await f.commit(),before=await f.userData.getSnapshot('legacy'),reset=await f.userData.resetProfile('legacy',before.revision);saved.entries['ielts52-data-generation-v1']='restore:'+reset.resetEpoch;await f.userData.putSnapshot('legacy',{expectedRevision:reset.revision,expectedResetEpoch:reset.resetEpoch,snapshot:saved});await f.backups.create({dayKey:'2026-10-25'});await f.backups.restore('2026-10-25');f.restart();await assert.rejects(f.placement.get('legacy',assessment.id),error=>error.code==='PLACEMENT_PROFILE_RESET');
});

test('a restored completed assessment remains readable but cannot be reevaluated through a draft-only restore grant',async t=>{
 const f=await fixture(t),assessment=await f.generated(),responses=responsesFor(f.store.load().sessions[0]),report=await f.placement.evaluate({profileId:'legacy',assessmentId:assessment.id,responses},runAI);f.store.update(assessment.id,{status:'complete',report},2);await f.commit();await f.backups.create({dayKey:'2026-10-25'});await f.backups.restore('2026-10-25');f.restart();assert.deepEqual((await f.placement.get('legacy',assessment.id)).report,clone(report));await assert.rejects(f.placement.evaluate({profileId:'legacy',assessmentId:assessment.id,responses},runAI),error=>error.code==='PLACEMENT_PROFILE_RESET');
});

test('an older genuine restore grant cannot cross a later reset even if the same draft is injected into another full backup',async t=>{
 const f=await fixture(t),assessment=await f.generated();await f.commit();await f.backups.create({dayKey:'2026-10-25'});await f.backups.restore('2026-10-25');f.restart();const before=await f.userData.getSnapshot('legacy'),saved=clone(before.snapshot),reset=await f.userData.resetProfile('legacy',before.revision);saved.entries['ielts52-data-generation-v1']='restore:'+reset.resetEpoch;await f.userData.putSnapshot('legacy',{expectedRevision:reset.revision,expectedResetEpoch:reset.resetEpoch,snapshot:saved});f.setTime('2026-10-26T00:00:00.000Z');await f.backups.create({dayKey:'2026-10-26'});await f.backups.restore('2026-10-26');f.restart();await assert.rejects(f.placement.get('legacy',assessment.id),error=>error.code==='PLACEMENT_PROFILE_RESET');
});

test('an oversized private restore-binding file fails before replacing the live profile',async t=>{
 const f=await fixture(t);await f.generated();await f.commit();const file=path.join(f.dataDir,'config','placement-restore-bindings.json');fs.writeFileSync(file,JSON.stringify({schemaVersion:1,bindings:[],padding:'x'.repeat(2*1024*1024)}));await f.backups.create({dayKey:'2026-10-25'});const before=await f.userData.getSnapshot('legacy');await assert.rejects(f.backups.restore('2026-10-25'));const after=await f.userData.getSnapshot('legacy');assert.equal(after.revision,before.revision);assert.deepEqual(after.snapshot,before.snapshot);assert.equal(fs.existsSync(f.backups.paths.restoreMarker),false);
});
