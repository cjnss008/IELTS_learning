'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),folder=path.join(root,'curriculum','independent-bank');
function build({requireAudio=true,write=true}={}){
 const materials=JSON.parse(JSON.stringify(require('./independent-bank.cjs').materials));
 for(const m of materials.filter(m=>m.skill==='listening')){
  const metaPath=path.join(folder,'audio',m.id+'.json'),audio='audio/independent-bank/'+m.id+'.mp3';
  if(fs.existsSync(metaPath)&&fs.existsSync(path.join(root,audio))){const meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));Object.assign(m,{audio,audioDurationSeconds:meta.durationSeconds,audioVoices:meta.voices});}
 }
 const {audit}=require('./audit-independent-bank.cjs'),report=audit(materials,{requireAudio});if(report.errors.length)throw Error(report.errors.join('\n'));
 const catalog={schema:1,status:report.status,scope:'分级独立分科短测；不进入普通追加队列、关卡或末期保留卷，不冒充完整40题卷。',materials:materials.map(m=>({id:m.id,title:m.title,level:m.level,skill:m.skill,questionCount:m.questions.length,estimatedMinutes:m.estimatedMinutes,fullTest:false,...(m.figureType?{figureType:m.figureType}:{}),...(m.audioLocale?{audioLocale:m.audioLocale,audioAccent:m.audioAccent,audioSynthetic:true,audioDurationSeconds:m.audioDurationSeconds||0}:{})})),sourceRegistry:'curriculum/independent-bank/sources.json'};
 if(write){fs.mkdirSync(path.join(folder,'materials'),{recursive:true});for(const m of materials)fs.writeFileSync(path.join(folder,'materials',m.id+'.json'),JSON.stringify(m,null,2)+'\n');fs.writeFileSync(path.join(folder,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');fs.writeFileSync(path.join(folder,'audit.json'),JSON.stringify(report,null,2)+'\n');}
 return{materials,catalog,audit:report};
}
module.exports={build};if(require.main===module){const data=build({requireAudio:!process.argv.includes('--text-only')});console.log(JSON.stringify({status:data.audit.status,materials:data.materials.length,questions:data.audit.questions,syntheticLocales:data.audit.syntheticLocales}));}
