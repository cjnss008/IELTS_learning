'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib'),{spawn}=require('node:child_process'),lock=require('./local-asr-lock.json'),{checkWav}=require('./speech.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const {TextDecoder}=require('node:util');
const staticRuntime=lock.runtime?.type==='static-cpp-windows-ucrt'&&lock.runtime?.requiresMsvcRedistributable===false;
function parseResult(bytes,modelPath){
 const decoder=new TextDecoder('utf-8',{fatal:true}),buffer=Buffer.from(bytes);
 let text;
 try{text=decoder.decode(buffer);}catch{
  // v1.8.2 can mix an ANSI argv model path into otherwise UTF-8 JSON.
  // Restore only that known metadata value; recognition bytes stay exact.
  if(typeof modelPath!=='string')throw fail('LOCAL_ASR_OUTPUT_FORMAT','本地转写结果编码无效；原音保留，可更新学习包后重试。');
  const latin=buffer.toString('latin1'),match=/"params"[ \t\r\n]*:[ \t\r\n]*\{[ \t\r\n]*"model"[ \t\r\n]*:[ \t\r\n]*"/.exec(latin),transcription=latin.indexOf('"transcription"');
  if(!match||transcription<0||match.index>=transcription)throw fail('LOCAL_ASR_OUTPUT_FORMAT','本地转写结果编码无效；原音保留，可更新学习包后重试。');
  const start=match.index+match[0].length-1;let end=-1;
  for(let i=start+1;i<buffer.length;i++){if(buffer[i]===92){i++;continue;}if(buffer[i]===34){end=i+1;break;}}
  if(end<0)throw fail('LOCAL_ASR_OUTPUT_FORMAT','本地转写结果格式无效；原音保留。');
  const normalized=Buffer.concat([buffer.subarray(0,start),Buffer.from(JSON.stringify(modelPath),'utf8'),buffer.subarray(end)]);
  try{text=decoder.decode(normalized);}catch{throw fail('LOCAL_ASR_OUTPUT_FORMAT','本地转写结果含无效UTF-8识别内容；原音保留，不生成转写。');}
 }
 try{return JSON.parse(text);}catch{throw fail('LOCAL_ASR_OUTPUT_FORMAT','本地转写结果格式无效；原音保留。');}
}
class LocalASRError extends Error{constructor(code,message){super(message);this.code=code;this.status=503;}}
function fail(code,message){return new LocalASRError(code,message);}
function checkSignal(signal){if(signal?.aborted)throw fail('LOCAL_ASR_CANCELLED','本地转写已取消；原音保留。');}
function processFailure(code){const native=Number(code)>>>0;if(native===0xc0000135)return fail('LOCAL_ASR_RUNTIME_MISSING',staticRuntime?'本地识别需要 Windows 10/11 x64 自带的 Universal CRT（UCRT）；系统组件当前不可用，原音保留，可修复系统后重试。':'Windows 缺少本地识别所需的 Microsoft Visual C++ x64 运行库；原音保留，补齐官方运行库后可重试。');if(native===0xc000001d)return fail('LOCAL_ASR_CPU_UNSUPPORTED','此电脑的 CPU 不支持当前本地识别程序；原音保留，不生成转写。');return fail('LOCAL_ASR_PROCESS_FAILED','本地识别程序未完成；原音保留，稍后可重试。');}
function nonSilent(bytes){for(let p=12;p+8<=bytes.length;){const size=bytes.readUInt32LE(p+4),start=p+8;if(bytes.toString('ascii',p,p+4)==='data'){let peak=0;for(let i=start;i+1<start+size;i+=2)peak=Math.max(peak,Math.abs(bytes.readInt16LE(i)));return peak>=32;}p=start+size+(size%2);}return false;}
async function verified(file,item){try{const s=await fsp.stat(file);return s.isFile()&&s.size===item.bytes&&sha(await fsp.readFile(file))===item.sha256;}catch{return false;}}
function run(exe,args,{signal,timeoutMs=180000,cwd}={}){return new Promise((resolve,reject)=>{
 checkSignal(signal);let child,done=false,output='',size=0,timer,pendingError;
 const finish=(error,code)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):code===0?resolve(output):reject(processFailure(code));};
 const cancel=()=>{pendingError=fail('LOCAL_ASR_CANCELLED','本地转写已取消；原音保留。');child?.kill();};
 try{child=spawn(exe,args,{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});}catch(e){finish(e);return;}
 signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{pendingError=fail('LOCAL_ASR_TIMEOUT','本地转写超时；原音保留，建议拆短后重试。');child.kill();},timeoutMs);
 const collect=data=>{size+=data.length;if(size>512*1024){pendingError=fail('LOCAL_ASR_OUTPUT_LIMIT','本地转写输出异常；原音保留。');child.kill();}else output+=data.toString('utf8');};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('error',()=>finish(fail('LOCAL_ASR_NOT_AVAILABLE','本地识别程序无法启动；原音保留。')));child.on('close',code=>finish(pendingError,code));if(signal?.aborted)cancel();
 });}
