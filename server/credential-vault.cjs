'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { constants } = require('node:fs');
const { spawn } = require('node:child_process');
const { currentCredentialOwner, credentialPaths } = require('./credential-owner.cjs');

// DPAPI binds the ciphertext to the current Windows account. Plaintext is sent
// through stdin, never command-line arguments, files, logs, or HTTP responses.
function dpapi(operation, value) {
  if (process.platform !== 'win32') return Promise.reject(Error('本机加密保存目前需要 Windows。'));
  const script = operation === 'protect'
    ? "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Text.Encoding]::UTF8.GetBytes($v); $c=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($c))"
    : "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($v); $c=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($c))";
  return new Promise((resolve, reject) => {
    const utf8="[Console]::InputEncoding=New-Object Text.UTF8Encoding($false); [Console]::OutputEncoding=New-Object Text.UTF8Encoding($false); ";
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', utf8+script], {windowsHide:true, stdio:['pipe','pipe','pipe']});
    let output='', done=false;
    const fail=()=>{if(done)return;done=true;clearTimeout(timer);child.kill();reject(Error('Windows 本机加密操作失败；现有配置未清除。'));};
    const timer=setTimeout(fail,15000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{output+=part;if(output.length>1024*1024)fail();});
    child.stderr.on('data',()=>{});child.on('error',fail);
    child.on('close',code=>{if(done)return;if(code!==0)return fail();done=true;clearTimeout(timer);resolve(output);});
    child.stdin.on('error',fail);child.stdin.end(value,'utf8');
  });
}

