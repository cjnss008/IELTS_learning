'use strict';
(function (root) {
  const workletURL = root.document?.currentScript?.src ? new URL('pcm-capture-worklet.js', root.document.currentScript.src).href : 'assets/pcm-capture-worklet.js';
  const LIMITS = Object.freeze({
    reading: Object.freeze({ recordSeconds: 25, importSeconds: 30 }),
    free: Object.freeze({ recordSeconds: 180, importSeconds: 180 }),
  });
  function limitsFor(mode) { return mode === 'free' ? LIMITS.free : LIMITS.reading; }
  function validDuration(duration, mode) { return Number.isFinite(duration) && duration >= 0.1 && duration <= limitsFor(mode).importSeconds; }
  function formatTime(duration) {
    const seconds = Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  function encodeWav(samples) {
    if (!samples || !Number.isInteger(samples.length) || samples.length < 1 || samples.length > 16000 * 900) throw new Error('音频采样长度无效。');
    const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
    function chars(at, text) { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); }
    chars(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); chars(8, 'WAVE'); chars(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    chars(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const value = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
      view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
    }
    return new Uint8Array(buffer);
  }
  // Our short recordings use an explicit mono PCM WAV contract. Reading this
  // contract directly avoids browser/container decoders, including on restore.
  function decodePcmWav(bytes) {
    const buffer=bytes instanceof ArrayBuffer?bytes:bytes?.buffer?.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    if(!buffer||buffer.byteLength<44||buffer.byteLength>44+16000*900*2)return null;
    const v=new DataView(buffer),chars=(at,n)=>String.fromCharCode(...new Uint8Array(buffer,at,n));
    if(chars(0,4)!=='RIFF'||chars(8,4)!=='WAVE'||chars(12,4)!=='fmt '||v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(22,true)!==1||v.getUint32(24,true)!==16000||v.getUint32(28,true)!==32000||v.getUint16(32,true)!==2||v.getUint16(34,true)!==16||chars(36,4)!=='data')return null;
    const size=v.getUint32(40,true);if(size%2||size!==buffer.byteLength-44||v.getUint32(4,true)!==buffer.byteLength-8)return null;
    const samples=new Float32Array(size/2);for(let i=0;i<samples.length;i++)samples[i]=v.getInt16(44+i*2,true)/32768;
    return {samples,duration:samples.length/16000,sampleRate:16000};
  }
  async function createPCMRecorder(stream, options={}) {
    const host=options.root||root,Context=host.AudioContext||host.webkitAudioContext,Offline=host.OfflineAudioContext||host.webkitOfflineAudioContext;
    if(!Context||!Offline)throw Error('浏览器缺少原音录制能力，请用本地服务和近期Chrome/Edge打开。');
    if(options.signal?.aborted)throw Error('本次麦克风录音已取消。');
    let context;try{context=new Context({sampleRate:16000});}catch(_){context=new Context();}
    let node,source,sink,started=false,finished=false,cancelled=false,total=0,blocks=[],flushTimer=null,finishPromise=null,setupTimer=null,rejectSetup;
    const interruptedSetup=new Promise((_,reject)=>{rejectSetup=reject;});
    const onAbort=()=>{abort();rejectSetup(Error('本次麦克风录音已取消。'));};
    options.signal?.addEventListener('abort',onAbort,{once:true});
    setupTimer=host.setTimeout(()=>{abort();rejectSetup(Error('麦克风初始化超时，已关闭本次录音，请重试；已有输入和次数保留。'));},10000);
    async function setup(promise){await Promise.race([promise,interruptedSetup]);if(cancelled||options.signal?.aborted)throw Error('本次麦克风录音已取消。');}
    const maximumSeconds=Math.min(15,Math.max(.25,Number(options.maximumSeconds)||15)),maximumFrames=Math.floor(context.sampleRate*maximumSeconds);
    const recorder={state:'inactive',mimeType:'audio/wav',ondataavailable:null,onstop:null,onerror:null,start,stop,abort};
    function cleanup(){if(flushTimer)host.clearTimeout(flushTimer);flushTimer=null;if(setupTimer)host.clearTimeout(setupTimer);setupTimer=null;options.signal?.removeEventListener('abort',onAbort);for(const item of [source,node,sink])try{item?.disconnect();}catch(_){}if(node?.port)node.port.onmessage=null;if(node)node.onaudioprocess=null;stream?.getTracks?.().forEach(t=>t.stop());try{Promise.resolve(context.close()).catch(()=>{});}catch(_){}}
    function fail(error){if(finished)return;finished=true;recorder.state='inactive';blocks=[];cleanup();recorder.onerror?.({error});}
    function append(samples){if(finished||!started||!samples?.length)return;const length=Math.min(samples.length,maximumFrames-total);if(length>0){blocks.push(new Float32Array(samples.subarray(0,length)));total+=length;}}
    async function finish(){
      if(finished)return finishPromise;finished=true;recorder.state='inactive';cleanup();
      finishPromise=(async()=>{try{
        if(!total)throw Error('录音中没有收到声音数据。请等“正在录音”出现后，读完单词再点击结束。');
        const input=new Float32Array(total);let offset=0;for(const block of blocks){input.set(block,offset);offset+=block.length;}blocks=[];
        let samples=input;
        if(context.sampleRate!==16000){const offline=new Offline(1,Math.max(1,Math.round(total/context.sampleRate*16000)),16000),buffer=offline.createBuffer(1,total,context.sampleRate);buffer.getChannelData(0).set(input);const voice=offline.createBufferSource();voice.buffer=buffer;voice.connect(offline.destination);voice.start();samples=(await offline.startRendering()).getChannelData(0);}
        if(cancelled||options.signal?.aborted)return;
        const BlobType=host.Blob||Blob,blob=new BlobType([encodeWav(samples)],{type:'audio/wav'});recorder.ondataavailable?.({data:blob});if(!cancelled&&!options.signal?.aborted)await recorder.onstop?.();
      }catch(error){if(!cancelled)recorder.onerror?.({error});}})();return finishPromise;
    }
    function start(){if(started||finished)throw Error('这次录音已经开始或结束，请重新开启一次。');started=true;recorder.state='recording';node?.port?.postMessage({type:'start',maximumFrames});}
    function stop(){if(!started||finished||recorder.state!=='recording')return finishPromise;recorder.state='stopping';flushTimer=host.setTimeout(()=>fail(Error('麦克风数据未能及时收齐，本次不计次数，请重录。')),5000);if(node?.port)node.port.postMessage({type:'stop'});}
    function abort(){cancelled=true;finished=true;recorder.state='inactive';blocks=[];cleanup();}
    try{
      if(typeof context.resume==='function')await setup(context.resume());
      if(context.state&&context.state!=='running')throw Error('麦克风音频尚未启动，请再次点击开始录音。');
      if(context.audioWorklet&&host.AudioWorkletNode){
        await setup(context.audioWorklet.addModule(options.workletURL||workletURL));
        node=new host.AudioWorkletNode(context,'ielts-pcm-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'});
        node.port.onmessage=event=>{if(event.data?.type==='samples')append(event.data.samples);else if(event.data?.type==='stopped')finish();};
        node.onprocessorerror=()=>fail(Error('麦克风音频处理已中断，本次不计次数，请重录。'));
      }else if(typeof context.createScriptProcessor==='function'){
        node=context.createScriptProcessor(2048,1,1);node.onaudioprocess=event=>{if(!['recording','stopping'].includes(recorder.state))return;append(event.inputBuffer.getChannelData(0));if(recorder.state==='stopping'||total>=maximumFrames)finish();};
      }else throw Error('浏览器无法采集完整原音，请用近期Chrome/Edge重新打开本地页面。');
      source=context.createMediaStreamSource(stream);sink=context.createGain();sink.gain.value=0;source.connect(node);node.connect(sink);sink.connect(context.destination);if(setupTimer)host.clearTimeout(setupTimer);setupTimer=null;return recorder;
    }catch(error){abort();throw error;}
  }
  const api = Object.freeze({ limitsFor, validDuration, formatTime, encodeWav, decodePcmWav, createPCMRecorder });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IELTSSpeakingAudio = api;
})(globalThis);
