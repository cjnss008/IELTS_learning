'use strict';
// Authoring audit only. Requires ffmpeg and ffprobe; never reads learner media.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});if(result.status!==0)throw Error(command+' failed: '+String(result.stderr||result.error?.message||'').slice(-300));return result;}
function inspect(audio){
 const file=path.join(root,audio),bytes=fs.readFileSync(file),info=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',file]).stdout);
 const stream=info.streams.find(s=>s.codec_name==='mp3');if(!stream||stream.channels!==1||Number(stream.sample_rate)!==24000)throw Error(audio+': unexpected audio format');
 const decoded=run('ffmpeg',['-hide_banner','-nostats','-i',file,'-af','volumedetect','-f','null','-']).stderr,mean=Number(decoded.match(/mean_volume:\s*([-\d.]+) dB/)?.[1]),peak=Number(decoded.match(/max_volume:\s*([-\d.]+) dB/)?.[1]);
 if(!Number.isFinite(mean)||!Number.isFinite(peak)||mean<-55||peak<-40)throw Error(audio+': silent or too faint after real decoding');
 return{audio,audioHash:hash(bytes),bytes:bytes.length,durationSeconds:Number(info.format.duration),sampleRate:24000,channels:1,meanDb:mean,peakDb:peak};
}
function audit(){
 const data=require('./build-independent-bank.cjs').build({write:false}),index=require('../assets/vocabulary-audio.js'),frozen=require('../curriculum/sources/lexical-context-candidates.json').items,items=[];
 for(const m of data.materials.filter(m=>m.skill==='listening'&&m.audioSynthetic===true)){const item=inspect(m.audio),meta=JSON.parse(fs.readFileSync(path.join(root,'curriculum/independent-bank/audio',m.id+'.json'),'utf8'));if(item.audioHash!==meta.audioHash)throw Error('Audio hash mismatch '+m.id);items.push({...item,id:m.id,locale:m.audioLocale,kind:'independent-listening'});}
 for(const v of frozen){const entry=index.items[v.word],item=inspect(entry.audio);if(item.audioHash!==entry.audioHash||entry.textHash!==hash(Buffer.from(v.word)))throw Error('Word proof mismatch '+v.word);items.push({...item,word:v.word,kind:'lexical-model'});}
 const compact=index.items.compact,meta=JSON.parse(fs.readFileSync(path.join(root,'audio/vocabulary/metadata',path.basename(compact.audio,'.mp3')+'.json'),'utf8')),extraction=meta.contextExtraction;
 if(!extraction||extraction.spokenContext!=='Please compact the loose soil.'||extraction.targetWord!=='compact'||extraction.startSeconds<0||extraction.endSeconds<=extraction.startSeconds||extraction.endSeconds>extraction.sourceDurationSeconds+.1)throw Error('Missing contextual verb-pronunciation extraction proof');
 const source=inspect(extraction.sourceAudio);if(source.audioHash!==extraction.sourceAudioHash||extraction.contextHash!==hash(Buffer.from(extraction.spokenContext)))throw Error('Context pronunciation source mismatch');
 return{schema:1,status:'passed',listeningTracks:16,lexicalModels:70,listeningSeconds:items.filter(i=>i.kind==='independent-listening').reduce((n,i)=>n+i.durationSeconds,0),synthetic:true,scope:'ffprobe format/duration and full ffmpeg decoding with non-silent volume checks for all 86 new learning clips; transcript and byte hashes checked separately. Not an independent ASR, human-accent authenticity or pronunciation-scoring validation.',contextPronunciation:{word:'compact',purpose:'Verb stress supported by synthesis in an imperative sentence, then extraction using actual service word boundaries.',source,...extraction},items};
}
module.exports={audit,inspect};if(require.main===module){const report=audit();fs.writeFileSync(path.join(root,'curriculum','independent-bank','audio-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,items:undefined,contextPronunciation:{word:report.contextPronunciation.word,sourceAudio:report.contextPronunciation.sourceAudio}}));}
