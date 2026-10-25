'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const P=global.IELTSPlacement=require('../assets/placement-core.js'),B=require('../assets/backup-core.js'),U=require('../assets/user-data-store.js'),R=require('../assets/profile-reset.js');
const {createUserData,DATABASES}=require('../server/user-data.cjs'),{createDailyBackups}=require('../server/daily-backups.cjs');
const KEY='ielts52-placement-v1',AT='2026-10-25T00:00:00.000Z',ID='placement-12345678-1234-1234-1234-123456789abc';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),memory=data=>({getItem:key=>data[key]??null,setItem:(key,value)=>{data[key]=String(value);},removeItem:key=>{delete data[key];}});
function session(id=ID){return{id,createdAt:AT,updatedAt:AT,status:'draft',assessment:{id,profileId:'legacy',createdAt:AT,status:'ready',tasks:['listening','reading','writing','speaking'].map(skill=>({id:skill,skill,title:skill,prompt:'Isolated storage fixture.',task:'foundation',instructions:'Save your own answer.'}))},answers:{},report:null};}
function state(id=ID){return{version:1,sessions:[session(id)],adopted:null};}
function finished(){const value=state(),s=value.sessions[0],objective=()=>({level:'A2',confidence:'low',evidence:[{taskId:'read-a1',quote:'My day starts early.',comment:'原始作答依据'}],gaps:[],verified:true,verification:'objective'});s.status='complete';s.answers={writing:'I learn English.',speaking:{transcript:'I learn English.'}};s.report={ok:true,assessmentId:ID,complete:true,status:'complete',provisional:true,skills:{listening:objective(),reading:objective(),writing:{level:'A1',confidence:'low',evidence:[{taskId:'writing',quote:'I learn English.',comment:'真实原稿引文'}],gaps:[],verified:true,verification:'text'},speaking:{level:'A1',confidence:'low',evidence:[{taskId:'speaking',quote:'I learn English.',comment:'原稿与有限朗读证据'}],gaps:['自由表达音频仍待验证'],verified:false,verification:'limited',provisional:true}},recommendation:{day:8,week:2,level:'A1',reason:'四项保守最低阶段',gaps:[]},rounds:[],disclaimer:'非正式 Band'};value.adopted={sessionId:ID,adoptedAt:AT};return value;}
function snapshot(value=state(),id='legacy'){return{schemaVersion:1,profile:{id,name:'隔离测评档案',createdAt:AT},entries:{[KEY]:JSON.stringify(value)},session:{},databases:Object.entries(DATABASES).map(([name,store])=>({name,stores:[{name:store,rows:[]}]}))};}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-placement-storage-')),rootDir=path.join(dir,'app'),dataDir=path.join(dir,'isolated-data');fs.mkdirSync(rootDir);const options={rootDir,dataDir,migrateLegacy:false,now:()=>new Date(AT)},userData=createUserData(options),backups=createDailyBackups({userData,now:options.now});t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return{dir,rootDir,dataDir,options,userData,backups};}

test('placement is registered for folder, text backups and reset without admitting configuration keys',()=>{
 assert.equal(P.KEY,KEY);assert.ok(Object.hasOwn(B.KEYS,KEY));assert.ok(U.KEYS.includes(KEY));assert.ok(R.clearKeys(B.KEYS).includes(KEY));
 assert.equal(U.meaningful(snapshot({version:1,sessions:[],adopted:null})),false);assert.equal(U.meaningful(snapshot()),true);
 assert.deepEqual(B.validate(KEY,JSON.stringify(state())),P.parseState(state()));assert.throws(()=>B.validate(KEY,'{"version":999,"sessions":[],"adopted":null}'));
 const input=snapshot();input.entries['ai-api-key']='isolated-unknown-field';assert.throws(()=>U.validateSnapshot(input),/未知文字模块或配置/);
});

