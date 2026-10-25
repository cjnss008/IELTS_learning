'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

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

function createCredentialVault({providers={},filePath,preferenceFilePath,defaultEnabled=false,protect=v=>dpapi('protect',v),unprotect=v=>dpapi('unprotect',v),supported=process.platform==='win32',exclusive=run=>run()}={}) {
  const location=filePath||path.join(process.env.LOCALAPPDATA||process.env.TEMP||'.','IELTS Learning','credentials.dpapi');
  let enabled=false,savedAt=null,restored=[],error=null,queue=Promise.resolve(),frozen=false;
  const status=()=>({ok:true,supported,enabled,savedAt,restoredProviders:restored.slice(),storage:enabled?'windows-dpapi-current-user':'memory',error});
  function serial(action){if(frozen)return Promise.reject(Error('配置正在恢复，暂缓写入；当前加密文件保留。'));const run=()=>exclusive(action),next=queue.then(run,run);queue=next.catch(()=>{});return next;}
  async function rememberPreference(value){if(!preferenceFilePath)return;await fs.mkdir(path.dirname(preferenceFilePath),{recursive:true});const tmp=preferenceFilePath+'.'+require('node:crypto').randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify({schemaVersion:1,enabled:value,updatedAt:new Date().toISOString()}),{encoding:'utf8',mode:0o600});await fs.rename(tmp,preferenceFilePath);}
  function snapshot(){const out={};for(const [name,provider]of Object.entries(providers)){const value=provider.get();if(value)out[name]=value;}return out;}
  async function write(){
    if(!enabled)return status();
    if(!supported)throw Error('当前系统不支持 Windows 账户加密。');
    const at=new Date().toISOString(),payload=JSON.stringify({schemaVersion:1,savedAt:at,providers:snapshot()});
    const ciphertext=await protect(payload);if(typeof ciphertext!=='string'||!ciphertext.trim()||ciphertext===payload)throw Error('加密结果无效，未保存配置。');
    await fs.mkdir(path.dirname(location),{recursive:true});
    const temp=location+'.tmp';await fs.writeFile(temp,ciphertext,{encoding:'utf8',mode:0o600});
    await fs.rename(temp,location);await rememberPreference(true);savedAt=at;error=null;return status();
  }
  async function restore(){return serial(async()=>{
    if(!supported)return status();
    let preference;
    if(preferenceFilePath)try{const rawPreference=await fs.readFile(preferenceFilePath,'utf8');if(rawPreference.length>4096)throw Error();const value=JSON.parse(rawPreference);if(value.schemaVersion!==1||typeof value.enabled!=='boolean')throw Error();preference=value.enabled;}catch(e){if(e.code!=='ENOENT'){error='本机配置保存偏好无法校验，未自动启用；当前配置保留。';return status();}}
    if(preference===false){enabled=false;return status();}
    let raw;try{raw=await fs.readFile(location,'utf8');}catch(e){if(e.code==='ENOENT'){enabled=Boolean(preference??defaultEnabled);if(enabled)try{await rememberPreference(true);}catch{enabled=false;error='默认加密保存偏好无法写入，当前仅在内存中使用。';}return status();}error='无法读取本机加密配置，当前连接保持不变。';return status();}
    try{
      if(raw.length>1024*1024)throw Error();
      const data=JSON.parse(await unprotect(raw));
      if(data?.schemaVersion!==1||!data.providers||typeof data.providers!=='object'||Array.isArray(data.providers)||!Number.isFinite(Date.parse(data.savedAt))||Object.keys(data.providers).some(name=>!Object.hasOwn(providers,name)))throw Error();
      // Providers validate their own configuration before assigning it. Keep
      // successful services available when a separately configured one fails.
      restored=[];const failed=[];
      for(const [name,value]of Object.entries(data.providers)){try{await providers[name].restore(value);restored.push(name);}catch{failed.push(name);}}
      savedAt=data.savedAt;enabled=true;error=failed.length?'部分保存配置未能恢复，请在对应服务重新连接。':null;
    }catch{error='无法解密本机配置。请使用保存时的 Windows 账户，或重新配置服务。';}
    return status();
  });}
  const saveIfEnabled=()=>serial(async()=>{try{return await write();}catch{error='配置已在本次服务中生效，但本机加密保存失败。';return status();}});
  async function setEnabled(value){return serial(async()=>{
    if(typeof value!=='boolean')throw Error('请选择是否在本机记住配置。');
    if(value){if(!supported)throw Error('当前系统不支持 Windows 账户加密。');const previous=enabled;enabled=true;try{return await write();}catch(e){enabled=previous;throw e;}}
    await rememberPreference(false);enabled=false;savedAt=null;restored=[];error=null;try{await fs.rm(location,{force:true});}catch{error='已停用自动恢复，但旧密文未能删除；请保留本机配置文件并检查目录权限。';}return status();
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
  return {status,restore,saveIfEnabled,setEnabled,handle,idle:()=>queue,freeze:()=>{frozen=true;return queue;}};
}
module.exports={createCredentialVault,dpapi};
