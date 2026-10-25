'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto').webcrypto,fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),D=require('../assets/daily-backups.js');
const sha='a'.repeat(64),otherSha='b'.repeat(64),copy=structuredClone,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function storage(){const data=new Map(),calls=[];return{data,calls,getItem:key=>{calls.push(['get',key]);return data.get(key)??null;},setItem:(key,value)=>{calls.push(['set',key]);data.set(key,String(value));},removeItem:key=>{calls.push(['remove',key]);data.delete(key);}};}
function row(dayKey='2026-10-24',hash=sha){return{id:dayKey,dayKey,profileId:'legacy',completionId:null,createdAt:dayKey+'T16:00:00.000Z',fileCount:12,totalBytes:1024,sha256:hash,contentSha256:hash};}
function complete(courseDay=1,version=1){return{currentComplete:true,courseDay,token:'verified-mistake-completion-'+courseDay,records:[{id:'record-'+courseDay,dayNumber:courseDay,version,submittedAt:'2026-10-25T09:00:00.000Z',evaluation:{result:'pass'}}]};}
function fixture(t,options={}){
 const local=options.storage||storage(),ctx={profileId:'legacy',path:'D:/isolated-user-data',resetEpoch:null,generation:'verified-generation'},requests=[],states=[],backups=options.backups||[],uState={state:'ready',pendingProfiles:[],conflicts:[]};let reloads=0,confirms=0,before=0;
 const userData={syncNow:async()=>{requests.push(['sync']);return copy(uState);},status:()=>copy(uState)};
 const remote={list:async()=>{requests.push(['list']);return{ok:true,backups:copy(backups),retentionDays:30,serverDayKey:'2026-10-25'};},create:async body=>{requests.push(['create',copy(body)]);const next={...row(body.dayKey),profileId:body.profileId,completionId:body.completionId};backups.splice(0,backups.length,next,...backups.filter(v=>v.dayKey!==next.dayKey));return{ok:true,backup:copy(next),retained:true};},restore:async body=>{requests.push(['restore',copy(body)]);return{ok:true,requiresRestart:true,automaticRestart:true,serviceInstanceId:'old-service'};},health:async()=>{requests.push(['health']);return{ok:true,serviceInstanceId:requests.some(v=>v[0]==='restore')?'new-service':'old-service',restoringBackup:false,serverDayKey:'2026-10-25'};}};
 const api=D.createService({storage:local,context:()=>copy(ctx),userData,remote,crypto,clock:()=>new Date('2026-10-25T10:00:00Z'),confirm:async()=>{confirms++;return true;},beforeRestore:()=>{before++;},reload:()=>{reloads++;},notify:s=>states.push(s),debounceMs:60000,retryBaseMs:1,retryMaxMs:2,pollMs:1,reconnectTimeoutMs:30,reconnectRetryMs:60000,...options});t.after(()=>api.stop());return{api,storage:local,ctx,userData,uState,remote,requests,states,backups,get reloads(){return reloads;},get confirms(){return confirms;},get before(){return before;}};
}
function queued(f){return JSON.parse(f.storage.data.get(D.QUEUE+':profile:legacy'));}

test('only the verified learning queue completion can enqueue a daily backup',async t=>{
 const f=fixture(t);for(const value of [null,{},complete(0),complete(366),{...complete(),currentComplete:false},{...complete(),currentComplete:undefined}])assert.equal((await f.api.observeCompletion(value)).queued,false);assert.equal(f.storage.calls.length,0);assert.equal(f.requests.length,0);await f.api.observeCompletion(complete());assert.equal(queued(f).pending.length,1);assert.match(queued(f).pending[0].completionId,/^course-1:[a-f0-9]{64}$/);assert.deepEqual(f.requests.map(v=>v[0]),['health'],'fresh server calendar is read once after queuing');
});

test('the same verified completion is backed up once across page loads while later courses and revisions update the same day',async t=>{
 const f=fixture(t);await f.api.observeCompletion(complete());await f.api.run();assert.deepEqual(f.requests.map(v=>v[0]),['health','sync','create']);assert.equal(f.backups.length,1);assert.equal(f.backups[0].dayKey,'2026-10-25');assert.equal(queued(f).pending.length,0);const next=fixture(t,{storage:f.storage});await next.api.observeCompletion(complete());await next.api.run();assert.equal(next.requests.length,0,'durable acknowledgement suppresses repeated renders and new pages');await next.api.observeCompletion(complete(2));await next.api.run();assert.equal(next.backups.length,1);assert.match(next.backups[0].completionId,/^course-2:/);const firstId=next.backups[0].completionId;await next.api.observeCompletion(complete(2,2));await next.api.run();assert.notEqual(next.backups[0].completionId,firstId);assert.equal(next.backups.length,1);
});