test('placement text restore merges independent sessions and refuses changed answers, reports or adopted routes',()=>{
 const original=finished(),raw=JSON.stringify(original),data={[KEY]:raw},storage=memory(data),newSession=state('placement-22345678-1234-1234-1234-123456789abc');
 const parsed=B.parseBundle({app:'ielts52-backup',schemaVersion:1,entries:{[KEY]:JSON.stringify(newSession)}});B.restore(storage,parsed,[KEY]);
 const merged=JSON.parse(data[KEY]);assert.equal(merged.sessions.length,2);assert.deepEqual(merged.adopted,original.adopted);assert.deepEqual(merged.sessions[0].report,original.sessions[0].report);
 const stable=data[KEY];B.restore(storage,{[KEY]:raw},[KEY]);assert.equal(data[KEY],stable,'repeated import is idempotent');
 for(const change of [value=>{value.sessions[0].answers.writing='Different original answer.';},value=>{value.sessions[0].report.recommendation.reason='Another recommendation reason.';},value=>{value.adopted.adoptedAt='2026-10-26T00:00:00.000Z';}]){const conflict=structuredClone(original);change(conflict);assert.throws(()=>B.restore(storage,{[KEY]:JSON.stringify(conflict)},[KEY]),/不同|无效/);assert.equal(data[KEY],stable);}
});

test('legacy local recovery points include placement-only learning, clear it and restore its original evidence',async()=>{
 const data={[KEY]:JSON.stringify(finished()),configuration:'isolated-config-sentinel'},saved=new Map(),archive={put:async point=>saved.set(point.id,structuredClone(point)),list:async()=>[...saved.values()],get:async id=>saved.get(id),remove:async id=>saved.delete(id)};
 const service=R.createService({storage:memory(data),keys:{[KEY]:B.KEYS[KEY]},databases:[],archive,profileId:'legacy',validateEntry:B.validate,clock:()=>new Date(AT)});
 const automatic=await service.autoBackup();assert.ok(automatic);assert.equal(automatic.entries[KEY],data[KEY]);const original=data[KEY],before=await service.reset();assert.equal(data[KEY],undefined);assert.equal(data.configuration,'isolated-config-sentinel');await service.restore(before.id);assert.equal(data[KEY],original);assert.equal(data.configuration,'isolated-config-sentinel');
});

test('an old service missing only placement is blocked before upload, then retains the exact draft after service upgrade',async()=>{
 const source=snapshot(),values=new Map([['legacy',structuredClone(source)]]),commits=[];let upgraded=false,meta=null;
 const remoteStatus=U.createRemote({fetch:async()=>new Response(JSON.stringify({ok:true,persistenceProtocol:2,supportedEntryKeys:U.KEYS.filter(key=>upgraded||key!==KEY),path:'isolated-test-folder',profiles:[],activeProfileId:null}),{status:200})});
 const bridge=U.createBridge({local:{listProfiles:async()=>[source.profile],readProfile:async id=>structuredClone(values.get(id)),writeProfile:async value=>values.set(value.profile.id,structuredClone(value)),activeProfileId:async()=>'legacy',restoreRegistry:async()=>{}},remote:{status:remoteStatus.status,getSnapshot:async()=>({ok:true,revision:0,snapshot:null}),putSnapshot:async(id,body)=>{commits.push(structuredClone(body));return{ok:true,revision:1,sha256:sha(JSON.stringify(body.snapshot))};}},metadata:{read:()=>structuredClone(meta),write:value=>{meta=structuredClone(value);}},crypto:crypto.webcrypto});
 const first=await bridge.initialise();assert.equal(first.errorCode,'USER_DATA_SERVICE_UPGRADE');assert.equal(commits.length,0);assert.deepEqual(values.get('legacy'),source);await assert.rejects(bridge.syncNow(),error=>error.code==='USER_DATA_SERVICE_UPGRADE');assert.equal(commits.length,0);upgraded=true;await bridge.syncNow();assert.equal(commits.length,1);assert.equal(commits[0].snapshot.entries[KEY],source.entries[KEY]);bridge.stop();
});

