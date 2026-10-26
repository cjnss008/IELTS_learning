'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),folder=path.join(root,'curriculum','independent-bank'),Audio=require('./independent-audio-provenance.cjs');
function build({requireAudio=true,write=true}={}){
 const materials=JSON.parse(JSON.stringify(require('./independent-bank.cjs').materials));
 for(const m of materials.filter(m=>m.skill==='listening')){
  const metaPath=path.join(folder,'audio',m.id+'.json');
  if(fs.existsSync(metaPath))Object.assign(m,Audio.fields(Audio.read(m,root)));
 }
 const human=require('./build-human-listening.cjs').build({requireAudio,write});materials.push(...human.materials);
 const {audit}=require('./audit-independent-bank.cjs'),report=audit(materials,{requireAudio});if(report.errors.length)throw Error(report.errors.join('\n'));
 const catalog={schema:2,status:report.status,sourceCount:report.sourceCount,voiceKinds:report.voiceKinds,humanReaders:report.humanReaders,scope:'分级独立分科短测；不进入普通追加队列、关卡或末期保留卷，不冒充完整40题卷。',materials:materials.map(m=>({id:m.id,title:m.title,level:m.level,skill:m.skill,questionCount:m.questions.length,estimatedMinutes:m.estimatedMinutes,fullTest:false,...(m.figureType?{figureType:m.figureType}:{}),...(m.audioLocale?{audioLocale:m.audioLocale,audioAccent:m.audioAccent,audioKind:m.audioKind||(m.audioSynthetic?'synthetic':'unknown'),audioSynthetic:m.audioSynthetic===true,audioDurationSeconds:m.audioDurationSeconds||0,...(m.audioKind==='human'?{reader:m.audioVoice,genre:m.source.genre}:{})}:{})})),sourceRegistry:'curriculum/independent-bank/sources.json',humanSourceRegistry:'curriculum/human-listening/catalog.json'};
 if(write){fs.mkdirSync(path.join(folder,'materials'),{recursive:true});for(const m of materials)fs.writeFileSync(path.join(folder,'materials',m.id+'.json'),JSON.stringify(m,null,2)+'\n');fs.writeFileSync(path.join(folder,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');fs.writeFileSync(path.join(folder,'audit.json'),JSON.stringify(report,null,2)+'\n');}
 return{materials,catalog,audit:report};
}
module.exports={build};if(require.main===module){const data=build({requireAudio:!process.argv.includes('--text-only')});console.log(JSON.stringify({status:data.audit.status,materials:data.materials.length,questions:data.audit.questions,syntheticLocales:data.audit.syntheticLocales}));}