function createCredentialVault({providers={},filePath,preferenceFilePath,legacyFilePaths=[],ownerIdentity=currentCredentialOwner,defaultEnabled=false,protect=v=>dpapi('protect',v),unprotect=v=>dpapi('unprotect',v),supported=process.platform==='win32',exclusive=run=>run()}={}) {
  const legacyLocation=path.resolve(filePath||path.join(process.env.LOCALAPPDATA||process.env.TEMP||'.','IELTS Learning','credentials.dpapi'));
  if(legacyFilePaths!==null&&(!Array.isArray(legacyFilePaths)||legacyFilePaths.length>8||legacyFilePaths.some(file=>typeof file!=='string'||!path.isAbsolute(file)||/[\x00-\x1f\x7f]/.test(file))))throw Error('旧本机配置路径无效。');
  const extraLegacy=[...new Set((legacyFilePaths||[]).map(file=>path.resolve(file)))];
  let locations,enabled=false,savedAt=null,restored=[],error=null,errorCode=null,queue=Promise.resolve(),frozen=false;
  const paths=()=>locations||(locations=credentialPaths({filePath:legacyLocation,preferenceFilePath,ownerIdentity}));
  const status=()=>({ok:true,supported,enabled,savedAt,restoredProviders:restored.slice(),storage:enabled?'windows-dpapi-current-user':'memory',scope:'device-windows-user',error,errorCode});
  const problem=(code,message)=>{errorCode=code;error=message;};
  function serial(action){if(frozen)return Promise.reject(Error('配置正在恢复，暂缓写入；当前加密文件保留。'));const run=()=>exclusive(action),next=queue.then(run,run);queue=next.catch(()=>{});return next;}
  async function checked(file){
    const base=path.dirname(legacyLocation),relative=path.relative(base,file);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('本机配置路径无效。');
    let current=base;for(const part of ['',...relative.split(path.sep).filter(Boolean)]){if(part)current=path.join(current,part);let stat;try{stat=await fs.lstat(current);}catch(e){if(e.code==='ENOENT')break;throw e;}if(stat.isSymbolicLink()||current!==file&&!stat.isDirectory()||current===file&&(!stat.isFile()||stat.nlink!==1))throw Error('本机配置路径无法安全核实。');}return file;
  }
  async function read(file,max,{external=false}={}){if(!external)await checked(file);const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>max)throw Error('本机配置文件无法校验。');const raw=await fs.readFile(file,'utf8');if(Buffer.byteLength(raw)>max)throw Error('本机配置文件过大。');return raw;}
  async function atomic(file,value,{replace=true}={}){
    await checked(file);await fs.mkdir(path.dirname(file),{recursive:true});await checked(file);const tmp=file+'.'+crypto.randomUUID()+'.tmp';let handle;
    try{handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(value,'utf8');await handle.sync();await handle.close();handle=null;if(replace){await checked(file);await fs.rename(tmp,file);}else await fs.copyFile(tmp,file,constants.COPYFILE_EXCL);}
    finally{await handle?.close().catch(()=>{});await fs.unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  }
  async function preference(file){if(!file)return undefined;try{const value=JSON.parse(await read(file,4096));if(value.schemaVersion!==1||typeof value.enabled!=='boolean')throw Error();return value.enabled;}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}
  const rememberPreference=value=>atomic(paths().preferenceFilePath,JSON.stringify({schemaVersion:1,enabled:value,updatedAt:new Date().toISOString()}));
  function decode(raw){return Promise.resolve(unprotect(raw)).then(text=>{const data=JSON.parse(text);if(data?.schemaVersion!==1||!data.providers||typeof data.providers!=='object'||Array.isArray(data.providers)||!Number.isFinite(Date.parse(data.savedAt))||Object.keys(data.providers).some(name=>!Object.hasOwn(providers,name)))throw Error();return data;});}
  async function apply(data){restored=[];const failed=[];for(const [name,value]of Object.entries(data.providers)){try{await providers[name].restore(value);restored.push(name);}catch{failed.push(name);}}savedAt=data.savedAt;enabled=true;if(failed.length)problem('CREDENTIAL_PROVIDER_RESTORE_FAILED','部分保存配置未能恢复，请在对应服务重新连接。');else{error=null;errorCode=null;}}
  function snapshot(){const out={};for(const [name,provider]of Object.entries(providers)){const value=provider.get();if(value)out[name]=value;}return out;}
  async function write(){
    if(!enabled)return status();
    if(!supported)throw Error('当前系统不支持 Windows 账户加密。');
    const at=new Date().toISOString(),payload=JSON.stringify({schemaVersion:1,savedAt:at,providers:snapshot()});
    const ciphertext=await protect(payload);if(typeof ciphertext!=='string'||!ciphertext.trim()||ciphertext===payload||Buffer.byteLength(ciphertext)>1024*1024)throw Error('加密结果无效，未保存配置。');
    await atomic(paths().filePath,ciphertext);await rememberPreference(true);savedAt=at;error=null;errorCode=null;return status();
  }
  async function restore(){return serial(async()=>{
    if(!supported)return status();
    let local,remember;
    try{local=paths();}catch{problem('CREDENTIAL_OWNER_UNAVAILABLE','无法识别当前 Windows 账户，未读写共享配置；请核实本机账户后重新启动。');return status();}
    try{remember=await preference(local.preferenceFilePath);}catch{problem('CREDENTIAL_POLICY_UNREADABLE','本机配置保存偏好无法校验，未自动启用；当前配置保留。');return status();}
    if(remember===false){enabled=false;return status();}
    enabled=Boolean(remember??defaultEnabled);
    let raw;
    try{raw=await read(local.filePath,1024*1024);}catch(e){if(e.code!=='ENOENT'){problem('CREDENTIAL_STORAGE_FAILED','无法读取本机加密配置，当前连接保持不变。');return status();}}
    if(raw!==undefined){try{await apply(await decode(raw));}catch{problem('LOCAL_CONFIGURATION_UNREADABLE','当前设备和 Windows 账户的配置无法解密，请在本机重新配置服务；原密文保留。');}return status();}
    // Only a successfully decrypted legacy file can belong to this account.
    // Never overwrite or remove that shared file, even when persistence is off.
    let data,source,foundLegacy=false;
    for(const candidate of [...new Set([local.legacyFilePath,...extraLegacy])]){
      let candidateRaw;try{candidateRaw=await read(candidate,1024*1024,{external:candidate!==local.legacyFilePath});}catch(e){if(e.code!=='ENOENT')foundLegacy=true;continue;}
      foundLegacy=true;try{data=await decode(candidateRaw);raw=candidateRaw;source=candidate;break;}catch{ /* Foreign or invalid ciphertext is preserved, never copied over another owner. */ }
    }
    if(data){
      let oldPreference;try{if(source===local.legacyFilePath)oldPreference=await preference(local.legacyPreferenceFilePath);}catch{problem('CREDENTIAL_POLICY_UNREADABLE','旧配置保存偏好无法校验，未自动迁移；共享密文保留。');enabled=false;return status();}
      if(remember===undefined&&oldPreference===false){enabled=false;await rememberPreference(false);return status();}
      await apply(data);
      try{await atomic(local.filePath,raw,{replace:false});await rememberPreference(true);}catch{problem('CREDENTIAL_STORAGE_FAILED','旧配置已在本次服务中恢复，但本机独立加密文件未能保存；共享原密文保留。');}
      return status();
    }
    if(foundLegacy){problem('LOCAL_CONFIGURATION_REQUIRED','这台电脑或当前 Windows 账户尚未配置，请在本机首次配置 AI 和语音服务；共享目录原有密文保留。');return status();}
    if(enabled)try{await rememberPreference(true);}catch{enabled=false;problem('CREDENTIAL_STORAGE_FAILED','默认加密保存偏好无法写入，当前仅在内存中使用。');}
    return status();
  });}
  const saveIfEnabled=()=>serial(async()=>{try{return await write();}catch{problem('CREDENTIAL_STORAGE_FAILED','配置已在本次服务中生效，但本机加密保存失败。');return status();}});
  async function setEnabled(value){return serial(async()=>{
    if(typeof value!=='boolean')throw Error('请选择是否在本机记住配置。');
    if(value){if(!supported)throw Error('当前系统不支持 Windows 账户加密。');const previous=enabled;enabled=true;try{return await write();}catch(e){enabled=previous;throw e;}}
    await rememberPreference(false);enabled=false;savedAt=null;restored=[];error=null;errorCode=null;try{await checked(paths().filePath);await fs.rm(paths().filePath,{force:true});}catch{problem('CREDENTIAL_STORAGE_FAILED','已停用自动恢复，但本账户密文未能删除；其他设备和共享原密文保留。');}return status();
  });}
  async function handle(req,res,pathname){
    if(pathname!=='/api/settings/persistence')return false;
    const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try{
      if(req.method==='GET'){send(200,status());return true;}
      if(req.method!=='POST'){send(405,{ok:false,error:{message:'此设置只支持读取或保存。'}});return true;}
      if((req.headers['content-type']||'').split(';')[0]!=='application/json')throw Error('请使用 JSON 设置。');
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024)throw Error('设置内容过大。');chunks.push(chunk);}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||Object.keys(data).some(k=>k!=='enabled'))throw Error('设置格式无效。');
      send(200,await setEnabled(data.enabled));
    }catch{send(400,{ok:false,error:{message:'本机配置保存设置未完成；当前 AI 与语音连接保留。'}});}
    return true;
  }
  return {status,restore,saveIfEnabled,setEnabled,handle,get paths(){return {...paths()};},idle:()=>queue,freeze:()=>{frozen=true;return queue;}};
}
module.exports={createCredentialVault,dpapi};
