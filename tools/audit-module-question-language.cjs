'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hasChinese=value=>typeof value==='string'&&/[\u3400-\u9fff]/.test(value);
function sourceFor(material,root){
 const direct=['curriculum/materials/'+material.id+'.json','curriculum/independent-bank/materials/'+material.id+'.json','curriculum/human-listening/materials/'+material.id+'.json'];
 const file=direct.find(f=>fs.existsSync(path.join(root,f)));if(file)return{sourcePath:file,derived:false};
 const match=material.id.match(/^(.*)-(speaking|writing)$/);if(match){const candidate='curriculum/materials/'+match[1]+'.json';if(fs.existsSync(path.join(root,candidate)))return{sourcePath:candidate,derived:true,sourceField:match[2]==='writing'?'transfer.writing':'transfer.speaking'};}
 return{sourcePath:'generated:assets/curriculum-data.js',derived:true};
}
function audit(data,root){
 const findings=[],bySkill={};
 for(const skill of ['listening','reading','speaking','writing']){
  const counts={materials:0,prompts:0,ChinesePrompts:0,optionStrings:0,ChineseOptions:0,materialsWithChinese:0};
  for(const material of data.materials.filter(m=>m.skill===skill)){
   counts.materials++;let affected=false;const source=sourceFor(material,root);
   const check=(text,field,kind,questionId)=>{if(kind==='prompt')counts.prompts++;else counts.optionStrings++;if(hasChinese(text)){counts[kind==='prompt'?'ChinesePrompts':'ChineseOptions']++;affected=true;findings.push({materialId:material.id,week:material.week,pool:material.pool,skill,...source,questionId,field,text});}};
   if(['speaking','writing'].includes(skill)&&material.prompt)check(material.prompt,'prompt','prompt');
   for(const [index,q] of (material.questions||[]).entries()){
    check(q.prompt,'questions['+index+'].prompt','prompt',q.id);
    const options=Array.isArray(q.optionsEnglish)&&q.optionsEnglish.length===(q.options||[]).length?q.optionsEnglish:q.options||[];
    options.forEach((text,oi)=>check(typeof text==='string'?text:JSON.stringify(text),'questions['+index+'].'+(options===q.optionsEnglish?'optionsEnglish':'options')+'['+oi+']','option',q.id));
   }
   if(affected)counts.materialsWithChinese++;
  }
  bySkill[skill]=counts;
 }
 const bySource=Object.values(findings.reduce((out,item)=>{const id=item.sourcePath;if(!out[id])out[id]={sourcePath:id,skills:[],ChinesePrompts:0,ChineseOptions:0,materialIds:[]};const row=out[id];if(!row.skills.includes(item.skill))row.skills.push(item.skill);if(!row.materialIds.includes(item.materialId))row.materialIds.push(item.materialId);row[item.field.includes('options')?'ChineseOptions':'ChinesePrompts']++;return out;},{}));
 return{schema:1,source:'assets/curriculum-data.js',sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/curriculum-data.js'))).digest('hex'),scope:'Displayed questions and choices in public listening, reading, speaking and writing modules. Grammar/vocabulary and Chinese operating explanations are intentionally outside this question-language check. No private generated placement exams or learner answers were opened.',bySkill,bySource,findings};
}
function main(root=path.resolve(__dirname,'..')){const report=audit(require(path.join(root,'assets/curriculum-data.js')),root),file=path.join(root,'curriculum','module-question-language-audit.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file,bySkill:report.bySkill,affectedSourceFiles:report.bySource.length}));return report;}
module.exports={audit,sourceFor,hasChinese,main};if(require.main===module)main(process.argv[2]?path.resolve(process.argv[2]):undefined);
