'use strict';
const fs=require('node:fs'),path=require('node:path');const {jobs,weeks,level}=require('./curriculum-manifest.cjs');
const root=path.join(__dirname,'..'),dir=path.join(root,'curriculum','materials');
const {materials:foundationSounds}=require('./foundation-sounds.cjs');
const {materials:listeningMaps}=require('./listening-maps.cjs');
const {validate}=require('./author-curriculum.cjs');
const crypto=require('node:crypto');
const Coverage=require('../assets/curriculum-coverage.js'),Lexicon=require('./curriculum-lexicon.cjs');
const LexicalContexts=require('./lexical-contexts.cjs'),IndependentBank=require('./build-independent-bank.cjs');
const CourseExpansion=require('./course-expansion69.cjs');
const YearExpansion=require('./year-expansion.cjs');
function build({partial=false,requireYearExpansion=false,activateYearFirstUse=false,yearRuntimeContract=undefined,gsaGradedRelease=null,ordinaryReadingRelease=null,familyLessonsRelease=null,familyLessonsReleases=null,outputRoot=root}={}){
 if(familyLessonsReleases!==null){if(familyLessonsRelease!==null||!Array.isArray(familyLessonsReleases)||!familyLessonsReleases.length||familyLessonsReleases.length>364||familyLessonsReleases.some(v=>typeof v!=='string'||!v)||new Set(familyLessonsReleases).size!==familyLessonsReleases.length)throw Error('Provide a unique ordered familyLessonsReleases list, not both release options.');familyLessonsRelease=familyLessonsReleases[0];}
 const familyPaths=familyLessonsReleases||(familyLessonsRelease===null?[]:[familyLessonsRelease]);
 if(typeof activateYearFirstUse!=='boolean')throw Error('activateYearFirstUse must be a boolean');
 if(activateYearFirstUse&&!requireYearExpansion)throw Error('--activate-year-first-use requires --require-year-expansion');
 const outRoot=path.resolve(root,outputRoot);if(requireYearExpansion&&(partial||outRoot===path.resolve(root)))throw Error('Full year expansion must be validated without --partial in a staging --output-root before atomic publication.');
 if(gsaGradedRelease!==null&&(partial||outRoot===path.resolve(root)))throw Error('GSA reading release requires a complete build in a staging --output-root.');
 if(ordinaryReadingRelease!==null&&(partial||outRoot===path.resolve(root)||!gsaGradedRelease||!requireYearExpansion||!activateYearFirstUse))throw Error('Ordinary reading admission requires the complete active-year and GSA composition in a staging --output-root.');
 if(familyLessonsRelease!==null&&(partial||outRoot===path.resolve(root)||!gsaGradedRelease||!ordinaryReadingRelease||!requireYearExpansion||!activateYearFirstUse))throw Error('Family lesson admission requires the complete reviewed composition in a staging --output-root.');
 const activation=activateYearFirstUse?require('./year-runtime-activation.cjs').validateRuntimeContract({root,contractPath:yearRuntimeContract}):null;
 const Catalog=require('./family-release-catalog.cjs'),multiRuntime=activation?.metadata.contract.path==='curriculum/year-first-use-runtime-contract-v113-multibatch.json';
 const requiredFamilyHistory=multiRuntime?Catalog.history(require(path.join(root,'assets/curriculum-data.js')).familyLessonRelease):[];
 if(requiredFamilyHistory.length&&!familyPaths.length)throw Error('Installed family batches require explicit --family-lessons-release paths; cannot omit historical lessons.');
 if(familyPaths.length>1&&activation?.metadata.contract.path!=='curriculum/year-first-use-runtime-contract-v113-multibatch.json')throw Error('Multiple family batches require the reviewed multi-batch runtime contract.');
 const write=(relative,value)=>{const target=path.join(outRoot,relative),incoming=target+'.incoming-'+process.pid+'-'+crypto.randomBytes(6).toString('hex');fs.mkdirSync(path.dirname(target),{recursive:true});try{fs.writeFileSync(incoming,value,{encoding:'utf8',flag:'wx'});const expected=crypto.createHash('sha256').update(value).digest('hex'),actual=crypto.createHash('sha256').update(fs.readFileSync(incoming)).digest('hex');if(actual!==expected)throw Error('Staged output verification failed: '+relative);fs.renameSync(incoming,target);}finally{if(fs.existsSync(incoming))fs.unlinkSync(incoming);}};
 const materials=[],missing=[];for(const job of [...jobs,...foundationSounds,...listeningMaps]){const file=path.join(dir,job.id+'.json');if(!fs.existsSync(file)){missing.push(job.id);continue;}const m=JSON.parse(fs.readFileSync(file,'utf8'));if(!job.id.startsWith('sounds-')&&!job.id.startsWith('listening-map-')){const errors=validate(job,m);if(errors.length){if(partial){missing.push(job.id);continue;}throw Error(job.id+': '+errors.join('; '));}}m.level=job.level;m.version='1';if(m.assessmentGroup?.startsWith('gate-'))m.assessmentGroup=m.assessmentGroup.replace(/-[AB]$/,'');if(m.skill==='writing')m.rubric={...(m.rubric||{}),taskType:m.type};const audioPath='audio/curriculum/'+m.id+'.mp3';if(m.skill==='listening'&&fs.existsSync(path.join(root,audioPath))){m.audio=audioPath;const metaPath=path.join(root,'curriculum','audio',m.id+'.json');if(fs.existsSync(metaPath)){const meta=JSON.parse(fs.readFileSync(metaPath,'utf8'));m.audioVoice=meta.voices.join(' / ');m.audioDurationSeconds=meta.durationSeconds;m.audioSynthetic=meta.synthetic!==false;if(job.requireAudioHash&&meta.audioHash!==crypto.createHash('sha256').update(fs.readFileSync(path.join(root,audioPath))).digest('hex'))m.audio='';if(meta.transcriptHash!==crypto.createHash('sha256').update(m.transcript).digest('hex'))m.audio='';}else m.audio='';}materials.push(m);}
 if(missing.length&&!partial)throw Error('Course not complete: '+missing.length+' missing authored materials; use --partial only for development preview.');
 const derived=[];
 for(const m of materials.filter(m=>m.skill==='reading')){
  const base={week:m.week,level:m.level,version:'1',source:m.source,pool:m.pool,assessmentGroup:m.assessmentGroup,form:m.form,fullTest:m.fullTest,questions:[]};
  if(m.pool==='training'&&!m.fullTest){
   derived.push({...base,id:m.id+'-grammar',skill:'grammar',type:'grammar',title:m.grammar.title,estimatedMinutes:15,instructions:'先读懂解释，再独立完成句子。订正后换句复测。',passage:m.grammar.explanation+'\n\n'+m.grammar.example,questions:m.grammar.questions.map((q,i)=>({...q,id:'q'+(i+1)}))});
   derived.push({...base,id:m.id+'-vocabulary',skill:'vocabulary',type:'vocabulary',title:m.title+' · 语境词汇',estimatedMinutes:20,instructions:'先学习本组词义、音标与例句；每个词先输入三遍正确英文，再完成三次分别录制、保存原音并取得专业结果的真实跟读。所有词完成后，依次测试中文提示补全残缺词、全中文提示写英文、听写；每词三种模式全部作答。无声和服务失败不计跟读次数，专业低分进入统一错题本。时间为参考预算，可按掌握速度提前进入下一步。',passage:m.vocabulary.map(v=>v.word+' — '+v.meaning+'\n'+v.example).join('\n\n'),vocabulary:m.vocabulary});
  }
  const n=Number(m.id.match(/-read-(\d)$/)?.[1]||1),includeOutput=m.assessmentGroup||m.week<=8||m.week<=20&&n<=2||m.week<=36&&n===1||m.week>=37&&m.lexicalTraining;
  if(includeOutput){
   const t=m.transfer.speaking,foundation=m.week<=8;
   const bullets=t.part2Bullets||t.part2_bullets;
   const cue=(Array.isArray(t.part2)?t.part2.join('\n'):t.part2)+(Array.isArray(bullets)?'\nYou should say:\n'+bullets.map(x=>'• '+x).join('\n'):'');
   const prompt=foundation?t.part1.slice(0,4).join('\n'):'Part 1\n'+t.part1.join('\n')+'\n\nPart 2 (prepare for 1 minute, speak for 1–2 minutes)\n'+cue+'\n\nPart 3\n'+t.part3.join('\n');
   derived.push({...base,id:m.id+'-speaking',skill:'speaking',type:foundation?'foundation':'part1-3',title:m.title+' · 口语迁移',estimatedMinutes:foundation?20:30,instructions:foundation?'先自己回答简单问题，再录音回听；示例人名可替换为自己的信息。':'按三部分独立录音，保留原音；转写与音频诊断分别复核。',prompt,parts:t,minWords:foundation?12:m.week<=20?60:120,rubric:{taskType:m.fullTest?'full_test':m.week<=20?'foundation':'part2'}});
   if(!m.fullTest&&m.week<=20)derived.push({...base,id:m.id+'-writing',skill:'writing',type:foundation?'foundation':'paragraph',title:m.title+' · 写作迁移',estimatedMinutes:30,instructions:'先独立写原稿，再取得反馈和订正；不要复制课文作为自己的作品。',prompt:m.transfer.writing,minWords:foundation?12:m.week<=14?60:100,rubric:{taskType:foundation?'foundation':'generic'}});
  }
 }
 for(const m of materials.filter(m=>m.pool==='training'&&((m.skill==='listening'&&m.lexicalTraining)||m.fullTest&&['reading','listening'].includes(m.skill)))){
  const week=m.fullTest?Math.min(52,m.week+1):m.week;
  const lexicalWords=m.vocabulary.map(v=>({...v,sourceMaterialId:m.id,sourceQuote:Lexicon.sourceSentence(m,v.word),example:Lexicon.sourceSentence(m,v.word)})).filter(v=>v.example&&v.meaning);if(!lexicalWords.length)continue;
  derived.push({id:m.id+'-vocabulary',version:'1',week,level:level(week),skill:'vocabulary',type:'vocabulary',pool:'training',fullTest:false,source:m.source,sourceMaterialId:m.id,availableAfterWeek:week,estimatedMinutes:20,title:m.title+' · 原句词汇',instructions:'按源词义与原句完成三写三读和三轮测试。训练整卷词汇安排在该卷所在周之后，不提前提取关卡或末期保留卷；同ID复用属于巩固。',passage:lexicalWords.map(v=>v.word+' — '+v.meaning+'\n'+v.example).join('\n\n'),vocabulary:lexicalWords});
  if(m.source?.kind==='public-domain-authentic')for(let i=0;i<lexicalWords.length;i+=5){const vocabulary=lexicalWords.slice(i,i+5);derived.push({...derived.at(-1),id:m.id+'-vocabulary-pack-'+(1+i/5),title:m.title+' · 5词以内小组 '+(1+i/5),estimatedMinutes:15,vocabulary,passage:vocabulary.map(v=>v.word+' — '+v.meaning+'\n'+v.example).join('\n\n')});}
 }
 materials.push(...derived);
 const lexical=Lexicon.extensions(materials);materials.push(...lexical.materials);
 const contexts=LexicalContexts.build();materials.push(...contexts.materials);
 const independent=IndependentBank.build({requireAudio:!partial});materials.push(...independent.materials);
 const map=new Map(materials.map(m=>[m.id,m]));
 const rows=weeks.map(w=>({week:w.week,title:w.title,level:level(w.week),prerequisites:w.week>1?[w.week-1]:[],checkpoint:w.week%4===0,extensive:{readingIds:[],listeningIds:[],instructions:'第一遍不查词，先理解整体；第二遍标出不懂的部分，最后口头复述或写摘要。读听材料可重复用于流畅度训练，已见材料不计独立测评。'}}));
 const pick=(w,skill)=>materials.filter(m=>m.week===w&&m.skill===skill&&m.pool==='training'&&!m.fullTest&&!m.lexicalContext&&!m.id.startsWith('sounds-')&&!m.id.startsWith('listening-map-')).map(m=>m.id);
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
  const baseWeek=w,rs=pick(baseWeek,'reading'),ls=pick(baseWeek,'listening');
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
   const authenticLexical=materials.filter(m=>m.week===w&&m.skill==='vocabulary'&&/-vocabulary-pack-[12]$/.test(m.id));
   const baseVocab=authenticLexical.length&&[5,6].includes(d)?[authenticLexical[d-5].id]:rs.length?[rs[(d-1)%rs.length]+'-vocabulary']:[];
   const extensions=materials.filter(m=>m.week===w&&m.skill==='vocabulary'&&m.source?.kind==='derived-lexical');
   const extra=extensions[d-1];const baseCount=baseVocab.reduce((n,id)=>n+(map.get(id)?.vocabulary?.length||0),0);
   const vocab=w<=36?[...baseVocab,...(extra&&baseCount+(extra.vocabulary?.length||0)<=12?[extra.id]:[])]:one(pick(w,'vocabulary'),d-1);
   const ref='reflection-'+day;
   materials.push({id:ref,version:'1',week:w,level:level(w),skill:'reflection',type:'reflection',title:'第 '+day+' 天 · 学习复盘',pool:'training',fullTest:false,estimatedMinutes:15,questions:[],instructions:'核对今天已提交的学习原稿，将统一错题本整页作答后提交；继续重做仍错的题，直到全部通过，再由 AI 根据今日材料、原稿与订正过程生成复盘。评阅或语音证据未完成时保留待验证状态；实际进度如实记录。',prompt:'先完成今日整页错题订正，保留每轮原始输入、核对依据和仍需补强的项目；全部通过后查看 AI 每日复盘，并记录下一次新题迁移及48小时／7日复测安排。',source:{kind:'original',rights:'项目原创',verification:'reviewed',method:'人工制定的反思提示，不计客观分'}});
   map.set(ref,materials.at(-1));
   const tasks=group&&w>=24?[
    task('listening',60,l,'完整听力一次播放并独立答题；提交后定位错误并订正。','40题原始答案与错因',group.startsWith('training')?'assessment':'assessment'),
    task('reading',90,r,'限时60分钟完成三篇阅读，再用30分钟找证据与订正。','40题原始答案与文本证据','assessment'),
    task('writing',90,writing,'Task1用20分钟、Task2用40分钟完成原稿；其余30分钟反馈与订正。','Task1、Task2两份原稿','assessment'),
    task('speaking',45,speaking,'按Part1–3录音，保留原音和转写，回听定位问题。','三部分原音、转写及待改进点','assessment'),
    task('reflection',75,[ref],'整合四项反馈，整页提交今日错题并重做仍错项目，全部通过后取得 AI 每日复盘，为薄弱项安排新题延迟复测。','整页错题订正原稿、全部通过记录与 AI 每日复盘及后续补强')
   ]:[
    task('vocabulary',45,vocab,'参考预算45分钟：先看懂必学词音标、词义和例句；每词先正确输入英文三遍，再独立录音跟读三次并保存专业结果；全词完成后依次进行补全、全中文写英文、听写三轮，错项进入统一错题本。可按掌握速度提前进入下一步。','每词三遍正确输入、三份真实跟读原音及专业结果，补全／全中文写英文／听写三轮原稿、客观核对及错题记录（按词去重计量）'),
    task('grammar',30,grammar,'8分钟理解结构，12分钟独立作答，10分钟订正并改写新句。','独立选项、订正依据与迁移句'),
    task('listening',75,l,'15分钟盲听答题；20分钟分句听写；20分钟对照定位并重听；20分钟遮住原文复述。','原始答案、错句听写及复述',group?'assessment':'practice'),
    task('reading',60,r,'10分钟整体理解；20分钟答题找证据；15分钟拆句；15分钟合上原文复述或摘要。','原始答案、原文依据和摘要',group?'assessment':'practice'),
    task('speaking',60,speaking,'10分钟准备；15分钟独立录音；15分钟回听及核对转写；20分钟针对练习并再次录音。','原音、转写、问题定位与重录',group?'assessment':'practice'),
    task('writing',75,writing,review?'闭卷重写本周作品，再核对原稿与反馈，标出仍有困难的结构。':w>=21?(w<=36&&(d===2||d===4)||w>=37&&(d===3||d===6)?'先保存订正版本：逐条处理反馈，再闭卷重写；保留首稿，不把改写当作新题。':'按当前任务先独立成稿，再进行反馈、订正和新情境迁移；不照抄范文。'):'15分钟口头组织句子，25分钟独立写作，15分钟反馈，20分钟订正与换情境改写。','原稿、反馈依据及订正稿',group?'assessment':'practice'),
    task('reflection',15,[ref],'整页填写并提交今日错题，只重做仍错项目，直到全部通过；随后由 AI 根据今日材料与真实作品生成复盘及延迟复测建议。','整页错题订正原稿、全部通过记录与 AI 每日复盘')
   ];
   days.push({day,week:w,weekday:d,title:weeks[w-1].title,tasks,totalMinutes:tasks.reduce((n,t)=>n+t.minutes,0)});
  }
 }
 const yearReflection={id:'reflection-365',version:'1',week:52,level:level(52),skill:'reflection',type:'year-review',pool:'training',fullTest:false,estimatedMinutes:360,title:'第365天 · 年度证据回看与下一周期',questions:[],instructions:'回看年度实际作品、准备度证据、未完成和待验证项，保存年度总结；未达标继续补强，不以一年天数认定通过。360分钟为每日可用预算上限，完成后无需等待。',prompt:'根据已保存的四科独立作品、评阅、原音和错题，指出尚缺证据、当前可用负荷与下一周期补强安排。复用材料、辅助表现与待评结果分别注明，不能代替陌生测评。',source:{kind:'original',rights:'项目原创',verification:'reviewed',method:'年度证据回看提示，不是新测卷或成绩保证。'}};materials.push(yearReflection);map.set(yearReflection.id,yearReflection);
 days.push({day:365,week:52,weekday:8,kind:'year-review',readinessReview:true,title:'年度证据回看与下一周期',tasks:[task('reflection',360,['reflection-365'],yearReflection.instructions,'四科证据缺口、可用负荷与下一周期补强计划')],totalMinutes:360});
 const contextSchedule=[];
 for(const a of contexts.assignments){
  const day=days.find(d=>d.week>=a.week&&d.day<=364&&!contextSchedule.some(s=>s.day===d.day)&&d.tasks.some(t=>t.id==='vocabulary'&&t.mode==='practice'&&t.materialIds.reduce((n,id)=>n+(map.get(id)?.vocabulary?.length||0),0)+a.words.length<=12)&&d.tasks.some(t=>t.id==='grammar'&&t.mode==='practice'));
  if(!day)throw Error('No suitable ordinary day for lexical context '+a.contextId);
  const vocab=day.tasks.find(t=>t.id==='vocabulary'),grammar=day.tasks.find(t=>t.id==='grammar');vocab.materialIds.push(a.packId);vocab.quantity=vocab.materialIds.reduce((n,id)=>n+(map.get(id)?.vocabulary?.length||0),0);
  // Replace one repeatedly scheduled grammar pack with this original application task.
  if(grammar.materialIds.length>2)grammar.materialIds.pop();grammar.materialIds.push(a.contextId);grammar.quantity=grammar.materialIds.reduce((n,id)=>n+(map.get(id)?.questions?.length||0),0);
  contextSchedule.push({...a,day:day.day,scheduledWeek:day.week});
 }
 contexts.audit.schedule=contextSchedule;
 const expansion=CourseExpansion.load({root,requireAudio:!partial});materials.push(...expansion.materials);for(const material of expansion.materials)map.set(material.id,material);
 days.splice(0,days.length,...CourseExpansion.applySchedule(days,{materials}));
 const year=YearExpansion.load({root,partial:!requireYearExpansion,requireAudio:requireYearExpansion,derive:requireYearExpansion,existingMaterials:materials});
 // The year loader validates sources, derivations and audio independently.
 // Never expose inactive year material to core/public planning or selectors.
 const firstScheduled=new Map();for(const day of days)for(const task of day.tasks){task.materialPractice=task.materialIds.map(id=>{const first=firstScheduled.get(id);if(!firstScheduled.has(id))firstScheduled.set(id,day.day);return{materialId:id,cycle:first===undefined?'first-planned':'scheduled-reuse',firstPlannedDay:first===undefined?day.day:first};});task.practiceCycle=task.materialPractice.every(m=>m.cycle==='first-planned')?'first-planned':task.materialPractice.every(m=>m.cycle==='scheduled-reuse')?'scheduled-reuse':'mixed';}
 const audioMissing=materials.filter(m=>m.skill==='listening'&&!m.audio).map(m=>m.id);
 if(audioMissing.length&&!partial)throw Error('Course audio not complete: '+audioMissing.length+' files missing');
 const data={version:'1.0',status:missing.length||audioMissing.length?'development-preview':'complete-material-set',createdDate:'2026-10-24',scope:'原创练习材料；含完整题量训练，难度未经真实考生标定。软件完成不代表学习结果保证。',weeks:rows,materials,days,gates:Array.from({length:12},(_,i)=>{const week=(i+1)*4;return{week,A:'gate-'+String(week).padStart(2,'0')+'-A',B:'gate-'+String(week).padStart(2,'0')+'-B',minimumDelayHours:48};}),audit:{expectedAuthoringJobs:jobs.length,approvedAuthoringJobs:jobs.length-missing.filter(id=>!id.startsWith('sounds-')&&!id.startsWith('listening-map-')).length,lexicalExtensions:lexical.audit,foundationSoundModules:foundationSounds.length,listeningMapModules:listeningMaps.length,missing,audioMissing}};
 data.audit.independentBank={materials:independent.materials.length,sourceCount:independent.audit.sourceCount,questions:independent.audit.questions,syntheticLocales:independent.audit.syntheticLocales,humanLocales:independent.audit.humanLocales,humanReaders:independent.audit.humanReaders,voiceKinds:independent.audit.voiceKinds,figureTypes:independent.audit.figureTypes,coreSchedule:false,report:'curriculum/independent-bank/audit.json',humanReport:'curriculum/human-listening/audit.json'};data.audit.lexicalContexts=contexts.audit;
 data.audit.lesson2Expansion=expansion.audit;data.lessonExpansions=[{id:CourseExpansion.ID,day:2,materialIds:Object.values(CourseExpansion.IDS),newKnowledge:CourseExpansion.notes.newKnowledge,review:CourseExpansion.notes.review}];
 data.audit.yearExpansion={...year.audit,active:false};if(requireYearExpansion){data.audit.expectedAuthoringJobs+=YearExpansion.jobs.length;data.audit.approvedAuthoringJobs+=year.audit.loadedJobs;}
 require('./apply-listening-english.cjs').apply(materials,root);
 // Keep reviewed 2–10 source revisions after derivation/translation; protects the complete day-1 contract.
 require('./apply-stable-lessons-02-10.cjs').apply(data,{root});
 require('./apply-family-grammar-v89.cjs').apply(data,{root});
 const familyPublicAppendPaths=['curriculum/year-first-use-runtime-contract-v108-linked-continuation.json','curriculum/year-first-use-runtime-contract-v109-linked-lessons.json','curriculum/year-first-use-runtime-contract-v111-course-audit.json','curriculum/year-first-use-runtime-contract-v112-nas-startup.json','curriculum/year-first-use-runtime-contract-v113-multibatch.json'],deferFamily=familyLessonsRelease!==null&&familyPublicAppendPaths.includes(activation?.metadata.contract.path);
 if(familyLessonsRelease!==null&&!deferFamily){if(!['curriculum/year-first-use-runtime-contract-v97-family-lessons.json','curriculum/year-first-use-runtime-contract-v107-broadcast.json'].includes(activation?.metadata.contract.path))throw Error('Family lesson release requires the exact closed 55-component contract');data.audit.familyLessons=require('./apply-family-lessons-v95.cjs').apply(data,{root,releasePath:familyLessonsRelease});}
 // Append only after all original rows, day selection and derived packs exist.
 // Keep original base days immutable. A separate, hash-bound required plan is
 // applied only to eligible unstarted days after the learner archive is ready.
 const publicPractice=require('./build-public-supplement-materials.cjs').appendToCurriculum(data,{root,requireComplete:true});
 const basePublicContexts=require('./build-public-contexts.cjs').build({root});
 const gsa=gsaGradedRelease===null?null:require('./build-gsa-graded-course.cjs').appendToCurriculum(data,{root,releasePath:gsaGradedRelease,sourceContexts:basePublicContexts});
 let publicContexts=gsa?gsa.sourceContexts:basePublicContexts;
 const PublicPlan=require('./build-public-course-plan.cjs'),baseVocabularyCoverage=PublicPlan.vocabularyCoverageReference(root,basePublicContexts),planOptions={sourceContexts:publicContexts,entries:require('../assets/essential-vocabulary-data.js').entries,materialContentHash:require('../assets/assessment-core.js').materialContentHash,expandDay:require('../assets/course-expansion.js').overlay,vocabularyCoverage:gsa?require('./build-gsa-graded-course.cjs').addCoverageReference(baseVocabularyCoverage,gsa):baseVocabularyCoverage};
 let publicPlan=PublicPlan.build(data,planOptions),ordinary=null;
 if(ordinaryReadingRelease!==null){
  const baseData=JSON.parse(JSON.stringify(data)),basePlan=publicPlan,priorContexts=publicContexts;
  ordinary=require('./build-ordinary-reading-course.cjs').appendToCurriculum(data,{root,releasePath:ordinaryReadingRelease,sourceContexts:priorContexts});publicContexts=ordinary.sourceContexts;
  publicPlan=require('./append-ordinary-reading-plan.cjs').compose({baseData,data,basePlan,baseSourceContexts:priorContexts,sourceContexts:publicContexts,newMaterialIds:ordinary.materials.map(m=>m.id),newReadingStartDay:Math.max(...ordinary.catalog.map(s=>s.suggestedWindow[0])),entries:planOptions.entries,materialContentHash:planOptions.materialContentHash,expandDay:planOptions.expandDay});
  data.audit.ordinaryReading=require('./build-ordinary-reading-course.cjs').planReceipt(ordinary,publicPlan);
  write('curriculum/ordinary-reading-v92/runtime-integration.json',JSON.stringify(data.audit.ordinaryReading,null,2)+'\n');
  write('curriculum/ordinary-reading-v92/base-public-course-plan.json',JSON.stringify(basePlan,null,2)+'\n');
 }
 write('assets/public-context-data.js',"(function(root){'use strict';const data="+JSON.stringify(publicContexts).replace(/</g,'\\u003c')+";root.IELTSPublicContextData=data;if(typeof module==='object'&&module.exports)module.exports=data;})(typeof globalThis!=='undefined'?globalThis:this);\n");
 if(publicPlan.blocked.length)throw Error('Required public course plan has unscheduled variants: '+publicPlan.blocked.map(v=>v.materialId||v.reason).join(', '));
 data.publicCoursePlan=publicPlan;
 // Only the explicitly selected, separately reviewed version can append
 // after the fixed 98 public plan. Original plan/day/material pins are checked
 // before the real loader runs. The resulting receipt is inside the family
 // release and therefore inside the Year server's complete coreHash.
 if(deferFamily){
  // Read only the installed, version-controlled course bundle, never learner
  // state. A later build cannot silently drop/reorder its existing batches.
  const appended=multiRuntime?Catalog.append(data,{releases:familyPaths.map(releasePath=>({root,releasePath})),requiredHistory:requiredFamilyHistory}):require('./family-public-append-v1.cjs').append(data,{root,releasePath:familyLessonsRelease});
  data.audit.familyLessons=appended.result;data.audit.familyPublicAppend={schema:1,status:'versioned-experiment-requires-independent-activation',originalCoreHash:appended.receipt.originalCoreHash,originalPublicPlanHash:appended.receipt.originalPublicPlanHash};
  if(appended.catalog){data.audit.familyReleaseCatalog={schema:1,catalogSha256:appended.catalog.catalogSha256,counts:appended.catalog.counts,sourcePaths:familyPaths};write('curriculum/family-release-catalog.json',JSON.stringify(appended.catalog,null,2)+'\n');}
 }
 if(gsa){data.audit.gsaGradedCourse=require('./build-gsa-graded-course.cjs').planReceipt(gsa,publicPlan);write('curriculum/gsa-graded-course/runtime-integration.json',JSON.stringify(data.audit.gsaGradedCourse,null,2)+'\n');}
 if(requireYearExpansion){
  const budgetPlan=YearExpansion.budgetPlan(data,year.materials);
  budgetPlan.active=activateYearFirstUse;budgetPlan.runtimeConnected=activateYearFirstUse;
  if(activation){budgetPlan.status='reviewed-runtime-first-use-with-explicit-pending';budgetPlan.runtimeContract=activation.metadata;budgetPlan.limitations=budgetPlan.limitations.map(text=>text.startsWith('This is a local candidate')?'Runtime connection is explicitly declared by the reviewed source contract. Actual guarded admission, learning evidence and independent four-skill gates remain required; activation is not 365-day IELTS 7.0 attainment.':text);write(activation.metadata.contract.path,activation.text);}
  const planPath='curriculum/year-expansion-budget-plan.json',materialPath='curriculum/year-expansion-staged-materials.json',pendingPath='curriculum/year-expansion-pending.json';
  const planText=JSON.stringify(budgetPlan,null,2)+'\n',materialText=JSON.stringify({schema:1,active:activateYearFirstUse,runtimeConnected:activateYearFirstUse,status:activateYearFirstUse?'validated-content-on-demand-only':'validated-content-not-runtime-selectable',materials:year.materials},null,2)+'\n';
  const pendingText=JSON.stringify({schema:1,active:activateYearFirstUse,runtimeConnected:activateYearFirstUse,meaning:'Required work remains pending until actual guarded admission and completion. Course index is not a natural-calendar day.',summary:budgetPlan.summary,pending:budgetPlan.ledger.filter(row=>row.status==='pending'),spacedPractice:budgetPlan.spacedPractice},null,2)+'\n';
  const reference=(file,text,count)=>({path:file,sha256:crypto.createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text),count});
  write(planPath,planText);write(materialPath,materialText);write(pendingPath,pendingText);
  // Existing dynamic selectors inspect data.materials directly. Assert the
  // independent validator never inserted an inactive material into that registry.
  const stagedIds=new Set(year.materials.map(m=>m.id));if(data.materials.some(m=>stagedIds.has(m.id)))throw Error('Inactive year material leaked into the core registry');
  // A separate field avoids invalidating the existing public planner's legacy
  // yearExpansion hash and cannot activate the old unconditional overlay.
  data.yearFirstUse={schema:budgetPlan.schema,protocol:1,version:budgetPlan.version,active:activateYearFirstUse,status:budgetPlan.status,summary:budgetPlan.summary,plan:reference(planPath,planText,budgetPlan.ledger.length),stagedMaterials:reference(materialPath,materialText,year.materials.length),pending:reference(pendingPath,pendingText,budgetPlan.summary.all.pending),runtimeConnected:activateYearFirstUse,activationPolicy:'Explicit reviewed on-demand hydration only; activation does not create completion or calendar-day guarantees.'};
  if(activation)data.yearFirstUse.runtimeContract=activation.metadata;
  const packaged=require('./package-year-first-use.cjs').packageFirstUse({outputRoot:outRoot,plan:budgetPlan,catalog:{materials:year.materials},planRef:data.yearFirstUse.plan,runtimeContract:activation?.metadata||null,write});
  data.yearFirstUse.firstUseManifest=packaged.bootstrapRef;data.yearFirstUse.materialIndex=packaged.indexRef;
  Object.assign(data.yearFirstUse,{inputHash:budgetPlan.inputHash,coreHash:budgetPlan.baseHash,publicPlanHash:budgetPlan.publicPlanHash,contextCatalogHash:budgetPlan.contextCatalogHash});
  data.audit.yearExpansion={...data.audit.yearExpansion,active:activateYearFirstUse,scheduleSchema:budgetPlan.schema,planningStatus:budgetPlan.status,firstUse:budgetPlan.summary,authoredSourceMaterialsValidated:budgetPlan.summary.sources.total,derivedMaterialsValidated:budgetPlan.summary.derived.total,compiledYearMaterialsValidated:year.materials.length,runtimeSelectableYearMaterials:0,onDemandCatalogMaterials:activateYearFirstUse?year.materials.length:0,pendingCount:budgetPlan.summary.all.pending,pendingManifest:pendingPath,runtimeConnected:activateYearFirstUse};
 }
 const publicPlanAudit={schema:1,planHash:publicPlan.planHash,status:publicPlan.status,input:publicPlan.input,policy:publicPlan.policy,...publicPlan.audit,blocked:publicPlan.blocked,reviewBlocked:publicPlan.reviewBlocked};
 write('curriculum/public-course-plan.json',JSON.stringify(publicPlan,null,2)+'\n');write('curriculum/public-course-plan-audit.json',JSON.stringify(publicPlanAudit,null,2)+'\n');
 const required={status:'versioned-required-ordinary-day-plan',planHash:publicPlan.planHash,startDay:publicPlan.policy.startDay,requiredReadingTasks:publicPlan.audit.summary.readingAssignments,requiredListeningTasks:publicPlan.audit.summary.listeningAssignments,requiredTaskDays:new Set(publicPlan.assignments.map(v=>v.day)).size,baseDaysChanged:false,protectedHistoryPolicy:'Started/frozen days, drafts and attributable records keep their bound original; new assignments reroute only after profile readiness.',contextExecution:'Word/grammar context links and review windows are author plans, not executed recall tasks or mastery.',independentAssessmentEligible:false};
 data.audit.publicSupplements={...data.audit.publicSupplements,...required};
 write('curriculum/public-supplements/runtime-integration.json',JSON.stringify({...publicPractice.runtimeIntegration,...required,assignments:publicPlan.assignments.map(v=>({assignmentId:v.assignmentId,materialId:v.materialId,day:v.day,skill:v.skill,required:true,mode:'practice'}))},null,2)+'\n');
 const lexicalCoverage=Coverage.summarize(data);data.audit.lexicalCoverage={...lexicalCoverage,uncovered:undefined};write('curriculum/lexical-context-audit.json',JSON.stringify(contexts.audit,null,2)+'\n');write('curriculum/lexical-coverage.json',JSON.stringify(lexicalCoverage,null,2)+'\n');
 const json=JSON.stringify(data).replace(/</g,'\\u003c'),bundle=`(function(root){'use strict';const data=${json};root.IELTSCurriculumData=data;if(typeof module==='object'&&module.exports)module.exports=data;})(typeof globalThis!=='undefined'?globalThis:this);\n`;
 write('curriculum/coverage.json',JSON.stringify({status:data.status,days:days.length,minutes:days.reduce((n,d)=>n+d.totalMinutes,0),materials:data.materials.length,...(requireYearExpansion?{compiledMaterialCount:materials.length+year.materials.length}:{}),bySkill:data.materials.reduce((a,m)=>(a[m.skill]=(a[m.skill]||0)+1,a),{}),...data.audit},null,2)+'\n');
 // Publish the fully verified bundle last; refreshes see the old or new file.
 write('assets/curriculum-data.js',bundle);
 return data;
}
module.exports={build};if(require.main===module){const args=process.argv.slice(2),index=args.indexOf('--output-root'),contractIndex=args.indexOf('--year-runtime-contract'),gsaIndex=args.indexOf('--gsa-graded-release'),ordinaryIndex=args.indexOf('--ordinary-reading-release'),familyIndex=args.indexOf('--family-lessons-release');if(index>=0&&(!args[index+1]||args[index+1].startsWith('--')))throw Error('--output-root needs a staging directory');if(contractIndex>=0&&(!args[contractIndex+1]||args[contractIndex+1].startsWith('--')))throw Error('--year-runtime-contract needs a root-relative contract path');if(gsaIndex>=0&&(!args[gsaIndex+1]||args[gsaIndex+1].startsWith('--')))throw Error('--gsa-graded-release needs a root-relative reviewed release path');if(ordinaryIndex>=0&&(!args[ordinaryIndex+1]||args[ordinaryIndex+1].startsWith('--')))throw Error('--ordinary-reading-release needs a root-relative reviewed release path');const familyIndices=args.flatMap((v,i)=>v==='--family-lessons-release'?[i]:[]);for(const i of familyIndices)if(!args[i+1]||args[i+1].startsWith('--'))throw Error('--family-lessons-release needs a root-relative reviewed release path');const data=build({partial:args.includes('--partial'),requireYearExpansion:args.includes('--require-year-expansion'),activateYearFirstUse:args.includes('--activate-year-first-use'),...(contractIndex>=0?{yearRuntimeContract:args[contractIndex+1]}:{}),...(gsaIndex>=0?{gsaGradedRelease:args[gsaIndex+1]}:{}),...(ordinaryIndex>=0?{ordinaryReadingRelease:args[ordinaryIndex+1]}:{}),...(familyIndices.length>1?{familyLessonsReleases:familyIndices.map(i=>args[i+1])}:familyIndex>=0?{familyLessonsRelease:args[familyIndex+1]}:{}),outputRoot:index>=0?args[index+1]:root});console.log(JSON.stringify({status:data.status,materials:data.materials.length,days:data.days.length,missing:data.audit.missing.length,audioMissing:data.audit.audioMissing.length,yearExpansion:data.audit.yearExpansion.status,yearActive:data.audit.yearExpansion.active,runtimeConnected:data.yearFirstUse?.runtimeConnected||false}));}