async function cleanOwned(dir,parent){const absolute=path.resolve(dir),root=path.resolve(parent);if(!absolute.startsWith(root+path.sep)||!/^asr-(?:job|install)-/.test(path.basename(absolute)))throw Error('Refusing cleanup outside owned ASR temporary directory');try{const real=await fsp.realpath(absolute),realRoot=await fsp.realpath(root);if(!real.startsWith(realRoot+path.sep))throw Error('ASR cleanup target escaped its root');await fsp.rm(absolute,{recursive:true,force:true});}catch(e){if(e.code!=='ENOENT')throw e;}}
function processIsAlive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
async function cleanupStaleJobs(jobs,cacheDir,{now=Date.now()}={}){
 let removed=0;
 try{
  const [rootStat,cacheStat]=await Promise.all([fsp.lstat(jobs),fsp.lstat(cacheDir)]);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||!cacheStat.isDirectory()||cacheStat.isSymbolicLink())return removed;
  const [realRoot,realCache]=await Promise.all([fsp.realpath(jobs),fsp.realpath(cacheDir)]);
  if(path.relative(realCache,realRoot)!=='jobs')return removed;
  for(const entry of await fsp.readdir(jobs,{withFileTypes:true})){
   if(!entry.isDirectory()||entry.isSymbolicLink()||!/^asr-job-[A-Za-z0-9]{6}$/.test(entry.name))continue;
   const dir=path.join(jobs,entry.name);
   try{
    const [stat,real]=await Promise.all([fsp.lstat(dir),fsp.realpath(dir)]);
    if(!stat.isDirectory()||stat.isSymbolicLink()||path.dirname(real)!==realRoot||!Number.isFinite(stat.mtimeMs)||now-stat.mtimeMs<=24*60*60*1000)continue;
    const entries=await fsp.readdir(dir,{withFileTypes:true});
    if(entries.some(e=>!e.isFile()||e.isSymbolicLink()||!['original.wav','result.json','.asr-owner.json'].includes(e.name)))continue;
    if(entries.some(e=>e.name==='.asr-owner.json')){
     const marker=path.join(dir,'.asr-owner.json');if((await fsp.lstat(marker)).size>4096)continue;
     let owner;try{owner=JSON.parse(await fsp.readFile(marker,'utf8'));}catch{continue;}
     if(owner?.schema!==1||!Number.isSafeInteger(owner.pid)||owner.pid<1||processIsAlive(owner.pid))continue;
    }
    const current=await fsp.lstat(dir);
    if(current.isSymbolicLink()||now-current.mtimeMs<=24*60*60*1000)continue;
    await cleanOwned(dir,jobs);removed++;
   }catch{/* Cleanup is conservative and must not block a new transcription. */}
  }
 }catch{/* A missing/unavailable cache requires no startup cleanup. */}
 return removed;
}
function extractRuntime(bytes,dir){let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}if(end<0)throw Error('Invalid locked archive');let cursor=bytes.readUInt32LE(end+16),count=bytes.readUInt16LE(end+10),found=new Set();if(count>200)throw Error('Archive entry limit');for(let i=0;i<count;i++){if(bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid archive directory');const method=bytes.readUInt16LE(cursor+10),compressed=bytes.readUInt32LE(cursor+20),size=bytes.readUInt32LE(cursor+24),n=bytes.readUInt16LE(cursor+28),x=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42),name=bytes.subarray(cursor+46,cursor+46+n).toString('utf8'),wanted=lock.files.find(f=>name==='Release/'+f.name);cursor+=46+n+x+comment;if(!wanted)continue;if(found.has(wanted.name)||size!==wanted.bytes||compressed>10*1024*1024||bytes.readUInt32LE(offset)!==0x04034b50)throw Error('Locked archive mismatch');const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28),packed=bytes.subarray(start,start+compressed),value=method===0?packed:method===8?zlib.inflateRawSync(packed,{maxOutputLength:wanted.bytes}):null;if(!value||value.length!==wanted.bytes||sha(value)!==wanted.sha256)throw Error('Runtime checksum mismatch');fs.writeFileSync(path.join(dir,wanted.name),value,{flag:'wx'});found.add(wanted.name);}if(found.size!==lock.files.length)throw Error('Runtime files missing');}
function createLocalASR(options={}){
 const supported=(options.platform||process.platform)==='win32'&&(options.arch||process.arch)==='x64',cacheDir=path.resolve(options.cacheDir||path.join(process.env.LOCALAPPDATA||os.tmpdir(),'IELTSLearning','local-asr-v1')),bundleDir=path.resolve(options.bundleDir||path.join(__dirname,'../runtime-packages/local-asr')),runtimeDir=path.join(cacheDir,'whisper-'+lock.version),modelPath=path.join(cacheDir,lock.model.file),jobs=path.join(cacheDir,'jobs');let installing=null,busy=false,maintenance=null,runtimeVerified=false;
 const ready=async()=>supported&&(await Promise.all(lock.files.map(f=>verified(path.join(runtimeDir,f.name),f)))).every(Boolean)&&await verified(modelPath,lock.model);
 async function download(item,target,signal){checkSignal(signal);const url=new URL(item.url),bundled=path.join(bundleDir,path.basename(url.pathname));if(fs.existsSync(bundled)){if(!await verified(bundled,item))throw fail('LOCAL_ASR_INTEGRITY','打包的本地识别依赖校验失败；原音保留，未运行依赖。');await fsp.copyFile(bundled,target);checkSignal(signal);}else{if(item.bundleOnly===true||url.hostname==='bundled.invalid')throw fail('LOCAL_ASR_BUNDLE_MISSING','学习包内的本地识别程序包缺失；原音保留，补齐或重新安装学习包后可重试。');if(options.offline===true)throw fail('LOCAL_ASR_OFFLINE','离线依赖包缺失；原音保留，连网安装或补齐依赖后可重试。');await run('curl.exe',['--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--connect-timeout','15','--max-time','180','--max-filesize',String(item.bytes),'--output',target,item.url],{signal,timeoutMs:190000});}if(!await verified(target,item))throw fail('LOCAL_ASR_INTEGRITY','本地识别依赖校验失败；原音保留，未运行下载内容。');}
 async function ensure({signal}={}){
  if(!supported)throw fail('LOCAL_ASR_UNSUPPORTED','本地英文转写当前仅支持Windows x64；原音保留。');checkSignal(signal);if(!maintenance)maintenance=cleanupStaleJobs(jobs,cacheDir);await maintenance;checkSignal(signal);if(await ready())return;if(installing)return installing;
  installing=(async()=>{await fsp.mkdir(cacheDir,{recursive:true});const stat=await fsp.statfs(cacheDir);if(Number(stat.bavail)*Number(stat.bsize)<400*1024*1024)throw fail('LOCAL_ASR_NO_SPACE','本地识别需要至少400MB可用空间；原音保留。');const stage=await fsp.mkdtemp(path.join(cacheDir,'asr-install-'));try{const archive=path.join(stage,'release.zip'),model=path.join(stage,lock.model.file),bin=path.join(stage,'bin');await fsp.mkdir(bin);await download(lock.release,archive,signal);extractRuntime(await fsp.readFile(archive),bin);await download(lock.model,model,signal);checkSignal(signal);await fsp.mkdir(runtimeDir,{recursive:true});for(const f of lock.files)await fsp.copyFile(path.join(bin,f.name),path.join(runtimeDir,f.name));await fsp.copyFile(model,modelPath);if(!await ready())throw fail('LOCAL_ASR_INTEGRITY','安装后的本地识别依赖校验失败；原音保留。');}finally{await cleanOwned(stage,cacheDir);}})().catch(error=>{if(error instanceof LocalASRError)throw error;throw fail('LOCAL_ASR_INSTALL_FAILED','本地识别依赖未安装完成，可能网络或磁盘不可用；原音保留，可稍后重试。');}).finally(()=>{installing=null;});return installing;
 }
 async function transcribe(bytes,{signal,timeoutMs=180000}={}){
  if(busy)throw fail('LOCAL_ASR_BUSY','已有本地转写正在进行；请等待或取消。');busy=true;let dir;
  try{checkSignal(signal);const durationSeconds=checkWav(bytes,{maxSeconds:180});if(!nonSilent(bytes))throw fail('LOCAL_ASR_SILENCE','原音没有足够可识别的声音；保留原音，不生成转写。');await ensure({signal});checkSignal(signal);await fsp.mkdir(jobs,{recursive:true});dir=await fsp.mkdtemp(path.join(jobs,'asr-job-'));const audio=path.join(dir,'original.wav'),out=path.join(dir,'result');await fsp.writeFile(path.join(dir,'.asr-owner.json'),JSON.stringify({schema:1,pid:process.pid,createdAt:Date.now()}),{flag:'wx'});await fsp.writeFile(audio,bytes,{flag:'wx'});await run(path.join(runtimeDir,'whisper-cli.exe'),['-m',modelPath,'-f',audio,'-l','en','-ng','-t',String(Math.max(1,Math.min(4,os.availableParallelism?.()||2))),'-oj','-of',out,'-np'],{signal,timeoutMs,cwd:runtimeDir});checkSignal(signal);const rawFile=out+'.json';if((await fsp.stat(rawFile)).size>2*1024*1024)throw fail('LOCAL_ASR_OUTPUT_LIMIT','本地转写结果过大；原音保留。');const raw=parseResult(await fsp.readFile(rawFile),modelPath),segments=(raw.transcription||[]).slice(0,1000).map((s,i)=>({id:'segment-'+i,startSeconds:s.offsets?.from/1000,endSeconds:s.offsets?.to/1000,text:typeof s.text==='string'?s.text.trim().replace(/</g,'＜').replace(/>/g,'＞'):'',confidence:null})).filter(s=>s.text&&Number.isFinite(s.startSeconds)&&Number.isFinite(s.endSeconds)&&s.startSeconds>=0&&s.endSeconds>s.startSeconds&&s.endSeconds<=durationSeconds+1),text=segments.map(s=>s.text).join(' ').trim();if(!text)throw fail('LOCAL_ASR_EMPTY','本地识别未得到可用英文；请回听原音并重试。');runtimeVerified=true;return{provider:'Local Whisper.cpp '+lock.version+' / base.en',text,segments,durationSeconds,audioSha256:sha(bytes),local:true,disclaimer:'本机英文自动转写可能漏词或改写，请对照原音核对。它不是发音分、完整口语评测或IELTS成绩。'};
  }finally{try{if(dir)await cleanOwned(dir,jobs);}finally{busy=false;}}
 }
 return{available:supported,ensure,transcribe,status:()=>({available:supported,availabilityBasis:'supported-platform-install-on-demand',runtimePrerequisite:staticRuntime?'Windows 10/11 x64 系统 Universal CRT（UCRT）':'Microsoft Visual C++ x64 runtime',requiresMsvcRedistributable:!staticRuntime,runtimePrerequisiteVerified:runtimeVerified,providerId:'whisper-cpp-local',provider:'Local Whisper.cpp',model:'base.en',local:true,maxSeconds:180,installing:!!installing,busy,modelBytes:lock.model.bytes}),paths:{cacheDir,runtimeDir,modelPath}};
}
module.exports={createLocalASR,LocalASRError,extractRuntime,run,processFailure,cleanupStaleJobs,parseResult,lock};
