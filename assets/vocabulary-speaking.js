(function(root,factory){'use strict';const api=factory(root);root.IELTSVocabularySpeaking=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const THRESHOLDS={accuracy:80,fluency:75,completeness:90};
const validScore=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
function activity(samples,sampleRate=16000){
 if(!samples?.length||!Number.isFinite(sampleRate)||sampleRate<=0)throw Error('录音采样无效。');
 let energy=0,peak=0,voiced=0;const window=Math.max(1,Math.floor(sampleRate*.02));
 for(let i=0;i<samples.length;i+=window){let local=0;const end=Math.min(samples.length,i+window);for(let j=i;j<end;j++){const n=Number.isFinite(samples[j])?samples[j]:0;energy+=n*n;local+=n*n;peak=Math.max(peak,Math.abs(n));}if(Math.sqrt(local/(end-i))>=.008)voiced+=end-i;}
 const result={durationSeconds:samples.length/sampleRate,rms:Math.sqrt(energy/samples.length),peak,voicedSeconds:voiced/sampleRate};
 result.nonSilent=result.durationSeconds>=.25&&result.durationSeconds<=15.1&&result.rms>=.003&&peak>=.015&&result.voicedSeconds>=.12;return result;
}
async function prepareAudio(blob,options={}){
 const host=options.root||root,Context=options.AudioContext||host.AudioContext||host.webkitAudioContext,Offline=options.OfflineAudioContext||host.OfflineAudioContext||host.webkitOfflineAudioContext;
 const encode=options.encodeWav||host.IELTSSpeakingAudio?.encodeWav,base64=options.base64||host.IELTSMediaLibrary?.base64,crypto=options.crypto||host.crypto;
 if(!Context||!Offline||!encode||!base64||!crypto?.subtle)throw Error('浏览器不能整理真实原音，请用本地服务和近期Chrome/Edge打开。');
 const context=new Context();let buffer;try{buffer=await context.decodeAudioData(await blob.arrayBuffer());}finally{await context.close();}
 if(!Number.isFinite(buffer.duration)||buffer.duration<.25||buffer.duration>15.1)throw Error('每次词汇跟读请录0.25至15秒。');
 const frames=Math.floor(buffer.duration*16000),offline=new Offline(1,frames,16000),source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();
 const rendered=await offline.startRendering(),samples=rendered.getChannelData(0),signal=activity(samples);
 if(!signal.nonSilent)throw Error('没有检测到足够清晰的声音。本次无声或音量太低，不计跟读次数，请靠近麦克风重录。');
 const wav=encode(samples),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',wav))].map(value=>value.toString(16).padStart(2,'0')).join('');
 return{audio:base64(wav),hash,...signal};
}
function judge(result){const complete=Object.keys(THRESHOLDS).every(key=>validScore(result?.[key]));return{complete,passed:complete&&Object.keys(THRESHOLDS).every(key=>result[key]>=THRESHOLDS[key])};}
function create(options={}){
 const host=options.root||root,library=options.library||host.IELTSMediaLibrary?.createLibrary?.()||host.IELTSMediaLibrary,fetcher=options.fetch||host.fetch?.bind(host),prepare=options.prepareAudio||((blob)=>prepareAudio(blob,{...options,root:host}));
 const profile=()=>host.IELTSProfiles?.current?.()?.id||'legacy',owner=profile(),seenHashes=new Map();
 let phase='idle',message='',context=null,recorder=null,stream=null,timer=null,aborter=null,disposed=false,generation=0,completion=null,resolveCapture=null,preview=null;
 const busy=()=>['requesting','recording','saving','assessing'].includes(phase);
 function current(token=generation){return !disposed&&token===generation&&profile()===owner;}
 function check(token=generation){if(!current(token))throw Error('录音练习或学习档案已切换，原音不会写入其他档案。');}
 function state(){return{phase,message,busy:busy(),context:context?{...context}:null};}
 function announce(next,text){phase=next;message=text||'';options.onState?.(state());}
 function stopTracks(){stream?.getTracks?.().forEach(track=>track.stop());stream=null;}
 function clearTimer(own=timer){if(own)host.clearTimeout(own);if(timer===own)timer=null;}
 async function json(body,signal){if(!fetcher)throw Error('本地专业评测服务不可用。');const response=await fetcher('/api/oral/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',redirect:'error',cache:'no-store',signal});let result;try{result=await response.json();}catch(_){throw Error('专业服务返回无效，原音已保存，可重试。');}if(!response.ok||result.ok===false)throw Error(result.error?.message||'专业服务请求失败，原音已保存，可重试。');return result;}
 function validWork(work,word,ctx){return work?.kind==='audio'&&work.mode==='vocabulary_follow'&&work.task==='vocabulary_follow'&&work.originalText===word&&work.prompt===word&&work.materialId===ctx.materialId&&work.dayNumber===ctx.dayNumber&&work.blob&&work.blob.size>0&&/^audio\//.test(work.blob.type);}
 function proofFor(work,diagnosis,prepared,ctx){
  const result=diagnosis.result,judgement=judge(result);if(diagnosis.provider!=='Alibaba oral assessment'||result?.text!==work.originalText||!judgement.complete||typeof diagnosis.evidenceId!=='string'||!diagnosis.evidenceId)throw Error('专业结果缺少完整三维分数或没有匹配本词；原音保留，本次不计次数。');
  return{workId:work.id,reference:work.originalText,hash:prepared.hash,evidenceId:diagnosis.evidenceId,provider:diagnosis.provider,verified:true,nonSilent:true,durationSeconds:prepared.durationSeconds,recordedAt:work.createdAt,completedAt:diagnosis.completedAt||work.updatedAt,passed:judgement.passed,result:{accuracy:result.accuracy,fluency:result.fluency,completeness:result.completeness},wordIndex:ctx.wordIndex,trial:ctx.trial};
 }
 function checkDuplicate(hash,workId){const prior=seenHashes.get(hash);if(prior&&prior!==workId)throw Error('检测到与已计次数相同的原音；三次跟读必须分别重新录制，不能重复同一音频。');}
 async function publish(work,diagnosis,prepared,ctx,{archived=false,token=generation}={}){
  check(token);
  const proof=proofFor(work,diagnosis,prepared,ctx);checkDuplicate(proof.hash,work.id);
  if(!archived){
   const professional={pass:proof.passed,result:diagnosis.result,thresholds:{...THRESHOLDS},below:Object.keys(THRESHOLDS).filter(key=>diagnosis.result[key]<THRESHOLDS[key])};
   const evidence={source:'vocabulary-speaking',dayNumber:ctx.dayNumber,materialId:ctx.materialId,questionId:'vocab-word-'+ctx.wordIndex+'-trial-'+ctx.trial,reference:work.originalText,workId:work.id,evidenceId:proof.evidenceId,provider:'ali',verified:true,result:diagnosis.result,thresholds:{...THRESHOLDS},media:[{id:work.id,name:work.name,mime:work.blob.type,durationSeconds:prepared.durationSeconds}],returnUrl:ctx.returnUrl};
   if(!proof.passed){const errors=host.IELTSOralPractice?.mistakesFor?.(professional,evidence)||[{questionId:evidence.questionId,quote:work.originalText,reference:work.originalText,error:'BelowThreshold'}];if(options.onMistake)await options.onMistake(errors,evidence);else if(host.IELTSMistakes)await host.IELTSMistakes.captureOral(errors,evidence);else throw Error('错题本组件未加载，专业分数已保存，请重试同步后计入跟读。');}
   check(token);if(host.IELTSMistakes)await host.IELTSMistakes.recordOralEvidence(evidence);
  }
  check(token);seenHashes.set(proof.hash,work.id);return proof;
 }
 async function assess(work,prepared,ctx,token){
  check(token);checkDuplicate(prepared.hash,work.id);announce('assessing','原音已保存，正在进行阿里专业评测；失败时可重试同一原音。');
  const requestController=new AbortController();aborter=requestController;const timeout=host.setTimeout?.(()=>requestController.abort(),95000);
  try{const response=await json({reference:work.originalText,audio:prepared.audio,coreType:'en.sent.score'},requestController.signal);check(token);const diagnosis={provider:response.provider,evidenceId:response.evidenceId,result:response.result,pcmHash:prepared.hash,voiceActivity:{durationSeconds:prepared.durationSeconds,rms:prepared.rms,peak:prepared.peak,voicedSeconds:prepared.voicedSeconds,nonSilent:prepared.nonSilent},trainingVersion:2,captureComplete:false,completedAt:new Date().toISOString()};
   proofFor(work,diagnosis,prepared,ctx);await library.update(work.id,{diagnosis,evidenceId:diagnosis.evidenceId,queueStatus:'reviewed',lastError:''});check(token);const proof=await publish(work,diagnosis,prepared,ctx,{token});check(token);await library.update(work.id,{diagnosis:{...diagnosis,captureComplete:true},queueStatus:'reviewed'});check(token);await options.onAttempt?.(proof);check(token);announce('idle',proof.passed?'本次跟读已计入，专业指标达到门槛。':'本次真实跟读已计入，专业未达标问题已进入统一错题本。');return proof;
  }catch(error){if(current(token)){try{await library.update(work.id,{lastError:error.message.slice(0,500),queueStatus:'pending'});}catch(_){}if(current(token))announce('pending',error.message+' 本次尚未计入三次跟读，原音已保留。');}throw error;}
  finally{if(timeout)host.clearTimeout?.(timeout);if(aborter===requestController)aborter=null;}
 }
 async function process(blob,ctx,token){
  check(token);announce('saving','正在检测声音并保存本次独立原音……');const prepared=await prepare(blob);check(token);if(!prepared?.nonSilent||!/^[a-f0-9]{64}$/.test(prepared.hash))throw Error('无有效非静音原音，本次不计跟读次数。');checkDuplicate(prepared.hash,'new-capture');
  if(!library?.create||!library?.update)throw Error('本机原音作品库未加载，不能记录跟读次数。');
  const work=await library.create({kind:'audio',name:'词汇跟读 '+ctx.word+' · 第'+ctx.trial+'次',originalText:ctx.word,prompt:ctx.word,mode:'vocabulary_follow',task:'vocabulary_follow',level:ctx.level||'A0',materialId:ctx.materialId,dayNumber:ctx.dayNumber,durationSeconds:prepared.durationSeconds},blob);check(token);await options.onSaved?.(work,ctx);check(token);return assess(work,prepared,ctx,token);
 }
 async function start(word,ctx={}){
  check();if(busy())throw Error('请先结束当前跟读录音。');if(!host.navigator?.mediaDevices?.getUserMedia||!host.MediaRecorder)throw Error('浏览器无法使用麦克风，请从本地服务打开并允许录音。');
  if(typeof word!=='string'||!word.trim()||word.length>100||!Number.isInteger(ctx.wordIndex)||!Number.isInteger(ctx.trial)||ctx.trial<1||ctx.trial>3||!Number.isInteger(ctx.dayNumber)||!ctx.materialId)throw Error('本词录音关联信息无效。');
  preview?.audio.pause();const captureContext={...ctx,word};context=captureContext;const token=++generation;let received;announce('requesting','请允许麦克风；每次需要独立录音。');
  try{received=await host.navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});check(token);stream=received;
   const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'].find(type=>host.MediaRecorder.isTypeSupported?.(type)),local=new host.MediaRecorder(received,mime?{mimeType:mime}:{}),chunks=[];recorder=local;
   let resolveLocal,localTimer=null;completion=new Promise(resolve=>{resolveLocal=resolve;resolveCapture=resolve;});local.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};local.onerror=()=>{if(current(token)&&recorder===local)cancel('麦克风录音出错，本次不计次数。');};
   local.onstop=async()=>{clearTimer(localTimer);received.getTracks().forEach(track=>track.stop());if(stream===received)stream=null;if(recorder===local)recorder=null;let result=null;try{check(token);result=await process(new Blob(chunks,{type:local.mimeType||mime||'audio/webm'}),captureContext,token);}catch(error){if(current(token))announce('pending',error.message);}finally{resolveLocal(result);if(resolveCapture===resolveLocal)resolveCapture=null;}};
   local.start(250);timer=localTimer=host.setTimeout(()=>{if(current(token)&&recorder===local)stop();},15000);announce('recording','正在录音，请读出这个词；读完点击结束，最多15秒。');return state();
  }catch(error){received?.getTracks().forEach(track=>track.stop());if(stream===received)stream=null;if(current(token))announce('pending',error.message);throw error;}
 }
 function stop(){if(recorder?.state==='recording')recorder.stop();clearTimer();return completion||Promise.resolve(null);}
 async function retry(workId,ctx){check();if(busy())throw Error('当前正在录音或评测。');context={...ctx};const token=++generation;try{const work=await library.get(workId);check(token);if(!validWork(work,ctx.word,ctx))throw Error('未找到与本词和当前档案匹配的原音。');const prepared=await prepare(work.blob);check(token);return await assess(work,prepared,ctx,token);}catch(error){if(current(token))announce('pending',error.message);throw error;}}
 async function restore(workId,ctx){check();const token=generation,work=await library?.get?.(workId);check(token);if(!validWork(work,ctx.word,ctx))throw Error('跟读原音缺失或材料不匹配，请重新录音。');const prepared=await prepare(work.blob);check(token);if(!prepared.nonSilent||work.diagnosis?.pcmHash!==prepared.hash||work.diagnosis?.trainingVersion!==2||work.diagnosis?.captureComplete!==true||work.evidenceId!==work.diagnosis?.evidenceId)throw Error('该原音尚无可核对的完整专业评测，请重试评测。');return publish(work,work.diagnosis,prepared,ctx,{archived:true,token});}
 async function play(workId){check();if(['requesting','recording'].includes(phase))throw Error('请先结束当前麦克风录音，再回听旧原音。');const work=await library?.get?.(workId);check();if(!work?.blob||!host.Audio||!host.URL)throw Error('原音暂无法回放。');if(preview){preview.audio.pause();host.URL.revokeObjectURL(preview.url);}const url=host.URL.createObjectURL(work.blob),audio=new host.Audio(url);preview={url,audio};await audio.play();}
 function cancel(text='本次录音或等待已取消，未完成评测不计次数。'){generation++;clearTimer();preview?.audio.pause();aborter?.abort();if(recorder?.state==='recording')recorder.stop();recorder=null;stopTracks();resolveCapture?.(null);resolveCapture=null;if(!disposed)announce('idle',text);}
 function destroy(){if(disposed)return;cancel();disposed=true;if(preview){preview.audio.pause();host.URL.revokeObjectURL(preview.url);}host.removeEventListener?.('ielts:profile-changed',profileChanged);host.removeEventListener?.('pagehide',destroy);}
 function profileChanged(){cancel();disposed=true;announce('blocked','学习档案已切换，请刷新后继续；旧原音不会写入另一档案。');}
 host.addEventListener?.('ielts:profile-changed',profileChanged);host.addEventListener?.('pagehide',destroy);
 return{start,stop,retry,restore,play,cancel,destroy,getState:state};
}
return{THRESHOLDS,activity,prepareAudio,judge,create};
});
