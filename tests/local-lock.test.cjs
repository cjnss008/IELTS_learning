'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),{removeDeadLocalLock}=require('../server/local-lock.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ielts-local-lock-')),file=path.join(dir,'writer.lock');t.after(()=>{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('ielts-local-lock-'));fs.rmSync(dir,{recursive:true,force:true});});return{dir,file};}
function deadPid(){const child=spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'});assert.equal(child.status,0);return Number(child.stdout);}
const owner=pid=>({hostname:os.hostname(),pid,owner:'isolated-owner-1234'});

test('only a stable ordinary lease from a confirmed exited local process is removed',t=>{
 const f=fixture(t);fs.writeFileSync(f.file,JSON.stringify(owner(deadPid())));assert.equal(removeDeadLocalLock(f.file),true);assert.equal(fs.existsSync(f.file),false);assert.equal(fs.existsSync(f.file+'.reclaim.lock'),false);
});

test('active, foreign, unknown, empty and oversized lock records remain intact',t=>{
 const f=fixture(t),pid=deadPid(),cases=[JSON.stringify(owner(process.pid)),JSON.stringify({...owner(pid),hostname:'foreign-host'}),JSON.stringify({pid,owner:'legacy-owner'}),JSON.stringify({hostname:os.hostname(),pid}),'{','',JSON.stringify({...owner(pid),padding:'x'.repeat(4096)})];
 for(const value of cases){fs.writeFileSync(f.file,value);assert.equal(removeDeadLocalLock(f.file),false);assert.equal(fs.readFileSync(f.file,'utf8'),value);assert.equal(fs.existsSync(f.file+'.reclaim.lock'),false);}
});

test('permission uncertainty never counts as proof that a lease owner has exited',t=>{
 const f=fixture(t),pid=deadPid(),serialized=JSON.stringify(owner(pid)),kill=process.kill;fs.writeFileSync(f.file,serialized);process.kill=function(target,...args){if(target===pid)throw Object.assign(Error('isolated access denied'),{code:'EPERM'});return kill.call(this,target,...args);};try{assert.equal(removeDeadLocalLock(f.file),false);}finally{process.kill=kill;}assert.equal(fs.readFileSync(f.file,'utf8'),serialized);
});

for(const replacement of ['new-owner','same-owner-new-file'])test('owner and file identity are rechecked before removal: '+replacement,t=>{
 const f=fixture(t),pid=deadPid(),original=JSON.stringify(owner(pid)),kill=process.kill;fs.writeFileSync(f.file,original);let changed=false,expected;
 process.kill=function(target,...args){if(target!==pid)return kill.call(this,target,...args);if(!changed){changed=true;expected=replacement==='new-owner'?JSON.stringify({...owner(process.pid),owner:'new-owner-12345678'}):original;const temporary=path.join(f.dir,'replacement');fs.writeFileSync(temporary,expected);fs.renameSync(temporary,f.file);}throw Object.assign(Error('isolated exited process'),{code:'ESRCH'});};try{assert.equal(removeDeadLocalLock(f.file),false);}finally{process.kill=kill;}assert.equal(fs.readFileSync(f.file,'utf8'),expected);
});

test('a reclamation guard serializes competing removers and is not stolen by another attempt',t=>{
 const f=fixture(t),pid=deadPid(),kill=process.kill;fs.writeFileSync(f.file,JSON.stringify(owner(pid)));let nested;
 process.kill=function(target,...args){if(target!==pid)return kill.call(this,target,...args);nested=removeDeadLocalLock(f.file);throw Object.assign(Error('isolated exited process'),{code:'ESRCH'});};try{assert.equal(removeDeadLocalLock(f.file),true);}finally{process.kill=kill;}assert.equal(nested,false);assert.equal(fs.existsSync(f.file),false);assert.equal(fs.existsSync(f.file+'.reclaim.lock'),false);
});

test('hard links and directory junctions are preserved without accessing their targets',t=>{
 const f=fixture(t),target=path.join(f.dir,'target'),serialized=JSON.stringify(owner(deadPid()));fs.writeFileSync(target,serialized);fs.linkSync(target,f.file);assert.equal(removeDeadLocalLock(f.file),false);assert.equal(fs.readFileSync(target,'utf8'),serialized);fs.unlinkSync(f.file);const directory=path.join(f.dir,'outside');fs.mkdirSync(directory);fs.symlinkSync(directory,f.file,'junction');assert.equal(removeDeadLocalLock(f.file),false);assert.equal(fs.lstatSync(f.file).isSymbolicLink(),true);assert.deepEqual(fs.readdirSync(directory),[]);
});
