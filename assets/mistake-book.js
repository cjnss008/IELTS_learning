(function(root,factory){'use strict';const api=factory(root);root.IELTSMistakes=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const KEY='ielts52-mistake-book-v1',EVENT='ielts:mistakes-changed',MAX_ITEMS=20000,MAX_ROUNDS=500;
  const SKILLS=['vocabulary','grammar','listening','reading','speaking','writing','reflection','review'];
  const TYPES=['single','multi','short','dictation','spelling','subjective','oral'];
  const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k),copy=v=>JSON.parse(JSON.stringify(v));
  function plain(v,label){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error(label+'格式无效。');return v;}
  function fields(v,keys,label){plain(v,label);for(const key of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,key);if(typeof key!=='string'||!keys.includes(key)||d.get||d.set||['__proto__','constructor','prototype'].includes(key))throw Error(label+'含不支持的字段。');}}
  function dictionary(v,max,label){plain(v,label);const keys=Reflect.ownKeys(v);if(keys.length>max)throw Error(label+'数量过多。');for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(v,key);if(typeof key!=='string'||descriptor.get||descriptor.set||['__proto__','constructor','prototype'].includes(key))throw Error(label+'含不支持的字段。');}return v;}
  function text(v,max,label,empty=true){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||/\0/.test(v))throw Error(label+'长度或格式无效。');return v;}
  function id(v,label='错题ID'){if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v)||['__proto__','constructor','prototype'].includes(v))throw Error(label+'无效。');return v;}
  function dayNumber(v){if(!Number.isInteger(v)||v<1||v>365)throw Error('学习日须为 1–365。');return v;}
  function list(v,max,label){if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||Object.keys(v).length!==v.length)throw Error(label+'无效。');for(let n=0;n<v.length;n++){const d=Object.getOwnPropertyDescriptor(v,String(n));if(!d||d.get||d.set)throw Error(label+'含空项或访问器。');}return v;}
  function at(v){if(typeof v!=='string'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)throw Error('错题时间无效。');return v;}
  function safeJSON(v,depth=0){if(depth>18)throw Error('错题证据嵌套过深。');if(v===null||typeof v==='boolean')return v;if(typeof v==='number'){if(!Number.isFinite(v))throw Error('错题证据数字无效。');return v;}if(typeof v==='string')return text(v,60000,'证据文本');if(Array.isArray(v))return list(v,2000,'证据列表').map(x=>safeJSON(x,depth+1));plain(v,'证据');const out={};for(const k of Object.keys(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('错题证据键无效。');const d=Object.getOwnPropertyDescriptor(v,k);if(d.get||d.set)throw Error('错题证据不得包含访问器。');out[k]=safeJSON(v[k],depth+1);}return out;}
  function reviewEvidence(value){const result=safeJSON(value??null);if(result?.record&&typeof result.record==='object'){const record=result.record;result.record=Object.fromEntries(['id','materialId','skill','answer','media','version'].filter(k=>own(record,k)).map(k=>[k,record[k]]));}return result;}
  function stable(v){if(Array.isArray(v))return'['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
  function hash(v){const str=typeof v==='string'?v:stable(v);let a=2166136261,b=5381;for(let n=0;n<str.length;n++){a=Math.imul(a^str.charCodeAt(n),16777619);b=Math.imul(b,33)^str.charCodeAt(n);}return(a>>>0).toString(36)+(b>>>0).toString(36);}
  const makeId=prefix=>prefix+'-'+(root.crypto?.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  function recapContent(v){return v&&v.ok===true&&v.status==='complete'&&['recap','text','feedback','summary'].some(k=>typeof v[k]==='string'&&Boolean(v[k].trim()));}
  function answer(v){if(typeof v==='string')return text(v,50000,'作答');return list(v,100,'多选作答').map(x=>text(x,2000,'选项'));}
  function answered(v){return Array.isArray(v)?v.length>0&&v.every(s=>typeof s==='string'&&Boolean(s.trim())):typeof v==='string'&&Boolean(v.trim());}
  function normalize(v){return String(v??'').normalize('NFKC').replace(/[‘’]/g,"'").trim().replace(/\s+/g,' ').replace(/^["“”]+|["“”]+$/g,'').toLowerCase();}
  const words=v=>(String(v).match(/(?:[A-Za-z]\.){2,}|[0-9]+(?:[:,.][0-9]+)*(?:[A-Za-z]+)?(?:[’'’-][A-Za-z0-9]+)*|[A-Za-z][A-Za-z0-9]*(?:[’'’-][A-Za-z0-9]+)*/g)||[]).length;
  function question(v){
    fields(v,['id','type','prompt','options','answers','explanation','evidence','maxWords','task','level','minWords','fullTest','material','thresholds','reference','returnUrl'],'错题题目');
    if(!TYPES.includes(v.type))throw Error('错题类型无效。');const out={id:id(v.id||'output','题目ID'),type:v.type,prompt:text(v.prompt,16000,'题目',false),options:list(v.options||[],100,'选项').map(x=>text(x,4000,'选项',false)),answers:list(v.answers||[],100,'标准答案').map(x=>text(String(x),50000,'标准答案',false)),explanation:text(v.explanation||'',16000,'解析'),evidence:text(v.evidence||'',30000,'原文依据')};
    if(v.maxWords!==undefined){if(!Number.isInteger(v.maxWords)||v.maxWords<1||v.maxWords>10000)throw Error('答案词数无效。');out.maxWords=v.maxWords;}
    if(v.minWords!==undefined){if(!Number.isInteger(v.minWords)||v.minWords<0||v.minWords>10000)throw Error('输出最低词数无效。');out.minWords=v.minWords;}
    if(v.task!==undefined)out.task=text(v.task,80,'任务类型');if(v.level!==undefined)out.level=text(v.level,40,'学习阶段');
    if(v.fullTest!==undefined){if(typeof v.fullTest!=='boolean')throw Error('完整测评标记无效。');out.fullTest=v.fullTest;}
    if(v.material!==undefined)out.material=safeJSON(v.material);
    if(v.reference!==undefined)out.reference=text(v.reference,16000,'朗读原文');if(v.returnUrl!==undefined)out.returnUrl=text(v.returnUrl,2000,'原任务地址');
    if(v.thresholds!==undefined){fields(v.thresholds,['accuracy','fluency','completeness'],'朗读阈值');out.thresholds={};for(const name of ['accuracy','fluency','completeness']){const score=v.thresholds[name];if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100)throw Error('朗读阈值无效。');out.thresholds[name]=score;}}
    if(!['subjective','oral'].includes(out.type)&&!out.answers.length)throw Error('客观错题须保留标准答案。');return out;
  }
  function media(v=[]){return list(v,8,'录音引用').map(x=>{fields(x,['id','name','mime','durationSeconds'],'录音引用');if(!Number.isFinite(x.durationSeconds)||x.durationSeconds<0||x.durationSeconds>900)throw Error('录音时长无效。');return{id:id(x.id),name:text(x.name,240,'录音名称',false),mime:text(x.mime,100,'录音类型',false),durationSeconds:x.durationSeconds};});}
  function submission(v){if(typeof v==='string'||Array.isArray(v))return{answer:answer(v),media:[]};fields(v,['answer','media'],'订正提交');return{answer:answer(v.answer),media:media(v.media)};}
  function evaluation(v={}){fields(v,['method','result','feedback','score','maxScore','criteria','threshold'],'原作评价');const out=safeJSON(v);if(out.feedback!==undefined)text(out.feedback,60000,'原作反馈');return out;}
  function cleanOccurrence(v){fields(v,['id','recordId','recordVersion','at','answer','evaluation','media'],'原始尝试');if(!Number.isInteger(v.recordVersion)||v.recordVersion<1||v.recordVersion>10000)throw Error('原作版本无效。');return{id:id(v.id,'捕获ID'),recordId:id(v.recordId,'原作ID'),recordVersion:v.recordVersion,at:at(v.at),answer:answer(v.answer),evaluation:evaluation(v.evaluation),media:media(v.media)};}
  function cleanResult(v){fields(v,['itemId','answer','media','status','feedback','evidence'],'订正结果');if(!['passed','wrong','pending'].includes(v.status))throw Error('订正状态无效。');const out={itemId:id(v.itemId),answer:answer(v.answer),media:media(v.media),status:v.status,feedback:text(v.feedback||'',60000,'订正反馈'),evidence:safeJSON(v.evidence??null)};if(!answered(out.answer))throw Error('订正结果不得为空。');return out;}
  function newState(){return{schemaVersion:1,items:[],days:{}};}
  function parseState(input){
    if(typeof input==='string'){if(input.length>96*1024*1024)throw Error('错题备份超过 96 MB。');input=JSON.parse(input);}fields(input,['schemaVersion','items','days'],'错题本');if(input.schemaVersion!==1)throw Error('错题本版本无效。');
    const out=newState(),seen=new Set();out.items=list(input.items,MAX_ITEMS,'错题集合').map(v=>{fields(v,['id','key','dayNumber','source','materialId','recordId','skill','questionId','title','question','originalAnswer','createdAt','occurrences','status','lastRoundId','oralEvidence'],'错题');const item={id:id(v.id),key:text(v.key,600,'错题来源标识',false),dayNumber:dayNumber(v.dayNumber),source:text(v.source,100,'错题来源',false),materialId:id(v.materialId,'材料ID'),recordId:id(v.recordId,'原作ID'),skill:v.skill,questionId:id(v.questionId,'题目ID'),title:text(v.title,400,'错题标题',false),question:question(v.question),originalAnswer:answer(v.originalAnswer),createdAt:at(v.createdAt),occurrences:list(v.occurrences,1000,'原始尝试').map(cleanOccurrence),status:v.status,lastRoundId:v.lastRoundId===null?null:id(v.lastRoundId,'订正轮次ID'),...(v.oralEvidence!==undefined?{oralEvidence:safeJSON(v.oralEvidence)}:{})};
      if(!SKILLS.includes(item.skill)||!['passed','wrong','pending'].includes(item.status)||!item.occurrences.length||new Set(item.occurrences.map(x=>x.id)).size!==item.occurrences.length||seen.has(item.id)||seen.has('key:'+item.key))throw Error('错题身份、尝试或状态无效。');seen.add(item.id);seen.add('key:'+item.key);if(stable(item.originalAnswer)!==stable(item.occurrences[0].answer)||item.recordId!==item.occurrences[0].recordId||item.createdAt!==item.occurrences[0].at)throw Error('原始错误记录不能被订正覆盖。');return item;});
    dictionary(input.days,365,'错题每日复盘');
    for(const [d,v]of Object.entries(input.days)){if(String(dayNumber(Number(d)))!==d)throw Error('复盘学习日无效。');fields(v,['rounds','drafts','completion','recordVersions'],'每日错题复盘');const rounds=list(v.rounds,MAX_ROUNDS,'订正轮次').map((r,n)=>{fields(r,['id','number','at','token','results'],'订正轮次');if(r.number!==n+1)throw Error('订正轮次不连续。');const results=list(r.results,MAX_ITEMS,'整页订正结果').map(cleanResult);if(!results.length||new Set(results.map(x=>x.itemId)).size!==results.length||results.some(x=>!out.items.some(i=>i.id===x.itemId&&i.dayNumber===Number(d))))throw Error('订正轮次包含无效错题。');return{id:id(r.id,'订正轮次ID'),number:r.number,at:at(r.at),token:text(r.token,100,'提交快照',false),results};});if(new Set(rounds.map(r=>r.id)).size!==rounds.length)throw Error('订正轮次ID重复。');
      const drafts={};dictionary(v.drafts,MAX_ITEMS,'订正草稿');for(const [itemId,value]of Object.entries(v.drafts)){id(itemId);if(!out.items.some(i=>i.id===itemId&&i.dayNumber===Number(d)))throw Error('草稿错题不存在。');drafts[itemId]=submission(value);}
      let completion=null;if(v.completion!==null){fields(v.completion,['at','token','recap'],'AI复盘完成记录');completion={at:at(v.completion.at),token:text(v.completion.token,100,'AI复盘快照',false),recap:safeJSON(v.completion.recap)};if(!recapContent(completion.recap))throw Error('AI复盘完成记录缺少有效反馈。');if(JSON.stringify(completion.recap).length>150000)throw Error('AI复盘过长。');}
      const recordVersions={};dictionary(v.recordVersions||{},10000,'本日作品快照');for(const [recordId,version]of Object.entries(v.recordVersions||{})){id(recordId,'本日原作ID');fields(version,['version','signature'],'本日作品版本');if(!Number.isInteger(version.version)||version.version<1||version.version>10000)throw Error('本日作品版本无效。');recordVersions[recordId]={version:version.version,signature:text(version.signature,100,'本日作品摘要',false)};}
      out.days[d]={rounds,drafts,completion,recordVersions};
    }
    for(const daily of Object.values(out.days))for(const round of daily.rounds)for(const result of round.results){if(result.status!=='passed')continue;const item=out.items.find(i=>i.id===result.itemId),grade=item.question.type==='oral'?oralGrade(item,result.evidence):item.question.type==='subjective'?subjectiveGrade(item,{answer:result.answer,media:result.media},result.evidence):gradeObjective(item.question,result.answer);if(grade.status!=='passed')throw Error('订正通过标记缺少正确答案或有效评阅证据。');}
    for(const item of out.items){if(item.lastRoundId){const round=out.days[item.dayNumber]?.rounds.find(r=>r.id===item.lastRoundId),result=round?.results.find(r=>r.itemId===item.id);if(!result||result.status!==item.status)throw Error('错题状态与最后订正轮次不一致。');}else if(item.status==='passed')throw Error('错题未经提交不能消失。');}
    return out;
  }
  function stateDay(state,day){return state.days[day]||(state.days[day]={rounds:[],drafts:{},completion:null,recordVersions:{}});}
  function tokenFor(state,day){const items=state.items.filter(i=>i.dayNumber===day);return hash({day,items:items.map(i=>({id:i.id,occurrences:i.occurrences.map(o=>o.id),status:i.status,lastRoundId:i.lastRoundId,oralEvidence:i.oralEvidence||null})),rounds:state.days[day]?.rounds.map(r=>r.id)||[],records:state.days[day]?.recordVersions||{}});}
  function summaryParsed(state,day){dayNumber(day);const items=state.items.filter(i=>i.dayNumber===day),pending=items.filter(i=>i.status==='pending'),remaining=items.filter(i=>i.status!=='passed'),passed=items.length-remaining.length,token=tokenFor(state,day),daily=state.days[day]||{rounds:[],drafts:{},completion:null};return{dayNumber:day,total:items.length,passed,remaining:remaining.length,pending:pending.length,allCorrect:remaining.length===0,token,rounds:daily.rounds.length,completionValid:remaining.length===0&&daily.completion?.token===token,completion:daily.completion?.token===token?copy(daily.completion):null,items:copy(items),remainingItems:copy(remaining),drafts:copy(daily.drafts)};}
  function summary(state,day){return summaryParsed(parseState(state),day);}
  function recordCorrectionStatusParsed(record,state){
    const empty={corrected:false,submitted:false,quantity:0,roundIds:[]};if(!record||!Number.isInteger(record.dayNumber)||!record.materialId)return empty;
    const all=state.items.filter(i=>i.dayNumber===record.dayNumber&&i.materialId===record.materialId);if(!all.length||all.some(i=>i.status!=='passed'||!i.lastRoundId))return empty;
    const identities=new Map([[record.id,record.version||1]]),artifact=decoded(record.answer);if(artifact?.kind==='vocabulary-three-modes'){for(const round of artifact.rounds||[])for(const attempt of round.attempts||[]){const rid=attempt.attemptId||attempt.id;if(rid)identities.set(rid,1);}for(const word of artifact.learning||[])for(const attempt of word.speaking||[])if(attempt.workId)identities.set(attempt.workId,1);}
    const matching=all.filter(i=>i.occurrences.some(o=>identities.get(o.recordId)===o.recordVersion));if(!matching.length)return empty;
    const daily=state.days[record.dayNumber],results=[];
    for(const item of all){const round=daily?.rounds.find(r=>r.id===item.lastRoundId),result=round?.results.find(r=>r.itemId===item.id);if(!round||result?.status!=='passed')return empty;if(matching.some(i=>i.id===item.id))results.push({item,round,result});}
    const latest=results.sort((a,b)=>b.round.number-a.round.number)[0],subjective=results.filter(x=>x.item.question.type==='subjective'&&x.item.skill===record.skill).sort((a,b)=>b.round.number-a.round.number)[0];
    return{corrected:true,submitted:true,recordId:record.id,recordVersion:record.version||1,materialId:record.materialId,skill:record.skill,quantity:subjective?words(subjective.result.answer):record.quantity||0,answer:subjective?copy(subjective.result.answer):copy(latest.result.answer),feedback:subjective?.result.feedback||latest.result.feedback,itemId:subjective?.item.id||latest.item.id,roundId:subjective?.round.id||latest.round.id,roundNumber:subjective?.round.number||latest.round.number,at:subjective?.round.at||latest.round.at,roundIds:[...new Set(results.map(x=>x.round.id))]};
  }
  function capture(state,input,now=new Date().toISOString()){
    state=parseState(state);fields(input,['id','dayNumber','source','materialId','recordId','recordVersion','skill','questionId','title','question','originalAnswer','evaluation','media','at','status'],'错题捕获');const day=dayNumber(input.dayNumber),q=question(input.question),qid=id(input.questionId||q.id,'题目ID'),source=text(input.source,100,'错题来源',false),mid=id(input.materialId,'材料ID'),rid=id(input.recordId,'原作ID'),key=[day,source,mid,qid].join('|'),occurrence=cleanOccurrence({id:input.id||'capture-'+hash([rid,input.recordVersion||1,qid]),recordId:rid,recordVersion:input.recordVersion||1,at:input.at||now,answer:input.originalAnswer??'',evaluation:input.evaluation||{},media:input.media||[]});
    let item=state.items.find(i=>i.key===key);if(item?.occurrences.some(o=>o.id===occurrence.id))return{state,item,duplicate:true};if(item&&stable(item.question)!==stable(q))throw Error('同一错题的标准答案或题目发生冲突，原记录保留。');
    if(!SKILLS.includes(input.skill))throw Error('错题技能无效。');const status=input.status==='pending'?'pending':'wrong';if(item){if(item.occurrences.length>=1000)throw Error('本题原始尝试已达到上限，请先备份。');item.occurrences.push(occurrence);item.status=status;item.lastRoundId=null;delete item.oralEvidence;}else{if(state.items.length>=MAX_ITEMS)throw Error('错题本达到本机上限，请先导出归档。');item={id:'mistake-'+hash(key),key,dayNumber:day,source,materialId:mid,recordId:rid,skill:input.skill,questionId:qid,title:text(input.title||q.prompt,400,'错题标题',false),question:q,originalAnswer:copy(occurrence.answer),createdAt:occurrence.at,occurrences:[occurrence],status,lastRoundId:null};state.items.push(item);}stateDay(state,day).completion=null;return{state:parseState(state),item:copy(item),duplicate:false};
  }
  function gradeObjective(q,supplied){
    q=question(q);if(['subjective','oral'].includes(q.type))return{status:'pending',feedback:'本题需要真实 AI 或语音评阅。',evidence:null};
    const values=q.type==='multi'?(Array.isArray(supplied)?supplied:[]):[typeof supplied==='string'?supplied:''];
    const choice=['single','multi'].includes(q.type)&&q.options.length>0,normalizer=choice?v=>String(v).normalize('NFKC').trim().replace(/\s+/g,' '):q.type==='spelling'?v=>String(v).trim().toLowerCase():q.type==='dictation'?v=>normalize(v).replace(/(\d),(?=\d)/g,'$1').replace(/[^a-z0-9'\s]/g,' ').replace(/\s+/g,' ').trim():normalize;
    const expected=q.answers.map(normalizer),actual=values.map(normalizer).filter(Boolean),validOptions=!choice||values.every(v=>q.options.some(option=>normalizer(option)===normalizer(v)));
    const correct=validOptions&&actual.length>0&&(!q.maxWords||values.every(v=>words(v)<=q.maxWords))&&(q.type==='multi'?new Set(actual).size===actual.length&&actual.length===expected.length&&expected.every(v=>actual.includes(v)):expected.includes(actual[0]));
    return{status:correct?'passed':'wrong',feedback:correct?'本题已全部答对。':(q.explanation||'答案仍不完整或不正确，请再次作答。'),evidence:{method:'objective',correct,expected:q.answers}};
  }
  function oralReferenceVariants(item){
    const reference=item.question.reference||item.question.prompt,fallback={reference,spoken:reference,legacy:reference,segmentIndex:null,ambiguous:false};
    try{
      const data=root.IELTSCurriculumData||(typeof module==='object'&&module.exports?require('./curriculum-data.js'):null),oral=root.IELTSOralPractice||(typeof module==='object'&&module.exports?require('./oral-practice.js'):null),materials=data?.materials||[],material=materials.find(m=>m.id===item.materialId);if(!material||!oral?.spokenReferenceParts)return fallback;
      const base=materials.find(m=>m.id===material.id.replace(/-speaking$/,'')),reading=data.days?.find(d=>d.day===item.dayNumber)?.tasks?.find(t=>t.id==='reading'),source=base?.passage||reading?.materialIds?.map(id=>materials.find(m=>m.id===id)).find(m=>m?.pool==='training')?.passage||material.reference||'';
      if(!source)return fallback;const legacy=oral.splitReference(source,65),spoken=oral.spokenReferenceParts(source,65),indices=legacy.flatMap((part,i)=>reference===part||reference===spoken[i]?[i]:[]),index=indices[0];return index===undefined?fallback:{reference,spoken:spoken[index],legacy:legacy[index],segmentIndex:index,ambiguous:indices.length!==1};
    }catch(_){return fallback;}
  }
  function oralReferenceMatches(item,reference){const original=item.question.reference||item.question.prompt;if(normalize(reference)===normalize(original))return true;const variants=oralReferenceVariants(item);return reference===variants.spoken||reference===variants.legacy;}
  function oralWord(value){
    let word=typeof value==='string'?value.normalize('NFKC').trim().replace(/[’‘]/g,"'"):'';
    for(let i=0;i<3;i++){const before=word;word=word.replace(/^[.,!?;:，。！？；：“”"()\[\]{}<>]+|[.,!?;:，。！？；：“”"()\[\]{}<>]+$/g,'');if(word.length>2&&word.startsWith("'")&&word.endsWith("'"))word=word.slice(1,-1);if(word===before)break;}
    return /^'?[A-Za-z]+(?:['.-][A-Za-z]+)*'?$/.test(word)?word:'';
  }
  function oralArchiveCandidate(item,work,occurrenceIds=null){
    const occurrences=occurrenceIds?item?.occurrences.filter(o=>occurrenceIds.includes(o.id)):item?.occurrences;
    if(!item||item.question.type!=='oral'||!work||work.kind!=='audio'||work.mode!=='daily_reading'||work.task!=='oral_reading'||work.materialId!==item.materialId||work.dayNumber!==item.dayNumber||!occurrences?.length||occurrences.some(o=>o.recordId===work.id))return false;
    const variants=oralReferenceVariants(item),latest=Math.max(...occurrences.map(o=>Date.parse(o.at))),created=Date.parse(work.createdAt);
    return Number.isInteger(variants.segmentIndex)&&!variants.ambiguous&&(work.originalText===variants.legacy||work.originalText===variants.spoken)&&work.prompt===work.originalText&&Number.isFinite(latest)&&Number.isFinite(created)&&created>latest;
  }
  function oralArchiveProofValid(item,proof){
    const archive=proof?.archive,variants=oralReferenceVariants(item);if(!archive||archive.schema!==1||proof.validationVersion!==2||proof.source!=='local-archive'||proof.archived!==true||proof.verified!==false||proof.provider!=='ali'||archive.workId!==proof.workId||archive.evidenceId!==proof.evidenceId||archive.coachEvidenceId!==proof.evidenceId||archive.provider!=='Alibaba oral assessment'||archive.segmentIndex!==variants.segmentIndex||archive.queueStatus!=='reviewed'||!Number.isInteger(archive.version)||archive.version<1||!/^audio\//.test(archive.mime||'')||!Number.isInteger(archive.bytes)||archive.bytes<1||!Number.isFinite(archive.durationSeconds)||archive.durationSeconds<.1||archive.durationSeconds>180.1||proof.result?.text!==archive.originalText||proof.reference!==archive.originalText)return false;
    const ids=archive.errorOccurrenceIds;if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!item.occurrences.some(o=>o.id===id)))return false;const sourceOccurrences=item.occurrences.filter(o=>ids.includes(o.id));if(Date.parse(archive.errorCutoffAt)!==Math.max(...sourceOccurrences.map(o=>Date.parse(o.at))))return false;
    if(!oralArchiveCandidate(item,{...archive,id:archive.workId},ids)||!Number.isFinite(Date.parse(archive.updatedAt))||Date.parse(archive.updatedAt)<Date.parse(archive.createdAt))return false;
    const originalEvidence=sourceOccurrences.map(o=>decoded(o.evaluation.feedback)?.evidenceId).filter(Boolean);return !originalEvidence.includes(proof.evidenceId);
  }
  function archivedOralEvidence(item,work){
    if(!oralArchiveCandidate(item,work)||typeof Blob==='undefined'||!(work.blob instanceof Blob)||!work.blob.size)return null;
    const diagnosis=work.diagnosis;if(diagnosis?.provider!=='Alibaba oral assessment'||typeof work.evidenceId!=='string'||!work.evidenceId||work.evidenceId.length>120||diagnosis.evidenceId!==work.evidenceId||work.audioReview?.feedbackFormat!=='oral-coach-v1'||work.audioReview.evidenceId!==work.evidenceId)return null;
    let proof;try{proof=safeJSON({validationVersion:2,provider:'ali',source:'local-archive',archived:true,verified:false,workId:work.id,evidenceId:work.evidenceId,reference:work.originalText,result:diagnosis.result,archive:{schema:1,workId:work.id,kind:work.kind,mode:work.mode,task:work.task,materialId:work.materialId,dayNumber:work.dayNumber,segmentIndex:oralReferenceVariants(item).segmentIndex,originalText:work.originalText,prompt:work.prompt,createdAt:work.createdAt,updatedAt:work.updatedAt,version:work.version,queueStatus:work.queueStatus,durationSeconds:work.durationSeconds,mime:work.blob.type,bytes:work.blob.size,provider:diagnosis.provider,evidenceId:work.evidenceId,coachEvidenceId:work.audioReview.evidenceId,errorOccurrenceIds:item.occurrences.map(o=>o.id),errorCutoffAt:new Date(Math.max(...item.occurrences.map(o=>Date.parse(o.at)))).toISOString()}});}catch(_){return null;}
    return oralArchiveProofValid(item,proof)?proof:null;
  }
  function attachArchivedOralEvidence(state,itemId,work){
    state=parseState(state);const item=state.items.find(i=>i.id===itemId&&i.question.type==='oral'&&i.status!=='passed');if(!item)return state;const proof=archivedOralEvidence(item,work);if(!proof)return state;
    if(stable(item.oralEvidence)!==stable(proof)){item.oralEvidence=proof;stateDay(state,item.dayNumber).completion=null;}return state;
  }
  function oralGrade(item,result){
    const proof=result?.oralEvidence||result,q=item.question,thresholds=q.thresholds||{accuracy:80,fluency:75,completeness:90};
    const archive=oralArchiveProofValid(item,proof);
    if(!proof||proof.provider!=='ali'||proof.verified!==true&&!archive||proof.source==='local-archive'&&!archive||typeof proof.workId!=='string'||typeof proof.evidenceId!=='string'||!proof.workId||!proof.evidenceId||!archive&&item.occurrences.some(o=>o.recordId===proof.workId)||!oralReferenceMatches(item,proof.reference))return{status:'pending',feedback:'请核对已保存的新原音评测，或在本项订正入口重新录音；未核验的历史分数不能替代订正。',evidence:reviewEvidence(result)};
    const scores=proof.result;if(!scores||['accuracy','fluency','completeness'].some(k=>typeof scores[k]!=='number'||!Number.isFinite(scores[k])||scores[k]<0||scores[k]>100))return{status:'pending',feedback:'专业评测缺少准确度、流利度或完整度，本题保持待评。',evidence:safeJSON(proof)};
    if(proof.validationVersion!==undefined&&![1,2].includes(proof.validationVersion))return{status:'pending',feedback:'本次朗读订正的核验版本暂不支持，原音与证据保留待核对。',evidence:safeJSON(proof)};
    const target=/^重新朗读[：:]\s*(.+)$/.exec(q.prompt||'')?.[1]?.trim()||'',candidate=target||q.reference||'',singleTarget=/^\S+$/.test(candidate.trim()),targetWord=singleTarget?oralWord(candidate):'';
    if(proof.validationVersion===2&&singleTarget&&!targetWord)return{status:'pending',feedback:'本项目标词尚不能明确核对，原音与词级结果保留待验证，不退回只用整段分数判断。',evidence:safeJSON(proof)};
    if(proof.validationVersion===2&&targetWord){
      const key=value=>oralWord(value).toLowerCase(),details=(Array.isArray(scores.words)?scores.words:[]).filter(word=>typeof word?.word==='string'&&key(word.word)===key(targetWord));
      if(!details.length||details.some(word=>Number.isInteger(word.providerEvidence?.fake_pron)||word.providerEvidence?.is_pause===true||word.providerEvidence?.is_pause===1||typeof word.accuracy!=='number'||!Number.isFinite(word.accuracy)||word.accuracy<0||word.accuracy>100))return{status:'pending',feedback:'目标词 '+targetWord+' 尚无可核对的词级明细，或存在服务词典覆盖限制。原音保留待核对，不以整段分数清除此词项。',evidence:safeJSON(proof)};
      if(details.some(word=>['Omission','Repetition'].includes(word.error)||word.accuracy<thresholds.accuracy))return{status:'wrong',feedback:'目标词 '+targetWord+' 的真实词级结果仍未达到准确度 '+thresholds.accuracy+' 的训练线；整段总分不能替代该词订正。',evidence:safeJSON(proof)};
    }
    const pass=Object.keys(thresholds).every(k=>scores[k]>=thresholds[k]);return{status:pass?'passed':'wrong',feedback:pass?(proof.validationVersion===2&&targetWord?'目标词 '+targetWord+' 的真实词级准确度及本次三维指标均达到训练线。':archive?'已核验的本机归档录音达到准确度、流利度和完整度训练线；不是本次新调用。':'本次新录音达到准确度、流利度和完整度训练线。'):'本次录音仍有维度未达训练线，请继续跟读并重新录音。',evidence:safeJSON(proof)};
  }
  function subjectiveGrade(item,value,result){
    const supplied=submissionWithRecord(item,value,result),q=item.question,review=result?.review||result?.result||result,raw=result?.record;let feedback=typeof result?.feedback==='string'?result.feedback:'';
    if(raw){const artifact=decoded(raw.answer),actual=artifact?(item.skill==='speaking'?artifact.transcript:artifact.text):raw.answer;if(normalize(actual)!==normalize(supplied.answer)||raw.skill&&raw.skill!==item.skill||raw.materialId&&raw.materialId!==item.materialId)return{status:'pending',feedback:'评阅来源与这次提交的原稿不匹配，请重新评阅本次原稿。',evidence:reviewEvidence(result)};}
    if(!review||review.status!=='complete'||!Array.isArray(review.rounds)){const errors=(Array.isArray(review?.rounds)?review.rounds:[]).filter(r=>r?.ok!==true).map(r=>[r.error?.code,r.error?.message].filter(v=>typeof v==='string').join('：').slice(0,400)).filter(Boolean).join('；').replace(/\bBearer\s+[^\s；]+/gi,'Bearer [已隐藏]').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g,'[已隐藏]').slice(0,1000);return{status:'pending',feedback:(feedback||'评阅未完成，已保留本次原稿，请重试。')+(errors?' 原因：'+errors:''),evidence:reviewEvidence(result)};}
    const rounds=review.rounds.filter(r=>r?.ok===true),original=normalize(supplied.answer),grounded=e=>typeof e?.quote==='string'&&normalize(e.quote)&&original.includes(normalize(e.quote));
    if(rounds.length<2||new Set(rounds.map(r=>r.round)).size<2)return{status:'pending',feedback:'两轮 AI 评阅尚未完整返回，本题保持待评。',evidence:reviewEvidence(result)};
    const acoustic=item.skill==='speaking',material=q.material||{id:item.materialId,skill:item.skill,fullTest:q.fullTest},ali=acoustic&&q.task==='foundation'&&!q.fullTest&&review.pronunciationSource?foundationPronunciation(item,supplied,review,raw):null;
    if(ali?.pending)return{status:'pending',feedback:ali.feedback,evidence:reviewEvidence(result)};
    if(acoustic&&(!supplied.media.length||!ali&&(review.audioAnalysisEvidence!==true||!review.audioSource)))return{status:'pending',feedback:'需提交本次新录音并取得有效听音评价；文字不能验证口语。',evidence:reviewEvidence(result)};
    if(ali&&!ali.pass)return{status:'wrong',feedback:ali.feedback,evidence:reviewEvidence(result)};
    let pass=false,pending=false;
    if(q.fullTest){
      const assessment=root.IELTSAssessment,record={...(raw||{id:review.audioSource?.recordId||'mistake-review',answer:JSON.stringify({schema:1,text:acoustic?'':supplied.answer,transcript:acoustic?supplied.answer:''}),media:supplied.media}),evaluation:{method:'ai',result:'pending',feedback:JSON.stringify(review)}};
      const checked=assessment?.evaluatedCriteria?assessment.evaluatedCriteria(record,material,7):fullReviewCheck(record,material,review);pass=checked.pass;pending=checked.criteria.some(c=>!c.complete);feedback=feedback||checked.reasons.join('；');
    }else{
      const complete=rounds.every(r=>r.levelCheck&&typeof r.levelCheck.meetsGoal==='boolean'&&Array.isArray(r.levelCheck.evidence)&&r.levelCheck.evidence.some(grounded));pending=!complete;
      pass=complete&&!review.requiresRetest&&rounds.every(r=>r.levelCheck.meetsGoal===true);
      if(acoustic&&!ali){const source=review.audioSource,duration=source?.durationSeconds;let cursor=0;const valid=source?.completeCoverage===true&&Array.isArray(source.mediaIds)&&source.mediaIds.length===supplied.media.length&&source.mediaIds.every((v,i)=>v===supplied.media[i].id)&&Number.isFinite(duration)&&duration>0&&Array.isArray(source.segments)&&source.segments.length&&source.segments.every(s=>{const ok=Number.isFinite(s.startSeconds)&&Number.isFinite(s.endSeconds)&&Math.abs(s.startSeconds-cursor)<.05&&s.endSeconds>s.startSeconds&&s.audible===true;cursor=s.endSeconds;return ok;})&&Math.abs(cursor-duration)<.05;if(!valid){pending=true;pass=false;feedback='新录音的听音来源或覆盖证据不足，本题保持待评。';}}
      if(!feedback)feedback=rounds.map(r=>r.summary||'').filter(Boolean).join('\n');
    }
    if(q.minWords&&words(supplied.answer)<q.minWords){pass=false;feedback='本任务至少需要 '+q.minWords+' 个英文词。'+feedback;}
    return{status:pass?'passed':pending?'pending':'wrong',feedback:(feedback||(pass?'两轮 AI 训练目标核对通过。':'仍需按反馈修改后重新提交。'))+(ali?'\n本次阿里评测只核对这份原稿范围内的发音、流利度和完整度训练线，不代表完整自由口语 Band。':''),evidence:reviewEvidence(result)};
  }
  function foundationPronunciation(item,supplied,review,record){
    const source=review.pronunciationSource,originalIds=new Set((item.occurrences[0].media||[]).map(m=>m.id));
    const provenance=source?.provider==='ali'&&source.completeCoverage===true&&record?.id&&record.id!==item.recordId&&source.recordId===record.id&&typeof source.evidenceId==='string'&&source.evidenceId.trim()&&Number.isFinite(source.durationSeconds)&&source.durationSeconds>0&&source.durationSeconds<=180&&normalize(source.reference)===normalize(supplied.answer)&&supplied.media.length&&supplied.media.every(m=>!originalIds.has(m.id))&&Array.isArray(source.mediaIds)&&source.mediaIds.length===supplied.media.length&&source.mediaIds.every((id,i)=>id===supplied.media[i].id);
    if(!provenance)return{pending:true,pass:false,feedback:'本次基础口语的阿里评测缺少匹配新原稿、新录音或完整范围证据，本题保持待评。'};
    const scores=source.result,thresholds={accuracy:80,fluency:75,completeness:90};if(!scores||Object.keys(thresholds).some(k=>!Number.isFinite(scores[k])||scores[k]<0||scores[k]>100))return{pending:true,pass:false,feedback:'阿里评测缺少准确度、流利度或完整度，本题保持待评。'};
    const pass=Object.keys(thresholds).every(k=>scores[k]>=thresholds[k]);return{pending:false,pass,feedback:pass?'':'本次新原音仍未达到准确度 80、流利度 75、完整度 90 的基础训练线，请按反馈重录。'};
  }
  function submissionWithRecord(item,value,result){
    const supplied=submission(value),record=result?.record;if(!record)return supplied;
    const artifact=decoded(record.answer),raw=artifact?(item.skill==='speaking'?artifact.transcript:artifact.text):record.answer;
    if(normalize(raw)!==normalize(supplied.answer))return supplied;
    if(item.skill==='speaking'&&!supplied.media.length&&Array.isArray(record.media)){
      const originalIds=new Set((item.occurrences[0].media||[]).map(m=>m.id)),fresh=media(record.media);
      if(fresh.length&&fresh.every(m=>!originalIds.has(m.id)))supplied.media=fresh;
    }
    return supplied;
  }
  function fullReviewCheck(record,material,review){
    const acoustic=material.skill==='speaking',required=acoustic?['fluency','lexical','grammar','pronunciation']:['task','coherence','lexical','grammar'],rounds=review.rounds.filter(r=>r.ok===true),artifact=decoded(record.answer),original=normalize(artifact?.text||artifact?.transcript||''),reasons=[];
    function audioGrounded(criterion,dimension){
      const source=review.audioSource,duration=source?.durationSeconds,ids=(record.media||[]).map(m=>m.id);if(review.audioAnalysisEvidence!==true||!source||source.recordId!==record.id||source.completeCoverage!==true||!ids.length||!Array.isArray(source.mediaIds)||source.mediaIds.length!==ids.length||!source.mediaIds.every((id,i)=>id===ids[i])||!Number.isFinite(duration)||duration<=0||duration>900||!Array.isArray(source.segments)||!source.segments.length)return false;
      let cursor=0;for(const segment of source.segments){if(!Number.isFinite(segment.startSeconds)||!Number.isFinite(segment.endSeconds)||Math.abs(segment.startSeconds-cursor)>.03||segment.endSeconds<=segment.startSeconds||segment.endSeconds>duration+.03||segment.audible!==true||!Array.isArray(segment.fluencyIds)||!segment.fluencyIds.length||!Array.isArray(segment.pronunciationIds)||!segment.pronunciationIds.length)return false;cursor=segment.endSeconds;}if(Math.abs(cursor-duration)>.05)return false;
      return Array.isArray(criterion?.audioEvidence)&&criterion.audioEvidence.some(e=>e.dimension===dimension&&typeof e.id==='string'&&typeof e.quote==='string'&&e.quote.trim()&&Number.isFinite(e.startSeconds)&&Number.isFinite(e.endSeconds)&&e.startSeconds>=0&&e.endSeconds>e.startSeconds&&e.endSeconds<=duration+.01&&source.segments.some(s=>e.startSeconds>=s.startSeconds-.01&&e.endSeconds<=s.endSeconds+.01&&s[dimension+'Ids'].includes(e.id)));
    }
    const criteria=required.map(id=>{const values=rounds.map(r=>r.criteria?.find(c=>c.id===id)),bands=values.map(v=>v?.band),complete=values.length>=2&&bands.every(v=>Number.isFinite(v)&&v>=0&&v<=9&&Number.isInteger(v*2)),grounded=values.every(c=>acoustic&&['fluency','pronunciation'].includes(id)?audioGrounded(c,id):c?.evidence?.some(e=>typeof e.quote==='string'&&normalize(e.quote)&&original.includes(normalize(e.quote)))),pass=complete&&grounded&&bands.every(v=>v>=7)&&Math.max(...bands)-Math.min(...bands)<=.5;if(!pass)reasons.push(id+' 尚无两轮达到训练线且可核对的原稿证据');return{id,complete,grounded,pass};});
    if(review.requiresRetest)reasons.push('AI 评阅标记需要复测');if(acoustic&&(material.fullTest||material.pool==='final')&&(review.audioSource?.task!=='full_test'||review.audioSource?.durationSeconds<660))reasons.push('完整口语训练缺少整套不少于 11 分钟的原音证据');return{pass:!reasons.length&&criteria.every(c=>c.pass),criteria,reasons};
  }
  function saveDraft(state,day,itemId,value){state=parseState(state);dayNumber(day);const item=state.items.find(i=>i.id===itemId&&i.dayNumber===day);if(!item||item.status==='passed')throw Error('这道题已通过或不在本日错题中。');stateDay(state,day).drafts[itemId]=submission(value);return state;}
  function submitRound(state,day,answers,options={}){
    state=parseState(state);dayNumber(day);plain(answers,'整页答案');const daily=stateDay(state,day),roundId=id(options.id||makeId('round'),'订正轮次ID'),duplicate=daily.rounds.find(r=>r.id===roundId);if(duplicate){if(stable(Object.fromEntries(duplicate.results.map(r=>[r.itemId,{answer:r.answer,media:r.media}])) )!==stable(Object.fromEntries(Object.entries(answers).map(([k,v])=>[k,submission(v)]))))throw Error('同一轮次ID包含不同答案，已保留原订正。');return{state,round:copy(duplicate),summary:summary(state,day),duplicate:true};}
    const before=summary(state,day);if(options.token!==undefined&&options.token!==before.token)throw Error('本日错题已改变，请保留输入并刷新整页后提交。');if(!before.remaining)throw Error('本日错题已经全部通过，无需重复计数。');if(Object.keys(answers).length!==before.remaining||before.remainingItems.some(i=>!own(answers,i.id)))throw Error('请完成本页每一道错题后整页提交。');if(daily.rounds.length>=MAX_ROUNDS)throw Error('本日订正轮次已达到上限，请先导出备份。');
    const results=before.remainingItems.map(item=>{const proof=options.subjective?.[item.id],supplied=submissionWithRecord(item,answers[item.id],proof);if(!answered(supplied.answer))throw Error('请完成本页每一道错题后整页提交。');let grade=item.question.type==='oral'?oralGrade(item,proof):item.question.type==='subjective'?subjectiveGrade(item,supplied,proof):gradeObjective(item.question,supplied.answer);return cleanResult({itemId:item.id,...supplied,...grade});});
    const round={id:roundId,number:daily.rounds.length+1,at:options.now||new Date().toISOString(),token:before.token,results};daily.rounds.push(round);daily.completion=null;for(const result of results){const item=state.items.find(i=>i.id===result.itemId);item.status=result.status;item.lastRoundId=roundId;if(result.status==='pending')daily.drafts[item.id]={answer:copy(result.answer),media:copy(result.media)};else delete daily.drafts[item.id];}state=parseState(state);return{state,round:copy(round),summary:summary(state,day),duplicate:false};
  }
  function completeRecap(state,day,value,now=new Date().toISOString()){
    state=parseState(state);fields(value,['token','recap'],'AI每日复盘');const current=summary(state,day);if(!current.allCorrect)throw Error('本日仍有错题或待评，全部通过后才能完成 AI 复盘。');if(!current.total&&!Object.keys(state.days[day]?.recordVersions||{}).length)throw Error('本日还没有真实已提交作品，请先完成学习任务。');if(value.token!==current.token)throw Error('本日学习表现已更新，请重新生成 AI 复盘。');const recap=safeJSON(value.recap);if(!recapContent(recap))throw Error('AI 复盘尚未有效完成。');stateDay(state,day).completion={at:now,token:current.token,recap};return parseState(state);
  }
  function mergeStates(left,right){
    const a=parseState(left),b=parseState(right),out=copy(a);
    for(const item of b.items){
      const old=out.items.find(i=>i.id===item.id);if(!old){out.items.push(item);continue;}
      const base=x=>{const v={...x};for(const key of ['status','lastRoundId','occurrences','oralEvidence'])delete v[key];return v;};
      if(stable(base(old))!==stable(base(item)))throw Error('同一错题存在冲突，合并停止且原记录保留。');
      for(const occurrence of item.occurrences){const existing=old.occurrences.find(o=>o.id===occurrence.id);if(existing&&stable(existing)!==stable(occurrence))throw Error('同一原始错误尝试存在冲突。');if(!existing)old.occurrences.push(occurrence);}
      if(old.oralEvidence&&item.oralEvidence&&stable(old.oralEvidence)!==stable(item.oralEvidence))throw Error('同一朗读订正有不同专业评测，请分别保留备份。');if(item.oralEvidence)old.oralEvidence=copy(item.oralEvidence);
    }
    for(const [d,day]of Object.entries(b.days)){
      const dest=stateDay(out,d),overlap=Math.min(dest.rounds.length,day.rounds.length);for(let n=0;n<overlap;n++)if(stable(dest.rounds[n])!==stable(day.rounds[n]))throw Error('同日订正轮次分叉，请分别保留备份，合并已停止。');
      if(day.rounds.length>dest.rounds.length)dest.rounds=copy(day.rounds);
      for(const [k,v]of Object.entries(day.drafts)){if(dest.drafts[k]&&stable(dest.drafts[k])!==stable(v))throw Error('同一错题草稿存在冲突。');dest.drafts[k]=copy(v);}
      for(const [k,v]of Object.entries(day.recordVersions)){const prior=dest.recordVersions[k];if(prior&&prior.version===v.version&&prior.signature!==v.signature)throw Error('同一原作快照存在冲突。');if(!prior||v.version>prior.version)dest.recordVersions[k]=copy(v);}dest.completion=null;
    }
    for(const item of out.items){
      const candidates=[a,b].map(s=>s.items.find(i=>i.id===item.id)).filter(Boolean),rounds=out.days[item.dayNumber]?.rounds||[],resolved=candidates.filter(i=>i.lastRoundId).sort((x,y)=>rounds.findIndex(r=>r.id===y.lastRoundId)-rounds.findIndex(r=>r.id===x.lastRoundId))[0];
      const reopened=candidates.some(i=>!i.lastRoundId&&(!resolved||i.occurrences.some(o=>!resolved.occurrences.some(prior=>prior.id===o.id))));
      if(resolved&&!reopened){item.status=resolved.status;item.lastRoundId=resolved.lastRoundId;}else{item.status=candidates.some(i=>!i.lastRoundId&&i.status==='pending')?'pending':'wrong';item.lastRoundId=null;}
      if(item.status==='passed'&&out.days[item.dayNumber])delete out.days[item.dayNumber].drafts[item.id];
    }
    for(const [d,day]of Object.entries(out.days)){const token=tokenFor(out,Number(d));const valid=[a.days[d]?.completion,b.days[d]?.completion].filter(c=>c?.token===token).sort((x,y)=>y.at.localeCompare(x.at));day.completion=valid[0]||null;}return parseState(out);
  }
  function decoded(v){try{return JSON.parse(v);}catch(_){return null;}}
  function explicitRecordError(record,artifact=decoded(record?.answer)){
    const evaluationValue=record?.evaluation||{},review=decoded(evaluationValue.feedback)||artifact?.review,original=normalize(artifact?(record.skill==='speaking'?artifact.transcript:artifact.text)||record.answer:record?.answer),grounded=quote=>typeof quote==='string'&&normalize(quote)&&original.includes(normalize(quote));
    if(evaluationValue.result==='revise')return true;
    if(evaluationValue.method==='objective'&&Number.isFinite(evaluationValue.score)&&Number.isFinite(evaluationValue.maxScore)&&evaluationValue.maxScore>0&&evaluationValue.score<evaluationValue.maxScore)return true;
    return Array.isArray(review?.rounds)&&review.rounds.some(round=>round?.ok===true&&(round.levelCheck?.meetsGoal===false&&round.levelCheck.evidence?.some(e=>grounded(e.quote))||Array.isArray(round.corrections)&&round.corrections.some(c=>c&&grounded(c.original)&&typeof c.revised==='string'&&c.revised.trim()&&typeof c.reason==='string'&&c.reason.trim()&&normalize(c.original)!==normalize(c.revised))));
  }
  function captureInputs(record,options={}){
    if(!record||!Number.isInteger(record.dayNumber)||record.dayNumber<1||record.dayNumber>365||record.source==='mistake-review'||record.skill==='reflection')return[];
    const material=(options.materials||root.IELTSCurriculumData?.materials||[]).find(m=>m.id===record.materialId),artifact=decoded(record.answer),evaluationValue=record.evaluation||{},subjective=['writing','speaking'].includes(record.skill),questions=options.question?[options.question]:(material?.questions&&['reading','listening','grammar'].includes(record.skill)?material.questions:artifact?.questions||[]),out=[];
    if(artifact?.kind==='vocabulary-three-modes'&&Array.isArray(artifact.rounds))return[...artifact.rounds.flatMap(round=>Array.isArray(round.attempts)?round.attempts:[]).filter(attempt=>attempt.correct===false&&answered(attempt.userAnswer)).map(attempt=>vocabularyInput({...((artifact.words||[]).find(word=>word.word===attempt.word)||{}),...attempt,dayNumber:record.dayNumber,materialId:attempt.materialId||record.materialId})),...vocabularyTrainingInputs(record,artifact)];
    const base={dayNumber:record.dayNumber,source:record.source,materialId:record.materialId,recordId:record.id,recordVersion:record.version||1,skill:record.skill,title:record.title,evaluation:evaluationValue,media:record.media||[],at:record.submittedAt||record.createdAt},hasError=explicitRecordError(record,artifact);
    for(const original of questions){let q={...original},supplied=options.question?record.answer:artifact?.answers?.[q.id]??'';delete q.answer;if(q.type==='fill')q.type='short';if(Array.isArray(q.answers)&&q.answers.some(x=>typeof x==='number')){q.answers=q.answers.map(i=>q.options[i]);if(typeof supplied==='number')supplied=q.options[supplied]||'';else if(Array.isArray(supplied))supplied=supplied.map(i=>typeof i==='number'?q.options[i]:i);}if(!q.type)q.type=Array.isArray(q.options)&&q.options.length?'single':'short';if(['subjective','oral'].includes(q.type)&&!hasError)continue;if(!['subjective','oral'].includes(q.type)&&(!q.answers?.length||!answered(supplied)))continue;q=question(q);if(gradeObjective(q,supplied).status!=='passed')out.push({...base,questionId:q.id,question:q,originalAnswer:answer(supplied)});}
    if(questions.length)return out;
    if(hasError){
      const q=question({id:'output',type:'subjective',prompt:material?.prompt||material?.instructions||record.title,answers:[],task:material?.rubric?.taskType||material?.rubric?.task||'foundation',level:(String(material?.level||'A0').match(/A[012]|B[12]|C[12]/g)||['A0']).at(-1),minWords:material?.minWords||0,fullTest:material?.fullTest===true||material?.pool==='final',...(material?{material:{id:material.id,skill:material.skill,fullTest:material.fullTest===true,pool:material.pool||'',minWords:material.minWords||0,rubric:material.rubric||{}}}:{})});
      // Once a real error was captured, a later review never erases the original error or its required redo.
      const raw=artifact?(record.skill==='speaking'?artifact.transcript:artifact.text)||record.answer:record.answer;out.push({...base,questionId:'output',question:q,originalAnswer:raw,status:'wrong'});
    }
    return out;
  }
  function vocabularyInput(event){
    const day=event.dayNumber??event.courseDay,rid=event.attemptId||event.id,word=text(event.word,200,'练习单词',false),expected=text(event.expectedAnswer||word,50000,'单词标准答案',false),mode=event.mode||'meaning';
    return{dayNumber:day,source:event.source||'vocabulary-practice',materialId:event.materialId,recordId:rid,recordVersion:1,skill:'vocabulary',questionId:'word-'+hash([word,mode]),title:'词汇练习：'+word,question:{id:'word-'+hash([word,mode]),type:'spelling',prompt:event.prompt||event.meaning||word,answers:[expected],explanation:event.meaning||'',evidence:event.example||''},originalAnswer:event.userAnswer||'',evaluation:{method:'objective',result:'revise',feedback:'词汇原始拼写须全部正确。'},at:event.submittedAt||new Date().toISOString()};
  }
  function vocabularyTrainingInputs(record,artifact){
    if(!Array.isArray(artifact.learning))return[];const inputs=[];
    artifact.learning.forEach((word,index)=>{if(typeof word?.word!=='string'||!Array.isArray(word.speaking))return;word.speaking.forEach((attempt,trial)=>{
      if(attempt?.passed!==false)return;const rid=attempt.workId||record.id+':speaking-'+index+'-'+trial,qid='oral-'+hash('vocab-word-'+index+'-trial-'+(trial+1)),complete=['accuracy','fluency','completeness'].every(k=>Number.isFinite(attempt.result?.[k]));
      inputs.push({dayNumber:record.dayNumber,source:'vocabulary-speaking',materialId:record.materialId,recordId:rid,recordVersion:1,skill:'speaking',questionId:qid,title:'词汇跟读订正：'+word.word,question:{id:qid,type:'oral',task:'vocabulary_follow_restore',prompt:'重新朗读：'+word.word,reference:word.word,thresholds:{accuracy:80,fluency:75,completeness:90},answers:[],explanation:complete?'原跟读的专业结果快照已保留，但本份文字备份不证明音频已在本机恢复。请恢复原音并重新独立录音，当前保持待评。':'原跟读标记未通过；本份备份缺少完整专业维度，保持待评，不据此猜测分数。'},originalAnswer:JSON.stringify(attempt),evaluation:{method:'ai',result:'pending',feedback:JSON.stringify(attempt)},status:'pending',at:attempt.recordedAt||record.submittedAt,media:[]});
    });});return inputs;
  }
  function oralInputs(items,context){
    const result=context.result||{},thresholds=context.thresholds||{accuracy:80,fluency:75,completeness:90};if(['accuracy','fluency','completeness'].some(k=>typeof result[k]!=='number'||!Number.isFinite(result[k])))return[];if(Object.keys(thresholds).every(k=>result[k]>=thresholds[k]))return[];
    const original=list(items||[],200,'朗读错项');if(!original.length)original.push({questionId:context.questionId||'segment-'+(context.segmentIndex||0),quote:context.reference});
    return original.map(entry=>{const qid='oral-'+hash(entry.questionId||[context.segmentIndex||0,entry.word||entry.quote||context.reference]);return{dayNumber:context.dayNumber??context.courseDay,source:context.source||'oral-practice',materialId:context.materialId,recordId:context.workId,recordVersion:1,skill:'speaking',questionId:qid,title:'朗读订正：'+String(entry.quote||entry.word||context.reference).slice(0,180),question:{id:qid,type:'oral',prompt:'重新朗读：'+(entry.quote||entry.word||context.reference),reference:context.reference,thresholds,answers:[],explanation:'准确度至少 '+thresholds.accuracy+'，流利度至少 '+thresholds.fluency+'，完整度至少 '+thresholds.completeness+'。',...(context.returnUrl?{returnUrl:context.returnUrl}:{})},originalAnswer:result.text||context.reference,evaluation:{method:'ai',result:'revise',feedback:JSON.stringify({provider:'ali',evidenceId:context.evidenceId||'',result})},media:context.media||[],at:context.submittedAt||new Date().toISOString()};});
  }
  function attachOralEvidence(state,context){
    state=parseState(state);const day=dayNumber(context.dayNumber??context.courseDay),proof=safeJSON({validationVersion:2,provider:context.provider||'ali',verified:context.verified===true,workId:context.workId,evidenceId:context.evidenceId,reference:context.reference,result:context.result});let changed=false;
    for(const item of state.items.filter(i=>i.dayNumber===day&&i.materialId===context.materialId&&i.question.type==='oral'&&oralReferenceMatches(i,context.reference))){if(item.occurrences.some(o=>o.recordId===proof.workId))continue;if(stable(item.oralEvidence)!==stable(proof)){item.oralEvidence=proof;changed=true;}}
    if(changed)stateDay(state,day).completion=null;return state;
  }
  function createStore(storage,options={}){
    const clock=options.now||(()=>new Date().toISOString()),notify=options.notify||(()=>{});if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw Error('错题存储不可用。');
    let cachedRaw,cachedState;
    function readParsed(){const raw=storage.getItem(KEY);if(cachedState&&raw===cachedRaw)return cachedState;const parsed=raw===null?newState():parseState(raw);cachedRaw=raw;cachedState=parsed;return parsed;}
    function read(){return copy(readParsed());}
    function mutate(fn){const raw=storage.getItem(KEY),state=raw===null?newState():parseState(raw),result=fn(state),next=parseState(result.state||result),encoded=JSON.stringify(next);if(storage.getItem(KEY)!==raw)throw Error('另一页面刚更新错题本，请保留答案后刷新。');if(raw!==encoded){storage.setItem(KEY,encoded);cachedState=null;notify();}return result.state?{...result,state:next}:next;}
    const api={
      read,summary:day=>summaryParsed(readParsed(),day),recordCorrectionStatus:record=>recordCorrectionStatusParsed(record,readParsed()),capture:input=>mutate(s=>capture(s,input,clock())),
      captureRecord(record,context={}){
        if(!record||!Number.isInteger(record.dayNumber)||record.dayNumber<1||record.dayNumber>365||record.source==='mistake-review'||record.skill==='reflection')return{captured:0};
        const previousState=readParsed(),snapshot={version:record.version||1,signature:hash({answer:record.answer,evaluation:record.evaluation,media:record.media||[]})},previous=previousState.days[record.dayNumber]?.recordVersions[record.id];
        if(previous&&previous.version>snapshot.version)return{captured:0};
        let inputs=captureInputs(record,context);
        const unjudged=!explicitRecordError(record)?previousState.items.filter(i=>i.dayNumber===record.dayNumber&&i.materialId===record.materialId&&i.question.type==='subjective'&&i.status==='wrong'&&!i.lastRoundId&&i.occurrences.some(o=>o.recordId===record.id)&&i.occurrences.every(o=>!explicitRecordError({skill:i.skill,answer:typeof o.answer==='string'?o.answer:JSON.stringify(o.answer),evaluation:o.evaluation}))):[];
        inputs=inputs.filter(input=>input.question.task!=='vocabulary_follow_restore'||!previousState.items.some(i=>i.source==='vocabulary-speaking'&&i.materialId===input.materialId&&i.occurrences.some(o=>o.recordId===input.recordId)));
        if(!context.question&&inputs.length===1&&inputs[0].questionId==='output'&&previousState.items.some(i=>i.occurrences.some(o=>o.recordId===record.id&&o.recordVersion===(record.version||1))))inputs=[];
        const hasNewInput=inputs.some(input=>{const key=[input.dayNumber,input.source,input.materialId,input.questionId||input.question.id].join('|'),captureId=input.id||'capture-'+hash([input.recordId,input.recordVersion||1,input.questionId||input.question.id]);return!previousState.items.some(item=>item.key===key&&item.occurrences.some(o=>o.id===captureId));});
        if(previous?.version===snapshot.version&&previous.signature===snapshot.signature&&!hasNewInput&&!unjudged.length)return{captured:0};
        return mutate(s=>{
          const daily=stateDay(s,record.dayNumber),prior=daily.recordVersions[record.id];
          if(!prior||prior.version<snapshot.version||prior.signature!==snapshot.signature){daily.recordVersions[record.id]=snapshot;daily.completion=null;}
          for(const old of unjudged){const item=s.items.find(i=>i.id===old.id);item.status='pending';daily.completion=null;}
          let count=0;for(const input of inputs){const result=capture(s,input,clock());s=result.state;if(!result.duplicate)count++;}return{state:s,captured:count};
        });
      },
      captureVocabulary:event=>event.correct===true||!answered(event.userAnswer)?{captured:0}:mutate(s=>capture(s,vocabularyInput(event),clock())),
      captureOral(items,context){const inputs=oralInputs(items,context);if(!inputs.length)return{captured:0};if(context.source==='vocabulary-speaking'&&readParsed().items.some(i=>i.materialId===context.materialId&&i.question.task==='vocabulary_follow_restore'&&i.occurrences.some(o=>o.recordId===context.workId)))return{captured:0};return mutate(s=>{let count=0;for(const input of inputs){const result=capture(s,input,clock());s=result.state;if(!result.duplicate)count++;}return{state:s,captured:count};});},
      attachOralEvidence:context=>mutate(s=>attachOralEvidence(s,context)),attachArchivedOralEvidence:(itemId,work)=>mutate(s=>attachArchivedOralEvidence(s,itemId,work)),saveDraft:(day,itemId,value)=>mutate(s=>saveDraft(s,day,itemId,value)),
      submitRound:(day,answers,value={})=>mutate(s=>submitRound(s,day,answers,{...value,now:clock()})),completeRecap:(day,value)=>mutate(s=>completeRecap(s,day,value,clock())),exportState:read,importState:value=>mutate(s=>mergeStates(s,value))
    };return Object.freeze(api);
  }
  let runtimeStore=null,profileId=null;
  function browserStore(){const profile=root.IELTSProfiles?.current?.().id||'legacy';if(profileId!==null&&profile!==profileId)throw Error('学习档案已切换，请刷新后继续错题订正。');if(!runtimeStore){profileId=profile;const preview=new URLSearchParams(root.location?.search||'').get('preview')==='1',storage=root.IELTSProfiles?.storage()||(preview?root.sessionStorage:root.localStorage);runtimeStore=createStore(storage,{notify:()=>root.dispatchEvent?.(new CustomEvent(EVENT,{detail:{profileId}}))});}return runtimeStore;}
  async function syncRecords(records,options={}){const listValue=records||await root.IELTSRecords?.list?.()||[];let count=0;for(const record of listValue){const r=browserStore().captureRecord(record,options);count+=r.captured||0;}return count;}
  if(root.addEventListener)root.addEventListener('storage',event=>{try{const scoped=root.IELTSProfiles?.scopeKey(KEY)||KEY;if(event.key===scoped)root.dispatchEvent?.(new CustomEvent(EVENT,{detail:{profileId,external:true}}));}catch(_){}});
  return Object.freeze({KEY,EVENT,newState,parseState,mergeStates,question,submission,gradeObjective,subjectiveGrade,oralGrade,oralReferenceVariants,oralArchiveCandidate,archivedOralEvidence,attachArchivedOralEvidence,explicitRecordError,recordCorrectionStatus:(record,state)=>state?recordCorrectionStatusParsed(record,parseState(state)):browserStore().recordCorrectionStatus(record),capture:(state,input,now)=>input===undefined?browserStore().capture(state):capture(state,input,now),captureInputs,vocabularyInput,oralInputs,attachOralEvidence,summary:(state,day)=>day===undefined?browserStore().summary(state):summary(state,day),saveDraft,submitRound,completeRecap,createStore,makeId,syncRecords,store:browserStore,captureRecord:(record,options)=>browserStore().captureRecord(record,options),captureAttempt:input=>browserStore().capture(input),captureVocabulary:event=>browserStore().captureVocabulary(event),captureOral:(items,context)=>browserStore().captureOral(items,context),recordOralEvidence:context=>browserStore().attachOralEvidence(context),forDay:day=>browserStore().summary(day),setDraft:(day,itemId,value)=>browserStore().saveDraft(day,itemId,value),submitPage:(day,answers,options)=>browserStore().submitRound(day,answers,options),finishRecap:(day,value)=>browserStore().completeRecap(day,value)});
});
