'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const D=require('../tools/start-development.cjs');
const sourceRoot=path.resolve(__dirname,'..');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-development-')),projectRoot=path.join(dir,'IELTS_learning开发'),dataDir=path.join(dir,'synthetic data 合成');fs.mkdirSync(projectRoot);t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});});return{dir,projectRoot,dataDir,options:{projectRoot,readRuntime:root=>({version:'0.0.70',projectId:'sha256:'+crypto.createHash('sha256').update(root.toLowerCase()).digest('hex')})}};}
function minimalRuntime(root){for(const name of ['tools','server','assets','calibration'])fs.mkdirSync(path.join(root,name),{recursive:true});for(const[file,text]of Object.entries({'VERSION':'0.0.70\n','calibration/official-sample-index.json':'[]\n','tools/start-learning.cjs':'// isolated runtime identity fixture\n','tools/restart-learning-service.ps1':'# isolated runtime identity fixture\n'}))fs.writeFileSync(path.join(root,file),text);}
test('development arguments require explicit data and cannot choose the stable port or inherit environment defaults',()=>{
  assert.throws(()=>D.parse([]),{code:'DEV_DATA_REQUIRED'});assert.throws(()=>D.parse(['--port','8765','--data-dir','C:/fake']),{code:'DEV_ARGUMENT'});assert.throws(()=>D.parse(['--data-dir','C:/fake','--init','--init']),{code:'DEV_ARGUMENT'});
  assert.deepEqual(D.parse(['--data-dir','C:/fake','--init','--check']),{init:true,check:true,dataDir:'C:/fake'});assert.equal(D.PORT,18765);assert.equal(D.HOST,'127.0.0.1');
});
test('check mode creates nothing, initialization is explicit, and subsequent runs require the exact project marker',t=>{
  const f=fixture(t);assert.throws(()=>D.prepare({dataDir:f.dataDir},f.options),{code:'DEV_DATA_INIT_REQUIRED'});assert.equal(fs.existsSync(f.dataDir),false);
  const check=D.prepare({dataDir:f.dataDir,init:true,check:true},f.options);assert.equal(check.check,true);assert.equal(fs.existsSync(f.dataDir),false);
  const plan=D.prepare({dataDir:f.dataDir,init:true},f.options),marker=fs.readFileSync(plan.markerPath);assert.equal(plan.port,18765);assert.equal(fs.readdirSync(f.dataDir).length,1);
  assert.equal(D.prepare({dataDir:f.dataDir},f.options).projectId,plan.projectId);assert.deepEqual(fs.readFileSync(plan.markerPath),marker);
});
test('unmarked nonempty folders are never adopted or read as user data',t=>{
  const f=fixture(t);fs.mkdirSync(f.dataDir);const sentinel=path.join(f.dataDir,'credentials.dpapi');fs.writeFileSync(sentinel,'synthetic sentinel not a credential');const before=fs.readFileSync(sentinel);
  assert.throws(()=>D.prepare({dataDir:f.dataDir,init:true},f.options),{code:'DEV_DATA_NOT_EMPTY'});assert.deepEqual(fs.readFileSync(sentinel),before);assert.deepEqual(fs.readdirSync(f.dataDir),['credentials.dpapi']);
});
test('relative, UNC, default user-data, source and source-parent locations fail before directory creation',t=>{
  const f=fixture(t);for(const dataDir of ['relative-data','C:drive-relative','\\\\mynas\\family\\synthetic-do-not-touch',f.projectRoot,f.dir,path.join(f.projectRoot,'inside'),path.join(f.dir,'用户数据')])assert.throws(()=>D.prepare({dataDir,init:true},f.options),{code:'DEV_DATA_PATH'});
  assert.equal(fs.existsSync(path.join(f.dir,'用户数据')),false);
});
test('stable project roots cannot be started through the development helper',t=>{
  const f=fixture(t),stable=path.join(f.dir,'IELTS_52篇学习包');fs.mkdirSync(stable);assert.throws(()=>D.prepare({dataDir:f.dataDir,init:true},{...f.options,projectRoot:stable}),{code:'DEV_STABLE_PROJECT'});assert.equal(fs.existsSync(f.dataDir),false);
});
test('corrupt or foreign project markers fail closed without rewriting any bytes',t=>{
  const f=fixture(t),plan=D.prepare({dataDir:f.dataDir,init:true},f.options),initial=JSON.parse(fs.readFileSync(plan.markerPath));
  for(const raw of ['bad json',JSON.stringify({...initial,projectId:'sha256:'+'0'.repeat(64)}),JSON.stringify({...initial,port:8765}),JSON.stringify({...initial,dataDir:path.join(f.dir,'another')})]){fs.writeFileSync(plan.markerPath,raw);assert.throws(()=>D.prepare({dataDir:f.dataDir},f.options),e=>['DEV_DATA_MARKER','DEV_DATA_OWNER'].includes(e.code));assert.equal(fs.readFileSync(plan.markerPath,'utf8'),raw);}
});
test('a junction anywhere in the data-directory ancestry is rejected before creating a marker',t=>{
  const f=fixture(t),outside=path.join(f.dir,'outside'),junction=path.join(f.dir,'redirect');fs.mkdirSync(outside);fs.symlinkSync(outside,junction,'junction');assert.throws(()=>D.prepare({dataDir:path.join(junction,'child'),init:true},f.options),{code:'DEV_DATA_PATH'});assert.deepEqual(fs.readdirSync(outside),[]);
});
test('server configuration explicitly closes every legacy migration and persistence default',t=>{
  const f=fixture(t),plan=D.prepare({dataDir:f.dataDir,init:true},f.options),o=D.serverOptions(plan);assert.equal(o.rootDir,f.projectRoot);assert.equal(o.dataDir,f.dataDir);assert.equal(o.migrateLegacy,false);assert.equal(o.materialMigration,false);assert.equal(o.defaultCredentialPersistence,false);assert.deepEqual(o.legacyCredentialFilePaths,[]);assert.deepEqual(o.legacyDataPaths,{credentials:null,budget:null,'writing-signing':null});assert.ok(o.credentialFilePath.startsWith(f.dataDir+path.sep));assert.ok(o.credentialPreferenceFilePath.startsWith(f.dataDir+path.sep));assert.equal(o.restartOnRestore,true);
});
test('a changed marker between planning and starting is rejected before creating any server',async t=>{
  const f=fixture(t);minimalRuntime(f.projectRoot);const plan=D.prepare({dataDir:f.dataDir,init:true},{projectRoot:f.projectRoot}),marker=JSON.parse(fs.readFileSync(plan.markerPath));marker.projectId='sha256:'+'0'.repeat(64);fs.writeFileSync(plan.markerPath,JSON.stringify(marker));let created=false;
  await assert.rejects(D.start(plan,{service:{createServer:()=>{created=true;assert.fail('must not create a server');}}}),{code:'DEV_DATA_OWNER'});assert.equal(created,false);assert.deepEqual(fs.readdirSync(f.dataDir),[D.MARKER]);
});
test('the real foreground development server uses only the explicit synthetic folder and never reuses an occupied port',async t=>{
  const f=fixture(t),other=path.join(f.dir,'unrelated inherited data'),appData=path.join(f.dir,'unrelated appdata');fs.mkdirSync(other);fs.mkdirSync(path.join(appData,'IELTS Learning'),{recursive:true});fs.writeFileSync(path.join(other,'sentinel'),'unchanged');fs.writeFileSync(path.join(appData,'IELTS Learning','credentials.dpapi'),'synthetic unrelated bytes');
  const saved={IELTS_DATA_DIR:process.env.IELTS_DATA_DIR,IELTS_PORT:process.env.IELTS_PORT,LOCALAPPDATA:process.env.LOCALAPPDATA};Object.assign(process.env,{IELTS_DATA_DIR:other,IELTS_PORT:'8765',LOCALAPPDATA:appData});t.after(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
  minimalRuntime(f.projectRoot);const service=require('../server/server.cjs'),plan=D.prepare({dataDir:f.dataDir,init:true},{projectRoot:f.projectRoot}),wrapped={...service,createServer:options=>service.createServer({...options,fetchImpl:async()=>{throw Error('No real upstream allowed');}})};
  const result=await D.start(plan,{service:wrapped});t.after(()=>new Promise(resolve=>{const current=result.server.successor||result.server;current.close(resolve);current.closeAllConnections();}));
  const base='http://127.0.0.1:18765',health=await fetch(base+'/api/health').then(r=>r.json()),status=await fetch(base+'/api/user-data/status').then(r=>r.json()),persistence=await fetch(base+'/api/settings/persistence').then(r=>r.json());assert.equal(health.projectId,plan.projectId);assert.equal(status.path,f.dataDir);assert.equal(persistence.enabled,false);assert.deepEqual(persistence.restoredProviders,[]);
  await assert.rejects(D.start(plan,{service:wrapped}),{code:'DEV_PORT_IN_USE'});assert.equal((await fetch(base+'/api/health').then(r=>r.json())).serviceInstanceId,health.serviceInstanceId);
  assert.deepEqual(fs.readdirSync(other),['sentinel']);assert.equal(fs.readFileSync(path.join(appData,'IELTS Learning','credentials.dpapi'),'utf8'),'synthetic unrelated bytes');
});
test('direct ordinary Node launcher rejects the development root before importing the server',t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.projectRoot,'tools'));fs.mkdirSync(path.join(f.projectRoot,'server'));fs.copyFileSync(path.join(sourceRoot,'tools/start-learning.cjs'),path.join(f.projectRoot,'tools/start-learning.cjs'));fs.copyFileSync(path.join(sourceRoot,'server/runtime-version.cjs'),path.join(f.projectRoot,'server/runtime-version.cjs'));
  const run=spawnSync(process.execPath,[path.join(f.projectRoot,'tools/start-learning.cjs'),'--serve'],{encoding:'utf8',windowsHide:true,env:{...process.env,IELTS_DATA_DIR:f.dataDir,IELTS_PORT:'8765'},timeout:10000});assert.equal(run.status,1);assert.match(run.stderr,/DEVELOPMENT_WORKTREE/);assert.equal(fs.existsSync(f.dataDir),false);assert.equal(fs.existsSync(path.join(f.projectRoot,'用户数据')),false);
});
test('ordinary PowerShell bootstrap rejects the development root before its default data directory or package reads',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t),ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),run=spawnSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(sourceRoot,'tools/bootstrap-runtime.ps1'),'-ProjectRoot',f.projectRoot,'-NoLaunch','-IgnoreSystemNode'],{encoding:'utf8',windowsHide:true,env:{...process.env,IELTS_DATA_DIR:''},timeout:10000});assert.equal(run.status,1);assert.match(run.stderr,/development worktree/);assert.doesNotMatch(run.stderr,/manifest|Cannot find path/);assert.equal(fs.existsSync(path.join(f.projectRoot,'用户数据')),false);assert.deepEqual(fs.readdirSync(f.projectRoot),[]);
});
test('the real ordinary CMD path rejects a development worktree before creating default data',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.projectRoot,'tools'));fs.copyFileSync(path.join(sourceRoot,'启动学习.cmd'),path.join(f.projectRoot,'启动学习.cmd'));fs.copyFileSync(path.join(sourceRoot,'tools/bootstrap-runtime.ps1'),path.join(f.projectRoot,'tools/bootstrap-runtime.ps1'));
  const run=spawnSync(path.join(process.env.SystemRoot,'System32/cmd.exe'),['/d','/c','call "'+path.join(f.projectRoot,'启动学习.cmd')+'"'],{cwd:f.dir,env:{...process.env,IELTS_DATA_DIR:''},input:'\r\n',encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true,timeout:15000});assert.equal(run.status,1,run.stdout+run.stderr);assert.match(run.stderr,/development worktree/);assert.match(run.stdout,/Startup failed/);assert.doesNotMatch(run.stderr,/manifest|Cannot find path/);assert.equal(fs.existsSync(path.join(f.projectRoot,'用户数据')),false);
});
test('ordinary bootstrap still permits the stable project with an explicit synthetic data directory',{skip:process.platform!=='win32'},t=>{
  const f=fixture(t),stable=path.join(f.dir,'IELTS_52篇学习包');fs.mkdirSync(stable);const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),packages=path.join(sourceRoot,'runtime-packages'),run=spawnSync(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(sourceRoot,'tools/bootstrap-runtime.ps1'),'-ProjectRoot',stable,'-DataDir',f.dataDir,'-PackageDir',packages,'-NoLaunch'],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/RUNTIME_READY/);assert.equal(fs.existsSync(path.join(stable,'用户数据')),false);
});