test('temporary NAS failures leave a durable pending request that a new page can finish exactly once',async t=>{
 const f=fixture(t);await f.api.observeCompletion(complete());f.remote.create=async()=>{throw Object.assign(Error('NAS busy'),{code:'DAILY_BACKUP_BUSY',status:423});};await assert.rejects(f.api.run(),/NAS busy/);assert.equal(queued(f).pending.length,1);assert.equal(f.api.status().state,'error');f.api.stop();const next=fixture(t,{storage:f.storage});await next.api.start();await next.api.run();assert.equal(queued(next).pending.length,0);assert.equal(next.requests.filter(v=>v[0]==='create').length,1);assert.equal(next.api.status().state,'saved');
});

test('background retries recover without manual action and never acknowledge a failed or unverifiable backup',async t=>{
 const f=fixture(t,{debounceMs:1});const create=f.remote.create;let attempts=0;f.remote.create=async body=>{attempts++;if(attempts<3)throw Object.assign(Error('NAS changed during capture'),{code:'DAILY_BACKUP_CHANGED',status:409});return create(body);};await f.api.observeCompletion(complete());const deadline=Date.now()+1000;while(f.api.status().state!=='saved'&&Date.now()<deadline)await wait(2);assert.equal(attempts,3);assert.equal(queued(f).pending.length,0);assert.ok(f.states.some(v=>v.state==='error'));assert.equal(f.api.status().error,null);
 const invalid=fixture(t);await invalid.api.observeCompletion(complete());invalid.remote.create=async()=>({ok:true,backup:{dayKey:'2026-10-25',sha256:'invalid'}});await assert.rejects(invalid.api.run(),e=>e.code==='DAILY_BACKUP_RESPONSE');assert.equal(queued(invalid).pending.length,1);assert.equal(Object.keys(queued(invalid).completed).length,0);
});

test('pending saves prevent a completed-backup claim until the current browser draft reaches disk',async t=>{
 const f=fixture(t);f.uState.pendingProfiles=['legacy'];await f.api.observeCompletion(complete());await assert.rejects(f.api.run(),e=>e.code==='DAILY_BACKUP_PENDING');assert.equal(f.requests.filter(v=>v[0]==='sync').length,3);assert.equal(f.requests.some(v=>v[0]==='create'),false);assert.equal(queued(f).pending.length,1);assert.equal(f.api.status().error,null);f.uState.pendingProfiles=[];await f.api.run();assert.equal(queued(f).pending.length,0);
});

test('coalesced saves preserve a newer same-day completion that arrives during backup creation',async t=>{
 const f=fixture(t);await f.api.observeCompletion(complete());let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve),create=f.remote.create;let first=true;f.remote.create=async body=>{if(first){first=false;enter();await gate;}return create(body);};const saving=f.api.run();await entered;const joined=Array.from({length:20},()=>f.api.run());assert.ok(joined.every(p=>p===saving));await f.api.observeCompletion(complete(2));release();await Promise.all([saving,...joined]);assert.equal(f.requests.filter(v=>v[0]==='create').length,2);assert.equal(f.backups.length,1);assert.match(f.backups[0].completionId,/course-2:/);assert.equal(queued(f).pending.length,0);
});

test('reset, restore, folder and profile identity fences discard stale queue requests without touching the NAS',async t=>{
 for(const change of [{resetEpoch:'new-reset'},{generation:'new-hydration'},{path:'E:/other-user-data'},{profileId:'p-other123'}]){const f=fixture(t);await f.api.observeCompletion(complete());f.requests.length=0;Object.assign(f.ctx,change);await assert.rejects(f.api.run(),e=>e.code==='DAILY_BACKUP_STALE');assert.equal(f.requests.length,0);if(!change.profileId){f.api.stop();const newContext=copy(f.ctx),next=fixture(t,{storage:f.storage,context:()=>newContext});await next.api.start();await next.api.run();assert.equal(next.requests.length,0);assert.equal(queued(next).pending.length,0);}}
});