test('isolated NAS snapshots and complete daily backups retain placement, original audio and server-private assessment data across reset and restore',async t=>{
 const f=fixture(t),source=snapshot(finished()),bytes=Buffer.from('isolated original placement audio'),audioSha=sha(bytes),media=source.databases.find(db=>db.name==='ielts-media-v1');
 await f.userData.putBlob(audioSha,bytes,'audio/webm');media.stores[0].rows.push({key:'work-placement-fixture',value:{id:'work-placement-fixture',blob:{__ieltsBlob:{sha256:audioSha,mime:'audio/webm',size:bytes.length}}}});source.entries['ielts40-translation-visible']='false';
 await f.userData.putSnapshot('legacy',{expectedRevision:0,snapshot:source,activate:true});assert.ok(f.userData.status().supportedEntryKeys.includes(KEY));
 const other=snapshot(state('placement-32345678-1234-1234-1234-123456789abc'),'p-other-profile-1234');await f.userData.putSnapshot(other.profile.id,{expectedRevision:0,snapshot:other});
 const privateDir=path.join(f.dataDir,'config','placement');fs.mkdirSync(privateDir,{recursive:true});const privateFile=path.join(privateDir,'isolated-assessment.json'),config=path.join(f.dataDir,'config','preserved-settings.json');fs.writeFileSync(privateFile,'{"fixture":"private assessment evidence"}');fs.writeFileSync(config,'{"fixture":"configuration before reset"}');
 const created=await f.backups.create({dayKey:'2026-10-25',profileId:'legacy',completionId:'isolated-placement-complete'});assert.equal(created.ok,true);
 const cleared=await f.userData.resetProfile('legacy',1);assert.equal(cleared.snapshot.entries[KEY],undefined);assert.equal(cleared.snapshot.entries['ielts40-translation-visible'],'false');assert.ok(cleared.snapshot.databases.every(db=>db.stores.every(store=>store.rows.length===0)));assert.equal(fs.readFileSync(config,'utf8'),'{"fixture":"configuration before reset"}');assert.equal((await f.userData.getSnapshot(other.profile.id)).snapshot.entries[KEY],other.entries[KEY]);assert.equal((await f.userData.getSnapshot('legacy',1)).snapshot.entries[KEY],source.entries[KEY]);
 await assert.rejects(f.userData.putSnapshot('legacy',{expectedRevision:cleared.revision,snapshot:source}),error=>error.code==='USER_DATA_RESET_REQUIRED');fs.writeFileSync(privateFile,'{"fixture":"later private evidence"}');
 const restored=await f.backups.restore('2026-10-25');assert.equal(restored.ok,true);assert.equal(restored.requiresRestart,true);const restarted=createUserData(f.options),saved=await restarted.getSnapshot('legacy');assert.equal(saved.snapshot.entries[KEY],source.entries[KEY]);assert.ok(saved.resetEpoch&&saved.resetEpoch!==cleared.resetEpoch);assert.equal(restarted.getBlob(audioSha).equals(bytes),true);assert.equal(fs.readFileSync(privateFile,'utf8'),'{"fixture":"private assessment evidence"}');assert.equal(fs.readFileSync(config,'utf8'),'{"fixture":"configuration before reset"}');
});

test('backup center loads the placement validator before restore and snapshots react to assessment changes',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../备份中心.html'),'utf8');assert.ok(html.indexOf('assets/placement-core.js')>=0);assert.ok(html.indexOf('assets/placement-core.js')<html.indexOf('assets/backup-core.js'));
 const reset=fs.readFileSync(path.join(__dirname,'../assets/profile-reset.js'),'utf8');assert.match(reset,/addEventListener\('ielts:placement-changed',scheduleAuto\)/);
});
