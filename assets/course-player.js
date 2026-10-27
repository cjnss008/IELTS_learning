(function (root) {
  'use strict';
  const KEY = 'ielts52-course-player-v1';
  const SKILLS = ['vocabulary', 'grammar', 'listening', 'reading', 'speaking', 'writing', 'reflection'];
  const NAMES = {vocabulary:'词汇', grammar:'语法', listening:'听力', reading:'阅读', speaking:'口语', writing:'写作', reflection:'复盘'};
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(value) && !['__proto__','constructor','prototype'].includes(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  const MATERIAL_SNAPSHOT_LIMIT = 60000;
  const MATERIAL_FIELDS = ['id','version','title','skill','type','week','level','pool','fullTest','estimatedMinutes','timeLimitSeconds','instructions','questionCount','questions','assessmentGroup','form','rubric','prompt','parts','minWords','maxWords','source','independentBank','figure','passage','transcript','reference','vocabulary','grammar','grammarFocus','transfer','contextMaterialId','contextPassage','lexicalContext','lexicalTraining','sourceMaterialId','requireAudioHash','audio','audioVoice','audioVoices','audioLocale','audioAccent','audioSynthetic','audioKind','audioProvider','audioDurationSeconds','audioVoiceSource','audioRequirements','captionFile','transcriptScope','taskContract'];
  const assessmentAPI = () => root.IELTSAssessment || (typeof require === 'function' ? require('./assessment-core.js') : null);
  const contextPracticeAPI=()=>root.IELTSPublicContextPractice||(typeof require==='function'?require('./public-context-practice.js'):null);
  const lessonSupplementAPI=()=>root.IELTSLessonVocabularySupplement||(typeof require==='function'?require('./lesson-vocabulary-supplement.js'):null);
  function yearCourseAPI(){return root.IELTSYearFirstUseCourse||(typeof require==='function'?require('./year-first-use-course.js'):null);}
  function resolveCourseMaterial(data,id,options={}){return data?.materials?.find(m=>m.id===id)||(options.contextPractice||contextPracticeAPI())?.resolveMaterial?.(id,{data})||(options.yearCourse||root.IELTSYearFirstUseCourse)?.resolveMaterial?.(id)||null;}
  function cleanMaterialBinding(binding, materialId) {
    const api=assessmentAPI(),invalid=()=>{throw Error('材料版本快照无法核验，已保留原稿；不会套用当前新题。');};
    if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).some(key=>!['schema','contentHash','gradingPolicy','material','legacyProof'].includes(key))||!api?.resolveArtifactMaterial||!binding.material||Object.keys(binding.material).some(key=>!MATERIAL_FIELDS.includes(key)))invalid();
    const material=binding.material;
    if(!validId(material.id)||materialId&&material.id!==materialId||!SKILLS.includes(material.skill)||!['string','number'].includes(typeof material.version)||String(material.version).length>100||typeof material.title!=='string'||material.title.length>240||!Array.isArray(material.questions)||material.questions.length>200||JSON.stringify(material).length>MATERIAL_SNAPSHOT_LIMIT)invalid();
    for(const question of material.questions)if(question.displayOrder!==undefined&&(!Array.isArray(question.options)||!Array.isArray(question.displayOrder)||question.displayOrder.length!==question.options.length||new Set(question.displayOrder).size!==question.options.length||question.displayOrder.some(index=>!Number.isInteger(index)||index<0||index>=question.options.length)))invalid();
    if(material.taskContract!==undefined){const task=material.taskContract;if(!task||typeof task!=='object'||Array.isArray(task)||Object.keys(task).some(key=>!['id','mode','instructions','deliverable','minutes','quantity','unit'].includes(key))||!SKILLS.includes(task.id)||task.mode!==undefined&&!['practice','assessment'].includes(task.mode))invalid();}
    if(binding.legacyProof!==undefined){const proof=binding.legacyProof;if(!proof||typeof proof!=='object'||Array.isArray(proof)||Object.keys(proof).some(key=>!['proofId','contractHash','evidenceScope'].includes(key))||Object.entries(proof).some(([key,value])=>typeof value!=='string'||value.length>(key==='evidenceScope'?1000:160)))invalid();}
    const objective=['reading','listening','grammar'].includes(material.skill),resolved=api.resolveArtifactMaterial(null,{materialVersion:String(material.version),gradingPolicy:binding.gradingPolicy,...(objective?{objectiveGrading:binding.gradingPolicy}:{}),materialBinding:binding});
    if(!resolved.valid)invalid();return copy(binding);
  }
  function freezeMaterialBinding(material, options={}) {
    const api=options.assessment||assessmentAPI();if(!material||!api?.materialContentHash)throw Error('材料版本核对组件尚未加载，当前输入保留。');
    const snapshot={};for(const key of MATERIAL_FIELDS)if(material[key]!==undefined&&!['taskContract','passage','transcript','vocabulary','grammar','transfer','reference'].includes(key))snapshot[key]=copy(material[key]);
    snapshot.version=String(material.version??'1');snapshot.questions=copy(material.questions||[]);
    if(options.attemptId)for(const question of snapshot.questions)if(['single','multi'].includes(question.type)){const used=new Set();question.displayOrder=api.displayOptions(question,material.id,options.attemptId).map(option=>{const index=question.options.findIndex((value,n)=>value===option&&!used.has(n));used.add(index);return index;});}
    if(material.skill!=='listening'&&typeof material.passage==='string')snapshot.passage=material.passage;
    if(material.skill==='listening'&&typeof material.transcript==='string')snapshot.transcript=material.transcript;
    if(material.skill==='vocabulary'){
      const V=options.vocabulary||root.IELTSVocabularyPractice||(typeof require==='function'?require('./vocabulary-practice.js'):null),words=V?.wordsFor?.(material,{curriculumData:options.data,courseData:options.courseData})||material.vocabulary||[];
      snapshot.vocabulary=copy(words).map(word=>{const out={};for(const key of ['word','meaning','ipa','ipaAccent','example','audio','pos'])if(word[key]!==undefined)out[key]=word[key];return out;});
    }
    if(material.skill==='grammar'){if(material.grammar!==undefined)snapshot.grammar=copy(material.grammar);if(material.transfer!==undefined)snapshot.transfer=copy(material.transfer);}
    if(material.skill==='speaking')snapshot.reference=modelReadingReference(material,options.data,options.courseDay);
    else if(material.reference!==undefined)snapshot.reference=copy(material.reference);
    const task=options.task||material.taskContract;if(task){snapshot.taskContract={};for(const key of ['id','mode','instructions','deliverable','minutes','quantity','unit'])if(task[key]!==undefined)snapshot.taskContract[key]=copy(task[key]);}
    const binding={schema:1,contentHash:api.materialContentHash(snapshot),gradingPolicy:options.gradingPolicy||(['reading','listening','grammar'].includes(snapshot.skill)?'canonical-v2':'existing-subjective-v1'),material:snapshot};
    if(options.legacyProof){binding.legacyProof={};for(const key of ['proofId','contractHash','evidenceScope'])if(typeof options.legacyProof[key]==='string')binding.legacyProof[key]=options.legacyProof[key];}
    return cleanMaterialBinding(binding,material.id);
  }
  function resolveDraftMaterial(draft, currentMaterial, options={}) {
    const blocked=reason=>({compatible:false,material:null,reason:reason||'这份旧草稿尚无可核验的原材料版本。输入、原音和时长已保留，可先查看或下载原稿。'});
    if(!draft||!validId(draft.materialId))return blocked();
    if(draft.materialBinding!==undefined){try{const binding=cleanMaterialBinding(draft.materialBinding,draft.materialId);if(binding.material.taskContract&&binding.material.taskContract.id!==draft.taskId)return blocked('草稿任务与冻结材料合同不一致，原稿保留。');return{compatible:true,material:binding.material,binding,legacy:false};}catch(error){return blocked(error.message);}}
    const api=options.assessment||assessmentAPI(),index=options.legacyMaterials||root.IELTSLegacyMaterialCompatibility;
    const proof=api?.proveLegacyMaterial?.(draft,currentMaterial,index);
    if(proof?.compatible===true&&proof.material)return{compatible:true,material:proof.material,legacy:true,gradingPolicy:'legacy-normalized-v1',legacyProof:proof};
    return blocked(proof?.reason);
  }
  function bindDraftMaterial(draft, currentMaterial, options={}) {
    const resolved=resolveDraftMaterial(draft,currentMaterial,options);if(!resolved.compatible)throw Error(resolved.reason);
    if(!resolved.legacy)return{draft:copy(draft),material:resolved.material};
    const next=copy(draft);next.materialBinding=freezeMaterialBinding(resolved.material,{...options,attemptId:draft.id,courseDay:draft.courseDay,gradingPolicy:['reading','listening','grammar'].includes(resolved.material.skill)?'legacy-normalized-v1':'existing-subjective-v1',legacyProof:resolved.legacyProof});
    return{draft:next,material:next.materialBinding.material};
  }
  function materialForRecord(record, currentMaterial, assessment=assessmentAPI()) {
    const artifact=assessment?.decodeArtifact?.(record);if(!artifact)return null;
    if(artifact.materialBinding===undefined){const proof=assessment?.proveLegacyMaterial?.({...artifact,materialId:record.materialId,materialVersion:record.materialVersion,taskId:record.taskId||record.skill,startedAt:record.startedAt,text:record.skill==='vocabulary'?JSON.stringify(artifact):artifact.text||''},currentMaterial,root.IELTSLegacyMaterialCompatibility);return proof?.compatible?proof.material:null;}
    const resolved=assessment.resolveArtifactMaterial?.(currentMaterial,artifact,record);return resolved?.valid?resolved.material:null;
  }
  function bindingMatchesMaterial(record,material,api=assessmentAPI()){
    try{
      const artifact=api.decodeArtifact(record),binding=artifact?.materialBinding;if(!binding||!api.resolveArtifactMaterial(material,artifact,record).valid)return false;
      const clean=value=>{const out=copy(value);delete out.taskContract;for(const q of out.questions||[])delete q.displayOrder;return out;};
      // Compare the same projection used by the player. The full canonical
      // material hash belongs to the assignment; taskContract/displayOrder are
      // per-attempt additions and cannot substitute for that canonical hash.
      const expected=freezeMaterialBinding(material,{assessment:api,gradingPolicy:binding.gradingPolicy});
      return api.materialContentHash(clean(binding.material))===api.materialContentHash(clean(expected.material));
    }catch(_){return false;}
  }
  function cleanDayPlanBinding(binding,dayNumber){
    const adaptive=root.IELTSAdaptivePlan||(typeof require==='function'?require('./adaptive-plan.js'):null);
    if(!adaptive?.validDayBinding?.(binding,dayNumber))throw Error('本日任务快照无法核验；原稿保留，不套用更新后的任务。');
    return copy(binding);
  }
  function freezeDayPlanBinding(day,api=assessmentAPI()){
    if(day?.day<2||day?.day>364||!day?.publicCourse?.assignments?.length&&!day?.publicContextPractice?.assignments?.length&&!day?.lessonFlow&&!day?.familyGrammar)return null;
    const value=copy(day);return cleanDayPlanBinding({schema:1,contentHash:api.materialContentHash(value),day:value},day.day);
  }

  function taskDisplayText(value,skill,minutes){
    if(typeof value!=='string')return value;
    if(Number.isFinite(minutes)&&minutes>0){
      const steps=value.replace(/^参考预算\s*\d+(?:\.\d+)?\s*分钟[：:]?\s*/, '').replace(/(^|[；;，,]\s*)\d+(?:\.\d+)?\s*分钟/g,'$1');
      value='本模块参考预算 '+minutes+' 分钟；各步骤共用此预算，可按实际进度调整。\n'+steps;
    }
    if(skill!=='speaking')return value;
    return value.replace(/回听(?:及|并|和)核对转写/g,'回听原音并查看反馈').replace(/原音[、，,]\s*转写[、，,]\s*问题定位[与和及]重录/g,'原音、专业评测、问题定位与重录').replace(/保留原音和转写，回听定位问题/g,'保留原音并查看反馈，回听定位问题').replace(/三部分原音、转写及待改进点/g,'三部分原音、听音反馈及待改进点').replace(/转写与音频诊断分别复核/g,'回听原音并查看反馈，自动听音证据不足时保持待评');
  }
  async function prepareStudyDayEnd({isCurrent=()=>true,busy=false,recording=false,recordingSaving=false,mediaStates=[],checkpoint=()=>true}={}) {
    if (!isCurrent()) throw Error('学习档案或当前任务已改变，请保留输入并刷新后再结束今日学习。');
    if (recording || recordingSaving || mediaStates.some(s=>s?.busy===true||['requesting','recording','saving','assessing','coaching'].includes(s?.phase))) throw Error('请先结束当前录音并等待原音保存或评测完成，再结束今日学习；当前录音不会被取消。');
    if (busy) throw Error('当前正在保存或评阅，请等待本次操作完成，再结束今日学习；已有原稿保留。');
    if (await checkpoint() === false) throw Error('当前草稿尚未成功保存，今天尚未结束；请保留输入并重试保存。');
    if (!isCurrent()) throw Error('保存期间档案或任务已改变，今天尚未结束；请刷新后核对。');
    return true;
  }
  function newState() { return {schema:1, day:1, selectedCourseDay:null, exposures:{}, drafts:{}, queue:{}}; }
  function draftProgress(draft,material) {
    const empty={compatible:!material||draft?.materialId===material.id,score:[0,0,0,0,0],label:'尚未填写作答'};
    if(!draft||material&&draft.materialId!==material.id)return{...empty,compatible:false};
    const bound=resolveDraftMaterial(draft,material);empty.materialVerified=bound.compatible;empty.restorable=bound.compatible;if(bound.compatible)material=bound.material;else if(draft.materialBinding!==undefined)return{...empty,compatible:false,label:'材料快照待核对，输入已保留'};
    // Progress ranking keeps unproven legacy input visible. Actual resume and
    // submission separately require a verified original-material binding.
    if(draft.taskId!=='vocabulary'){
      const answers=Object.values(draft.answers||{}).filter(value=>Array.isArray(value)?value.length:typeof value==='string'&&value.trim()).length,text=typeof draft.text==='string'&&draft.text.trim()?1:0,transcript=typeof draft.transcript==='string'&&draft.transcript.trim()?1:0,media=Array.isArray(draft.media)?draft.media.length:0;
      return{...empty,score:[0,answers+text+transcript,media,0,0],label:answers||text||transcript||media?'已保留'+(answers?' '+answers+' 项作答':'')+(text||transcript?' · 文字原稿':'')+(media?' · '+media+' 份原音':''):'尚未填写作答'};
    }
    if(!draft.text)return{...empty,label:'词汇学习尚未开始输入'};
    let value;try{value=JSON.parse(draft.text);}catch(_){return{...empty,compatible:false,label:'词汇原稿待核对，已保留'};}
    if(!value||value.kind!=='vocabulary-practice-draft'||![1,2].includes(value.schema)||value.materialId!==draft.materialId||material&&String(value.materialVersion)!==String(material.version||'1'))return{...empty,compatible:false,label:'旧材料版本或不匹配的词汇原稿，已保留'};
    const modes=value.schema===1?['meaning','completion','dictation']:['completion','meaning','dictation'],count=Array.isArray(value.wordKeys)?Math.min(100,value.wordKeys.length):0,cap=count||100;
    const filled=mode=>Math.min(cap,Object.values(value.answers?.[mode]||{}).filter(answer=>typeof answer==='string'&&answer.trim()).length),rounds=Math.min(3,Array.isArray(value.roundSubmittedAt)?value.roundSubmittedAt.length:0),answers=modes.reduce((n,mode)=>n+filled(mode),0),studyCount=key=>Math.min(cap*3,Array.isArray(value.study?.[key])?value.study[key].reduce((n,items)=>n+(Array.isArray(items)?Math.min(3,items.length):0),0):0),spellings=studyCount('s'),recordings=studyCount('w'),inputs=Array.isArray(value.study?.input)?value.study.input.filter(input=>typeof input==='string'&&input.trim()).length:0,audio=Math.min(cap,Object.values(value.audio||{}).filter(proof=>proof?.completed===true).length);
    const names={completion:'补全单词',meaning:'中文写英文',dictation:'听写'},mode=modes.includes(value.phase)?value.phase:null;
    const label=value.phase==='complete'?'三轮已完成，原稿待提交':value.phase==='feedback'?'已提交 '+rounds+'/3 轮，查看反馈后继续':mode?'恢复第 '+(modes.indexOf(mode)+1)+' 轮'+names[mode]+' · 已填 '+filled(mode)+'/'+count+' 词':'学习进度：拼写 '+spellings+'/'+(count*3)+' · 原音引用 '+recordings+'/'+(count*3);
    return{compatible:true,score:[rounds,answers,spellings+recordings,inputs,audio],label};
  }
  function preferredDraft(drafts,options={}) {
    const submitted=new Set((options.records||[]).map(record=>record.id)),materialId=options.materialId||options.material?.id;
    const bound=draft=>options.material||options.materialFor?.(draft.materialId),candidates=(drafts||[]).filter(draft=>draft&&!submitted.has(draft.id)&&(options.courseDay===undefined||draft.courseDay===options.courseDay)&&(!options.taskId||draft.taskId===options.taskId)&&(!materialId||draft.materialId===materialId)&&(!options.profileId||!draft.profileId||draft.profileId===options.profileId)&&draftProgress(draft,bound(draft)).compatible);
    return candidates.sort((a,b)=>{const left=draftProgress(a,bound(a)).score,right=draftProgress(b,bound(b)).score;for(let i=0;i<left.length;i++){if(left[i]!==right[i])return right[i]-left[i];}return String(b.startedAt||'').localeCompare(String(a.startedAt||''))||String(a.id).localeCompare(String(b.id));})[0]||null;
  }
  function vocabularyPlanDifference(material,dayNumber,data,options={}){
    if(dayNumber<=1||material?.skill!=='vocabulary')return null;const api=options.vocabulary||root.IELTSVocabularyPractice||(typeof require==='function'?require('./vocabulary-practice.js'):null),previousBase=data?.days?.find(day=>day.day===dayNumber-1);if(!api?.wordsFor||!previousBase)return null;
    const previous=options.getDay?.(previousBase)||previousBase,map=new Map((data.materials||[]).map(item=>[item.id,item])),words=api.wordsFor(material,{curriculumData:data}),known=new Set((previous.tasks.find(task=>task.id==='vocabulary')?.materialIds||[]).flatMap(id=>api.wordsFor(map.get(id),{curriculumData:data})).map(word=>word.word.trim().toLowerCase())),wordHistory={},fresh=[],review=[];
    words.forEach((word,index)=>{const revisited=known.has(word.word.trim().toLowerCase());wordHistory[word.word.trim().toLowerCase()]=revisited?'review':'new';(revisited?review:fresh).push(index);});return{previousDay:previous.day,total:words.length,newCount:fresh.length,reviewCount:review.length,learningOrder:[...fresh,...review],wordHistory};
  }
  function vocabularyTaskSummary(task,data,options={}){
    if(task?.id!=='vocabulary')return null;
    const vocabulary=options.vocabulary||root.IELTSVocabularyPractice||(typeof require==='function'?require('./vocabulary-practice.js'):null),map=new Map((data?.materials||[]).map(m=>[m.id,m])),seen=new Set(),groups=[];
    const flow=root.IELTSCourseExpansion||(typeof require==='function'?require('./course-expansion.js'):null),displayIds=Number.isInteger(options.day)?flow?.orderedMaterialIds?.(task,options.day)||task.materialIds:task.materialIds;for(const id of displayIds||[]){const material=options.currentMaterial?.id===id?options.currentMaterial:map.get(id);if(!material)return null;const words=vocabulary?.wordsFor?.(material,{curriculumData:data})||material.vocabulary||[],keys=words.map(word=>String(typeof word==='string'?word:word.word||'').normalize('NFKC').trim().toLowerCase()).filter(Boolean);keys.forEach(word=>seen.add(word));groups.push({materialId:id,title:material.title,wordCount:keys.length});}
    return{groupCount:groups.length,wordCount:seen.size,practiceWordCount:groups.reduce((sum,group)=>sum+group.wordCount,0),groups};
  }
  function vocabularyLessonOutline(task,data,options={}){
    const day=Number(options.day);if(task?.id!=='vocabulary'||!Number.isInteger(day)||day<2||day>10)return null;
    const api=options.vocabulary||root.IELTSVocabularyPractice||(typeof require==='function'?require('./vocabulary-practice.js'):null),map=new Map((data?.materials||[]).map(item=>[item.id,item])),required=new Set(task.materialIds||[]),ids=[...required],declared=data?.days?.find(item=>item.day===day)?.tasks?.find(item=>item.id==='vocabulary');
    for(const id of declared?.materialIds||[]){const item=map.get(id);if(!required.has(id)&&item?.courseExpansion&&item.availableFromDay<=day)ids.push(id);}
    const flow=root.IELTSCourseExpansion||(typeof require==='function'?require('./course-expansion.js'):null),ordered=flow?.orderedMaterialIds?.({...task,materialIds:ids},day)||ids,all=new Set(),core=new Set(),groups=[];
    for(const id of ordered){const item=options.currentMaterial?.id===id?options.currentMaterial:map.get(id);if(!item)return null;const seen=new Set(),words=[];for(const value of api?.wordsFor?.(item,{curriculumData:data})||item.vocabulary||[]){const word=String(value?.word||'').trim(),key=word.normalize('NFKC').toLowerCase();if(!key||seen.has(key))continue;seen.add(key);all.add(key);if(required.has(id))core.add(key);words.push({word,meaning:String(value.meaning||'')});}groups.push({materialId:id,title:item.title,wordCount:words.length,words,required:required.has(id),current:id===options.currentMaterial?.id});}
    if(!all.size)return null;const currentIndex=groups.findIndex(group=>group.current);return{wordCount:all.size,requiredWordCount:core.size,supplementWordCount:all.size-core.size,groupCount:groups.length,currentGroup:currentIndex<0?null:currentIndex+1,groups};
  }
  let progressSerial=0;
  function createSubmissionProgress(options){
    const node=options.node,now=options.now||(()=>Date.now()),schedule=options.setInterval||((fn)=>setInterval(fn,1000)),clear=options.clearInterval||(id=>clearInterval(id)),current=options.isCurrent||(()=>true),token='submission-'+(++progressSerial);let active=false,timer=null,startedAt=0,label='';
    function owns(){return node.dataset.progressToken===token;}
    function stop(message){if(timer!==null){clear(timer);timer=null;}active=false;if(owns()){node.dataset.busy='false';node.setAttribute?.('aria-busy','false');if(message!==undefined&&current())node.textContent=message;}}
    function render(){if(!active)return;if(!current()||!owns()){stop();return;}node.textContent=label+' · 已等待 '+Math.max(0,Math.floor((now()-startedAt)/1000))+' 秒，请勿重复提交。';}
    const api={start(message){stop();label=message;startedAt=now();active=true;node.dataset.progressToken=token;node.dataset.busy='true';node.setAttribute?.('role','status');node.setAttribute?.('aria-live','polite');node.setAttribute?.('aria-busy','true');render();if(active)timer=schedule(render);return api;},update(message){label=message;render();},finish:message=>stop(message),fail:message=>stop(message),cancel:()=>stop(),get active(){return active;}};return api;
  }
  function parseState(input) {
    if (typeof input === 'string') { if (input.length > 8 * 1024 * 1024) throw Error('课程草稿超过 8 MB。'); input = JSON.parse(input); }
    if (!input || input.schema !== 1 || Object.keys(input).some(k=>!['schema','day','selectedCourseDay','exposures','drafts','queue'].includes(k)) || !Number.isInteger(input.day) || input.day < 1 || input.day > 365) throw Error('课程记录格式无效。');
    const out = newState(); out.day = input.day;
    if(input.selectedCourseDay!==undefined&&input.selectedCourseDay!==null){const selection=input.selectedCourseDay;if(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some(key=>!['day','selectedAt'].includes(key))||!Number.isInteger(selection.day)||selection.day<1||selection.day>365||typeof selection.selectedAt!=='string'||!Number.isFinite(Date.parse(selection.selectedAt))||new Date(selection.selectedAt).toISOString()!==selection.selectedAt)throw Error('手动选择的课程课次无效，原记录保留。');out.selectedCourseDay={day:selection.day,selectedAt:selection.selectedAt};}
    for (const section of ['exposures','drafts','queue']) {
      if (!input[section] || Array.isArray(input[section]) || typeof input[section] !== 'object' || Object.keys(input[section]).length > (section === 'exposures' ? 5000 : 200)) throw Error('课程记录集合无效。');
      for (const [id, item] of Object.entries(input[section])) {
        if (!validId(id) || !item || typeof item !== 'object' || Array.isArray(item)) throw Error('课程记录 ID 无效。');
        if (section === 'exposures') {
          if (Object.keys(item).some(k=>!['firstSeenAt','lastSeenAt','count','assisted','courseDays'].includes(k)) || !Number.isFinite(Date.parse(item.firstSeenAt)) || !Number.isFinite(Date.parse(item.lastSeenAt)) || item.lastSeenAt < item.firstSeenAt || !Number.isInteger(item.count) || item.count < 1 || item.count > 100000 || typeof item.assisted !== 'boolean'||item.courseDays!==undefined&&(!Array.isArray(item.courseDays)||item.courseDays.length>365||new Set(item.courseDays).size!==item.courseDays.length||item.courseDays.some(n=>!Number.isInteger(n)||n<1||n>365))) throw Error('材料曝光记录无效。');
          out.exposures[id] = {firstSeenAt:item.firstSeenAt, lastSeenAt:item.lastSeenAt, count:item.count, assisted:item.assisted,...(item.courseDays?{courseDays:item.courseDays.slice()}: {})};
        } else if (section === 'queue') {
          if (Object.keys(item).some(k=>!['recordId','at'].includes(k)) || !validId(item.recordId) || !Number.isFinite(Date.parse(item.at))) throw Error('待评队列无效。');
          out.queue[id] = {recordId:item.recordId, at:item.at};
        } else {
          if (item.id !== id || !validId(item.materialId) || !SKILLS.includes(item.taskId) || !['practice','assessment'].includes(item.mode) || !['original','correction','retest'].includes(item.kind) || !Number.isInteger(item.courseDay) || item.courseDay < 1 || item.courseDay > 365 || !Number.isFinite(Date.parse(item.startedAt)) || !Number.isFinite(item.activeSeconds) || item.activeSeconds < 0 || item.activeSeconds > 86400 || typeof item.text !== 'string' || item.text.length > 15000 || typeof item.transcript !== 'string' || item.transcript.length > 15000 || JSON.stringify(item).length > (item.materialBinding?130000:70000)) throw Error('课程草稿无效。');
          if (!item.answers || typeof item.answers !== 'object' || Array.isArray(item.answers) || !item.userEvidence || typeof item.userEvidence !== 'object' || Array.isArray(item.userEvidence)) throw Error('草稿答案无效。');
          for (const [qid, answer] of Object.entries(item.answers)) if (!validId(qid) || !(typeof answer === 'string' && answer.length <= 2000 || Array.isArray(answer) && answer.length <= 50 && answer.every(v => typeof v === 'string' && v.length <= 1000))) throw Error('草稿题目答案无效。');
          for (const [qid, evidence] of Object.entries(item.userEvidence)) if (!validId(qid) || typeof evidence !== 'string' || evidence.length > 2000) throw Error('草稿依据无效。');
          if (Object.keys(item).some(k=>!['id','materialId','taskId','courseDay','mode','kind','parentId','startedAt','submittedAt','activeSeconds','exposureAtStart','answers','userEvidence','text','transcript','audioAvailable','audioCompleted','transcriptViewed','interrupted','assistance','media','modelReading','activityByDate','materialBinding','dayPlanBinding','courseAssignment','contextPracticeAssignment','lessonSupplement','yearAssignment'].includes(k))) throw Error('草稿含有未知字段。');
          if(item.yearAssignment!==undefined){if(item.mode!=='practice'||item.kind==='retest'||!yearCourseAPI())throw Error('全年普通练习冻结组件未就绪，原稿保留。');yearCourseAPI().cleanAssignment(item.yearAssignment,item.materialBinding,item.courseDay,{assessment:assessmentAPI(),player:root.IELTSCoursePlayer});}
          if(item.lessonSupplement!==undefined){if(item.mode!=='practice'||item.taskId!=='vocabulary'||!lessonSupplementAPI())throw Error('补充词汇组件未就绪，原稿保留。');lessonSupplementAPI().clean(item.lessonSupplement,item.materialBinding,item.courseDay);}
          if(item.dayPlanBinding!==undefined)cleanDayPlanBinding(item.dayPlanBinding,item.courseDay);
          if(item.courseAssignment!==undefined){const c=item.courseAssignment;if(!c||c.materialId!==item.materialId||c.day!==item.courseDay||c.taskId!==item.taskId||c.role!=='contextual-public-course'||c.mode!=='practice'||c.required!==true||!item.dayPlanBinding?.day.publicCourse?.assignments?.some(a=>a.assignmentId===c.assignmentId&&a.materialContentHash===c.materialContentHash))throw Error('公开课程草稿与所属日合同不一致，原输入保留。');}
          if(item.contextPracticeAssignment!==undefined){const c=item.contextPracticeAssignment;if(c?.schema!==1||c.role!=='public-context-grammar'||c.materialId!==item.materialId||c.day!==item.courseDay||c.taskId!=='grammar'||item.taskId!=='grammar'||c.mode!=='practice'||item.mode!=='practice'||c.required!==true||c.bindingContentHash!==item.materialBinding?.contentHash||!item.dayPlanBinding?.day.publicContextPractice?.assignments?.some(a=>a.assignmentId===c.assignmentId&&a.packContentHash===c.packContentHash&&a.materialContentHash===c.materialContentHash))throw Error('语境语法草稿与固定课程合同不一致，原稿保留。');}
          if (!['unseen','seen'].includes(item.exposureAtStart) || ['audioAvailable','audioCompleted','transcriptViewed','interrupted'].some(k=>typeof item[k]!=='boolean') || !item.assistance || Object.keys(item.assistance).length!==3 || ['hint','answer','ai'].some(k => typeof item.assistance[k] !== 'boolean') || !Array.isArray(item.media) || item.media.length > 8 || item.parentId && !validId(item.parentId) || item.kind!=='original'&&!item.parentId || item.kind==='original'&&item.parentId) throw Error('草稿辅助或录音记录无效。');
          if(item.materialBinding!==undefined)cleanMaterialBinding(item.materialBinding,item.materialId);
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
    for(const [id,e] of Object.entries(b.exposures)){const old=out.exposures[id];out.exposures[id]=old?{firstSeenAt:old.firstSeenAt<e.firstSeenAt?old.firstSeenAt:e.firstSeenAt,lastSeenAt:old.lastSeenAt>e.lastSeenAt?old.lastSeenAt:e.lastSeenAt,count:Math.max(old.count,e.count),assisted:old.assisted||e.assisted,...(old.courseDays||e.courseDays?{courseDays:[...new Set([...(old.courseDays||[]),...(e.courseDays||[])])].sort((a,b)=>a-b)}:{})}:e;}
    for(const [id,draft] of Object.entries(b.drafts)){if(out.drafts[id]&&JSON.stringify(out.drafts[id])!==JSON.stringify(draft))throw Error('同一课程草稿存在不同版本，合并已停止。');out.drafts[id]=draft;}
    for(const [id,queued] of Object.entries(b.queue))if(!out.queue[id]||out.queue[id].at<queued.at)out.queue[id]=queued;
    if(a.selectedCourseDay&&b.selectedCourseDay&&a.selectedCourseDay.selectedAt===b.selectedCourseDay.selectedAt&&a.selectedCourseDay.day!==b.selectedCourseDay.day)throw Error('同一时间选择了不同课程，请分别保留备份。');
    if(b.selectedCourseDay&&(!out.selectedCourseDay||b.selectedCourseDay.selectedAt>out.selectedCourseDay.selectedAt))out.selectedCourseDay=copy(b.selectedCourseDay);
    return parseState(out);
  }
  function courseSelectionAccess(data,records,dayNumber,options={}){
    const target=data?.days?.find(day=>day.day===dayNumber);if(!target)return{allowed:false,reason:'未找到这份课程。'};
    if(!Number.isInteger(options.scheduledDay)||dayNumber>options.scheduledDay)return{allowed:false,reason:'这份课程尚未到当前日历排程；可浏览，暂不设为今天的课程。'};
    try{const placement=placementRoute(data,options),baseWeek=placement?.startWeek||1;if(placement&&dayNumber<placement.startDay)return{allowed:false,reason:'入学起点之前的课程可从历史入口回看，保留当前匹配起点。'};
      const assessment=options.assessment||root.IELTSAssessment||(typeof require==='function'?require('./assessment-core.js'):null),unmet=prerequisiteStatus(data.materials,records,target.week,assessment,{...options,data}).filter(item=>!item.pass&&!item.placementCovered);if(unmet.length)return{allowed:false,reason:'前置关卡仍待核验：'+unmet.map(item=>item.id).join('、')+'；历史作品与错题保留。'};
      if(target.week>baseWeek){const year=options.yearPlanner||root.IELTSYearPlanner||(typeof require==='function'?require('./year-planner.js'):null),progress=year?.progression(data,records,{...options,currentWeek:baseWeek});if(!progress||progress.unlockedWeek<target.week)return{allowed:false,reason:progress?.next?.reasons?.join('；')||'前置能力或关卡证据尚未齐全。'};}
      return{allowed:true,day:target.day};
    }catch(error){return{allowed:false,reason:error.message||'课程前置状态暂未核实。'};}
  }
  function resolvedCourseDay(data,number,options={}){const base=data.days.find(item=>item.day===number);return base&&(options.getDay?.(base)||(root.document&&data===root.IELTSCurriculumData?root.IELTSAdaptivePlan?.getDay?.(base):null)||base);}
  // Course numbers identify learning units, not calendar dates. A future-calendar
  // unit may own a submission only after the real queue and its prerequisites agree.
  function queueCourseDay(input,options={}){
    try{
      const data=options.data||root.IELTSCurriculumData,api=options.assessment||assessmentAPI(),artifact=api?.decodeArtifact(input),number=artifact?.courseDay;
      if(!data||!Number.isInteger(number)||number<1||number>365||artifact.schema!==1||!['course-player','vocabulary-practice','mistake-review','year-review'].includes(input.source)||input.dayNumber!=null&&input.dayNumber!==number||input.skill!==input.taskId)return null;
      if(artifact.yearAssignment)return (options.yearCourse||yearCourseAPI())?.queueCourseDay(input,{...options,assessment:api});
      const binding=cleanMaterialBinding(artifact.materialBinding,input.materialId),plan=resolvedCourseDay(data,number,options),task=plan?.tasks?.find(t=>t.id===input.taskId),material=resolveCourseMaterial(data,input.materialId,options);
      if(!task||!material||binding.material.skill!==input.skill||String(binding.material.version)!==String(input.materialVersion)||binding.material.taskContract?.id!==input.taskId)return null;
      const plannedCore=task.materialIds?.includes(input.materialId),supplementAPI=options.lessonVocabularySupplement||lessonSupplementAPI(),supplementProof=artifact.lessonSupplement?(!plannedCore&&artifact.mode==='practice'&&supplementAPI?.clean(artifact.lessonSupplement,binding,number)):null;if(artifact.lessonSupplement&&!supplementProof)return null;
      if(artifact.dayPlanBinding&&cleanDayPlanBinding(artifact.dayPlanBinding,number).contentHash!==api.materialContentHash(plan))return null;
      const records=options.records;if(!Array.isArray(records))return null;
      const drafts=options.drafts||root.IELTSTodayNavigation?.allDrafts?.()||[],saved=drafts.find(d=>d.id===input.id&&d.courseDay===number&&d.taskId===input.taskId&&d.materialId===input.materialId);
      const savedSupplement=!!(supplementProof&&saved?.lessonSupplement&&JSON.stringify(supplementAPI.clean(saved.lessonSupplement,saved.materialBinding,number))===JSON.stringify(supplementProof));
      const canonical=freezeMaterialBinding(material,{assessment:api,task,data,courseDay:number,attemptId:input.id,gradingPolicy:binding.gradingPolicy});
      const savedBinding=saved&&cleanMaterialBinding(saved.materialBinding,input.materialId),compatibility=options.compatibility||root.IELTSLegacyMaterialCompatibility||(typeof require==='function'?require('./legacy-material-compatibility.js'):null),known=compatibility?.entries?.[material.id],revision=compatibility?.reviewedRevisions?.entries?.[material.id],old=binding.material;
      const historicalHash=api.legacyMaterialContractHash(old),registered=revision&&String(material.version)===revision.toVersion&&api.materialContentHash(material)===revision.toMaterialHash&&String(material.source?.revisionOf?.version)===revision.fromVersion&&material.source.revisionOf.materialContentHash===revision.fromMaterialHash&&String(old.version)===revision.fromVersion&&revision.fromContractHashes.includes(historicalHash);
      const knownSaved=binding.contentHash===savedBinding?.contentHash&&old.week===material.week&&old.level===material.level&&old.pool===material.pool&&(registered||known?.versions?.includes(String(old.version))&&known?.variantHashes?.includes(historicalHash));
      const withoutTask=value=>{const material=copy(value.material);delete material.taskContract;return api.materialContentHash(material);};
      if(binding.contentHash!==canonical.contentHash&&!knownSaved&&(plannedCore||withoutTask(binding)!==withoutTask(canonical)))return null;
      const existing=records.find(r=>r.id===input.id&&r.dayNumber===number&&r.materialId===input.materialId),parent=input.kind==='correction'&&records.find(r=>r.id===input.parentId&&r.dayNumber===number&&r.materialId===input.materialId&&r.skill===input.skill);
      if(existing||parent)return number; // Preserve an already-owned immutable work or its correction.
      const load=options.load||root.IELTSDailyLearningLoad||(typeof require==='function'?require('./daily-learning-load.js'):null),adaptive=options.adaptivePlan||(root.document?root.IELTSAdaptivePlan:null),history=records.filter(r=>r.id!==input.id),now=options.now??Date.now();
      const summaryForDay=options.summaryForDay||(n=>root.IELTSMistakes?.forDay(n)||{completionValid:false,remaining:0}),getDay=options.getDay||(adaptive?.getDay?d=>adaptive.getDay(d):undefined),recordCorrectionStatus=options.recordCorrectionStatus||(r=>root.IELTSMistakes?.recordCorrectionStatus?.(r));
      const queue=load?.build({...(supplementProof?{...options,lessonVocabularySupplement:supplementAPI}:{}),data,records:history,drafts:drafts.filter(d=>d.id!==input.id||savedSupplement),currentDay:Number.isInteger(options.currentDay)?Math.min(number,options.currentDay):number,now,assessment:api,player:root.IELTSCoursePlayer,hub:options.hub,yearPlanner:options.yearPlanner,placement:options.placement||root.IELTSPlacement,getDay,adaptivePlan:adaptive,summaryForDay,recordCorrectionStatus,verifiedRecord:options.verifiedRecord||adaptive?.verifiedRecord});
      const candidate=queue?.entries?.find(e=>e.day===number&&e.taskId===input.taskId&&e.materialId===input.materialId&&(plannedCore&&['material','reflection'].includes(e.kind)||!plannedCore&&artifact.mode==='practice'&&e.kind==='extra'&&(e.placementChallenge===true&&e.entry?.kind==='placement-challenge'||supplementProof&&e.lessonSupplement===true&&e.optional===true&&e.required===false&&e.entry?.kind==='lesson-vocabulary-supplement'&&(savedSupplement||e.fitsBudget===true)&&JSON.stringify(supplementAPI.bind(e.entry.lessonSupplement,binding,number))===JSON.stringify(supplementProof))));
      // Recap commits its verified token before the immutable reflection work.
      // The queue can therefore already point at the next course at this instant.
      const summary=input.source==='mistake-review'?summaryForDay(number):null,finishedRecap=input.source==='mistake-review'&&input.taskId==='reflection'&&queue?.courseDay>number&&summary?.completionValid===true&&typeof artifact.token==='string'&&artifact.token===summary.token&&dayReadiness({...data,days:[plan]},number,history,{recordCorrectionStatus}).ready;
      if(!candidate&&!finishedRecap)return null;
      const access=courseSelectionAccess(data,history,number,{...options,now,scheduledDay:Math.max(Number(options.currentDay)||1,queue.courseDay||1),verifiedRecord:options.verifiedRecord||adaptive?.verifiedRecord});
      return access.allowed?number:null;
    }catch(_){return null;}
  }
  function taskFor(data, day, taskId,options={}) { return resolvedCourseDay(data,day,options)?.tasks.find(item => item.id === taskId); }
  function placementRoute(data,options={}){const api=options.placement||root.IELTSPlacement||(typeof require==='function'?require('./placement-core.js'):null),route=api?.currentRoute?.(data)||null,status=api?.verificationStatus?.();if(!route&&status?.adopted&&status.state!=='verified')throw Error(status.reason||'已采用的入学测评起点尚待来源核验，请先重试核验；原稿与课程记录保留。');return route;}
  function prerequisiteStatus(materials,records,week,assessment,options={}) {
    const placement=placementRoute(options.data,options);return assessment.gateMastery(records,materials).filter(g=>g.week<week).map(g=>({id:g.id,week:g.week,pass:g.pass,status:g.status,dueAt:g.dueAt,placementCovered:!!placement&&g.week<placement.startWeek,reason:g.reasons.join('；')}));
  }
  function publicSourceGroup(material){
    const group=material?.source?.exposureGroup;
    return material?.pool==='training'&&!material.assessmentGroup&&!material.form&&!material.fullTest&&!material.independentBank&&typeof group==='string'&&/^public-source:[a-z0-9][a-z0-9-]{0,119}$/.test(group)?group:null;
  }
  function materialPreviouslySeen(material,records,materials,exposures={},drafts=[],options={}){
    if(!material?.id)return false;
    if(exposures?.[material.id]||[...(records||[]),...(drafts||[])].some(record=>record.materialId===material.id))return true;
    const group=publicSourceGroup(material);
    if(!group){
      // Only future ordinary owned attempts consult vocabulary contact. Existing
      // drafts and records retain their frozen exposureAtStart and original grade.
      if(material.pool!=='training'||material.assessmentGroup||material.form||material.fullTest||material.independentBank||material.source?.publicSourceId||String(material.source?.exposureGroup||'').startsWith('public-source:'))return false;
      const vocabulary=options.vocabularyExposure||root.IELTSContextualVocabularyExposure||(typeof require==='function'?require('./contextual-vocabulary-exposure.js'):null),possible=vocabulary?.read?.({...options,materials,records});
      // A selected Memory restore may have lost the original source contract.
      // Its ordinary owned source is not proven fresh; protected pools stay separate.
      if(possible?.ownedUnavailable===true||vocabulary&&possible?.unavailable===true&&possible.ownedUnavailable===undefined)return true;
      const groups=(possible?.ownedSourceGroups||[]).filter(value=>typeof value==='string'&&value.startsWith('owned-source:'));
      if(!groups.length)return false;
      const map=new Map((materials||[]).map(item=>[item.id,item]));map.set(material.id,material);
      // Use the same declared parent IDs and existing derived-material identity as
      // Stage.sourceFamilies. Repeated text or a shared word is not a source ID.
      const families=(item,visited=new Set())=>{if(!item||visited.has(item.id))return[];visited.add(item.id);const parents=[item.sourceMaterialId,item.source?.sourceId,...(Array.isArray(item.source?.sourceIds)?item.source.sourceIds:[]),...(Array.isArray(item.sourceMaterialIds)?item.sourceMaterialIds:[])].filter(id=>typeof id==='string'&&id!==item.id&&map.has(id)),base=String(item.id||'').replace(/-(?:speaking|writing|grammar|vocabulary)(?:-pack-\d+)?$/,'');if(base!==item.id&&map.has(base))parents.push(base);return parents.length?[...new Set(parents.flatMap(id=>families(map.get(id),new Set(visited))))]:[item.source?.exposureGroup?'exposure:'+item.source.exposureGroup:'source:'+item.id];};
      const target=new Set(families(material));return groups.some(value=>{const id=value.slice('owned-source:'.length);return id===material.id||(map.has(id)?families(map.get(id)):['source:'+id]).some(key=>target.has(key));});
    }
    const vocabulary=options.vocabularyExposure||root.IELTSContextualVocabularyExposure||(typeof require==='function'?require('./contextual-vocabulary-exposure.js'):null),possible=vocabulary?.read?.({...options,materials,records})||{unavailable:true};if(possible?.unavailable||possible?.sourceGroups?.includes(group))return true;
    const peers=new Set((materials||[]).filter(item=>publicSourceGroup(item)===group).map(item=>item.id));
    if([...peers].some(id=>Boolean(exposures?.[id])))return true;
    return[...(records||[]),...(drafts||[])].some(record=>{if(peers.has(record.materialId))return true;try{const m=record.materialBinding?.material||assessmentAPI()?.decodeArtifact(record)?.materialBinding?.material;return publicSourceGroup(m)===group;}catch(_){return false;}});
  }
  function protectedMaterialAccess(material,records,materials,options={}){
    const seen=materialPreviouslySeen(material,records,materials,options.exposures,options.drafts,options);if(seen)return{allowed:true,seen:true};
    const api=options.assessment||root.IELTSAssessment||(typeof require==='function'?require('./assessment-core.js'):null),now=options.now??Date.now(),placement=placementRoute(options.data,options),gates=api?.gateMastery(records||[],materials||[],{now})||[];
    if(material?.pool==='gate'&&material.form==='B'){const gate=gates.find(g=>g.id===material.assessmentGroup);if(!gate?.a?.pass||!gate.dueAt||now<Date.parse(gate.dueAt))return{allowed:false,seen:false,dueAt:gate?.dueAt||null,reason:'B卷继续保留为未见复测：请先完成合格的整套A卷，并在整套提交后至少间隔48小时再开始；这次没有登记曝光。'};}
    const placementCovered=gates.filter(g=>!!placement&&g.week<placement.startWeek).map(g=>g.id);
    if(material?.pool==='gate'||material?.pool==='final'){const missing=gates.filter(g=>g.week<material.week&&!g.pass&&!placementCovered.includes(g.id));if(missing.length)return{allowed:false,seen:false,placementCovered,reason:'这份关卡或末期保留卷尚未解锁：先补齐前置关卡 '+missing.map(g=>g.id).join('、')+'。本次仅保留简介，没有打开正文或登记曝光。'};}
    return{allowed:true,seen:false,placementCovered};
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
    if(mode==='speaking_text'&&(typeof text!=='string'||!text.trim())){const error=Error('自由表达原音已保存，当前尚无可用于评阅的自动听音／转写证据，保持待评。无需手工填写；请在 AI 设置配置自动听音或转写服务后重试。例文朗读不能替代本次回答。');error.code='SPEAKING_AUDIO_PENDING';throw error;}
    if(typeof text!=='string'||!text.trim()||text.length>10000)throw Error('AI 复核需要不超过 10000 字符的已提交原稿或确认转写；原文会完整保留，请另建订正版本。');
    if(!prompt.trim()||prompt.length>3000)throw Error('本题完整题目超过当前评阅接口 3000 字符上限；不会截断题目或原稿，请反馈材料编号。');
    const levels=String(material.level||'A0').match(/A[012]|B[12]|C[12]/g);if(!levels?.length)throw Error('本材料的学习阶段未映射到有效 CEFR 等级，请反馈材料编号。');
    return {mode,text:text.trim(),prompt:prompt.trim(),task,level:levels.at(-1)};
  }
  function checkAbort(signal){if(signal?.aborted){const error=new Error('请求已取消，原稿与录音保留。');error.name='AbortError';throw error;}}
  async function transcribeCourseAudio(record,prepared,options={}){
    const api=options.assessment||assessmentAPI(),fetcher=options.fetch||root.fetch?.bind(root),signal=options.signal,crypto=options.crypto||root.crypto;
    if(!prepared?.audio||!fetcher||!crypto?.subtle)throw Error('自动转写组件尚未准备好，原音已保存待评。');
    checkAbort(signal);const statusResponse=await fetcher('/api/transcription/status',{method:'GET',signal,credentials:'same-origin',redirect:'error',cache:'no-store'});let status;try{status=await statusResponse.json();}catch(_){}
    checkAbort(signal);if(!statusResponse.ok||status?.courseTranscriptionProtocol!==1){const error=Error('共享学习包已更新，请重新双击“启动学习.cmd”载入本机新服务，再重试本次原音。原稿与录音保持待评。');error.code='COURSE_TRANSCRIPTION_SERVICE_UPDATE';throw error;}
    if(status.configured!==true)throw Error('本机尚无可用自动转写服务。原稿与录音保留待评；请检查本地识别依赖状态或已配置的转写服务。');
    checkAbort(signal);const binary=(options.atob||root.atob)(prepared.audio),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),digest=await crypto.subtle.digest('SHA-256',bytes),hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
    const response=await fetcher('/api/transcription/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio:prepared.audio}),signal,credentials:'same-origin',redirect:'error',cache:'no-store'});let value;try{value=await response.json();}catch(_){throw Error('转写服务未返回有效结果，原音保留待评。');}checkAbort(signal);
    if(!response.ok||value.ok===false)throw Error(value.error?.message||'自动转写暂未完成，原音保留待评。');
    if(typeof value.text!=='string'||!value.text.trim()||value.text.length>10000||value.audioSha256!==hash||value.textSha256!==api.sourceTextHash(value.text)||!Number.isFinite(value.durationSeconds)||Math.abs(value.durationSeconds-prepared.durationSeconds)>.1)throw Error('转写与本次原音的哈希、文字或完整时长不匹配，保留待评。');
    const artifact=api.decodeArtifact(record),source={schema:1,evidenceId:value.evidenceId,provider:value.provider,text:value.text,textSha256:value.textSha256,audioSha256:value.audioSha256,durationSeconds:value.durationSeconds,verifiedAt:value.verifiedAt,recordId:record.id,materialId:record.materialId,materialVersion:String(record.materialVersion),bindingContentHash:artifact?.materialBinding?.contentHash,mediaIds:(record.media||[]).map(m=>m.id),mediaRanges:prepared.mediaRanges};
    if(!api.transcriptionForRecord(record,source))throw Error('转写来源与这份冻结原稿不一致，原音保留待评。');return source;
  }
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
    const {request,record,signal}=options,fetcher=options.fetch||root.fetch.bind(root),transcription=options.transcriptionSource;
    async function json(path,body){checkAbort(signal);const response=await fetcher(path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal,credentials:'same-origin',redirect:'error',cache:'no-store'});let result;try{result=await response.json();}catch(_){throw Error('本地服务返回的评阅数据无法读取。');}checkAbort(signal);if(!response.ok||result.ok===false){const error=new Error(typeof result.error?.message==='string'?result.error.message.slice(0,500):'本地评阅服务暂不可用。');error.code=result.error?.code;throw error;}return result;}
    let proof=null,payload={...request},source=null;function retainTranscription(result){if(!transcription)return;const received=result.transcriptionEvidence;if(!received||!['evidenceId','provider','text','textSha256','audioSha256'].every(k=>received[k]===transcription[k])||!Number.isFinite(received.durationSeconds)||Math.abs(received.durationSeconds-transcription.durationSeconds)>.1)throw Error('评阅服务未核验同一份真实转写与原音，保持待评。');const bound={...transcription,verifiedAt:received.verifiedAt};if(!assessmentAPI().transcriptionForRecord(record,bound))throw Error('评阅转写与冻结原稿不一致。');result.transcriptionSource=bound;if(result.audioSource)result.audioSource.audioSha256=received.audioSha256;}
    if(options.audio&&request.task==='foundation'){
      const status=await json('/api/oral/status');if(!status.configured)throw Error('请先在 AI 与语音设置中连接阿里语音评测。');
      options.onProgress?.('正在核对本次自由回答的原音与转写；基础阶段用阿里专业诊断配合两轮表达反馈，不提供完整口语 Band。');
      const encoded=options.prepared||await options.prepare(record,signal);if(encoded.durationSeconds>180)throw Error('基础回答请控制在 3 分钟以内；更长自由口语请使用完整听音评阅。');
      proof=await json('/api/oral/assess',{audio:encoded.audio,reference:request.text,coreType:'en.pred.score'});
      const result=await json('/api/ai/review',{...request,mode:'speaking_audio',evidenceId:proof.evidenceId,...(transcription?{transcriptionEvidenceId:transcription.evidenceId}:{})});
      const verified=result.pronunciationEvidence;
      if(!verified||verified.evidenceId!==proof.evidenceId||verified.reference!==request.text||!Number.isFinite(verified.durationSeconds)||verified.durationSeconds<=0||verified.durationSeconds>180||['accuracy','fluency','completeness'].some(k=>!Number.isFinite(verified.result?.[k])||verified.result[k]<0||verified.result[k]>100)||(verified.result.text&&verified.result.text!==request.text)||Math.abs(verified.durationSeconds-encoded.durationSeconds)>.1)throw Error('基础原音评阅的来源或完整时长不匹配；保持待评。');
      result.pronunciationSource={...verified,provider:'ali',recordId:record.id,mediaIds:record.media.map(m=>m.id),completeCoverage:true};retainTranscription(result);
      result.audioAnalysisEvidence=false;
      return{result,proof,request:{...request,mode:'speaking_audio'}};
    }
    if(options.audio){const status=await json('/api/omni/status');if(status.configured!==true){const error=new Error('尚未配置 Omni 听音服务。请到 AI 设置的语音高级设置配置；当前发音和流利度保持待验证，也可先做文字复核。');error.code='OMNI_NOT_CONFIGURED';throw error;}options.onProgress?.('正在读取并转换这份原稿关联的全部原始录音…');const encoded=options.prepared||await options.prepare(record,signal);checkAbort(signal);options.onProgress?.('正在逐段发送完整原音给 '+(status.model||'Omni')+'。长录音加两轮复核可能需约 18 分钟，可随时取消。');proof=await json('/api/omni/evidence',{audio:encoded.audio,prompt:request.prompt,transcript:request.text,task:request.task,level:request.level});source=audioSource(proof,record);source.task=request.task;source.omniModel=status.model||'';source.mediaRanges=encoded.mediaRanges||[];if(Math.abs(source.durationSeconds-encoded.durationSeconds)>.1)throw Error('返回音频时长与本次发送的原音不匹配。');payload={...request,mode:'speaking_audio',evidenceId:proof.evidenceId,...(transcription?{transcriptionEvidenceId:transcription.evidenceId}:{})};options.onProgress?.(proof.audioAnalysisEvidence===true?'已收到覆盖全部原音的时点观察，正在进行两轮四维 AI 训练评阅…':'听音证据尚不足，继续保留文字反馈；发音和流利度不出分。');}
    const result=await json('/api/ai/review',payload);if(!['complete','partial','pending'].includes(result.status)||!Array.isArray(result.rounds))throw Error('评阅返回结构不完整，原稿已保留。');
    if(options.audio){if(result.audioAnalysisEvidence===true&&result.audioEvidenceId!==proof.evidenceId)throw Error('音频评阅与本次声学证据 ID 不匹配。');result.audioAnalysisEvidence=result.audioAnalysisEvidence===true&&proof.audioAnalysisEvidence===true&&source.completeCoverage;result.audioSource=source;}else result.audioAnalysisEvidence=false;
    retainTranscription(result);return{result,proof,request:payload};
  }
  function feedbackForRecord(result,archiveId) {
    const saved={...copy(result),...(archiveId?{fullReviewArchiveId:archiveId}:{})};
    if(JSON.stringify(saved).length<=24000)return JSON.stringify(saved);
    saved.rounds=saved.rounds.map(r=>!r.ok?r:{ok:true,round:r.round,summary:String(r.summary||'').slice(0,600),uncertainty:String(r.uncertainty||'').slice(0,400),criteria:(r.criteria||[]).map(c=>({id:c.id,label:c.label,band:c.band,evidence:(c.evidence||[]).slice(0,2).map(e=>({quote:e.quote,comment:String(e.comment||'').slice(0,160)})),audioEvidence:(c.audioEvidence||[]).slice(0,3).map(e=>({id:e.id,dimension:e.dimension,startSeconds:e.startSeconds,endSeconds:e.endSeconds,quote:e.quote,comment:String(e.comment||'').slice(0,160)})),comment:String(c.comment||'').slice(0,240),uncertainty:String(c.uncertainty||'').slice(0,200)})),levelCheck:r.levelCheck?{scope:r.levelCheck.scope,targetLevel:r.levelCheck.targetLevel,meetsGoal:r.levelCheck.meetsGoal,evidence:(r.levelCheck.evidence||[]).slice(0,2).map(e=>({quote:e.quote,comment:String(e.comment||'').slice(0,160)})),gaps:(r.levelCheck.gaps||[]).slice(0,3).map(g=>String(g).slice(0,160))}:null,corrections:[]});
    saved.feedbackAbbreviated=true;saved.disclaimer=String(saved.disclaimer||'').slice(0,1000)+' 本记录显示评阅摘要，完整两轮意见保存在关联作品归档。';const text=JSON.stringify(saved);if(text.length>24000)throw Error('评阅摘要仍超过作品记录上限；完整意见已归档，原稿未改写。');return text;
  }
  function foundationSpeaking(material) {
    return material?.skill==='speaking' && (material.rubric?.taskType || material.rubric?.task || (material.fullTest?'full_test':material.week<=8?'foundation':'part2'))==='foundation';
  }
  function localHTTP(location) {
    try { const url=new URL(location?.origin || location?.href || '');return url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname); } catch(_){return false;}
  }
  function modelReadingReference(material,data,dayNumber) {
    if(material?.reference?.trim())return material.reference;
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
    const oral=root.IELTSOralPractice||(typeof require==='function'?require('./oral-practice.js'):null),split=options.splitReference||oral?.splitReference;let expected,spoken;
    try{expected=split?.(reference,65);spoken=oral?.spokenReferenceParts?.(reference,65)||expected;if(!expected?.length||spoken.length!==expected.length)throw Error();}catch(_){out.reason='例文分段组件未准备好，请刷新本地课程页面。';return out;}
    out.segmentCount=expected.length;
    let saved;try{saved=cleanModelReading(snapshot);}catch(_){return out;}
    if(!saved.required||saved.materialId!==material.id||saved.dayNumber!==dayNumber||saved.segments.length!==expected.length)return out;
    const works=new Set(),evidence=new Set();
    for(const [index,segment] of saved.segments.entries()){
      if(!(segment.reference===expected[index]||segment.reference===spoken[index])||!segment.workId||!segment.evidenceId||works.has(segment.workId)||evidence.has(segment.evidenceId))return out;
      works.add(segment.workId);evidence.add(segment.evidenceId);out.workIds.push(segment.workId);
      if(segment.status==='complete'&&segment.professional?.provider==='Alibaba oral assessment'&&['accuracy','fluency','completeness'].every(key=>typeof segment.professional[key]==='number'&&Number.isFinite(segment.professional[key]))&&segment.coach?.feedbackFormat==='oral-coach-v1'&&segment.coach.evidenceId===segment.evidenceId)out.completedSegments++;
    }
    out.complete=out.completedSegments===expected.length;if(out.complete)out.reason='全部例文分段已完成专业评测与AI反馈；自由表达仍需单独原音，评阅状态另行核验。';return out;
  }
  function verifySpeakingStage(record,material,task,data,dayNumber,options={}) {
    let artifact;try{artifact=typeof record?.answer==='string'?JSON.parse(record.answer):record?.answer;}catch(_){return{valid:false,submitted:false,reason:'口语原稿格式无效。'};}
    if(!material||!artifact||typeof artifact!=='object')return{valid:false,submitted:false,reason:'口语材料或原稿不完整。'};
    const model=validateModelReading(artifact.modelReading,material,task,data,dayNumber,{...options,independentRetest:record.kind==='retest'&&artifact.mode==='assessment'});
    const ids=(record.media||[]).map(item=>item?.id),oldProgress=(()=>{try{const value=JSON.parse(artifact.text||'null');return value?.kind==='oral-practice-progress'?value.workIds||[]:[];}catch(_){return[];}})(),modelIds=new Set([...model.workIds,...oldProgress,...(artifact.modelReading?.segments||[]).map(item=>item?.workId).filter(Boolean)]);
    const free=ids.length>0&&ids.every(id=>typeof id==='string'&&id&&!modelIds.has(id))&&new Set(ids).size===ids.length;
    return{valid:model.complete&&free,submitted:model.complete&&free,modelComplete:model.complete,modelRequired:model.required,freeExpression:free,reason:!model.complete?model.reason:!free?'请单独录制自由表达；例文示范和词汇跟读原音不能替代自由表达。':model.reason};
  }
  function objectiveSubmissionComplete(record,material,assessment=root.IELTSAssessment) {

    let artifact;try{artifact=typeof record?.answer==='string'?JSON.parse(record.answer):record?.answer;}catch(_){return false;}
    const api=assessment||(typeof require==='function'?require('./assessment-core.js'):null);if(!artifact?.answers||!api)return false;
    try{const bound=api.resolveArtifactMaterial?.(material,artifact,record);if(bound&&!bound.valid)return false;material=bound?.material||material;if(!material||!['reading','listening','grammar'].includes(material.skill)||!Array.isArray(material.questions)||!material.questions.length)return false;const grade=api.gradeMaterialForArtifact(material,artifact);return grade.allGradable===true&&grade.total===material.questions.length&&grade.answered===material.questions.length;}catch(_){return false;}
  }
  function submissionSatisfied(record,material,options={}){
    const api=options.assessment||assessmentAPI();if(!record||!material||!api)return false;
    const artifact=api.decodeArtifact(record);if(!artifact)return false;
    const resolved=api.resolveArtifactMaterial?.(material,artifact,record);if(resolved&&!resolved.valid)return false;
    const original=resolved?.material||material,publicSource=original.source?.publicSourceId;
    if(publicSource&&(artifact.mode!=='practice'||record.kind==='retest'))return false;
    const assignment=options.assignment;
    if(assignment){
      if(!publicSource||record.dayNumber!==assignment.day||artifact.courseDay!==assignment.day||String(record.materialVersion)!==String(assignment.materialVersion)||original.source?.publicSourceId!==assignment.sourceId||original.source?.sourceTextSha256!==assignment.sourceTextSha256||original.source?.exposureGroup!==assignment.exposureGroup)return false;
      const saved=artifact.courseAssignment;
      if(saved){if(saved.bindingContentHash!==artifact.materialBinding?.contentHash||!['assignmentId','day','materialId','materialVersion','materialContentHash','sourceId','sourceTextSha256','exposureGroup','role','mode','required'].every(k=>String(saved[k])===String(assignment[k])))return false;}
      else if(api.materialContentHash(material)!==assignment.materialContentHash||!bindingMatchesMaterial(record,material,api))return false;
    }
    if(['reading','listening','grammar'].includes(original.skill))return objectiveSubmissionComplete(record,material,api)&&(original.skill!=='listening'||artifact.audioCompleted===true);
    if(original.skill==='vocabulary')return root.IELTSVocabularyPractice?.verifyTrainingArtifact?.(artifact,original)?.submitted===true;
    return root.IELTSPlanState?.validLinkedReview?.(record)===true;
  }
  function publicPracticeAccess(material,day,data,records,options={}){
    if(!material?.source?.publicSourceId)return{allowed:true};
    const practice=options.publicPractice||root.IELTSPublicMaterialPractice||(typeof require==='function'?require('./public-material-practice.js'):null),selector=options.selector||root.IELTSPublicMaterialSelector||(typeof require==='function'?require('./public-material-selector.js'):null),assignment=options.assignment;
    const admitted=assignment?.admission,admittedLevel=selector?.levelRange(admitted?.skillLevel),sourceLevel=selector?.levelRange(material.level);
    if(options.ownerDayFrozen===true&&admitted?.schema===1&&admitted.scope==='ordinary-practice-only'&&admittedLevel&&sourceLevel&&admittedLevel.high>=sourceLevel.high&&Array.isArray(admitted.verifiedCapabilities)&&(material.source.prerequisiteCapabilityIds||[]).every(id=>admitted.verifiedCapabilities.includes(id)))return{allowed:true,retainedAdmission:true};
    const sourceDay=assignment?{...day,tasks:day.tasks.map(t=>t.id===assignment.taskId?{...t,materialIds:assignment.taskMaterialIdsBefore||t.materialIds}:t)}:day;
    const context=practice?.context({...options,data,day:sourceDay,records,assessment:options.assessment||assessmentAPI(),verifiedRecord:options.verifiedRecord||root.IELTSAdaptivePlan?.verifiedRecord});
    const ceiling=selector?.levelRange(context?.skillLevels?.[material.skill]),level=selector?.levelRange(material.level);
    if(!context?.available||!ceiling||!level||level.high>ceiling.high)return{allowed:false,reason:'这份材料暂高于当前分项练习上限。先完成正常课程的原稿、订正与延迟保持核对；日历推进不会自动提高能力。',context};
    const missing=(material.source.prerequisiteCapabilityIds||[]).filter(id=>!context.verifiedCapabilities.includes(id));
    return missing.length?{allowed:false,reason:'这份材料的普通练习先修仍待真实证据：'+missing.join('、')+'。原课程与已交原稿保留。',context}:{allowed:true,context};
  }
  function dayReadiness(data,dayNumber,records,options={}) {
    const day=resolvedCourseDay(data,dayNumber,options),hub=options.hub||root.IELTSTodayHub||(typeof require==='function'?require('./today-hub.js'):null),plan=options.planState||root.IELTSPlanState||(typeof require==='function'?require('./daily-plan-state.js'):null);
    if(!day||!hub)return{ready:false,reason:'核心任务状态组件未准备好。',states:[]};
    const states=day.tasks.filter(task=>task.id!=='reflection').map(task=>{const core={...task,materialIds:task.coreMaterialIds||task.materialIds},status=hub.taskState(core,records,{data,dayNumber,materials:data.materials,recordCorrectionStatus:options.recordCorrectionStatus});
      if(['writing','speaking'].includes(task.id)){const latest=hub.latestForMaterial(core,records,dayNumber,data.materials,data);for(const id of core.materialIds){const record=latest.get(id);if(!record)continue;let corrected=false;try{corrected=options.recordCorrectionStatus?.(record)?.corrected===true;}catch(_){}if(!corrected&&!plan?.validLinkedReview?.(record)){status.done=false;status.pending=true;}}}
      return{taskId:task.id,...status};});
    const incomplete=states.filter(state=>!state.done);return{ready:incomplete.length===0,reason:incomplete.length?'请先完成核心任务：'+incomplete.map(state=>NAMES[state.taskId]+(state.pending?'（评阅或订正待完成）':'（材料尚未全部完成）')).join('、'):'核心任务真实提交与必要评阅已齐全。',states};
  }
  function quotedGrammarSourceIds(material,data,api=assessmentAPI()){
    const unit=data?.familyGrammarRelease?.units?.find(row=>row.materialId===material?.id),canonical=unit&&data.materials.find(m=>m.id===unit.materialId);if(!canonical||api.materialContentHash(canonical)!==unit.materialContentHash||material.passage!==canonical.passage)return[];
    return [...new Set((canonical.sourceConnections||[]).filter(link=>{const source=data.materials.find(m=>m.id===link.materialId),body=source?.passage||source?.transcript;return typeof link.quote==='string'&&link.quote.length>0&&material.passage.includes(link.quote)&&typeof body==='string'&&api.sourceTextHash(body)===link.bodySha256&&body.slice(link.quoteSpan?.start,link.quoteSpan?.end)===link.quote;}).map(link=>link.materialId))];
  }
  function orderedTaskMaterialIds(task,dayNumber){const flow=root.IELTSCourseExpansion||(typeof require==='function'?require('./course-expansion.js'):null);return flow?.orderedMaterialIds?.(task,dayNumber)||task.materialIds||[];}
  function navigationMaterial(task,preferredId,materials,dayNumber){const map=typeof materials?.get==='function'?materials:new Map((materials||[]).map(m=>[m.id,m])),preferred=map.get(preferredId),ids=orderedTaskMaterialIds(task,dayNumber),familyGrammar=task.id==='grammar'&&dayNumber>=2&&dayNumber<=10&&ids.some(id=>/^w0[12]-read-[1-6]-grammar$/.test(id)||id==='day02-expansion-grammar'||/^family-v89-day\d{2}-grammar$/.test(id));if(preferred?.independentBank===true||!familyGrammar&&preferred)return preferred;return ids.includes(preferredId)&&preferred||ids.map(id=>map.get(id)).find(Boolean)||null;}
  function nextDestination(data,dayNumber,taskId,records,options={}) {
    const tasks=resolvedCourseDay(data,dayNumber,options)?.tasks||[],index=tasks.findIndex(item=>item.id===taskId),current=tasks[index];if(!current)return null;
    if(taskId==='reflection')return{kind:'overview',label:'查看今日完成情况'};
    const hub=options.hub||root.IELTSTodayHub||(typeof require==='function'?require('./today-hub.js'):null);
    const progress=task=>hub?.taskState(task,records,{data,dayNumber,materials:data.materials,recordCorrectionStatus:options.recordCorrectionStatus});
    const own=progress(current),missingIds=own?.missingMaterialIds||current.materialIds.filter(id=>!records.some(record=>record.dayNumber===dayNumber&&record.taskId===taskId&&record.materialId===id)),missing=orderedTaskMaterialIds(current,dayNumber).filter(id=>missingIds.includes(id));
    if(missing.length)return{kind:'material',taskId,materialId:missing[0],label:'继续本项：'+(data.materials.find(item=>item.id===missing[0])?.title||NAMES[taskId])};
    const next=tasks[index+1];if(!next)return{kind:'overview',label:'查看今日完成情况'};const state=progress(next),ordered=orderedTaskMaterialIds(next,dayNumber),target=ordered.find(id=>state?.missingMaterialIds?.includes(id))||ordered.find(id=>state?.pendingMaterialIds?.includes(id))||state?.nextMaterialId||ordered[0];
    return{kind:state?.missingMaterialIds?.length===0?'view':'material',taskId:next.id,materialId:target,label:'继续下一项：'+NAMES[next.id]};
  }

  function toRecord(attempt, material, currentDay, assessment, options={}) {
    if(attempt.materialBinding)material=cleanMaterialBinding(attempt.materialBinding,attempt.materialId).material;
    const gradingPolicy=attempt.materialBinding?.gradingPolicy||(['reading','listening','grammar'].includes(material.skill)?'canonical-v2':'existing-subjective-v1');
    const elapsedSeconds = Math.min(86400, Math.max(0, (Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt))/1000));
    const activeSeconds = Math.min(attempt.activeSeconds, elapsedSeconds);
    const skill = attempt.taskId, text = skill === 'speaking' ? attempt.transcript : attempt.text;
    const objective = skill === material.skill && ['reading','listening','grammar'].includes(skill);
    const grade = objective ? assessment.gradeMaterialForArtifact(material, {answers:attempt.answers,gradingPolicy,objectiveGrading:gradingPolicy,...(attempt.materialBinding?{materialBinding:attempt.materialBinding,materialVersion:String(material.version)}:{})}) : null;
    const threshold = material.pool === 'final' || attempt.kind === 'retest' ? 0.8 : 0.85;
    const artifact = {schema:1, gradingPolicy,...(objective?{objectiveGrading:gradingPolicy}:{}),...(attempt.materialBinding?{materialBinding:copy(attempt.materialBinding)}:{}),...(attempt.dayPlanBinding?{dayPlanBinding:cleanDayPlanBinding(attempt.dayPlanBinding,attempt.courseDay)}:{}),...(attempt.courseAssignment?{courseAssignment:copy(attempt.courseAssignment)}:{}),...(attempt.contextPracticeAssignment?{contextPracticeAssignment:copy(attempt.contextPracticeAssignment)}:{}),...(attempt.yearAssignment?{yearAssignment:yearCourseAPI().cleanAssignment(attempt.yearAssignment,attempt.materialBinding,attempt.courseDay,{assessment,player:root.IELTSCoursePlayer,data:options.data})}:{}),...(attempt.lessonSupplement?{lessonSupplement:lessonSupplementAPI().clean(attempt.lessonSupplement,attempt.materialBinding,attempt.courseDay)}:{}),mode:attempt.mode, courseDay:attempt.courseDay, materialVersion:String(material.version), assessmentGroup:material.assessmentGroup || '', form:material.form || '', exposureAtStart:attempt.exposureAtStart, startedAt:attempt.startedAt, activeSeconds, elapsedSeconds, answers:attempt.answers, userEvidence:attempt.userEvidence, ...(attempt.activityByDate?{activityByDate:copy(attempt.activityByDate)}:{}), text:attempt.text, transcript:attempt.transcript, audioAvailable:attempt.audioAvailable, audioCompleted:attempt.audioCompleted, transcriptViewed:attempt.transcriptViewed, interrupted:attempt.interrupted, audioAnalysisEvidence:false,...(grade?{submissionComplete:grade.allGradable&&grade.answered===material.questions.length}:{}),...(attempt.modelReading?{modelReading:cleanModelReading(attempt.modelReading)}:{})};
    const evaluation = grade ? {method:'objective', result:grade.allGradable && grade.ratio >= threshold ? 'pass' : 'revise', feedback:'项目原创题内部核对；原始正确数不是 IELTS 官方换分。', score:grade.correct, ...(grade.total ? {maxScore:grade.total} : {}), threshold} : {method:'none', result:['writing','speaking'].includes(skill) ? 'pending' : 'unverified', feedback:'已保存原始输出，完成量不能替代能力判断。'};
    const quantity = grade ? grade.answered : skill === 'vocabulary' ? text.split(/\n/).filter(line => line.trim()).length : skill === 'reflection' ? (text.trim() ? 1 : 0) : assessment.countWords(text);
    const record = {id:attempt.id, materialId:material.id, materialVersion:String(material.version), title:material.title, skill, source:'course-player', taskId:skill, answer:JSON.stringify(artifact), minutes:activeSeconds/60, quantity, unit:grade ? '题' : skill === 'vocabulary' ? '条' : skill === 'reflection' ? '份复盘' : '词', assistance:{...attempt.assistance}, kind:attempt.kind, ...(attempt.parentId ? {parentId:attempt.parentId} : {}), exposure:attempt.exposureAtStart, startedAt:attempt.startedAt, submittedAt:attempt.submittedAt, activeSeconds, elapsedSeconds, media:attempt.media || [], evaluation};
    if (Number.isInteger(attempt.courseDay)&&attempt.courseDay>=1&&attempt.courseDay<=365&&(Number.isInteger(currentDay)&&currentDay>=attempt.courseDay||!attempt.materialBinding&&placementRoute(options.data||root.IELTSCurriculumData,options)||queueCourseDay(record,{...options,currentDay})===attempt.courseDay)) record.dayNumber = attempt.courseDay;
    return record;
  }

  function practiceReviewResult(result,record,material,assessment){
    if(result?.status!=='complete')return 'pending';
    if(material.fullTest||material.pool==='final'){const judged=assessment.evaluatedCriteria({...record,evaluation:{method:'ai',result:'pending',feedback:JSON.stringify(result)}},material,7);return judged.criteria.some(c=>!c.complete)?'pending':judged.reasons.length?'revise':'pass';}
    const rounds=result.rounds?.filter(r=>r.ok===true)||[];
    if(rounds.length<2||new Set(rounds.map(r=>r.round)).size<2)return'pending';
    const artifact=assessment.decodeArtifact(record),text=record.skill==='speaking'?assessment.effectiveSpeakingTranscript(record):artifact?.text;
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
  function audioCreditLink(material,preview=false){
    const value=material?.source?.creditDetailUrl,match=typeof value==='string'&&/^(?:\.\/)?真人听力来源\.html\?id=([A-Za-z0-9._:-]{1,160})$/.exec(value);
    return match?'真人听力来源.html?id='+encodeURIComponent(match[1])+(preview?'&preview=1':''):null;
  }
  function init() {
    const doc = root.document, $ = id => doc.getElementById(id), data = root.IELTSCurriculumData, A = root.IELTSAssessment, R = root.IELTSRecords;
    if (!$('coursePlayerApp')) return;
    const notice = (message, error = false) => { $('courseNotice').textContent = message; $('courseNotice').classList.toggle('is-error', error); };
    if (!data?.days?.length || !A || !R) { notice('课程数据尚未加载，请检查 assets/curriculum-data.js 与本地服务。已存作品不会被改写。', true); $('courseBegin').disabled = true; return; }
    function el(tag, className, text) { const item = doc.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = String(text); return item; }
    function button(text, action, className = '') { const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b; }
    const materialMap = new Map(data.materials.map(m => [m.id,m]));
    const originalMaterialGet=materialMap.get.bind(materialMap);materialMap.get=id=>originalMaterialGet(id)||contextPracticeAPI()?.resolveMaterial?.(id,{data})||root.IELTSYearFirstUseCourse?.resolveMaterial?.(id)||null;materialMap.has=id=>!!materialMap.get(id);
    function dayPlan(number){const base=data.days.find(d=>d.day===number);try{return root.IELTSAdaptivePlan&&base?root.IELTSAdaptivePlan.getDay(base):base;}catch(error){notice('个性化安排读取失败：'+error.message+' 原记录已保留，暂按原课程浏览。',true);return base;}}
    let storage, state, storageBroken = false, day, task, material, attempt = null, submittedRecord = null, running = false, tickAt = Date.now(), draftTimer = null, recorder = null, stream = null, chunks = [], recordStarted = 0, audioElement = null, audioURL = '', busy = false, reviewAbort = null, generation = 0, records = [], profileId = '', lastDraftSerialized = null;
    const params = new URLSearchParams(root.location.search), preview = params.get('preview') === '1';
    const extensiveMaterialId=params.get('activity')==='extensive'&&params.get('mode')==='practice'?params.get('material'):null;
    let pendingParent = params.get('parent') && ['correction','retest'].includes(params.get('kind')) ? {parentId:params.get('parent'),kind:params.get('kind'),mode:params.get('mode')==='assessment'?'assessment':'practice'} : null;
    let mediaDrafts=[],mediaBudgetSignature='',mediaBudgetPending=null,budgetDisposed=false,recordsRevision=0,historyRead=0,recordsReady=false;
    function setRecords(works){records=works;recordsRevision++;recordsReady=true;}
    let autoRouted=false,placementReroute=false,renderedDayHash=null;let recordingSaving=false,activitySave=null,submissionProgress=null;const deletedDrafts=new Map();
    function beginSubmissionProgress(message){submissionProgress?.cancel();const owner=attempt,guard=generation,profile=profileId;submissionProgress=createSubmissionProgress({node:$('courseSubmitStatus'),isCurrent:()=>owner===attempt&&guard===generation&&profile===profileId&&!storageBroken&&(root.IELTSProfiles?.current().id||'legacy')===profile});return submissionProgress.start(message);}
    function load() {
      profileId = root.IELTSProfiles?.current().id || 'legacy';
      try { storage = root.IELTSProfiles?.storage() || (preview ? root.sessionStorage : root.localStorage); const raw = storage.getItem(KEY); state = raw ? parseState(raw) : newState(); storageBroken = false; }
      catch (_) { state = newState(); storageBroken = true; notice('课程草稿无法读取。已保留原记录；本页可浏览，写入已暂停，请先到备份中心处理。', true); }
    }
    function mutate(change) {
      if (storageBroken) throw Error('课程记录不可写，原记录已保留。');
      const raw = storage.getItem(KEY), next = raw ? parseState(raw) : newState(); change(next); const clean = parseState(next);
      if (storage.getItem(KEY) !== raw) throw Error('另一页面刚更新了课程记录，请刷新后继续。');
      const serialized=JSON.stringify(clean);if(serialized.length>8*1024*1024)throw Error('课程草稿超过8 MB，当前输入保留；请先归档或处理其他未提交草稿。');storage.setItem(KEY, serialized); state = clean;
    }
    function persistDraft() {
      if (!attempt || submittedRecord) return;
      try {
        mutate(next => {
          const existing = next.drafts[attempt.id];
          if (existing && lastDraftSerialized !== null && JSON.stringify(existing) !== lastDraftSerialized) throw Error('本草稿已被另一个页面修改；当前输入仍保留在页面，请复制后刷新。');
          next.day = day; next.drafts[attempt.id] = copy(attempt);
        });
        lastDraftSerialized = JSON.stringify(state.drafts[attempt.id]);return true;
      } catch (error) { running = false; notice(error.message, true);return false; }
    }
    function scheduleSave() { clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 350); }
    function allDrafts(){let memory=[];try{const state=root.IELTSMemory?.read?.();memory=[...Object.values(state?.drafts||{}),...(root.IELTSEssentialVocabulary?.activityDrafts?.(state)||[])];}catch(_){}const list=[...Object.values(state?.drafts||{}),...memory,...mediaDrafts].filter(d=>!records.some(r=>r.id===d.id));return attempt&&!submittedRecord?[...list.filter(d=>d.id!==attempt.id),attempt]:list;}
    async function refreshMediaBudget(knownRecords){
      if(!root.IELTSYearPlanner?.readBudget)return;
      const owner=profileId,current=()=>!budgetDisposed&&!storageBroken&&owner===profileId&&(root.IELTSProfiles?.current().id||'legacy')===owner;
      if(mediaBudgetPending){await mediaBudgetPending;if(!current())return;return refreshMediaBudget(records);}
      const revision=recordsRevision,pending=(async()=>{
        let works=knownRecords||await R.list();if(!current())return false;
        if(knownRecords){if(works!==records)return true;}
        else if(revision!==recordsRevision){works=records;}else setRecords(works);
        const committed=recordsRevision,result=await root.IELTSYearPlanner.readBudget({records:works,drafts:allDrafts().filter(d=>d.source!=='media-draft'),profileId:owner,getProfile:()=>root.IELTSProfiles?.current().id||'legacy',storage,library:root.IELTSMediaLibrary});
        if(!current())return false;if(committed!==recordsRevision)return true;
        mediaDrafts=result.mediaDrafts;const signature=JSON.stringify([mediaDrafts,works.map(r=>[r.id,r.version,r.activeSeconds])]);
        if(signature!==mediaBudgetSignature){mediaBudgetSignature=signature;root.dispatchEvent(new CustomEvent('ielts:budget-changed',{detail:{profileId:owner,records:works,drafts:allDrafts(),budget:calendarBudget()}}));}
        if(attempt&&running&&calendarBudget().exhausted)pauseForBudget();return false;
      })();mediaBudgetPending=pending;
      try{const retry=await pending;if(mediaBudgetPending===pending)mediaBudgetPending=null;if(retry&&current())return refreshMediaBudget(records);}finally{if(mediaBudgetPending===pending)mediaBudgetPending=null;}
    }
    function calendarBudget(){const budget=root.IELTSYearPlanner?.calendarBudget(records,allDrafts(),root.IELTSYearPlanner.dateKey(Date.now()))||{date:new Date().toISOString().slice(0,10),budgetMinutes:360,spentMinutes:0,remainingMinutes:360,exhausted:false};return root.IELTSStudyTimer?.budget?.(budget)||budget;}
    function courseStartDate(){try{return JSON.parse(storage.getItem('ielts52-daily-plan-v1')||'null')?.startDate;}catch(_){return null;}}
    function emitCourse(type,extra={}){root.dispatchEvent(new CustomEvent('ielts:course-'+type,{detail:{day,courseDay:day,profileId,skill:task?.id,task:task?copy(task):null,material:material?copy(material):null,mode:attempt?.mode,draft:attempt?copy(attempt):null,record:submittedRecord?copy(submittedRecord):null,audioDOM:$('courseAudio'),passageDOM:$('coursePassage'),questionsDOM:$('courseQuestions'),outputDOM:$('courseOutput'),markAssistance:assistance,...extra}}));}
    function captureInProgress(){return recordingSaving||recorder?.state==='recording'||oralController?.getState?.().busy===true||activityController?.getMediaState?.()?.busy===true;}
    function budgetSaveReady(){
      const budget=calendarBudget();if(!attempt||submittedRecord||!budget.exhausted||budget.dayEnded||budget.budgetError||storageBroken)return false;
      if(['reading','listening','grammar'].includes(task?.id)){try{const grade=A.gradeMaterialForArtifact(material,{answers:attempt.answers,materialBinding:attempt.materialBinding,materialVersion:String(material.version),gradingPolicy:attempt.materialBinding.gradingPolicy,objectiveGrading:attempt.materialBinding.gradingPolicy});return grade.allGradable&&grade.answered===grade.total&&grade.total>0;}catch(_){return false;}}
      if(task?.id==='writing')return A.countWords(attempt.text)>=Math.max(1,material.minWords||1);
      if(task?.id==='speaking')return attempt.media.length>0&&modelStatus(attempt).complete&&!recordingSaving&&recorder?.state!=='recording';
      return false;
    }
    function pauseForBudget(){if(!attempt||submittedRecord)return;const budget=calendarBudget(),preserveCapture=budget.dayEnded&&captureInProgress();running=false;attempt.interrupted||=attempt.mode==='assessment';if(!preserveCapture)activityController?.pause?.();listeningController?.pause?.();if(!preserveCapture)oralController?.cancel?.();stopMedia();persistDraft();syncSessionVisibility();$('coursePause').textContent='下一日继续';notice((budget.dayEnded?'今日学习已主动结束。可在番茄钟点击“恢复今日任务”后手动继续，实际已用预算不变。':'今日360分钟预算已用完。')+'原始输入与录音保留为未提交草稿，下一日也可继续；本日课程保持未完成。'+(preserveCapture?' 请结束并保存仍在进行的原音，不再开启新任务。':''));emitCourse('budget-paused',{budget});}
    function mayContinue(){const timer=root.IELTSStudyTimer?.snapshot?.();if(timer?.running&&timer.phase!=='focus'){notice('番茄钟正在休息。当前草稿保留，休息结束后手动继续；可在右下角查看或调整。');return false;}const budget=calendarBudget();if(budget.budgetError){notice(budget.budgetError,true);return false;}if(budget.exhausted){notice(budget.dayEnded?'今日学习已主动结束。可在番茄钟点击“恢复今日任务”后手动继续；已有草稿、作品和原音保留，实际已用预算不会重置。':'今日360分钟学习预算已用完。已有草稿和作品保留，下一日可继续；今天不会标记完成。');return false;}return true;}
    function vocabularyReviewReady(options,resolvedDay){
      if(day<2||task?.id!=='vocabulary'||options.parentId||options.relearn||!root.IELTSEssentialCourse?.state||!root.IELTSMemory)return true;
      try{
        const review=root.IELTSEssentialCourse.state({day,data,records,drafts:allDrafts(),memory:root.IELTSMemory.read(),budget:calendarBudget(),dayPlan:resolvedDay,now:Date.now()});
        if(!review.dailyReviewRequired)return true;
        notice('先完成今日必做词汇复习，再开始新的词汇原稿。到期词、错词间隔及未提交的复习输入均保留。');const link=el('a','','去复习');link.href='词汇记忆.html?day='+day+(preview?'&preview=1':'');$('courseNotice').append(' ',link);return false;
      }catch(error){notice('词汇复习顺序暂未核对：'+error.message+' 已有作答保留，请重试。',true);return false;}
    }
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
    function leave() { activityController?.destroy();activityController=null;listeningController?.destroy();listeningController=null;oralController?.destroy();oralController=null;root.dispatchEvent(new CustomEvent('ielts:vocabulary-testing',{detail:{active:false}})); advanceTimer(); if (attempt && !submittedRecord) { attempt.interrupted ||= attempt.mode === 'assessment'; persistDraft(); } running = false; stopMedia(); reviewAbort?.abort(); generation++; root.dispatchEvent(new CustomEvent('ielts:lesson-clear'));root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:false}})); attempt = null; submittedRecord = null; lastDraftSerialized = null; $('courseSession').hidden = true; $('courseStart').hidden = false;configureReadingLayout(false); }
    function showDay(value, preferredMaterial) {
      const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 365) { notice('课程日必须是 1–365 的整数。', true); $('courseDay').value = day || 1; return; }
      leave(); day = number; $('courseDay').value = day;
      const item = dayPlan(day), week = data.weeks.find(w => w.week === item?.week);
      renderedDayHash=A.materialContentHash(item);
      $('courseDayTitle').textContent = '第 ' + item.week + ' 周 · ' + (week?.title || '');
      $('courseTasks').replaceChildren();
      item.tasks.forEach(t => { const b = button('', () => showTask(t)); b.className = 'course-task'; b.dataset.taskId = t.id; b.append(el('strong','',NAMES[t.id] + ' · 参考 ' + t.minutes + ' 分钟'),el('small','',taskDisplayText(t.deliverable,t.id)+(day>=2&&day<=10?'':root.IELTSCurriculumCoverage?.practiceLabel(t)?' · '+root.IELTSCurriculumCoverage.practiceLabel(t):''))); $('courseTasks').append(b); });
      const preferred=materialMap.get(preferredMaterial);const selected = preferredMaterial && (item.tasks.find(t=>t.id===preferred?.skill)||item.tasks.find(t => t.materialIds.includes(preferredMaterial))); showTask(selected || item.tasks[0], preferredMaterial);
      const current = R.currentDay();
      if (!storageBroken){try{const placement=placementRoute(data);notice(placement?day<placement.startDay?'这是入学起点前的基础回看；已有草稿与错题保留，未开始的基础课不计新起点积压。':'已采用四项入学测评，从第 '+placement.startDay+' 课进入匹配程度的课程；作品按实际课程日保存，掌握后按预算继续。':current&&day>current?'提前浏览材料；提交作品关联实际学习日，不自动完成未来日程。':'当天可用学习预算 '+item.tasks.reduce((n,t)=>n+t.minutes,0)+' 分钟；各项时间仅供安排，掌握后可立即继续，不必等计时。');}catch(error){storageBroken=true;$('courseBegin').disabled=true;notice('入学测评起点无法核实：'+error.message+'；已有作品与草稿保留，请到备份中心处理。',true);}}
      refreshHistory();
    }

    function vocabularyProgress(required,works=continuationRecords(),cache){
      if(!recordsReady||storageBroken||!root.IELTSTodayHub?.vocabularyModuleProgress)return null;
      const key=JSON.stringify(required.materialIds||[]);if(cache?.has(key))return cache.get(key);
      try{const result=root.IELTSTodayHub.vocabularyModuleProgress(required,works,{data,dayNumber:day,materials:data.materials,recordCorrectionStatus:r=>root.IELTSMistakes?.recordCorrectionStatus?.(r),historicalRecordCorrectionStatus:r=>root.IELTSMistakes?.historicalRecordCorrectionStatus?.(r)});cache?.set(key,result);return result;}catch(_){return null;}
    }
    function vocabularyStatusText(progress,group=false,materialId){
      if(!progress)return'状态待核对';
      if(materialId&&progress.updatedMaterialIds?.includes(materialId))return'原版已提交 '+(progress.historicalCyclesByMaterial?.[materialId]||0)+' 次 · 当前版本含新增内容，待核对';
      if(materialId&&progress.verificationPendingMaterialIds?.includes(materialId)&&!progress.allSubmitted)return'原稿待核验 · 已保存内容保留';
      const submitted=progress.allSubmitted?'已提交':group?'新版尚未提交':'已提交 '+progress.submittedGroups+'/'+progress.totalGroups+' 组';
      return submitted+' · 已学习 '+progress.completedCycles+' 次'+(progress.completed?' · 已完成':'')+(progress.correctionPending?' · 当前错题待订正':progress.pending||progress.verificationPending?' · 待核对':'');
    }
    function materialLearningStatus(m,cache){
      const base=dayPlan(day)?.tasks.find(t=>t.id===m.skill)||task,one={...base,id:m.skill,materialIds:[m.id]};
      if(m.skill==='vocabulary'){const progress=vocabularyProgress(one,continuationRecords(),cache);return{done:progress?.completed===true,count:progress?.completedCycles||0,vocabulary:progress};}
      let completionValid=false;try{completionValid=root.IELTSMistakes?.forDay?.(day)?.completionValid===true;}catch(_){}
      const works=continuationRecords(),hub=root.IELTSTodayHub,progress=hub?.learningStatus?.(one,works,{data,dayNumber:day,materials:data.materials,completionValid,recordCorrectionStatus:r=>root.IELTSMistakes?.recordCorrectionStatus?.(r),historicalRecordCorrectionStatus:r=>root.IELTSMistakes?.historicalRecordCorrectionStatus?.(r)}),count=hub?.learningCount?.(one,works,{data,dayNumber:day})||0;
      return{done:progress?.done===true,count};
    }
    function updateLearningBadges(){
      const cache=new Map(),works=continuationRecords();doc.querySelectorAll('.course-material-button').forEach(b=>{const m=materialMap.get(b.dataset.materialId);if(!m)return;let badge=b.querySelector('.course-learning-status');if(!badge){badge=el('small','course-learning-status');b.append(badge);}const s=materialLearningStatus(m,cache);badge.textContent=m.skill==='vocabulary'?vocabularyStatusText(s.vocabulary,true,m.id):(s.done?'已完成 · ':'')+'已学习 '+s.count+' 次';});
      doc.querySelectorAll('.course-task').forEach(b=>{const t=dayPlan(day)?.tasks.find(t=>t.id===b.dataset.taskId);if(!t)return;let badge=b.querySelector('.course-learning-status');if(!badge){badge=el('small','course-learning-status');b.append(badge);}if(t.id==='vocabulary'){badge.textContent=vocabularyStatusText(vocabularyProgress({...t,materialIds:t.coreMaterialIds||t.materialIds},works,cache));return;}let valid=false;try{valid=root.IELTSMistakes?.forDay?.(day)?.completionValid===true;}catch(_){}const s=root.IELTSTodayHub?.learningStatus?.(t,records,{data,dayNumber:day,materials:data.materials,completionValid:valid,recordCorrectionStatus:r=>root.IELTSMistakes?.recordCorrectionStatus?.(r),historicalRecordCorrectionStatus:r=>root.IELTSMistakes?.historicalRecordCorrectionStatus?.(r)}),count=root.IELTSTodayHub?.learningCount?.(t,records,{data,dayNumber:day})||0;badge.textContent=(s?.done?'已完成 · ':'')+'已学习 '+count+' 次';});
    }
    function latestSavedFor(m){return records.filter(r=>r.dayNumber===day&&r.materialId===m.id&&r.skill===m.skill&&r.taskId===m.skill&&A.decodeArtifact(r)).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||(b.version||0)-(a.version||0)||b.id.localeCompare(a.id))[0];}
    function resumableDraft(d,m){
      if(!m||d.kind!=='original'||d.parentId||!latestSavedFor(m))return true;
      let value=d;
      if(d.taskId==='speaking'&&d.text){try{const oral=JSON.parse(d.text);if(oral?.kind==='oral-practice-progress'&&Object.keys(oral).every(k=>['kind','workIds','segmentIndex'].includes(k))&&Array.isArray(oral.workIds)&&oral.workIds.every(id=>typeof id==='string'&&!id)&&Number.isInteger(oral.segmentIndex)&&oral.segmentIndex>=0)value={...d,text:''};}catch(_){}}
      const progress=draftProgress(value,m),modelActivity=d.modelReading?.segments?.some(segment=>segment.workId||segment.evidenceId||segment.professional||segment.coach);
      // Earlier continue routes could leave an empty original beside an
      // already submitted answer. Keep that draft, but do not hide the answer.
      return progress.compatible===false||progress.score.some(Boolean)||modelActivity===true;
    }
    function draftFor(m){return m&&preferredDraft(allDrafts().filter(d=>resumableDraft(d,materialMap.get(d.materialId))),{courseDay:day,taskId:m.skill,materialId:m.id,materialFor:id=>materialMap.get(id),profileId,records});}
    function vocabularyRetainedDraftFor(m){
      if(!m||storageBroken)return null;
      try{const raw=storage.getItem(KEY),latest=raw?parseState(raw):newState(),drafts=new Map(allDrafts().map(d=>[d.id,d]));for(const draft of Object.values(latest.drafts))drafts.set(draft.id,draft);if(attempt&&!submittedRecord)drafts.set(attempt.id,attempt);return preferredDraft([...drafts.values()].filter(d=>resumableDraft(d,materialMap.get(d.materialId))),{courseDay:day,taskId:'vocabulary',materialId:m.id,materialFor:id=>materialMap.get(id),profileId,records});}catch(_){return null;}
    }
    function replayViewCurrent(owner,view){return !storageBroken&&owner===profileId&&view===generation&&(root.IELTSProfiles?.current().id||'legacy')===owner;}
    function renderSavedModuleEntries(){
      if(!task)return;const box=$('courseMaterials');let section=box.querySelector('.course-saved-works');
      const latest=new Map();for(const record of records.filter(r=>r.dayNumber===day&&r.taskId===task.id&&r.skill===task.id&&A.decodeArtifact(r)).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||(b.version||0)-(a.version||0)||b.id.localeCompare(a.id)))if(!latest.has(record.materialId))latest.set(record.materialId,record);
      if(!section){section=el('section','course-saved-works');box.append(section);}section.replaceChildren();section.hidden=!latest.size;if(!latest.size)return;
      section.append(el('h3','','本模块已保存作答 · '+latest.size+' 份材料'));
      const owner=profileId,view=generation;for(const record of latest.values()){const row=el('div','course-saved-work'),link=button('查看已保存作答：'+record.title,()=>replayViewCurrent(owner,view)&&viewRecord(record));link.dataset.recordId=record.id;row.append(link,el('small','',new Date(record.submittedAt).toLocaleString()+' · '+(record.kind==='retest'?'重新学习／复测原稿':record.kind==='correction'?'订正原稿':'首次原稿')));section.append(row);}
    }
    function updateSavedIntro(){
      if(attempt||!material||pendingParent)return;const saved=latestSavedFor(material),draft=draftFor(material),box=$('courseMaterialIntro');
      $('courseBegin').textContent=draft?'继续未提交原稿':saved?'查看原作答':'开始这份材料';
      if(draft&&!box.querySelector('.course-draft-entry')){const owner=profileId,view=generation,row=el('section','course-draft-entry');row.append(el('p','',draftProgress(draft,material).label+'；继续原ID与原始输入。'),button('继续未提交原稿',()=>replayViewCurrent(owner,view)&&resumeDraft(draft.id)));box.append(row);}
      if(!saved||box.querySelector('.course-saved-entry'))return;
      const row=el('section','course-saved-entry'),status=materialLearningStatus(material);row.append(el('p','course-learning-status',material.skill==='vocabulary'?vocabularyStatusText(status.vocabulary,true,material.id):(status.done?'已完成 · ':'')+'已学习 '+status.count+' 次'),button('查看已保存的原作答',()=>viewRecord(saved)));box.append(row);
    }
    async function relearn(record){
      if(storageBroken||busy)return false;const owner=profileId,view=generation;
      let works;try{works=await R.list();}catch(error){notice('原稿暂未核对：'+error.message,true);return false;}
      if(owner!==profileId||view!==generation||(root.IELTSProfiles?.current().id||'legacy')!==owner)return false;
      const original=works.find(r=>r.id===record.id),m=original&&materialForRecord(original,materialMap.get(original.materialId),A),a=original&&A.decodeArtifact(original);
      if(!original||!m||!a){notice('原材料版本暂不能核实，原作答保留；不会用新题替换旧题。',true);return false;}
      setRecords(works);const draft=preferredDraft(allDrafts().filter(d=>resumableDraft(d,materialMap.get(d.materialId))),{courseDay:original.dayNumber||a.courseDay,taskId:original.skill,materialId:m.id,materialFor:id=>materialMap.get(id),profileId,records:works});
      if(draft?.materialId===m.id){await resumeDraft(draft.id);notice('已恢复这份材料的未提交草稿。原来的完成记录保留。');return true;}
      showDay(a.courseDay||original.dayNumber||day,m.id);showMaterial(m,{showSaved:false});task={...task,...(m.taskContract||{}),id:original.skill};
      return begin({parentId:original.id,kind:'retest',mode:'practice',relearn:true});
    }
    function appendRelearning(container,record,m){
      const status=materialLearningStatus(m),row=el('section','course-relearning'),label=el('p','course-learning-status',m.skill==='vocabulary'?vocabularyStatusText(status.vocabulary,true,m.id):(status.done?'已完成 · ':'')+'已学习 '+status.count+' 次');
      row.append(label,el('p','course-small','以下是已保存的原作答。重新学会另存一次练习，保留原答案与成绩；同题练习不作为新的独立测评。'));
      const again=button('重新学',async()=>{again.disabled=true;try{await relearn(record);}catch(error){notice('暂未开始重学：'+error.message+'。原作答保留。',true);}finally{again.disabled=false;}});again.className='course-relearn';row.append(again);container.append(row);
    }
    function renderSavedRecord(record,m){
      const artifact=A.decodeArtifact(record);if(!artifact)return false;
      task={...task,...(m.taskContract||{}),id:record.skill};material=m;
      attempt={id:record.id,...copy(artifact),taskId:record.skill,kind:record.kind,parentId:record.parentId,media:record.media,assistance:record.assistance,submittedAt:record.submittedAt,materialId:m.id};
      submittedRecord=record;running=false;renderSession();$('courseSubmit').disabled=true;
      doc.querySelectorAll('#courseQuestions input,#courseQuestions textarea,#courseOutput textarea').forEach(n=>n.disabled=true);
      showResult(record);$('courseSubmitStatus').textContent='已保存的原作答 · 只读查看';updateLearningBadges();return true;
    }
    function showTask(value, preferredMaterial) {
      leave(); const preferred=materialMap.get(preferredMaterial); task = preferred?.independentBank===true ? independentTask(preferred) : value; doc.querySelectorAll('.course-task').forEach(b => b.setAttribute('aria-current',String(b.dataset.taskId === task.id)));
      $('courseMaterials').replaceChildren(); const orderedIds=root.IELTSCourseExpansion?.orderedMaterialIds?.(task,day)||task.materialIds,materials = orderedIds.map(id => materialMap.get(id)).filter(Boolean),vocabularyGroups=vocabularyTaskSummary(task,data,{day});
      materials.forEach((m,index) => { const b = button('',()=>showMaterial(m)); b.className='course-material-button'; b.dataset.materialId=m.id; b.append(el('span','',m.title),el('small','',(materials.length>1?'第 '+(index+1)+' / '+materials.length+' 份 · ':'')+(vocabularyGroups?(vocabularyGroups.groups.find(group=>group.materialId===m.id)?.wordCount||0)+' 个词项 · ':'')+(root.IELTSCourseExpansion?.taskMaterialLabel?.(task,m.id,day)||(m.independentBank?'独立短测':m.pool==='final'?'末期保留卷':m.pool==='gate'?'关卡 '+(m.form||''):task.materialPractice?.find(p=>p.materialId===m.id)?.cycle==='scheduled-reuse'?'计划巩固同ID':task.materialPractice?.find(p=>p.materialId===m.id)?.cycle==='first-planned'?'计划首次新练':'练习'))+' · 参考 '+m.estimatedMinutes+' 分钟')); $('courseMaterials').append(b); });
      const retained=preferredDraft(allDrafts(),{courseDay:day,taskId:task.id,materialFor:id=>materialMap.get(id),profileId,records});
      const retainedGrammar=task.id==='grammar'&&dayPlan(day)?.familyGrammar?.originalTask?.materialIds?.includes(retained?.materialId);
      if(day>=2&&day<=10&&retained&&(task.materialIds.includes(retained.materialId)||retainedGrammar)&&retained.materialId!==materials[0]?.id&&draftProgress(retained,materialMap.get(retained.materialId)).score.some(Boolean)){const go=button('继续已保存的复习作答（原答案保留）：'+(materialMap.get(retained.materialId)?.title||NAMES[task.id]),()=>root.IELTSTodayNavigation.resumeDraft(retained.id));go.className='course-retained-draft';go.dataset.draftId=retained.id;$('courseMaterials').append(go);}
      showMaterial(navigationMaterial(task,preferredMaterial,materialMap,day));
      renderSavedModuleEntries();
    }
    function showMaterial(value,options = {}) {
      leave(); material = value; $('courseMaterialIntro').replaceChildren();
      if (!material) { $('courseMaterialIntro').append(el('p','','此任务未映射到有效材料。请反馈课程日和任务名称；不会自动记完成。')); $('courseBegin').disabled = true; return; }
      $('courseBegin').disabled = storageBroken;
      doc.querySelectorAll('.course-material-button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.materialId===material.id)));
      $('courseMaterialIntro').append(el('p','course-material-meta',material.source?.yearExpansion?'全年普通课程 · '+(material.level||''):material.independentBank?'独立材料 · '+(material.level||'')+' · '+(material.skill==='listening'?(material.audioKind==='human'&&material.audioSynthetic===false?'真人朗读':'合成示范'):material.skill==='reading'?'原创阅读':material.skill==='writing'?'独立写作':'独立练习'):material.source?.publicSourceId?'公开补充 · '+(material.level||'')+' · '+(material.source.provider||'公开来源'):'第 '+material.week+' 周 · '+(material.level||'')+' · '+material.source.rights),el('h2','',material.title),el('p','',taskDisplayText(task.instructions,task.id,day>=2&&day<=10?task.minutes:undefined)),el('p','course-small','本任务交付：'+taskDisplayText(task.deliverable,task.id)+'。'+(material.source.verification==='reviewed'?'已完成内容核对；AI 辅助原创仍可能有误。':'内容待复核，仅供练习，不纳入达标判断。')));
      const difference=vocabularyPlanDifference(material,day,data,{vocabulary:root.IELTSVocabularyPractice,getDay:item=>dayPlan(item.day)});if(difference)$('courseMaterialIntro').append(el('p','course-feedback','第 '+day+' 课本组 '+difference.total+' 词；与第 '+difference.previousDay+' 课相比，'+difference.newCount+' 个新词、'+difference.reviewCount+' 个巩固词。新练习先显示本课新词；已保存草稿保持原顺序与原始作答。'));
      const vocabularySummary=vocabularyTaskSummary(task,data,{day,currentMaterial:material});if(vocabularySummary){const index=vocabularySummary.groups.findIndex(group=>group.materialId===material.id);if(index>=0)$('courseMaterialIntro').prepend(el('p','course-step-guide','本课词汇共 '+vocabularySummary.wordCount+' 个词项，分 '+vocabularySummary.groupCount+' 组。当前第 '+(index+1)+' 组：'+(vocabularySummary.groups[index]?.wordCount||0)+' 个词项。完成本组后，按下方按钮继续下一组；到期复习另行计入今日预算。'));}
      $('courseMode').value = task.mode === 'assessment' || material.pool !== 'training' ? 'assessment' : 'practice';
      if(material.independentBank){$('courseMaterialIntro').append(el('p','course-small','独立材料库：这是未见能力的短测样本，不能替代完整雅思试卷或完成当天核心任务。开始后记录曝光；暂停、看提示和重复作答均保留标记。'));const back=el('a','','返回陌生材料库');back.href='陌生材料库.html'+(preview?'?preview=1':'');$('courseMaterialIntro').append(back);}
      if(material.id===extensiveMaterialId&&!pendingParent){$('courseMode').value='practice';$('courseMaterialIntro').append(el('p','course-small','泛读／泛听入口：本次默认按练习方式打开，仍登记材料曝光。只记录实际活动与交付物，不改变当天计划分钟或数量。'));}
      if(task.id==='speaking'){const level=String(material.level||'A0').match(/A[012]|B[12]|C[12]/g)?.at(-1)||'A0',scenario=['A0','A1'].includes(level)?'intro':level==='A2'?'appointment':level==='B1'?'part1':'part2',link=el('a','','补充：与AI进行适级无稿原音对话');link.href='无稿口语.html?day='+day+'&material='+encodeURIComponent(material.id)+'&task='+scenario+(preview?'&preview=1':'');$('courseMaterialIntro').append(link,el('p','course-small','对话单独保留每轮原音与反馈，可用于迁移练习；课程核心原稿与关卡仍按各自证据核对。'));}
      const plannedPractice=day>=2&&day<=10?'':root.IELTSCurriculumCoverage?.practiceLabel(task);if(plannedPractice)$('courseMaterialIntro').append(el('p','course-small','排课说明：'+plannedPractice+'；开始材料时仍单独记录本人的已见／未见状态。'));
      const guide=taskGuide[task.id];if(guide)$('courseMaterialIntro').prepend(el('p','course-step-guide',material.independentBank?'独立短测：开始后独立作答，提交前不开放词义、AI详解或答案提示。':guide[0]+'：'+guide[1]));
      const modelTraining=task.id==='speaking'&&validateModelReading(null,material,task,data,day,{independentRetest:pendingParent?.kind==='retest'}).required;
      if (['vocabulary','reflection'].includes(task.id)||modelTraining) $('courseMode').value='practice';
      if(material.source?.publicSourceId){const required=task.publicCourseAssignments?.some(a=>a.materialId===material.id);$('courseMode').value='practice';$('courseMaterialIntro').append(el('p','course-small',(contextPracticeAPI()?.isContextMaterial?.(material)?'本日语境语法任务：先真实作答并核对语义，再按已安排的延迟时间做新场景练习。':required?'本日正式听读任务：按原始作答与必要订正核对完成。':'已保存的公开素材练习：按原归属恢复。')+'同文听读共享曝光，结果不作为独立测评、陌生迁移或雅思成绩证明。'+(material.skill==='listening'?'原声来自官方同页 Conversation，音文尚未独立听审。':'')));}
      if(material.source?.yearExpansion){$('courseMode').value='practice';$('courseMaterialIntro').append(el('p','course-small','全年适级普通练习：保留本份材料版本，完成与订正独立核验；不作为陌生测评、进阶迁移或雅思成绩证据。'));}
      if(task.id==='grammar'){const unit=data.familyGrammarRelease?.units?.find(u=>u.day===day),status=unit&&unit.materialId===material.id?'本课新语法单元':unit?'保留的原语法练习':'语法';$('courseMaterialIntro').prepend(el('p','course-step-guide','课程第 '+day+' 课 · '+status));}
      $('courseMode').disabled = !!material.source?.yearExpansion||['vocabulary','reflection'].includes(task.id)||modelTraining||material.independentBank===true||!!material.source?.publicSourceId;if(task.id==='vocabulary'){const section=el('section','course-vocabulary-overview course-vocabulary-submission');section.setAttribute('aria-label','本课完整词汇安排');renderVocabularyModule(section);$('courseMaterialIntro').append(section);}updateLearningBadges();announceView();
      if(options.showSaved!==false&&!pendingParent&&!draftFor(material)){const saved=latestSavedFor(material);if(saved){const pinned=materialForRecord(saved,material,A);if(pinned)renderSavedRecord(saved,pinned);else showPreservedRecord(saved);}}
      updateSavedIntro();
    }
    async function begin(options = {}) {
      try{await refreshMediaBudget();}catch(error){notice('活动预算核对失败：'+error.message+' 原始草稿保留，请重试。',true);return;}if(!mayContinue())return;
      if (!options.parentId && pendingParent) options={...pendingParent,mode:pendingParent.kind==='retest'?'assessment':'practice'};
      if (!material || storageBroken || busy) return;
      let resolvedDay=dayPlan(day),courseAssignment=null,contextPracticeAssignment=null,lessonSupplement=null,yearStart=options.yearStart||null,yearParent=null;
      // Sidebar navigation must obey the same review order as the daily queue.
      // Saved answers, existing drafts and explicit corrections/relearning keep
      // their original entry points; only a new vocabulary original waits.
      if(!vocabularyReviewReady(options,resolvedDay))return false;
      if(material.source?.yearExpansion&&!options.relearn){if(options.kind==='retest'){notice('全年材料只作普通练习，不创建独立复测。',true);return false;}const parent=options.parentId&&records.find(r=>r.id===options.parentId);if(parent){const original=A.decodeArtifact(parent);try{yearParent=yearCourseAPI().cleanAssignment(original?.yearAssignment,original?.materialBinding,day,{assessment:A,player:root.IELTSCoursePlayer,data});}catch(error){notice(error.message,true);return false;}}else if(!yearStart){notice('请从全年普通练习队列显式开始，已有草稿请从原稿列表恢复。',true);return false;}options={...options,mode:'practice'};}
      if(root.IELTSAdaptivePlan?.adoptStarted){const owner=profileId,view=generation,mid=material.id,ownerDay=day;try{const fresh=await R.list();if(owner!==profileId||view!==generation||mid!==material?.id||ownerDay!==day)return;setRecords(fresh);root.IELTSAdaptivePlan.adoptStarted({records,drafts:allDrafts(),exposures:state.exposures});resolvedDay=dayPlan(day);}catch(error){notice('开课前历史核对失败：'+error.message+' 原始稿件保留，请重试。',true);return;}if(owner!==profileId||view!==generation||mid!==material?.id||ownerDay!==day||!mayContinue())return;}
      if(yearStart){try{await yearCourseAPI().confirmStart(yearStart);}catch(error){notice(error.message,true);return false;}}
      if(!options.relearn&&material.id==='day02-expansion-vocabulary'&&!resolvedDay.tasks.some(t=>t.materialIds.includes(material.id))){const api=lessonSupplementAPI(),parent=options.parentId&&records.find(r=>r.id===options.parentId),artifact=parent&&A.decodeArtifact(parent);if(!api){notice('补充词汇来源组件尚未加载，原稿保留。',true);return;}if(parent&&parent.dayNumber===day&&artifact?.lessonSupplement&&options.kind!=='retest'){try{lessonSupplement=api.clean(artifact.lessonSupplement,artifact.materialBinding,day);}catch(error){notice(error.message,true);return;}}else{const candidate=learningQueue()?.entries.find(e=>e.lessonSupplement&&e.kind==='extra'&&e.day===day&&e.materialId===material.id&&e.fitsBudget===true);if(!candidate){notice('新增词尚未通过来源、到期复习或今日预算核验，保留待补。',true);return;}lessonSupplement=candidate.entry.lessonSupplement;}if(options.kind==='retest'){notice('本组只作普通补充，不创建独立复测。',true);return;}options={...options,mode:'practice'};}
      if(!options.relearn&&material.source?.publicSourceId&&['reading','listening'].includes(material.skill)){
        const owner=profileId,view=generation,mid=material.id,ownerDay=day;
        try{const fresh=await R.list();if(owner!==profileId||view!==generation||mid!==material?.id||ownerDay!==day)return;setRecords(fresh);await refreshMediaBudget(fresh);}catch(error){notice('补充练习状态核对失败：'+error.message+'，请重试。',true);return;}
        if(owner!==profileId||view!==generation||mid!==material?.id||ownerDay!==day||!mayContinue())return;
        resolvedDay=dayPlan(day);const queue=learningQueue(),parent=options.parentId&&records.find(r=>r.id===options.parentId),correction=parent&&parent.materialId===mid&&parent.dayNumber===day&&options.kind!=='retest';
        courseAssignment=resolvedDay?.publicCourse?.assignments.find(a=>a.materialId===mid&&a.taskId===task.id)||null;
        const canonical=materialMap.get(mid),contractStatus=courseAssignment&&root.IELTSAdaptivePlan?.publicMaterialStatus?.(canonical,courseAssignment,day),requiredTask=resolvedDay?.tasks.find(t=>t.id===task.id),candidate=queue?.entries.find(e=>e.kind==='material'&&e.materialId===mid&&e.taskId===task.id&&!e.draftId&&e.day===day&&e.fitsBudget===true);
        if(!correction&&(!courseAssignment||!contractStatus?.allowed||!requiredTask?.materialIds.includes(mid)||!candidate)){notice(contractStatus?.reason||'这份公开材料未列入本日可开始的听读任务，或当前剩余预算不足。请从对应日任务继续；已有原稿与草稿保留。',true);return;}
        if(!correction){const access=publicPracticeAccess(canonical,resolvedDay,data,records,{assignment:courseAssignment,ownerDayFrozen:!!root.IELTSAdaptivePlan?.read?.().frozenDays?.[day],route:placementRoute(data),drafts:allDrafts(),exposures:state.exposures,assessment:A,now:Date.now(),verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord});if(!access.allowed){notice(access.reason,true);return;}material=canonical;task=requiredTask;}
        if(options.kind==='retest'){notice('公开素材仅作普通练习，不能创建独立测评或陌生迁移证明。',true);return;}
        options={...options,mode:'practice'};
      }
      if(!options.relearn&&contextPracticeAPI()?.isContextMaterial?.(material)){
        const api=contextPracticeAPI(),parent=options.parentId&&records.find(r=>r.id===options.parentId),correction=parent&&parent.materialId===material.id&&parent.dayNumber===day&&options.kind!=='retest';
        if(options.kind==='retest'){notice('语境语法只计普通初学或延迟练习，不创建独立测评。',true);return;}
        contextPracticeAssignment=resolvedDay?.publicContextPractice?.assignments.find(a=>a.materialId===material.id)||null;
        if(!correction){const candidate=learningQueue()?.entries.find(e=>e.kind==='material'&&e.day===day&&e.materialId===material.id&&e.taskId==='grammar'&&!e.draftId&&e.fitsBudget===true),canonical=materialMap.get(material.id),access=api.beginAccess(canonical,contextPracticeAssignment,{data,records,assessment:A,now:Date.now(),recordCorrectionStatus:r=>root.IELTSMistakes?.recordCorrectionStatus?.(r)});if(!candidate||!access.allowed){notice(access.reason||'语境语法尚未列入本日可开始任务或剩余预算不足；保留原任务。',true);return;}material=canonical;task=resolvedDay.tasks.find(t=>t.id==='grammar');}
        options={...options,mode:'practice'};
      }
      // Recheck after all asynchronous admission work. Another page can create
      // a due obligation while Records or source verification is in flight.
      if(!mayContinue()||!vocabularyReviewReady(options,resolvedDay))return false;
      if(root.IELTSPlanState&&storage.getItem('ielts52-daily-plan-v1')===null){const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');storage.setItem('ielts52-daily-plan-v1',JSON.stringify(root.IELTSPlanState.newState(date)));}
      const parent = options.parentId ? records.find(r=>r.id===options.parentId) : null;
      if (options.parentId && !parent) { notice('关联原稿不存在，不能创建伪造的订正或复测。',true); return; }
      if(parent&&parent.skill!==task.id){notice('原稿属于'+(NAMES[parent.skill]||parent.skill)+'。请先选择同技能任务和新材料，再从原稿入口进行订正或复测。',true);return;}
      if(options.relearn&&(!parent||parent.materialId!==material.id||!materialForRecord(parent,materialMap.get(parent.materialId),A))){notice('原稿与材料版本不匹配，原作答保留。',true);return false;}
      const now = new Date().toISOString(), exposed = options.relearn===true||!!material.source?.yearExpansion||materialPreviouslySeen(material,records,data.materials,state.exposures,allDrafts());
      const access=protectedMaterialAccess(material,records,data.materials,{exposures:state.exposures,assessment:A});if(!access.allowed){notice(access.reason,true);return;}
      const kind = parent ? options.kind || 'correction' : 'original';
      let mode = options.relearn?'practice':material.independentBank===true&&kind!=='correction'?'assessment':options.mode || $('courseMode').value;
      if (kind==='retest' && (!A.retestAvailability(parent,[material]).due || material.id===parent.materialId)) { mode='practice'; notice(options.relearn?'正在重新学习；原答案和成绩保留，本次另存普通练习。':'复测尚未到期或仍为同题，已按普通练习记录，不计独立迁移。'); }
      const newAttemptId=R.makeId('course');let binding,dayBinding;try{resolvedDay=root.IELTSContextualVocabulary?.attachBeforeStart?.(resolvedDay,{data,records,drafts:allDrafts(),adaptive:root.IELTSAdaptivePlan,budget:calendarBudget(),now:Date.now()})||resolvedDay;binding=freezeMaterialBinding(material,{assessment:A,task,data,courseData:root.IELTSCourse,courseDay:day,attemptId:newAttemptId});dayBinding=freezeDayPlanBinding(resolvedDay,A);root.IELTSAdaptivePlan?.markStarted(day,resolvedDay);}catch(error){notice('未开始：'+error.message,true);return;}
      attempt = {id:newAttemptId,materialBinding:binding,...(dayBinding?{dayPlanBinding:dayBinding}:{}),...(courseAssignment?{courseAssignment:{...root.IELTSAdaptivePlan.publicContract(courseAssignment),bindingContentHash:binding.contentHash}}:{}),...(contextPracticeAssignment?{contextPracticeAssignment:{...copy(contextPracticeAssignment),bindingContentHash:binding.contentHash}}:{}),...(lessonSupplement?{lessonSupplement:lessonSupplementAPI().bind(lessonSupplement,binding,day)}:{}),materialId:material.id,taskId:task.id,courseDay:day,mode,kind,parentId:parent?.id||null,startedAt:now,activeSeconds:0,activityByDate:{},exposureAtStart:exposed?'seen':'unseen',answers:{},userEvidence:{},text:'',transcript:'',audioAvailable:false,audioCompleted:false,transcriptViewed:false,interrupted:false,assistance:{hint:false,answer:false,ai:false},media:[]};
      if(yearStart||yearParent){try{attempt.yearAssignment=yearStart?yearCourseAPI().bindStart(yearStart,binding,day,{assessment:A,player:root.IELTSCoursePlayer,data}):yearCourseAPI().cleanAssignment({...yearParent,bindingContentHash:binding.contentHash},binding,day,{assessment:A,player:root.IELTSCoursePlayer,data});}catch(error){attempt=null;notice(error.message,true);return false;}}
      material=copy(binding.material);
      if(options.relearn)attempt.assistance.answer=true;
      if (kind==='correction') { const original=A.decodeArtifact(parent); attempt.text=original?.text||''; attempt.transcript=task.id==='speaking'?'':original?.transcript||''; attempt.answers=copy(original?.answers||{}); attempt.assistance.answer=true; attempt.assistance.ai=parent.evaluation.method==='ai'; }
      try { mutate(next=>{ const previous=next.exposures[material.id]; if(previous)attempt.exposureAtStart='seen'; next.exposures[material.id]={firstSeenAt:previous?.firstSeenAt||now,lastSeenAt:now,count:(previous?.count||0)+1,assisted:previous?.assisted||false,courseDays:[...new Set([...(previous?.courseDays||[]),day])].sort((a,b)=>a-b)};for(const id of quotedGrammarSourceIds(material,data,A))if(!next.exposures[id])next.exposures[id]={firstSeenAt:now,lastSeenAt:now,count:1,assisted:false,courseDays:[day]}; next.drafts[attempt.id]=copy(attempt); next.day=day; }); lastDraftSerialized=JSON.stringify(state.drafts[attempt.id]); }
      catch(error) { attempt=null; notice('未开始：'+error.message,true); return; }
      root.IELTSStudyTimer?.studyStarted?.();pendingParent=null; submittedRecord=null; running=true; tickAt=Date.now();root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:attempt.mode==='assessment'}})); renderSession();emitCourse('started'); refreshHistory();
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
      const turns=material.skill==='listening'?root.IELTSPassageFormat?.dialogue?.(String(text||''))||[]:[];
      if(turns.length){
        container.append(el('h3','','听力原文 · 按说话人分行'),el('p','course-small','A、B 等标记代表说话人；同一标记始终是同一角色，不是不同题目或段落。'));
        const speakers=[...new Set(turns.map(turn=>turn.speaker))];
        for(const turn of turns){const row=el('div','course-dialogue-turn');row.dataset.speaker=String(speakers.indexOf(turn.speaker)%4);row.append(el('strong','course-dialogue-speaker','说话人 '+turn.speaker),el('p','',turn.text));container.append(row);}
        root.dispatchEvent(new CustomEvent('ielts:material',{detail:null}));return;
      }
      if(selectable) container.append(el('div','course-reading-note','可左键选择正文词句，再右键直接发送给已连接 AI。只发送选区及原句；作答中使用详解会登记 AI 辅助。'));
      const groups=[];let cursor=0;(root.IELTSPassageFormat?root.IELTSPassageFormat.paragraphs(String(text||'')):String(text||'').split(/\n+/).filter(Boolean)).forEach((paragraph,index)=>{const p=el('p','',paragraph);if(selectable){p.dataset.aiReading='true';p.dataset.aiParagraph=String(index+1);}container.append(p);groups.push({index:index+1,text:paragraph});cursor+=paragraph.length;});
      root.dispatchEvent(new CustomEvent('ielts:material',{detail:selectable?{materialId:material.id,mode:'practice',lesson:{title:material.title,text:String(text||'')},groups}:null}));
    }
    function renderAudio() {
      const box=$('courseAudio');box.replaceChildren();if(material.skill!=='listening')return;
      const turnInfo=root.IELTSPassageFormat?.dialogue?.(material.transcript||'')||[],questionCount=material.questions?.length||0,materialIds=task.materialIds||[],position=materialIds.indexOf(material.id);
      box.append(el('h3','course-listening-title',(position>=0?'本环节第 '+(position+1)+' / '+materialIds.length+' 份录音':'本份录音')+' · '+material.title));
      if(questionCount)box.append(el('p','course-small','本份录音对应下方第 1–'+questionCount+' 题。先通听，再按题号作答；切换材料后题号会重新开始。'));
      if(turnInfo.length)box.append(el('p','course-dialogue-guide','这是一段 '+new Set(turnInfo.map(turn=>turn.speaker)).size+' 人对话。A、B 或姓名标记表示说话人，反复出现是在轮流说话，不是多份材料或答案选项。'));
      const owner=attempt, controls=el('div','course-audio-controls'),note=el('p','course-small');controls.append(note);box.append(controls);
      const credit=audioCreditLink(material,preview);if(credit){const link=el('a','course-small','原音来源与署名');link.href=credit;link.target='_blank';link.rel='noopener';box.append(link);}
      const hasFile=typeof material.audio==='string'&&material.audio.length>0&&!/^\s*(javascript|data):/i.test(material.audio);
      if(hasFile) {
        if(root.IELTSListeningPlayer){
          listeningController=root.IELTSListeningPlayer.mount(controls,{src:material.audio,assessment:attempt.mode==='assessment',
            onAvailable:value=>{if(attempt!==owner||submittedRecord)return;owner.audioAvailable=value;scheduleSave();},
            onComplete:value=>{if(attempt!==owner||submittedRecord)return;owner.audioCompleted=value;scheduleSave();},
            onAssistance:()=>assistance('hint')});
          note.textContent=credit?'真人原音 · 原始来源与许可见署名页':material.audioVoice?'合成课程音频：'+material.audioVoice:'本地课程音频';
        }else{note.textContent='听力播放器未加载，请刷新页面；本次不会计为已听。';}
      } else {
        note.textContent='暂无预生成音频。可尝试浏览器合成朗读；无可用声音时只能做文字练习，不计独立听力。';
        const b=button('用浏览器美式英语朗读（合成）',()=>{const voices=root.speechSynthesis?.getVoices().filter(v=>/^en[-_]US$/i.test(v.lang))||[];if(!voices.length){note.textContent='浏览器未提供美式英语（en-US）声音，请安装美国英语语音或使用美式示范音频；不会自动换用英式。';return;}const utterance=new SpeechSynthesisUtterance(material.transcript||'');utterance.voice=voices[0];utterance.lang='en-US';utterance.onend=()=>{if(storageBroken||attempt!==owner||submittedRecord)return;attempt.audioCompleted=true;attempt.audioAvailable=true;scheduleSave();};utterance.onerror=()=>{if(storageBroken||attempt!==owner||submittedRecord)return;attempt.audioAvailable=false;note.textContent='合成语音未完成，本次不计完整听音。';};attempt.audioAvailable=true;root.speechSynthesis.speak(utterance);if(attempt.mode==='assessment')b.disabled=true;});controls.append(b);
      }
      if(attempt.mode==='practice')controls.append(button('查看听力原文（记为提示）',()=>{attempt.transcriptViewed=true;assistance('hint');renderPassage(material.transcript,false);}));
    }
    function renderQuestions() {
      const owner=attempt,box=$('courseQuestions');box.replaceChildren();box.className='course-questions';if(task.id!==material.skill)return;
      (material.questions||[]).forEach((q,index)=>{
        const card=el('section','course-question'),field=el('fieldset'),legend=el('legend','',(index+1)+'. '+q.prompt);field.append(legend);card.dataset.questionId=q.id;
        if(['single','multi'].includes(q.type)) (Array.isArray(q.displayOrder)?q.displayOrder.map(index=>q.options[index]):A.displayOptions(q,material.id,attempt.id)).forEach(option=>{const label=el('label','course-option'),input=el('input');input.type=q.type==='multi'?'checkbox':'radio';input.name=attempt.id+'-'+q.id;input.value=option;input.checked=q.type==='multi'?Array.isArray(attempt.answers[q.id])&&attempt.answers[q.id].includes(option):attempt.answers[q.id]===option;input.addEventListener('change',()=>{if(attempt!==owner||submittedRecord||!running)return;attempt.answers[q.id]=q.type==='multi'?[...field.querySelectorAll('input:checked')].map(n=>n.value):input.value;scheduleSave();});const labelIndex=q.options.indexOf(option),displayLabel=Array.isArray(q.optionsEnglish)&&q.optionsEnglish.length===q.options.length&&typeof q.optionsEnglish[labelIndex]==='string'&&q.optionsEnglish[labelIndex].trim()?q.optionsEnglish[labelIndex]:option;label.append(input,el('span','',displayLabel));field.append(label);});
        else { const input=el(q.type==='short'?'textarea':'input');if(input.tagName==='INPUT')input.type='text';input.maxLength=2000;input.value=attempt.answers[q.id]||'';input.setAttribute('aria-label',q.prompt);input.addEventListener('input',()=>{if(attempt!==owner||submittedRecord||!running)return;attempt.answers[q.id]=input.value;scheduleSave();});field.append(input);if(q.maxWords)field.append(el('p','course-small','最多 '+q.maxWords+' 个英文词。')); }
        card.append(field);box.append(card);
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
    function continuationRecords(){return !submittedRecord||records.some(record=>record.id===submittedRecord.id)?records:[...records,submittedRecord];}
    function learningQueue(){
      const load=root.IELTSDailyLearningLoad;if(!load)return null;
      return load.build({data,placement:root.IELTSPlacement,startDate:courseStartDate(),getDay:item=>dayPlan(item.day)||item,now:Date.now(),summaryForDay:n=>root.IELTSMistakes?.forDay(n),records:continuationRecords(),drafts:allDrafts(),currentDay:day,selectedDay:state.selectedCourseDay?.day,current:{day,taskId:task?.id,materialId:material?.id,active:!!attempt,submitted:!!submittedRecord},budget:calendarBudget(),hub:root.IELTSTodayHub,player:root.IELTSCoursePlayer,assessment:A,yearPlanner:root.IELTSYearPlanner,timerState:root.IELTSStudyTimer?.snapshot?.(),exposures:state.exposures,recordCorrectionStatus:record=>root.IELTSMistakes?.recordCorrectionStatus?.(record),verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord,lessonVocabularySupplement:lessonSupplementAPI(),extraPlan:(source,budget)=>source&&root.IELTSAdaptivePlan?.planRemaining?.(source,continuationRecords(),undefined,{data,budgetMinutes:360,calendarBudget:budget,exposures:state.exposures,startedMaterialIds:allDrafts().map(d=>d.materialId)})});
    }
    function destination(){
      const queue=learningQueue();if(!queue)return nextDestination({...data,days:data.days.map(item=>item.day===day?dayPlan(day):item)},day,task?.id,continuationRecords(),{recordCorrectionStatus:record=>root.IELTSMistakes?.recordCorrectionStatus?.(record)});
      const next=queue.next;if(next?.kind==='material'&&next.day===day&&next.taskId===task?.id)return{...next,label:'继续本项：'+(materialMap.get(next.materialId)?.title||NAMES[next.taskId])};return next;
    }
    function currentModuleCompletion(cache){
      const plan=dayPlan(day),base=plan?.tasks.find(item=>item.id===task?.id),name=NAMES[task?.id]||'当前';if(!base)return{done:false,message:'原稿已保存，完成证据仍待核对。'};
      const extra=submittedRecord&&!(base.coreMaterialIds||base.materialIds).includes(submittedRecord.materialId),required={...base,materialIds:extra?[submittedRecord.materialId]:base.coreMaterialIds||base.materialIds},works=continuationRecords(),hub=root.IELTSTodayHub;let summary;
      if(required.id==='vocabulary'){
        const core={...base,materialIds:base.coreMaterialIds||base.materialIds},progress=vocabularyProgress(core,works,cache);
        if(!progress)return{done:false,message:'本课词汇组状态待核对，已保存的原稿保留。'};
        const ordered=orderedTaskMaterialIds(core,day),missing=ordered.filter(id=>progress.missingMaterialIds.includes(id));
        let message=progress.allSubmitted?'词汇模块已提交 · 本课词汇组 '+progress.submittedGroups+'/'+progress.totalGroups+' · 已学习 '+progress.completedCycles+' 次。':'本课词汇组已提交 '+progress.submittedGroups+'/'+progress.totalGroups+'；尚待处理 '+missing.map(id=>'第 '+(ordered.indexOf(id)+1)+' 组（'+(materialMap.get(id)?.title||id)+(progress.updatedMaterialIds?.includes(id)?'；原版已提交，新增内容待核对':progress.verificationPendingMaterialIds?.includes(id)?'；原稿待核验':'；尚未提交')+'）').join('、')+'。';
        if(progress.completed)message+=' 词汇环节已完成。';if(progress.correctionPending)message+=' 当前错词或低分项待订正，原作答与错题保留。';else if(progress.pending||progress.verificationPending)message+=' 部分结果待核对。';
        try{const daily=root.IELTSEssentialCourse?.state?.({day,data,records:works,drafts:allDrafts(),budget:calendarBudget(),dayPlan:plan,completionValid:root.IELTSMistakes?.forDay?.(day)?.completionValid});if(daily?.applicable&&!daily.done)message+=' 当日额外新词／到期复习另计：'+daily.message;}catch(_){message+=' 当日额外新词／到期复习状态待核对。';}
        return{done:progress.completed===true,submitted:progress.allSubmitted===true,message};
      }
      try{summary=root.IELTSMistakes?.forDay?.(day);}catch(_){return{done:false,message:name+'原稿已保存，订正状态仍待核对。'};}
      const progress=hub?.taskState(required,works,{data,dayNumber:day,materials:data.materials,completionValid:summary?.completionValid===true,recordCorrectionStatus:record=>root.IELTSMistakes?.recordCorrectionStatus?.(record)});
      if(progress?.missingMaterialIds?.length)return{done:false,message:name+'原稿已保存，尚有 '+progress.missingMaterialIds.length+' 份必学材料未完成。'};
      if(progress?.pending)return{done:false,message:name+'原稿已保存，仍有待评或待验证内容。'};
      if(!progress?.done)return{done:false,message:name+'原稿已保存，完成证据仍待核对。'};
      if((summary?.remainingItems||[]).some(item=>item.skill===required.id&&required.materialIds.includes(item.materialId)))return{done:false,message:name+'原稿已保存，错题或低分项待订正。'};
      const latest=hub.latestForMaterial(required,works,day,data.materials,data);
      for(const [id,record]of latest){let corrected=false;try{corrected=root.IELTSMistakes?.recordCorrectionStatus?.(record)?.corrected===true;}catch(_){return{done:false,message:name+'原稿已保存，订正状态仍待核对。'};}if(corrected)continue;const source=materialMap.get(id),artifact=A.decodeArtifact(record);if(['grammar','listening','reading'].includes(required.id)){const grade=A.gradeMaterialForArtifact(source,artifact);if(!grade.allGradable||grade.answered!==grade.total||grade.correct!==grade.total)return{done:false,message:name+'原稿已保存，错题待订正。'};}else if(required.id==='vocabulary'&&root.IELTSVocabularyPractice?.verifyTrainingArtifact?.(artifact,source)?.mastered!==true)return{done:false,message:'词汇原稿已保存，错词或跟读低分项待订正。'};}
      return{done:true,message:name+(extra?'加练':'环节')+'已完成。已完成作品与原始作答保留。'};
    }
    function nextModuleLabel(next,completion){const budget=calendarBudget();if(budget.dayEnded)return'今日已结束，可恢复今日任务';if(task?.id==='vocabulary'&&completion.submitted)return next?.taskId==='grammar'&&(!next.day||next.day===day)&&['material','view'].includes(next.kind)?'确认本课词汇已提交，继续语法':'确认本课词汇已提交，继续下一步';if(completion.done&&next?.taskId&&next.taskId!==task?.id&&['material','view'].includes(next.kind)){const name=NAMES[next.taskId]||next.taskId;return next.kind==='view'?'查看下一模块：'+name:next.day&&next.day!==day?'进入下一课：'+name:'进入下一模块：'+name;}return next?.label||'查看课程进度';}
    function nextModuleDisabled(next){const budget=calendarBudget();return storageBroken||!next||['blocked','budget','rest','day-ended'].includes(next.kind)||next.fitsBudget===false||budget.exhausted===true||!!budget.budgetError;}
    async function openQueued(requested,options={}){
      if(task?.id==='vocabulary'&&(busy||pendingNetwork>0||captureInProgress())){notice('原稿或录音仍在保存，请等待完成后再继续。');return false;}
      const ownerProfile=profileId,view=generation,revision=recordsRevision,works=await R.list();if(!replayViewCurrent(ownerProfile,view))return false;if(task?.id==='vocabulary'&&revision!==recordsRevision){notice('词汇记录刚更新，请核对状态后再次确认。');updateNextButtons();return false;}setRecords(works);const committed=recordsRevision;await refreshMediaBudget(works);if(!replayViewCurrent(ownerProfile,view))return false;if(task?.id==='vocabulary'&&committed!==recordsRevision){notice('词汇记录刚更新，请核对状态后再次确认。');updateNextButtons();return false;}if(task?.id==='vocabulary'&&(busy||pendingNetwork>0||captureInProgress())||!mayContinue())return false;
      if(options.requireVocabularySubmitted){const base=dayPlan(day)?.tasks.find(t=>t.id==='vocabulary'),fresh=base&&vocabularyProgress({...base,materialIds:base.coreMaterialIds||base.materialIds},works);if(!fresh?.allSubmitted){updateNextButtons();updateLearningBadges();notice('重新核对后，本课词汇组尚未全部提交；请查看各组状态。');return false;}}
      if(requested?.yearFirstUse){if(requested.draftId){await resumeDraft(requested.draftId);return true;}return root.IELTSTodayNavigation.openYear(requested);}
      const queue=learningQueue(),next=requested?queue?.entries.find(e=>e.kind===requested.kind&&e.day===requested.day&&e.taskId===requested.taskId&&e.materialId===requested.materialId):destination();
      if(!next||['blocked','budget','rest','day-ended'].includes(next.kind)||next.fitsBudget===false){notice(next?.reason||'下一步状态已变化，请查看更新后的队列。');return false;}
      if(next.kind==='essential-vocabulary'){if(attempt&&!submittedRecord){advanceTimer();saveDraft();}root.location.href=next.href;return true;}
      if(next.kind==='overview'){$('todayOverview')?.scrollIntoView({behavior:'smooth'});return true;}
      if(next.day&&next.day!==day)showDay(next.day,next.materialId);
      if(next.kind==='view')await root.IELTSTodayNavigation.showLatestRecord(next.taskId,next.materialId);
      else if(next.draftId){await resumeDraft(next.draftId);await root.IELTSTodayNavigation.resumeNext(next.taskId,next.materialId);}
      else if(next.kind==='extra')await root.IELTSTodayNavigation.openExtra(next.entry);
      else await root.IELTSTodayNavigation.resumeNext(next.taskId,next.materialId);
      $('courseSession').scrollIntoView({behavior:'smooth',block:'start'});return true;
    }
    async function nextTask(options){try{await openQueued(undefined,options);}catch(error){notice('暂未继续：'+error.message+'。已提交原稿和草稿仍保留。',true);}}
    async function openVocabularyGroup(id,owner,view){
      if(!replayViewCurrent(owner,view)||busy||pendingNetwork>0||captureInProgress()){notice('原稿或录音仍在保存，请等待完成后再继续。');return;}
      const active=attempt,revision=recordsRevision;if(active&&!submittedRecord&&!persistDraft())return;
      try{const works=await R.list();if(!replayViewCurrent(owner,view)||active!==attempt)return;if(revision!==recordsRevision){notice('词汇记录刚更新，请核对状态后再次选择。');updateNextButtons();return;}setRecords(works);const base=dayPlan(day)?.tasks.find(t=>t.id==='vocabulary'),progress=base&&vocabularyProgress({...base,materialIds:base.coreMaterialIds||base.materialIds},works);if(!progress){notice('词汇组状态暂未核对，请重试；原稿保留。',true);return;}if(!progress.missingMaterialIds.includes(id)){updateNextButtons();updateLearningBadges();notice('这组原稿已经提交，可从已保存作答查看；不会新建练习。');return;}if(active&&!submittedRecord&&!persistDraft())return;await root.IELTSTodayNavigation.resumeNext('vocabulary',id);}catch(error){if(replayViewCurrent(owner,view))notice('暂未继续词汇组：'+error.message+'。已有草稿和原稿保留。',true);}
    }
    function renderVocabularyModule(section,cache=new Map(),completion){
      section.replaceChildren();const base=dayPlan(day)?.tasks.find(t=>t.id==='vocabulary');if(!base)return;
      const core={...base,materialIds:base.coreMaterialIds||base.materialIds},works=continuationRecords(),progress=vocabularyProgress(core,works,cache),outline=vocabularyLessonOutline(core,data,{day,currentMaterial:material});
      section.append(el('h3','',outline?'本课词汇 · '+outline.wordCount+' 个词项':'本课必学词汇组'));
      if(section.dataset.summaryExternal!=='true'){const summary=completion||currentModuleCompletion(cache),status=el('p','course-module-completion '+(summary.done?'course-feedback':'course-small'),summary.message);status.dataset.complete=String(summary.done);section.append(status);}
      const owner=profileId,view=generation,ids=orderedTaskMaterialIds(core,day),groups=new Map((outline?.groups||[]).map(group=>[group.materialId,group]));
      ids.forEach((id,index)=>{
        const m=materialMap.get(id),group=groups.get(id),single=progress?vocabularyProgress({...core,materialIds:[id]},works,cache):null,row=el('div','course-vocabulary-group course-vocabulary-submit-group');row.dataset.materialId=id;
        row.append(el('strong','','第 '+(index+1)+' 组 · '+(m?.title||id)+(group?' · '+group.wordCount+' 词'+(group.current?'（正在学习）':''):'')));
        if(group)row.append(el('p','',group.words.map(word=>word.word+(word.meaning?' '+word.meaning:'')).join(' · ')));
        row.append(el('p','course-learning-status',vocabularyStatusText(single,true,id)));
        if(progress?.missingMaterialIds.includes(id)&&m){const draft=vocabularyRetainedDraftFor(m),reviewOnly=!draft&&(single?.updatedMaterialIds?.includes(id)||single?.verificationPendingMaterialIds?.includes(id)),go=button(draft?'继续第 '+(index+1)+' 组的原草稿':reviewOnly?'查看这组已保存原稿':'继续第 '+(index+1)+' 组',()=>reviewOnly?replayViewCurrent(owner,view)&&root.IELTSTodayNavigation.showLatestRecord('vocabulary',id):openVocabularyGroup(id,owner,view));go.dataset.materialId=id;row.append(go);if(draft)row.append(el('small','',draftProgress(draft,m).label+'；保留原ID。'));}
        section.append(row);
      });
      for(const group of outline?.groups||[]){if(ids.includes(group.materialId))continue;const row=el('div','course-vocabulary-group');row.append(el('strong','','新增补充 · '+group.wordCount+' 词'),el('p','',group.words.map(word=>word.word+(word.meaning?' '+word.meaning:'')).join(' · ')),el('small','','完成当前词汇草稿后接续，已有作答不用重做。'));section.append(row);}
    }
    function updateNextButtons(){const cache=new Map(),completion=currentModuleCompletion(cache);for(const section of doc.querySelectorAll('.course-vocabulary-submission'))renderVocabularyModule(section,cache,completion);for(const status of doc.querySelectorAll('.course-module-completion')){status.textContent=completion.message;status.dataset.complete=String(completion.done);status.className='course-module-completion '+(completion.done?'course-feedback':'course-small');}let next,read=false;const readNext=()=>{if(!read){next=destination();read=true;}return next;};for(const reason of doc.querySelectorAll('.course-vocabulary-queue-reason')){const next=readNext();reason.textContent=next?.reason?'接续安排：'+next.reason:'';}for(const go of doc.querySelectorAll('.course-continue-queue')){const next=readNext();go.textContent=nextModuleLabel(next,completion);go.disabled=nextModuleDisabled(next);go.title=next?.reason||'';}}
    function nextButton(box){if(submittedRecord&&/^今日360分钟(?:学习)?预算已用完/.test($('courseNotice').textContent))notice('本次原稿已进入作品记录；今日预算已用完，其余任务保留。');const cache=new Map(),next=destination(),completion=currentModuleCompletion(cache),status=el('p','course-module-completion '+(completion.done?'course-feedback':'course-small'),completion.message),go=button(nextModuleLabel(next,completion),async()=>{const requireVocabularySubmitted=task?.id==='vocabulary'&&currentModuleCompletion().submitted===true;go.disabled=true;try{await nextTask({requireVocabularySubmitted});}finally{updateNextButtons();}},'button primary course-continue-queue');status.dataset.complete=String(completion.done);go.disabled=nextModuleDisabled(next);if(task?.id==='vocabulary'){const section=el('section','course-vocabulary-submission');section.dataset.summaryExternal='true';renderVocabularyModule(section,cache,completion);box.append(section);}box.append(status);if(task?.id==='vocabulary')box.append(el('p','course-vocabulary-queue-reason',next?.reason?'接续安排：'+next.reason:''));box.append(go);}
    async function persistCourseRecord(input){
      try{return await R.record(input);}catch(error){
        // IndexedDB and error capture committed before a NAS sync failed.
        // Keep that immutable version: resubmitting with new timing would conflict.
        if(error.browserCached===true&&error.committedResult?.record?.id===input.id){notice('原稿已保存在本机浏览器，用户文件夹同步尚未完成。请保留页面，使用保存状态中的重试保存；不必重新提交答案。',true);return {...error.committedResult,browserCached:true};}
        throw error;
      }
    }
    async function saveActivity(payload,source){
      if(activitySave&&activitySave.owner===attempt&&activitySave.generation===generation)return activitySave.promise;
      if(activitySave||busy)throw Error('另一份原稿正在保存或评阅，请等待结果后再提交。');
      if(!running&&(!calendarBudget().exhausted||calendarBudget().dayEnded)||calendarBudget().budgetError)throw Error('今日学习预算已暂停。草稿保留，下一日继续。');
      if(!attempt||submittedRecord||storageBroken)throw Error('此练习已经关闭或保存。');
      const bound=resolveDraftMaterial(attempt,material);if(!bound.compatible)throw Error(bound.reason);material=bound.material;
      const owner=attempt,guard=generation;advanceTimer();if(!running&&(!calendarBudget().exhausted||calendarBudget().dayEnded))throw Error('今日学习预算已暂停，未提交草稿保留。');const submitted={...copy(attempt),submittedAt:new Date().toISOString(),text:''},progress=beginSubmissionProgress('正在保存本模块原稿、练习结果与错题'),slot={owner,generation:guard,promise:null};activitySave=slot;busy=true;
      slot.promise=(async()=>{try{
      const input=toRecord(submitted,material,R.currentDay()||day,A,{data,records,drafts:allDrafts(),getDay:item=>dayPlan(item.day)});input.source=source;input.quantity=payload.quantity;input.unit=payload.unit;input.evaluation=payload.evaluation;input.answer=JSON.stringify({...JSON.parse(input.answer),...JSON.parse(payload.answer||'{}'),schema:1,trainingSchema:JSON.parse(payload.answer||'{}').schema,gradingPolicy:submitted.materialBinding.gradingPolicy,materialBinding:copy(submitted.materialBinding),...(submitted.lessonSupplement?{lessonSupplement:copy(submitted.lessonSupplement)}:{})});
      const saved=await persistCourseRecord(input);if(owner!==attempt||guard!==generation)return;
      progress.update('原稿已保存，正在更新结果与下一步');submittedRecord=saved.record;running=false;try{if(!saved.browserCached)mutate(s=>{delete s.drafts[owner.id];});}catch(error){notice('原稿已进入作品记录；草稿清理未完成，原草稿仍保留。刷新后可从最近作品继续：'+error.message,true);}$('courseSubmit').hidden=true;progress.finish(saved.browserCached?'本次结果已保存在浏览器；用户文件夹待同步，请保留页面重试保存。':'本次结果已保存；错题会在今天最后一步统一重做。');
      const box=$('courseResult');box.hidden=false;box.replaceChildren(el('h3','',source==='year-review'?'年度总结已保存；未达标继续补强':source==='mistake-review'?'今日错题与 AI 复盘已保存':'三轮词汇测试已提交'));nextButton(box);await refreshHistory();announceView();emitCourse('submitted');return saved.record;
      }catch(error){progress.fail('本次保存未完成：'+error.message+'。原稿和录音保留，可重试。');throw error;}finally{progress.cancel();if(activitySave===slot){activitySave=null;busy=false;}}})();return slot.promise;
    }
    function mountVocabulary(box){
      if(day>=2){const section=el('section','memory-mini');box.append(section);root.IELTSEssentialCourse?.mount(section,{day,data,records,drafts:allDrafts(),budget:calendarBudget(),dayPlan:dayPlan(day)});}
      const owner=attempt,difference=vocabularyPlanDifference(material,day,data,{vocabulary:root.IELTSVocabularyPractice,getDay:item=>dayPlan(item.day)});activityController=root.IELTSVocabularyPractice.mount(box,{
        material,courseDay:day,courseData:root.IELTSCourse,curriculumData:data,lessonSummary:vocabularyLessonOutline(task,data,{day,currentMaterial:material}),draft:owner.text?JSON.parse(owner.text):undefined,...(difference?{learningOrder:difference.learningOrder,wordHistory:difference.wordHistory}:{}),
        onMistake:event=>root.IELTSMistakes.captureVocabulary(event),
        onChange:change=>{if(attempt!==owner)return;if(change.draft){owner.text=JSON.stringify(change.draft);scheduleSave();}root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:change.testing}}));},
        lookup:(word,context,level)=>localJSON('/api/ai/glossary',{word,context,level}),
        onSubmit:payload=>saveActivity(payload,'vocabulary-practice')
      });
    }
    async function evaluateMistake(item,value,{signal}){
      const m=materialMap.get(item.materialId)||(item.question.material?{...item.question.material,prompt:item.question.prompt,level:item.question.level}:null);
      if(item.skill==='speaking'){
        const fresh=(await R.list({dayNumber:day})).filter(r=>r.materialId===item.materialId&&r.id!==item.recordId&&r.media?.length&&A.effectiveSpeakingTranscript(r)?.trim()===value.answer.trim()).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt))[0];
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
      const start=panel.querySelector('.course-free-start'),stop=panel.querySelector('.course-free-stop');if(start)start.disabled=blocked||!running||recorder?.state==='recording'||Boolean(owner.transcript?.trim());if(stop)stop.disabled=blocked||!running||recorder?.state!=='recording';
      $('courseSubmit').disabled=blocked||!running&&!budgetSaveReady()||!!calendarBudget().budgetError;const note=panel.querySelector('.course-free-gate');if(note)note.textContent=blocked?'先完成全部例文分段的专业评测与AI反馈（'+state.completedSegments+'/'+state.segmentCount+'），再单独录制自由表达；专业低分会进入错题本。':'现在可单独录制自由表达。例文原音与本次自由表达分别归档。';
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
      if(submittedRecord&&['vocabulary','reflection'].includes(skill)){box.append(el('p','course-small','已保存的原始作答与反馈见下方；需要再次练习时点击“重新学”。'));return;}
      if(!submittedRecord&&skill==='vocabulary'&&root.IELTSVocabularyPractice){mountVocabulary(box);return;}
      if(!submittedRecord&&skill==='reflection'&&(day===365||root.IELTSMistakeReview)){mountReflection(box);return;}
      if(!['writing','speaking','vocabulary','reflection'].includes(skill))return;
      const owner=attempt,panel=el('section','course-free-expression'),needsModel=skill==='speaking'&&modelStatus(owner).required;
      if(!submittedRecord&&needsModel){if(root.IELTSOralPractice)mountOral(box,panel).catch(error=>notice(error.message,true));else box.append(el('p','course-feedback','例文跟读组件未加载，请刷新后继续；不会跳过例文阶段。'));}
      if(needsModel)panel.append(el('h3','','第二步：单独录制自己的回答'),el('p','course-free-gate'));
      if(['writing','speaking'].includes(skill))panel.append(el('p','course-feedback course-task-prompt',[taskDisplayText(material.prompt,skill),taskDisplayText(material.instructions,skill)].filter(Boolean).join('\n')));box.append(panel);
      if(skill!=='speaking'){const label=el('label','course-output-label',skill==='vocabulary'?'词汇输出：每行一个词、语境释义和自己的例句':skill==='reflection'?'复盘：写下本次错误、依据、订正与下一次复测计划':'写作原稿'),text=el('textarea','course-output-text'),count=el('p','course-small');text.maxLength=10000;text.value=attempt.text;const update=()=>{if(attempt!==owner||submittedRecord||!running)return;attempt.text=text.value;count.textContent=A.countWords(text.value)+' 个英文词'+(material.minWords?' · 本题最低 '+material.minWords+' 词':'');scheduleSave();};text.addEventListener('input',update);label.append(text);panel.append(label,count);count.textContent=A.countWords(text.value)+' 个英文词';}
      if(skill==='speaking') {
        const diagnosis=el('p','course-small','录音就是本次口语原稿，无需手工转写。例文跟读与自由表达分别归档；只配置阿里朗读评测时，自由表达的内容与完整发音仍待验证。缺少自动听音或转写服务时可先提交保存原音，保持待评。'),settings=el('a','','AI 与语音设置'),link=el('a','','打开口语诊断与录音库');settings.href='AI设置.html'+(preview?'?preview=1':'');link.href='口语练习.html'+(preview?'?preview=1':'');diagnosis.append(' ',settings,' · ',link);panel.append(diagnosis);
        if(!submittedRecord&&owner.transcript?.trim())panel.append(el('p','course-feedback','此旧草稿的文字与原音保留。为避免用旧转写评价新录音，本稿不再追加录音；如需重新回答，请先“保留草稿并离开”，再“开始这份材料”新建原音稿，或提交旧稿后建立订正版本。'));
        const controls=el('div','course-recording-controls'),status=el('p','course-small'),list=el('div');
        const start=button('开始自由表达录音',async()=>{if(needsModel&&(!modelStatus(owner).complete||oralController?.getState?.().modelComplete!==true)){notice('请先完成全部例文分段的专业评测和AI反馈。',true);return;}if(!root.navigator.mediaDevices?.getUserMedia||!root.MediaRecorder||!root.IELTSMediaLibrary){status.textContent='当前浏览器不支持录音；请从本地服务用支持麦克风的浏览器打开。';return;}try{const requestedAttempt=attempt,requestedProfile=profileId;stream=await root.navigator.mediaDevices.getUserMedia({audio:true});if(storageBroken||!attempt||attempt!==requestedAttempt||profileId!==requestedProfile||(root.IELTSProfiles?.current().id||'legacy')!==requestedProfile||submittedRecord||!running||calendarBudget().exhausted){stream.getTracks().forEach(t=>t.stop());return;}box.querySelector('.daily-oral')?.setAttribute('inert','');const capturedStream=stream,localChunks=[],localRecorder=new MediaRecorder(capturedStream),localStarted=Date.now();recorder=localRecorder;const attemptId=attempt.id,profile=profileId,originalTitle=material.title,recordingMeta={kind:'audio',name:originalTitle+' · 自由表达原音',mode:'course_free',task:'free_expression',level:String(material.level||'A0').match(/A[012]|B[12]|C[12]/g)?.at(-1)||'A0',materialId:material.id,dayNumber:day};localRecorder.ondataavailable=e=>{if(e.data.size)localChunks.push(e.data);};localRecorder.onstop=async()=>{recordingSaving=true;const blob=new Blob(localChunks,{type:localRecorder.mimeType||'audio/webm'}),durationSeconds=Math.min(900,(Date.now()-localStarted)/1000);capturedStream.getTracks().forEach(t=>t.stop());start.disabled=false;stop.disabled=true;box.querySelector('.daily-oral')?.removeAttribute?.('inert');if(storageBroken||profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile){status.textContent='档案已切换，旧录音不会写入另一档案。';recordingSaving=false;return;}try{const entry=await root.IELTSMediaLibrary.create({...recordingMeta,durationSeconds},blob);if(storageBroken||profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile){recordingSaving=false;return;}if(owner.modelReading?.segments.some(segment=>segment.workId===entry.id))throw Error('例文原音不能加入自由表达媒体。');const reference={id:entry.id,name:entry.name||originalTitle,mime:blob.type,durationSeconds};if(!attempt||attempt.id!==attemptId||submittedRecord){mutate(s=>{const draft=s.drafts[attemptId];if(draft&&!draft.media.some(m=>m.id===entry.id))draft.media.push(reference);});recordingSaving=false;return;}attempt.media.push(reference);scheduleSave();status.textContent='录音已在本档案离线保存。';showMedia(list);}catch(error){status.textContent='录音保存失败：'+error.message;}finally{recordingSaving=false;}};localRecorder.start();start.disabled=true;stop.disabled=false;status.textContent='正在录音，最多 15 分钟。';setTimeout(()=>{if(localRecorder.state==='recording'){recordingSaving=true;localRecorder.stop();}},900000);}catch(_){status.textContent='无法使用麦克风，请检查浏览器授权与设备。';}});
        start.className='course-free-start';start.disabled=Boolean(submittedRecord);const stop=button('停止并保存录音',()=>{if(recorder?.state==='recording'){recordingSaving=true;recorder.stop();}});stop.className='course-free-stop';stop.disabled=true;controls.append(start,stop);panel.prepend(controls,status,list);showMedia(list);if(!submittedRecord)updateFreeGate(owner,panel);
      }
    }
    async function showMedia(container) { container.replaceChildren();for(const ref of attempt?.media||[]) {const entry=await root.IELTSMediaLibrary?.get(ref.id);if(!entry?.blob){container.append(el('p','course-small','录音引用存在，但音频未在本机找到：'+ref.name));continue;}const audio=el('audio');audio.controls=true;audio.src=URL.createObjectURL(entry.blob);container.append(el('p','course-small',ref.name+' · '+Math.round(ref.durationSeconds)+' 秒'),audio);}}
    function configureReadingLayout(active){
      const workspace=$('courseReadingWorkspace');if(!workspace)return;
      workspace.dataset.reading=String(active);
      for(const [paneId,headingId] of [['coursePassagePane','coursePassageHeading'],['courseQuestionsPane','courseQuestionsHeading']]){
        const pane=$(paneId),heading=$(headingId);if(!pane||!heading)continue;heading.hidden=!active;pane.scrollTop=0;
        if(active){pane.setAttribute('role','region');pane.setAttribute('aria-labelledby',headingId);pane.setAttribute('tabindex','0');}
        else for(const name of ['role','aria-labelledby','tabindex'])pane.removeAttribute(name);
      }
    }
    function syncSessionVisibility(){const budget=calendarBudget(),show=running||Boolean(submittedRecord)||budget.dayEnded&&captureInProgress();for(const id of ['courseFigure','courseAudio','courseReadingWorkspace','coursePassage','courseQuestions','courseOutput'])$(id).hidden=!show;if(!submittedRecord){$('courseSubmit').disabled=!running&&!budgetSaveReady()||!!budget.budgetError;if(task?.id==='speaking'){const panel=$('courseOutput').querySelector('.course-free-expression');if(panel)updateFreeGate(attempt,panel);}if(attempt&&task?.id==='vocabulary'&&budget.exhausted&&!budget.dayEnded&&!budget.budgetError&&!busy&&!$('courseSubmitStatus').querySelector('.course-budget-save')){try{const payload=activityController?.getSubmission?.();if(payload?.answer&&root.IELTSVocabularyPractice?.verifyTrainingArtifact?.(JSON.parse(payload.answer),material)?.submitted){const owner=attempt,controller=activityController,save=button('保存已完成的三轮原稿',async()=>{if(owner!==attempt||controller!==activityController||submittedRecord||storageBroken)return;save.disabled=true;try{await controller.submit();}catch(error){notice('保存尚未完成：'+error.message+'；原稿保留，可重试。',true);save.disabled=false;}});save.className='course-budget-save';$('courseSubmitStatus').append(save);}}catch(_){}}}}
    function renderSession() {
      configureReadingLayout(task.id==='reading'&&material.skill==='reading'&&Boolean(material.passage?.trim()));
      root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:attempt.mode==='assessment'&&!submittedRecord}}));
      $('courseStart').hidden=true;$('courseSession').hidden=false;for(const id of ['courseFigure','courseAudio','coursePassage','courseQuestions','courseOutput'])$(id).hidden=false;$('courseResult').hidden=true;$('courseResult').replaceChildren();$('courseSubmit').disabled=false;$('courseSubmitStatus').textContent='';$('coursePause').textContent=running?'暂停':'继续';$('courseSessionMode').textContent=attempt.mode==='assessment'?'独立测评':'练习';renderExposure();$('courseFigure').replaceChildren();renderFigure(material.figure,$('courseFigure'));$('coursePassage').replaceChildren();if(material.skill!=='listening'&&!['vocabulary','reflection'].includes(task.id))renderPassage(material.passage||'',attempt.mode==='practice'&&material.pool!=='final');renderAudio();renderQuestions();renderOutput();$('courseSubmit').hidden=['vocabulary','reflection'].includes(task.id)&&!!activityController;advanceTimer();syncSessionVisibility();announceView();emitCourse('session');
    }
    async function submit() {
      if(!attempt||submittedRecord||busy||storageBroken||calendarBudget().budgetError||!running&&!budgetSaveReady())return;if(recordingSaving||recorder?.state==='recording'){notice('请先停止并保存录音，再提交原稿。',true);return;}
      const bound=resolveDraftMaterial(attempt,material);if(!bound.compatible){notice(bound.reason,true);return;}material=bound.material;
      if(task.id==='speaking'){const model=modelStatus(attempt);if(model.required&&(!model.complete||oralController?.getState?.().modelComplete!==true)){notice(model.reason,true);return;}const stage=verifySpeakingStage({kind:attempt.kind,answer:JSON.stringify({modelReading:attempt.modelReading,mode:attempt.mode,text:attempt.text,transcript:attempt.transcript}),media:attempt.media},material,task,data,day);if(!stage.submitted){notice(stage.reason,true);return;}}
      advanceTimer();if(!running&&!budgetSaveReady())return;const objective=task.id===material.skill&&['reading','listening','grammar'].includes(task.id);const grade=objective?A.gradeMaterialForArtifact(material,{answers:attempt.answers,gradingPolicy:attempt.materialBinding.gradingPolicy,objectiveGrading:attempt.materialBinding.gradingPolicy,materialBinding:attempt.materialBinding,materialVersion:String(material.version)}):null;
      if(objective&&!grade.answered||!objective&&!attempt.text.trim()&&!attempt.transcript.trim()&&!attempt.media.length){notice('请先留下真实答案、文字输出或录音。空白记录不会提交。',true);return;}
      running=false;attempt.submittedAt=new Date().toISOString();busy=true;$('courseSubmit').disabled=true;const submittingOwner=attempt,submittingGeneration=generation,progress=beginSubmissionProgress(objective?'正在保存原稿并核对本题答案':'正在保存本模块原稿与原音引用');
      try{const input=toRecord(attempt,material,R.currentDay(),A,{data,records,drafts:allDrafts(),getDay:item=>dayPlan(item.day)});const submittingId=attempt.id,submitGeneration=generation;const result=await persistCourseRecord(input);if(generation!==submitGeneration||attempt?.id!==submittingId)return;submittedRecord=result.record;root.dispatchEvent(new CustomEvent('ielts:assessment-mode',{detail:{active:false}}));try{mutate(s=>{if(!result.browserCached)delete s.drafts[submittingId];if(['writing','speaking'].includes(input.skill))s.queue[result.record.id]={recordId:result.record.id,at:new Date().toISOString()};});}catch(error){notice('原稿已经进入作品记录；草稿清理／待评索引未更新：'+error.message+'。刷新后可从最近作品继续。',true);}$('courseSubmitStatus').textContent=(result.browserCached?'原稿已保存在浏览器，用户文件夹待同步。':objective&&!objectiveSubmissionComplete(input,material,A)?'部分原稿已保存，已答 '+grade.answered+'/'+material.questions.length+' 题；请继续本份材料补全。':'原稿已保存。')+'实际 '+(input.activeSeconds/60).toFixed(1)+' 分钟；不会自动完成整项日程。';doc.querySelectorAll('#courseQuestions input,#courseQuestions textarea,#courseOutput textarea').forEach(n=>n.disabled=true);showResult(result.record);refreshHistory();announceView();emitCourse('submitted');}
      catch(error){if(submittingOwner!==attempt||submittingGeneration!==generation)return;progress.fail('未完成保存：'+error.message+'。原稿保留在页面，可重试。');running=!calendarBudget().exhausted;lastInteraction=Date.now();tickAt=Date.now();syncSessionVisibility();}
      finally{progress.cancel();busy=false;}
      if(submittedRecord&&['writing','speaking'].includes(submittedRecord.skill))await review(submittedRecord,submittedRecord.skill==='speaking');
    }
    function appendObjectiveFeedback(container,question,supplied,options){
      const helper=root.IELTSObjectiveFeedback||(typeof require==='function'?require('./objective-feedback.js'):null);if(!helper?.explain)return;
      const feedback=helper.explain(question,supplied,options);if(feedback.status!=='incorrect')return;const section=el('section','course-objective-feedback');section.append(el('h4','',feedback.title),el('p','','你的原始答案：'+feedback.userAnswer));for(const point of feedback.points)section.append(el('p','',point));if(feedback.next)section.append(el('p','course-small','下一次怎么核对：'+feedback.next));container.append(section);
    }
    function showResult(record) {
      const box=$('courseResult');box.hidden=false;box.replaceChildren(el('h3','','原稿结果与下一步'));const m=materialForRecord(record,materialMap.get(record.materialId),A),artifact=A.decodeArtifact(record);if(!artifact)return;if(!m){showPreservedRecord(record);return;}appendRelearning(box,record,m);
      if(record.source==='year-review'&&artifact.yearSummary){box.append(el('pre','course-feedback',artifact.yearSummary.text),el('p','course-small','年度总结已保存；近期准备度与正式考试能力仍分别判断。未达标继续补强。'));nextButton(box);return;}
      if(record.skill==='vocabulary'&&artifact.kind==='vocabulary-three-modes'){
        box.append(el('p','','本次词汇训练版本 '+(artifact.trainingVersion||1)+'；学习前置训练：'+(artifact.trainingComplete?'已完成':'旧版未包含三写三读，原稿保留')));for(const round of artifact.rounds||[]){const d=el('details');d.append(el('summary','',round.mode+' · '+round.correct+'/'+round.total));for(const item of round.attempts||[]){d.append(el('p','',item.prompt+' → '+item.userAnswer+'；'+(item.correct?'正确':'参考：'+item.expectedAnswer)));if(item.correct===false){const word=(artifact.words||[]).find(word=>word.word===item.word)||{},normalize=root.IELTSVocabularyPractice?.normalizeAnswer||(value=>typeof value==='string'?value.trim().toLowerCase():'');appendObjectiveFeedback(d,{type:'spelling',answers:[item.expectedAnswer],prompt:item.prompt,explanation:word.meaning||'',evidence:word.example||''},item.userAnswer,{grade:{correct:false,answered:!!normalize(item.userAnswer),gradable:typeof item.expectedAnswer==='string'&&!!item.expectedAnswer,withinLimit:true,expected:[item.expectedAnswer]},normalizeAnswer:normalize,sourceKind:'vocabulary',sourceText:word.example||''});}}box.append(d);}nextButton(box);return;
      }
      if(record.source==='mistake-review'){box.append(el('pre','course-feedback',artifact.recap?.recap||'已保存本日复盘。'));nextButton(box);return;}
      const objective=['reading','listening','grammar'].includes(record.skill)&&record.skill===m.skill,grade=A.gradeMaterialForArtifact(m,artifact);
      if(objective){box.append(el('p','course-feedback','原始正确数 '+grade.correct+' / '+grade.total+'。这是原创材料内部核对，不直接换算官方 Band。'));grade.items.forEach(item=>{const details=el('details'),pending=!item.gradable,unanswered=!item.answered;details.dataset.result=pending?'pending':unanswered?'unanswered':item.correct?'correct':'incorrect';details.append(el('summary','',(pending?'待核对 ':unanswered?'未作答 ':item.correct?'✓ ':'待订正 ')+item.id+' · 展开答案与依据'),el('p','','参考答案：'+(item.expected.join(' / ')||'尚无可核对答案')),el('p','','解释：'+item.explanation),el('p','','原文依据：'+item.evidence));
        if(!pending&&!unanswered&&!item.correct)appendObjectiveFeedback(details,m.questions.find(q=>q.id===item.id),artifact.answers?.[item.id],{grade:item,sourceText:record.skill==='listening'?m.transcript||m.passage||'':m.passage||m.transcript||'',sourceKind:record.skill});
        box.append(details);});}
      if(m.source?.publicSourceId&&objective){
        const support=root.IELTSPublicLearningSupport||(typeof require==='function'?require('./public-learning-support.js'):null),today=dayPlan(day),focusMaterials=(today?.tasks||[]).flatMap(t=>t.materialIds||[]).map(id=>materialMap.get(id)).filter(Boolean),targetWords=focusMaterials.flatMap(m=>(m.vocabulary||[]).map(w=>typeof w==='string'?w:w.word)),grammarTags=focusMaterials.flatMap(m=>m.source?.grammarTags||m.grammarTags||[]);
        support?.render(box,m,{document:doc,targetWords,grammarTags});
      }
      if(artifact.mode==='assessment'){const evidence=A.evidenceFor(record,m,{final:m.pool==='final'});box.append(el('p','course-small',evidence.pass?'本份符合内部独立测评条件。':'当前不计独立通过：'+evidence.reasons.join('；')));}
      renderReview(A.decodeReview(record),box);const reviewData=A.decodeReview(record);if(reviewData?.fullReviewArchiveId){box.append(button('导出完整原稿与本次评阅归档',async()=>{try{const entry=await root.IELTSMediaLibrary.get(reviewData.fullReviewArchiveId);if(!entry)throw Error('本机未找到完整归档，请恢复音频／作品备份。');root.IELTSMediaLibrary.download(new Blob([JSON.stringify(entry,null,2)],{type:'application/json'}),'IELTS-完整评阅-'+record.id+'.json');}catch(error){notice(error.message,true);}}));}
      if(record.skill==='speaking'&&!artifact.transcript?.trim()){
        const source=A.transcriptionForRecord(record);if(source)box.append(el('p','course-small','自动转写来源：'+source.provider+'。原回答与原音保持不变。'),el('pre','course-asr-transcript',source.text));
        box.append(el('p','course-feedback',record.evaluation.result==='pass'?'本次自动转写与原音反馈已保存，可回听核对识别内容。':'自由表达原音已保存待评。将自动识别实际说出的英文，再用同一份原音核验；无需手工填写，例文不会替代本次回答。'),button(source?'重新转写并核验本次原音':'自动转写并核验本次原音',()=>review(record,true)));
      }else if(record.skill==='speaking'){
        const foundation=foundationSpeaking(m),service=foundation?'阿里专业语音评测':'Omni完整听音',path=foundation?'/api/oral/status':'/api/omni/status';
        const config=el('p','course-small',service+'配置状态：正在读取本地服务…'),settings=el('a','','打开AI与语音设置');settings.href='AI设置.html'+(preview?'?preview=1':'');box.append(config,settings);
        if(!localHTTP(root.location)||!root.fetch)config.textContent=service+'配置状态：请从本地学习服务打开，原音保留待验证。';
        else{const checking=new AbortController(),timer=setTimeout(()=>checking.abort(),5000);root.fetch(path,{signal:checking.signal,credentials:'same-origin',redirect:'error',cache:'no-store'}).then(response=>response.json()).then(status=>{config.textContent=status.configured===true?foundation?'阿里专业语音评测已配置；本次自由表达原音将取得三维诊断与两轮阶段反馈，不出Band。':'Omni已配置：'+String(status.model||'')+'。完整自由表达原音将用于听音观察与两轮四维训练评阅。':foundation?'阿里专业语音评测尚未配置；请在AI与语音设置中连接。原音与原稿保留，相关维度待验证。':'Omni尚未配置：高级完整听音暂不可用，原音保留待验证。';}).catch(()=>{config.textContent=service+'配置暂不可读，原稿与原音仍保留。';}).finally(()=>clearTimeout(timer));}
      }
      const actions=el('div','course-actions');if(record.skill==='writing'||record.skill==='speaking'&&artifact.transcript?.trim())actions.append(button(record.skill==='speaking'?'仅按文字做两轮复核':'两轮 AI 复核原稿',()=>review(record)));if(record.skill==='speaking'&&artifact.transcript?.trim())actions.append(button(foundationSpeaking(m)?'阿里诊断 + 两轮阶段反馈（不出Band）':'完整原音听音 + 两轮四维评阅',()=>review(record,true)));actions.append(button('建立订正版本',()=>{showMaterial(m);begin({parentId:record.id,kind:'correction',mode:'practice'});}));
      const alternatives=data.materials.filter(v=>v.skill===m.skill&&v.id!==m.id&&(m.assessmentGroup?v.assessmentGroup===m.assessmentGroup&&v.form!==m.form:v.week===m.week));const retest=A.retestAvailability(record,alternatives);if(alternatives.length){const select=el('select');alternatives.forEach(v=>{const o=el('option','',v.title+' · '+(v.form||''));o.value=v.id;select.append(o);});actions.append(select,button(retest.due?'开始新题复测':'提前做新题练习',()=>{const target=materialMap.get(select.value);showMaterial(target);begin({parentId:record.id,kind:'retest',mode:retest.due?'assessment':'practice'});}));}box.append(actions,el('p','course-small',retest.message+(retest.dueAt?' · 最早 '+new Date(retest.dueAt).toLocaleString():'')));nextButton(box);
    }
    function renderReview(reviewData, box) {
      if(!reviewData)return;if(reviewData.audioSource?.mediaRanges?.length)box.append(el('p','course-small','听音时点按全部原音的拼接顺序表示：'+reviewData.audioSource.mediaRanges.map((range,i)=>'原音 '+(i+1)+' 为 '+Number(range.startSeconds).toFixed(1)+'–'+Number(range.endSeconds).toFixed(1)+' 秒').join('；')+'。片段切换不代表学习者停顿。'));box.append(el('p','course-small',(reviewData.disclaimer||'同一模型两轮意见不是独立人工评分。')+' · 状态 '+reviewData.status));
      (reviewData.rounds||[]).forEach(round=>{const details=el('details','course-review-round');details.append(el('summary','','第 '+round.round+' 轮'+(round.ok?'':' · 暂不可用')));if(!round.ok){details.append(el('p','','本轮未完成，原稿仍保留。'));}else{details.append(el('p','',round.summary||''));(round.criteria||[]).forEach(c=>{details.append(el('p','',c.id+'：'+(typeof c.band==='number'?c.band+'（AI 估计）':'待验证')+'。'+c.comment));(c.evidence||[]).forEach(e=>details.append(el('blockquote','',e.quote+' — '+e.comment)));(c.audioEvidence||[]).forEach(e=>details.append(el('blockquote','course-acoustic-evidence','原音 '+(Number.isFinite(e.startSeconds)?e.startSeconds.toFixed(1):'?')+'–'+(Number.isFinite(e.endSeconds)?e.endSeconds.toFixed(1):'?')+' 秒：'+e.quote+' — '+e.comment)));});if(round.levelCheck)details.append(el('p','',(round.levelCheck.scope==='task-requirements'?'任务要求核对：':'阶段目标：')+(round.levelCheck.meetsGoal===true?'本轮认为符合':round.levelCheck.meetsGoal===false?'仍需补强':'证据不足')+'；'+(round.levelCheck.gaps||[]).join('；')));const completeCorrections=root.IELTSReview?.completeCorrections?root.IELTSReview.completeCorrections(round):(Array.isArray(round.corrections)?round.corrections:[]).filter(c=>c&&['original','revised','reason'].every(k=>typeof c[k]==='string'&&c[k].trim())&&c.original.trim()!==c.revised.trim());if(completeCorrections.length){details.open=true;details.append(el('h4','course-review-corrections','建议改法与原因'));}completeCorrections.forEach(c=>{const item=el('section','course-correction');item.append(el('p','course-correction-suggestion','建议改法：'+c.original+' → '+c.revised),el('p','course-correction-reason','为什么：'+c.reason));details.append(item);});if((round.corrections?.length||0)>completeCorrections.length)details.append(el('p','course-small','部分修改建议字段不全或没有实际改动，未作为可执行订正；已有诊断保留，请重新获取完整改写。'));details.append(el('p','course-small',round.uncertainty||''));}box.append(details);});
    }
    async function review(record,withAudio=false) {
      if(busy||storageBroken)return;const m=materialForRecord(record,materialMap.get(record.materialId),A),artifact=A.decodeArtifact(record);if(!m||!artifact){notice('原稿材料版本暂不可核验，原文和原音保留；未套用当前新题。',true);return;}
      const needsTranscription=record.skill==='speaking'&&!artifact.transcript?.trim();if(needsTranscription&&!withAudio){notice('这份原音尚无学习者文字原稿，请使用自动转写并核验原音入口。',true);return;}let body;try{if(!needsTranscription)body=reviewRequest(m,artifact);}catch(error){notice(error.message,true);return;}
      if(!localHTTP(root.location)){notice('AI 复核需要双击“启动学习.cmd”并从本地学习地址打开。原稿已留在待评队列。',true);return;}
      if(withAudio&&record.skill!=='speaking')return;
      const retainedReview=needsTranscription&&record.evaluation.result==='pass'&&practiceReviewResult(A.decodeReview(record),record,m,A)==='pass'?A.decodeReview(record):null;
      const aborter=new AbortController();reviewAbort=aborter;busy=true;const currentGeneration=generation,profile=profileId;const current=()=>profile===profileId&&currentGeneration===generation&&!storageBroken&&(root.IELTSProfiles?.current().id||'legacy')===profile;
      const cancelButton=button('取消本次评阅',()=>aborter.abort(),'course-review-cancel'),progressNode=el('p','course-review-progress'),progress=createSubmissionProgress({node:progressNode,isCurrent:()=>currentGeneration===generation&&profile===profileId&&!storageBroken&&(root.IELTSProfiles?.current().id||'legacy')===profile});notice('AI复核已开始，等待期间原稿和原始录音保留。');$('courseNotice').append(progressNode,cancelButton);progress.start('正在准备本次评阅');
      const showProgress=message=>{progress.update(message);};
      const timer=setTimeout(()=>aborter.abort(),withAudio?1100000:190000);
      showProgress(needsTranscription?'正在读取已保存的自由回答原音，自动识别实际说出的英文。转写失败仍保留待评。':withAudio?(body.task==='foundation'?'正在检查阿里专业语音评测配置；只发送本次自由表达原音和确认转写，不使用例文样音。':'正在检查Omni完整听音配置，只发送本次自由表达原音与确认转写。'):'正在分别复核同一已提交原稿，两轮互不读取对方意见。');
      try{
        let prepared,transcriptionSource;
        if(needsTranscription){
          prepared=await prepareAudio(record,{signal:aborter.signal});if(!current())return;
          transcriptionSource=await transcribeCourseAudio(record,prepared,{signal:aborter.signal,fetch:root.fetch.bind(root)});checkAbort(aborter.signal);if(!current())return;
          const feedback=retainedReview?feedbackForRecord({...retainedReview,transcriptionAttempt:{status:'pending',source:transcriptionSource}}):JSON.stringify({status:'pending',rounds:[],transcriptionSource,disclaimer:'ASR 自动识别本次自由原音；尚待同音频专业诊断及两轮反馈。原回答字段未改写。'});
          record=await R.update(record.id,{evaluation:{method:retainedReview?'ai':'none',result:retainedReview?'pass':'pending',feedback}},R.makeId('transcription'));if(!current())return;checkAbort(aborter.signal);
          if(submittedRecord?.id===record.id)submittedRecord=record;
          body=reviewRequest(m,{...artifact,transcript:transcriptionSource.text});
        }
        const reviewData=await runReviewPipeline({request:body,record,audio:withAudio,prepared,transcriptionSource,signal:aborter.signal,fetch:root.fetch.bind(root),prepare:(record,signal)=>prepareAudio(record,{signal}),onProgress:showProgress});
        if(!current())return;
        const {result,proof}=reviewData;let archiveId=null;
        if(root.IELTSMediaLibrary){const entry=await root.IELTSMediaLibrary.create({kind:record.skill==='writing'?'writing':'speaking_text',name:m.title+' · 评阅原稿',originalText:body.text,prompt:body.prompt,mode:reviewData.request.mode,task:body.task,level:body.level,materialId:m.id});archiveId=entry.id;await root.IELTSMediaLibrary.update(entry.id,{review:result,...(proof?{audioReview:proof}:{}),recordsId:record.id,queueStatus:result.status==='complete'?'reviewed':'pending',notes:record.media.length?'原始录音引用：'+record.media.map(v=>v.id).join('、'):''});}
        if(!current())return;
        const feedback=feedbackForRecord(result,archiveId),candidate={...record,evaluation:{method:'ai',result:'pending',feedback}},evidence=A.evidenceFor(candidate,m,{final:m.pool==='final'});
        const retainPrevious=!!retainedReview&&result.status!=='complete',evaluationResult=retainPrevious?'pass':practiceReviewResult(result,candidate,m,A),storedFeedback=retainPrevious?feedbackForRecord({...retainedReview,reviewAttempt:JSON.parse(feedback)}):feedback;const output=await R.update(record.id,{evaluation:{method:'ai',result:evaluationResult,feedback:storedFeedback}},R.makeId('review'));
        if(!current())return;
        try{mutate(state=>{if(retainPrevious||result.status==='complete'&&evaluationResult!=='pending')delete state.queue[record.id];else state.queue[record.id]={recordId:record.id,at:new Date().toISOString()};});}catch(error){notice('原稿及评阅已保存，待评索引更新失败：'+error.message,true);}
        if(submittedRecord?.id===record.id){submittedRecord=output;showResult(output);}
        progress.finish('本次评阅处理已结束。');notice(result.status==='complete'?(withAudio&&body.task==='foundation'?'阿里三维专业诊断与两轮阶段目标反馈已保存；0–100分不换算IELTS Band。':withAudio&&result.audioAnalysisEvidence?(body.task==='foundation'?'原音观察与两轮阶段表达目标反馈已保存；基础任务不提供可比 Band。':'完整原音观察与两轮四维 AI 估计已保存。请回听时点核对；同一听音观察被两轮共享，仍可能共同误判。'):body.mode==='writing'?'两轮写作反馈已保存。请查看下方建议改法与原因，再建立订正版本。':'两轮反馈已保存；未完成声学验证的发音与流利度仍待验证。'):'评阅未全部完成，原稿、已返回意见及原音证据均已保留，可重试。');refreshHistory();
      }catch(error){if(!current())return;notice('评阅未完成：'+(error.name==='AbortError'?'已取消或等待超时。':error.message)+' 原稿和原始录音保留。',true);}
      finally{progress.cancel();clearTimeout(timer);cancelButton.remove?.();busy=false;if(reviewAbort===aborter)reviewAbort=null;}
    }
    function showPreservedRecord(record){
      leave();submittedRecord=record;running=false;$('courseStart').hidden=true;$('courseSession').hidden=false;for(const id of ['courseFigure','courseAudio','courseReadingWorkspace','coursePassage','courseQuestions','courseOutput']){$(id).hidden=true;}const box=$('courseResult');box.hidden=false;box.replaceChildren(el('h3','',record.title+' · 已保存的原稿'),el('p','course-small','原材料版本待核对；这里只显示保存时的原稿和评价，不以当前同ID新题重判。'),el('p','course-feedback','保存时评价：'+record.evaluation.result+(Number.isFinite(record.evaluation.score)?' · '+record.evaluation.score+' / '+record.evaluation.maxScore:'')),el('pre','course-preserved-record',JSON.stringify(record,null,2)),button('下载完整原稿JSON',()=>{const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),name='IELTS-原稿-'+record.id+'.json';if(root.IELTSMediaLibrary?.download)root.IELTSMediaLibrary.download(blob,name);else{const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url);}}));$('courseSubmit').disabled=true;$('courseSubmit').hidden=true;if(record.skill==='vocabulary'&&task?.id==='vocabulary')nextButton(box);notice('已保留原始答案、录音引用和保存时评价；原材料版本待核对。');announceView();return true;
    }
    function viewRecord(record) {
      const m=materialForRecord(record,materialMap.get(record.materialId),A),artifact=A.decodeArtifact(record);if(!artifact){notice('原始作品无法读取，未改动记录。',true);return false;}if(!m)return showPreservedRecord(record);
      showDay(artifact.courseDay||record.dayNumber||day,m.id);showMaterial(m,{showSaved:false});return renderSavedRecord(record,m);
    }
    function mountYearReview(box){
      const owner=attempt,report=root.IELTSYearPlanView?.current?.(),ready=A.readiness(records,data.materials);box.append(el('h3','','年度证据总结'),el('p','',ready.label),el('p','',ready.disclaimer));for(const reason of ready.reasons)box.append(el('p','course-small',reason));if(report)box.append(el('p','','已完成课程 '+report.completedDays.length+'/365；待补 '+report.backlog.length+' 日。'+report.yearEnd.action));const input=el('textarea');input.rows=8;input.value=owner.text||'';input.placeholder='分别写出听读说写的实际证据、仍需验证的能力和下一周期补强行动。未达标继续学习。';input.addEventListener('input',()=>{owner.text=input.value;scheduleSave();});box.append(input,button('保存年度总结并继续补强',async()=>{try{if(input.value.trim().length<20)throw Error('请写出至少20字的具体证据与后续行动。');const text=input.value.trim();await saveActivity({answer:JSON.stringify({yearSummary:{schema:1,day:365,text,readiness:{ready:ready.ready,reasons:ready.reasons},recordIds:records.map(r=>r.id).slice(-300)}}),quantity:1,unit:'份复盘',evaluation:{method:'none',result:'unverified',feedback:'已保存年度总结；课程完成与正式考试能力分别判断，未达标继续补强。'}},'year-review');}catch(error){notice(error.message,true);}},'button primary'));activityController={pause(){input.disabled=true;},resume(){input.disabled=false;},destroy(){},getState:()=>({text:input.value})};
    }
    async function resumeDraft(id){
      if(storageBroken)throw Error('当前档案不可继续，请先保留输入并刷新页面。');root.IELTSProfiles?.assertFresh?.();const ownerProfile=profileId,view=generation,works=await R.list();root.IELTSProfiles?.assertFresh?.();
      if(ownerProfile!==profileId||view!==generation||(root.IELTSProfiles?.current().id||'legacy')!==ownerProfile)throw Error('课程或档案刚发生变化，请从更新后的草稿列表继续。');
      if(works.some(record=>record.id===id))throw Error('这份草稿已经提交，请从作品记录查看原稿。');
      const raw=storage.getItem(KEY),latest=raw?parseState(raw):newState(),draft=latest.drafts[id];if(draft?.yearAssignment)await yearCourseAPI().resumeDraft(draft);const resolved=resolveDraftMaterial(draft,materialMap.get(draft?.materialId));
      if(!draft)throw Error('这份未提交草稿未找到；不会重新创建练习。');
      if(!resolved.compatible)throw Error(resolved.reason);const m=resolved.material;
      if(!draftProgress(draft,m).compatible)throw Error('这份草稿与原材料版本不匹配，整稿保留供核对；不会从头覆盖。');
      if(attempt&&!submittedRecord){advanceTimer();if(!persistDraft())throw Error('当前输入尚未成功保存，暂不切换草稿；请保留输入并刷新。');}
      if(attempt?.id===id&&!submittedRecord){running=false;attempt.interrupted||=attempt.mode==='assessment';activityController?.pause?.();listeningController?.pause?.();oralController?.cancel?.();stopMedia();if(!persistDraft())throw Error('当前草稿尚未成功保存，请保留输入并刷新。');syncSessionVisibility();$('coursePause').textContent='继续';announceView();return true;}
      setRecords(works);const currentRaw=storage.getItem(KEY);state=currentRaw?parseState(currentRaw):newState();const saved=state.drafts[id];if(!saved)throw Error('草稿已在另一页面改变，请刷新列表。');
      const restored=bindDraftMaterial(saved,materialMap.get(saved.materialId),{assessment:A,task:dayPlan(saved.courseDay)?.tasks.find(t=>t.id===saved.taskId),data,courseData:root.IELTSCourse});
      showDay(saved.courseDay,saved.materialId);showMaterial(restored.material);task={...task,...(restored.material.taskContract||{}),id:saved.taskId};attempt=restored.draft;attempt.interrupted||=attempt.mode==='assessment';lastDraftSerialized=JSON.stringify(saved);submittedRecord=null;running=false;tickAt=Date.now();if(!saved.materialBinding&&!persistDraft())return false;renderSession();notice(draftProgress(attempt,m).label+'。草稿已恢复并暂停；点击“继续”接着完成。');return true;
    }
    function renderDrafts(){
      const box=$('courseDrafts');box.replaceChildren();
      Object.values(state.drafts).filter(d=>!records.some(r=>r.id===d.id)).forEach(d=>{
        const row=el('article','course-record-row'),resolved=resolveDraftMaterial(d,materialMap.get(d.materialId)),m=resolved.material||materialMap.get(d.materialId),title=m?.title||d.materialId,progress=draftProgress(d,m);
        row.append(el('p','course-small','第 '+d.courseDay+' 课 · '+progress.label),button(title+' · '+progress.label+' · 恢复草稿',async()=>{try{await resumeDraft(d.id);}catch(error){notice('草稿暂未恢复：'+error.message,true);}}));
        if(!resolved.compatible){const preserved=el('details','course-draft-preserved');preserved.append(el('summary','','查看保留的完整草稿'),el('p','course-small',resolved.reason),el('pre','course-feedback',JSON.stringify(d,null,2)),button('下载完整草稿JSON',()=>{const download=root.IELTSMediaLibrary?.download;if(download)download(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}),'IELTS-草稿-'+d.id+'.json');else{const url=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'})),link=el('a');link.href=url;link.download='IELTS-草稿-'+d.id+'.json';link.click();URL.revokeObjectURL(url);}}));row.append(preserved);}
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
      mutate(next=>{if(JSON.stringify(next.drafts[id])!==signature)throw Error('草稿刚被另一页面修改，未删除。');delete next.drafts[id];});deletedDrafts.set(id,{draft:copy(snapshot),profile});setRecords(works);await refreshHistory();announceView();notice('未提交草稿已删除；可在本页撤销。已提交原稿和媒体归档保留。');
    }
    function publicPlanNotice(){
      const adaptive=root.IELTSAdaptivePlan,status=adaptive?.publicCourseState?.(),grammar=adaptive?.publicContextState?.();let box=$('coursePublicPlanStatus');if(!box&&(status?.available||grammar?.accounting?.length)){box=el('div','course-target');box.id='coursePublicPlanStatus';$('courseDayTitle').parentElement?.append(box);}if(!box)return;
      box.replaceChildren();box.hidden=!status?.available&&!grammar?.accounting?.length;if(box.hidden)return;
      const dueGrammar=dayPlan(day)?.publicContextPractice?.assignments||[];if(dueGrammar.length)box.append(el('p','','今天的语法部分包含 '+dueGrammar.length+' 项语境练习。完成后提交答案，有错时先订正；新的情境复习将在之后适合的课程日出现。'));if(!status?.available)return;
      if(!status.ready){box.append(el('p','',status.pending[0]?.reason||'正在更新后续听读课程。'));if(status.status==='public-course-prepare-failed'){box.append(button('重试更新后续课程',async()=>{await adaptive.preparePublicCourse?.({retry:true});await refreshHistory();}));}const fixed=adaptive.read?.().startedDays?.includes(day);if(day>=2&&!fixed&&!attempt)$('courseBegin').disabled=true;}
      else{if(!attempt)$('courseBegin').disabled=storageBroken||!material;if(status.pending.length)box.append(el('p','',status.pending.length+' 项公开材料仍待安全排课或先修核对，现有课程与已交原稿保留。'));else box.append(el('p','',status.assignedCount+' 份公开听读材料已进入后续日课；词汇、语法关联与间隔复习仍待实际活动，不按展示记完成。'));}
    }
    async function refreshHistory() {
      const ticket=++historyRead,owner=profileId,revision=recordsRevision;
      const current=()=>!storageBroken&&owner===profileId&&(root.IELTSProfiles?.current().id||'legacy')===owner;
      try{
        const fresh=await R.list();if(!current()||ticket!==historyRead)return;
        const index=root.IELTSRecordSnapshotIndex,receipt=index?.receipt?.(fresh);
        if(revision!==recordsRevision||receipt&&index.isCurrent?.(fresh)!==true)return refreshHistory();
        setRecords(fresh);await refreshMediaBudget(fresh);if(!current()||ticket!==historyRead)return;
        if(root.IELTSAdaptivePlan?.adoptStarted){try{root.IELTSAdaptivePlan.adoptStarted({records,drafts:allDrafts(),exposures:state.exposures});}catch(error){notice('已开始课程的保护记录未更新：'+error.message+'；已有草稿与作品保留。',true);}}
      }catch(error){if(ticket===historyRead&&current())notice('作品记录无法读取：'+error.message,true);return;}
      if(storageBroken){renderDrafts();return;}
      const effectiveDay=dayPlan(day);if(day&&(!attempt||submittedRecord)&&A.materialContentHash(effectiveDay)!==renderedDayHash){showDay(day,material?.id);return;}publicPlanNotice();
      if(!autoRouted){autoRouted=true;if((placementReroute||!params.has('day')&&!params.has('material')&&!root.location.hash)&&root.IELTSYearPlanner){placementReroute=false;let startDate;try{startDate=JSON.parse(storage.getItem('ielts52-daily-plan-v1')||'null')?.startDate;}catch(_){}const report=root.IELTSYearPlanner.observe({data,placement:root.IELTSPlacement,records,drafts:allDrafts(),startDate,verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord,isDayComplete:(n,own)=>{if(n===365)return own.some(r=>r.source==='year-review'&&A.decodeArtifact(r)?.yearSummary?.text?.trim().length>=20);try{return root.IELTSMistakes?.forDay(n)?.completionValid===true&&dayReadiness(data,n,own,{recordCorrectionStatus:r=>root.IELTSMistakes?.recordCorrectionStatus?.(r)}).ready;}catch(_){return false;}}});const selected=state.selectedCourseDay?.day,access=selected&&courseSelectionAccess(data,records,selected,{scheduledDay:report.scheduledDay,placement:root.IELTSPlacement,yearPlanner:root.IELTSYearPlanner,assessment:A,verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord}),target=access?.allowed?Math.max(report.courseDay,selected):report.courseDay;if(target!==day&&(!attempt||submittedRecord)){showDay(target);return;}}}
      const week=dayPlan(day)?.week||1,allPrerequisites=prerequisiteStatus(data.materials,records,week,A,{data}),prerequisites=allPrerequisites.filter(item=>!item.pass&&!item.placementCovered),covered=allPrerequisites.filter(item=>item.placementCovered&&!item.pass);
      let prerequisiteBox=$('coursePrerequisites');if(!prerequisiteBox){prerequisiteBox=el('p','course-target');prerequisiteBox.id='coursePrerequisites';$('courseDayTitle').parentElement?.append(prerequisiteBox);}
      prerequisiteBox.hidden=!prerequisites.length&&!covered.length;prerequisiteBox.textContent=(covered.length?'入学起点已覆盖此前关卡 '+covered.map(item=>item.id).join('、')+' 的前置要求；原关卡状态保留，不记通过。':'')+(prerequisites.length?'前置关卡仍未验证：'+prerequisites.map(item=>item.id).join('、')+'。可以提前浏览，但会登记曝光；建议先完成原稿、订正和新题复测，再提高训练难度。':'');
      const actual=records.filter(r=>r.dayNumber===day);$('courseActual').textContent='本日已提交作品实际 '+actual.reduce((n,r)=>n+r.minutes,0).toFixed(1)+' 分钟；有效作品与能力关卡分别判断。';
      renderDrafts();
      $('courseQueue').replaceChildren();Object.values(state.queue).forEach(q=>{const record=records.find(r=>r.id===q.recordId);if(record)$('courseQueue').append(button(record.title+' · 重试评阅',()=>review(record,record.skill==='speaking')));});
      $('courseHistory').replaceChildren();records.filter(r=>['course-player','vocabulary-practice','mistake-review','year-review'].includes(r.source)).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)).slice(0,20).forEach(record=>{const row=el('article','course-record-row');row.append(el('strong','',record.title),el('p','',new Date(record.submittedAt).toLocaleString()+' · '+NAMES[record.skill]+' · '+record.minutes.toFixed(1)+' 分钟 · '+record.kind+' · '+(record.exposure==='unseen'?'开始时未见':'已见／未知')+' · '+record.evaluation.result));row.append(button('查看原稿与后续操作',()=>viewRecord(record)));$('courseHistory').append(row);});
      const gates=A.gateMastery(records,data.materials);$('courseGates').replaceChildren();if(!gates.length)$('courseGates').append(el('p','course-small','尚无关卡原稿。完成对应 A 卷后，按错因补强并至少间隔 48 小时换 B 卷。'));
      gates.forEach(g=>{const row=el('article','course-gate-row');row.append(el('strong','',g.id+' · '+g.label),el('p','',g.pass?'已保留 A 卷原稿及至少 48 小时后的未见 B 卷独立复测证据。':g.reasons.join('；')+(g.dueAt?' · B 卷最早开始：'+new Date(g.dueAt).toLocaleString():'')));$('courseGates').append(row);});
      const ready=A.readiness(records,data.materials);$('courseReadiness').replaceChildren(el('strong','',ready.label),el('p','course-small',ready.disclaimer));ready.reasons.forEach(reason=>$('courseReadiness').append(el('p','course-small',reason)));
      updateSavedIntro();renderSavedModuleEntries();updateNextButtons();updateLearningBadges();
      root.dispatchEvent(new CustomEvent('ielts:course-progress',{detail:{day,records:actual,allRecords:records,drafts:allDrafts(),tasks:dayPlan(day).tasks}}));
    }
    root.IELTSTodayNavigation={showDay,resumeDraft,learningQueue,openQueued,refreshYearRecords:async()=>{const owner=profileId,guard=generation;root.IELTSProfiles?.assertFresh?.();const fresh=await R.list();root.IELTSProfiles?.assertFresh?.();if(owner!==profileId||guard!==generation||(root.IELTSProfiles?.current().id||'legacy')!==profileId)throw Error('学习档案已变化，原稿保留。');setRecords(fresh);await refreshMediaBudget(fresh);return fresh;},yearContext:()=>({data,current:{day,taskId:task?.id,materialId:material?.id,active:!!attempt,submitted:!!submittedRecord},records:continuationRecords(),drafts:allDrafts(),currentDay:day,selectedDay:state.selectedCourseDay?.day,budget:calendarBudget(),timerState:root.IELTSStudyTimer?.snapshot?.(),getDay:item=>dayPlan(item.day)||item,summaryForDay:n=>root.IELTSMistakes?.forDay(n),recordCorrectionStatus:r=>root.IELTSMistakes?.recordCorrectionStatus?.(r),placement:root.IELTSPlacement,yearPlanner:root.IELTSYearPlanner,assessment:A,player:root.IELTSCoursePlayer,hub:root.IELTSTodayHub,verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord,exposures:state.exposures,extraPlan:(source,budget)=>source&&root.IELTSAdaptivePlan?.planRemaining?.(source,continuationRecords(),undefined,{data,budgetMinutes:360,calendarBudget:budget,exposures:state.exposures,startedMaterialIds:allDrafts().map(d=>d.materialId)})}),openYear:async entry=>{const owner=profileId,guard=generation,api=yearCourseAPI();if(!api||!mayContinue())return false;if(entry.draftId)return resumeDraft(entry.draftId);const admitted=await api.start(entry);if(owner!==profileId||guard!==generation){await api.releaseFailedStart(admitted.materialId,admitted.ticket);return false;}let finished=false;try{const target=entry.day||day;if(target!==day)showDay(target);const base=dayPlan(day)?.tasks.find(t=>t.id===admitted.material.skill)||{id:admitted.material.skill,minutes:admitted.meta.estimatedStudyMinutes,mode:'practice',materialIds:[]};showTask({...base,mode:'practice',materialIds:[admitted.material.id],instructions:admitted.material.instructions||'完成这份适级普通练习，保留原始作答并核对订正。',deliverable:'完整原始作答、真实评阅及必要订正；只作普通学习'},admitted.material.id);await begin({mode:'practice',yearStart:admitted});const saved=!!attempt?.yearAssignment&&attempt.materialId===admitted.materialId;if(!saved)return false;finished=await api.finishStart(admitted);return finished;}catch(error){notice('追加原稿保存未完成：'+error.message+' 已有输入保留，请从原稿入口继续。',true);return false;}finally{if(!finished)await api.releaseFailedStart(admitted.materialId,admitted.ticket);}},allDrafts:()=>copy(allDrafts()),budget:()=>calendarBudget(),selectedCourseDay:()=>state.selectedCourseDay?.day||null,
      selectCourseDay:async number=>{
        root.IELTSProfiles?.assertFresh?.();const profile=profileId,guard=generation,owner=attempt;if(storageBroken||(root.IELTSProfiles?.current().id||'legacy')!==profile)throw Error('学习档案已变化，请保留输入并刷新。');
        const works=await R.list();root.IELTSProfiles?.assertFresh?.();if(storageBroken||guard!==generation||owner!==attempt||profile!==profileId||(root.IELTSProfiles?.current().id||'legacy')!==profile)throw Error('课程或学习档案已改变，原稿保留，请重新选择。');
        const schedule=root.IELTSDailyLearningLoad?.calendarSchedule({data,startDate:courseStartDate(),now:Date.now(),yearPlanner:root.IELTSYearPlanner,placement:root.IELTSPlacement}),access=courseSelectionAccess(data,works,number,{scheduledDay:schedule?.scheduledDay,placement:root.IELTSPlacement,yearPlanner:root.IELTSYearPlanner,assessment:A,verifiedRecord:root.IELTSAdaptivePlan?.verifiedRecord});if(!access.allowed)throw Error(access.reason);
        await prepareStudyDayEnd({isCurrent:()=>{root.IELTSProfiles?.assertFresh?.();return !storageBroken&&guard===generation&&owner===attempt&&profile===profileId&&(root.IELTSProfiles?.current().id||'legacy')===profile;},busy:busy||pendingNetwork>0,recording:recorder?.state==='recording',recordingSaving,mediaStates:[oralController?.getState?.(),activityController?.getMediaState?.()],checkpoint:()=>{advanceTimer();running=false;if(attempt&&!submittedRecord){attempt.interrupted||=attempt.mode==='assessment';activityController?.pause?.();listeningController?.pause?.();oralController?.cancel?.();stopMedia();if(!persistDraft())return false;syncSessionVisibility();}return true;}});
        mutate(next=>{next.selectedCourseDay={day:number,selectedAt:new Date(Math.max(Date.now(),(Date.parse(next.selectedCourseDay?.selectedAt)||0)+1)).toISOString()};next.day=number;});setRecords(works);autoRouted=true;pendingParent=null;
        if(root.history?.replaceState)try{const url=new URL(root.location.href);url.searchParams.set('day',String(number));for(const key of ['material','parent','kind','activity','mode'])url.searchParams.delete(key);url.hash='';root.history.replaceState(null,'',url.href);}catch(_){}
        showDay(number);return true;
      },
      showLatestRecord:async(taskId,materialId)=>{try{const profile=profileId,view=generation,works=await R.list();if(profile!==profileId||view!==generation||(root.IELTSProfiles?.current().id||'legacy')!==profile)return;setRecords(works);const record=works.filter(item=>item.dayNumber===day&&item.taskId===taskId&&item.skill===taskId&&(!materialId||item.materialId===materialId)&&A.decodeArtifact(item)).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||(b.version||0)-(a.version||0)||b.id.localeCompare(a.id))[0];if(!record){notice('本日尚未找到这份材料的原稿，请从最近作品检查；不会新建练习。',true);return;}viewRecord(record);}catch(error){notice('原稿暂未打开：'+error.message,true);}},
      drafts:()=>Object.values(state.drafts).filter(d=>d.courseDay===day&&!records.some(r=>r.id===d.id)).map(d=>({id:d.id,taskId:d.taskId,materialId:d.materialId})),
      resumeNext:async(taskId,preferredMaterialId)=>{
        const ownerProfile=profileId,view=generation;if(storageBroken||(root.IELTSProfiles?.current().id||'legacy')!==ownerProfile){notice('学习档案已切换或草稿不可读，请刷新后继续；原稿保留。',true);return;}
        try{await refreshMediaBudget();}catch(error){notice('活动预算核对失败：'+error.message,true);return;}
        if(storageBroken||ownerProfile!==profileId||view!==generation||(root.IELTSProfiles?.current().id||'legacy')!==ownerProfile){notice('课程或学习档案已切换，请从当前档案的草稿列表继续。',true);return;}
        const t=dayPlan(day)?.tasks.find(t=>t.id===taskId);if(!t)return;
        if(!mayContinue())return;
        const raw=storage.getItem(KEY);state=raw?parseState(raw):newState();const currentDrafts=Object.values(state.drafts).filter(d=>!attempt||d.id!==attempt.id);if(attempt&&!submittedRecord)currentDrafts.push(attempt);
        const candidates=currentDrafts.filter(d=>d.courseDay===day&&d.taskId===taskId&&(preferredMaterialId?d.materialId===preferredMaterialId:t.materialIds.includes(d.materialId))&&!records.some(r=>r.id===d.id)&&resumableDraft(d,materialMap.get(d.materialId))),draft=preferredDraft(candidates,{materialId:preferredMaterialId,materialFor:id=>materialMap.get(id),profileId,records});
        const sameActive=attempt&&!submittedRecord&&task.id===taskId&&(!preferredMaterialId||material.id===preferredMaterialId)&&resumableDraft(attempt,material);
        if(sameActive&&(draftProgress(attempt,material).score.some(Boolean)||!draft||draft.id===attempt.id)){if(!running){running=true;lastInteraction=Date.now();tickAt=Date.now();$('coursePause').textContent='暂停';syncSessionVisibility();notice(draftProgress(attempt,material).label+'。草稿已恢复，正在继续。');}return;}
        if(taskId==='vocabulary'&&attempt&&!submittedRecord){if(busy||pendingNetwork>0||captureInProgress()){notice('原稿或录音仍在保存，请等待完成后再继续。');return;}if(!persistDraft())return;}
        if(!draft&&candidates.length){notice('已有草稿与当前材料版本不匹配，请从草稿列表核对原稿；不会另建空白练习覆盖进度。',true);return;}
        if(draft){const original=resolveDraftMaterial(draft,materialMap.get(draft.materialId));if(!original.compatible){renderDrafts();notice(original.reason+' 请在草稿列表查看或下载完整原稿；不会另建空白练习。',true);return;}}
        showTask(t,draft?.materialId||preferredMaterialId);if(draft){const restored=bindDraftMaterial(draft,materialMap.get(draft.materialId),{assessment:A,task:t,data,courseData:root.IELTSCourse});showMaterial(restored.material);task={...task,...(restored.material.taskContract||{}),id:draft.taskId};attempt=restored.draft;attempt.interrupted||=attempt.mode==='assessment';lastDraftSerialized=JSON.stringify(draft);submittedRecord=null;running=true;lastInteraction=Date.now();tickAt=Date.now();if(!draft.materialBinding&&!persistDraft())return;renderSession();notice(draftProgress(draft,material).label+'。草稿已恢复，正在继续。');}else{const saved=latestSavedFor(material);if(saved)return viewRecord(saved);await begin();}
      },showTask:(taskId,preferredMaterialId)=>{const selected=dayPlan(day)?.tasks.find(t=>t.id===taskId);if(selected)showTask(selected,preferredMaterialId);},openExtra:async(entry)=>{
        const t=dayPlan(day)?.tasks.find(t=>t.id===entry.skill),m=materialMap.get(entry.materialId);if(!t||!m||m.pool!=='training')return;
        if(entry.kind==='lesson-vocabulary-supplement'){const candidate=learningQueue()?.entries.find(e=>e.lessonSupplement&&e.kind==='extra'&&e.day===day&&e.materialId===m.id&&e.fitsBudget===true);if(!candidate){notice('补充词汇安排已改变，先完成到期复习并核对预算。',true);return false;}entry=candidate.entry;}
        if(m.source?.publicSourceId){
          const owner=profileId,view=generation;let fresh;try{fresh=await R.list();if(owner!==profileId||view!==generation)return false;setRecords(fresh);await refreshMediaBudget(fresh);}catch(error){notice('补充练习状态核对失败：'+error.message,true);return false;}
          if(owner!==profileId||view!==generation||!mayContinue())return false;
          const queue=learningQueue(),candidate=queue?.entries.find(e=>e.publicSupplement&&e.materialId===m.id&&e.day===day&&e.fitsBudget===true);
          if(!candidate||queue.currentComplete){notice('补充练习安排已改变：请先进入尚未完成的课程，再查看适级材料。已完成课程和原稿保留。',true);return false;}
          if(candidate.draftId){await resumeDraft(candidate.draftId);return true;}
          entry=candidate.entry;
        }
        showTask({...t,materialIds:[entry.materialId],instructions:entry.strategy||'根据刚才的表现继续适级练习；实际完成后再判断是否需要补强。',...(m.source?.publicSourceId?{deliverable:'本次独立答案、客观核对与未通过题订正；只计补充练习，不替代核心或独立测评'}:{})},entry.materialId);return begin({mode:'practice'});
      },begin:()=>begin(),current:()=>({day,taskId:task?.id,materialId:material?.id,active:!!attempt,submitted:!!submittedRecord}),exposures:()=>copy(state.exposures)};
    root.addEventListener('ielts:study-rest-started',()=>{if(!attempt||submittedRecord||!running)return;advanceTimer();running=false;attempt.interrupted||=attempt.mode==='assessment';activityController?.pause?.();listeningController?.pause?.();oralController?.cancel?.();stopMedia();persistDraft();syncSessionVisibility();$('coursePause').textContent='休息后继续';notice('本轮专注已结束，正在番茄休息。草稿和原音保留；休息结束后手动继续。');announceView();});
    root.addEventListener('ielts:study-day-ending',event=>{
      const detail=event.detail;if(detail?.profileId!==profileId||typeof detail.waitUntil!=='function')return;
      const owner=attempt,guard=generation;
      detail.waitUntil(prepareStudyDayEnd({
        isCurrent:()=>{root.IELTSProfiles?.assertFresh?.();return !storageBroken&&!budgetDisposed&&generation===guard&&attempt===owner&&(root.IELTSProfiles?.current().id||'legacy')===profileId&&detail.date===(root.IELTSStudyTimerCore?.dateKey(Date.now())||root.IELTSYearPlanner?.dateKey(Date.now()));},
        busy:busy||pendingNetwork>0,recording:recorder?.state==='recording',recordingSaving,mediaStates:[oralController?.getState?.(),activityController?.getMediaState?.()],
        checkpoint:()=>{advanceTimer();running=false;if(attempt&&!submittedRecord){attempt.interrupted||=attempt.mode==='assessment';activityController?.pause?.();listeningController?.pause?.();oralController?.cancel?.();stopMedia();if(!persistDraft())return false;syncSessionVisibility();$('coursePause').textContent='继续';}return true;}
      }));
    });
    root.addEventListener('ielts:study-day-ended',event=>{if(event.detail?.profileId!==profileId)return;if(attempt&&!submittedRecord)pauseForBudget();else notice('今日学习已结束。已有作品保持原状态，下一日继续未完成课程。');updateNextButtons();announceView();});
    root.addEventListener('ielts:study-day-resumed',event=>{if(event.detail?.profileId!==profileId)return;const budget=calendarBudget();if(attempt&&!submittedRecord)$('coursePause').textContent=budget.exhausted?'下一日继续':'继续';notice(budget.exhausted?'今日任务已恢复，但360分钟预算已用完；草稿和原音保留，下一日继续。':'今日任务已恢复，草稿和原音保留；请手动点击继续，不会自动录音或播放。');updateNextButtons();announceView();});
    root.addEventListener('ielts:study-timer-changed',event=>{if(event.detail?.invalidated){running=false;generation++;storageBroken=true;activityController?.pause?.();listeningController?.pause?.();oralController?.cancel?.();stopMedia();reviewAbort?.abort();$('courseBegin').disabled=true;$('courseSubmit').disabled=true;$('coursePause').disabled=true;notice(event.detail.error||'学习档案已更新，请先保留当前输入，再刷新页面继续。',true);}else if((!event.detail?.profileId||event.detail.profileId===profileId)&&attempt&&!submittedRecord&&calendarBudget().dayEnded)pauseForBudget();updateNextButtons();});
    root.addEventListener('ielts:placement-changed',()=>{if(attempt&&!submittedRecord){updateNextButtons();announceView();notice('课程起点已更新；当前草稿保持原课程归属，提交后继续匹配程度的课程。');return;}autoRouted=false;placementReroute=true;refreshHistory().catch(error=>notice('入学起点暂未更新：'+error.message,true));});
    root.addEventListener('ielts:public-course-plan-changed',event=>{if(event.detail?.profileId&&event.detail.profileId!==profileId||storageBroken)return;refreshHistory().catch(error=>notice('后续听读安排暂未更新：'+error.message,true));});
    if(root.IELTSMistakes?.EVENT)root.addEventListener(root.IELTSMistakes.EVENT,()=>{if(storageBroken||!root.IELTSPublicContextPractice||(root.IELTSProfiles?.current().id||'legacy')!==profileId)return;refreshHistory().catch(error=>notice('语境语法订正状态暂未更新：'+error.message,true));});
    if(root.IELTSMistakes?.EVENT)root.addEventListener(root.IELTSMistakes.EVENT,updateNextButtons);
    root.addEventListener('hashchange',()=>{const match=/^#day(\d+)$/.exec(root.location.hash);if(match)showDay(Number(match[1]));});
    if(root.IELTSWordHover)hoverController=root.IELTSWordHover.install({root:doc,autoEnrich:true,courseData:root.IELTSCourse,curriculumData:data,level:()=>material?.level||'A0',materialId:()=>material?.id||'',lookupAI:(word,context,level)=>localJSON('/api/ai/glossary',{word,context,level})});
    $('courseBegin').addEventListener('click',async()=>{
      const owner=profileId,view=generation;if(storageBroken||busy)return;
      try{const fresh=await R.list();if(owner!==profileId||view!==generation||(root.IELTSProfiles?.current().id||'legacy')!==owner)return;setRecords(fresh);
        const draft=material&&!pendingParent&&draftFor(material);if(draft)return resumeDraft(draft.id);const saved=material&&!pendingParent&&latestSavedFor(material);if(saved)return viewRecord(saved);return begin();
      }catch(error){notice('原作答暂未读取：'+error.message+'。已有输入保留，请重试。',true);}
    });$('courseSubmit').addEventListener('click',submit);$('courseDay').addEventListener('change',()=>showDay($('courseDay').value));$('coursePrevious').addEventListener('click',()=>showDay(Math.max(1,day-1)));$('courseNext').addEventListener('click',()=>showDay(Math.min(365,day+1)));$('courseDiscard').addEventListener('click',()=>{const current=material;showMaterial(current);refreshHistory();});
    $('coursePause').addEventListener('click',async()=>{if(submittedRecord)return;if(!running){try{await refreshMediaBudget();}catch(error){notice(error.message,true);return;}}if(!running&&!mayContinue())return;advanceTimer();if(calendarBudget().exhausted){pauseForBudget();return;}running=!running;if(running){root.IELTSStudyTimer?.studyStarted?.();lastInteraction=Date.now();activityController?.resume?.();}if(!running){activityController?.pause?.();oralController?.cancel?.();listeningController?.pause?.();stopMedia();}syncSessionVisibility();if(!running&&attempt?.mode==='assessment')attempt.interrupted=true;$('coursePause').textContent=running?'暂停':'继续';renderExposure();persistDraft();});
    ['pointerdown','keydown','input','wheel'].forEach(type=>doc.addEventListener(type,()=>{lastInteraction=Date.now();},{passive:true}));
    doc.addEventListener('visibilitychange',()=>{advanceTimer();if(doc.hidden&&attempt&&!submittedRecord){attempt.interrupted||=attempt.mode==='assessment';persistDraft();}});
    root.addEventListener('ielts:learning-assistance',event=>{
      if(storageBroken||event.detail?.source!=='word-hover'||!material||event.detail.materialId!==material.id)return;
      if(attempt&&!submittedRecord){assistance('hint');return;}
      if(submittedRecord)return;
      try{const now=new Date().toISOString();mutate(next=>{const old=next.exposures[material.id];next.exposures[material.id]={firstSeenAt:old?.firstSeenAt||now,lastSeenAt:now,count:old?.count||1,assisted:true,courseDays:[...new Set([...(old?.courseDays||[]),day])].sort((a,b)=>a-b)};});}catch(error){notice('词义帮助状态未保存：'+error.message+'；请保留页面重试。',true);}
    });
    root.addEventListener('ielts:selection-assistance',event=>{if(event.detail?.materialId===material?.id)assistance('ai');});
    root.addEventListener('ielts:records-changed',()=>{if((root.IELTSProfiles?.current().id||'legacy')===profileId)refreshHistory();});root.addEventListener('ielts:profile-changed',()=>{advanceTimer();running=false;stopMedia();reviewAbort?.abort();generation++;storageBroken=true;recordsReady=false;$('courseBegin').disabled=true;$('courseSubmit').disabled=true;updateLearningBadges();updateNextButtons();notice('学习档案已切换。当前未保存输入仍在本页，请先复制保留，再刷新；不会写入其他档案。',true);});
    root.addEventListener('pagehide',()=>{budgetDisposed=true;stopBudgetWatch?.();advanceTimer();if(attempt&&!submittedRecord){attempt.interrupted||=attempt.mode==='assessment';persistDraft();}stopMedia();reviewAbort?.abort();});
    let stopBudgetWatch=null;setInterval(advanceTimer,1000);load();if(root.IELTSYearPlanner?.watchMediaActivity)stopBudgetWatch=root.IELTSYearPlanner.watchMediaActivity(()=>refreshMediaBudget().catch(error=>notice('活动预算暂未刷新：'+error.message,true)));setInterval(()=>{if(!budgetDisposed&&!storageBroken&&!doc.hidden)refreshMediaBudget().catch(error=>notice('活动预算暂未刷新：'+error.message,true));},5000);const linkedMaterial=materialMap.get(params.get('material'));const mappedDay=linkedMaterial?data.days.find(d=>d.tasks.some(t=>t.materialIds.includes(linkedMaterial.id)))?.day:null;const hashDay=/^#day(\d+)$/.exec(root.location.hash||'');let initialPlacement=null;try{initialPlacement=placementRoute(data);}catch(_){}const initialDay=Number(params.get('day'))||Number(hashDay?.[1])||mappedDay||initialPlacement?.startDay||R.currentDay()||state.day;showDay(Math.min(365,Math.max(1,initialDay)),params.get('material'));refreshHistory().then(()=>{if(!pendingParent)return;const parent=records.find(r=>r.id===pendingParent.parentId);if(!parent){notice('关联原稿未找到，请从作品记录重新打开。',true);pendingParent=null;return;}const matching=dayPlan(day)?.tasks.find(t=>t.id===parent.skill);if(matching)showTask(matching,params.get('material'));notice('已关联原稿「'+parent.title+'」。选择同技能材料后点击开始，将保存'+(pendingParent.kind==='retest'?'复测':'订正')+'版本。'+(!materialMap.has(parent.materialId)?'原材料来自其他练习模块，请选择课程内同技能材料。':''));});
  }
  const api={KEY,materialPreviouslySeen,MATERIAL_SNAPSHOT_LIMIT,freezeMaterialBinding,cleanMaterialBinding,resolveDraftMaterial,bindDraftMaterial,materialForRecord,mapItemGeometry,independentTask,audioCreditLink,newState,parseState,mergeState,draftProgress,preferredDraft,vocabularyPlanDifference,vocabularyTaskSummary,vocabularyLessonOutline,createSubmissionProgress,courseSelectionAccess,queueCourseDay,taskFor,prerequisiteStatus,protectedMaterialAccess,figureRows,figurePanels,planGeometry,reviewRequest,prepareAudio,audioSource,runReviewPipeline,feedbackForRecord,practiceReviewResult,foundationSpeaking,localHTTP,transcribeCourseAudio,modelReadingReference,cleanModelReading,modelReadingSnapshot,validateModelReading,verifySpeakingStage,objectiveSubmissionComplete,submissionSatisfied,bindingMatchesMaterial,resolveCourseMaterial,freezeDayPlanBinding,cleanDayPlanBinding,publicPracticeAccess,resolvedCourseDay,dayReadiness,quotedGrammarSourceIds,orderedTaskMaterialIds,navigationMaterial,nextDestination,toRecord,prepareStudyDayEnd};root.IELTSCoursePlayer=Object.freeze(api);if(typeof module==='object'&&module.exports)module.exports=api;
  if(root.document?.getElementById('coursePlayerApp'))init();
})(typeof window!=='undefined'?window:globalThis);
