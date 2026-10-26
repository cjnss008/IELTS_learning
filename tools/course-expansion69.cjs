'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Shared=require('../assets/course-expansion.js');
const root=path.join(__dirname,'..');
const notes={id:Shared.ID,fromCourseDay:2,addedMaterialIds:Object.values(Shared.IDS),newKnowledge:['be一般疑问句及完整短答','be后not否定','we/they + are','已列student/teacher/book的规则复数'],review:['I am/you are、姓名、班级、数字和大小写'],newOriginalContent:{grammarQuestions:10,readingWords:124,readingQuestions:8,listeningWords:115,listeningQuestions:8,speakingReferenceWords:57,writingMinimumWords:40,writingSentences:'6–8'},limits:['第一课不变；第二课所有原材料保留，只追加五份原创材料。','第三课起仅重新安排既有语法材料，首次安排与计划巩固明确区分；没有新增365套独立新知识。','材料内容经Codex逐题核对，未称真人教师审题、独立盲解或真实考生难度标定。','语音与自由表达评阅仍须真实服务；音频缺失时正式构建失败，不以文字替代听力。','360分钟为学习和休息共用预算；参考分配不要求坐满，未完成原稿可续做。']};
const jobs=[{id:Shared.IDS.reading,skill:'reading',week:1,level:'A0',minWords:100,maxWords:140,questionCount:8,requireAudioHash:true},{id:Shared.IDS.listening,skill:'listening',week:1,level:'A0',minWords:100,maxWords:140,questionCount:8,requireAudioHash:true}];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function load(options={}){
 const project=options.root||root,materials=[];
 const {validate}=require('./author-curriculum.cjs');
 for(const id of Object.values(Shared.IDS).filter(id=>id!==Shared.IDS.vocabulary)){
  const material=JSON.parse(fs.readFileSync(path.join(project,'curriculum','materials',id+'.json'),'utf8'));
  if(material.id!==id||material.courseExpansion!==Shared.ID||material.availableFromDay!==2||material.pool!=='training'||material.fullTest!==false)throw Error('Lesson-2 expansion identity mismatch: '+id);
  const job=jobs.find(value=>value.id===id);if(job){const errors=validate(job,material);if(errors.length)throw Error(id+': '+errors.join('; '));for(const question of material.questions)if(!material[job.skill==='reading'?'passage':'transcript'].includes(question.evidence))throw Error(id+'/'+question.id+': exact source evidence required');}
  const fields=material.source?.contentHashFields;if(!Array.isArray(fields)||material.source.contentHash!==hash(JSON.stringify(Object.fromEntries(fields.map(key=>[key,material[key]])))))throw Error('Lesson-2 source hash mismatch: '+id);
  if(material.skill==='grammar'&&(!material.passage||material.questions?.length<8))throw Error('Lesson-2 needs a taught rule and at least eight new grammar questions.');
  if(material.skill==='speaking'&&(!material.reference||/^[A-D][.:：]\s/m.test(material.reference)))throw Error('Lesson-2 speaking needs a clean original reference.');
  if(material.skill==='writing'&&(material.minWords<40||!/6[–—-]8/.test(material.prompt)||!/at least 40 words/.test(material.prompt)))throw Error('Lesson-2 writing needs six to eight sentences and forty words.');
  if(material.skill==='listening'){
   if(material.questions.some(question=>/[\u3400-\u9fff]/.test(question.prompt+JSON.stringify(question.options||[]))))throw Error('Lesson-2 listening questions and options must be English.');
   const relative='audio/curriculum/'+id+'.mp3',audio=path.join(project,relative),metaFile=path.join(project,'curriculum','audio',id+'.json');material.audio='';
   if(fs.existsSync(audio)&&fs.existsSync(metaFile)){
    const meta=JSON.parse(fs.readFileSync(metaFile,'utf8'));
    if(meta.transcriptHash!==hash(material.transcript)||meta.audioHash!==hash(fs.readFileSync(audio)))throw Error('Lesson-2 listening audio/transcript hash mismatch.');
    material.audio=relative;material.audioVoice=(meta.voices||[]).join(' / ');material.audioDurationSeconds=meta.durationSeconds;material.audioSynthetic=meta.synthetic!==false;
   }
   if(options.requireAudio&&!material.audio)throw Error('Lesson-2 listening audio is not ready: '+id);
  }
  materials.push(material);
 }
 const wanted=['we','they','teachers','list','spare','classmates','evening'],ipas={we:'/wiː/',they:'/ðeɪ/',teachers:'/ˈtiːtʃəz/',list:'/lɪst/',spare:'/speə/',classmates:'/ˈklɑːsmeɪts/',evening:'/ˈiːvnɪŋ/'},vocabulary=wanted.map(word=>{const source=materials.find(material=>['reading','listening'].includes(material.skill)&&material.vocabulary.some(item=>item.word===word)),entry=source?.vocabulary.find(item=>item.word===word);if(!entry||(source.passage||source.transcript).includes(entry.example)!==true)throw Error('Expansion vocabulary must retain its exact source quote: '+word);return{...entry,ipa:ipas[word],sourceMaterialId:source.id,sourceQuote:entry.example};});
 materials.push({id:Shared.IDS.vocabulary,version:'1',week:1,level:'A0',pool:'training',fullTest:false,courseExpansion:Shared.ID,availableFromDay:2,skill:'vocabulary',type:'vocabulary',estimatedMinutes:15,title:'第2课新增 · 我们、他们与新班级原句词',instructions:'这7词都来自本课新增读听原句。先学词义和音标，每词完成三次正确英文输入及三次独立原音专业评测，再做补全、中文写英文、听写三轮。复数词按原句保留，不把词形与词族混为一个掌握指标。',questions:[],vocabulary,passage:vocabulary.map(item=>item.word+' — '+item.meaning+'\n'+item.example).join('\n\n'),source:{kind:'derived-lexical',rights:'项目原创读听材料的原句词汇',verification:'reviewed',sourceIds:[Shared.IDS.reading,Shared.IDS.listening],method:'只抽取本课新增源中确切出现的词形、释义与原句；不改写旧词稿，不凭覆盖认定掌握。'}});
 return{materials,audit:{...notes,originalSourceMaterials:5,derivedVocabularyWords:7,audioReady:materials.find(material=>material.skill==='listening')?.audio!==''}};
}
function applySchedule(days,data){
 const map=new Map(data.materials.map(material=>[material.id,material])),seen=new Set(),last=new Map(),out=[];
 for(const source of days){
  let day=source;
  if(source.day===2){day=JSON.parse(JSON.stringify(source));for(const task of day.tasks)if(Shared.RECOMMENDED_MINUTES[task.id]!==undefined)task.minutes=Shared.RECOMMENDED_MINUTES[task.id];day=Shared.overlay(day,data);}
  else if(source.day>=3&&source.day<=364&&source.tasks.some(task=>task.id==='grammar')){
   day=JSON.parse(JSON.stringify(source));const task=day.tasks.find(task=>task.id==='grammar'),original=[...new Set(task.materialIds||[])],fresh=original.filter(id=>!seen.has(id)),contexts=fresh.filter(id=>map.get(id)?.lexicalContext||id.startsWith('lexical-context-')),newIds=[...contexts,...fresh.filter(id=>!contexts.includes(id)).slice(0,1)],reviewPool=original.filter(id=>seen.has(id));
   if(source.day===3&&map.has(Shared.IDS.grammar))reviewPool.unshift(Shared.IDS.grammar);
   const reviewIds=[...new Set(reviewPool)].sort((a,b)=>(last.get(a)||0)-(last.get(b)||0)||a.localeCompare(b)).slice(0,1);
   // The new day-2 rule is intentionally recalled on day 3; other days rotate
   // one existing pack without pretending that a familiar ID is new content.
   if(source.day===3&&reviewPool.includes(Shared.IDS.grammar))reviewIds.splice(0,reviewIds.length,Shared.IDS.grammar);
   task.materialIds=[...new Set([...newIds,...reviewIds])];
   if(!task.materialIds.length)task.materialIds=original.slice(0,1);
   task.quantity=task.materialIds.reduce((sum,id)=>sum+(map.get(id)?.questions?.length||0),0);
   task.grammarLearningPlan={newMaterialIds:newIds,reviewMaterialIds:task.materialIds.filter(id=>!newIds.includes(id)),scope:'新包指本日首次安排的材料，不据此宣称新概念或个人掌握。'};
   task.instructions=newIds.length?'先完成本日首次安排的语法练习，再做一份明确的旧材料巩固；对照解释，用新人物或地点口头改写。首次安排的材料不代表规则从未学过。':'本日为已学语法巩固：沿用原材料做独立回忆，再换人物或地点改写。相同ID保留为复习，不当作新知识。';
   task.deliverable='本日语法原始答案、具体订正与新情境改写；首次安排和巩固材料分别标明';
  }
  for(const task of day.tasks||[])if(task.id==='grammar')for(const id of task.materialIds||[]){seen.add(id);last.set(id,day.day);}
  out.push(day);
 }
 return out;
}
module.exports={...Shared,notes,jobs,load,applySchedule};
