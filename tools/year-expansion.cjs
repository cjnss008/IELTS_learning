'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Manifest=require('./year-expansion-manifest.cjs'),Shared=require('../assets/course-expansion.js'),Lexicon=require('./curriculum-lexicon.cjs'),Quality=require('./audit-question-quality.cjs'),{validate}=require('./author-curriculum.cjs');
const root=path.join(__dirname,'..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex'),norm=text=>String(text||'').toLowerCase().replace(/\s+/g,' ').trim();
function earlyJudgementOption(value){return /^(?:true|false|not given)$/i.test(String(value??'').trim().replace(/[\s.!?。！？…]+$/u,'').replace(/\s+/g,' '));}
function spokenReference(passage,maxWords){
 let clean=String(passage||'').replace(/^[ \t]*\[[A-Z]\][ \t]*/gm,'').replace(/^\s*[A-Z][.：:]?\s*$/gm,'').replace(/^\s*(?:Passage|Paragraph)\s+[A-Z0-9]+[.:：]?\s*$/gmi,'').trim();
 // Only a sequential paragraph-label series is structural. A lone personal
 // initial such as A. Smith and sentence-internal letters remain spoken text.
 const labels=[...clean.matchAll(/^[ \t]*([A-Z])[.：:][ \t]+/gm)];
 if(labels.length>1&&labels.every((m,i)=>m[1].charCodeAt(0)===65+i))clean=clean.replace(/^[ \t]*[A-Z][.：:][ \t]+/gm,'');
 const sentences=clean.match(/[^.!?]+[.!?]+(?:["”']|$)?|[^.!?]+$/g)||[clean];let output='';for(const sentence of sentences){if((output+' '+sentence).split(/\s+/).length>maxWords&&output)break;output+=(output?' ':'')+sentence.trim();}return output;
}
function derived(reading){
 const common={version:'1',week:reading.week,level:reading.level,pool:'training',fullTest:false,yearExpansion:Manifest.VERSION,sourceMaterialId:reading.id,source:{...reading.source,kind:'derived-original',sourceId:reading.id,method:'从本次新原创阅读派生的规则、原句词与不同情境输出；不改名复用旧源。'},questions:[]},foundation=reading.week<=8,t=reading.transfer.speaking,baseMinimum=foundation?40:reading.week<=20?80:120,writingMinimum=Math.max(baseMinimum,Number((reading.transfer.writing.match(/at least\s+(\d+)\s+words/i)||[])[1]||0)),writingPrompt=(foundation?reading.transfer.writing.replace(/\b(?:write|use)\s+(?:at least\s+)?(?:\d+\s*(?:[–—-]|to)\s*\d+|\d+)\s+(?:(?:short|simple|complete|English)\s+)*sentences?\b/gi,'Write a short message'):reading.transfer.writing)+'\n'+(foundation?'Write 6–8 complete sentences and at least '+writingMinimum+' words.':'Write at least '+writingMinimum+' words.')+' Use your own new details. Do not copy the source text.';
 const vocabulary=reading.vocabulary.map(item=>{const quote=Lexicon.sourceSentence(reading,item.word);if(!quote)throw Error(reading.id+': unsupported lexical source '+item.word);return{...item,example:quote,sourceQuote:quote,sourceMaterialId:reading.id};});
 return[
  {...common,id:reading.id+'-grammar',skill:'grammar',type:'grammar',estimatedMinutes:20,title:reading.title+' · 规则与新语境练习',instructions:'先阅读本组中文规则与原句，区分新结构和已学规则，再完成独立句子；同一材料再次出现属于巩固，保持原ID。',passage:reading.grammar.explanation+'\n\n'+reading.grammar.example,questions:reading.grammar.questions.map((question,index)=>({...question,id:'q'+(index+1)}))},
  {...common,id:reading.id+'-vocabulary',skill:'vocabulary',type:'vocabulary',estimatedMinutes:20,title:reading.title+' · 原句词汇',instructions:'按确切源词形、词义与原句完成三写三读及三轮测试。已学词与新词分别安排，不把重复复制当作跨天掌握。',vocabulary,passage:vocabulary.map(item=>item.word+' — '+item.meaning+'\n'+item.example).join('\n\n')},
  {...common,id:reading.id+'-speaking',skill:'speaking',type:foundation?'foundation':'part1-3',estimatedMinutes:25,title:reading.title+' · 独立口语迁移',instructions:'先完成示范段的跟读诊断，再用不同人物、信息或立场录制自己的完整回答。示范与自由回答分别取证，服务未提供完整听音评阅时保持待评。',reference:spokenReference(reading.passage,foundation?80:160),prompt:foundation?t.part1.slice(0,5).join('\n'):'Part 1\n'+t.part1.join('\n')+'\n\nPart 2\n'+(Array.isArray(t.part2)?t.part2.join('\n'):t.part2)+'\n\nPart 3\n'+t.part3.join('\n'),parts:t,minWords:foundation?30:reading.week<=20?60:120,rubric:{taskType:foundation?'foundation':'part2'}},
  {...common,id:reading.id+'-writing',skill:'writing',type:foundation?'foundation':'paragraph',estimatedMinutes:25,title:reading.title+' · 新情境写作',instructions:(foundation?'独立写6—8句、至少'+writingMinimum+'词。':'独立写至少'+writingMinimum+'词。')+'再按真实反馈订正；不要照抄源文。同一提示再次使用属于订正或巩固，不冒充未见任务。',prompt:writingPrompt,minWords:writingMinimum,rubric:{taskType:foundation?'foundation':'generic'}}
 ].map(material=>{material.source={...material.source,parentContentHash:reading.source.contentHash};return Quality.updateContentHash(material);});
}
function load(options={}){
 const project=options.root||root,materials=[],missing=[],errors=[],audioMissing=[],seen=new Map((options.existingMaterials||[]).filter(material=>material.passage||material.transcript).map(material=>[hash(norm(material.passage||material.transcript)),material.id]));
 for(const job of Manifest.jobs){
  const file=path.join(project,'curriculum/materials',job.id+'.json');if(!fs.existsSync(file)){missing.push(job.id);continue;}
  let material;try{material=JSON.parse(fs.readFileSync(file,'utf8'));const issues=validate(job,material);if(material.id!==job.id||material.yearExpansion!==Manifest.VERSION||material.pool!=='training'||material.fullTest!==false)issues.push('New source identity/pool mismatch');
   if((material.questions||[]).some(question=>/[\u3400-\u9fff]/.test(question.prompt+JSON.stringify(question.options||[]))))issues.push('All source question prompts/options must be English');
   if(['reading','listening'].includes(job.skill)){const text=material.passage||material.transcript;if(material.grammar?.questions?.length<8)issues.push('Need at least eight new grammar questions');if(material.questions.some(question=>!text.includes(question.evidence)))issues.push('Question evidence must be exact source text');if(job.level==='A0'||job.level==='A1')if(material.questions.some(question=>(question.options||[]).some(earlyJudgementOption)))issues.push('Early source needs concrete direct questions');const key=hash(norm(text)),prior=seen.get(key);if(prior&&prior!==job.id)issues.push('Renamed duplicate source: '+prior);seen.set(key,job.id);}
   if(['reading','listening'].includes(job.skill)){const transfer=material.transfer?.speaking;if(!Array.isArray(transfer?.part1)||!Array.isArray(transfer?.part3)||!(typeof transfer.part2==='string'||Array.isArray(transfer.part2))||typeof material.transfer?.writing!=='string')issues.push('Complete speaking/writing transfer fields required');else if(/[\u3400-\u9fff]/.test(JSON.stringify(transfer)+material.transfer.writing))issues.push('Output transfer questions must be English');}if(material.skill==='writing'&&/[\u3400-\u9fff]/.test(material.prompt||''))issues.push('Writing prompt must be English');
   if(material.source?.kind!=='original')issues.push('External imports need a separate per-source rights audit; authoring jobs default to original');if(material.source?.verification!=='reviewed')issues.push('Reviewed source required');
   if(issues.length)throw Error([...new Set(issues)].join('; '));
   // Preserve the author's original hash and add a recomputable compiled hash
   // over the documented public content fields.
   const authorHash=material.source?.contentHash;Quality.updateContentHash(material);if(authorHash&&authorHash!==material.source.contentHash)material.source.authoringContentHash=authorHash;
   material.version=String(material.version||'1');material.questionLanguage='en';
   // Persist ordinary-practice scope inside the bound source snapshot as well
   // as the schedule. A later hydration must not turn these into gate evidence.
   material.source={...material.source,yearExpansion:Manifest.VERSION,practiceOnly:true,independentAssessmentEligible:false,independentTransferEligible:false};
   if(material.skill==='listening'){
    const relative='audio/curriculum/'+job.id+'.mp3',audio=path.join(project,relative),metaFile=path.join(project,'curriculum/audio',job.id+'.json');material.audio='';material.audioRequirements={...job.audioRequirements,...material.audioRequirements,locale:'en-US',speakLabels:false};
    if(fs.existsSync(audio)&&fs.existsSync(metaFile)){const meta=JSON.parse(fs.readFileSync(metaFile,'utf8'));if(meta.transcriptHash!==hash(material.transcript)||meta.audioHash!==hash(fs.readFileSync(audio)))throw Error('Audio/transcript hash mismatch');const us=meta.locale==='en-US'||meta.audioLocale==='en-US'||(meta.voices||[]).length&&(meta.voices||[]).every(voice=>/^en-US[-_]/i.test(voice));if(!us)throw Error('US demonstration voice provenance required');material.audio=relative;material.audioVoice=(meta.voices||[]).join(' / ');material.audioSynthetic=meta.synthetic!==false;material.audioDurationSeconds=meta.durationSeconds;}
    if(!material.audio)audioMissing.push(job.id);
    if(options.requireAudio&&!material.audio)throw Error('US listening audio not ready');
   }
   materials.push(material);
  }catch(error){if(!options.partial)throw Error(job.id+': '+error.message);missing.push(job.id);errors.push({id:job.id,error:error.message});}
 }
 if(missing.length&&!options.partial)throw Error('Year expansion incomplete: '+missing.length+' authored sources/prompts missing');
 const sourceCount=materials.filter(material=>['reading','listening'].includes(material.skill)).length,prompts=materials.filter(material=>material.skill==='writing').length;
 if(options.derive!==false)for(const reading of materials.filter(material=>material.skill==='reading'))materials.push(...derived(reading));
 return{materials,missing,audit:{version:Manifest.VERSION,status:missing.length||audioMissing.length?'pending':'ready-for-staging',expectedJobs:Manifest.jobs.length,loadedJobs:Manifest.jobs.length-missing.length,expectedNewSources:208,newSources:sourceCount,additionalWritingPrompts:prompts,derivedMaterials:materials.length-sourceCount-prompts,missing,audioMissing,errors,stages:Manifest.STAGES,rights:'Project-original sources by default; linked third-party resources and unlicensed GitHub PDFs/audio are not bundled.',limits:'Two new readings and two new listenings weekly, rotated with explicit revision; not seven unique new texts each week. Source generation, hashes and service success do not prove learner Band 7.'}};
}
function assignments(days,materials){
 const available=new Map(materials.map(material=>[material.id,material])),out={},first=new Map();
 for(const day of days){if(day.day<2||day.day>364)continue;const variant=day.weekday<=3?1:2,prefix='expand-w'+String(day.week).padStart(2,'0'),read=prefix+'-read-'+variant,listen=prefix+'-listen-'+variant,writing=day.week>=21&&[3,5].includes(day.weekday)?prefix+'-task1':day.week>=21&&[6,7].includes(day.weekday)?prefix+'-task2':read+'-writing',taskMaterialIds={vocabulary:[read+'-vocabulary'],grammar:[read+'-grammar'],reading:[read],listening:[listen],speaking:[read+'-speaking'],writing:[writing]};
  for(const [skill,ids]of Object.entries(taskMaterialIds))taskMaterialIds[skill]=ids.filter(id=>available.has(id));
  const reserved=day.tasks.some(task=>task.mode==='assessment'||task.materialIds.some(id=>['gate','final'].includes(available.get(id)?.pool)||available.get(id)?.fullTest));
  const materialPractice={};for(const id of Object.values(taskMaterialIds).flat()){if(!first.has(id))first.set(id,day.day);materialPractice[id]={materialId:id,cycle:first.get(id)===day.day?'first-planned':'scheduled-reuse',firstPlannedDay:first.get(id)};}
  out[day.day]={day:day.day,week:day.week,variant,afterCore:reserved,taskMaterialIds,materialPractice};
 }
 return out;
}
function budgetPlan(data,materials,options={}){
 const Planner=require('./year-budget-planner.cjs'),catalog=options.catalog||require('../assets/public-context-practice-data.js'),ids=new Set(materials.map(m=>m.id));
 const base={...data,materials:data.materials.filter(m=>!ids.has(m.id))};delete base.yearExpansion;
 const inputHash=hash(JSON.stringify({days:base.days,materials:base.materials,yearMaterials:materials,publicPlanHash:base.publicCoursePlan?.planHash,catalog}));
 const plan=Planner.build({base,yearMaterials:materials,catalog,inputHash},options);
 plan.version=Manifest.VERSION;plan.active=false;plan.status='validated-first-use-candidate-with-explicit-pending';
 return plan;
}
function applySchedule(days,data){
 // New plans are composed after required public planning and admitted by the
 // owner/runtime queue. Never feed this schema to the old unconditional append.
 if(data.yearExpansion?.schema==='year-budget-first-use-v1')return days;
 return days.map(source=>{let day=source;if(source.day>=2&&source.day<=364&&!data.yearExpansion.assignments[source.day]?.afterCore){day=JSON.parse(JSON.stringify(source));for(const task of day.tasks)if(Shared.RECOMMENDED_MINUTES[task.id]!==undefined)task.minutes=Shared.RECOMMENDED_MINUTES[task.id];}return Shared.overlay(day,data);});
}
module.exports={...Manifest,spokenReference,derived,load,assignments,applySchedule,budgetPlan};
