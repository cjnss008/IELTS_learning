'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createCredentialVault:createVault,dpapi}=require('../server/credential-vault.cjs');
const createCredentialVault=options=>createVault({ownerIdentity:{deviceId:'isolated-vault-device',userId:'isolated-vault-account'},...options});
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ielts-vault-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return path.join(dir,'credentials.dpapi');}
test('加密保存、恢复与禁用不清运行连接，状态不泄露凭据',async t=>{
 const filePath=await setup(t),secret='test-only-secret',data={model:'test',apiKey:secret},protect=async v=>'cipher:'+Buffer.from(v).toString('base64'),unprotect=async v=>Buffer.from(v.slice(7),'base64').toString();let restored;
 const options={filePath,supported:true,protect,unprotect,providers:{ai:{get:()=>data,restore:v=>{restored=v;}}}};
 const a=createCredentialVault(options);await a.restore();assert.equal(a.status().enabled,false);await a.setEnabled(true);
 assert.ok(!(await fs.readFile(a.paths.filePath,'utf8')).includes(secret));assert.ok(!JSON.stringify(a.status()).includes(secret));
 const b=createCredentialVault(options);await b.restore();assert.deepEqual(restored,data);assert.equal(b.status().enabled,true);
 await b.setEnabled(false);assert.equal(b.status().enabled,false);assert.equal(data.apiKey,secret);await assert.rejects(fs.stat(b.paths.filePath));
});
test('加密失败不写明文且不启用；错误解密不覆盖已有配置',async t=>{
 const filePath=await setup(t);let called=false;
 const a=createCredentialVault({filePath,supported:true,protect:async v=>v,providers:{ai:{get:()=>({apiKey:'fake'}),restore:()=>{called=true;}}}});
 await assert.rejects(a.setEnabled(true));assert.equal(a.status().enabled,false);await assert.rejects(fs.stat(filePath));
 await fs.writeFile(filePath,'invalid');const b=createCredentialVault({filePath,supported:true,unprotect:async()=>{throw Error('secret-containing-upstream-error');},providers:{ai:{get:()=>null,restore:()=>{called=true;}}}});
 await b.restore();assert.equal(called,false);assert.ok(b.status().error);assert.ok(!JSON.stringify(b.status()).includes('secret-containing'));
});
test('配置变化更新密文，未知provider不能导入，非Windows不自动保存',async t=>{
 const filePath=await setup(t);let config={apiKey:'one'};const protect=async v=>'x'+v,unprotect=async v=>v.slice(1);
 const a=createCredentialVault({filePath,supported:true,protect,unprotect,providers:{ai:{get:()=>config,restore:()=>{}}}});await a.setEnabled(true);config={apiKey:'two'};await a.saveIfEnabled();assert.ok((await fs.readFile(a.paths.filePath,'utf8')).includes('two'));
 const b=createCredentialVault({filePath,supported:true,unprotect,providers:{}});await b.restore();assert.equal(b.status().enabled,true);assert.ok(b.status().error);
 const c=createCredentialVault({filePath,supported:false});await assert.rejects(c.setEnabled(true));assert.equal(c.status().storage,'memory');
});
test('Windows真实DPAPI可往返且密文不包含明文', {skip:process.platform!=='win32'},async()=>{
 const text='IELTS-test-only-加密往返';const encrypted=await dpapi('protect',text);assert.ok(!encrypted.includes(text));assert.equal(await dpapi('unprotect',encrypted),text);
});
test('恢复前冻结配置，先写完已接受的密文再关闭服务，拒绝迟到的旧写入',async t=>{
 const filePath=await setup(t);let provider={appid:'test-app',secret:'isolated-test'},release,waiting;
 const vault=createCredentialVault({filePath,supported:true,protect:async v=>'encrypted:'+Buffer.from(v).toString('base64'),exclusive:async run=>{if(waiting)await waiting;return run();},providers:{oral:{get:()=>provider,restore:()=>{}}}});
 await vault.setEnabled(true);waiting=new Promise(resolve=>{release=resolve;});
 const accepted=vault.saveIfEnabled(),drained=vault.freeze();
 await assert.rejects(vault.saveIfEnabled(),/正在恢复/);await assert.rejects(vault.setEnabled(false),/正在恢复/);
 release();await accepted;await drained;provider=null;
 const saved=JSON.parse(Buffer.from((await fs.readFile(vault.paths.filePath,'utf8')).slice(10),'base64').toString());assert.equal(saved.providers.oral.appid,'test-app');assert.equal(saved.providers.oral.secret,'isolated-test');
});
