'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const words=s=>(String(s||'').match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length;
const answerWords=s=>(String(s||'').match(/[A-Za-z0-9]+(?:['’.-][A-Za-z0-9]+)*/g)||[]).length;
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function contentHash(m){return hash(JSON.stringify(Object.fromEntries(m.source.contentHashFields.map(key=>[key,m[key]]))));}
function figureErrors(f){
 const out=[];if(!f||!['table','line','bar','pie','map','process','mixed'].includes(f.type))return['Unknown figure type'];
 if(f.type==='map'){if(f.map?.northUp!==true||!f.map.beforeYear||!f.map.afterYear)out.push('Map needs years and north orientation');for(const key of ['before','after']){if(!Array.isArray(f.map?.[key])||!f.map[key].length)out.push('Map needs both versions');else for(const o of f.map[key])if(!o.name||![o.x,o.y,o.w,o.h].every(Number.isFinite)||o.x<0||o.y<0||o.w<=0||o.h<=0||o.x+o.w>100||o.y+o.h>100)out.push('Invalid map geometry');}}
 else if(f.type==='process'){if(!Array.isArray(f.steps)||f.steps.length<6||f.steps.some(s=>typeof s!=='string'||!s.trim()))out.push('Process needs concrete ordered stages');}
 else if(f.type==='mixed'){if(!Array.isArray(f.parts)||f.parts.length<2)out.push('Mixed figure needs two panels');else for(const p of f.parts)out.push(...figureErrors(p));}
 else if(f.type==='table'&&f.rows){if(f.rows.length<2||f.rows.some(r=>!Array.isArray(r)||r.length!==f.rows[0].length))out.push('Invalid table rows');}
 else{if(!f.labels?.length||!f.series?.length||f.series.some(s=>!s.name||s.values?.length!==f.labels.length||s.values.some(v=>!Number.isFinite(v)||v<0)))out.push('Invalid chart series');if(f.type==='pie'&&f.series?.some(s=>Math.abs(s.values.reduce((a,b)=>a+b,0)-100)>.001))out.push('Pie total must be 100');}
 if(!f.title)out.push('Missing figure title');return out;
}
function audit(materials,{requireAudio=true,courseData=null,lexical=null,projectRoot=root}={}){
 const errors=[],questionReview=[],sources=new Map(),ids=new Set(),levels={},voices={},humanMaterials=materials.filter(m=>m.audioKind==='human');
 for(const m of materials){
  const fail=s=>errors.push(m.id+': '+s);if(ids.has(m.id))fail('Duplicate ID');ids.add(m.id);
  if(m.pool!=='independent'||m.independentBank!==true||m.fullTest!==false||m.assessmentGroup)fail('Pool isolation failed');
  if(!m.source?.contentHashFields||m.source.contentHash!==contentHash(m))fail('Content hash does not match declared fields');
  if(m.source?.kind!==(m.audioKind==='human'?'public-domain-human-reading':'original')||!m.source.rights||m.source.verification!=='reviewed')fail('Missing original or licensed provenance');
  levels[m.level]??={reading:0,listening:0};if(['reading','listening'].includes(m.skill)&&m.audioKind!=='human')levels[m.level][m.skill]++;
  if(['reading','listening'].includes(m.skill)){
   const source=m[m.skill==='reading'?'passage':'transcript'];if(!source||words(source)<70)fail('Source too short');
   const key=hash(normalize(source));if(sources.has(key))fail('Repeated source '+sources.get(key));sources.set(key,m.id);
   if(!Array.isArray(m.questions)||(m.audioKind==='human'?m.questions.length<4||m.questions.length>8:m.questions.length!==8))fail('Invalid focused question count');
   const qids=new Set();for(const q of m.questions||[]){
    if(qids.has(q.id))fail('Duplicate question ID '+q.id);qids.add(q.id);
    if(!q.prompt||!q.explanation||!q.evidence||!source.includes(q.evidence))fail('Question evidence not verbatim '+q.id);
    if(!['single','fill'].includes(q.type)||!Array.isArray(q.answers)||!q.answers.length)fail('Invalid question '+q.id);
    if(q.type==='single'&&(!Array.isArray(q.options)||q.options.length!==3||new Set(q.options).size!==3||q.answers.length!==1||!q.options.includes(q.answers[0])))fail('Invalid options '+q.id);
    if(q.type==='fill'){if(!Number.isInteger(q.maxWords)||q.maxWords<1)fail('Missing word limit '+q.id);for(const a of q.answers||[])if(!source.toLowerCase().includes(a.toLowerCase())||answerWords(a)>q.maxWords)fail('Invalid fill answer '+q.id+': '+a);}
    questionReview.push({materialId:m.id,questionId:q.id,sourceHash:hash(source),questionHash:hash(JSON.stringify(q)),method:'Codex author self-review against complete source; explanations identify the decisive distinction. Not a human examiner review.'});
   }
  }else if(m.skill==='writing'){
   if(!/at least 150 words/i.test(m.prompt||''))fail('Missing minimum word instruction');
   if(m.rubric?.taskType!=='academic_task1'||m.figureType!==m.figure?.type)fail('Task/figure mismatch');
   for(const error of figureErrors(m.figure))fail(error);
   if((m.title+'\n'+m.prompt+'\n'+JSON.stringify(m.figure)).length>3000)fail('Figure and prompt exceed complete-review request limit');
  }else fail('Unsupported independent skill');
  if(m.skill==='listening'&&m.audioKind!=='human'){
   if(m.audioSynthetic!==true||!m.audioLocale||!m.audioVoiceSource)fail('Synthetic provenance missing');voices[m.audioLocale]=(voices[m.audioLocale]||0)+1;
   if(requireAudio){try{const proof=require('./independent-audio-provenance.cjs').read(m,projectRoot);for(const error of require('./independent-audio-provenance.cjs').materialErrors(m,proof))fail(error);}catch(error){fail('Audio/source proof mismatch: '+error.message);}}
  }
 }
 const humanAudit=require('./audit-human-listening.cjs').audit(humanMaterials,{requireAudio,projectRoot});errors.push(...humanAudit.errors);
 if(materials.filter(m=>m.audioKind!=='human').length!==31)errors.push('Original independent bank must retain its 31 focused materials');
 for(const level of ['A1','A2','B1','B2'])if(levels[level]?.reading!==2||levels[level]?.listening!==4)errors.push('Expected 2 readings and 4 listening sources at '+level);
 if(new Set(materials.filter(m=>m.skill==='writing').map(m=>m.figureType)).size!==7)errors.push('Expected all seven Task1 figure types');
 if(courseData){
  const courseMap=new Map(courseData.materials.map(m=>[m.id,m]));for(const m of materials)if(courseMap.get(m.id)?.source?.contentHash!==m.source.contentHash)errors.push('Course bundle does not match independent authoring source: '+m.id);
  const scheduled=new Set(courseData.days.flatMap(d=>d.tasks.flatMap(t=>t.materialIds)));for(const id of ids)if(scheduled.has(id))errors.push('Independent source was scheduled in core training: '+id);
  for(const m of courseData.materials.filter(m=>!m.independentBank&&['reading','listening'].includes(m.skill))){const key=hash(normalize(m[m.skill==='reading'?'passage':'transcript']));if(sources.has(key))errors.push('Source reused from another pool: '+sources.get(key)+' / '+m.id);}
 }
 let lexicalAudit=null;
 if(lexical){
  const contexts=lexical.materials.filter(m=>m.type==='lexical-context'),packs=lexical.materials.filter(m=>m.skill==='vocabulary'),allWords=packs.flatMap(m=>m.vocabulary.map(v=>v.word));
  if(new Set(allWords).size!==70||allWords.length!==70)errors.push('The 70 lexical candidates were not covered exactly once');
  for(const p of packs){if(p.vocabulary.length>4)errors.push('Oversized lexical pack: '+p.id);const context=contexts.find(m=>m.id===p.contextMaterialId);if(!context)errors.push('Missing lexical application task: '+p.id);for(const v of p.vocabulary)if(!v.ipa||!v.meaning||!v.example||!context?.contextPassage.includes(v.sourceQuote)||!context.questions.some(q=>q.lexeme===v.word&&q.answers[0]===v.word&&q.evidence!==v.example))errors.push('Unbound lexical context: '+v.word);}
  for(const m of lexical.materials)if(m.source.contentHash!==contentHash(m))errors.push('Lexical content hash mismatch: '+m.id);
  if(courseData){const used=new Set(courseData.days.flatMap(d=>d.tasks.flatMap(t=>t.materialIds))),courseMap=new Map(courseData.materials.map(m=>[m.id,m]));for(const a of lexical.assignments)if(!used.has(a.packId)||!used.has(a.contextId))errors.push('Unscheduled lexical exercise: '+a.packId);for(const m of lexical.materials)if(courseMap.get(m.id)?.source?.contentHash!==m.source.contentHash)errors.push('Course bundle does not match lexical authoring source: '+m.id);}
  lexicalAudit={candidateWords:70,groups:packs.length,contextQuestions:contexts.reduce((n,m)=>n+m.questions.length,0),originalExamples:70};
 }
 return{schema:2,status:errors.length?'failed':requireAudio?'complete':'text-review-only',materials:materials.length,sourceCount:sources.size,questions:questionReview.length,levels,syntheticLocales:voices,humanLocales:humanAudit.humanLocales,humanReaders:humanAudit.humanReaders,voiceKinds:{synthetic:materials.filter(m=>m.skill==='listening'&&m.audioSynthetic===true).length,human:humanMaterials.length},figureTypes:materials.filter(m=>m.skill==='writing').map(m=>m.figureType),lexical:lexicalAudit,sourceHashMethod:'sha256 of JSON.stringify(Object.fromEntries(contentHashFields in declared order)); transcriptHash is sha256 of exact UTF-8 transcript; audioHash is sha256 of MP3 bytes.',reviewScope:'Codex author self-review of all '+questionReview.length+' source questions and seven chart prompts; not an independent human or psychometric review. 70 lexical application items reviewed as original sentence tasks. Human-source printed text/local ASR comparison and rights evidence have a separate report.',semanticReviewReport:'curriculum/independent-bank/semantic-review.json',humanReviewReport:'curriculum/human-listening/audit.json',audioDecodeReport:'curriculum/independent-bank/audio-audit.json',limits:['Focused assessments are not complete IELTS papers or official score calibration.','All current synthetic tracks use file-bound American TTS voice metadata; historical ID suffixes are stable identifiers, not current accents. Human variety labels retain explicit reader/source statements, not an acoustic certification.','An offline local catalogue avoids previewing answers; client-side files are not a secure exam vault.'],errors,questionReview};
}
module.exports={audit,figureErrors,contentHash,words};
if(require.main===module){const {build}=require('./build-independent-bank.cjs'),data=require('../assets/curriculum-data.js'),lexical=require('./lexical-contexts.cjs').build(),materials=build({requireAudio:!process.argv.includes('--text-only')}).materials,report=audit(materials,{requireAudio:!process.argv.includes('--text-only'),courseData:data,lexical});fs.writeFileSync(path.join(root,'curriculum','independent-bank','audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,questionReview:undefined}));if(report.errors.length)process.exitCode=1;}
