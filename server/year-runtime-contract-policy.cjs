'use strict';

const RUNTIME_SOURCE=(()=>{const fs=require('node:fs'),crypto=require('node:crypto'),bytes=fs.readFileSync(__filename);return Object.freeze({path:'server/year-runtime-contract-policy.cjs',sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});})();

// Shared by the explicit build validator and the running catalog. Roles identify
// reviewed consumers, so arbitrary files cannot impersonate a required consumer.
const MAX_COMPONENTS=44;
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
const HASH=/^[a-f0-9]{64}$/;
function componentListProblem(rows){
 if(!Array.isArray(rows)||rows.length<REQUIRED_ROLES.length||rows.length>MAX_COMPONENTS)return 'runtime component count must include every required consumer and stay within '+MAX_COMPONENTS;
 const roles=new Set(),paths=new Set();
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||!/^[a-z][a-z0-9-]{0,79}$/.test(row.role||'')||roles.has(row.role))return 'unique runtime component roles are required';
  const required=REQUIRED_COMPONENTS[row.role];
  if(typeof row.path!=='string'||!row.path||row.path.includes('\\')||row.path.split('/').some(part=>!part||part==='.'||part==='..')||!(required?row.path===required:/^(?:assets\/[^\\]+\.(?:js|mjs)|server\/[^\\]+\.(?:cjs|js|mjs)|[^/\\]+\.html)$/.test(row.path)))return 'runtime component role must use its exact production path: '+row.role;
  if(paths.has(row.path))return 'one file cannot impersonate multiple runtime components';
  if(!HASH.test(row.sha256||'')||!Number.isInteger(row.bytes)||row.bytes<1||row.bytes>16*1024*1024)return 'runtime component hash and byte size are required';
  roles.add(row.role);paths.add(row.path);
 }
 for(const role of REQUIRED_ROLES)if(!roles.has(role))return 'missing runtime component role: '+role;
 return null;
}
function pageDependencyProblem(file,text){
 if(!PLAYER_PAGES.includes(file)&&!BACKUP_PAGES.includes(file))return null;
 const entries=[];let bootstrap=false;
 for(const match of String(text).matchAll(/<script\b([^>]*)>/gi)){
  const attrs=new Map();for(const item of match[1].matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs.set(item[1].toLowerCase(),item[2]??item[3]??item[4]??'');
  if(attrs.get('src')==='assets/user-data-bootstrap.js')bootstrap=true;
  if(attrs.get('data-ielts-script')==='1')entries.push({file:attrs.get('data-src')||'',deferred:attrs.has('defer')||attrs.get('data-ielts-type')==='module'});
 }
 if(!bootstrap)return 'profile bootstrap must guard '+file;
 const ordered=[...entries.filter(e=>!e.deferred),...entries.filter(e=>e.deferred)].map(e=>e.file);
 const before=(first,last)=>ordered.filter(v=>v===first).length===1&&ordered.filter(v=>v===last).length===1&&ordered.indexOf(first)<ordered.indexOf(last);
 if(!before('assets/record-snapshot-index.js','assets/learning-records.js'))return 'immutable record index must execute before Records on '+file;
 if(PLAYER_PAGES.includes(file)&&!before('assets/year-first-use-course.js','assets/course-player.js'))return 'year adapter must execute before Player on '+file;
 if(file==='今日学习.html'&&(!before('assets/year-first-use-state.js','assets/year-first-use-runtime.js')||!before('assets/year-first-use-runtime.js','assets/year-first-use-course.js')))return 'State, Runtime and Course must execute in order on '+file;
 if(BACKUP_PAGES.includes(file)&&!before('assets/year-first-use-state.js','assets/backup-core.js'))return 'year State must execute before Backup on '+file;
 return null;
}
module.exports=Object.freeze({RUNTIME_SOURCE,MAX_COMPONENTS,REQUIRED_COMPONENTS,REQUIRED_ROLES,PLAYER_PAGES,BACKUP_PAGES,componentListProblem,pageDependencyProblem});
