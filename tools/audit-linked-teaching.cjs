'use strict';
// Authoring triage only: lexical matches are review leads, not approval,
// learner completion, or proof of pedagogic quality.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const WARNING_LIMIT=1000,COMPARISON_LIMIT=200000,CHARACTER_LIMIT=80000000;
function stableJSON(value,depth=0){if(depth>40)throw Error('material nesting is too deep');if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(v=>stableJSON(v,depth+1)).join(',')+']';if(!value||typeof value!=='object')throw Error('material is not JSON');return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k],depth+1)).join(',')+'}';}
const contentHash=value=>hash(Buffer.from(stableJSON(value),'utf8'));
const normalize=value=>String(value||'').normalize('NFKC').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
const inside=(base,file)=>{const rel=path.relative(base,file);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep));};
const generic=new Set(['yes','no','true','false','not given','yes, he does.','no, he does not.','yes, she does.','no, she does not.']);
function substantive(answer){const a=normalize(answer).replace(/[.!?]+$/,'');if(/^\d+(?:[:.]\d+)?$/.test(a))return true;return a.length>=3&&!generic.has(a)&&!/^(?:yes|no)(?:[,\s.!?]+|$)/.test(a)&&/[a-z0-9]/.test(a);}
function exactPhrase(text,phrase){const t=normalize(text),p=normalize(phrase).replace(/[.!?]+$/,'');if(!p)return false;let start=-1;while((start=t.indexOf(p,start+1))!==-1){const before=t[start-1]||'',after=t[start+p.length]||'';if((!/[a-z0-9]/.test(p[0])||!/[a-z0-9]/.test(before))&&(!/[a-z0-9]/.test(p.at(-1))||!/[a-z0-9]/.test(after)))return true;}return false;}
function inspect(material,targets,earlierMaterials=[]){
 if(!Array.isArray(material.questions)||material.questions.length>200)throw Error('question array missing or too large');
 const rows=material.questions,warnings=[],seen=new Set(),questionIds=new Set(),limitReached=Symbol('limit');let omitted=0,comparisons=0,characters=0,limitReason='';
 const add=w=>{const key=JSON.stringify(w);if(seen.has(key))return;if(warnings.length>=WARNING_LIMIT){omitted++;limitReason='warning-limit';throw limitReached;}seen.add(key);warnings.push(w);};
 const matches=(text,phrase)=>{comparisons++;characters+=(typeof text==='string'?text.length:0)+(typeof phrase==='string'?phrase.length:0);if(comparisons>COMPARISON_LIMIT||characters>CHARACTER_LIMIT){limitReason='comparison-budget';throw limitReached;}return exactPhrase(text,phrase);};
 try{for(const q of rows){
  if(!q||typeof q.id!=='string'||!q.id||questionIds.has(q.id)||typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>5000||!Array.isArray(q.answers)||!q.answers.length||q.answers.length>20||q.answers.some(a=>typeof a!=='string'||!a.trim()||a.length>2000)||q.options!==undefined&&(!Array.isArray(q.options)||q.options.length>50||q.options.some(o=>typeof o!=='string'||o.length>2000))||q.evidence!==undefined&&(typeof q.evidence!=='string'||q.evidence.length>20000))throw Error('question prompt, answers, options or evidence cannot be inspected');questionIds.add(q.id);
  const answers=Array.isArray(q.answers)?q.answers.filter(x=>typeof x==='string'&&substantive(x)):[];
  const evidence=normalize(q.evidence);
  for(const t of targets){const quote=normalize(t.quote);if(evidence.length>=5&&matches(quote,evidence))add({type:'evidence-in-word-card',question:q.id,word:t.canonicalId});
   for(const answer of answers)if(matches(quote,answer))add({type:'answer-in-word-card',question:q.id,word:t.canonicalId});}
  for(const earlier of earlierMaterials){const kind=earlier.kind==='question-prompt'?'earlier-question':earlier.kind==='question-option'?'earlier-option':'earlier-material',detail={earlierMaterial:earlier.id,...(earlier.question?{earlierQuestion:earlier.question}:{})};
   if(evidence.length>=5&&matches(earlier.text,evidence))add({type:'evidence-in-'+kind,question:q.id,...detail});
   for(const answer of answers)if(matches(earlier.text,answer))add({type:'answer-in-'+kind,question:q.id,...detail});}
  if(evidence.length>=5)for(const other of rows)if(other!==q){if(matches(other.prompt,evidence))add({type:'evidence-in-other-prompt',question:q.id,otherQuestion:other.id});
   if(Array.isArray(other.options)&&other.options.some(option=>typeof option==='string'&&matches(option,evidence)))add({type:'evidence-in-other-option',question:q.id,otherQuestion:other.id});}
  for(const answer of answers){if(matches(q.prompt,answer))add({type:'answer-in-own-prompt',question:q.id});
   for(const other of rows)if(other!==q){if(matches(other.prompt,answer))add({type:'answer-in-other-prompt',question:q.id,otherQuestion:other.id});
    if(Array.isArray(other.options)&&other.options.some(option=>typeof option==='string'&&matches(option,answer)))add({type:'answer-in-other-option',question:q.id,otherQuestion:other.id});}}
  // A complete yes/no phrase in a different stem is a weak lead; bare yes/no
  // and repeated generic multiple-choice options are intentionally excluded.
  for(const answer of q.answers.filter(a=>/^(?:yes|no),\s*\S.{4,}/i.test(a.trim())))for(const other of rows)if(other!==q&&matches(other.prompt,answer))add({type:'generic-answer-in-other-prompt',question:q.id,otherQuestion:other.id});
 }}catch(error){if(error!==limitReached)throw error;}
 if(limitReason==='warning-limit')warnings.push({type:'warnings-truncated',omittedOccurrencesAtLeast:omitted});
 if(limitReason==='comparison-budget')warnings.push({type:'scan-incomplete',reason:limitReason});return warnings;
}
function readStable(base,relative){
 if(typeof relative!=='string'||relative.includes('\\')||relative.includes(':')||path.posix.isAbsolute(relative)||relative.split('/').some(x=>!x||x==='.'||x==='..')||!relative.endsWith('.json'))throw Error('invalid package JSON path');
 const normPath=p=>process.platform==='win32'?p.toLowerCase():p;
 if(normPath(fs.realpathSync.native(base))!==normPath(path.resolve(base)))throw Error('package root or an ancestor is a link');
 let cur=base;const parts=relative.split('/');for(const part of parts){cur=path.join(cur,part);const st=fs.lstatSync(cur);if(st.isSymbolicLink())throw Error('links are not accepted');}
 const before=fs.lstatSync(cur,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.ino<=0n||before.size>4n*1024n*1024n||!inside(fs.realpathSync.native(base),fs.realpathSync.native(cur)))throw Error('unsafe package file');
 const fd=fs.openSync(cur,'r');try{const opened=fs.fstatSync(fd,{bigint:true}),named=fs.statSync(cur,{bigint:true});
  if(!opened.isFile()||opened.nlink!==1n||opened.ino<=0n||opened.size>4n*1024n*1024n||before.dev!==opened.dev||before.ino!==opened.ino||before.size!==opened.size||before.mtimeNs!==opened.mtimeNs||named.dev!==opened.dev||named.ino!==opened.ino||named.nlink!==1n||named.size!==opened.size||named.mtimeNs!==opened.mtimeNs)throw Error('package file changed before opening');
  const bytes=Buffer.alloc(Number(opened.size));let offset=0;while(offset<bytes.length){const count=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);if(!count)throw Error('package file shortened while reading');offset+=count;}
  const after=fs.fstatSync(fd,{bigint:true});if(after.dev!==opened.dev||after.ino!==opened.ino||after.size!==opened.size||after.mtimeNs!==opened.mtimeNs)throw Error('package file changed while reading');return bytes;
 }finally{fs.closeSync(fd);}
}
function readFile(base,relative,expected){
 const bytes=readStable(base,relative);if(!/^[a-f0-9]{64}$/.test(expected||'')||hash(bytes)!==expected)throw Error('package file digest mismatch');return JSON.parse(bytes);
}
function verifyTargets(unit,materialById){
 if(!Array.isArray(unit.targets)||unit.targets.length>100||!Array.isArray(unit.tasks)||unit.tasks.length>12)throw Error('target or task array is invalid');
 const taskIds=new Set(),unitMaterials=new Set();for(const task of unit.tasks){if(!task||!['vocabulary','grammar','listening','reading','speaking','writing'].includes(task.id)||taskIds.has(task.id)||!Array.isArray(task.materialRefs))throw Error('invalid or duplicate task id');taskIds.add(task.id);for(const ref of task.materialRefs){const m=materialById.get(ref.materialId);if(!m||m.skill!==task.id||unitMaterials.has(ref.materialId))throw Error('task and material skill differ or material is duplicated');unitMaterials.add(ref.materialId);}}
 const cards=new Map(),vocabulary=unit.tasks.find(t=>t.id==='vocabulary');if(unit.targets.length&&!vocabulary)throw Error('vocabulary task is missing');
 for(const ref of vocabulary?.materialRefs||[]){const m=materialById.get(ref.materialId);if(!m||!Array.isArray(m.vocabulary))throw Error('vocabulary card source is missing');for(const card of m.vocabulary){const key=normalize(card.word);if(!key||cards.has(key))throw Error('duplicate or invalid vocabulary card');cards.set(key,card);}}
 const ids=new Set(),matchedCards=new Set();for(const target of unit.targets){if(!target||typeof target.canonicalId!=='string'||!target.canonicalId.startsWith('essential:')||ids.has(normalize(target.canonicalId)))throw Error('target id missing or duplicated');ids.add(normalize(target.canonicalId));
  const source=materialById.get(target.sourceMaterialId),text=source?.skill==='reading'?source.passage:source?.skill==='listening'?source.transcript:null,card=cards.get(normalize(target.canonicalId.slice('essential:'.length)));
  if(!unitMaterials.has(target.sourceMaterialId)||typeof text!=='string'||text.length>200000||hash(Buffer.from(text,'utf8'))!==target.sourceTextSha256||!Number.isInteger(target.start)||!Number.isInteger(target.end)||!Number.isInteger(target.quoteStart)||!Number.isInteger(target.quoteEnd)||target.quoteStart<0||target.quoteStart>target.start||target.start>=target.end||target.end>target.quoteEnd||target.quoteEnd>text.length||text.slice(target.start,target.end)!==target.surface||text.slice(target.quoteStart,target.quoteEnd)!==target.quote||!card||normalize(card.word)!==normalize(target.surface)||card.example!==target.quote)throw Error('word card and source quotation cannot be verified');
  matchedCards.add(normalize(card.word));
 }
 if(cards.size!==matchedCards.size||ids.size!==matchedCards.size)throw Error('some vocabulary cards are not represented by target quotations');
}
function audit(proposal,materialById){
 if(proposal?.active!==false||proposal?.notForLearningCredit!==true||!Array.isArray(proposal.units)||!Array.isArray(proposal.materials))throw Error('inactive authoring proposal required');
 const days=[];let referenceCount=0,warningCount=0;
 for(const unit of proposal.units){if(!Number.isInteger(unit.day)||!Array.isArray(unit.tasks)||unit.tasks.length>12||!Array.isArray(unit.targets)||unit.targets.length>100)throw Error('invalid unit');const results=[],earlier=[];
  for(const task of unit.tasks){if(!Array.isArray(task.materialRefs)||task.materialRefs.length>32)throw Error('invalid task references');if(typeof task.instructions==='string'&&task.instructions.trim())earlier.push({id:'task:'+task.id,kind:'task-instruction',text:task.instructions});for(const ref of task.materialRefs){if(++referenceCount>4000)throw Error('too many material references; split the proposal');const material=materialById.get(ref.materialId);if(!material)throw Error('missing task material');if(['reading','listening'].includes(material.skill)){const ownInstruction=typeof material.instructions==='string'&&material.instructions.trim()?[{id:material.id,kind:'material-instruction',text:material.instructions}]:[],warnings=inspect(material,unit.targets,[...earlier,...ownInstruction]);warningCount+=warnings.length;if(warningCount>10000)throw Error('too many review leads; split the proposal');results.push({materialId:material.id,skill:material.skill,questions:material.questions.length,inspection:material.questions.length?'scanned':'no-questions',evidenceNotCompared:material.questions.filter(q=>normalize(q.evidence).length<5).length,warnings});}
   // The planned order is a possible exposure, not proof that a particular
   // learner saw or heard the preceding task or sibling material.
   const fields=[material.passage,material.transcript,material.prompt,material.instructions,material.grammar?.explanation,material.grammar?.example].filter(x=>typeof x==='string'&&x.trim());if(fields.some(x=>x.length>200000))throw Error('earlier text is too large');if(fields.length)earlier.push({id:material.id,text:fields.join('\n')});
   if(material.questions!==undefined&&!Array.isArray(material.questions))throw Error('earlier questions are not an array');if((material.questions||[]).length>200)throw Error('too many earlier questions');
   for(const q of material.questions||[]){if(!q||typeof q!=='object'||q.options!==undefined&&(!Array.isArray(q.options)||q.options.length>50))throw Error('invalid earlier question');if(typeof q.prompt==='string')earlier.push({id:material.id,kind:'question-prompt',question:q.id,text:q.prompt});for(const option of q.options||[])if(typeof option==='string')earlier.push({id:material.id,kind:'question-option',question:q.id,text:option});if(earlier.length>10000)throw Error('too many preceding question fields');}}}
  days.push({day:unit.day,inspection:results.length?'listening-reading-reviewed-for-lexical-leads':'no-listening-or-reading-material',materials:results});
 }
 return {status:'inactive-heuristic-triage-only',targetBinding:'not-verified-by-in-memory-audit',limitations:['Lexical matches need human interpretation and can be false positives or miss paraphrases.','This does not validate teaching quality, source rights, learner history, audio, or IELTS scores.'],days};
}
function main(file){
 const absolute=path.resolve(file),base=path.dirname(absolute);if(path.basename(absolute)!=='release-proposal.json')throw Error('an inactive proposal JSON is required');
 const proposalBytes=readStable(base,'release-proposal.json'),proposal=JSON.parse(proposalBytes);if(proposal?.active!==false||proposal?.notForLearningCredit!==true||!Array.isArray(proposal.materials)||!proposal.materials.length||proposal.materials.length>1000||!Array.isArray(proposal.units)||!proposal.units.length||proposal.units.length>365)throw Error('nonempty inactive proposal required');
 const materialById=new Map(),hashById=new Map();for(const ref of proposal.materials){if(typeof ref.id!=='string'||materialById.has(ref.id))throw Error('duplicate material id');const material=readFile(base,ref.file,ref.fileSha256);if(material.id!==ref.id)throw Error('material id mismatch');if(material.pool!=='training'||material.fullTest!==undefined&&typeof material.fullTest!=='boolean'||material.independentBank!==undefined&&typeof material.independentBank!=='boolean'||material.fullTest||material.independentBank||material.assessmentGroup||material.form||material.source?.holdout)throw Error('only ordinary training material can be inspected');const materialHash=contentHash(material),questionsHash=hash(Buffer.from(JSON.stringify(material.questions||[]),'utf8'));if(ref.materialContentHash!==materialHash||ref.questionsSha256!==undefined&&ref.questionsSha256!==questionsHash)throw Error('material content hash mismatch');materialById.set(ref.id,material);hashById.set(ref.id,materialHash);}
 const days=new Set();for(const unit of proposal.units){if(!Number.isInteger(unit?.day)||unit.day<2||unit.day>365||days.has(unit.day))throw Error('invalid or duplicate course day');days.add(unit.day);verifyTargets(unit,materialById);for(const task of unit.tasks)for(const ref of task.materialRefs||[])if(hashById.get(ref.materialId)!==ref.contentHash)throw Error('task material hash mismatch');}
 return {...audit(proposal,materialById),targetBinding:proposal.units.some(u=>u.targets.length)?'source-and-card-consistent-self-declared':'no-targets-to-check',proposalSha256:hash(proposalBytes)};
}
if(require.main===module){try{if(process.argv.length!==3)throw Error('usage: node audit.cjs path/to/release-proposal.json');process.stdout.write(JSON.stringify(main(process.argv[2]),null,2)+'\n');}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={normalize,exactPhrase,inspect,audit,readFile,verifyTargets,contentHash,main};