test('preview never reads formal control metadata or calls sync, backup, restore, listing or health services',async t=>{
 let calls=0;const forbidden=new Proxy({},{get:()=>()=>{calls++;throw Error('formal access');}}),f=fixture(t,{preview:true,storage:forbidden,remote:forbidden,userData:forbidden,context:()=>{calls++;throw Error('formal context');}});await f.api.start();await f.api.observeCompletion(complete());await f.api.run();await f.api.refresh();await f.api.requestManual();await f.api.retry();await assert.rejects(f.api.restore(row()),e=>e.code==='DAILY_BACKUP_PREVIEW');assert.equal(calls,0);
});

test('manual backup is explicit full capture and does not invent a verified course completion',async t=>{
 const f=fixture(t);await f.api.requestManual();assert.equal(f.backups.length,1);assert.equal(f.requests.find(v=>v[0]==='create')[1].completionId,null);assert.equal(Object.keys(queued(f).completed).length,0);assert.equal(f.api.status().state,'saved');
});

test('restore confirmation names all profiles and AI/audio configuration, then syncs without replacing today target backup',async t=>{
 let message,label;const selected=row('2026-10-25'),f=fixture(t,{backups:[selected],confirm:async(m,l)=>{message=m;label=l;return true;}});await f.api.restore(selected);assert.match(message,/所有学习档案/);assert.match(message,/录音/);assert.match(message,/AI／语音配置/);assert.equal(label,'确认完整恢复');assert.equal(f.requests.some(v=>v[0]==='create'),false,'pre-restore daily capture would overwrite today target');assert.ok(f.requests.findIndex(v=>v[0]==='sync')<f.requests.findIndex(v=>v[0]==='restore'));assert.deepEqual(f.requests.find(v=>v[0]==='restore')[1],{dayKey:selected.dayKey,expectedManifestSha256:selected.sha256});assert.equal(f.before,1);assert.equal(f.reloads,1);assert.equal(f.storage.data.has(D.RESTORE),false);
});

test('cancelled restore performs no sync, POST, restart polling or page reload',async t=>{
 const selected=row(),f=fixture(t,{backups:[selected],confirm:async()=>false});assert.deepEqual(await f.api.restore(selected),{cancelled:true});assert.deepEqual(f.requests.map(v=>v[0]),['list']);assert.equal(f.reloads,0);assert.equal(f.before,0);
});

test('a changed selected manifest after confirmation stops restore before replacing any files',async t=>{
 const selected=row(),f=fixture(t,{backups:[selected]});f.userData.syncNow=async()=>{f.backups[0]={...selected,sha256:otherSha};};await assert.rejects(f.api.restore(selected),e=>e.code==='DAILY_BACKUP_CONFLICT');assert.equal(f.requests.some(v=>v[0]==='restore'),false);assert.equal(f.reloads,0);assert.equal(f.storage.data.has(D.RESTORE),false);
});

test('unresolved local conflicts block destructive restore and do not claim a backup was made',async t=>{
 const selected=row(),f=fixture(t,{backups:[selected]});f.userData.syncNow=async()=>{throw Object.assign(Error('Resolve the browser conflict first'),{code:'USER_DATA_CONFLICT'});};await assert.rejects(f.api.restore(selected),e=>e.code==='USER_DATA_CONFLICT');assert.equal(f.requests.some(v=>['restore','create'].includes(v[0])),false);assert.equal(f.reloads,0);assert.equal(f.storage.data.has(D.RESTORE),false);
});

test('restore waits for a different healthy service instance, tolerates brief outages, and never reissues POST',async t=>{
 const selected=row(),f=fixture(t,{backups:[selected]});let polls=0;f.remote.health=async()=>{polls++;if(polls===1)return{ok:true,serviceInstanceId:'old-service'};if(polls===2)throw TypeError('restart disconnect');if(polls===3)return{ok:true,serviceInstanceId:'new-service',restoringBackup:true};return{ok:true,serviceInstanceId:'new-service',restoringBackup:false};};await f.api.restore(selected);assert.equal(polls,4);assert.equal(f.requests.filter(v=>v[0]==='restore').length,1);assert.equal(f.reloads,1);
});

