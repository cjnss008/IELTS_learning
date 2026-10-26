'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hasChinese=v=>typeof v==='string'&&/[\u3400-\u9fff]/.test(v);
function readConstJson(text,name){const marker='const '+name+'=',at=text.indexOf(marker);if(at<0)return null;let start=at+marker.length,depth=0,quoted=false,escape=false;for(let i=start;i<text.length;i++){const c=text[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(text.slice(start,i+1));}throw Error('Unclosed static '+name);}
function audit(data,root){
 const findings=[],invalidDisplayLabels=[],counts={materials:0,questions:0,questionPromptsChinese:0,optionStrings:0,optionStringsChinese:0,materialsWithChineseQuestionFields:0};
 for(const m of data.materials.filter(m=>m.skill==='listening')){
  counts.materials++;let affected=false;const paths=['curriculum/materials/'+m.id+'.json','curriculum/independent-bank/materials/'+m.id+'.json','curriculum/human-listening/materials/'+m.id+'.json'];
  const sourcePath=paths.find(file=>fs.existsSync(path.join(root,file)))||'generated:assets/curriculum-data.js';
  for(const [qi,q] of (m.questions||[]).entries()){
   counts.questions++;if(hasChinese(q.prompt)){counts.questionPromptsChinese++;affected=true;findings.push({materialId:m.id,week:m.week,pool:m.pool,sourcePath,questionId:q.id,field:'questions['+qi+'].prompt',text:q.prompt});}
   if(q.optionsEnglish!==undefined&&(!Array.isArray(q.optionsEnglish)||q.optionsEnglish.length!==(q.options||[]).length||q.optionsEnglish.some(s=>typeof s!=='string'||!s.trim())))invalidDisplayLabels.push({materialId:m.id,questionId:q.id,sourcePath});
   const displayOptions=Array.isArray(q.optionsEnglish)&&q.optionsEnglish.length===(q.options||[]).length?q.optionsEnglish:q.options||[];
   for(const [oi,option] of displayOptions.entries()){const text=typeof option==='string'?option:option.label||option.text||JSON.stringify(option);counts.optionStrings++;if(hasChinese(text)){counts.optionStringsChinese++;affected=true;findings.push({materialId:m.id,week:m.week,pool:m.pool,sourcePath,questionId:q.id,field:'questions['+qi+'].'+(displayOptions===q.optionsEnglish?'optionsEnglish':'options')+'['+oi+']',text});}}
  }
  if(affected)counts.materialsWithChineseQuestionFields++;
 }
 const grouped=Object.values(findings.reduce((a,f)=>{const k=f.sourcePath;if(!a[k])a[k]={sourcePath:k,materialId:f.materialId,week:f.week,pool:f.pool,ChinesePrompts:0,ChineseOptions:0};if(f.field.endsWith('.prompt'))a[k].ChinesePrompts++;else a[k].ChineseOptions++;return a;},{}));
 const shortFile='30分钟能力测试.html',shortTest=readConstJson(fs.readFileSync(path.join(root,shortFile),'utf8'),'TEST'),shortQuestions=(shortTest?.questions||[]).filter(q=>/^L/.test(q.id));
 const staticShort={sourcePath:shortFile,questions:shortQuestions.length,questionPromptsChinese:shortQuestions.filter(q=>hasChinese(q.prompt)).length,optionStrings:shortQuestions.reduce((n,q)=>n+(q.options?.length||0),0),optionStringsChinese:shortQuestions.reduce((n,q)=>n+(q.options||[]).filter(hasChinese).length,0)};
 return{schema:1,source:'assets/curriculum-data.js',sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/curriculum-data.js'))).digest('hex'),scope:'Public listening question prompts and displayed option strings only (optionsEnglish when present); stored legacy values, explanatory Chinese and learner/private placement records are excluded.',counts,bySource:grouped,findings,invalidDisplayLabels,staticShort,placement:{scope:'Public generator code only; no private generated placement tests or learner responses were read.',source:'server/placement.cjs',requiresGeneratorRule:true},otherStaticListeningSources:['assets/foundation.js (knowledge/grammar questions, not listening test items)','assets/assessment-core.js (scoring rules only, no listening questions)','tools/foundation-sounds.cjs (generator for sounds-01 to sounds-08)']};
}
function main(root=path.resolve(__dirname,'..')){const data=require(path.join(root,'assets/curriculum-data.js')),report=audit(data,root),file=path.join(root,'curriculum','listening-language-audit.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file,counts:report.counts,bySource:report.bySource}));return report;}
module.exports={audit,hasChinese,readConstJson,main};if(require.main===module)main(process.argv[2]?path.resolve(process.argv[2]):undefined);
