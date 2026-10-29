'use strict';

const RUNTIME_SOURCE=(()=>{const fs=require('node:fs'),crypto=require('node:crypto'),bytes=fs.readFileSync(__filename);return Object.freeze({path:'server/year-runtime-contract-policy.cjs',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});})();

// Shared by the explicit build validator and the running catalog. Roles identify
// reviewed consumers, so arbitrary files cannot impersonate a required consumer.
const MAX_COMPONENTS=52;
const REQUIRED_COMPONENTS=Object.freeze({
 'frontend-adapter':'assets/year-first-use-course.js',
 'queue-state':'assets/year-first-use-state.js',
 'queue-runtime':'assets/year-first-use-runtime.js',
 'daily-load':'assets/daily-learning-load.js',
 'course-player':'assets/course-player.js',
 'today-hub':'assets/today-hub.js',
 'backup-keys':'assets/backup-core.js',
 'user-data-browser':'assets/user-data-store.js',
 'user-data-server':'server/user-data.cjs',
 'server-catalog':'server/year-material-catalog.cjs',
 'server-routes':'server/server.cjs',
 'profile-bootstrap':'assets/user-data-bootstrap.js',
 'profile-store':'assets/profile-store.js',
 'learning-records':'assets/learning-records.js',
 'record-snapshot-index':'assets/record-snapshot-index.js',
 'assessment':'assets/assessment-core.js',
 'adaptive-plan':'assets/adaptive-plan.js',
 'year-planner':'assets/year-planner.js',
 'stage-progression':'assets/stage-progression.js',
 'study-timer-core':'assets/study-timer-core.js',
 'study-timer-ui':'assets/study-timer.js',
 'mistake-book':'assets/mistake-book.js',
 'daily-plan-state':'assets/daily-plan-state.js',
 'vocabulary-exposure':'assets/contextual-vocabulary-exposure.js',
 'memory-page-personalization':'个性化学习.html',
 'lexical-retention-feedback':'assets/lexical-retention-v88-feedback.js',
 'lexical-retention-helper':'assets/lexical-retention-v88.js',
 'lexical-bank-runtime':'assets/lexical-bank-runtime.js',
 'lexical-reviewed-context-policy':'assets/lexical-reviewed-v88-policy.js',
 'lexical-reviewed-context-data':'assets/lexical-reviewed-v88-data.js',
 'lexical-reviewed-context-helper':'assets/lexical-reviewed-context-v88.js',
 'vocabulary-practice':'assets/vocabulary-practice.js',
 'essential-vocabulary-core':'assets/essential-vocabulary-core.js',
 'memory-session':'assets/memory-session.js',
 'memory-core':'assets/memory-core.js',
 'essential-vocabulary-app':'assets/essential-vocabulary-app.js',
 'essential-vocabulary-course':'assets/essential-vocabulary-course.js',
 'context-vocabulary-course':'assets/contextual-vocabulary-course.js',
 'runtime-contract-policy':'server/year-runtime-contract-policy.cjs',
 'runtime-contract-validator':'tools/year-runtime-activation.cjs',
 'entrypoint':'今日学习.html',
 'player-page-daily-plan':'每日学习计划.html',
 'player-page-backup':'备份中心.html',
 'player-page-writing-coach':'写作与AI辅导.html',
 'player-page-writing-path':'写作补强.html',
 'player-page-speaking':'口语练习.html',
 'player-page-dialogue':'无稿口语.html',
 'player-page-memory':'词汇记忆.html',
 'player-page-independent-bank':'陌生材料库.html',
 'player-page-human-sources':'真人听力来源.html',
 'backup-page-calibration':'评分校准.html'
});
const REQUIRED_ROLES=Object.freeze(Object.keys(REQUIRED_COMPONENTS));
const PLAYER_PAGES=Object.freeze(Object.entries(REQUIRED_COMPONENTS).filter(([role])=>role==='entrypoint'||role.startsWith('player-page-')).map(([,file])=>file));
const BACKUP_PAGES=Object.freeze(['今日学习.html','备份中心.html','写作补强.html','无稿口语.html','词汇记忆.html','评分校准.html']);
const RETENTION_MEMORY_PAGES=Object.freeze(['个性化学习.html','今日学习.html','备份中心.html','每日学习计划.html','词汇记忆.html']);
const RETENTION_BUDGET_PAGES=Object.freeze(['今日学习.html','每日学习计划.html','词汇记忆.html','写作补强.html','无稿口语.html']);
const HASH=/^[a-f0-9]{64}$/;
const FAMILY_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v97-family-lessons.json',FAMILY_COMPONENTS=Object.freeze({...REQUIRED_COMPONENTS,'public-course-planner':'assets/public-course-planner.js','family-lesson-expansion-v95':'assets/family-lesson-expansion-v95.js','course-expansion':'assets/course-expansion.js','daily-plan-app':'assets/daily-plan-app.js'});
const FAMILY_BROADCAST_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v107-broadcast.json',FAMILY_CONTINUATION_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v108-linked-continuation.json';
const FAMILY_LINKED_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v109-linked-lessons.json';
const FAMILY_AUDIT_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v111-course-audit.json';
const FAMILY_NAS_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v112-nas-startup.json';
const FAMILY_MULTIBATCH_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v113-multibatch.json';
const FAMILY_CONTEXT_LEXICON_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v114-context-lexicon.json';
const FAMILY_COMPLETED_HISTORY_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v115-completed-history.json';
const FAMILY_RESPONSE_CONTRACT_PATH='curriculum/year-first-use-runtime-contract-v117-vocabulary-response.json';
const isFamilyContract=contractPath=>[FAMILY_CONTRACT_PATH,FAMILY_BROADCAST_CONTRACT_PATH,FAMILY_CONTINUATION_CONTRACT_PATH,FAMILY_LINKED_CONTRACT_PATH,FAMILY_AUDIT_CONTRACT_PATH,FAMILY_NAS_CONTRACT_PATH,FAMILY_MULTIBATCH_CONTRACT_PATH,FAMILY_CONTEXT_LEXICON_CONTRACT_PATH,FAMILY_COMPLETED_HISTORY_CONTRACT_PATH,FAMILY_RESPONSE_CONTRACT_PATH].includes(contractPath);
function componentLimit(contractPath){return isFamilyContract(contractPath)?55:MAX_COMPONENTS;}

