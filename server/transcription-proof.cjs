'use strict';
const crypto=require('node:crypto');
class TranscriptionProofError extends Error{constructor(message){super(message);this.status=409;this.code='TRANSCRIPTION_EVIDENCE_MISMATCH';}}
function checkedTranscription(store,id,audioProof,text){
 const source=store?.get(id),fail=()=>{throw new TranscriptionProofError('自动转写与本次原音、文字或语音诊断不一致，原稿保留待评；请重新处理这份原音。');};
 if(!source||source.kind!=='transcription'||typeof id!=='string'||!id||typeof source.provider!=='string'||!source.provider.trim()||typeof source.text!=='string'||!source.text.trim()||source.text.length>10000||source.text!==text||!/^[a-f0-9]{64}$/.test(source.sha256||'')||!Number.isFinite(source.durationSeconds)||source.durationSeconds<=0||!Number.isFinite(source.createdAt))fail();
 if(!audioProof||!['pronunciation','free_speech_audio'].includes(audioProof.kind)||audioProof.audioSha256!==source.sha256||!Number.isFinite(audioProof.durationSeconds)||Math.abs(audioProof.durationSeconds-source.durationSeconds)>.1||audioProof.kind==='pronunciation'&&audioProof.reference!==source.text||audioProof.kind==='free_speech_audio'&&audioProof.transcript!==source.text)fail();
 return{schema:1,evidenceId:id,provider:source.provider,text:source.text,textSha256:crypto.createHash('sha256').update(source.text,'utf8').digest('hex'),audioSha256:source.sha256,durationSeconds:source.durationSeconds,verifiedAt:new Date(source.createdAt).toISOString()};
}
module.exports={checkedTranscription,TranscriptionProofError};
