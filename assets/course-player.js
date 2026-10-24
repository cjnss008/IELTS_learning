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
    if (!input || input.schema !== 1 || Object.keys(input).some(k=>!['schema','day','exposures','drafts','queue'].includes(k)) || !Number.isInteger(input.day) || input.day < 1 || input.day > 364) throw Error('课程记录格式无效。');
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
          if (item.id !== id || !validId(item.materialId) || !SKILLS.includes(item.taskId) || !['practice','assessment'].includes(item.mode) || !['original','correction','retest'].includes(item.kind) || !Number.isInteger(item.courseDay) || item.courseDay < 1 || item.courseDay > 364 || !Number.isFinite(Date.parse(item.startedAt)) || !Number.isFinite(item.activeSeconds) || item.activeSeconds < 0 || item.activeSeconds > 86400 || typeof item.text !== 'string' || item.text.length > 15000 || typeof item.transcript !== 'string' || item.transcript.length > 15000 || JSON.stringify(item).length > 70000) throw Error('课程草稿无效。');
          if (!item.answers || typeof item.answers !== 'object' || Array.isArray(item.answers) || !item.userEvidence || typeof item.userEvidence !== 'object' || Array.isArray(item.userEvidence)) throw Error('草稿答案无效。');
          for (const [qid, answer] of Object.entries(item.answers)) if (!validId(qid) || !(typeof answer === 'string' && answer.length <= 2000 || Array.isArray(answer) && answer.length <= 50 && answer.every(v => typeof v === 'string' && v.length <= 1000))) throw Error('草稿题目答案无效。');
          for (const [qid, evidence] of Object.entries(item.userEvidence)) if (!validId(qid) || typeof evidence !== 'string' || evidence.length > 2000) throw Error('草稿依据无效。');
          if (Object.keys(item).some(k=>!['id','materialId','taskId','courseDay','mode','kind','parentId','startedAt','submittedAt','activeSeconds','exposureAtStart','answers','userEvidence','text','transcript','audioAvailable','audioCompleted','transcriptViewed','interrupted','assistance','media'].includes(k))) throw Error('草稿含有未知字段。');
          if (!['unseen','seen'].includes(item.exposureAtStart) || ['audioAvailable','audioCompleted','transcriptViewed','interrupted'].some(k=>typeof item[k]!=='boolean') || !item.assistance || Object.keys(item.assistance).length!==3 || ['hint','answer','ai'].some(k => typeof item.assistance[k] !== 'boolean') || !Array.isArray(item.media) || item.media.length > 8 || item.parentId && !validId(item.parentId) || item.kind!=='original'&&!item.parentId || item.kind==='original'&&item.parentId) throw Error('草稿辅助或录音记录无效。');
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
    try{for(const reference of record.media){checkAbort(options.signal);const entry=await library.get(reference.id);checkAbort(options.signal);if(!entry?.blob||entry.kind!=='audio')throw Error('缺少原始录音 '+reference.name+'；不会仅发送剩余片段冒充完整口语。');const buffer=await context.decodeAudioData(await entry.blob.arrayBuffer());checkAbort(options.signal);if(!Number.isFinite(buffer.duration)||buffer.duration<.1||buffer.duration>900)throw Error('原始录音时长无效。');decoded.push({buffer,offset:seconds});mediaIds.push(reference.id);seconds+=buffer.duration;if(seconds>900.01)throw Error('同一份口语作品合计超过 15 分钟，请按真实任务另存分段作品。');}}finally{await context.close();}
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
  function toRecord(attempt, material, currentDay, assessment) {
    const elapsedSeconds = Math.min(86400, Math.max(0, (Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt))/1000));
    const activeSeconds = Math.min(attempt.activeSeconds, elapsedSeconds);
    const skill = attempt.taskId, text = skill === 'speaking' ? attempt.transcript : attempt.text;
    const objective = skill === material.skill && ['reading','listening','grammar'].includes(skill);
    const grade = objective ? assessment.gradeMaterial(material, attempt.answers) : null;
    const threshold = material.pool === 'final' || attempt.kind === 'retest' ? 0.8 : 0.85;
    const artifact = {schema:1, mode:attempt.mode, courseDay:attempt.courseDay, materialVersion:String(material.version), assessmentGroup:material.assessmentGroup || '', form:material.form || '', exposureAtStart:attempt.exposureAtStart, startedAt:attempt.startedAt, activeSeconds, elapsedSeconds, answers:attempt.answers, userEvidence:attempt.userEvidence, text:attempt.text, transcript:attempt.transcript, audioAvailable:attempt.audioAvailable, audioCompleted:attempt.audioCompleted, transcriptViewed:attempt.transcriptViewed, interrupted:attempt.interrupted, audioAnalysisEvidence:false};
    const evaluation = grade ? {method:'objective', result:grade.allGradable && grade.ratio >= threshold ? 'pass' : 'revise', feedback:'项目原创题内部核对；原始正确数不是 IELTS 官方换分。', score:grade.correct, ...(grade.total ? {maxScore:grade.total} : {}), threshold} : {method:'none', result:['writing','speaking'].includes(skill) ? 'pending' : 'unverified', feedback:'已保存原始输出，完成量不能替代能力判断。'};
    const quantity = grade ? grade.answered : skill === 'vocabulary' ? text.split(/\n/).filter(line => line.trim()).length : skill === 'reflection' ? (text.trim() ? 1 : 0) : assessment.countWords(text);
    const record = {id:attempt.id, materialId:material.id, materialVersion:String(material.version), title:material.title, skill, source:'course-player', taskId:skill, answer:JSON.stringify(artifact), minutes:activeSeconds/60, quantity, unit:grade ? '题' : skill === 'vocabulary' ? '条' : skill === 'reflection' ? '份复盘' : '词', assistance:{...attempt.assistance}, kind:attempt.kind, ...(attempt.parentId ? {parentId:attempt.parentId} : {}), exposure:attempt.exposureAtStart, startedAt:attempt.startedAt, submittedAt:attempt.submittedAt, activeSeconds, elapsedSeconds, media:attempt.media || [], evaluation};
    if (Number.isInteger(currentDay) && currentDay >= attempt.courseDay && attempt.courseDay <= 364) record.dayNumber = attempt.courseDay;
    return record;
  }
  function init() {
    const doc = root.document, $ = id => doc.getElementById(id), data = root.IELTSCurriculumData, A = root.IELTSAssessment, R = root.IELTSRecords;
    if (!$('coursePlayerApp')) return;
    const notice = (message, error = false) => { $('courseNotice').textContent = message; $('courseNotice').classList.toggle('is-error', error); };
    if (!data?.days?.length || !A || !R) { notice('课程数据尚未加载，请检查 assets/curriculum-data.js 与本地服务。已存作品不会被改写。', true); $('courseBegin').disabled = true; return; }
    function el(tag, className, text) { const item = doc.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = String(text); return item; }
    function button(text, action, className = '') { const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b; }
    const materialMap = new Map(data.materials.map(m => [m.id,m]));
    let storage, state, storageBroken = false, day, task, material, attempt = null, submittedRecord = null, running = false, tickAt = Date.now(), draftTimer = null, recorder = null, stream = null, chunks = [], recordStarted = 0, audioElement = null, audioURL = '', busy = false, reviewAbort = null, generation = 0, records = [], profileId = '', lastDraftSerialized = null;
    const params = new URLSearchParams(root.location.search), preview = params.get('preview') === '1';
    const extensiveMaterialId=params.get('activity')==='extensive'&&params.get('mode')==='practice'?params.get('material'):null;
    let pendingParent = params.get('parent') && ['correction','retest'].includes(params.get('kind')) ? {parentId:params.get('parent'),kind:params.get('kind'),mode:params.get('mode')==='assessment'?'assessment':'practice'} : null;
    let recordingSaving=false;
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
    function advanceTimer() {
      const now = Date.now(), delta = Math.max(0, (now - tickAt)/1000); tickAt = now;
      if (attempt && running && !doc.hidden && !submittedRecord) attempt.activeSeconds = Math.min(86400, attempt.activeSeconds + Math.min(delta, 5));
      if (attempt) {
        const elapsed = Math.max(0,(now-Date.parse(attempt.startedAt))/1000), limit = material?.timeLimitSeconds || material?.estimatedMinutes * 60;
        $('courseClock').textContent = '实际 ' + Math.floor(attempt.activeSeconds/60) + ':' + String(Math.floor(attempt.activeSeconds%60)).padStart(2,'0') + (attempt.mode === 'assessment' ? ' · 已过 ' + Math.floor(elapsed/60) + ' 分钟 / 限时 ' + Math.round(limit/60) + ' 分钟' : '');
        if (attempt.mode === 'assessment' && elapsed > limit && !submittedRecord) $('courseSubmitStatus').textContent = '已超时。仍可提交原稿，内部测评将标记超时。';
        if (running && Math.floor(now/1000)%15 === 0) persistDraft();
      }
    }
    function assistance(key) { if (attempt && !submittedRecord) { attempt.assistance[key] = true; try { mutate(s => { if (s.exposures[material.id]) s.exposures[material.id].assisted = true; }); } catch (_) {} scheduleSave(); renderExposure(); } }
    function stopMedia() { if (recorder?.state === 'recording') {recordingSaving=true;recorder.stop();} stream?.getTracks().forEach(track => track.stop()); stream = null; audioElement?.pause(); root.speechSynthesis?.cancel(); if (audioURL) { URL.revokeObjectURL(audioURL); audioURL = ''; } }
    function leave() { advanceTimer(); if (attempt && !submittedRecord) { attempt.interrupted ||= attempt.mode === 'assessment'; persistDraft(); } running = false; stopMedia(); reviewAbort?.abort(); generation++; root.dispatchEvent(new CustomEvent('ielts:lesson-clear'));root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:false}})); attempt = null; submittedRecord = null; lastDraftSerialized = null; $('courseSession').hidden = true; $('courseStart').hidden = false; }
    function showDay(value, preferredMaterial) {
      const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 364) { notice('课程日必须是 1–364 的整数。', true); $('courseDay').value = day || 1; return; }
      leave(); day = number; $('courseDay').value = day;
      const item = data.days.find(d => d.day === day), week = data.weeks.find(w => w.week === item?.week);
      $('courseDayTitle').textContent = '第 ' + item.week + ' 周 · ' + (week?.title || '');
      $('courseTasks').replaceChildren();
      item.tasks.forEach(t => { const b = button('', () => showTask(t)); b.className = 'course-task'; b.dataset.taskId = t.id; b.append(el('strong','',NAMES[t.id] + ' · ' + t.minutes + ' 分钟'),el('small','',t.deliverable)); $('courseTasks').append(b); });
      const preferred=materialMap.get(preferredMaterial);const selected = preferredMaterial && (item.tasks.find(t=>t.id===preferred?.skill)||item.tasks.find(t => t.materialIds.includes(preferredMaterial))); showTask(selected || item.tasks[0], preferredMaterial);
      const current = R.currentDay();
      if (!storageBroken) notice(current && day > current ? '提前浏览材料；提交作品关联实际学习日，不自动完成未来日程。' : '当前课程日计划 ' + item.tasks.reduce((n,t)=>n+t.minutes,0) + ' 分钟。只保存真实作答与实际活动时间。');
      refreshHistory();
    }
    function showTask(value, preferredMaterial) {
      leave(); task = value; doc.querySelectorAll('.course-task').forEach(b => b.setAttribute('aria-current',String(b.dataset.taskId === task.id)));
      $('courseMaterials').replaceChildren(); const materials = task.materialIds.map(id => materialMap.get(id)).filter(Boolean);
      materials.forEach(m => { const b = button('',()=>showMaterial(m)); b.className='course-material-button'; b.dataset.materialId=m.id; b.append(el('span','',m.title),el('small','',(m.pool==='final'?'末期新卷':m.pool==='gate'?'关卡 '+(m.form||''):'练习')+' · '+m.estimatedMinutes+' 分钟')); $('courseMaterials').append(b); });
      showMaterial(materialMap.get(preferredMaterial) || materials[0]);
    }
    function showMaterial(value) {
      leave(); material = value; $('courseMaterialIntro').replaceChildren();
      if (!material) { $('courseMaterialIntro').append(el('p','','此任务未映射到有效材料。请反馈课程日和任务名称；不会自动记完成。')); $('courseBegin').disabled = true; return; }
      $('courseBegin').disabled = storageBroken;
      doc.querySelectorAll('.course-material-button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.materialId===material.id)));
      $('courseMaterialIntro').append(el('p','course-material-meta','第 '+material.week+' 周 · '+(material.level||'')+' · '+material.source.rights),el('h2','',material.title),el('p','',task.instructions),el('p','course-small','本任务交付：'+task.deliverable+'。'+(material.source.verification==='reviewed'?'已完成内容核对；AI 辅助原创仍可能有误。':'内容待复核，仅供练习，不纳入达标判断。')));
      $('courseMode').value = task.mode === 'assessment' || material.pool !== 'training' ? 'assessment' : 'practice';
      if(material.id===extensiveMaterialId&&!pendingParent){$('courseMode').value='practice';$('courseMaterialIntro').append(el('p','course-small','泛读／泛听入口：本次默认按练习方式打开，仍登记材料曝光。只记录实际活动与交付物，不改变当天计划分钟或数量。'));}
      if (['vocabulary','reflection'].includes(task.id)) $('courseMode').value='practice';
      $('courseMode').disabled = ['vocabulary','reflection'].includes(task.id);
    }
    async function begin(options = {}) {
      if (!options.parentId && pendingParent) options={...pendingParent,mode:pendingParent.kind==='retest'?'assessment':'practice'};
      if (!material || storageBroken || busy) return;
      const parent = options.parentId ? records.find(r=>r.id===options.parentId) : null;
      if (options.parentId && !parent) { notice('关联原稿不存在，不能创建伪造的订正或复测。',true); return; }
      if(parent&&parent.skill!==task.id){notice('原稿属于'+(NAMES[parent.skill]||parent.skill)+'。请先选择同技能任务和新材料，再从原稿入口进行订正或复测。',true);return;}
      const now = new Date().toISOString(), exposed = state.exposures[material.id] || records.some(r=>r.materialId===material.id);
      const kind = parent ? options.kind || 'correction' : 'original';
      let mode = options.mode || $('courseMode').value;
      if (kind==='retest' && (!A.retestAvailability(parent,[material]).due || material.id===parent.materialId)) { mode='practice'; notice('复测尚未到期或仍为同题，已按普通练习记录，不计独立迁移。'); }
      attempt = {id:R.makeId('course'),materialId:material.id,taskId:task.id,courseDay:day,mode,kind,parentId:parent?.id||null,startedAt:now,activeSeconds:0,exposureAtStart:exposed?'seen':'unseen',answers:{},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[]};
      if (kind==='correction') { const original=A.decodeArtifact(parent); attempt.text=original?.text||''; attempt.transcript=original?.transcript||''; attempt.answers=copy(original?.answers||{}); attempt.assistance.answer=true; attempt.assistance.ai=parent.evaluation.method==='ai'; }
      try { mutate(next=>{ const previous=next.exposures[material.id]; if(previous)attempt.exposureAtStart='seen'; next.exposures[material.id]={firstSeenAt:previous?.firstSeenAt||now,lastSeenAt:now,count:(previous?.count||0)+1,assisted:previous?.assisted||false}; next.drafts[attempt.id]=copy(attempt); next.day=day; }); lastDraftSerialized=JSON.stringify(state.drafts[attempt.id]); }
      catch(error) { attempt=null; notice('未开始：'+error.message,true); return; }
      pendingParent=null; submittedRecord=null; running=true; tickAt=Date.now();root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:attempt.mode==='assessment'}})); renderSession(); refreshHistory();
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
      else if (figure.type==='map') { const grid=el('div','course-map-grid'); for(const [key,title] of [['before','之前'],['after','之后']]) { const part=el('div');part.append(el('strong','',title));const items=figure.map?.[key]||[]; if(items.length&&items.every(i=>typeof i==='object'&&Number.isFinite(i.x)&&Number.isFinite(i.y))) { const svg=svgNode('svg',{viewBox:'0 0 400 280',role:'img','aria-label':title});svg.append(svgNode('rect',{x:0,y:0,width:400,height:280,fill:'#f5f8ee',stroke:'#829983'}));items.forEach(i=>{svg.append(svgNode('circle',{cx:20+Math.min(100,Math.max(0,i.x))*3.6,cy:20+Math.min(100,Math.max(0,i.y))*2.2,r:4,fill:'#315b45'}),svgNode('text',{x:20+Math.min(100,Math.max(0,i.x))*3.6,y:12+Math.min(100,Math.max(0,i.y))*2.2,'font-size':10,'text-anchor':'middle'},i.name||i.label));});part.append(svg); } else { part.append(el('p','course-small','材料未提供坐标，以下按原始描述呈现；不推测方位。'));items.forEach(i=>part.append(el('p','',typeof i==='string'?i:JSON.stringify(i)))); } grid.append(part); }box.append(grid); }
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
      const groups=[];let cursor=0;String(text||'').split(/\n\s*\n/).filter(Boolean).forEach((paragraph,index)=>{const p=el('p','',paragraph);if(selectable){p.dataset.aiReading='true';p.dataset.aiParagraph=String(index+1);}container.append(p);groups.push({index:index+1,text:paragraph});cursor+=paragraph.length;});
      root.dispatchEvent(new CustomEvent('ielts:material',{detail:selectable?{materialId:material.id,mode:'practice',lesson:{title:material.title,text:String(text||'')},groups}:null}));
    }
    function renderAudio() {
      const box=$('courseAudio');box.replaceChildren();if(material.skill!=='listening')return;
      const owner=attempt, controls=el('div','course-audio-controls'),note=el('p','course-small');controls.append(note);box.append(controls);
      const hasFile=typeof material.audio==='string'&&material.audio.length>0&&!/^\s*(javascript|data):/i.test(material.audio);
      if(hasFile) {
        const audio=el('audio');audio.preload='metadata';audio.src=material.audio;audioElement=audio;audio.controls=attempt.mode==='practice';controls.append(audio);let played=false;
        const play=button('播放听力',async()=>{if(played&&attempt.mode==='assessment')return;try{await audio.play();if(storageBroken||attempt!==owner||submittedRecord){audio.pause();return;}played=true;attempt.audioAvailable=true;play.disabled=attempt.mode==='assessment';scheduleSave();}catch(_){note.textContent='音频未能播放，请检查文件或浏览器设置；不会记为已听。';}});controls.append(play);
        audio.addEventListener('ended',()=>{if(storageBroken||attempt!==owner||submittedRecord)return;attempt.audioCompleted=true;attempt.audioAvailable=true;note.textContent='本次音频已播放到结尾。';scheduleSave();});
        audio.addEventListener('error',()=>{if(storageBroken||attempt!==owner||submittedRecord)return;attempt.audioAvailable=false;note.textContent='音频文件不可用；本次不能计独立听力通过。';});
        if(attempt.mode==='practice')audio.addEventListener('seeking',()=>assistance('hint'));
        note.textContent=(material.audioVoice?'合成音频：'+material.audioVoice+'。':'本地课程音频。')+(attempt.mode==='assessment'?'测评只开放一次播放，不显示原文。':'练习可重播。');
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
    function renderOutput() {
      const box=$('courseOutput');box.replaceChildren();const skill=task.id;if(['writing','speaking'].includes(skill))box.append(el('p','course-feedback',[material.prompt,material.instructions].filter(Boolean).join('\n')));if(!['writing','speaking','vocabulary','reflection'].includes(skill))return;
      const label=el('label','course-output-label',skill==='speaking'?'口语转写（手动整理；不能替代录音或发音评价）':skill==='vocabulary'?'词汇输出：每行一个词、语境释义和自己的例句':skill==='reflection'?'复盘：写下本次错误、依据、订正与下一次复测计划':'写作原稿'),text=el('textarea','course-output-text'),count=el('p','course-small');text.maxLength=10000;text.value=skill==='speaking'?attempt.transcript:attempt.text;const update=()=>{if(skill==='speaking')attempt.transcript=text.value;else attempt.text=text.value;count.textContent=A.countWords(text.value)+' 个英文词'+(material.minWords?' · 本题最低 '+material.minWords+' 词':'');scheduleSave();};text.addEventListener('input',update);label.append(text);box.append(label,count);count.textContent=A.countWords(text.value)+' 个英文词';
      if(skill==='speaking') {
        const diagnosis=el('p','course-small','提交后可选择文字复核，或将全部原始录音送 Omni 逐段听音后再做两轮四维 AI 估计。未配置听音服务或证据不足时，发音与流利度待验证；录音归档本身不是评分。');const link=el('a','','打开口语诊断与录音库');link.href='口语练习.html'+(preview?'?preview=1':'');diagnosis.append(' ',link);box.append(diagnosis);
        const controls=el('div','course-recording-controls'),status=el('p','course-small'),list=el('div');
        const start=button('开始录音',async()=>{if(!root.navigator.mediaDevices?.getUserMedia||!root.MediaRecorder||!root.IELTSMediaLibrary){status.textContent='当前浏览器不支持录音；请从本地服务用支持麦克风的浏览器打开。';return;}try{const requestedAttempt=attempt,requestedProfile=profileId;stream=await root.navigator.mediaDevices.getUserMedia({audio:true});if(storageBroken||!attempt||attempt!==requestedAttempt||profileId!==requestedProfile||(root.IELTSProfiles?.current().id||'legacy')!==requestedProfile||submittedRecord){stream.getTracks().forEach(t=>t.stop());return;}const capturedStream=stream,localChunks=[],localRecorder=new MediaRecorder(capturedStream),localStarted=Date.now();recorder=localRecorder;const attemptId=attempt.id,profile=profileId,originalTitle=material.title;localRecorder.ondataavailable=e=>{if(e.data.size)localChunks.push(e.data);};localRecorder.onstop=async()=>{recordingSaving=true;const blob=new Blob(localChunks,{type:localRecorder.mimeType||'audio/webm'}),durationSeconds=Math.min(900,(Date.now()-localStarted)/1000);capturedStream.getTracks().forEach(t=>t.stop());start.disabled=false;stop.disabled=true;if(storageBroken||profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile){status.textContent='档案已切换，旧录音不会写入另一档案。';recordingSaving=false;return;}try{const entry=await root.IELTSMediaLibrary.create({kind:'audio',name:originalTitle+' 原始录音',durationSeconds},blob);if(storageBroken||profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile){recordingSaving=false;return;}const reference={id:entry.id,name:entry.name||originalTitle,mime:blob.type,durationSeconds};if(!attempt||attempt.id!==attemptId||submittedRecord){mutate(s=>{const draft=s.drafts[attemptId];if(draft&&!draft.media.some(m=>m.id===entry.id))draft.media.push(reference);});recordingSaving=false;return;}attempt.media.push(reference);scheduleSave();status.textContent='录音已在本档案离线保存。';showMedia(list);}catch(error){status.textContent='录音保存失败：'+error.message;}finally{recordingSaving=false;}};localRecorder.start();start.disabled=true;stop.disabled=false;status.textContent='正在录音，最多 15 分钟。';setTimeout(()=>{if(localRecorder.state==='recording'){recordingSaving=true;localRecorder.stop();}},900000);}catch(_){status.textContent='无法使用麦克风，请检查浏览器授权与设备。';}});
        start.disabled=Boolean(submittedRecord);const stop=button('停止并保存录音',()=>{if(recorder?.state==='recording'){recordingSaving=true;recorder.stop();}});stop.disabled=true;controls.append(start,stop);box.prepend(controls,status,list);showMedia(list);
      }
    }
    async function showMedia(container) { container.replaceChildren();for(const ref of attempt?.media||[]) {const entry=await root.IELTSMediaLibrary?.get(ref.id);if(!entry?.blob){container.append(el('p','course-small','录音引用存在，但音频未在本机找到：'+ref.name));continue;}const audio=el('audio');audio.controls=true;audio.src=URL.createObjectURL(entry.blob);container.append(el('p','course-small',ref.name+' · '+Math.round(ref.durationSeconds)+' 秒'),audio);}}
    function renderSession() {
      root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:attempt.mode==='assessment'&&!submittedRecord}}));
      $('courseStart').hidden=true;$('courseSession').hidden=false;for(const id of ['courseFigure','courseAudio','coursePassage','courseQuestions','courseOutput'])$(id).hidden=false;$('courseResult').hidden=true;$('courseResult').replaceChildren();$('courseSubmit').disabled=false;$('courseSubmitStatus').textContent='';$('coursePause').textContent=running?'暂停':'继续';$('courseSessionMode').textContent=attempt.mode==='assessment'?'独立测评':'练习';renderExposure();$('courseFigure').replaceChildren();renderFigure(material.figure,$('courseFigure'));$('coursePassage').replaceChildren();if(material.skill!=='listening')renderPassage(material.passage||'',attempt.mode==='practice'&&material.pool!=='final');renderAudio();renderQuestions();renderOutput();advanceTimer();
    }
    async function submit() {
      if(!attempt||submittedRecord||busy||storageBroken)return;if(recordingSaving||recorder?.state==='recording'){notice('请先停止并保存录音，再提交原稿。',true);return;}
      advanceTimer();const objective=task.id===material.skill&&['reading','listening','grammar'].includes(task.id);const grade=A.gradeMaterial(material,attempt.answers);
      if(objective&&!grade.answered||!objective&&!attempt.text.trim()&&!attempt.transcript.trim()&&!attempt.media.length){notice('请先留下真实答案、文字输出或录音。空白记录不会提交。',true);return;}
      running=false;attempt.submittedAt=new Date().toISOString();busy=true;$('courseSubmit').disabled=true;
      try{const input=toRecord(attempt,material,R.currentDay(),A);const submittingId=attempt.id,submitGeneration=generation;const result=await R.record(input);if(generation!==submitGeneration||attempt?.id!==submittingId)return;submittedRecord=result.record;root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:false}}));try{mutate(s=>{delete s.drafts[submittingId];if(['writing','speaking'].includes(input.skill))s.queue[result.record.id]={recordId:result.record.id,at:new Date().toISOString()};});}catch(error){notice('原稿已经进入作品记录；草稿清理／待评索引未更新：'+error.message+'。刷新后可从最近作品继续。',true);}$('courseSubmitStatus').textContent='原稿已保存。实际 '+(input.activeSeconds/60).toFixed(1)+' 分钟；不会自动完成整项日程。';doc.querySelectorAll('#courseQuestions input,#courseQuestions textarea,#courseOutput textarea').forEach(n=>n.disabled=true);showResult(result.record);refreshHistory();}
      catch(error){$('courseSubmitStatus').textContent='未完成保存：'+error.message+'。原稿保留在页面，可重试。';$('courseSubmit').disabled=false;}
      finally{busy=false;}
    }
    function showResult(record) {
      const box=$('courseResult');box.hidden=false;box.replaceChildren(el('h3','','原稿结果与下一步'));const m=materialMap.get(record.materialId),artifact=A.decodeArtifact(record);if(!m||!artifact)return;
      const objective=['reading','listening','grammar'].includes(record.skill)&&record.skill===m.skill,grade=A.gradeMaterial(m,artifact.answers);
      if(objective){box.append(el('p','course-feedback','原始正确数 '+grade.correct+' / '+grade.total+'。这是原创材料内部核对，不直接换算官方 Band。'));grade.items.forEach(item=>{const details=el('details');details.dataset.result=item.correct?'correct':'incorrect';details.append(el('summary','',(item.correct?'✓ ':'待订正 ')+item.id+' · 展开答案与依据'),el('p','','参考答案：'+item.expected.join(' / ')),el('p','','解释：'+item.explanation),el('p','','原文依据：'+item.evidence));box.append(details);});}
      if(artifact.mode==='assessment'){const evidence=A.evidenceFor(record,m,{final:m.pool==='final'});box.append(el('p','course-small',evidence.pass?'本份符合内部独立测评条件。':'当前不计独立通过：'+evidence.reasons.join('；')));}
      renderReview(A.decodeReview(record),box);const reviewData=A.decodeReview(record);if(reviewData?.fullReviewArchiveId){box.append(button('导出完整原稿与本次评阅归档',async()=>{try{const entry=await root.IELTSMediaLibrary.get(reviewData.fullReviewArchiveId);if(!entry)throw Error('本机未找到完整归档，请恢复音频／作品备份。');root.IELTSMediaLibrary.download(new Blob([JSON.stringify(entry,null,2)],{type:'application/json'}),'IELTS-完整评阅-'+record.id+'.json');}catch(error){notice(error.message,true);}}));}
      if(record.skill==='speaking'){
        const config=el('p','course-small','Omni 配置状态：正在读取本地服务…'),settings=el('a','','打开 AI 设置');settings.href='AI设置.html'+(preview?'?preview=1':'');box.append(config,settings);
        if(root.location.origin!=='http://127.0.0.1:8765'||!root.fetch)config.textContent='Omni 配置状态：需从本地服务打开。当前口语发音与流利度待验证。';
        else{const checking=new AbortController(),timer=setTimeout(()=>checking.abort(),5000);root.fetch('/api/omni/status',{signal:checking.signal,credentials:'same-origin',redirect:'error',cache:'no-store'}).then(r=>r.json()).then(s=>{config.textContent=s.configured===true?'Omni 已配置：'+String(s.model||'')+'。完整原音将发送给此服务；它的听音观察与后续两轮分数均为 AI 训练估计。':'Omni 尚未配置：完整听音与四维估计暂不可用；可以先保存原音和做文字复核，发音及流利度保持待验证。';}).catch(()=>{config.textContent='Omni 配置状态暂不可读。原稿与录音仍可本机保存；未验证的音频维度不出分。';}).finally(()=>clearTimeout(timer));}
      }
      const actions=el('div','course-actions');if(['writing','speaking'].includes(record.skill))actions.append(button(record.skill==='speaking'?'仅按文字做两轮复核':'两轮 AI 复核原稿',()=>review(record)));if(record.skill==='speaking')actions.append(button(m.rubric?.taskType==='foundation'?'原音观察 + 两轮阶段反馈（不出 Band）':'完整原音听音 + 两轮四维评阅',()=>review(record,true)));actions.append(button('建立订正版本',()=>{showMaterial(m);begin({parentId:record.id,kind:'correction',mode:'practice'});}));
      const alternatives=data.materials.filter(v=>v.skill===m.skill&&v.id!==m.id&&(m.assessmentGroup?v.assessmentGroup===m.assessmentGroup&&v.form!==m.form:v.week===m.week));const retest=A.retestAvailability(record,alternatives);if(alternatives.length){const select=el('select');alternatives.forEach(v=>{const o=el('option','',v.title+' · '+(v.form||''));o.value=v.id;select.append(o);});actions.append(select,button(retest.due?'开始新题复测':'提前做新题练习',()=>{const target=materialMap.get(select.value);showMaterial(target);begin({parentId:record.id,kind:'retest',mode:retest.due?'assessment':'practice'});}));}box.append(actions,el('p','course-small',retest.message+(retest.dueAt?' · 最早 '+new Date(retest.dueAt).toLocaleString():'')));
    }
    function renderReview(reviewData, box) {
      if(!reviewData)return;if(reviewData.audioSource?.mediaRanges?.length)box.append(el('p','course-small','听音时点按全部原音的拼接顺序表示：'+reviewData.audioSource.mediaRanges.map((range,i)=>'原音 '+(i+1)+' 为 '+Number(range.startSeconds).toFixed(1)+'–'+Number(range.endSeconds).toFixed(1)+' 秒').join('；')+'。片段切换不代表学习者停顿。'));box.append(el('p','course-small',(reviewData.disclaimer||'同一模型两轮意见不是独立人工评分。')+' · 状态 '+reviewData.status));
      (reviewData.rounds||[]).forEach(round=>{const details=el('details','course-review-round');details.append(el('summary','','第 '+round.round+' 轮'+(round.ok?'':' · 暂不可用')));if(!round.ok){details.append(el('p','','本轮未完成，原稿仍保留。'));}else{details.append(el('p','',round.summary||''));(round.criteria||[]).forEach(c=>{details.append(el('p','',c.id+'：'+(typeof c.band==='number'?c.band+'（AI 估计）':'待验证')+'。'+c.comment));(c.evidence||[]).forEach(e=>details.append(el('blockquote','',e.quote+' — '+e.comment)));(c.audioEvidence||[]).forEach(e=>details.append(el('blockquote','course-acoustic-evidence','原音 '+(Number.isFinite(e.startSeconds)?e.startSeconds.toFixed(1):'?')+'–'+(Number.isFinite(e.endSeconds)?e.endSeconds.toFixed(1):'?')+' 秒：'+e.quote+' — '+e.comment)));});if(round.levelCheck)details.append(el('p','','阶段目标：'+(round.levelCheck.meetsGoal===true?'本轮认为符合':round.levelCheck.meetsGoal===false?'仍需补强':'证据不足')+'；'+(round.levelCheck.gaps||[]).join('；')));(round.corrections||[]).forEach(c=>details.append(el('p','',c.original+' → '+c.revised+'；'+c.reason)));details.append(el('p','course-small',round.uncertainty||''));}box.append(details);});
    }
    async function review(record,withAudio=false) {
      if(busy||storageBroken)return;const m=materialMap.get(record.materialId),artifact=A.decodeArtifact(record);if(!m||!artifact)return;
      let body;try{body=reviewRequest(m,artifact);}catch(error){notice(error.message,true);return;}
      if(root.location.origin!=='http://127.0.0.1:8765'){notice('AI 复核需要双击“启动学习.cmd”并从本地学习地址打开。原稿已留在待评队列。',true);return;}
      if(withAudio&&record.skill!=='speaking')return;
      const aborter=new AbortController();reviewAbort=aborter;busy=true;const currentGeneration=generation,profile=profileId;
      const cancelButton=button('取消本次评阅',()=>aborter.abort(),'course-review-cancel');$('courseNotice').append(cancelButton);
      const showProgress=message=>{notice(message);$('courseNotice').append(cancelButton);};
      const timer=setTimeout(()=>aborter.abort(),withAudio?1100000:190000);
      showProgress(withAudio?'正在检查 Omni 听音服务配置。将只发送当前已提交原稿关联的全部原音与确认转写。':'正在分别复核同一已提交原稿，两轮互不读取对方意见。');
      try{
        const reviewData=await runReviewPipeline({request:body,record,audio:withAudio,signal:aborter.signal,fetch:root.fetch.bind(root),prepare:(record,signal)=>prepareAudio(record,{signal}),onProgress:showProgress});
        if(profile!==profileId||currentGeneration!==generation||storageBroken)return;
        const {result,proof}=reviewData;let archiveId=null;
        if(root.IELTSMediaLibrary){const entry=await root.IELTSMediaLibrary.create({kind:record.skill==='writing'?'writing':'speaking_text',name:m.title+' · 评阅原稿',originalText:body.text,prompt:body.prompt,mode:reviewData.request.mode,task:body.task,level:body.level,materialId:m.id});archiveId=entry.id;await root.IELTSMediaLibrary.update(entry.id,{review:result,...(proof?{audioReview:proof}:{}),recordsId:record.id,queueStatus:result.status==='complete'?'reviewed':'pending',notes:record.media.length?'原始录音引用：'+record.media.map(v=>v.id).join('、'):''});}
        if(profile!==profileId||currentGeneration!==generation||storageBroken)return;
        const feedback=feedbackForRecord(result,archiveId),candidate={...record,evaluation:{method:'ai',result:'pending',feedback}},evidence=A.evidenceFor(candidate,m,{final:m.pool==='final'});
        const evaluationResult=result.status==='complete'?(evidence.pass?'pass':evidence.pending?'pending':'revise'):'pending';const output=await R.update(record.id,{evaluation:{method:'ai',result:evaluationResult,feedback}},R.makeId('review'));
        if(profile!==profileId||currentGeneration!==generation||storageBroken)return;
        try{mutate(state=>{if(result.status==='complete'&&evaluationResult!=='pending')delete state.queue[record.id];else state.queue[record.id]={recordId:record.id,at:new Date().toISOString()};});}catch(error){notice('原稿及评阅已保存，待评索引更新失败：'+error.message,true);}
        if(submittedRecord?.id===record.id){submittedRecord=output;showResult(output);}
        notice(result.status==='complete'?(withAudio&&result.audioAnalysisEvidence?(body.task==='foundation'?'原音观察与两轮阶段表达目标反馈已保存；基础任务不提供可比 Band。':'完整原音观察与两轮四维 AI 估计已保存。请回听时点核对；同一听音观察被两轮共享，仍可能共同误判。'):'两轮反馈已保存；未完成声学验证的发音与流利度仍待验证。'):'评阅未全部完成，原稿、已返回意见及原音证据均已保留，可重试。');refreshHistory();
      }catch(error){if(currentGeneration!==generation||profile!==profileId)return;notice('评阅未完成：'+(error.name==='AbortError'?'已取消或等待超时。':error.message)+' 原稿和原始录音保留。',true);}
      finally{clearTimeout(timer);cancelButton.remove?.();busy=false;if(reviewAbort===aborter)reviewAbort=null;}
    }
    async function refreshHistory() {
      try{records=await R.list();}catch(error){notice('作品记录无法读取：'+error.message,true);return;}
      const week=data.days.find(d=>d.day===day)?.week||1,prerequisites=prerequisiteStatus(data.materials,records,week,A).filter(item=>!item.pass);
      let prerequisiteBox=$('coursePrerequisites');if(!prerequisiteBox){prerequisiteBox=el('p','course-target');prerequisiteBox.id='coursePrerequisites';$('courseDayTitle').parentElement?.append(prerequisiteBox);}
      prerequisiteBox.hidden=!prerequisites.length;prerequisiteBox.textContent=prerequisites.length?'前置关卡仍未验证：'+prerequisites.map(item=>item.id).join('、')+'。可以提前浏览，但会登记曝光；建议先完成原稿、订正和新题复测，再提高训练难度。':'';
      const actual=records.filter(r=>r.dayNumber===day);$('courseActual').textContent='本日已提交作品实际 '+actual.reduce((n,r)=>n+r.minutes,0).toFixed(1)+' 分钟；有效作品与能力关卡分别判断。';
      $('courseDrafts').replaceChildren();Object.values(state.drafts).filter(d=>!records.some(r=>r.id===d.id)).forEach(d=>{$('courseDrafts').append(button((materialMap.get(d.materialId)?.title||d.materialId)+' · 恢复草稿',()=>{if(storageBroken)return;const m=materialMap.get(d.materialId);if(!m)return;showDay(d.courseDay,d.materialId);task={...task,id:d.taskId};attempt=copy(d);attempt.interrupted||=attempt.mode==='assessment';lastDraftSerialized=JSON.stringify(d);submittedRecord=null;running=false;renderSession();}));});
      $('courseQueue').replaceChildren();Object.values(state.queue).forEach(q=>{const record=records.find(r=>r.id===q.recordId);if(record)$('courseQueue').append(button(record.title+' · 重试评阅',()=>review(record)));});
      $('courseHistory').replaceChildren();records.filter(r=>r.source==='course-player').sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)).slice(0,20).forEach(record=>{const row=el('article','course-record-row');row.append(el('strong','',record.title),el('p','',new Date(record.submittedAt).toLocaleString()+' · '+NAMES[record.skill]+' · '+record.minutes.toFixed(1)+' 分钟 · '+record.kind+' · '+(record.exposure==='unseen'?'开始时未见':'已见／未知')+' · '+record.evaluation.result));row.append(button('查看原稿与后续操作',()=>{const m=materialMap.get(record.materialId);if(!m)return;const artifact=A.decodeArtifact(record);showDay(artifact.courseDay,m.id);task={...task,id:record.skill};material=m;attempt={id:record.id,...artifact,taskId:record.skill,kind:record.kind,parentId:record.parentId,media:record.media,assistance:record.assistance,submittedAt:record.submittedAt,materialId:m.id};submittedRecord=record;running=false;renderSession();$('courseSubmit').disabled=true;doc.querySelectorAll('#courseQuestions input,#courseQuestions textarea,#courseOutput textarea').forEach(n=>n.disabled=true);showResult(record);}));$('courseHistory').append(row);});
      const gates=A.gateMastery(records,data.materials);$('courseGates').replaceChildren();if(!gates.length)$('courseGates').append(el('p','course-small','尚无关卡原稿。完成对应 A 卷后，按错因补强并至少间隔 48 小时换 B 卷。'));
      gates.forEach(g=>{const row=el('article','course-gate-row');row.append(el('strong','',g.id+' · '+g.label),el('p','',g.pass?'已保留 A 卷原稿及至少 48 小时后的未见 B 卷独立复测证据。':g.reasons.join('；')+(g.dueAt?' · B 卷最早开始：'+new Date(g.dueAt).toLocaleString():'')));$('courseGates').append(row);});
      const ready=A.readiness(records,data.materials);$('courseReadiness').replaceChildren(el('strong','',ready.label),el('p','course-small',ready.disclaimer));ready.reasons.forEach(reason=>$('courseReadiness').append(el('p','course-small',reason)));
    }
    $('courseBegin').addEventListener('click',()=>begin());$('courseSubmit').addEventListener('click',submit);$('courseDay').addEventListener('change',()=>showDay($('courseDay').value));$('coursePrevious').addEventListener('click',()=>showDay(Math.max(1,day-1)));$('courseNext').addEventListener('click',()=>showDay(Math.min(364,day+1)));$('courseDiscard').addEventListener('click',()=>{const current=material;showMaterial(current);refreshHistory();});
    $('coursePause').addEventListener('click',()=>{if(submittedRecord)return;advanceTimer();running=!running;for(const id of ['courseFigure','courseAudio','coursePassage','courseQuestions','courseOutput'])$(id).hidden=!running;if(!running&&attempt?.mode==='assessment')attempt.interrupted=true;$('coursePause').textContent=running?'暂停':'继续';renderExposure();persistDraft();});
    doc.addEventListener('visibilitychange',()=>{advanceTimer();if(doc.hidden&&attempt&&!submittedRecord){attempt.interrupted||=attempt.mode==='assessment';persistDraft();}});
    root.addEventListener('ielts:selection-assistance',event=>{if(event.detail?.materialId===material?.id)assistance('ai');});
    root.addEventListener('ielts:records-changed',()=>{if((root.IELTSProfiles?.current().id||'legacy')===profileId)refreshHistory();});root.addEventListener('ielts:profile-changed',()=>{advanceTimer();running=false;stopMedia();reviewAbort?.abort();generation++;storageBroken=true;$('courseBegin').disabled=true;$('courseSubmit').disabled=true;notice('学习档案已切换。当前未保存输入仍在本页，请先复制保留，再刷新；不会写入其他档案。',true);});
    root.addEventListener('pagehide',()=>{advanceTimer();if(attempt&&!submittedRecord){attempt.interrupted||=attempt.mode==='assessment';persistDraft();}stopMedia();reviewAbort?.abort();});
    setInterval(advanceTimer,1000);load();const linkedMaterial=materialMap.get(params.get('material'));const mappedDay=linkedMaterial?data.days.find(d=>d.tasks.some(t=>t.materialIds.includes(linkedMaterial.id)))?.day:null;const initialDay=Number(params.get('day'))||mappedDay||R.currentDay()||state.day;showDay(Math.min(364,Math.max(1,initialDay)),params.get('material'));refreshHistory().then(()=>{if(!pendingParent)return;const parent=records.find(r=>r.id===pendingParent.parentId);if(!parent){notice('关联原稿未找到，请从作品记录重新打开。',true);pendingParent=null;return;}const matching=data.days.find(d=>d.day===day)?.tasks.find(t=>t.id===parent.skill);if(matching)showTask(matching,params.get('material'));notice('已关联原稿「'+parent.title+'」。选择同技能材料后点击开始，将保存'+(pendingParent.kind==='retest'?'复测':'订正')+'版本。'+(!materialMap.has(parent.materialId)?'原材料来自其他练习模块，请选择课程内同技能材料。':''));});
  }
  const api={KEY,newState,parseState,mergeState,taskFor,prerequisiteStatus,figureRows,figurePanels,planGeometry,reviewRequest,prepareAudio,audioSource,runReviewPipeline,feedbackForRecord,toRecord};root.IELTSCoursePlayer=Object.freeze(api);if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document?.getElementById('coursePlayerApp'))init();
})(typeof window!=='undefined'?window:globalThis);