function componentListProblem(rows,contractPath){
 const requiredComponents=isFamilyContract(contractPath)?FAMILY_COMPONENTS:REQUIRED_COMPONENTS,requiredRoles=Object.keys(requiredComponents),max=componentLimit(contractPath);
 if(!Array.isArray(rows)||rows.length<requiredRoles.length||rows.length>max)return 'runtime component count must include every required consumer and stay within '+max;
 const roles=new Set(),paths=new Set();
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||!/^[a-z][a-z0-9-]{0,79}$/.test(row.role||'')||roles.has(row.role))return 'unique runtime component roles are required';
  if(!isFamilyContract(contractPath)&&(row.role==='family-lesson-expansion-v95'||row.path==='assets/family-lesson-expansion-v95.js'))return 'family role/path requires its exact versioned contract';
  const required=requiredComponents[row.role];
  if(typeof row.path!=='string'||!row.path||row.path.includes('\\')||row.path.split('/').some(part=>!part||part==='.'||part==='..')||!(required?row.path===required:/^(?:assets\/[^\\]+\.(?:js|mjs)|server\/[^\\]+\.(?:cjs|js|mjs)|[^/\\]+\.html)$/.test(row.path)))return 'runtime component role must use its exact production path: '+row.role;
  if(paths.has(row.path))return 'one file cannot impersonate multiple runtime components';
  if(!HASH.test(row.sha256||'')||!Number.isInteger(row.bytes)||row.bytes<1||row.bytes>16*1024*1024)return 'runtime component hash and byte size are required';
  roles.add(row.role);paths.add(row.path);
 }
 for(const role of requiredRoles)if(!roles.has(role))return 'missing runtime component role: '+role;
 return null;
}
function pageDependencyProblem(file,text,contractPath){
 if(!PLAYER_PAGES.includes(file)&&!BACKUP_PAGES.includes(file)&&!RETENTION_MEMORY_PAGES.includes(file)&&!RETENTION_BUDGET_PAGES.includes(file))return null;
 const entries=[];let bootstrap=false;
 for(const match of String(text).matchAll(/<script\b([^>]*)>/gi)){
  const attrs=new Map();for(const item of match[1].matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs.set(item[1].toLowerCase(),item[2]??item[3]??item[4]??'');
  if(attrs.get('src')==='assets/user-data-bootstrap.js')bootstrap=true;
  if(attrs.get('data-ielts-script')==='1')entries.push({file:attrs.get('data-src')||'',deferred:attrs.has('defer')||attrs.get('data-ielts-type')==='module'});
 }
 if(!bootstrap)return 'profile bootstrap must guard '+file;
 const ordered=[...entries.filter(e=>!e.deferred),...entries.filter(e=>e.deferred)].map(e=>e.file);
 const before=(first,last)=>ordered.filter(v=>v===first).length===1&&ordered.filter(v=>v===last).length===1&&ordered.indexOf(first)<ordered.indexOf(last);
 if(!isFamilyContract(contractPath)&&ordered.includes('assets/family-lesson-expansion-v95.js'))return 'family helper execution requires its exact versioned contract';
 if(isFamilyContract(contractPath))for(const consumer of ['assets/learning-records.js','assets/memory-core.js','assets/essential-vocabulary-core.js','assets/contextual-vocabulary-exposure.js','assets/course-expansion.js','assets/adaptive-plan.js','assets/daily-learning-load.js','assets/course-player.js','assets/daily-plan-app.js'])if(ordered.includes(consumer)&&!before('assets/family-lesson-expansion-v95.js',consumer))return 'family lesson helper must execute exactly once before '+consumer+' on '+file;
 if(contractPath===FAMILY_LINKED_CONTRACT_PATH&&file==='词汇记忆.html'&&(!before('assets/daily-plan-core.js','assets/daily-plan-state.js')||!before('assets/daily-plan-state.js','assets/today-hub.js')||!before('assets/essential-vocabulary-course.js','assets/today-hub.js')||!before('assets/today-hub.js','assets/essential-vocabulary-app.js')||!before('assets/daily-learning-load.js','assets/essential-vocabulary-app.js')))return 'linked vocabulary needs the actual course-order dependencies on '+file;
 if(isFamilyContract(contractPath)&&['今日学习.html','词汇记忆.html','每日学习计划.html','个性化学习.html'].includes(file)){
  const api='assets/essential-vocabulary-core.js',consumer=file==='今日学习.html'?'assets/today-hub.js':file==='词汇记忆.html'?'assets/essential-vocabulary-app.js':file==='每日学习计划.html'?'assets/daily-plan-app.js':'assets/personalization-app.js';
  for(const prerequisite of ['assets/assessment-core.js','assets/vendor/ts-fsrs.js','assets/memory-core.js','assets/vocabulary-practice.js','assets/essential-vocabulary-data.js'])if(!before(prerequisite,api))return 'family vocabulary evidence dependency must execute before its core on '+file+': '+prerequisite;
  if(!before(api,consumer)||!before('assets/course-player.js',consumer))return 'family vocabulary evidence and Player must execute before their page consumer on '+file;
 }
 if(!before('assets/record-snapshot-index.js','assets/learning-records.js'))return 'immutable record index must execute before Records on '+file;
 if((RETENTION_MEMORY_PAGES.includes(file)||RETENTION_BUDGET_PAGES.includes(file))&&(!before('assets/assessment-core.js','assets/lexical-retention-v88-feedback.js')||!before('assets/lexical-retention-v88-feedback.js','assets/lexical-retention-v88.js')))return 'Assessment, Feedback and retention Helper must execute in order on '+file;
 if((RETENTION_MEMORY_PAGES.includes(file)||RETENTION_BUDGET_PAGES.includes(file))&&!before('assets/lexical-retention-v88.js','assets/lexical-bank-runtime.js'))return 'immutable lexical Bank must execute after its legacy codec on '+file;
 if(RETENTION_MEMORY_PAGES.includes(file)&&!before('assets/lexical-bank-runtime.js','assets/memory-core.js'))return 'immutable lexical Bank must execute before Memory on '+file;
 if(RETENTION_BUDGET_PAGES.includes(file)&&!before('assets/lexical-bank-runtime.js','assets/year-planner.js'))return 'immutable lexical Bank must execute before Year budget on '+file;
 if(RETENTION_MEMORY_PAGES.includes(file)&&!before('assets/lexical-retention-v88.js','assets/memory-core.js'))return 'retention Helper must execute before Memory on '+file;
 if(RETENTION_BUDGET_PAGES.includes(file)&&!before('assets/lexical-retention-v88.js','assets/year-planner.js'))return 'retention Helper must execute before Year budget on '+file;
 if(['今日学习.html','词汇记忆.html'].includes(file)&&(!before('assets/lexical-reviewed-v88-data.js','assets/lexical-reviewed-v88-policy.js')||!before('assets/lexical-reviewed-v88-policy.js','assets/lexical-reviewed-context-v88.js')||!before('assets/lexical-reviewed-context-v88.js','assets/contextual-vocabulary-course.js')||!before('assets/contextual-vocabulary-course.js',file==='今日学习.html'?'assets/essential-vocabulary-course.js':'assets/essential-vocabulary-app.js')||!before('assets/memory-core.js','assets/memory-session.js')||!before('assets/essential-vocabulary-core.js',file==='今日学习.html'?'assets/essential-vocabulary-course.js':'assets/essential-vocabulary-app.js')||file==='词汇记忆.html'&&(!before('assets/memory-session.js','assets/essential-vocabulary-app.js')||!before('assets/vocabulary-practice.js','assets/essential-vocabulary-app.js'))))return 'reviewed vocabulary dependencies must execute before their actual consumer on '+file;
 if(PLAYER_PAGES.includes(file)&&!before('assets/year-first-use-course.js','assets/course-player.js'))return 'year adapter must execute before Player on '+file;
 if(file==='今日学习.html'&&(!before('assets/year-first-use-state.js','assets/year-first-use-runtime.js')||!before('assets/year-first-use-runtime.js','assets/year-first-use-course.js')))return 'State, Runtime and Course must execute in order on '+file;
 if(BACKUP_PAGES.includes(file)&&!before('assets/year-first-use-state.js','assets/backup-core.js'))return 'year State must execute before Backup on '+file;
 return null;
}
module.exports=Object.freeze({RUNTIME_SOURCE,FAMILY_CONTRACT_PATH,FAMILY_BROADCAST_CONTRACT_PATH,FAMILY_CONTINUATION_CONTRACT_PATH,isFamilyContract,FAMILY_COMPONENTS,componentLimit,MAX_COMPONENTS,REQUIRED_COMPONENTS,REQUIRED_ROLES,PLAYER_PAGES,BACKUP_PAGES,componentListProblem,pageDependencyProblem});
