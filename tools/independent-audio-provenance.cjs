'use strict';
// Public authoring files only. File/configuration agreement is not an acoustic
// accent certification, an ASR comparison, or a learner pronunciation result.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const VOICE_SOURCE='https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts';
function validate(material,metadata,audioBytes){
 const m=material,meta=metadata,errors=[],fail=s=>errors.push(s),config=meta.configuration;
 if(meta.schema!==3||meta.id!==m.id||meta.synthetic!==true)fail('Synthetic generation identity mismatch');
 if(meta.locale!=='en-US'||!Array.isArray(meta.voices)||!meta.voices.length||meta.voices.some(v=>!/^en-US-[A-Za-z]+Neural$/.test(v)))fail('American synthetic voice provenance required');
 if(meta.audio!=='audio/independent-bank/us/'+m.id+'.mp3')fail('Published American audio path mismatch');
 if(meta.transcriptHash!==hash(m.transcript||''))fail('Transcript hash mismatch');
 if(meta.audioHash!==hash(audioBytes))fail('Actual MP3 byte hash mismatch');
 if(!(meta.durationSeconds>5)||!Number.isFinite(meta.durationSeconds)||!meta.provider||!meta.origin||!meta.layoutVersion)fail('Incomplete generation provenance');
 if(!config||meta.configurationHash!==hash(JSON.stringify(stable(config))))fail('Generation configuration hash mismatch');
 if(config){
  if(config.transcriptHash!==meta.transcriptHash||config.layoutVersion!==meta.layoutVersion)fail('Configuration/source identity mismatch');
  const segments=config.segments;
  if(!Array.isArray(segments)||!segments.length)fail('Missing planned source segments');
  else{
   const voices=[...new Set(segments.map(s=>s.voice))];
   if(JSON.stringify(voices)!==JSON.stringify(meta.voices))fail('Published voices differ from generated source segments');
   for(const s of segments){if(!Number.isInteger(s.sourceStart)||!Number.isInteger(s.sourceEnd)||s.sourceStart<0||s.sourceEnd<=s.sourceStart||s.sourceEnd>m.transcript.length||m.transcript.slice(s.sourceStart,s.sourceEnd).trim()!==s.text||hash(s.text)!==s.textHash||config.roleVoices?.[s.role]!==s.voice)fail('Source segment/role proof mismatch');}
   if(!Array.isArray(meta.segments)||meta.segments.length!==segments.length)fail('Actual segment layout missing');
   else for(let i=0;i<segments.length;i++){const a=meta.segments[i],s=segments[i];if(a.voice!==s.voice||a.textHash!==s.textHash||a.sourceStart!==s.sourceStart||a.sourceEnd!==s.sourceEnd||!Number.isFinite(a.startSeconds)||!Number.isFinite(a.endSeconds)||a.startSeconds<0||a.endSeconds<=a.startSeconds||a.endSeconds>meta.durationSeconds+.1)fail('Actual segment timing/source mismatch');}
  }
 }
 return [...new Set(errors)];
}
function read(material,root){
 const metadataPath='curriculum/independent-bank/audio/'+material.id+'.json',raw=fs.readFileSync(path.join(root,metadataPath)),metadata=JSON.parse(raw);
 if(metadata.audio!=='audio/independent-bank/us/'+material.id+'.mp3')throw Error(material.id+': Published American audio path mismatch');
 const bytes=fs.readFileSync(path.join(root,metadata.audio)),errors=validate(material,metadata,bytes);if(errors.length)throw Error(material.id+': '+errors.join('; '));
 return{metadata,metadataPath,metadataSha256:hash(raw),audioBytes:bytes.length};
}
function fields(proof){const meta=proof.metadata;return{audio:meta.audio,audioKind:'synthetic',audioSynthetic:true,audioLocale:meta.locale,audioAccent:'美国英语（合成）',audioVoice:meta.voices[0],audioVoices:[...meta.voices],audioRoleVoices:{...meta.configuration.roleVoices},audioProvider:meta.provider,audioVoiceSource:VOICE_SOURCE,audioDurationSeconds:meta.durationSeconds,audioProvenance:{schema:1,metadataPath:proof.metadataPath,metadataSha256:proof.metadataSha256,transcriptHash:meta.transcriptHash,audioHash:meta.audioHash,configurationHash:meta.configurationHash,layoutVersion:meta.layoutVersion,origin:meta.origin,verification:'exact-source-configuration-and-MP3-byte-hashes',scope:'Recorded American TTS voice identities and file/source agreement; not independent acoustic accent or listening validation.'}};}
function materialErrors(material,proof){const expected=fields(proof);return Object.keys(expected).filter(key=>JSON.stringify(stable(material[key]))!==JSON.stringify(stable(expected[key]))).map(key=>'Published audio provenance mismatch: '+key);}
module.exports={hash,stable,validate,read,fields,materialErrors,VOICE_SOURCE};
