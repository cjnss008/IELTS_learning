'use strict';
const fs=require('node:fs'),path=require('node:path');const {jobs,weeks,level}=require('./curriculum-manifest.cjs');
const root=path.join(__dirname,'..'),dir=path.join(root,'curriculum','materials');
const {materials:foundationSounds}=require('./foundation-sounds.cjs');
const {materials:listeningMaps}=require('./listening-maps.cjs');
const {validate}=require('./author-curriculum.cjs');
const crypto=require('node:crypto');
function build({partial=false}={}){
 const materials=[],missing=[];for(const job of [...jobs,...foundationSounds,...listeningMaps]){const file=path.join(dir,job.id+'.json');if(!fs.existsSync(file)){missing.push(job.id);continue;}const m=JSON.parse(fs.readFileSync(file,'utf8'));if(!job.id.startsWith('sounds-')&&!job.id.startsWith('listening-map-')){const errors=validate(job,m);if(errors.length){if(partial){missing.push(job.id);continue;}throw Error(job.id+': '+errors.join('; '));}}m.level=job.level;m.version='1';if(m.assessmentGroup?.startsWith('gate-'))m.assessmentGroup=m.assessmentGroup.replace(/-[AB]$/,'');if(m.skill==='writing')m.rubric={...(m.rubric||{}),taskType:m.type};const audioPath='audio/curriculum/'+m.id+'.mp3';if(m.skill==='listening'&&fs.existsSync(path.join(root,audioPath))){m.audio=audioPath;const metaPath=path.join(root,'curriculum','audio',m.id+'.json');if(fs.existsSync(metaPath)){const meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));m.audioVoice=meta.voices.join(' / ');m.audioDurationSeconds=meta.durationSeconds;m.audioSynthetic=true;if(meta.transcriptHash!==crypto.createHash('sha256').update(m.transcript).digest('hex'))m.audio='';}else m.audio='';}materials.push(m);}
 if(missing.length&&!partial)throw Error('Course not complete: '+missing.length+' missing authored materials; use --partial only for development preview.');
 const derived=[];
 for(const m of materials.filter(m=>m.skill==='reading')){
  const base={week:m.week,level:m.level,version:'1',source:m.source,pool:m.pool,assessmentGroup:m.assessmentGroup,form:m.form,fullTest:m.fullTest,questions:[]};
  if(m.pool==='training'&&!m.fullTest){
   derived.push({...base,id:m.id+'-grammar',skill:'grammar',type:'grammar',title:m.grammar.title,estimatedMinutes:15,instructions:'先读懂解释，再独立完成句子。订正后换句复测。',passage:m.grammar.explanation+'\n\n'+m.grammar.example,questions:m.grammar.questions.map((q,i)=>({...q,id:'q'+(i+1)}))});
   derived.push({...base,id:m.id+'-vocabulary',skill:'vocabulary',type:'vocabulary',title:m.title+' · 语境词汇',estimatedMinutes:20,instructions:'遮住释义回忆，再核对。每行写一个词、语境释义和自己的完整例句；旧词优先复习。',passage:m.vocabulary.map(v=>v.word+' — '+v.meaning+'\n'+v.example).join('\n\n'),vocabulary:m.vocabulary});
  }
  const n=Number(m.id.match(/-read-(\d)$/)?.[1]||1),includeOutput=m.assessmentGroup||m.week<=8||m.week<=20&&n<=2||m.week<=36&&n===1;
  if(includeOutput){
   const t=m.transfer.speaking,foundation=m.week<=8;
   const bullets=t.part2Bullets||t.part2_bullets;
   const cue=(Array.isArray(t.part2)?t.part2.join('\n'):t.part2)+(Array.isArray(bullets)?'\nYou should say:\n'+bullets.map(x=>'• '+x).join('\n'):'');
   const prompt=foundation?t.part1.slice(0,4).join('\n'):'Part 1\n'+t.part1.join('\n')+'\n\nPart 2 (prepare for 1 minute, speak for 1–2 minutes)\n'+cue+'\n\nPart 3\n'+t.part3.join('\n');
   derived.push({...base,id:m.id+'-speaking',skill:'speaking',type:foundation?'foundation':'part1-3',title:m.title+' · 口语迁移',estimatedMinutes:foundation?20:30,instructions:foundation?'先自己回答简单问题，再录音回听；示例人名可替换为自己的信息。':'按三部分独立录音，保留原音；转写与音频诊断分别复核。',prompt,parts:t,minWords:foundation?12:m.week<=20?60:120,rubric:{taskType:m.fullTest?'full_test':m.week<=20?'foundation':'part2'}});
   if(!m.fullTest&&m.week<=20)derived.push({...base,id:m.id+'-writing',skill:'writing',type:foundation?'foundation':'paragraph',title:m.title+' · 写作迁移',estimatedMinutes:30,instructions:'先独立写原稿，再取得反馈和订正；不要复制课文作为自己的作品。',prompt:m.transfer.writing,minWords:foundation?12:m.week<=14?60:100,rubric:{taskType:foundation?'foundation':'generic'}});
  }
 }
 materials.push(...derived);
 const map=new Map(materials.map(m=>[m.id,m]));
 const rows=weeks.map(w=>({week:w.week,title:w.title,level:level(w.week),prerequisites:w.week>1?[w.week-1]:[],checkpoint:w.week%4===0,extensive:{readingIds:[],listeningIds:[],instructions:'第一遍不查词，先理解整体；第二遍标出不懂的部分，最后口头复述或写摘要。读听材料可重复用于流畅度训练，已见材料不计独立测评。'}}));
 const pick=(w,skill)=>materials.filter(m=>m.week===w&&m.skill===skill&&m.pool==='training'&&!m.fullTest&&!m.id.startsWith('sounds-')&&!m.id.startsWith('listening-map-')).map(m=>m.id);
 const one=(arr,i)=>arr.length?[arr[((i%arr.length)+arr.length)%arr.length]]:[];
 const filter=ids=>partial?ids.filter(id=>map.has(id)):ids;
 const task=(id,minutes,ids,instructions,deliverable,mode='practice')=>{
  ids=filter([...new Set(ids)]);const items=ids.map(id=>map.get(id)).filter(Boolean);let quantity=1,unit='份复盘';
  if(['grammar','listening','reading'].includes(id)){quantity=items.reduce((n,m)=>n+(m.questions?.length||0),0);unit='题';}
  if(id==='vocabulary'){quantity=items.reduce((n,m)=>n+(m.vocabulary?.length||0),0);unit='条';}
  if(['speaking','writing'].includes(id)){quantity=items.reduce((n,m)=>n+(m.minWords||12),0);unit='词';}
  return{id,skill:id,minutes,materialIds:ids,mode,instructions,deliverable,quantity:Math.max(1,quantity),unit};
 };
 const days=[];
 for(let w=1;w<=52;w++){
  const baseWeek=w<=36?w:21+(w-37)%16,rs=pick(baseWeek,'reading'),ls=pick(baseWeek,'listening');
  rows[w-1].extensive.readingIds=rs.slice(-2);rows[w-1].extensive.listeningIds=ls.slice(-2);
  for(let d=1;d<=7;d++){
   const day=(w-1)*7+d,gate=d===7&&w%4===0,final=d===7&&w>=49,regularFull=d===6&&w>=37&&w<=48;
   const group=final?'final-'+String(w).padStart(2,'0'):gate&&w<=48?'gate-'+String(w).padStart(2,'0')+'-A':regularFull?'training-'+String(w).padStart(2,'0'):null;
   const r=group?[group+'-reading']:one(rs,d-1),l=group?[group+'-listening']:[25,31].includes(w)&&[3,5].includes(d)?['listening-map-'+w]:[...one(ls,d-1),...(w<=8?['sounds-'+String(w).padStart(2,'0')]:[])],current=r[0];
   let writing,speaking;
   if(group){writing=w>=24?[group+'-task1',group+'-task2']:[group+'-reading-writing'];speaking=[group+'-reading-speaking'];}
   else{
    const speaks=materials.filter(m=>m.week===baseWeek&&m.skill==='speaking'&&m.pool==='training'&&!m.fullTest).map(m=>m.id);speaking=one(speaks,d-1);
    if(w<=20){writing=one(materials.filter(m=>m.week===w&&m.skill==='writing'&&m.pool==='training').map(m=>m.id),d-1);}
    else{
     // A checkpoint replaces this week's new pair. Earlier days revise the
     // previous week's pair, preserving unseen gate questions until test day.
     const index=w-20-(w%4===0&&w<=48?1:0);
     const suffix=String(index).padStart(2,'0'),t1='writing-task1-'+suffix,t2='writing-task2-'+suffix;
     writing=w<=36?(d<=2?[t1]:d<=4?[t2]:[t1,t2]):d===1||d===4?[t1]:d===2||d===5?[t2]:[t1,t2];
    }
   }
   const review=d===7&&!group;
   const grammar=rs.length?[rs[(d-1)%rs.length]+'-grammar',rs[d%rs.length]+'-grammar',rs[(d+1)%rs.length]+'-grammar']:[];
   const vocab=rs.length?[rs[(d-1)%rs.length]+'-vocabulary']:[];
   const ref='reflection-'+day;
   materials.push({id:ref,version:'1',week:w,level:level(w),skill:'reflection',type:'reflection',title:'第 '+day+' 天 · 学习复盘',pool:'training',fullTest:false,estimatedMinutes:15,questions:[],instructions:'写下今天的一处错误、支持订正的依据、48–72小时后要用什么新任务复测。列出三点；如今天没有完成，保留实际进度。',prompt:'1. 我今天独立完成了什么？\n2. 哪个错误仍需解决，原句或录音依据是什么？\n3. 下一次复测的材料和时间是什么？',source:{kind:'original',rights:'项目原创',verification:'reviewed',method:'人工制定的反思提示，不计客观分'}});
   map.set(ref,materials.at(-1));
   const tasks=group&&w>=24?[
    task('listening',60,l,'完整听力一次播放并独立答题；提交后定位错误并订正。','40题原始答案与错因',group.startsWith('training')?'assessment':'assessment'),
    task('reading',90,r,'限时60分钟完成三篇阅读，再用30分钟找证据与订正。','40题原始答案与文本证据','assessment'),
    task('writing',90,writing,'Task1用20分钟、Task2用40分钟完成原稿；其余30分钟反馈与订正。','Task1、Task2两份原稿','assessment'),
    task('speaking',45,speaking,'按Part1–3录音，保留原音和转写，回听定位问题。','三部分原音、转写及待改进点','assessment'),
    task('reflection',75,[ref],'整合四项反馈、完成订正，并为薄弱项安排新题延迟复测。','四项复盘与后续补强')
   ]:[
    task('vocabulary',45,vocab,'10分钟回忆旧词；15分钟语境学习；10分钟闭卷写词义和例句；10分钟复查并排入复习。','每个词的语境释义和原创例句'),
    task('grammar',30,grammar,'8分钟理解结构，12分钟独立作答，10分钟订正并改写新句。','独立选项、订正依据与迁移句'),
    task('listening',75,l,'15分钟盲听答题；20分钟分句听写；20分钟对照定位并重听；20分钟遮住原文复述。','原始答案、错句听写及复述',group?'assessment':'practice'),
    task('reading',60,r,'10分钟整体理解；20分钟答题找证据；15分钟拆句；15分钟合上原文复述或摘要。','原始答案、原文依据和摘要',group?'assessment':'practice'),
    task('speaking',60,speaking,'10分钟准备；15分钟独立录音；15分钟回听及核对转写；20分钟针对练习并再次录音。','原音、转写、问题定位与重录',group?'assessment':'practice'),
    task('writing',75,writing,review?'闭卷重写本周作品，再核对原稿与反馈，标出仍有困难的结构。':w>=21?(w<=36&&(d===2||d===4)||w>=37&&(d===3||d===6)?'先保存订正版本：逐条处理反馈，再闭卷重写；保留首稿，不把改写当作新题。':'按当前任务先独立成稿，再进行反馈、订正和新情境迁移；不照抄范文。'):'15分钟口头组织句子，25分钟独立写作，15分钟反馈，20分钟订正与换情境改写。','原稿、反馈依据及订正稿',group?'assessment':'practice'),
    task('reflection',15,[ref],'分别记录完成量、独立程度和需延迟复测的错误。','三点复盘')
   ];
   days.push({day,week:w,weekday:d,title:weeks[w-1].title,tasks,totalMinutes:tasks.reduce((n,t)=>n+t.minutes,0)});
  }
 }
 const audioMissing=materials.filter(m=>m.skill==='listening'&&!m.audio).map(m=>m.id);
 if(audioMissing.length&&!partial)throw Error('Course audio not complete: '+audioMissing.length+' files missing');
 const data={version:'1.0',status:missing.length||audioMissing.length?'development-preview':'complete-material-set',createdDate:'2026-10-24',scope:'原创练习材料；含完整题量训练，难度未经真实考生标定。软件完成不代表学习结果保证。',weeks:rows,materials,days,gates:Array.from({length:12},(_,i)=>{const week=(i+1)*4;return{week,A:'gate-'+String(week).padStart(2,'0')+'-A',B:'gate-'+String(week).padStart(2,'0')+'-B',minimumDelayHours:48};}),audit:{expectedAuthoringJobs:jobs.length,approvedAuthoringJobs:jobs.length-missing.filter(id=>!id.startsWith('sounds-')&&!id.startsWith('listening-map-')).length,foundationSoundModules:foundationSounds.length,listeningMapModules:listeningMaps.length,missing,audioMissing}};
 const json=JSON.stringify(data).replace(/</g,'\\u003c');fs.writeFileSync(path.join(root,'assets','curriculum-data.js'),`(function(root){'use strict';const data=${json};root.IELTSCurriculumData=data;if(typeof module==='object'&&module.exports)module.exports=data;})(typeof globalThis!=='undefined'?globalThis:this);\n`);
 fs.mkdirSync(path.join(root,'curriculum'),{recursive:true});fs.writeFileSync(path.join(root,'curriculum','coverage.json'),JSON.stringify({status:data.status,days:days.length,minutes:days.reduce((n,d)=>n+d.totalMinutes,0),materials:materials.length,bySkill:materials.reduce((a,m)=>(a[m.skill]=(a[m.skill]||0)+1,a),{}),...data.audit},null,2)+'\n');
 return data;
}
module.exports={build};if(require.main===module){const data=build({partial:process.argv.includes('--partial')});console.log(JSON.stringify({status:data.status,materials:data.materials.length,days:data.days.length,missing:data.audit.missing.length,audioMissing:data.audit.audioMissing.length}));}
