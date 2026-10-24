'use strict';
const {checkWav}=require('./speech.cjs');
const {BudgetError}=require('./budget.cjs');
class TranscriptionError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const safe=(text,key,max=20000)=>typeof text==='string'?text.split(key).join('[已隐藏]').replace(/</g,'＜').replace(/>/g,'＞').slice(0,max):'';
function normalize(data,key,duration){
 const text=safe((Array.isArray(data?.combinedPhrases)?data.combinedPhrases:[]).map(x=>typeof x?.text==='string'?x.text:'').join(' '),key);
 if(!text.trim())throw new TranscriptionError(502,'EMPTY_TRANSCRIPT','服务没有识别到可用文字，请先回听录音。');
 const segments=(Array.isArray(data.phrases)?data.phrases:[]).slice(0,1000).filter(p=>p&&typeof p.text==='string'&&Number.isFinite(p.offsetMilliseconds)&&Number.isFinite(p.durationMilliseconds)&&p.offsetMilliseconds>=0&&p.durationMilliseconds>=0&&p.offsetMilliseconds+p.durationMilliseconds<=(duration+2)*1000).map((p,index)=>({id:'segment-'+index,startSeconds:p.offsetMilliseconds/1000,endSeconds:(p.offsetMilliseconds+p.durationMilliseconds)/1000,text:safe(p.text,key,2000),confidence:typeof p.confidence==='number'&&p.confidence>=0&&p.confidence<=1?p.confidence:null}));
 return {text,segments,durationSeconds:duration,disclaimer:'自动转写可能漏词或改写。请逐段对照原音频编辑；转写置信度与时间戳不是发音分或IELTS成绩。'};
}
function createTranscriptionHandler({fetchImpl=fetch,budget,evidenceStore,getSpeechConfig=()=>null,timeoutMs=180000}={}){
 let config=null,controller=null,verified=false;
 const active=()=>config?.useSpeechConnection?getSpeechConfig():config;
 const status=()=>({ok:true,configured:Boolean(active()),provider:active()?.provider==='qwen-asr'?'Qwen ASR':'Azure fast transcription',providerId:active()?.provider||'azure',model:active()?.model||'',endpoint:active()?.endpoint||'',useSpeechConnection:Boolean(config?.useSpeechConnection),verified,credentialStorage:handle.getCredentialStorage?.()||'memory',maxSeconds:active()?.provider==='qwen-asr'?300:900});
 const send=(res,statusCode,body)=>{res.writeHead(statusCode,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 async function body(req){
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')throw new TranscriptionError(415,'JSON_REQUIRED','请使用JSON提交。');
  if(Number(req.headers['content-length'])>42*1024*1024){req.resume();throw new TranscriptionError(413,'AUDIO_TOO_LARGE','转写音频过大，请拆成15分钟以内的片段。');}
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>42*1024*1024)throw new TranscriptionError(413,'AUDIO_TOO_LARGE','转写音频过大。');chunks.push(chunk);}
  try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new TranscriptionError(400,'INVALID_JSON','提交内容不是有效JSON对象。');}
 }
 async function handle(req,res,pathname){
  if(!pathname.startsWith('/api/transcription/'))return false;
  let own,ticket;
  try{
   if(pathname==='/api/transcription/status'&&req.method==='GET')send(res,200,status());
   else if(pathname==='/api/transcription/connection'&&req.method==='DELETE'){controller?.abort();config=null;verified=false;await handle.onConfigurationChanged?.();send(res,200,status());}
   else if(pathname==='/api/transcription/configure'&&req.method==='POST'){
    const b=await body(req);let next;
    if(b.provider==='qwen-asr'){let u;try{u=new URL(b.baseUrl||b.endpoint);}catch{throw new TranscriptionError(400,'INVALID_ENDPOINT','请复制千问控制台提供的兼容模式HTTPS Base URL。');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||typeof b.apiKey!=='string'||b.apiKey.length<8||b.apiKey.length>4096||/[\s\x00-\x1f\x7f]/.test(b.apiKey)||typeof b.model!=='string'||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(b.model)||u.href.includes(b.apiKey)||b.model.includes(b.apiKey))throw new TranscriptionError(400,'INVALID_TRANSCRIPTION_CONFIG','请填写有效HTTPS地址、独立密钥与ASR模型名。');next={provider:'qwen-asr',endpoint:u.href.replace(/\/$/,''),apiKey:b.apiKey,model:b.model};}
    else if(b.provider&&b.provider!=='azure')throw new TranscriptionError(400,'INVALID_PROVIDER','不支持此转写适配。');
    else if(b.useSpeechConnection===true){if(!getSpeechConfig())throw new TranscriptionError(409,'SPEECH_NOT_CONFIGURED','请先保存Azure短句服务配置，或单独填写转写资源。');next={useSpeechConnection:true};}
    else{let u;try{u=new URL(b.endpoint);}catch{throw new TranscriptionError(400,'INVALID_ENDPOINT','请填写Azure Speech资源HTTPS地址。');}
     if(u.protocol!=='https:'||!/^[a-z0-9][a-z0-9-]*\.cognitiveservices\.azure\.com$/.test(u.hostname)||u.port||u.pathname!=='/'||u.username||u.password||u.search||u.hash||typeof b.apiKey!=='string'||!/^[a-zA-Z0-9]{16,128}$/.test(b.apiKey)||u.origin.includes(b.apiKey))throw new TranscriptionError(400,'INVALID_TRANSCRIPTION_CONFIG','请填写有效的Azure资源地址和独立密钥。');next={endpoint:u.origin,apiKey:b.apiKey};}
    controller?.abort();config=next;verified=false;await handle.onConfigurationChanged?.();send(res,200,status());
   }else if(pathname==='/api/transcription/transcribe'&&req.method==='POST'){
    const connection=active();if(!connection)throw new TranscriptionError(409,'TRANSCRIPTION_NOT_CONFIGURED','请在AI设置配置长口语转写服务。');
    if(controller)throw new TranscriptionError(429,'TRANSCRIPTION_BUSY','已有转写正在进行，请等待或取消。');
    own=controller=new AbortController();const b=await body(req);
    if(typeof b.audio!=='string'||b.audio.length>40*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.audio))throw new TranscriptionError(400,'INVALID_AUDIO','请选择有效的PCM WAV录音。');
    const bytes=Buffer.from(b.audio,'base64');if(bytes.toString('base64')!==b.audio)throw new TranscriptionError(400,'INVALID_AUDIO','录音编码无效。');
    let seconds;try{seconds=checkWav(bytes,{maxSeconds:connection.provider==='qwen-asr'?300:900});}catch{throw new TranscriptionError(400,'INVALID_AUDIO','转写需要16kHz单声道16-bit PCM WAV；千问ASR单次最长5分钟，Azure最长15分钟。');}
    ticket=budget?.reserveSpeech(connection,seconds);
    const form=new FormData();form.append('audio',new Blob([bytes],{type:'audio/wav'}),'practice.wav');form.append('definition',JSON.stringify({locales:['en-GB']}));
    const cancel=()=>{if(!res.writableEnded)own.abort();};res.once('close',cancel);
    try{
     const qwen=connection.provider==='qwen-asr';const response=await fetchImpl(connection.endpoint+(qwen?'/chat/completions':'/speechtotext/transcriptions:transcribe?api-version=2025-10-15'),{method:'POST',redirect:'error',signal:AbortSignal.any([own.signal,AbortSignal.timeout(timeoutMs)]),headers:qwen?{Authorization:'Bearer '+connection.apiKey,'Content-Type':'application/json',Accept:'application/json'}:{'Ocp-Apim-Subscription-Key':connection.apiKey,Accept:'application/json'},body:qwen?JSON.stringify({model:connection.model,messages:[{role:'user',content:[{type:'input_audio',input_audio:{data:'data:audio/wav;base64,'+b.audio}}]}],stream:false,asr_options:{language:'en',enable_itn:false}}):form});
     if(!response.ok){await response.body?.cancel();throw new TranscriptionError(response.status===401||response.status===403?401:502,'TRANSCRIPTION_UPSTREAM','转写服务未成功，请检查资源地区、权限、额度与网络。');}
     let length=0;const chunks=[];for await(const c of response.body){length+=c.length;if(length>2*1024*1024)throw new TranscriptionError(502,'TRANSCRIPTION_TOO_LARGE','转写响应过大，请缩短音频。');chunks.push(c);}
     let raw;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new TranscriptionError(502,'TRANSCRIPTION_FORMAT','转写响应格式无效。');}
     if(own.signal.aborted||active()!==connection)throw new TranscriptionError(409,'TRANSCRIPTION_CANCELLED','转写已取消或配置已改变。');
     const result=qwen?{text:safe(raw?.choices?.[0]?.message?.content,connection.apiKey),segments:[],durationSeconds:seconds,disclaimer:'千问自动转写可能漏词或改写；此适配未返回真实时间戳，不编造时间对齐。请对照原录音编辑，文字不是发音分。'}:normalize(raw,connection.apiKey,seconds);if(!result.text.trim())throw new TranscriptionError(502,'EMPTY_TRANSCRIPT','服务没有识别到可用文字，请回听并重试。');verified=true;const provider=qwen?'Qwen ASR':'Azure fast transcription';
     const evidenceId=evidenceStore?.add({kind:'transcription',provider,...result,sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex')});
     send(res,200,{ok:true,provider,...result,evidenceId});
    }finally{res.removeListener('close',cancel);}
   }else throw new TranscriptionError(404,'NOT_FOUND','转写接口不存在。');
  }catch(error){if(!res.destroyed&&!res.headersSent){const known=error instanceof TranscriptionError||error instanceof BudgetError;send(res,known?error.status:502,{ok:false,error:{code:known?error.code:'TRANSCRIPTION_FAILED',message:known?error.message:'转写失败、超时或已取消，原音频已保留。'}});}}
  finally{try{budget?.settle(ticket);}finally{if(own&&controller===own)controller=null;}}
  return true;
 }
 handle.status=status;handle.exportConfiguration=()=>config?{...config}:null;
 handle.restoreConfiguration=data=>{let next=null;if(data!==null){if(data.useSpeechConnection===true)next={useSpeechConnection:true};else if(data.provider==='qwen-asr'){const c=require('./saved-provider-config.cjs').compatible({baseUrl:data.endpoint,apiKey:data.apiKey,model:data.model});next={provider:'qwen-asr',endpoint:c.baseUrl,apiKey:c.apiKey,model:c.model};}else next=require('./saved-provider-config.cjs').azure(data);}controller?.abort();config=next;verified=false;};
 handle.close=()=>{controller?.abort();config=null;verified=false;};handle.containsCredential=text=>Boolean(active()?.apiKey&&text.includes(active().apiKey));return handle;
}
module.exports={createTranscriptionHandler,normalize,TranscriptionError};