test('lost restore response reconnects using service identity instead of restoring the same backup twice',async t=>{
 const selected=row(),f=fixture(t,{backups:[selected]});let posted=false;f.remote.restore=async()=>{posted=true;f.requests.push(['restore']);throw TypeError('connection closed after commit');};f.remote.health=async()=>({ok:true,serviceInstanceId:posted?'new-service':'old-service',restoringBackup:false,serverDayKey:'2026-10-25'});await f.api.restore(selected);assert.equal(f.requests.filter(v=>v[0]==='restore').length,1);assert.equal(f.reloads,1);assert.equal(f.storage.data.has(D.RESTORE),false);
});

test('a failed restore CAS keeps current data active and removes only its reconnect control marker',async t=>{
 const selected=row(),f=fixture(t,{backups:[selected]});f.remote.restore=async()=>{throw Object.assign(Error('backup replaced'),{code:'DAILY_BACKUP_CONFLICT',status:409});};await assert.rejects(f.api.restore(selected),e=>e.code==='DAILY_BACKUP_CONFLICT');assert.equal(f.storage.data.has(D.RESTORE),false);assert.equal(f.reloads,0);await f.api.requestManual();assert.equal(f.backups.length,2);
});

test('a pending reconnect survives navigation and cannot submit a stale automatic backup',async t=>{
 const local=storage();local.data.set(D.RESTORE,JSON.stringify({dayKey:'2026-10-24',oldServiceInstanceId:'old-service'}));const f=fixture(t,{storage:local});f.remote.health=async()=>({ok:true,serviceInstanceId:'new-service',restoringBackup:false});await f.api.start();await wait(0);assert.equal(f.reloads,1);assert.equal(local.data.has(D.RESTORE),false);assert.equal(f.requests.some(v=>v[0]==='create'),false);
});

