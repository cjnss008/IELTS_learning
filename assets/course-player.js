(function (root) {
  'use strict';
  const KEY = 'ielts52-course-player-v1';
  const SKILLS = ['vocabulary', 'grammar', 'listening', 'reading', 'speaking', 'writing', 'reflection'];
  const NAMES = {vocabulary:'词汇', grammar:'语法', listening:'听力', reading:'阅读', speaking:'口语', writing:'写作', reflection:'复盘'};
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  function newState() { return {schema:1, day:1, exposures:{}, drafts:{}, queue:{}}; }
  function parseState(input) {
    if (typeof input === 'string') { if (input.length > 8 * 1024 * 1024) throw Error('课程草稿超过 8 MB。'); input = JSON.parse(input); }
    if (!input || input.schema !== 1 || Object.keys(input).some(k=>!['schema','day','exposures','drafts','queue'].includes(k)) || !Number.isInteger(input.day) || input.day < 1 || input.day > 365) throw Error('课程记录格式无效。');
    const out = newState(); out.day = input.day;
    for (const section of ['exposures','drafts','queue']) {
      if (!input[section] || Array.isArray(input[section]) || typeof input[section] !== 'object' || Object.keys(input[section]).length > (section === 'exposures' ? 5000 : 200)) throw Error('课程记录集合无效。');
      for (const [id, item] of Object.entries(input[section])) {
        if (!validId(id) || !item || typeof item !== 'object' || Array.isArray(item)) throw Error('课程记录 ID 无效。');
        if (section === 'exposures') {
          if (Object.keys(item).some(k=>!['firstSeenAt','lastSeenAt','count','assisted'].includes(k)) || !Number.isFinite(Date.parse(item.firstSeenAt)) || !Number.isFinite(Date.parse(item.lastSeenAt)) || item.lastSeenAt < item.firstSeenAt || !Number.isInteger(item.count) || item.count < 1 || item.count > 100000 || typeof item.assisted !== 'boolean') throw Error('材料曝光记录无效。');
          out.exposures[id] = {firstSeenAt:item.firstSeenAt, lastSeenAt:item.lastSeenAt, count:item.count, assisted:item.assisted};
        } else if (section === 'queue') {
          if (Object.keys(item).some(k=>!['recordId','at'].includes(k)) || !validId(item.recordId) || !Number.isFinite(Date.parse(item.at))) throw Error('待评队列无效。');
          out.queue[id] = {recordId:item.recordId, at:item.at};
        } else {
          if (item.id !== id || !validId(item.materialId) || !SKILLS.includes(item.taskId) || !['practice','assessment'].includes(item.mode) || !['original','correction','retest'].includes(item.kind) || !Number.isInteger(item.courseDay) || item.courseDay < 1 || item.courseDay > 365 || !Number.isFinite(Date.parse(item.startedAt)) || !Number.isFinite(item.activeSeconds) || item.activeSeconds < 0 || item.activeSeconds > 86400 || typeof item.text !== 'string' || item.text.length > 15000 || typeof item.transcript !== 'string' || item.transcript.length > 15000 || JSON.stringify(item).length > 70000) throw Error('课程草稿无效。');
          if (!item.answers || typeof item.answers !== 'object' || Array.isArray(item.answers) || !item.userEvidence || typeof item.userEvidence !== 'object' || Array.isArray(item.userEvidence)) throw Error('草稿答案无效。');
          for (const [qid, answer] of Object.entries(item.answers)) if (!validId(qid) || !(typeof answer === 'string' && answer.length <= 2000 || Array.isArray(answer) && answer.length <= 50 && answer.every(v => typeof v === 'string' && v.length <= 1000))) throw Error('草稿题目答案无效。');
          for (const [qid, evidence] of Object.entries(item.userEvidence)) if (!validId(qid) || typeof evidence !== 'string' || evidence.length > 2000) throw Error('草稿依据无效。');
          if (Object.keys(item).some(k=>!['id','materialId','taskId','courseDay','mode','kind','parentId','startedAt','submittedAt','activeSeconds','exposureAtStart','answers','userEvidence','text','transcript','audioAvailable','audioCompleted','transcriptViewed','interrupted','assistance','media','modelReading','activityByDate'].includes(k))) throw Error('草稿含有未知字段。');
          if (!['unseen','seen'].includes(item.exposureAtStart) || ['audioAvailable','audioCompleted','transcriptViewed','interrupted'].some(k=>typeof item[k]!=='boolean') || !item.assistance || Object.keys(item.assistance).length!==3 || ['hint','answer','ai'].some(k => typeof item.assistance[k] !== 'boolean') || !Array.isArray(item.media) || item.media.length > 8 || item.parentId && !validId(item.parentId) || item.kind!=='original'&&!item.parentId || item.kind==='original'&&item.parentId) throw Error('草稿辅助或录音记录无效。');
          if(item.modelReading!==undefined)cleanModelReading(item.modelReading);
          if(item.activityByDate!==undefined){if(!item.activityByDate||typeof item.activityByDate!=='object'||Array.isArray(item.activityByDate)||Object.keys(item.activityByDate).length>366||Object.entries(item.activityByDate).some(([date,n])=>!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||!Number.isFinite(n)||n<0||n>86400)||Object.values(item.activityByDate).reduce((n,v)=>n+v,0)>item.activeSeconds+.01)throw Error('草稿每日活动时间无效。');}
          for(const media of item.media)if(!media||Object.keys(media).some(k=>!['id','name','mime','durationSeconds'].includes(k))||!validId(media.id)||typeof media.name!=='string'||media.name.length>200||typeof media.mime!=='string'||media.mime.length>100||!Number.isFinite(media.durationSeconds)||media.durationSeconds<0||media.durationSeconds>900)throw Error('草稿录音引用无效。');
          out.drafts[id] = copy(item);
        }
      }
    }
    return out;
  }
  function mergeState(left,right) {
    const a=parseState(left),b=parseState(right),out=copy(a);
    for(const [id,e] of Object.entries(b.exposures)){const old=out.exposures[id];out.exposures[id]=old?{firstSeenAt:old.firstSeenAt<e.firstSeenAt?old.firstSeenAt:e.firstSeenAt,lastSeenAt:old.lastSeenAt>e.lastSeenAt?old.lastSeenAt:e.lastSeenAt,count:Math.max(old.count,e.count),assisted:old.assisted||e.assisted}:e;}
    for(const [id,draft] of Object.entries(b.drafts)){if(out.drafts[id]&&JSON.stringify(out.drafts[id])!==JSON.stringify(draft))throw Error('同一课程草稿存在不同版本，合并已停止。');out.drafts[id]=draft;}
    for(const [id,queued] of Object.entries(b.queue))if(!out.queue[id]||out.queue[id].at<queued.at)out.queue[id]=queued;
    return parseState(out);
  }
  function taskFor(data, day, taskId) { return data.days.find(item => item.day === day)?.tasks.find(item => item.id === taskId); }
  function prerequisiteStatus(materials,records,week,assessment) {
    return assessment.gateMastery(records,materials).filter(g=>g.week<week).map(g=>({id:g.id,pass:g.pass,status:g.status,dueAt:g.dueAt,reason:g.reasons.join('；')}));
  }
  function protectedMaterialAccess(material,records,materials,options={}){
    const seen=Boolean(options.exposures?.[material?.id])||(records||[]).some(record=>record.materialId===material?.id);if(seen)return{allowed:true,seen:true};
    const api=options.assessment||root.IELTSAssessment||(typeof require==='function'?require('./assessment-core.js'):null),now=options.now??Date.now(),gates=api?.gateMastery(records||[],materials||[],{now})||[];
    if(material?.pool==='gate'&&material.form==='B'){const gate=gates.find(g=>g.id===material.assessmentGroup);if(!gate?.a?.pass||!gate.dueAt||now<Date.parse(gate.dueAt))return{allowed:false,seen:false,dueAt:gate?.dueAt||null,reason:'B卷继续保留为未见复测：请先完成合格的整套A卷，并在整套提交后至少间隔48小时再开始；这次没有登记曝光。'};}
    if(material?.pool==='gate'||material?.pool==='final'){const missing=gates.filter(g=>g.week<material.week&&!g.pass);if(missing.length)return{allowed:false,seen:false,reason:'这份关卡或末期保留卷尚未解锁：先补齐前置关卡 '+missing.map(g=>g.id).join('、')+'。本次仅保留简介，没有打开正文或登记曝光。'};}
    return{allowed:true,seen:false};
  }
  function figureRows(figure) {
    if (Array.isArray(figure?.rows)) return figure.rows.map(row => Array.isArray(row) ? row.map(String) : [String(row)]);
    const labels = figure?.labels || [], series = figure?.series || [];
    return [['项目', ...series.map(item => item.name)], ...labels.map((label, index) => [label, ...series.map(item => String(item.values?.[index] ?? ''))])];
  }
  function figurePanels(figure) {
    if(!figure)return[];
    if(figure.type==='mixed'){
      if(Array.isArray(figure.parts)&&figure.parts.length)return figure.parts;
      const panels=[];
      if(figure.labels?.length&&figure.series?.length)panels.push({type:['line','bar','pie'].includes(figure.chartType)?figure.chartType:'bar',title:(figure.title||'混合图')+' · 数据图',labels:figure.labels,series:figure.series});
      if(figure.rows?.length)panels.push({type:'table',title:(figure.title||'混合图')+' · 配套表格',rows:figure.rows});
      return panels;
    }
    if(figure.type==='pie'&&figure.series?.length>1)return figure.series.map(series=>({type:'pie',title:(figure.title||'饼图')+' · '+series.name,labels:figure.labels,series:[series]}));
    return[];
  }
  function planGeometry(figure) {
    const p=figure?.plan;
    if(figure?.type!=='plan'||!p||!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<200||p.width>2000||p.height<200||p.height>2000)throw Error('平面图尺寸无效。');
    const point=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=p.width&&v.y>=0&&v.y<=p.height;
    const label=v=>typeof v==='string'&&v.length>0&&v.length<=160;
    if(!point(p.north)||p.north.y+45>p.height||!point(p.entrance)||!label(p.entrance.label)||!Array.isArray(p.paths)||!p.paths.length||p.paths.length>50||!Array.isArray(p.zones)||p.zones.length!==6||!Array.isArray(p.landmarks)||p.landmarks.length>30)throw Error('平面图缺少方位、入口或字母区。');
    for(const path of p.paths)if(!Array.isArray(path.points)||path.points.length<2||path.points.length>50||!path.points.every(point)||path.label!==undefined&&!label(path.label))throw Error('平面图通道坐标无效。');
    const seen=new Set();for(const z of p.zones){if(!point(z)||!Number.isFinite(z.w)||!Number.isFinite(z.h)||z.w<=0||z.h<=0||z.x+z.w>p.width||z.y+z.h>p.height||!['A','B','C','D','E','F'].includes(z.label)||seen.has(z.label)||!label(z.position))throw Error('平面图字母区无效。');seen.add(z.label);}
    for(const landmark of p.landmarks)if(!point(landmark)||!label(landmark.label))throw Error('平面图地标无效。');
    return p;
  }
  function reviewRequest(material, artifact) {
    const mode = material.skill === 'speaking' ? 'speaking_text' : 'writing';
    const task = material.rubric?.taskType || material.rubric?.task || (mode === 'speaking_text' ? material.fullTest?'full_test':material.week<=8?'foundation':'part2' : /task.?1/i.test(material.type) ? 'academic_task1' : /task.?2/i.test(material.type) ? 'academic_task2' : material.week <= 8 ? 'foundation' : 'generic');
    const prompt=[material.title,material.prompt||material.instructions,material.figure?JSON.stringify(material.figure):''].filter(Boolean).join('\n'),text=mode==='writing'?artifact.text:artifact.transcript;
    if(typeof text!=='string'||!text.trim()||text.length>10000)throw Error('AI 复核需要不超过 10000 字符的已提交原稿或确认转写；原文会完整保留，请另建订正版本。');
    if(!prompt.trim()||prompt.length>3000)throw Error('本题完整题目超过当前评阅接口 3000 字符上限；不会截断题目或原稿，请反馈材料编号。');
    const levels=String(material.level||'A0').match(/A[012]|B[12]|C[12]/g);if(!levels?.length)throw Error('本材料的学习阶段未映射到有效 CEFR 等级，请反馈材料编号。');
    return {mode,text:text.trim(),prompt:prompt.trim(),task,level:levels.at(-1)};
  }
  function checkAbort(signal){if(signal?.aborted){const error=new Error('请求已取消，原稿与录音保留。');error.name='AbortError';throw error;}}
  async function prepareAudio(record,options={}) {
    const library=options.library||root.IELTSMediaLibrary,Context=options.AudioContext||root.AudioContext||root.webkitAudioContext,Offline=options.OfflineAudioContext||root.OfflineAudioContext||root.webkitOfflineAudioContext,encode=options.encodeWav||root.IELTSSpeakingAudio?.encodeWav;
    if(!library||!Context||!Offline||!encode)throw Error('当前浏览器无法转换原始录音，请从本地服务用近期 Chrome 或 Edge 打开。');
    if(!record.media?.length||record.media.length>8)throw Error('这份原稿没有完整的原始录音引用。请另建带录音的订正版本。');
    const context=new Context(),decoded=[],mediaIds=[];let seconds=0;
    try{for(const reference of record.media){checkAbort(options.signal);const entry=await library.get(reference.id);checkAbort(options.signal);if(entry&&(entry.mode==='daily_reading'||entry.mode==='vocabulary_follow'||['oral_reading','vocabulary_follow'].includes(entry.task)))throw Error('例文朗读与词汇跟读原音不能替代这份自由表达录音。');if(!entry?.blob||entry.kind!=='audio')throw Error('缺少原始录音 '+reference.name+'；不会仅发送剩余片段冒充完整口语。');const buffer=await context.decodeAudioData(await entry.blob.arrayBuffer());checkAbort(options.signal);if(!Number.isFinite(buffer.duration)||buffer.duration<.1||buffer.duration>900)throw Error('原始录音时长无效。');decoded.push({buffer,offset:seconds});mediaIds.push(reference.id);seconds+=buffer.duration;if(seconds>900.01)throw Error('同一份口语作品合计超过 15 分钟，请按真实任务另存分段作品。');}}finally{await context.close();}
    const offline=new Offline(1,Math.floor(seconds*16000),16000);for(const item of decoded){const source=offline.createBufferSource();source.buffer=item.buffer;source.connect(offline.destination);source.start(item.offset);}const rendered=await offline.startRendering();checkAbort(options.signal);const bytes=encode(rendered.getChannelData(0));
    return{audio:library.base64(bytes),durationSeconds:rendered.length/16000,mediaIds,mediaRanges:decoded.map((item,i)=>({id:mediaIds[i],startSeconds:item.offset,endSeconds:item.offset+item.buffer.duration}))};
  }
  function audioSource(proof,record) {
    if(!proof||!Number.isFinite(proof.durationSeconds)||proof.durationSeconds<=0||proof.durationSeconds>900||!Array.isArray(proof.segments)||proof.segments.length<1||proof.segments.length>5||typeof proof.evidenceId!=='string')throw Error('听音服务未返回完整可保存的来源记录。');
    let cursor=0;const segments=proof.segments.map(s=>{if(!Number.isFinite(s.startSeconds)||!Number.isFinite(s.endSeconds)||Math.abs(s.startSeconds-cursor)>.03||s.endSeconds<=s.startSeconds||s.endSeconds>proof.durationSeconds+.03)throw Error('听音片段范围不完整；不会标为完整音频证据。');cursor=s.endSeconds;return{startSeconds:s.startSeconds,endSeconds:s.endSeconds,audible:s.audible===true,fluencyIds:(s.fluency?.evidence||[]).map(e=>e.id),pronunciationIds:(s.pronunciation?.evidence||[]).map(e=>e.id)};});
    return{recordId:record.id,evidenceId:proof.evidenceId,mediaIds:record.media.map(m=>m.id),durationSeconds:proof.durationSeconds,completeCoverage:Math.abs(cursor-proof.durationSeconds)<=.05,segments};
  }
  async function runReviewPipeline(options) {
    const {request,record,signal}=options,fetcher=options.fetch||root.fetch.bind(root);
    async function json(path,body){checkAbort(signal);const response=await fetcher(path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal,credentials:'same-origin',redirect:'error',cache:'no-store'});let result;try{result=await response.json();}catch(_){throw Error('本地服务返回的评阅数据无法读取。');}checkAbort(signal);if(!response.ok||result.ok===false){const error=new Error(typeof result.error?.message==='string'?result.error.message.slice(0,500):'本地评阅服务暂不可用。');error.code=result.error?.code;throw error;}return result;}
    let proof=null,payload={...request},source=null;
    if(options.audio&&request.task==='foundation'){
      const status=await json('/api/oral/status');if(!status.configured)throw Error('请先在 AI 与语音设置中连接阿里语音评测。');
      options.onProgress?.('正在核对本次自由回答的原音与转写；基础阶段用阿里专业诊断配合两轮表达反馈，不提供完整口语 Band。');
      const encoded=await options.prepare(record,signal);if(encoded.durationSeconds>180)throw Error('基础回答请控制在 3 分钟以内；更长自由口语请使用完整听音评阅。');
      proof=await json('/api/oral/assess',{audio:encoded.audio,reference:request.text,coreType:'en.pred.score'});
      const result=await json('/api/ai/review',{...request,mode:'speaking_audio',evidenceId:proof.evidenceId});
      const verified=result.pronunciationEvidence;
      if(!verified||verified.evidenceId!==proof.evidenceId||verified.reference!==request.text||!Number.isFinite(verified.durationSeconds)||verified.durationSeconds<=0||verified.durationSeconds>180||['accuracy','fluency','completeness'].some(k=>!Number.isFinite(verified.result?.[k])||verified.result[k]<0||verified.result[k]>100)||(verified.result.text&&verified.result.text!==request.text)||Math.abs(verified.durationSeconds-encoded.durationSeconds)>.1)throw Error('基础原音评阅的来源或完整时长不匹配；保持待评。');
      result.pronunciationSource={...verified,provider:'ali',recordId:record.id,mediaIds:record.media.map(m=>m.id),completeCoverage:true};
      result.audioAnalysisEvidence=false;
      return{result,proof,request:{...request,mode:'speaking_audio'}};
    }
    if(options.audio){const status=await json('/api/omni/status');if(status.configured!==true){const error=new Error('尚未配置 Omni 听音服务。请到 AI 设置的语音高级设置配置；当前发音和流利度保持待验证，也可先做文字复核。');error.code='OMNI_NOT_CONFIGURED';throw error;}options.onProgress?.('正在读取并转换这份原稿关联的全部原始录音…');const encoded=await options.prepare(record,signal);checkAbort(signal);options.onProgress?.('正在逐段发送完整原音给 '+(status.model||'Omni')+'。长录音加两轮复核可能需约 18 分钟，可随时取消。');proof=await json('/api/omni/evidence',{audio:encoded.audio,prompt:request.prompt,transcript:request.text,task:request.task,level:request.level});source=audioSource(proof,record);source.task=request.task;source.omniModel=status.model||'';source.mediaRanges=encoded.mediaRanges||[];if(Math.abs(source.durationSeconds-encoded.durationSeconds)>.1)throw Error('返回音频时长与本次发送的原音不匹配。');payload={...request,mode:'speaking_audio',evidenceId:proof.evidenceId};options.onProgress?.(proof.audioAnalysisEvidence===true?'已收到覆盖全部原音的时点观察，正在进行两轮四维 AI 训练评阅…':'听音证据尚不足，继续保留文字反馈；发音和流利度不出分。');}
    const result=await json('/api/ai/review',payload);if(!['complete','partial','pending'].includes(result.status)||!Array.isArray(result.rounds))throw Error('评阅返回结构不完整，原稿已保留。');
    if(options.audio){if(result.audioAnalysisEvidence===true&&result.audioEvidenceId!==proof.evidenceId)throw Error('音频评阅与本次声学证据 ID 不匹配。');result.audioAnalysisEvidence=result.audioAnalysisEvidence===true&&proof.audioAnalysisEvidence===true&&source.completeCoverage;result.audioSource=source;}else result.audioAnalysisEvidence=false;
    return{result,proof,request:payload};
  }
  function feedbackForRecord(result,archiveId) {
    const saved={...copy(result),...(archiveId?{fullReviewArchiveId:archiveId}:{})};
    if(JSON.stringify(saved).length<=24000)return JSON.stringify(saved);
    saved.rounds=saved.rounds.map(r=>!r.ok?r:{ok:true,round:r.round,summary:String(r.summary||'').slice(0,600),uncertainty:String(r.uncertainty||'').slice(0,400),criteria:(r.criteria||[]).map(c=>({id:c.id,label:c.label,band:c.band,evidence:(c.evidence||[]).slice(0,2).map(e=>({quote:e.quote,comment:String(e.comment||'').slice(0,160)})),audioEvidence:(c.audioEvidence||[]).slice(0,3).map(e=>({id:e.id,dimension:e.dimension,startSeconds:e.startSeconds,endSeconds:e.endSeconds,quote:e.quote,comment:String(e.comment||'').slice(0,160)})),comment:String(c.comment||'').slice(0,240),uncertainty:String(c.uncertainty||'').slice(0,200)})),levelCheck:r.levelCheck?{targetLevel:r.levelCheck.targetLevel,meetsGoal:r.levelCheck.meetsGoal,evidence:(r.levelCheck.evidence||[]).slice(0,2).map(e=>({quote:e.quote,comment:String(e.comment||'').slice(0,160)})),gaps:(r.levelCheck.gaps||[]).slice(0,3).map(g=>String(g).slice(0,160))}:null,corrections:[]});
    saved.feedbackAbbreviated=true;saved.disclaimer=String(saved.disclaimer||'').slice(0,1000)+' 本记录显示评阅摘要，完整两轮意见保存在关联作品归档。';const text=JSON.stringify(saved);if(text.length>24000)throw Error('评阅摘要仍超过作品记录上限；完整意见已归档，原稿未改写。');return text;
  }
  function foundationSpeaking(material) {
    return material?.skill==='speaking' && (material.rubric?.taskType || material.rubric?.task || (material.fullTest?'full_test':material.week<=8?'foundation':'part2'))==='foundation';
  }
  function localHTTP(location) {
    try { const url=new URL(location?.origin || location?.href || '');return url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname); } catch(_){return false;}
  }
  function modelReadingReference(material,data,dayNumber) {
    const map=new Map((data?.materials||[]).map(item=>[item.id,item])),base=map.get(String(material?.id||'').replace(/-speaking$/,''));
    if(base?.passage)return base.passage;
    const reading=data?.days?.find(item=>item.day===dayNumber)?.tasks?.find(item=>item.id==='reading');
    return reading?.materialIds?.map(id=>map.get(id)).find(item=>item?.pool==='training')?.passage || material?.reference || '';
  }
  function cleanModelReading(value) {
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['schema','required','materialId','dayNumber','segments'].includes(key))||value.schema!==1||typeof value.required!=='boolean'||!validId(value.materialId)||!Number.isInteger(value.dayNumber)||value.dayNumber<1||value.dayNumber>365||!Array.isArray(value.segments)||value.segments.length>100||JSON.stringify(value).length>50000)throw Error('例文朗读草稿结构无效。');
    const score=value=>value===null||typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
    return {schema:1,required:value.required,materialId:value.materialId,dayNumber:value.dayNumber,segments:value.segments.map((item,index)=>{
      if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['index','reference','workId','evidenceId','status','professional','coach'].includes(key))||item.index!==index||typeof item.reference!=='string'||!item.reference.trim()||item.reference.length>6000||typeof item.workId!=='string'||item.workId&&!/^work-[A-Za-z0-9-]{8,100}$/.test(item.workId)||typeof item.evidenceId!=='string'||item.evidenceId.length>120||!['pending','partial','complete'].includes(item.status))throw Error('例文分段记录无效。');
      let professional=null,coach=null;
      if(item.professional!==null&&item.professional!==undefined){const p=item.professional;if(typeof p!=='object'||Object.keys(p).some(key=>!['provider','accuracy','fluency','completeness'].includes(key))||p.provider!=='Alibaba oral assessment'||['accuracy','fluency','completeness'].some(key=>!score(p[key])))throw Error('例文专业结果无效。');professional={provider:p.provider,accuracy:p.accuracy,fluency:p.fluency,completeness:p.completeness};}
      if(item.coach!==null&&item.coach!==undefined){const c=item.coach;if(typeof c!=='object'||Object.keys(c).some(key=>!['feedbackFormat','evidenceId'].includes(key))||c.feedbackFormat!=='oral-coach-v1'||typeof c.evidenceId!=='string'||c.evidenceId.length>120)throw Error('例文AI反馈引用无效。');coach={feedbackFormat:c.feedbackFormat,evidenceId:c.evidenceId};}
      return {index,reference:item.reference,workId:item.workId,evidenceId:item.evidenceId,status:item.status,professional,coach};
    })};
  }
  function modelReadingSnapshot(state,materialId,dayNumber,required=true) {
    return cleanModelReading({schema:1,required,materialId,dayNumber,segments:(state?.segments||state?.allSegments||[]).map((segment,index)=>{
      const result=segment.professional?.result,match=result?.text===segment.reference,score=key=>match&&typeof result[key]==='number'&&Number.isFinite(result[key])?result[key]:null;
      return {index,reference:segment.reference,workId:segment.workId||'',evidenceId:segment.evidenceId||'',status:['complete','partial'].includes(segment.status)?segment.status:'pending',professional:result?{provider:'Alibaba oral assessment',accuracy:score('accuracy'),fluency:score('fluency'),completeness:score('completeness')}:null,coach:segment.coach?.feedbackFormat==='oral-coach-v1'?{feedbackFormat:segment.coach.feedbackFormat,evidenceId:segment.coach.evidenceId}:null};
    })});
  }
  function validateModelReading(snapshot,material,task,data,dayNumber,options={}) {
    const reference=modelReadingReference(material,data,dayNumber),required=material?.pool==='training'&&!material.fullTest&&task?.mode!=='assessment'&&!options.independentRetest&&Boolean(reference);
    const out={required,complete:!required,completedSegments:0,segmentCount:0,workIds:[],reason:required?'请先完成全部例文分段的专业评测和AI反馈；低分会进入错题本，不要求当场全部达标。':''};
    if(!required){if(snapshot?.segments)out.workIds=snapshot.segments.map(segment=>segment?.workId).filter(Boolean);return out;}
    const split=options.splitReference||root.IELTSOralPractice?.splitReference||(typeof require==='function'?require('./oral-practice.js').splitReference:null);let expected;
    try{expected=split?.(reference,65);if(!expected?.length)throw Error();}catch(_){out.reason='例文分段组件未准备好，请刷新本地课程页面。';return out;}
    out.segmentCount=expected.length;
    let saved;try{saved=cleanModelReading(snapshot);}catch(_){return out;}
    if(!saved.required||saved.materialId!==material.id||saved.dayNumber!==dayNumber||saved.segments.length!==expected.length)return out;
    const works=new Set(),evidence=new Set();
    for(const [index,segment] of saved.segments.entries()){
      if(segment.reference!==expected[index]||!segment.workId||!segment.evidenceId||works.has(segment.workId)||evidence.has(segment.evidenceId))return out;
      works.add(segment.workId);evidence.add(segment.evidenceId);out.workIds.push(segment.workId);
      if(segment.status==='complete'&&segment.professional?.provider==='Alibaba oral assessment'&&['accuracy','fluency','completeness'].every(key=>typeof segment.professional[key]==='number'&&Number.isFinite(segment.professional[key]))&&segment.coach?.feedbackFormat==='oral-coach-v1'&&segment.coach.evidenceId===segment.evidenceId)out.completedSegments++;
    }
    out.complete=out.completedSegments===expected.length;if(out.complete)out.reason='全部例文分段已完成专业评测与AI反馈；自由表达仍需单独原音和转写。';return out;
  }
  function verifySpeakingStage(record,material,task,data,dayNumber,options={}) {
    let artifact;try{artifact=typeof record?.answer==='string'?JSON.parse(record.answer):record?.answer;}catch(_){return{valid:false,submitted:false,reason:'口语原稿格式无效。'};}
    if(!material||!artifact||typeof artifact!=='object')return{valid:false,submitted:false,reason:'口语材料或原稿不完整。'};
    const model=validateModelReading(artifact.modelReading,material,task,data,dayNumber,{...options,independentRetest:record.kind==='retest'&&artifact.mode==='assessment'});
    const ids=(record.media||[]).map(item=>item?.id),oldProgress=(()=>{try{const value=JSON.parse(artifact.text||'null');return value?.kind==='oral-practice-progress'?value.workIds||[]:[];}catch(_){return[];}})(),modelIds=new Set([...model.workIds,...oldProgress,...(artifact.modelReading?.segments||[]).map(item=>item?.workId).filter(Boolean)]);
    const free=ids.length>0&&ids.every(id=>typeof id==='string'&&id&&!modelIds.has(id))&&new Set(ids).size===ids.length&&typeof artifact.transcript==='string'&&Boolean(artifact.transcript.trim());
    return{valid:model.complete&&free,submitted:model.complete&&free,modelComplete:model.complete,modelRequired:model.required,freeExpression:free,reason:!model.complete?model.reason:!free?'请单独录制自由表达并确认转写；例文示范和词汇跟读原音不能替代自由表达。':model.reason};
  }
  function objectiveSubmissionComplete(record,material,assessment=root.IELTSAssessment) {
    if(!material||!['reading','listening','grammar'].includes(material.skill)||!Array.isArray(material.questions)||!material.questions.length)return false;
    let artifact;try{artifact=typeof record?.answer==='string'?JSON.parse(record.answer):record?.answer;}catch(_){return false;}
    const api=assessment||(typeof require==='function'?require('./assessment-core.js'):null);if(!artifact?.answers||!api)return false;
    try{const grade=api.gradeMaterial(material,artifact.answers);return grade.allGradable===true&&grade.total===material.questions.length&&grade.answered===material.questions.length;}catch(_){return false;}
  }
  function dayReadiness(data,dayNumber,records,options={}) {
    const day=data.days.find(item=>item.day===dayNumber),hub=options.hub||root.IELTSTodayHub||(typeof require==='function'?require('./today-hub.js'):null),plan=options.planState||root.IELTSPlanState||(typeof require==='function'?require('./daily-plan-state.js'):null);
    if(!day||!hub)return{ready:false,reason:'核心任务状态组件未准备好。',states:[]};
    const states=day.tasks.filter(task=>task.id!=='reflection').map(task=>{const core={...task,materialIds:task.coreMaterialIds||task.materialIds},status=hub.taskState(core,records,{data,dayNumber,materials:data.materials,recordCorrectionStatus:options.recordCorrectionStatus});
      if(['writing','speaking'].includes(task.id)){const latest=hub.latestForMaterial(core,records,dayNumber,data.materials,data);for(const id of core.materialIds){const record=latest.get(id);if(!record)continue;let corrected=false;try{corrected=options.recordCorrectionStatus?.(record)?.corrected===true;}catch(_){}if(!corrected&&!plan?.validLinkedReview?.(record)){status.done=false;status.pending=true;}}}
      return{taskId:task.id,...status};});
    const incomplete=states.filter(state=>!state.done);return{ready:incomplete.length===0,reason:incomplete.length?'请先完成核心任务：'+incomplete.map(state=>NAMES[state.taskId]+(state.pending?'（评阅或订正待完成）':'（材料尚未全部完成）')).join('、'):'核心任务真实提交与必要评阅已齐全。',states};
  }
  function nextDestination(data,dayNumber,taskId,records,options={}) {
    const tasks=data.days.find(item=>item.day===dayNumber)?.tasks||[],index=tasks.findIndex(item=>item.id===taskId),current=tasks[index];if(!current)return null;
    if(taskId==='reflection')return{kind:'overview',label:'查看今日完成情况'};
    const hub=options.hub||root.IELTSTodayHub||(typeof require==='function'?require('./today-hub.js'):null);
    const progress=task=>hub?.taskState(task,records,{data,dayNumber,materials:data.materials,recordCorrectionStatus:options.recordCorrectionStatus});
    const own=progress(current),missing=own?.missingMaterialIds||current.materialIds.filter(id=>!records.some(record=>record.dayNumber===dayNumber&&record.taskId===taskId&&record.materialId===id));
    if(missing.length)return{kind:'material',taskId,materialId:missing[0],label:'继续本项：'+(data.materials.find(item=>item.id===missing[0])?.title||NAMES[taskId])};
    const next=tasks[index+1];if(!next)return{kind:'overview',label:'查看今日完成情况'};const state=progress(next),target=state?.nextMaterialId||next.materialIds[0];
    return{kind:state?.missingMaterialIds?.length===0?'view':'material',taskId:next.id,materialId:target,label:'继续下一项：'+NAMES[next.id]};
  }

  function toRecord(attempt, material, currentDay, assessment) {
    const elapsedSeconds = Math.min(86400, Math.max(0, (Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt))/1000));
    const activeSeconds = Math.min(attempt.activeSeconds, elapsedSeconds);
    const skill = attempt.taskId, text = skill === 'speaking' ? attempt.transcript : attempt.text;
    const objective = skill === material.skill && ['reading','listening','grammar'].includes(skill);
    const grade = objective ? assessment.gradeMaterial(material, attempt.answers) : null;
    const threshold = material.pool === 'final' || attempt.kind === 'retest' ? 0.8 : 0.85;
    const artifact = {schema:1, mode:attempt.mode, courseDay:attempt.courseDay, materialVersion:String(material.version), assessmentGroup:material.assessmentGroup || '', form:material.form || '', exposureAtStart:attempt.exposureAtStart, startedAt:attempt.startedAt, activeSeconds, elapsedSeconds, answers:attempt.answers, userEvidence:attempt.userEvidence, ...(attempt.activityByDate?{activityByDate:copy(attempt.activityByDate)}:{}), text:attempt.text, transcript:attempt.transcript, audioAvailable:attempt.audioAvailable, audioCompleted:attempt.audioCompleted, transcriptViewed:attempt.transcriptViewed, interrupted:attempt.interrupted, audioAnalysisEvidence:false,...(grade?{submissionComplete:grade.allGradable&&grade.answered===material.questions.length}:{}),...(attempt.modelReading?{modelReading:cleanModelReading(attempt.modelReading)}:{})};
    const evaluation = grade ? {method:'objective', result:grade.allGradable && grade.ratio >= threshold ? 'pass' : 'revise', feedback:'项目原创题内部核对；原始正确数不是 IELTS 官方换分。', score:grade.correct, ...(grade.total ? {maxScore:grade.total} : {}), threshold} : {method:'none', result:['writing','speaking'].includes(skill) ? 'pending' : 'unverified', feedback:'已保存原始输出，完成量不能替代能力判断。'};
    const quantity = grade ? grade.answered : skill === 'vocabulary' ? text.split(/\n/).filter(line => line.trim()).length : skill === 'reflection' ? (text.trim() ? 1 : 0) : assessment.countWords(text);
    const record = {id:attempt.id, materialId:material.id, materialVersion:String(material.version), title:material.title, skill, source:'course-player', taskId:skill, answer:JSON.stringify(artifact), minutes:activeSeconds/60, quantity, unit:grade ? '题' : skill === 'vocabulary' ? '条' : skill === 'reflection' ? '份复盘' : '词', assistance:{...attempt.assistance}, kind:attempt.kind, ...(attempt.parentId ? {parentId:attempt.parentId} : {}), exposure:attempt.exposureAtStart, startedAt:attempt.startedAt, submittedAt:attempt.submittedAt, activeSeconds, elapsedSeconds, media:attempt.media || [], evaluation};
    if (Number.isInteger(currentDay) && currentDay >= attempt.courseDay && attempt.courseDay <= 365) record.dayNumber = attempt.courseDay;
    return record;
  }

  function practiceReviewResult(result,record,material,assessment){
    if(result?.status!=='complete')return 'pending';
    if(material.fullTest||material.pool==='final'){const judged=assessment.evaluatedCriteria({...record,evaluation:{method:'ai',result:'pending',feedback:JSON.stringify(result)}},material,7);return judged.criteria.some(c=>!c.complete)?'pending':judged.reasons.length?'revise':'pass';}
    const rounds=result.rounds?.filter(r=>r.ok===true)||[];
    if(rounds.length<2||new Set(rounds.map(r=>r.round)).size<2)return'pending';
    const artifact=assessment.decodeArtifact(record),text=record.skill==='speaking'?artifact?.transcript:artifact?.text;
    if(!text||rounds.some(r=>typeof r.levelCheck?.meetsGoal!=='boolean'||!r.levelCheck?.evidence?.some(e=>e.quote&&text.includes(e.quote))))return'pending';
    if(record.skill==='speaking'&&!record.media?.length)return'pending';
    if(record.skill==='speaking'){
      if(foundationSpeaking(material)){
        const source=result.pronunciationSource,ids=record.media.map(m=>m.id);
        if(!source||source.provider!=='ali'||source.recordId!==record.id||!source.evidenceId||source.completeCoverage!==true||source.reference!==text||!Number.isFinite(source.durationSeconds)||source.durationSeconds<=0||source.durationSeconds>180||!Array.isArray(source.mediaIds)||source.mediaIds.length!==ids.length||!source.mediaIds.every((id,i)=>id===ids[i]))return'pending';
        if(['accuracy','fluency','completeness'].some(k=>!Number.isFinite(source.result?.[k])))return'pending';
        if(source.result.accuracy<80||source.result.fluency<75||source.result.completeness<90)return'revise';
      }else if(result.audioAnalysisEvidence!==true||!result.audioSource?.completeCoverage)return'pending';
    }
    return !result.requiresRetest&&rounds.every(r=>r.levelCheck.meetsGoal)&&assessment.countWords(text)>=(material.minWords||1)?'pass':'revise';
  }

  function mapItemGeometry(item){
    const x=20+Math.min(100,Math.max(0,item.x))*4,y=28+Math.min(100,Math.max(0,item.y))*2.8,area=Number.isFinite(item.w)&&item.w>0&&Number.isFinite(item.h)&&item.h>0;
    const width=area?Math.min(item.w,100-Math.max(0,item.x))*4:0,height=area?Math.min(item.h,100-Math.max(0,item.y))*2.8:0;
    return{x,y,area,width,height,labelX:area?x+width/2:x,labelY:area?y+height/2+4:y-8};
  }
  function independentTask(material){
    if(!material?.independentBank||material.pool!=='independent'||!['reading','listening','writing'].includes(material.skill))throw Error('独立材料入口无效。');
    return {id:material.skill,minutes:material.estimatedMinutes||20,mode:'assessment',materialIds:[material.id],instructions:material.instructions||'独立完成这份新材料，不使用帮助。',deliverable:material.skill==='writing'?'一份独立写作原稿和真实AI评阅':'独立作答全部题目并保留原始答案'};
  }
  function init() {
    const doc = root.document, $ = id => doc.getElementById(id), data = root.IELTSCurriculumData, A = root.IELTSAssessment, R = root.IELTSRecords;
    if (!$('coursePlayerApp')) return;
    const notice = (message, error = false) => { $('courseNotice').textContent = message; $('courseNotice').classList.toggle('is-error', error); };
    if (!data?.days?.length || !A || !R) { notice('课程数据尚未加载，请检查 assets/curriculum-data.js 与本地服务。已存作品不会被改写。', true); $('courseBegin').disabled = true; return; }
    function el(tag, className, text) { const item = doc.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = String(text); return item; }
    function button(text, action, className = '') { const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b; }
    const materialMap = new Map(data.materials.map(m => [m.id,m]));
    function dayPlan(number){const base=data.days.find(d=>d.day===number);try{return root.IELTSAdaptivePlan&&base?root.IELTSAdaptivePlan.getDay(base):base;}catch(error){notice('个性化安排读取失败：'+error.message+' 原记录已保留，暂按原课程浏览。',true);return base;}}
    let storage, state, storageBroken = false, day, task, material, attempt = null, submittedRecord = null, running = false, tickAt = Date.now(), draftTimer = null, recorder = null, stream = null, chunks = [], recordStarted = 0, audioElement = null, audioURL = '', busy = false, reviewAbort = null, generation = 0, records = [], profileId = '', lastDraftSerialized = null;
    const params = new URLSearchParams(root.location.search), preview = params.get('preview') === '1';
    const extensiveMaterialId=params.get('activity')==='extensive'&&params.get('mode')==='practice'?params.get('material'):null;
    let pendingParent = params.get('parent') && ['correction','retest'].includes(params.get('kind')) ? {parentId:params.get('parent'),kind:params.get('kind'),mode:params.get('mode')==='assessment'?'assessment':'practice'} : null;
    let mediaDrafts=[],mediaBudgetSignature='',mediaBudgetPending=null,budgetDisposed=false;
    let autoRouted=false;let recordingSaving=false;const deletedDrafts=new Map();
    function load() {
      profileId = root.IELTSProfiles?.current().id || 'legacy';
      try { storage = root.IELTSProfiles?.storage() || (preview ? root.sessionStorage : root.localStorage); const raw = storage.getItem(KEY); state = raw ? parseState(raw) : newState(); storageBroken = false; }
      catch (_) { state = newState(); storageBroken = true; notice('课程草稿无法读取。已保留原记录；本页可浏览，写入已暂停，请先到备份中心处理。', true); }
    }
    function mutate(change) {
      if (storageBroken) throw Error('课程记录不可写，原记录已保留。');
      const raw = storage.getItem(KEY), next = raw ? parseState(raw) : newState(); change(next); const clean = parseState(next);
      if (storage.getItem(KEY) !== raw) throw Error('另一页面刚更新了课程记录，请刷新后继续。');
      storage.setItem(KEY, JSON.stringify(clean)); state = clean;
    }
    function persistDraft() {
      if (!attempt || submittedRecord) return;
      try {
        mutate(next => {
          const existing = next.drafts[attempt.id];
          if (existing && lastDraftSerialized !== null && JSON.stringify(existing) !== lastDraftSerialized) throw Error('本草稿已被另一个页面修改；当前输入仍保留在页面，请复制后刷新。');
          next.day = day; next.drafts[attempt.id] = copy(attempt);
        });
        lastDraftSerialized = JSON.stringify(state.drafts[attempt.id]);
      } catch (error) { running = false; notice(error.message, true); }
    }
    function scheduleSave() { clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 350); }
    function allDrafts(){let memory=[];try{memory=Object.values(root.IELTSMemory?.read?.()?.drafts||{});}catch(_){}const list=[...Object.values(state?.drafts||{}),...memory,...mediaDrafts].filter(d=>!records.some(r=>r.id===d.id));return attempt&&!submittedRecord?[...list.filter(d=>d.id!==attempt.id),attempt]:list;}
    async function refreshMediaBudget(knownRecords){if(!root.IELTSYearPlanner?.readBudget)return;if(mediaBudgetPending){await mediaBudgetPending;if(knownRecords)records=knownRecords;return;}const profile=profileId;mediaBudgetPending=(async()=>{const works=knownRecords||await R.list(),result=await root.IELTSYearPlanner.readBudget({records:works,drafts:allDrafts().filter(d=>d.source!=='media-draft'),profileId:profile,getProfile:()=>root.IELTSProfiles?.current().id||'legacy',storage,library:root.IELTSMediaLibrary});if(budgetDisposed||profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile)return;records=works;mediaDrafts=result.mediaDrafts;const signature=JSON.stringify([mediaDrafts,works.map(r=>[r.id,r.version,r.activeSeconds])]);if(signature!==mediaBudgetSignature){mediaBudgetSignature=signature;root.dispatchEvent(new CustomEvent('ielts:budget-changed',{detail:{profileId,records:works,drafts:allDrafts(),budget:calendarBudget()}}));}if(attempt&&running&&calendarBudget().exhausted)pauseForBudget();})();try{await mediaBudgetPending;}finally{mediaBudgetPending=null;}}
    function calendarBudget(){return root.IELTSYearPlanner?.calendarBudget(records,allDrafts(),root.IELTSYearPlanner.dateKey(Date.now()))||{remainingMinutes:360,exhausted:false};}
    function emitCourse(type,extra={}){root.dispatchEvent(new CustomEvent('ielts:course-'+type,{detail:{day,courseDay:day,profileId,skill:task?.id,task:task?copy(task):null,material:material?copy(material):null,mode:attempt?.mode,draft:attempt?copy(attempt):null,record:submittedRecord?copy(submittedRecord):null,audioDOM:$('courseAudio'),passageDOM:$('coursePassage'),questionsDOM:$('courseQuestions'),outputDOM:$('courseOutput'),markAssistance:assistance,...extra}}));}
    function pauseForBudget(){if(!attempt||submittedRecord)return;running=false;attempt.interrupted||=attempt.mode==='assessment';activityController?.pause?.();listeningController?.pause?.();oralController?.cancel?.();stopMedia();persistDraft();syncSessionVisibility();$('coursePause').textContent='下一日继续';notice('今日360分钟预算已用完。原始输入与录音保留为未提交草稿，下一日继续；本日课程保持未完成。');emitCourse('budget-paused',{budget:calendarBudget()});}
    function mayContinue(){const budget=calendarBudget();if(budget.exhausted){notice('今日360分钟学习预算已用完。已有草稿和作品保留，下一日可继续；今天不会标记完成。');return false;}return true;}
    function advanceTimer() {
      const now = Date.now(), delta = Math.max(0, (now - tickAt)/1000); tickAt = now;
      if (attempt && running && !doc.hidden && !submittedRecord && !busy && !pendingNetwork && (!doc.hasFocus || doc.hasFocus()) && now-lastInteraction<120000){const remaining=calendarBudget().remainingMinutes*60,added=Math.round(Math.min(delta,5,Math.max(0,remaining))*1000)/1000;if(added>0){if(!attempt.activityByDate)attempt.activityByDate=root.IELTSYearPlanner?.activityByDate(attempt,true)||{};const date=root.IELTSYearPlanner?.dateKey(Date.now())||new Date().toISOString().slice(0,10);attempt.activeSeconds=Math.min(86400,attempt.activeSeconds+added);attempt.activityByDate[date]=(attempt.activityByDate[date]||0)+added;}if(remaining<=added+.001)pauseForBudget();}
      if (attempt) {
        const elapsed = Math.max(0,(now-Date.parse(attempt.startedAt))/1000), limit = material?.timeLimitSeconds || material?.estimatedMinutes * 60;
        $('courseClock').textContent = '实际 ' + Math.floor(attempt.activeSeconds/60) + ':' + String(Math.floor(attempt.activeSeconds%60)).padStart(2,'0') + (attempt.mode === 'assessment' ? ' · 已过 ' + Math.floor(elapsed/60) + ' 分钟 / 限时 ' + Math.round(limit/60) + ' 分钟' : '');
        if (attempt.mode === 'assessment' && elapsed > limit && !submittedRecord) $('courseSubmitStatus').textContent = '已超时。仍可提交原稿，内部测评将标记超时。';
        if (running && Math.floor(now/1000)%15 === 0) persistDraft();
      }
    }
    function assistance(key) { if (attempt && !submittedRecord) { attempt.assistance[key] = true; try { mutate(s => { if (s.exposures[material.id]) s.exposures[material.id].assisted = true; }); } catch (_) {} scheduleSave(); renderExposure(); } }
    function stopMedia() { if (recorder?.state === 'recording') {recordingSaving=true;recorder.stop();} stream?.getTracks().forEach(track => track.stop()); stream = null; audioElement?.pause(); root.speechSynthesis?.cancel(); if (audioURL) { URL.revokeObjectURL(audioURL); audioURL = ''; } }
    function leave() { activityController?.destroy();activityController=null;listeningController?.destroy();listeningController=null;oralController?.destroy();oralController=null;root.dispatchEvent(new CustomEvent('ielts:vocabulary-testing',{detail:{active:false}})); advanceTimer(); if (attempt && !submittedRecord) { attempt.interrupted ||= attempt.mode === 'assessment'; persistDraft(); } running = false; stopMedia(); reviewAbort?.abort(); generation++; root.dispatchEvent(new CustomEvent('ielts:lesson-clear'));root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:false}})); attempt = null; submittedRecord = null; lastDraftSerialized = null; $('courseSession').hidden = true; $('courseStart').hidden = false; }
    function showDay(value, preferredMaterial) {
      const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 365) { notice('课程日必须是 1–365 的整数。', true); $('courseDay').value = day || 1; return; }
      leave(); day = number; $('courseDay').value = day;
      const item = dayPlan(day), week = data.weeks.find(w => w.week === item?.week);
      $('courseDayTitle').textContent = '第 ' + item.week + ' 周 · ' + (week?.title || '');
      $('courseTasks').replaceChildren();
      item.tasks.forEach(t => { const b = button('', () => showTask(t)); b.className = 'course-task'; b.dataset.taskId = t.id; b.append(el('strong','',NAMES[t.id] + ' · 参考 ' + t.minutes + ' 分钟'),el('small','',t.deliverable+(root.IELTSCurriculumCoverage?.practiceLabel(t)?' · '+root.IELTSCurriculumCoverage.practiceLabel(t):''))); $('courseTasks').append(b); });
      const preferred=materialMap.get(preferredMaterial);const selected = preferredMaterial && (item.tasks.find(t=>t.id===preferred?.skill)||item.tasks.find(t => t.materialIds.includes(preferredMaterial))); showTask(selected || item.tasks[0], preferredMaterial);
      const current = R.currentDay();
      if (!storageBroken) notice(current && day > current ? '提前浏览材料；提交作品关联实际学习日，不自动完成未来日程。' : '当天可用学习预算 ' + item.tasks.reduce((n,t)=>n+t.minutes,0) + ' 分钟；各项时间仅供安排，掌握后可立即继续，不必等计时。');
      refreshHistory();
    }
    function showTask(value, preferredMaterial) {
      leave(); const preferred=materialMap.get(preferredMaterial); task = preferred?.independentBank===true ? independentTask(preferred) : value; doc.querySelectorAll('.course-task').forEach(b => b.setAttribute('aria-current',String(b.dataset.taskId === task.id)));
      $('courseMaterials').replaceChildren(); const materials = task.materialIds.map(id => materialMap.get(id)).filter(Boolean);
      materials.forEach((m,index) => { const b = button('',()=>showMaterial(m)); b.className='course-material-button'; b.dataset.materialId=m.id; b.append(el('span','',m.title),el('small','',(materials.length>1?'第 '+(index+1)+' / '+materials.length+' 份 · ':'')+(m.independentBank?'独立短测':m.pool==='final'?'末期保留卷':m.pool==='gate'?'关卡 '+(m.form||''):task.materialPractice?.find(p=>p.materialId===m.id)?.cycle==='scheduled-reuse'?'计划巩固同ID':task.materialPractice?.find(p=>p.materialId===m.id)?.cycle==='first-planned'?'计划首次新练':'练习')+' · 参考 '+m.estimatedMinutes+' 分钟')); $('courseMaterials').append(b); });
      showMaterial(materialMap.get(preferredMaterial) || materials[0]);
    }
    function showMaterial(value) {
      leave(); material = value; $('courseMaterialIntro').replaceChildren();
      if (!material) { $('courseMaterialIntro').append(el('p','','此任务未映射到有效材料。请反馈课程日和任务名称；不会自动记完成。')); $('courseBegin').disabled = true; return; }
      $('courseBegin').disabled = storageBroken;
      doc.querySelectorAll('.course-material-button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.materialId===material.id)));
      $('courseMaterialIntro').append(el('p','course-material-meta','第 '+material.week+' 周 · '+(material.level||'')+' · '+material.source.rights),el('h2','',material.title),el('p','',task.instructions),el('p','course-small','本任务交付：'+task.deliverable+'。'+(material.source.verification==='reviewed'?'已完成内容核对；AI 辅助原创仍可能有误。':'内容待复核，仅供练习，不纳入达标判断。')));
      $('courseMode').value = task.mode === 'assessment' || material.pool !== 'training' ? 'assessment' : 'practice';
      if(material.independentBank){$('courseMaterialIntro').append(el('p','course-small','独立材料库：这是未见能力的短测样本，不能替代完整雅思试卷或完成当天核心任务。开始后记录曝光；暂停、看提示和重复作答均保留标记。'));const back=el('a','','返回陌生材料库');back.href='陌生材料库.html'+(preview?'?preview=1':'');$('courseMaterialIntro').append(back);}
      if(material.id===extensiveMaterialId&&!pendingParent){$('courseMode').value='practice';$('courseMaterialIntro').append(el('p','course-small','泛读／泛听入口：本次默认按练习方式打开，仍登记材料曝光。只记录实际活动与交付物，不改变当天计划分钟或数量。'));}
      if(task.id==='speaking'){const level=String(material.level||'A0').match(/A[012]|B[12]|C[12]/g)?.at(-1)||'A0',scenario=['A0','A1'].includes(level)?'intro':level==='A2'?'appointment':level==='B1'?'part1':'part2',link=el('a','','补充：与AI进行适级无稿原音对话');link.href='无稿口语.html?day='+day+'&material='+encodeURIComponent(material.id)+'&task='+scenario+(preview?'&preview=1':'');$('courseMaterialIntro').append(link,el('p','course-small','对话单独保留每轮原音与反馈，可用于迁移练习；课程核心原稿与关卡仍按各自证据核对。'));}
      const plannedPractice=root.IELTSCurriculumCoverage?.practiceLabel(task);if(plannedPractice)$('courseMaterialIntro').append(el('p','course-small','排课说明：'+plannedPractice+'；开始材料时仍单独记录本人的已见／未见状态。'));
      const guide=taskGuide[task.id];if(guide)$('courseMaterialIntro').prepend(el('p','course-step-guide',material.independentBank?'独立短测：开始后独立作答，提交前不开放词义、AI详解或答案提示。':guide[0]+'：'+guide[1]));
      const modelTraining=task.id==='speaking'&&validateModelReading(null,material,task,data,day,{independentRetest:pendingParent?.kind==='retest'}).required;
      if (['vocabulary','reflection'].includes(task.id)||modelTraining) $('courseMode').value='practice';
      $('courseMode').disabled = ['vocabulary','reflection'].includes(task.id)||modelTraining||material.independentBank===true;announceView();
    }
    async function begin(options = {}) {
      try{await refreshMediaBudget();}catch(error){notice('活动预算核对失败：'+error.message+' 原始草稿保留，请重试。',true);return;}if(!mayContinue())return;
      if (!options.parentId && pendingParent) options={...pendingParent,mode:pendingParent.kind==='retest'?'assessment':'practice'};
      if (!material || storageBroken || busy) return;
      if(root.IELTSPlanState&&storage.getItem('ielts52-daily-plan-v1')===null){const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');storage.setItem('ielts52-daily-plan-v1',JSON.stringify(root.IELTSPlanState.newState(date)));}
      const parent = options.parentId ? records.find(r=>r.id===options.parentId) : null;
      if (options.parentId && !parent) { notice('关联原稿不存在，不能创建伪造的订正或复测。',true); return; }
      if(parent&&parent.skill!==task.id){notice('原稿属于'+(NAMES[parent.skill]||parent.skill)+'。请先选择同技能任务和新材料，再从原稿入口进行订正或复测。',true);return;}
      const now = new Date().toISOString(), exposed = state.exposures[material.id] || records.some(r=>r.materialId===material.id);
      const access=protectedMaterialAccess(material,records,data.materials,{exposures:state.exposures,assessment:A});if(!access.allowed){notice(access.reason,true);return;}
      const kind = parent ? options.kind || 'correction' : 'original';
      let mode = material.independentBank===true&&kind!=='correction'?'assessment':options.mode || $('courseMode').value;
      if (kind==='retest' && (!A.retestAvailability(parent,[material]).due || material.id===parent.materialId)) { mode='practice'; notice('复测尚未到期或仍为同题，已按普通练习记录，不计独立迁移。'); }
      root.IELTSAdaptivePlan?.markStarted(day,dayPlan(day));
      attempt = {id:R.makeId('course'),materialId:material.id,taskId:task.id,courseDay:day,mode,kind,parentId:parent?.id||null,startedAt:now,activeSeconds:0,activityByDate:{},exposureAtStart:exposed?'seen':'unseen',answers:{},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[]};
      if (kind==='correction') { const original=A.decodeArtifact(parent); attempt.text=original?.text||''; attempt.transcript=original?.transcript||''; attempt.answers=copy(original?.answers||{}); attempt.assistance.answer=true; attempt.assistance.ai=parent.evaluation.method==='ai'; }
      try { mutate(next=>{ const previous=next.exposures[material.id]; if(previous)attempt.exposureAtStart='seen'; next.exposures[material.id]={firstSeenAt:previous?.firstSeenAt||now,lastSeenAt:now,count:(previous?.count||0)+1,assisted:previous?.assisted||false}; next.drafts[attempt.id]=copy(attempt); next.day=day; }); lastDraftSerialized=JSON.stringify(state.drafts[attempt.id]); }
      catch(error) { attempt=null; notice('未开始：'+error.message,true); return; }
      pendingParent=null; submittedRecord=null; running=true; tickAt=Date.now();root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:attempt.mode==='assessment'}})); renderSession();emitCourse('started'); refreshHistory();
    }
    function renderExposure() { if (attempt) $('courseExposure').textContent = (attempt.exposureAtStart==='unseen'?'开始时未见':'本次开始前已见')+' · '+(Object.values(attempt.assistance).some(Boolean)?'作答使用辅助':'本次尚未使用辅助')+(attempt.interrupted?' · 已中断':'')+'。原稿提交后不可覆盖。'; }
    function renderFigure(figure, container) {
      if (!figure) return; const box=el('section','course-figure'); box.append(el('h3','',figure.title||'题目图表'));
      const panels=figurePanels(figure);if(panels.length){panels.forEach(part=>renderFigure(part,box));container.append(box);return;}
      const svgNS='http://www.w3.org/2000/svg';
      const svgNode=(name,attrs,text)=>{const n=doc.createElementNS(svgNS,name);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=String(text);return n;};
      if (figure.type==='plan') {
        try {
          const p=planGeometry(figure),svg=svgNode('svg',{viewBox:`0 0 ${p.width} ${p.height}`,width:p.width,role:'img','aria-label':figure.title||'听力平面图',class:'course-plan'});
          svg.append(svgNode('title',{},figure.title||'听力平面图'),svgNode('desc',{},'上方为北。粗线为通道；入口为圆点。地点需通过听力在 A 至 F 中定位。'),svgNode('rect',{x:1,y:1,width:p.width-2,height:p.height-2,rx:10,fill:'#f6f8f1',stroke:'#b0c3af'}));
          p.paths.forEach(path=>svg.append(svgNode('polyline',{points:path.points.map(v=>v.x+','+v.y).join(' '),fill:'none',stroke:'#91a68e','stroke-width':16,'stroke-linecap':'round','stroke-linejoin':'round'})));
          p.zones.forEach(z=>svg.append(svgNode('rect',{x:z.x,y:z.y,width:z.w,height:z.h,rx:4,fill:'#fffdf5',stroke:'#315b45','stroke-width':2}),svgNode('text',{x:z.x+z.w/2,y:z.y+z.h/2+8,'font-size':24,'font-weight':700,'text-anchor':'middle',fill:'#234b36'},z.label)));
          p.landmarks.forEach(l=>svg.append(svgNode('circle',{cx:l.x,cy:l.y,r:7,fill:'#9b713a',stroke:'#fff','stroke-width':2}),svgNode('text',{x:l.x,y:l.y-15,'font-size':15,'text-anchor':'middle',fill:'#473b2a'},l.label)));
          svg.append(svgNode('line',{x1:p.north.x,y1:p.north.y+45,x2:p.north.x,y2:p.north.y+12,stroke:'#234b36','stroke-width':3}),svgNode('path',{d:`M${p.north.x-7} ${p.north.y+22} L${p.north.x} ${p.north.y+10} L${p.north.x+7} ${p.north.y+22}`,fill:'none',stroke:'#234b36','stroke-width':3}),svgNode('text',{x:p.north.x,y:p.north.y,'font-size':16,'font-weight':700,'text-anchor':'middle',fill:'#234b36'},'N / 北'));
          const ex=p.entrance.x,ey=p.entrance.y,anchor=ex<90?'start':ex>p.width-90?'end':'middle';svg.append(svgNode('circle',{cx:ex,cy:ey,r:8,fill:'#315b45',stroke:'#fff','stroke-width':2}),svgNode('text',{x:ex,y:ey+25,'font-size':15,'text-anchor':anchor,fill:'#234b36'},p.entrance.label));
          box.append(svg,el('p','course-small','示意图不按比例。粗线为可走通道，圆点为入口；箭头指向北。A–F 是待识别区域，不代表题目顺序。'));
          const description=el('details','course-plan-description');description.append(el('summary','','图形文字说明（不含地点答案）'),el('p','','北在上、南在下、西在左、东在右。入口：'+p.entrance.label+'。'));p.paths.forEach(path=>{if(path.label)description.append(el('p','',path.label));});p.zones.forEach(z=>description.append(el('p','',z.label+'：'+z.position)));box.append(description);
        } catch(error) { box.append(el('p','course-nosource','平面图无法显示：'+error.message+' 请反馈材料编号；不要在缺图时将本题当作有效测评。')); }
      }
      else if (figure.type==='process') { const row=el('div','course-process'); (figure.steps||[]).forEach((s,i)=>{if(i)row.append(el('b','','→'));row.append(el('span','',(i+1)+'. '+(typeof s==='string'?s:JSON.stringify(s))));});box.append(row); }
      else if (figure.type==='map') {
        const grid=el('div','course-map-grid');
        for(const key of ['before','after']){
          const title=String(figure.map?.[key+'Year']||figure[key+'Year']||(key==='before'?'之前':'之后')),part=el('div');part.append(el('strong','',title));const items=figure.map?.[key]||[];
          if(items.length&&items.every(i=>typeof i==='object'&&Number.isFinite(i.x)&&Number.isFinite(i.y))){
            const svg=svgNode('svg',{viewBox:'0 0 440 340',role:'img','aria-label':(figure.title||'Site map')+' — '+title});svg.append(svgNode('rect',{x:20,y:28,width:400,height:280,fill:'#f5f8ee',stroke:'#829983'}),svgNode('text',{x:408,y:18,'text-anchor':'end','font-size':12},'↑ N'));
            for(const i of items){const g=mapItemGeometry(i),color=/road|path|entrance/i.test(i.name||i.label||'')?'#dad8cf':'#d9e8d6';if(g.area)svg.append(svgNode('rect',{x:g.x,y:g.y,width:g.width,height:g.height,rx:2,fill:color,stroke:'#66836b'}));else svg.append(svgNode('circle',{cx:g.x,cy:g.y,r:4,fill:'#315b45'}));svg.append(svgNode('text',{x:g.labelX,y:g.labelY,'font-size':11,'text-anchor':'middle',fill:'#183d2d'},i.name||i.label));}
            part.append(svg);
          }else{part.append(el('p','course-small','材料未提供坐标，以下按原始描述呈现；不推测方位。'));items.forEach(i=>part.append(el('p','',typeof i==='string'?i:JSON.stringify(i))));}
          grid.append(part);
        }box.append(grid);
      }
      else if(figure.type==='mixed'&&Array.isArray(figure.parts)) figure.parts.forEach(p=>renderFigure(p,box));
      else if(['line','bar','pie'].includes(figure.type)&&figure.series?.length&&figure.labels?.length) {
        const svg=svgNode('svg',{viewBox:'0 0 650 330',role:'img','aria-label':figure.title||'图表'}),colors=['#3d7657','#c88c46','#718dba','#ae6b7e'];
        const all=figure.series.flatMap(s=>s.values||[]).filter(Number.isFinite),min=Math.min(0,...all),max=Math.max(1,...all),range=max-min;
        if(figure.type==='pie') { const values=figure.series[0].values, total=values.reduce((s,v)=>s+Math.max(0,v),0);let angle=-Math.PI/2;if(total)values.forEach((v,i)=>{const end=angle+Math.max(0,v)/total*Math.PI*2,x1=180+110*Math.cos(angle),y1=155+110*Math.sin(angle),x2=180+110*Math.cos(end),y2=155+110*Math.sin(end);if(v===total)svg.append(svgNode('circle',{cx:180,cy:155,r:110,fill:colors[i%4]}));else svg.append(svgNode('path',{d:`M180 155 L${x1} ${y1} A110 110 0 ${end-angle>Math.PI?1:0} 1 ${x2} ${y2} Z`,fill:colors[i%4]}));svg.append(svgNode('text',{x:320,y:35+i*25,'font-size':12,fill:colors[i%4]},figure.labels[i]+': '+v));angle=end;}); }
        else { const y=v=>270-(v-min)/range*235;for(let j=0;j<=4;j++){const v=min+range*j/4;svg.append(svgNode('line',{x1:55,x2:620,y1:y(v),y2:y(v),stroke:'#dce4d9'}),svgNode('text',{x:48,y:y(v)+4,'text-anchor':'end','font-size':10},Math.round(v*100)/100));} const step=550/figure.labels.length;figure.labels.forEach((label,i)=>svg.append(svgNode('text',{x:65+step*(i+.5),y:292,'text-anchor':'middle','font-size':10},label)));figure.series.forEach((s,k)=>{const points=[];(s.values||[]).forEach((v,i)=>{if(!Number.isFinite(v))return;const x=65+step*(i+.5);if(figure.type==='line'){points.push(x+','+y(v));svg.append(svgNode('circle',{cx:x,cy:y(v),r:3,fill:colors[k%4]}));}else{const w=step*.7/figure.series.length;svg.append(svgNode('rect',{x:x-step*.35+k*w,y:Math.min(y(v),y(0)),width:w*.9,height:Math.abs(y(v)-y(0)),fill:colors[k%4]}));}});if(points.length)svg.append(svgNode('polyline',{points:points.join(' '),fill:'none',stroke:colors[k%4],'stroke-width':2}));svg.append(svgNode('text',{x:65+k*140,y:320,'font-size':12,fill:colors[k%4]},s.name));}); }box.append(svg);
      }
      const rows=figureRows(figure); if(rows.length&&rows.some(r=>r.length>1)) { const table=el('table');rows.forEach((r,i)=>{const tr=el('tr');r.forEach(v=>tr.append(el(i?'td':'th','',v)));table.append(tr);});box.append(table); }container.append(box);
    }
    function renderPassage(text, selectable) {
      const container=$('coursePassage'); container.replaceChildren();container.className='course-reading';
      if(selectable) container.append(el('div','course-reading-note','可左键选择正文词句，再右键直接发送给已连接 AI。只发送选区及原句；作答中使用详解会登记 AI 辅助。'));
      const groups=[];let cursor=0;(root.IELTSPassageFormat?root.IELTSPassageFormat.paragraphs(String(text||'')):String(text||'').split(/\n+/).filter(Boolean)).forEach((paragraph,index)=>{const p=el('p','',paragraph);if(selectable){p.dataset.aiReading='true';p.dataset.aiParagraph=String(index+1);}container.append(p);groups.push({index:index+1,text:paragraph});cursor+=paragraph.length;});
      root.dispatchEvent(new CustomEvent('ielts:material',{detail:selectable?{materialId:material.id,mode:'practice',lesson:{title:material.title,text:String(text||'')},groups}:null}));
    }
    function renderAudio() {
      const box=$('courseAudio');box.replaceChildren();if(material.skill!=='listening')return;
      const owner=attempt, controls=el('div','course-audio-controls'),note=el('p','course-small');controls.append(note);box.append(controls);
      const hasFile=typeof material.audio==='string'&&material.audio.length>0&&!/^\s*(javascript|data):/i.test(material.audio);
      if(hasFile) {
        if(root.IELTSListeningPlayer){
          listeningController=root.IELTSListeningPlayer.mount(controls,{src:material.audio,assessment:attempt.mode==='assessment',
            onAvailable:value=>{if(attempt!==owner||submittedRecord)return;owner.audioAvailable=value;scheduleSave();},
            onComplete:value=>{if(attempt!==owner||submittedRecord)return;owner.audioCompleted=value;scheduleSave();},
            onAssistance:()=>assistance('hint')});
          note.textContent=material.audioVoice?'合成课程音频：'+material.audioVoice:'本地课程音频';
        }else{note.textContent='听力播放器未加载，请刷新页面；本次不会计为已听。';}
      } else {
        note.textContent='暂无预生成音频。可尝试浏览器合成朗读；无可用声音时只能做文字练习，不计独立听力。';
        const b=button('用浏览器声音朗读（合成）',()=>{const voices=root.speechSynthesis?.getVoices().filter(v=>/^en(-|_)/i.test(v.lang))||[];if(!voices.length){note.textContent='浏览器未提供英语声音，请安装英语语音或改用带音频材料。';return;}const utterance=new SpeechSynthesisUtterance(material.transcript||'');utterance.voice=voices[0];utterance.lang=voices[0].lang;utterance.onend=()=>{if(storageBroken||attempt!==owner||submittedRecord)return;attempt.audioCompleted=true;attempt.audioAvailable=true;scheduleSave();};utterance.onerror=()=>{if(storageBroken||attempt!==owner||submittedRecord)return;attempt.audioAvailable=false;note.textContent='合成语音未完成，本次不计完整听音。';};attempt.audioAvailable=true;root.speechSynthesis.speak(utterance);if(attempt.mode==='assessment')b.disabled=true;});controls.append(b);
      }
      if(attempt.mode==='practice')controls.append(button('查看听力原文（记为提示）',()=>{attempt.transcriptViewed=true;assistance('hint');renderPassage(material.transcript,false);}));
    }
    function renderQuestions() {
      const box=$('courseQuestions');box.replaceChildren();box.className='course-questions';if(task.id!==material.skill)return;
      (material.questions||[]).forEach((q,index)=>{
        const card=el('section','course-question'),field=el('fieldset'),legend=el('legend','',(index+1)+'. '+q.prompt);field.append(legend);card.dataset.questionId=q.id;
        if(['single','multi'].includes(q.type)) A.displayOptions(q,material.id,attempt.id).forEach(option=>{const label=el('label','course-option'),input=el('input');input.type=q.type==='multi'?'checkbox':'radio';input.name=attempt.id+'-'+q.id;input.value=option;input.checked=q.type==='multi'?Array.isArray(attempt.answers[q.id])&&attempt.answers[q.id].includes(option):attempt.answers[q.id]===option;input.addEventListener('change',()=>{attempt.answers[q.id]=q.type==='multi'?[...field.querySelectorAll('input:checked')].map(n=>n.value):input.value;scheduleSave();});label.append(input,el('span','',option));field.append(label);});
        else { const input=el(q.type==='short'?'textarea':'input');if(input.tagName==='INPUT')input.type='text';input.maxLength=2000;input.value=attempt.answers[q.id]||'';input.setAttribute('aria-label',q.prompt);input.addEventListener('input',()=>{attempt.answers[q.id]=input.value;scheduleSave();});field.append(input);if(q.maxWords)field.append(el('p','course-small','最多 '+q.maxWords+' 个英文词。')); }
        const label=el('label','course-evidence-label','可选：写下你的依据或错因判断（不影响客观题原始计分）'),evidence=el('textarea');evidence.maxLength=2000;evidence.value=attempt.userEvidence[q.id]||'';evidence.addEventListener('input',()=>{attempt.userEvidence[q.id]=evidence.value;scheduleSave();});label.append(evidence);card.append(field,label);box.append(card);
      });
    }

    let activityController=null, oralController=null, listeningController=null, hoverController=null,pendingNetwork=0,lastInteraction=Date.now();
    async function localJSON(url,payload,signal){
      pendingNetwork++;try{const response=await root.fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal,credentials:'same-origin',redirect:'error',cache:'no-store'});
      const result=await response.json();if(!response.ok||result.ok===false)throw Error(result.error?.message||'服务暂未完成，请重试。');return result;}finally{pendingNetwork=Math.max(0,pendingNetwork-1);tickAt=Date.now();}
    }
    const taskGuide={
      vocabulary:['今天必学词','每词先正确输入三遍、真实跟读三遍，再依次完成残缺词补全、中文写英文、听写；错误自动进入今日错题。'],
      grammar:['理解今天的句子结构','先阅读规则与原句，完成本任务各份语法题；错误留到本日错题重做。'],
      listening:['先听，再答题','播放本地音频，听完后作答；练习可以重听、对照原文。未成功播放不会计为已听。'],
      reading:['读懂今天的短文','先通读，再逐题作答并找原文依据；停留在单词上可查看词义，划句后右键可问 AI。'],
      speaking:['先读准，再自己说','先读例文并录音，自动取得阿里评测和 AI 指导；随后用自己的信息回答题目并保留原音。'],
      writing:['写下自己的表达','按题目独立写作并提交，系统自动启动两轮 AI 反馈。按反馈订正，错误进入本日错题。'],
      reflection:['把今天的错题全部做对','整页填写后统一提交，只保留仍错的题。全部通过后，AI 根据今日材料与表现生成复盘。']
    };
    function announceView(){root.dispatchEvent(new CustomEvent('ielts:course-view',{detail:{day,taskId:task?.id,materialId:material?.id,active:!!attempt,submitted:!!submittedRecord}}));}
    function continuationRecords(){return submittedRecord?[...records.filter(record=>record.id!==submittedRecord.id),submittedRecord]:records;}
    function destination(){return nextDestination({...data,days:data.days.map(item=>item.day===day?dayPlan(day):item)},day,task?.id,continuationRecords(),{recordCorrectionStatus:record=>root.IELTSMistakes?.recordCorrectionStatus?.(record)});}
    async function nextTask(){
      try{records=await R.list();const next=destination();if(!next)return;if(next.kind==='overview'){$('todayOverview')?.scrollIntoView({behavior:'smooth'});return;}if(next.kind==='view')await root.IELTSTodayNavigation.showLatestRecord(next.taskId,next.materialId);else await root.IELTSTodayNavigation.resumeNext(next.taskId,next.materialId);$('courseSession').scrollIntoView({behavior:'smooth',block:'start'});}
      catch(error){notice('暂未继续：'+error.message+'。已提交原稿和草稿仍保留。',true);}
    }
    function nextButton(box){const next=destination(),go=button(next?.label||'继续学习',async()=>{go.disabled=true;try{await nextTask();}finally{go.disabled=false;}},'button primary');box.append(go);}
    async function saveActivity(payload,source){
      if(!running||!mayContinue())throw Error('今日学习预算已暂停。草稿保留，下一日继续。');
      if(!attempt||submittedRecord||storageBroken)throw Error('此练习已经关闭或保存。');
      const owner=attempt,guard=generation;advanceTimer();if(!running)throw Error('今日学习预算已用完，未提交草稿保留。');attempt.submittedAt=new Date().toISOString();attempt.text='';
      const input=toRecord(attempt,material,R.currentDay()||day,A);input.source=source;input.quantity=payload.quantity;input.unit=payload.unit;input.evaluation=payload.evaluation;input.answer=JSON.stringify({...JSON.parse(input.answer),...JSON.parse(payload.answer||'{}'),schema:1,trainingSchema:JSON.parse(payload.answer||'{}').schema});
      const saved=await R.record(input);if(owner!==attempt||guard!==generation)return;
      submittedRecord=saved.record;running=false;mutate(s=>{delete s.drafts[owner.id];});$('courseSubmit').hidden=true;$('courseSubmitStatus').textContent='本次结果已保存；错题会在今天最后一步统一重做。';
      const box=$('courseResult');box.hidden=false;box.replaceChildren(el('h3','',source==='year-review'?'年度总结已保存；未达标继续补强':source==='mistake-review'?'今日错题与 AI 复盘已保存':'三轮词汇测试已提交'));nextButton(box);await refreshHistory();announceView();emitCourse('submitted');return saved.record;
    }
    function mountVocabulary(box){
      const owner=attempt;activityController=root.IELTSVocabularyPractice.mount(box,{
        material,courseDay:day,courseData:root.IELTSCourse,curriculumData:data,draft:owner.text?JSON.parse(owner.text):undefined,
        onMistake:event=>root.IELTSMistakes.captureVocabulary(event),
        onChange:change=>{if(attempt!==owner)return;if(change.draft){owner.text=JSON.stringify(change.draft);scheduleSave();}root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:change.testing}}));},
        lookup:(word,context,level)=>localJSON('/api/ai/glossary',{word,context,level}),
        onSubmit:payload=>saveActivity(payload,'vocabulary-practice')
      });
    }
    async function evaluateMistake(item,value,{signal}){
      const m=materialMap.get(item.materialId)||(item.question.material?{...item.question.material,prompt:item.question.prompt,level:item.question.level}:null);
      if(item.skill==='speaking'){
        const fresh=(await R.list({dayNumber:day})).filter(r=>r.materialId===item.materialId&&r.id!==item.recordId&&r.media?.length&&A.decodeArtifact(r)?.transcript?.trim()===value.answer.trim()).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt))[0];
        const review=fresh&&A.decodeReview(fresh);if(review?.status==='complete')return{review,record:fresh,submission:{answer:value.answer,media:fresh.media}};
        throw Error('请在原口语任务提交新录音并完成原音评阅，再回到这里整页核对。');
      }
      const request=m?reviewRequest(m,{text:value.answer,transcript:''}):{mode:'writing',task:item.question.task||'generic',level:item.question.level||'A0',prompt:item.question.prompt.slice(0,3000),text:value.answer},result=await localJSON('/api/ai/review',request,signal);if(result.status!=='complete')throw Error('AI 复核状态 '+String(result.status||'未知')+'：'+(result.rounds||[]).filter(r=>!r.ok).map(r=>r.error?.message||r.error?.code||'本轮未完成').join('；'));return {review:result};
    }
    function mountReflection(box){
      if(day===365){mountYearReview(box);return;}
      const owner=attempt;
      activityController=root.IELTSMistakeReview.mount({container:box,day,records:n=>R.list({dayNumber:n}),onPendingReview:record=>{if(!materialMap.has(record.materialId)||!A.decodeArtifact(record))throw Error('这份原稿来自补充练习，请点击本行原任务链接，打开'+(record.skill==='speaking'?'口语练习':'写作与AI辅导')+'重试评阅；原稿保持不变。');return review(record,record.skill==='speaking');},
        readyForRecap:({records:works})=>dayReadiness({...data,days:data.days.map(item=>item.day===day?dayPlan(day):item)},day,works,{recordCorrectionStatus:record=>root.IELTSMistakes?.recordCorrectionStatus?.(record)}),
        evaluateSubjective:evaluateMistake,
        requestRecap:async(payload,{signal})=>{
          const compact={...payload,records:payload.records.filter(r=>r.skill!=='reflection').slice(-35).map(r=>({id:r.id,skill:r.skill,title:r.title,minutes:r.minutes,quantity:r.quantity,evaluation:{result:r.evaluation.result,feedback:r.evaluation.feedback.slice(0,350)},answer:r.answer.slice(0,900)})),mistakes:payload.mistakes.slice(0,60).map(m=>({skill:m.skill,status:m.status,originalAnswer:typeof m.originalAnswer==='string'?m.originalAnswer.slice(0,300):m.originalAnswer,question:{prompt:m.question.prompt.slice(0,240),explanation:m.question.explanation.slice(0,300)}}))};
          while(new TextEncoder().encode(JSON.stringify(compact)).length>60000){if(compact.records.length>4)compact.records.shift();else if(compact.mistakes.length>4)compact.mistakes.pop();else break;}
          return localJSON('/api/ai/daily-recap',compact,signal);
        },
        onComplete:async({summary,recap,token})=>{
          if(attempt!==owner||submittedRecord)return;
          const sourceDay=day,guard=generation,profile=profileId,stillCurrent=()=>attempt===owner&&generation===guard&&day===sourceDay&&profileId===profile&&(root.IELTSProfiles?.current().id||'legacy')===profile;
          const saved=await saveActivity({answer:JSON.stringify({schema:1,dayNumber:sourceDay,token,recap}),token,quantity:1,unit:'份复盘',evaluation:{method:'ai',result:'pass',feedback:typeof recap.recap==='string'?recap.recap.slice(0,12000):'本日错题已全对并完成 AI 复盘。'}},'mistake-review');
          if(!saved||!stillCurrent())return;const works=await R.list();if(!stillCurrent())return;const drafts=Object.values(state.drafts);
          const longTerm=await root.IELTSPersonalizationIntegration?.applyAfterRecap({data,sourceDay,recapToken:token,records:works,drafts,exposures:state.exposures});
          if(!stillCurrent())return;if(longTerm?.status==='recap-not-ready'){notice(longTerm.reason||'复盘依据已更新，请重新完成当天复盘；未修改后续安排。');return;}if(!longTerm?.applied&&recap.adaptation&&root.IELTSAdaptivePlan)root.IELTSAdaptivePlan.apply(sourceDay,recap.adaptation,{recapToken:token,startedDays:drafts.map(d=>d.courseDay),drafts,exposures:state.exposures,records:works});
        }
      });
    }
    function oralReference(){return modelReadingReference(material,data,day);}
    function modelStatus(owner=attempt){return validateModelReading(owner?.modelReading,material,task,data,day,{independentRetest:owner?.kind==='retest'&&owner.mode==='assessment'});}
    function updateFreeGate(owner,panel){
      if(attempt!==owner||submittedRecord)return;const state=modelStatus(owner),live=oralController?.getState?.(),blocked=state.required&&(!state.complete||live?.modelComplete!==true);
      panel.inert=blocked;panel.querySelectorAll('input,textarea,button').forEach(node=>{node.disabled=blocked||!running||Boolean(submittedRecord);});
      const start=panel.querySelector('.course-free-start'),stop=panel.querySelector('.course-free-stop');if(start)start.disabled=blocked||!running||recorder?.state==='recording';if(stop)stop.disabled=blocked||!running||recorder?.state!=='recording';
      $('courseSubmit').disabled=blocked||!running;const note=panel.querySelector('.course-free-gate');if(note)note.textContent=blocked?'先完成全部例文分段的专业评测与AI反馈（'+state.completedSegments+'/'+state.segmentCount+'），再单独录制自由表达；专业低分会进入错题本。':'现在可单独录制自由表达。例文原音与本次自由表达分别归档。';
    }
    async function mountOral(box,panel){
      const owner=attempt,guard=generation,reference=oralReference(),host=el('section','daily-oral');box.append(host);
      if(!reference){host.append(el('p','','这份自由表达任务没有指定朗读例文，请按下方题目录音。'));return;}
      host.append(el('h3','','第一步：例文朗读与发音诊断'));const target=el('div');host.append(target);
      const mounted=await root.IELTSOralPractice.mount(target,{reference,level:material.level,materialId:material.id,dayNumber:day,title:material.title,
        resumeState:owner.text?JSON.parse(owner.text):undefined,
        onState:state=>{if(attempt!==owner||guard!==generation||submittedRecord)return;owner.text=JSON.stringify({kind:'oral-practice-progress',workIds:state.segments.map(segment=>segment.workId||''),segmentIndex:state.segmentIndex});owner.modelReading=modelReadingSnapshot(state,material.id,day,true);scheduleSave();updateFreeGate(owner,panel);},
        onResult:async payload=>{
          if(attempt!==owner||guard!==generation)return;if(payload.professionalContext)root.IELTSMistakes.recordOralEvidence(payload.professionalContext);
          owner.modelReading=modelReadingSnapshot({segments:payload.allSegments},material.id,day,true);scheduleSave();updateFreeGate(owner,panel);
          if(payload.modelComplete)notice('全部例文分段已完成专业评测与AI反馈。低分已进入错题本；现在可单独录制自己的回答。例文原音不会代替自由表达。');await refreshHistory();
        }
      });if(attempt!==owner||guard!==generation)mounted.destroy();else{oralController=mounted;owner.modelReading=modelReadingSnapshot(mounted.getState(),material.id,day,true);scheduleSave();updateFreeGate(owner,panel);}
    }

    function renderOutput() {
      const box=$('courseOutput');box.replaceChildren();const skill=task.id;
      if(!submittedRecord&&skill==='vocabulary'&&root.IELTSVocabularyPractice){mountVocabulary(box);return;}
      if(!submittedRecord&&skill==='reflection'&&(day===365||root.IELTSMistakeReview)){mountReflection(box);return;}
      if(!['writing','speaking','vocabulary','reflection'].includes(skill))return;
      const owner=attempt,panel=el('section','course-free-expression'),needsModel=skill==='speaking'&&modelStatus(owner).required;
      if(!submittedRecord&&needsModel){if(root.IELTSOralPractice)mountOral(box,panel).catch(error=>notice(error.message,true));else box.append(el('p','course-feedback','例文跟读组件未加载，请刷新后继续；不会跳过例文阶段。'));}
      if(needsModel)panel.append(el('h3','','第二步：单独录制自己的回答'),el('p','course-free-gate'));
      if(['writing','speaking'].includes(skill))panel.append(el('p','course-feedback',[material.prompt,material.instructions].filter(Boolean).join('\n')));box.append(panel);
      const label=el('label','course-output-label',skill==='speaking'?'口语转写（手动整理；不能替代录音或发音评价）':skill==='vocabulary'?'词汇输出：每行一个词、语境释义和自己的例句':skill==='reflection'?'复盘：写下本次错误、依据、订正与下一次复测计划':'写作原稿'),text=el('textarea','course-output-text'),count=el('p','course-small');text.maxLength=10000;text.value=skill==='speaking'?attempt.transcript:attempt.text;const update=()=>{if(skill==='speaking')attempt.transcript=text.value;else attempt.text=text.value;count.textContent=A.countWords(text.value)+' 个英文词'+(material.minWords?' · 本题最低 '+material.minWords+' 词':'');scheduleSave();};text.addEventListener('input',update);label.append(text);panel.append(label,count);count.textContent=A.countWords(text.value)+' 个英文词';
      if(skill==='speaking') {
        const diagnosis=el('p','course-small',foundationSpeaking(material)?'提交本次自由表达原音与确认转写后，用阿里专业诊断配合两轮阶段目标反馈；专业0–100分不换算IELTS Band。例文原音单独保存。':'提交后可将本次自由表达原音送Omni逐段听音，再做两轮四维训练评阅。未配置或证据不足的音频维度保持待验证。');const link=el('a','','打开口语诊断与录音库');link.href='口语练习.html'+(preview?'?preview=1':'');diagnosis.append(' ',link);panel.append(diagnosis);
        const controls=el('div','course-recording-controls'),status=el('p','course-small'),list=el('div');
        const start=button('开始自由表达录音',async()=>{if(needsModel&&(!modelStatus(owner).complete||oralController?.getState?.().modelComplete!==true)){notice('请先完成全部例文分段的专业评测和AI反馈。',true);return;}if(!root.navigator.mediaDevices?.getUserMedia||!root.MediaRecorder||!root.IELTSMediaLibrary){status.textContent='当前浏览器不支持录音；请从本地服务用支持麦克风的浏览器打开。';return;}try{const requestedAttempt=attempt,requestedProfile=profileId;stream=await root.navigator.mediaDevices.getUserMedia({audio:true});if(storageBroken||!attempt||attempt!==requestedAttempt||profileId!==requestedProfile||(root.IELTSProfiles?.current().id||'legacy')!==requestedProfile||submittedRecord){stream.getTracks().forEach(t=>t.stop());return;}box.querySelector('.daily-oral')?.setAttribute('inert','');const capturedStream=stream,localChunks=[],localRecorder=new MediaRecorder(capturedStream),localStarted=Date.now();recorder=localRecorder;const attemptId=attempt.id,profile=profileId,originalTitle=material.title,recordingMeta={kind:'audio',name:originalTitle+' · 自由表达原音',mode:'course_free',task:'free_expression',level:String(material.level||'A0').match(/A[012]|B[12]|C[12]/g)?.at(-1)||'A0',materialId:material.id,dayNumber:day};localRecorder.ondataavailable=e=>{if(e.data.size)localChunks.push(e.data);};localRecorder.onstop=async()=>{recordingSaving=true;const blob=new Blob(localChunks,{type:localRecorder.mimeType||'audio/webm'}),durationSeconds=Math.min(900,(Date.now()-localStarted)/1000);capturedStream.getTracks().forEach(t=>t.stop());start.disabled=false;stop.disabled=true;box.querySelector('.daily-oral')?.removeAttribute?.('inert');if(storageBroken||profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile){status.textContent='档案已切换，旧录音不会写入另一档案。';recordingSaving=false;return;}try{const entry=await root.IELTSMediaLibrary.create({...recordingMeta,durationSeconds},blob);if(storageBroken||profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile){recordingSaving=false;return;}if(owner.modelReading?.segments.some(segment=>segment.workId===entry.id))throw Error('例文原音不能加入自由表达媒体。');const reference={id:entry.id,name:entry.name||originalTitle,mime:blob.type,durationSeconds};if(!attempt||attempt.id!==attemptId||submittedRecord){mutate(s=>{const draft=s.drafts[attemptId];if(draft&&!draft.media.some(m=>m.id===entry.id))draft.media.push(reference);});recordingSaving=false;return;}attempt.media.push(reference);scheduleSave();status.textContent='录音已在本档案离线保存。';showMedia(list);}catch(error){status.textContent='录音保存失败：'+error.message;}finally{recordingSaving=false;}};localRecorder.start();start.disabled=true;stop.disabled=false;status.textContent='正在录音，最多 15 分钟。';setTimeout(()=>{if(localRecorder.state==='recording'){recordingSaving=true;localRecorder.stop();}},900000);}catch(_){status.textContent='无法使用麦克风，请检查浏览器授权与设备。';}});
        start.className='course-free-start';start.disabled=Boolean(submittedRecord);const stop=button('停止并保存录音',()=>{if(recorder?.state==='recording'){recordingSaving=true;recorder.stop();}});stop.className='course-free-stop';stop.disabled=true;controls.append(start,stop);panel.prepend(controls,status,list);showMedia(list);if(!submittedRecord)updateFreeGate(owner,panel);
      }
    }
    async function showMedia(container) { container.replaceChildren();for(const ref of attempt?.media||[]) {const entry=await root.IELTSMediaLibrary?.get(ref.id);if(!entry?.blob){container.append(el('p','course-small','录音引用存在，但音频未在本机找到：'+ref.name));continue;}const audio=el('audio');audio.controls=true;audio.src=URL.createObjectURL(entry.blob);container.append(el('p','course-small',ref.name+' · '+Math.round(ref.durationSeconds)+' 秒'),audio);}}
    function syncSessionVisibility(){const show=running||Boolean(submittedRecord);for(const id of ['courseFigure','courseAudio','coursePassage','courseQuestions','courseOutput'])$(id).hidden=!show;if(!submittedRecord){$('courseSubmit').disabled=!running;if(task?.id==='speaking'){const panel=$('courseOutput').querySelector('.course-free-expression');if(panel)updateFreeGate(attempt,panel);}}}
    function renderSession() {
      root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:attempt.mode==='assessment'&&!submittedRecord}}));
      $('courseStart').hidden=true;$('courseSession').hidden=false;for(const id of ['courseFigure','courseAudio','coursePassage','courseQuestions','courseOutput'])$(id).hidden=false;$('courseResult').hidden=true;$('courseResult').replaceChildren();$('courseSubmit').disabled=false;$('courseSubmitStatus').textContent='';$('coursePause').textContent=running?'暂停':'继续';$('courseSessionMode').textContent=attempt.mode==='assessment'?'独立测评':'练习';renderExposure();$('courseFigure').replaceChildren();renderFigure(material.figure,$('courseFigure'));$('coursePassage').replaceChildren();if(material.skill!=='listening'&&!['vocabulary','reflection'].includes(task.id))renderPassage(material.passage||'',attempt.mode==='practice'&&material.pool!=='final');renderAudio();renderQuestions();renderOutput();$('courseSubmit').hidden=['vocabulary','reflection'].includes(task.id)&&!!activityController;advanceTimer();syncSessionVisibility();announceView();emitCourse('session');
    }
    async function submit() {
      if(!attempt||submittedRecord||busy||storageBroken||!running)return;if(recordingSaving||recorder?.state==='recording'){notice('请先停止并保存录音，再提交原稿。',true);return;}
      if(task.id==='speaking'){const model=modelStatus(attempt);if(model.required&&(!model.complete||oralController?.getState?.().modelComplete!==true)){notice(model.reason,true);return;}const stage=verifySpeakingStage({kind:attempt.kind,answer:JSON.stringify({modelReading:attempt.modelReading,mode:attempt.mode,text:attempt.text,transcript:attempt.transcript}),media:attempt.media},material,task,data,day);if(!stage.submitted){notice(stage.reason,true);return;}}
      advanceTimer();if(!running)return;const objective=task.id===material.skill&&['reading','listening','grammar'].includes(task.id);const grade=A.gradeMaterial(material,attempt.answers);
      if(objective&&!grade.answered||!objective&&!attempt.text.trim()&&!attempt.transcript.trim()&&!attempt.media.length){notice('请先留下真实答案、文字输出或录音。空白记录不会提交。',true);return;}
      running=false;attempt.submittedAt=new Date().toISOString();busy=true;$('courseSubmit').disabled=true;
      try{const input=toRecord(attempt,material,R.currentDay(),A);const submittingId=attempt.id,submitGeneration=generation;const result=await R.record(input);if(generation!==submitGeneration||attempt?.id!==submittingId)return;submittedRecord=result.record;root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:false}}));try{mutate(s=>{delete s.drafts[submittingId];if(['writing','speaking'].includes(input.skill))s.queue[result.record.id]={recordId:result.record.id,at:new Date().toISOString()};});}catch(error){notice('原稿已经进入作品记录；草稿清理／待评索引未更新：'+error.message+'。刷新后可从最近作品继续。',true);}$('courseSubmitStatus').textContent=(objective&&!objectiveSubmissionComplete(input,material,A)?'部分原稿已保存，已答 '+grade.answered+'/'+material.questions.length+' 题；请继续本份材料补全。':'原稿已保存。')+'实际 '+(input.activeSeconds/60).toFixed(1)+' 分钟；不会自动完成整项日程。';doc.querySelectorAll('#courseQuestions input,#courseQuestions textarea,#courseOutput textarea').forEach(n=>n.disabled=true);showResult(result.record);refreshHistory();announceView();emitCourse('submitted');}
      catch(error){$('courseSubmitStatus').textContent='未完成保存：'+error.message+'。原稿保留在页面，可重试。';running=true;lastInteraction=Date.now();tickAt=Date.now();syncSessionVisibility();}
      finally{busy=false;}
      if(submittedRecord&&['writing','speaking'].includes(submittedRecord.skill))await review(submittedRecord,submittedRecord.skill==='speaking');
    }
    function showResult(record) {
      const box=$('courseResult');box.hidden=false;box.replaceChildren(el('h3','','原稿结果与下一步'));const m=materialMap.get(record.materialId),artifact=A.decodeArtifact(record);if(!m||!artifact)return;
      if(record.source==='year-review'&&artifact.yearSummary){box.append(el('pre','course-feedback',artifact.yearSummary.text),el('p','course-small','年度总结已保存；近期准备度与正式考试能力仍分别判断。未达标继续补强。'));nextButton(box);return;}
      if(record.skill==='vocabulary'&&artifact.kind==='vocabulary-three-modes'){
        box.append(el('p','','本次词汇训练版本 '+(artifact.trainingVersion||1)+'；学习前置训练：'+(artifact.trainingComplete?'已完成':'旧版未包含三写三读，原稿保留')));for(const round of artifact.rounds||[]){const d=el('details');d.append(el('summary','',round.mode+' · '+round.correct+'/'+round.total));for(const item of round.attempts||[])d.append(el('p','',item.prompt+' → '+item.userAnswer+'；'+(item.correct?'正确':'参考：'+item.expectedAnswer)));box.append(d);}nextButton(box);return;
      }
      if(record.source==='mistake-review'){box.append(el('pre','course-feedback',artifact.recap?.recap||'已保存本日复盘。'));nextButton(box);return;}
      const objective=['reading','listening','grammar'].includes(record.skill)&&record.skill===m.skill,grade=A.gradeMaterial(m,artifact.answers);
      if(objective){box.append(el('p','course-feedback','原始正确数 '+grade.correct+' / '+grade.total+'。这是原创材料内部核对，不直接换算官方 Band。'));grade.items.forEach(item=>{const details=el('details');details.dataset.result=item.correct?'correct':'incorrect';details.append(el('summary','',(item.correct?'✓ ':'待订正 ')+item.id+' · 展开答案与依据'),el('p','','参考答案：'+item.expected.join(' / ')),el('p','','解释：'+item.explanation),el('p','','原文依据：'+item.evidence));box.append(details);});}
      if(artifact.mode==='assessment'){const evidence=A.evidenceFor(record,m,{final:m.pool==='final'});box.append(el('p','course-small',evidence.pass?'本份符合内部独立测评条件。':'当前不计独立通过：'+evidence.reasons.join('；')));}
      renderReview(A.decodeReview(record),box);const reviewData=A.decodeReview(record);if(reviewData?.fullReviewArchiveId){box.append(button('导出完整原稿与本次评阅归档',async()=>{try{const entry=await root.IELTSMediaLibrary.get(reviewData.fullReviewArchiveId);if(!entry)throw Error('本机未找到完整归档，请恢复音频／作品备份。');root.IELTSMediaLibrary.download(new Blob([JSON.stringify(entry,null,2)],{type:'application/json'}),'IELTS-完整评阅-'+record.id+'.json');}catch(error){notice(error.message,true);}}));}
      if(record.skill==='speaking'){
        const foundation=foundationSpeaking(m),service=foundation?'阿里专业语音评测':'Omni完整听音',path=foundation?'/api/oral/status':'/api/omni/status';
        const config=el('p','course-small',service+'配置状态：正在读取本地服务…'),settings=el('a','','打开AI与语音设置');settings.href='AI设置.html'+(preview?'?preview=1':'');box.append(config,settings);
        if(!localHTTP(root.location)||!root.fetch)config.textContent=service+'配置状态：请从本地学习服务打开，原音保留待验证。';
        else{const checking=new AbortController(),timer=setTimeout(()=>checking.abort(),5000);root.fetch(path,{signal:checking.signal,credentials:'same-origin',redirect:'error',cache:'no-store'}).then(response=>response.json()).then(status=>{config.textContent=status.configured===true?foundation?'阿里专业语音评测已配置；本次自由表达原音将取得三维诊断与两轮阶段反馈，不出Band。':'Omni已配置：'+String(status.model||'')+'。完整自由表达原音将用于听音观察与两轮四维训练评阅。':foundation?'阿里专业语音评测尚未配置；请在AI与语音设置中连接。原音与原稿保留，相关维度待验证。':'Omni尚未配置：高级完整听音暂不可用，原音保留待验证。';}).catch(()=>{config.textContent=service+'配置暂不可读，原稿与原音仍保留。';}).finally(()=>clearTimeout(timer));}
      }
      const actions=el('div','course-actions');if(['writing','speaking'].includes(record.skill))actions.append(button(record.skill==='speaking'?'仅按文字做两轮复核':'两轮 AI 复核原稿',()=>review(record)));if(record.skill==='speaking')actions.append(button(foundationSpeaking(m)?'阿里诊断 + 两轮阶段反馈（不出Band）':'完整原音听音 + 两轮四维评阅',()=>review(record,true)));actions.append(button('建立订正版本',()=>{showMaterial(m);begin({parentId:record.id,kind:'correction',mode:'practice'});}));
      const alternatives=data.materials.filter(v=>v.skill===m.skill&&v.id!==m.id&&(m.assessmentGroup?v.assessmentGroup===m.assessmentGroup&&v.form!==m.form:v.week===m.week));const retest=A.retestAvailability(record,alternatives);if(alternatives.length){const select=el('select');alternatives.forEach(v=>{const o=el('option','',v.title+' · '+(v.form||''));o.value=v.id;select.append(o);});actions.append(select,button(retest.due?'开始新题复测':'提前做新题练习',()=>{const target=materialMap.get(select.value);showMaterial(target);begin({parentId:record.id,kind:'retest',mode:retest.due?'assessment':'practice'});}));}box.append(actions,el('p','course-small',retest.message+(retest.dueAt?' · 最早 '+new Date(retest.dueAt).toLocaleString():'')));nextButton(box);
    }
    function renderReview(reviewData, box) {
      if(!reviewData)return;if(reviewData.audioSource?.mediaRanges?.length)box.append(el('p','course-small','听音时点按全部原音的拼接顺序表示：'+reviewData.audioSource.mediaRanges.map((range,i)=>'原音 '+(i+1)+' 为 '+Number(range.startSeconds).toFixed(1)+'–'+Number(range.endSeconds).toFixed(1)+' 秒').join('；')+'。片段切换不代表学习者停顿。'));box.append(el('p','course-small',(reviewData.disclaimer||'同一模型两轮意见不是独立人工评分。')+' · 状态 '+reviewData.status));
      (reviewData.rounds||[]).forEach(round=>{const details=el('details','course-review-round');details.append(el('summary','','第 '+round.round+' 轮'+(round.ok?'':' · 暂不可用')));if(!round.ok){details.append(el('p','','本轮未完成，原稿仍保留。'));}else{details.append(el('p','',round.summary||''));(round.criteria||[]).forEach(c=>{details.append(el('p','',c.id+'：'+(typeof c.band==='number'?c.band+'（AI 估计）':'待验证')+'。'+c.comment));(c.evidence||[]).forEach(e=>details.append(el('blockquote','',e.quote+' — '+e.comment)));(c.audioEvidence||[]).forEach(e=>details.append(el('blockquote','course-acoustic-evidence','原音 '+(Number.isFinite(e.startSeconds)?e.startSeconds.toFixed(1):'?')+'–'+(Number.isFinite(e.endSeconds)?e.endSeconds.toFixed(1):'?')+' 秒：'+e.quote+' — '+e.comment)));});if(round.levelCheck)details.append(el('p','','阶段目标：'+(round.levelCheck.meetsGoal===true?'本轮认为符合':round.levelCheck.meetsGoal===false?'仍需补强':'证据不足')+'；'+(round.levelCheck.gaps||[]).join('；')));(round.corrections||[]).forEach(c=>details.append(el('p','',c.original+' → '+c.revised+'；'+c.reason)));details.append(el('p','course-small',round.uncertainty||''));}box.append(details);});
    }
    async function review(record,withAudio=false) {
      if(busy||storageBroken)return;const m=materialMap.get(record.materialId),artifact=A.decodeArtifact(record);if(!m||!artifact)return;
      let body;try{body=reviewRequest(m,artifact);}catch(error){notice(error.message,true);return;}
      if(!localHTTP(root.location)){notice('AI 复核需要双击“启动学习.cmd”并从本地学习地址打开。原稿已留在待评队列。',true);return;}
      if(withAudio&&record.skill!=='speaking')return;
      const aborter=new AbortController();reviewAbort=aborter;busy=true;const currentGeneration=generation,profile=profileId;
      const cancelButton=button('取消本次评阅',()=>aborter.abort(),'course-review-cancel');$('courseNotice').append(cancelButton);
      const showProgress=message=>{notice(message);$('courseNotice').append(cancelButton);};
      const timer=setTimeout(()=>aborter.abort(),withAudio?1100000:190000);
      showProgress(withAudio?(body.task==='foundation'?'正在检查阿里专业语音评测配置；只发送本次自由表达原音和确认转写，不使用例文样音。':'正在检查Omni完整听音配置，只发送本次自由表达原音与确认转写。'):'正在分别复核同一已提交原稿，两轮互不读取对方意见。');
      try{
        const reviewData=await runReviewPipeline({request:body,record,audio:withAudio,signal:aborter.signal,fetch:root.fetch.bind(root),prepare:(record,signal)=>prepareAudio(record,{signal}),onProgress:showProgress});
        if(profile!==profileId||currentGeneration!==generation||storageBroken)return;
        const {result,proof}=reviewData;let archiveId=null;
        if(root.IELTSMediaLibrary){const entry=await root.IELTSMediaLibrary.create({kind:record.skill==='writing'?'writing':'speaking_text',name:m.title+' · 评阅原稿',originalText:body.text,prompt:body.prompt,mode:reviewData.request.mode,task:body.task,level:body.level,materialId:m.id});archiveId=entry.id;await root.IELTSMediaLibrary.update(entry.id,{review:result,...(proof?{audioReview:proof}:{}),recordsId:record.id,queueStatus:result.status==='complete'?'reviewed':'pending',notes:record.media.length?'原始录音引用：'+record.media.map(v=>v.id).join('、'):''});}
        if(profile!==profileId||currentGeneration!==generation||storageBroken)return;
        const feedback=feedbackForRecord(result,archiveId),candidate={...record,evaluation:{method:'ai',result:'pending',feedback}},evidence=A.evidenceFor(candidate,m,{final:m.pool==='final'});
        const evaluationResult=practiceReviewResult(result,record,m,A);const output=await R.update(record.id,{evaluation:{method:'ai',result:evaluationResult,feedback}},R.makeId('review'));
        if(profile!==profileId||currentGeneration!==generation||storageBroken)return;
        try{mutate(state=>{if(result.status==='complete'&&evaluationResult!=='pending')delete state.queue[record.id];else state.queue[record.id]={recordId:record.id,at:new Date().toISOString()};});}catch(error){notice('原稿及评阅已保存，待评索引更新失败：'+error.message,true);}
        if(submittedRecord?.id===record.id){submittedRecord=output;showResult(output);}
        notice(result.status==='complete'?(withAudio&&body.task==='foundation'?'阿里三维专业诊断与两轮阶段目标反馈已保存；0–100分不换算IELTS Band。':withAudio&&result.audioAnalysisEvidence?(body.task==='foundation'?'原音观察与两轮阶段表达目标反馈已保存；基础任务不提供可比 Band。':'完整原音观察与两轮四维 AI 估计已保存。请回听时点核对；同一听音观察被两轮共享，仍可能共同误判。'):'两轮反馈已保存；未完成声学验证的发音与流利度仍待验证。'):'评阅未全部完成，原稿、已返回意见及原音证据均已保留，可重试。');refreshHistory();
      }catch(error){if(currentGeneration!==generation||profile!==profileId)return;notice('评阅未完成：'+(error.name==='AbortError'?'已取消或等待超时。':error.message)+' 原稿和原始录音保留。',true);}
      finally{clearTimeout(timer);cancelButton.remove?.();busy=false;if(reviewAbort===aborter)reviewAbort=null;}
    }
    function viewRecord(record){
      const m=materialMap.get(record.materialId),artifact=A.decodeArtifact(record);if(!m||!artifact){notice('原稿材料或格式无法读取，已保留原记录。',true);return false;}
      showDay(artifact.courseDay||record.dayNumber||day,m.id);task={...task,id:record.skill};material=m;attempt={id:record.id,...artifact,taskId:record.skill,kind:record.kind,parentId:record.parentId,media:record.media,assistance:record.assistance,submittedAt:record.submittedAt,materialId:m.id};submittedRecord=record;running=false;renderSession();$('courseSubmit').disabled=true;doc.querySelectorAll('#courseQuestions input,#courseQuestions textarea,#courseOutput textarea').forEach(node=>node.disabled=true);showResult(record);return true;
    }
    function mountYearReview(box){
      const owner=attempt,report=root.IELTSYearPlanView?.current?.(),ready=A.readiness(records,data.materials);box.append(el('h3','','年度证据总结'),el('p','',ready.label),el('p','',ready.disclaimer));for(const reason of ready.reasons)box.append(el('p','course-small',reason));if(report)box.append(el('p','','已完成课程 '+report.completedDays.length+'/365；待补 '+report.backlog.length+' 日。'+report.yearEnd.action));const input=el('textarea');input.rows=8;input.value=owner.text||'';input.placeholder='分别写出听读说写的实际证据、仍需验证的能力和下一周期补强行动。未达标继续学习。';input.addEventListener('input',()=>{owner.text=input.value;scheduleSave();});box.append(input,button('保存年度总结并继续补强',async()=>{try{if(input.value.trim().length<20)throw Error('请写出至少20字的具体证据与后续行动。');const text=input.value.trim();await saveActivity({answer:JSON.stringify({yearSummary:{schema:1,day:365,text,readiness:{ready:ready.ready,reasons:ready.reasons},recordIds:records.map(r=>r.id).slice(-300)}}),quantity:1,unit:'份复盘',evaluation:{method:'none',result:'unverified',feedback:'已保存年度总结；课程完成与正式考试能力分别判断，未达标继续补强。'}},'year-review');}catch(error){notice(error.message,true);}},'button primary'));activityController={pause(){input.disabled=true;},resume(){input.disabled=false;},destroy(){},getState:()=>({text:input.value})};
    }
    function renderDrafts(){
      const box=$('courseDrafts');box.replaceChildren();
      Object.values(state.drafts).filter(d=>!records.some(r=>r.id===d.id)).forEach(d=>{
        const row=el('article','course-record-row'),title=materialMap.get(d.materialId)?.title||d.materialId;
        row.append(button(title+' · 恢复草稿',()=>{if(storageBroken)return;const m=materialMap.get(d.materialId);if(!m)return;showDay(d.courseDay,d.materialId);task={...task,id:d.taskId};attempt=copy(d);attempt.interrupted||=attempt.mode==='assessment';lastDraftSerialized=JSON.stringify(d);submittedRecord=null;running=false;renderSession();}));
        const confirm=el('div','course-draft-confirm');confirm.hidden=true;confirm.append(el('p','','删除这份未提交草稿？当前练习将关闭，已提交原稿和媒体归档保留。'));
        const remove=button('确认删除这份草稿',async()=>{remove.disabled=true;try{await deleteDraft(d.id,JSON.stringify(d));}catch(error){notice('草稿未删除：'+error.message,true);remove.disabled=false;}});
        confirm.append(remove,button('取消',()=>{confirm.hidden=true;}));row.append(button('删除草稿',()=>{confirm.hidden=false;}),confirm);box.append(row);
      });
      for(const [id,deleted] of deletedDrafts){const row=el('article','course-record-row');row.append(el('p','',((materialMap.get(deleted.draft.materialId)?.title)||deleted.draft.materialId)+' · 草稿已删除'),button('撤销删除草稿',async()=>{try{if(storageBroken||profileId!==deleted.profile||(root.IELTSProfiles?.current().id||'legacy')!==deleted.profile)throw Error('档案已切换，请返回原档案后再操作。');const works=await R.list();if(works.some(record=>record.id===id))throw Error('这份练习已有提交原稿，不能恢复为草稿。');mutate(next=>{if(next.drafts[id])throw Error('草稿已被另一页面恢复，请刷新。');next.drafts[id]=copy(deleted.draft);});deletedDrafts.delete(id);await refreshHistory();announceView();notice('草稿已恢复，可从草稿列表继续。');}catch(error){notice('暂未撤销：'+error.message,true);}}));box.append(row);}
    }
    async function deleteDraft(id,expected){
      if(storageBroken||busy||recordingSaving)throw Error('正在保存或评阅，请完成后再删除。');const profile=profileId;if((root.IELTSProfiles?.current().id||'legacy')!==profile)throw Error('档案已切换，请刷新后继续。');
      const works=await R.list();if(profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile)throw Error('档案已切换。');if(works.some(record=>record.id===id))throw Error('此练习已经提交；删除草稿不会删除原稿。');
      let snapshot;
      if(attempt?.id===id&&!submittedRecord){clearTimeout(draftTimer);leave();snapshot=state.drafts[id];}
      else {const raw=storage.getItem(KEY),latest=raw?parseState(raw):newState();snapshot=latest.drafts[id];if(snapshot&&JSON.stringify(snapshot)!==expected)throw Error('另一页面刚修改了草稿，请刷新后再确认删除。');}
      if(!snapshot)throw Error('草稿已不存在，请刷新列表。');const signature=JSON.stringify(snapshot);
      mutate(next=>{if(JSON.stringify(next.drafts[id])!==signature)throw Error('草稿刚被另一页面修改，未删除。');delete next.drafts[id];});deletedDrafts.set(id,{draft:copy(snapshot),profile});records=works;await refreshHistory();announceView();notice('未提交草稿已删除；可在本页撤销。已提交原稿和媒体归档保留。');
    }
    async function refreshHistory() {
      try{records=await R.list();await refreshMediaBudget(records);if(root.IELTSAdaptivePlan?.adoptStarted){try{root.IELTSAdaptivePlan.adoptStarted({records,drafts:Object.values(state.drafts),startedDays:Object.values(state.drafts).map(d=>d.courseDay)});}catch(error){notice('已开始课程的保护记录未更新：'+error.message+'；已有草稿与作品保留。',true);}}}catch(error){notice('作品记录无法读取：'+error.message,true);return;}
      if(!autoRouted){autoRouted=true;if(!params.has('day')&&!params.has('material')&&!root.location.hash&&root.IELTSYearPlanner){let startDate;try{startDate=JSON.parse(storage.getItem('ielts52-daily-plan-v1')||'null')?.startDate;}catch(_){}const report=root.IELTSYearPlanner.observe({data,records,drafts:allDrafts(),startDate,verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord,isDayComplete:(n,own)=>{if(n===365)return own.some(r=>r.source==='year-review'&&A.decodeArtifact(r)?.yearSummary?.text?.trim().length>=20);try{return root.IELTSMistakes?.forDay(n)?.completionValid===true&&dayReadiness(data,n,own,{recordCorrectionStatus:r=>root.IELTSMistakes?.recordCorrectionStatus?.(r)}).ready;}catch(_){return false;}}});if(report.courseDay!==day){showDay(report.courseDay);return;}}}
      const week=dayPlan(day)?.week||1,prerequisites=prerequisiteStatus(data.materials,records,week,A).filter(item=>!item.pass);
      let prerequisiteBox=$('coursePrerequisites');if(!prerequisiteBox){prerequisiteBox=el('p','course-target');prerequisiteBox.id='coursePrerequisites';$('courseDayTitle').parentElement?.append(prerequisiteBox);}
      prerequisiteBox.hidden=!prerequisites.length;prerequisiteBox.textContent=prerequisites.length?'前置关卡仍未验证：'+prerequisites.map(item=>item.id).join('、')+'。可以提前浏览，但会登记曝光；建议先完成原稿、订正和新题复测，再提高训练难度。':'';
      const actual=records.filter(r=>r.dayNumber===day);$('courseActual').textContent='本日已提交作品实际 '+actual.reduce((n,r)=>n+r.minutes,0).toFixed(1)+' 分钟；有效作品与能力关卡分别判断。';
      renderDrafts();
      $('courseQueue').replaceChildren();Object.values(state.queue).forEach(q=>{const record=records.find(r=>r.id===q.recordId);if(record)$('courseQueue').append(button(record.title+' · 重试评阅',()=>review(record,record.skill==='speaking')));});
      $('courseHistory').replaceChildren();records.filter(r=>['course-player','vocabulary-practice','mistake-review','year-review'].includes(r.source)).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)).slice(0,20).forEach(record=>{const row=el('article','course-record-row');row.append(el('strong','',record.title),el('p','',new Date(record.submittedAt).toLocaleString()+' · '+NAMES[record.skill]+' · '+record.minutes.toFixed(1)+' 分钟 · '+record.kind+' · '+(record.exposure==='unseen'?'开始时未见':'已见／未知')+' · '+record.evaluation.result));row.append(button('查看原稿与后续操作',()=>viewRecord(record)));$('courseHistory').append(row);});
      const gates=A.gateMastery(records,data.materials);$('courseGates').replaceChildren();if(!gates.length)$('courseGates').append(el('p','course-small','尚无关卡原稿。完成对应 A 卷后，按错因补强并至少间隔 48 小时换 B 卷。'));
      gates.forEach(g=>{const row=el('article','course-gate-row');row.append(el('strong','',g.id+' · '+g.label),el('p','',g.pass?'已保留 A 卷原稿及至少 48 小时后的未见 B 卷独立复测证据。':g.reasons.join('；')+(g.dueAt?' · B 卷最早开始：'+new Date(g.dueAt).toLocaleString():'')));$('courseGates').append(row);});
      const ready=A.readiness(records,data.materials);$('courseReadiness').replaceChildren(el('strong','',ready.label),el('p','course-small',ready.disclaimer));ready.reasons.forEach(reason=>$('courseReadiness').append(el('p','course-small',reason)));
      root.dispatchEvent(new CustomEvent('ielts:course-progress',{detail:{day,records:actual,allRecords:records,drafts:allDrafts(),tasks:dayPlan(day).tasks}}));
    }
    root.IELTSTodayNavigation={showDay,allDrafts:()=>copy(allDrafts()),budget:()=>calendarBudget(),
      showLatestRecord:async(taskId,materialId)=>{try{const profile=profileId,works=await R.list();if(profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile)return;records=works;const record=works.filter(item=>item.dayNumber===day&&item.taskId===taskId&&(!materialId||item.materialId===materialId)&&item.kind!=='retest').sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||(b.version||0)-(a.version||0))[0];if(!record){notice('本日尚未找到这份材料的原稿，请从最近作品检查；不会新建练习。',true);return;}viewRecord(record);}catch(error){notice('原稿暂未打开：'+error.message,true);}},
      drafts:()=>Object.values(state.drafts).filter(d=>d.courseDay===day&&!records.some(r=>r.id===d.id)).map(d=>({id:d.id,taskId:d.taskId,materialId:d.materialId})),
      resumeNext:async(taskId,preferredMaterialId)=>{
        try{await refreshMediaBudget();}catch(error){notice('活动预算核对失败：'+error.message,true);return;}
        const t=dayPlan(day)?.tasks.find(t=>t.id===taskId);if(!t)return;
        if(!mayContinue())return;
        if(attempt&&!submittedRecord&&task.id===taskId&&(!preferredMaterialId||material.id===preferredMaterialId)){if(!running){running=true;lastInteraction=Date.now();tickAt=Date.now();$('coursePause').textContent='暂停';syncSessionVisibility();}return;}
        const draft=Object.values(state.drafts).filter(d=>d.courseDay===day&&d.taskId===taskId&&(!preferredMaterialId||d.materialId===preferredMaterialId)&&!records.some(r=>r.id===d.id)).sort((a,b)=>b.startedAt.localeCompare(a.startedAt))[0];
        showTask(t,draft?.materialId||preferredMaterialId);if(draft){attempt=copy(draft);attempt.interrupted||=attempt.mode==='assessment';lastDraftSerialized=JSON.stringify(draft);submittedRecord=null;running=true;lastInteraction=Date.now();tickAt=Date.now();renderSession();}else{const partial=records.filter(record=>record.dayNumber===day&&record.taskId===taskId&&record.materialId===material.id&&record.kind!=='retest'&&['reading','listening','grammar'].includes(material.skill)&&!objectiveSubmissionComplete(record,material,A)).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt))[0];begin(partial?{parentId:partial.id,kind:'correction',mode:'practice'}:{});}
      },showTask:(taskId,preferredMaterialId)=>{const selected=dayPlan(day)?.tasks.find(t=>t.id===taskId);if(selected)showTask(selected,preferredMaterialId);},openExtra:(entry)=>{
        const t=dayPlan(day)?.tasks.find(t=>t.id===entry.skill),m=materialMap.get(entry.materialId);if(!t||!m||m.pool!=='training')return;
        showTask({...t,materialIds:[entry.materialId],instructions:entry.strategy||'根据刚才的表现继续适级练习；实际完成后再判断是否需要补强。'},entry.materialId);begin({mode:'practice'});
      },begin:()=>begin(),current:()=>({day,taskId:task?.id,materialId:material?.id,active:!!attempt,submitted:!!submittedRecord}),exposures:()=>copy(state.exposures)};
    root.addEventListener('hashchange',()=>{const match=/^#day(\d+)$/.exec(root.location.hash);if(match)showDay(Number(match[1]));});
    if(root.IELTSWordHover)hoverController=root.IELTSWordHover.install({root:doc,courseData:root.IELTSCourse,curriculumData:data,level:()=>material?.level||'A0',materialId:()=>material?.id||'',lookupAI:(word,context,level)=>localJSON('/api/ai/glossary',{word,context,level})});
    $('courseBegin').addEventListener('click',()=>begin());$('courseSubmit').addEventListener('click',submit);$('courseDay').addEventListener('change',()=>showDay($('courseDay').value));$('coursePrevious').addEventListener('click',()=>showDay(Math.max(1,day-1)));$('courseNext').addEventListener('click',()=>showDay(Math.min(365,day+1)));$('courseDiscard').addEventListener('click',()=>{const current=material;showMaterial(current);refreshHistory();});
    $('coursePause').addEventListener('click',async()=>{if(submittedRecord)return;if(!running){try{await refreshMediaBudget();}catch(error){notice(error.message,true);return;}}if(!running&&!mayContinue())return;advanceTimer();if(calendarBudget().exhausted){pauseForBudget();return;}running=!running;if(running){lastInteraction=Date.now();activityController?.resume?.();}if(!running){activityController?.pause?.();oralController?.cancel?.();listeningController?.pause?.();stopMedia();}syncSessionVisibility();if(!running&&attempt?.mode==='assessment')attempt.interrupted=true;$('coursePause').textContent=running?'暂停':'继续';renderExposure();persistDraft();});
    ['pointerdown','keydown','input','wheel'].forEach(type=>doc.addEventListener(type,()=>{lastInteraction=Date.now();},{passive:true}));
    doc.addEventListener('visibilitychange',()=>{advanceTimer();if(doc.hidden&&attempt&&!submittedRecord){attempt.interrupted||=attempt.mode==='assessment';persistDraft();}});
    root.addEventListener('ielts:selection-assistance',event=>{if(event.detail?.materialId===material?.id)assistance('ai');});
    root.addEventListener('ielts:records-changed',()=>{if((root.IELTSProfiles?.current().id||'legacy')===profileId)refreshHistory();});root.addEventListener('ielts:profile-changed',()=>{advanceTimer();running=false;stopMedia();reviewAbort?.abort();generation++;storageBroken=true;$('courseBegin').disabled=true;$('courseSubmit').disabled=true;notice('学习档案已切换。当前未保存输入仍在本页，请先复制保留，再刷新；不会写入其他档案。',true);});
    root.addEventListener('pagehide',()=>{budgetDisposed=true;stopBudgetWatch?.();advanceTimer();if(attempt&&!submittedRecord){attempt.interrupted||=attempt.mode==='assessment';persistDraft();}stopMedia();reviewAbort?.abort();});
    let stopBudgetWatch=null;setInterval(advanceTimer,1000);load();if(root.IELTSYearPlanner?.watchMediaActivity)stopBudgetWatch=root.IELTSYearPlanner.watchMediaActivity(()=>refreshMediaBudget().catch(error=>notice('活动预算暂未刷新：'+error.message,true)));setInterval(()=>{if(!budgetDisposed&&!storageBroken&&!doc.hidden)refreshMediaBudget().catch(error=>notice('活动预算暂未刷新：'+error.message,true));},5000);const linkedMaterial=materialMap.get(params.get('material'));const mappedDay=linkedMaterial?data.days.find(d=>d.tasks.some(t=>t.materialIds.includes(linkedMaterial.id)))?.day:null;const hashDay=/^#day(\d+)$/.exec(root.location.hash||'');const initialDay=Number(params.get('day'))||Number(hashDay?.[1])||mappedDay||R.currentDay()||state.day;showDay(Math.min(365,Math.max(1,initialDay)),params.get('material'));refreshHistory().then(()=>{if(!pendingParent)return;const parent=records.find(r=>r.id===pendingParent.parentId);if(!parent){notice('关联原稿未找到，请从作品记录重新打开。',true);pendingParent=null;return;}const matching=dayPlan(day)?.tasks.find(t=>t.id===parent.skill);if(matching)showTask(matching,params.get('material'));notice('已关联原稿「'+parent.title+'」。选择同技能材料后点击开始，将保存'+(pendingParent.kind==='retest'?'复测':'订正')+'版本。'+(!materialMap.has(parent.materialId)?'原材料来自其他练习模块，请选择课程内同技能材料。':''));});
  }
  const api={KEY,mapItemGeometry,independentTask,newState,parseState,mergeState,taskFor,prerequisiteStatus,protectedMaterialAccess,figureRows,figurePanels,planGeometry,reviewRequest,prepareAudio,audioSource,runReviewPipeline,feedbackForRecord,practiceReviewResult,foundationSpeaking,localHTTP,modelReadingReference,cleanModelReading,modelReadingSnapshot,validateModelReading,verifySpeakingStage,objectiveSubmissionComplete,dayReadiness,nextDestination,toRecord};root.IELTSCoursePlayer=Object.freeze(api);if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document?.getElementById('coursePlayerApp'))init();
})(typeof window!=='undefined'?window:globalThis);