test('API requests carry exact restore CAS and keep read timeouts separate from large backup writes',async()=>{
 const calls=[],remote=D.createRemote({readTimeoutMs:4,writeTimeoutMs:100,fetch:async(url,init)=>{calls.push([url,init]);if(init.method==='GET')return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'})),{once:true}));await wait(15);return new Response(JSON.stringify({ok:true,backup:row()}));}});await assert.rejects(remote.list(),e=>e.code==='DAILY_BACKUP_TIMEOUT');await remote.restore({dayKey:'2026-10-24',expectedManifestSha256:sha});assert.equal(calls[1][0],'/api/backups/daily/restore');assert.equal(calls[1][1].method,'POST');assert.deepEqual(JSON.parse(calls[1][1].body),{dayKey:'2026-10-24',expectedManifestSha256:sha});assert.equal(calls[1][1].cache,'no-store');
});

test('homepage hooks backup to actual queue completion and both pages load it behind the profile barrier',()=>{
 const rootDir=path.resolve(__dirname,'..'),today=fs.readFileSync(path.join(rootDir,'今日学习.html'),'utf8'),backup=fs.readFileSync(path.join(rootDir,'备份中心.html'),'utf8'),hub=fs.readFileSync(path.join(rootDir,'assets/today-hub.js'),'utf8');for(const page of[today,backup])assert.match(page,/<script type="application\/x-ielts-pending" data-ielts-script="1" data-src="assets\/daily-backups\.js" defer><\/script>/);assert.match(today,/id="dailyBackupNotice"[^>]*hidden/);assert.match(backup,/id="dailyBackupPanel"/);assert.match(hub,/if\(learningQueue\?\.currentComplete===true\)root\.IELTSDailyBackups/);assert.ok(today.indexOf('assets/daily-backups.js')<today.indexOf('assets/today-hub.js'));
});

test('new calendar requests refresh the server day, but older durable requests retain the actual completion day',async t=>{
 let day='2026-10-25';const clock=()=>new Date(day+'T10:00:00Z'),f=fixture(t,{clock});f.remote.health=async()=>{f.requests.push(['health-day',day]);return{ok:true,serviceInstanceId:'same-service',serverDayKey:day};};await f.api.observeCompletion(complete());await f.api.run();day='2026-10-26';await f.api.observeCompletion(complete(2));await f.api.run();assert.deepEqual(f.requests.filter(v=>v[0]==='health-day').map(v=>v[1]),['2026-10-25','2026-10-26']);assert.deepEqual(f.requests.filter(v=>v[0]==='create').map(v=>v[1].dayKey),['2026-10-25','2026-10-26']);
 day='2026-10-27';await f.api.observeCompletion(complete(3));f.api.stop();day='2026-10-28';const next=fixture(t,{storage:f.storage,clock});await next.api.start();await next.api.run();assert.equal(next.requests.find(v=>v[0]==='create')[1].dayKey,'2026-10-27');
});

test('a new calendar lookup failure retains the completion intent before touching the NAS',async t=>{
 const f=fixture(t);f.remote.health=async()=>{assert.equal(queued(f).pending.length,1);throw TypeError('brief local disconnect');};await f.api.observeCompletion(complete());assert.equal(queued(f).pending.length,1);assert.equal(f.api.status().state,'error');f.remote.health=async()=>({ok:true,serverDayKey:'2026-10-25'});await f.api.run();assert.equal(f.requests.find(v=>v[0]==='create')[1].dayKey,'2026-10-25');assert.equal(queued(f).pending.length,0);
});

test('viewing an unchanged completed course on another day cannot evict a meaningful daily backup',async t=>{
 let day='2026-10-25';const f=fixture(t,{clock:()=>new Date(day+'T10:00:00Z')});await f.api.observeCompletion(complete(1));await f.api.run();await f.api.observeCompletion(complete(2));await f.api.run();assert.equal(f.requests.filter(v=>v[0]==='create').length,2);day='2026-10-26';f.requests.length=0;await f.api.observeCompletion(complete(1));await f.api.observeCompletion(complete(2));await f.api.run();assert.equal(f.requests.length,0);assert.equal(f.backups.length,1);await f.api.observeCompletion(complete(2,2));await f.api.run();assert.equal(f.requests.filter(v=>v[0]==='create').length,1,'a new original revision still receives a new full backup');
});

test('a restore validation error that requires restart reconnects and retains its original reason after reload',async t=>{
 const selected=row(),f=fixture(t,{backups:[selected]});let restarted=false;f.remote.restore=async()=>{restarted=true;f.requests.push(['restore']);throw Object.assign(Error('selected full backup changed'),{code:'DAILY_BACKUP_CONFLICT',status:409,requiresRestart:true});};f.remote.health=async()=>({ok:true,serviceInstanceId:restarted?'new-service':'old-service',restoringBackup:false});await f.api.restore(selected);assert.equal(f.reloads,1);assert.equal(f.requests.filter(v=>v[0]==='restore').length,1);assert.match(f.storage.data.get(D.NOTICE),/selected full backup changed/);const next=fixture(t,{storage:f.storage});await next.api.start();assert.match(next.api.status().restoreNotice,/selected full backup changed/);assert.equal(f.storage.data.has(D.NOTICE),false);
 assert.ok(f.states.some(s=>s.state==='reconnecting'&&s.message.includes('selected full backup changed')));assert.ok(f.states.filter(s=>['reconnecting','restored'].includes(s.state)).every(s=>!s.message.includes('已恢复')));
});

test('opening an unchanged completed annual review for thirty idle days makes no new backup slots',async t=>{
 let day=1;const f=fixture(t,{clock:()=>new Date(Date.UTC(2026,9,day,10))});f.remote.health=async()=>({ok:true,serverDayKey:new Date(Date.UTC(2026,9,day,10)).toISOString().slice(0,10)});await f.api.observeCompletion(complete(365));await f.api.run();f.requests.length=0;for(day=2;day<=31;day++){await f.api.observeCompletion(complete(365));await f.api.run();}assert.equal(f.requests.length,0);assert.equal(f.backups.length,1);
});

function domFixture(t,{preview=false,failCreate=false}={}){
 const nodes=new Map(),events=new Map(),local=storage(),requests=[];class Node{constructor(tag){this.tagName=tag;this.children=[];this.listeners=new Map();this.hidden=false;this.attrs={};}set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}setAttribute(k,v){this.attrs[k]=v;}append(...values){this.children.push(...values);}replaceChildren(...values){this.children=values;}addEventListener(name,fn){this.listeners.set(name,fn);}async click(){return this.listeners.get('click')?.();}}
 const doc={readyState:'complete',createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text}),getElementById:id=>nodes.get(id)||null};for(const id of['dailyBackupPanel','dailyBackupNotice']){const element=new Node('section');element.id=id;}
 const root={document:doc,localStorage:local,location:{search:preview?'?preview=1':'',reload(){}},crypto,IELTSProfiles:{isPreview:()=>preview,current:()=>({id:'legacy'}),assertFresh(){},storage:()=>({getItem:()=> 'verified-generation'})},IELTSUserData:{ready:Promise.resolve(),status:()=>({path:'D:/isolated',state:'ready',pendingProfiles:[]}),syncNow:async()=>{}},IELTSProfileReset:{confirmAction:async()=>true},addEventListener:(type,fn)=>{events.set(type,fn);},fetch:async(url,init)=>{requests.push([url,init.method]);if(url==='/api/health')return new Response(JSON.stringify({ok:true,serverDayKey:'2026-10-25',serviceInstanceId:'service'}));if(init.method==='POST'&&failCreate)return new Response(JSON.stringify({ok:false,error:{code:'DAILY_BACKUP_BUSY',message:'NAS temporary busy'}}),{status:423});return new Response(JSON.stringify(init.method==='POST'?{ok:true,backup:row('2026-10-25'),retained:true}:{ok:true,backups:[],retentionDays:30,serverDayKey:'2026-10-25'}));}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../assets/daily-backups.js'),'utf8'),{window:root,structuredClone,TextEncoder,Uint8Array,AbortController,setTimeout,clearTimeout,URLSearchParams,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}});t.after(()=>events.get('pagehide')?.());return{root,nodes,requests,storage:local};
}

test('the backup center shows successful full capture quietly and the learning page displays actual failure with retry',async t=>{
 const success=domFixture(t);await wait(0);await success.root.IELTSDailyBackups.requestManual();assert.equal(success.nodes.get('dailyBackupNotice').hidden,true);assert.match(success.nodes.get('dailyBackupStatus').textContent,/已保存/);assert.equal(success.nodes.get('dailyBackupList').children.length,1);assert.equal(success.nodes.get('dailyBackupNow').disabled,false);
 const failed=domFixture(t,{failCreate:true});await wait(0);await assert.rejects(failed.root.IELTSDailyBackups.requestManual(),/NAS temporary busy/);assert.equal(failed.nodes.get('dailyBackupNotice').hidden,false);assert.match(failed.nodes.get('dailyBackupNotice').children[0].textContent,/NAS temporary busy/);assert.equal(failed.nodes.get('dailyBackupNotice').children[1].tagName,'button');assert.match(failed.nodes.get('dailyBackupStatus').textContent,/尚未完成/);
});

test('preview backup UI disables formal controls without reading metadata or requesting a server',async t=>{
 const f=domFixture(t,{preview:true});await wait(0);assert.equal(f.nodes.get('dailyBackupNow').disabled,true);assert.equal(f.nodes.get('dailyBackupRefresh').disabled,true);assert.match(f.nodes.get('dailyBackupStatus').textContent,/临时预览/);assert.equal(f.requests.length,0);assert.equal(f.storage.calls.length,0);
});

test('an old queued day outside retention cannot be presented as an available complete backup',async t=>{
 const f=fixture(t);await f.api.observeCompletion(complete());f.remote.create=async body=>({ok:true,backup:row(body.dayKey),retained:false});await f.api.run();assert.equal(f.api.status().state,'expired');assert.equal(f.api.status().backups.length,0);assert.match(f.api.status().message,/超出最近 30/);assert.equal(queued(f).pending.length,0);
});

test('a confirmed restore shows its date and reconnected-service acknowledgement exactly once after reload',async t=>{
 let prompt;const selected=row(),f=fixture(t,{backups:[selected],confirm:async message=>{prompt=message;return true;}});await f.api.restore(selected);assert.match(prompt,/同一 NAS.*其他电脑/);assert.match(prompt,/重新双击“启动学习\.cmd”/);assert.equal(f.reloads,1);assert.equal(f.storage.data.get(D.NOTICE),'已恢复 2026-10-24 完整备份，当前服务已重新连接。');const next=fixture(t,{storage:f.storage});await next.api.start();assert.equal(next.api.status().restoreNotice,'已恢复 2026-10-24 完整备份，当前服务已重新连接。');assert.equal(f.storage.data.has(D.NOTICE),false);const later=fixture(t,{storage:f.storage});await later.api.start();assert.equal(later.api.status().restoreNotice,undefined);
});
