(function (root, factory) {
  'use strict';
  const dictionary = root.IELTSWordDictionary || (typeof require === 'function' ? require('./word-dictionary.js') : null);
  const api = factory(root, dictionary);
  root.IELTSVocabularyPractice = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Dictionary) {
  'use strict';
  const MODES = ['completion','meaning','dictation'];
  const LEGACY_MODES = ['meaning','completion','dictation'];
  const NAMES = {meaning:'中文写英文',completion:'补全单词',dictation:'听写'};
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalizeAnswer = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const uniqueId = () => 'vocab-'+(root.crypto?.randomUUID?.() || Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));

  function maskWord(word) {
    const letters = [...String(word)], positions = letters.map((letter,index) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(letter) ? index : -1).filter(index => index >= 0);
    if (!positions.length) return '_';
    // Retain alternating letters, but always remove at least one (including one-letter words).
    const missing = positions.filter((_,index) => index % 2 === 1);
    if (!missing.length) missing.push(positions[positions.length-1]);
    missing.forEach(index => { letters[index] = '_'; });
    return letters.join('');
  }
  function wordsFor(material, options = {}) {
    const curriculum = options.curriculumData || root.IELTSCurriculumData || {};
    const lexical = options.dictionary || Dictionary?.create(options);
    let source = material?.vocabulary;
    if (!Array.isArray(source) || !source.length) {
      const readingId = material?.id?.replace(/-vocabulary$/, '');
      source = (curriculum.materials || []).find(item => item.id === readingId)?.vocabulary || [];
    }
    const seen = new Set(), out = [];
    for (const raw of source) {
      if (!Dictionary?.validWord(raw?.word)) continue;
      const key = Dictionary.normalize(raw.word);
      if (seen.has(key)) continue;
      seen.add(key);
      const fallback = lexical?.lookup(raw.word, raw.example || material?.passage || '', material?.id) || {};
      const explicitAudio=Dictionary.safeAudioPath(raw.audio),sourceIpa=raw.ipa||raw.phonetic,sourcePronunciation=sourceIpa?Dictionary.safeEntry(raw,{audioData:options.audioData}):null;
      let item = Dictionary.safeEntry({...fallback,...raw,ipa:sourcePronunciation?.ipa || (fallback.ipaAccent === 'en-US' ? fallback.ipa : raw.ipa || fallback.ipa),audio:explicitAudio || fallback.audio,example:raw.example || raw.context || fallback.example,materialId:material?.id || ''},{audioData:options.audioData});
      if(item){const indexed=Dictionary.indexedAudioChoice(item.word,item.ipa,options.audioData,{meaning:item.meaning,pos:raw.pos,preferSense:!raw.ipa&&!raw.phonetic});if(indexed.ipa)item=Dictionary.safeEntry({...item,ipa:indexed.ipa,ipaAccent:'en-US'},{audioData:options.audioData});item.audio=explicitAudio || indexed.audio || (indexed.blocked?'':item.audio);}
      if (item) out.push({...item,index:out.length});
      if (out.length > 100) throw Error('单次词汇训练超过100词，请分组学习。');
    }
    return out;
  }
  function sourceContextLabel(word,material,options={}) {
    const day=Number(options.courseDay),curriculum=options.curriculumData||root.IELTSCurriculumData;
    if(!Number.isInteger(day)||day<2||day>10||material?.source?.kind!=='derived-lexical')return '';
    const quote=String(word?.example||'').trim(),raw=(material.vocabulary||[]).find(item=>normalizeAnswer(item.word)===normalizeAnswer(word.word)&&String(item.example||'').trim()===quote),ids=raw?.sourceMaterialId?[raw.sourceMaterialId]:material.source.sourceIds||[];
    const sources=(curriculum?.materials||[]).filter(item=>ids.includes(item.id)&&quote&&(item.skill==='listening'?item.transcript:item.passage||'')?.includes(quote));
    if(!sources.length)return '其他课原句 · 原来源待核验；保留这份原词义和例句，不据此判断同源听力完全陌生。';
    const days=[...new Set((curriculum.days||[]).filter(item=>item.tasks?.some(task=>task.materialIds?.some(id=>sources.some(source=>source.id===id)))).map(item=>item.day))].sort((a,b)=>a-b),first=days[0];
    const label=Number.isInteger(first)?first>day?'本周其他课原句预习':first===day?'本课听力原句':'其他课原句':'其他课原句';
    return label+' · 来源：'+(Number.isInteger(first)?'第 '+first+' 课，':'')+sources.map(item=>item.title||item.id).join(' / ')+'。同源听力不应当作完全陌生检测。';
  }
  function createSession(options = {}) {
    if (typeof options.draft === 'string' && options.draft.length > 15000) throw Error('词汇草稿超过15KB，已保留原稿。');
    const incoming = typeof options.draft === 'string' ? JSON.parse(options.draft) : options.draft;
    const version = incoming?.schema === 1 || options.trainingVersion === 1 ? 1 : 2, modes = version === 1 ? LEGACY_MODES : MODES;
    const material = options.material || {}, words = wordsFor(options.words ? {...material,vocabulary:options.words} : material,options);
    if (!Number.isInteger(options.courseDay || 1) || (options.courseDay || 1) < 1 || (options.courseDay || 1) > 365) throw Error('课程日应为1至365。');
    if (!words.length) throw Error('这份材料没有绑定必学词，请选择当天的词汇材料。');
    const state = {schema:version,trainingVersion:version,study:{spellings:{},speaking:{},workIds:{},inputs:{}},restoring:false,id:uniqueId(),materialId:material.id || 'vocabulary',materialVersion:String(material.version || '1'),courseDay:options.courseDay || 1,startedAt:new Date().toISOString(),phase:'learn',round:0,answers:{meaning:{},completion:{},dictation:{}},audio:{},rounds:[],testing:false};
    let restoringRounds = false;
    const originalOrder=words.map((_,index)=>index);
    state.learningOrder=originalOrder.slice();
    const validOrder=order=>Array.isArray(order)&&order.length===words.length&&new Set(order).size===words.length&&order.every(index=>Number.isInteger(index)&&index>=0&&index<words.length);
    if(!incoming&&version===2&&options.learningOrder!==undefined){if(!validOrder(options.learningOrder))throw Error('词汇学习显示顺序无效，原稿保留。');state.learningOrder=options.learningOrder.slice();}
    state.roundOrders=Object.fromEntries(modes.map(mode=>[mode,originalOrder.slice()]));
    function shuffleFutureRounds(first=0) {
      if(version!==2)return;
      for(let round=first;round<modes.length;round++){
        const order=originalOrder.slice();
        for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
        const previous=round?state.roundOrders[modes[round-1]]:originalOrder;
        if(order.length>1&&order.every((value,index)=>value===previous[index]))order.push(order.shift());
        state.roundOrders[modes[round]]=order;
      }
    }
    function roundOrder(mode=state.phase){return (state.roundOrders[mode] || originalOrder).slice();}
    const promptFor = (mode,index) => mode === 'meaning' ? words[index].meaning || '（本词释义待查询）' : mode === 'completion' ? maskWord(words[index].word) : '听音写出完整英文';
    function learningProgress() {
      const items = words.map((word,index) => ({index,word:word.word,spellings:(state.study.spellings[index] || []).length,speaking:(state.study.speaking[index] || []).length,workIds:(state.study.workIds[index] || []).slice()}));
      return {required:version === 2,complete:version === 2 && !state.restoring && items.every(item => item.spellings === 3 && item.speaking === 3),items};
    }
    function recordSpelling(index,value) {
      if (version !== 2 || !words[index] || typeof value !== 'string' || value.length > 200) throw Error('学习拼写输入无效。');
      const values = state.study.spellings[index] || (state.study.spellings[index] = []);
      if (values.length >= 3) throw Error('本词三遍正确拼写已完成。');
      if (normalizeAnswer(value) !== normalizeAnswer(words[index].word)) return false;
      values.push(value.trim()); state.study.inputs[index] = ''; return true;
    }
    function setStudyInput(index,value) { if (!words[index] || typeof value !== 'string' || value.length > 200) throw Error('学习输入无效。'); state.study.inputs[index] = value; }
    function registerStudyWork(index,workId) {
      if (version !== 2 || !words[index] || !/^work-[A-Za-z0-9-]{8,100}$/.test(workId) || (state.study.spellings[index] || []).length !== 3) throw Error('请先完成本词三遍正确拼写，再独立录音。');
      const refs = state.study.workIds[index] || (state.study.workIds[index] = []),valid = state.study.speaking[index] || [];
      if (refs.includes(workId)) return;
      if (refs.length >= 3) { const replace = refs.findIndex(id => !valid.some(item => item.workId === id)); if (replace < 0) throw Error('本词三次跟读已完成。'); refs.splice(replace,1); }
      refs.push(workId);
    }
    function recordSpeaking(index,proof) {
      if (version !== 2 || !words[index] || (state.study.spellings[index] || []).length !== 3 || !proof || proof.verified !== true || proof.nonSilent !== true || proof.reference !== words[index].word || proof.provider !== 'Alibaba oral assessment' || !/^work-[A-Za-z0-9-]{8,100}$/.test(proof.workId) || !/^[a-f0-9]{64}$/.test(proof.hash) || typeof proof.evidenceId !== 'string' || !proof.evidenceId || proof.evidenceId.length > 120 || !Number.isFinite(Date.parse(proof.recordedAt)) || !Number.isFinite(proof.durationSeconds) || proof.durationSeconds < .25 || proof.durationSeconds > 15.1 || ['accuracy','fluency','completeness'].some(key => typeof proof.result?.[key] !== 'number' || !Number.isFinite(proof.result[key]) || proof.result[key] < 0 || proof.result[key] > 100)) throw Error('跟读必须有独立、非静音原音和完整阿里专业结果。');
      const values = state.study.speaking[index] || (state.study.speaking[index] = []);
      if (values.length >= 3) throw Error('本词三次跟读已完成。');
      const all = Object.values(state.study.speaking).flat();
      if (all.some(item => item.workId === proof.workId || item.hash === proof.hash || item.evidenceId === proof.evidenceId)) throw Error('同一原音、作品或专业证据不能重复计入三次跟读。');
      registerStudyWork(index,proof.workId);
      values.push({workId:proof.workId,hash:proof.hash,evidenceId:proof.evidenceId,recordedAt:proof.recordedAt,durationSeconds:proof.durationSeconds,passed:proof.result.accuracy>=80&&proof.result.fluency>=75&&proof.result.completeness>=90,result:clone(proof.result)});
      state.study.workIds[index] = [...values.map(item => item.workId),...(state.study.workIds[index] || []).filter(id => !values.some(item => item.workId === id))].slice(0,3);
      state.testing = modes.includes(state.phase) && learningProgress().complete;
    }
    function finishStudyRestore() { state.restoring = false; state.testing = modes.includes(state.phase) && (version === 1 || learningProgress().complete); }
    function getDraft() {
      return clone({schema:version,kind:'vocabulary-practice-draft',id:state.id,materialId:state.materialId,materialVersion:state.materialVersion,courseDay:state.courseDay,wordKeys:words.map(item => Dictionary.normalize(item.word)),startedAt:state.startedAt,phase:state.phase,round:state.round,learningOrder:state.learningOrder,roundOrders:state.roundOrders,answers:state.answers,audio:state.audio,roundSubmittedAt:state.rounds.map(item => item.attempts[0].submittedAt),...(version === 2 ? {study:{s:words.map((_,index)=>state.study.spellings[index] || []),w:words.map((_,index)=>state.study.workIds[index] || []),input:words.map((_,index)=>state.study.inputs[index] || '')}} : {})});
    }
    function getState() { return clone({...state,words,allModesCompleted:state.rounds.length === modes.length,learning:learningProgress(),draft:getDraft()}); }
    function begin() {
      if (state.phase !== 'learn') throw Error('本次学习已开始。');
      if (version === 2 && !learningProgress().complete) throw Error('请先为每个必学词完成三遍正确英文输入和三次真实跟读评测。');
      if (words.some(item => !item.meaning)) throw Error('请先补齐本组词义，再开始中文写英文。');
      state.phase = modes[0]; state.testing = true;
      return getState();
    }
    function setAnswer(index,value) {
      if (!modes.includes(state.phase) || !Number.isInteger(index) || !words[index] || typeof value !== 'string' || value.length > 200) throw Error('当前作答无效。');
      state.answers[state.phase][index] = value;
    }
    function markPlayed(index, proof) {
      if (state.phase !== 'dictation' || !words[index] || !proof || proof.completed !== true || proof.started !== true || !['local-audio','browser-tts'].includes(proof.kind) || !Number.isFinite(Date.parse(proof.completedAt))) throw Error('听写需要真实完成的播放记录。');
      state.audio[index] = {kind:proof.kind,source:typeof proof.source === 'string' ? proof.source.slice(0,200) : '',started:true,completed:true,completedAt:new Date(proof.completedAt).toISOString()};
      if (Number.isFinite(proof.durationSeconds) && proof.durationSeconds >= 0 && proof.durationSeconds <= 120) state.audio[index].durationSeconds = proof.durationSeconds;
    }
    function validateRound() {
      const mode = state.phase;
      if (version === 2 && !restoringRounds && !learningProgress().complete) throw Error('学习阶段三写三读尚未完成，不能提交测试。');
      if (!modes.includes(mode)) throw Error('当前没有可提交的测试轮。');
      for (const [position,index] of roundOrder(mode).entries()) {
        if (!normalizeAnswer(state.answers[mode][index])) throw Error('请完成第 '+(position+1)+' 词；不会把空白当成已练习。');
        if (mode === 'dictation' && !state.audio[index]?.completed) throw Error('第 '+(position+1)+' 词尚未成功播放完毕，请先听音。');
      }
      return mode;
    }
    function submitRound() {
      const mode = validateRound(), submittedAt = new Date().toISOString();
      const attempts = roundOrder(mode).map(index => { const word=words[index]; return ({
        id:state.id+'-'+mode+'-'+index,attemptId:state.id+'-'+mode+'-'+index,source:'vocabulary-practice',skill:'vocabulary',taskId:'vocabulary',courseDay:state.courseDay,dayNumber:state.courseDay,materialId:state.materialId,materialVersion:state.materialVersion,word:word.word,meaning:word.meaning,ipa:word.ipa,example:word.example,mode,prompt:promptFor(mode,index),userAnswer:state.answers[mode][index],expectedAnswer:word.word,correct:normalizeAnswer(state.answers[mode][index]) === normalizeAnswer(word.word),submittedAt,...(mode === 'dictation' ? {audio:clone(state.audio[index])} : {})
      }); });
      const round = {mode,correct:attempts.filter(item => item.correct).length,total:words.length,attempts};
      state.rounds.push(round); state.phase = 'feedback'; state.testing = false;
      return clone(round);
    }
    function next() {
      if (state.phase !== 'feedback') throw Error('请先提交当前一轮。');
      state.round++;
      state.phase = modes[state.round] || 'complete'; state.testing = modes.includes(state.phase);
      return getState();
    }
    function submission() {
      if (state.rounds.length !== modes.length || version === 2 && !learningProgress().complete) return null;
      const attempts = state.rounds.flatMap(round => round.attempts), mistakes = attempts.filter(item => !item.correct), correct = attempts.length-mistakes.length;
      const payload = {schema:version,trainingVersion:version,trainingComplete:learningProgress().complete,testPass:mistakes.length === 0,id:state.id,materialId:state.materialId,materialVersion:state.materialVersion,courseDay:state.courseDay,startedAt:state.startedAt,submittedAt:attempts.at(-1).submittedAt,allModesCompleted:true,pass:version === 2 && learningProgress().complete && mistakes.length === 0,correct,total:attempts.length,quantity:words.length,unit:'条',attempts:clone(attempts),mistakes:clone(mistakes)};
      payload.answer = JSON.stringify({schema:version,trainingVersion:version,trainingComplete:learningProgress().complete,kind:'vocabulary-three-modes',words:words.map(({word,meaning,ipa,example}) => ({word,meaning,ipa,example})),allModesCompleted:true,lexicalMetadata:'words',rounds:state.rounds.map(round=>({...round,attempts:round.attempts.map(({meaning,ipa,example,...attempt})=>attempt)})),...(version === 2 ? {learning:words.map((word,index)=>({word:word.word,spellings:state.study.spellings[index] || [],speaking:(state.study.speaking[index] || []).map(({workId,hash,evidenceId,recordedAt,passed,durationSeconds,result})=>({workId,hash,evidenceId,recordedAt,passed,durationSeconds,result,provider:'Alibaba oral assessment'}))}))} : {})});
      payload.evaluation = {method:'objective',result:version === 1 ? mistakes.length ? 'revise' : 'unverified' : payload.pass ? 'pass' : 'revise',score:correct,maxScore:attempts.length,threshold:1,feedback:(version === 1 ? '旧版练习保留原轮序和原始成绩，未完成新版三写三读训练，不作为新版通过。' : '每个必学词先完成三遍正确英文输入、三次真实跟读评测，再完成补全、中文写英文、听写三轮。')+'按标准英文逐项核对（忽略大小写及首尾空格）。本次 '+correct+'/'+attempts.length+'；同词三轮不等于独立迁移或正式IELTS成绩。'};
      return payload;
    }
    function restoreDraft(raw) {
      if (typeof raw === 'string') { if (raw.length > 15000) throw Error('词汇草稿超过15KB，已保留原稿。'); raw = JSON.parse(raw); }
      const allowed = ['schema','kind','id','materialId','materialVersion','courseDay','wordKeys','startedAt','phase','round','answers','audio','learningOrder','roundOrders','roundSubmittedAt',...(version === 2 ? ['study'] : [])];
      const bad = () => { throw Error('词汇草稿与当前材料不匹配或格式无效，已保留原稿。'); };
      if (!raw || Array.isArray(raw) || typeof raw !== 'object' || Object.keys(raw).some(key => !allowed.includes(key)) || JSON.stringify(raw).length > 15000 || raw.schema !== version || raw.kind !== 'vocabulary-practice-draft' || raw.materialId !== state.materialId || raw.materialVersion !== state.materialVersion || raw.courseDay !== state.courseDay || typeof raw.id !== 'string' || !/^vocab-[A-Za-z0-9-]{1,130}$/.test(raw.id) || !Array.isArray(raw.wordKeys) || JSON.stringify(raw.wordKeys) !== JSON.stringify(words.map(item => Dictionary.normalize(item.word)))) bad();
      const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value && Date.parse(value) <= Date.now();
      if (!iso(raw.startedAt) || !Array.isArray(raw.roundSubmittedAt) || raw.roundSubmittedAt.length > 3 || raw.roundSubmittedAt.some((value,index) => !iso(value) || value < raw.startedAt || index > 0 && value < raw.roundSubmittedAt[index-1])) bad();
      const count = raw.roundSubmittedAt.length, phase = raw.phase, expectedRound = phase === 'feedback' ? count-1 : phase === 'complete' ? 3 : phase === 'learn' ? 0 : modes.indexOf(phase);
      if (!Number.isInteger(raw.round) || raw.round !== expectedRound || !['learn',...modes,'feedback','complete'].includes(phase) || (phase === 'feedback' ? count < 1 : phase === 'complete' ? count !== 3 : phase === 'learn' ? count !== 0 : count !== modes.indexOf(phase))) bad();
      if(Object.hasOwn(raw,'learningOrder')){if(!validOrder(raw.learningOrder))bad();state.learningOrder=raw.learningOrder.slice();}
      if(Object.hasOwn(raw,'roundOrders')){
        const orders=raw.roundOrders;
        if(!orders||typeof orders!=='object'||Array.isArray(orders)||Object.keys(orders).length!==modes.length||modes.some(mode=>!Array.isArray(orders[mode])||orders[mode].length!==words.length||new Set(orders[mode]).size!==words.length||orders[mode].some(index=>!Number.isInteger(index)||index<0||index>=words.length)))bad();
        state.roundOrders=clone(orders);
      }else{
        // Preserve the order of every started round in old drafts; only shuffle future rounds.
        shuffleFutureRounds(phase==='learn'?0:modes.includes(phase)?expectedRound+1:count);
      }
      if (!raw.answers || Array.isArray(raw.answers) || typeof raw.answers !== 'object' || Object.keys(raw.answers).length !== 3 || modes.some(mode => !raw.answers[mode] || typeof raw.answers[mode] !== 'object' || Array.isArray(raw.answers[mode]))) bad();
      for (const mode of modes) for (const [key,value] of Object.entries(raw.answers[mode])) {
        if (!/^(0|[1-9][0-9]*)$/.test(key) || !words[Number(key)] || typeof value !== 'string' || value.length > 200 || modes.indexOf(mode) > expectedRound) bad();
        state.answers[mode][key] = value;
      }
      if (!raw.audio || typeof raw.audio !== 'object' || Array.isArray(raw.audio)) bad();
      state.id = raw.id; state.startedAt = raw.startedAt;
      state.phase = 'dictation';
      for (const [key,value] of Object.entries(raw.audio)) {
        if (!/^(0|[1-9][0-9]*)$/.test(key) || !words[Number(key)] || !iso(value?.completedAt) || value.completedAt < raw.startedAt || expectedRound < 2) bad();
        markPlayed(Number(key),value);
      }
      restoringRounds = true;
      for (let i=0;i<count;i++) {
        state.phase = modes[i]; state.round = i;
        submitRound(); state.rounds[i].attempts.forEach(item => { item.submittedAt = raw.roundSubmittedAt[i]; });
      }
      restoringRounds = false;
      if (version === 2) {
        const study = raw.study;
        if (!study || Object.keys(study).some(key => !['s','w','input'].includes(key)) || !Array.isArray(study.s) || !Array.isArray(study.w) || !Array.isArray(study.input) || [study.s,study.w,study.input].some(items => items.length !== words.length)) bad();
        const used = new Set();
        words.forEach((word,index) => {
          const spellings=study.s[index],ids=study.w[index],input=study.input[index];
          if (!Array.isArray(spellings) || spellings.length>3 || spellings.some(value=>typeof value!=='string'||value.length>100||normalizeAnswer(value)!==normalizeAnswer(word.word)) || !Array.isArray(ids) || ids.length>3 || ids.some(id=>typeof id!=='string'||!/^work-[A-Za-z0-9-]{8,100}$/.test(id)||used.has(id)||(used.add(id),false)) || ids.length&&spellings.length!==3 || typeof input!=='string'||input.length>200) bad();
          state.study.spellings[index]=spellings.slice();state.study.workIds[index]=ids.slice();state.study.inputs[index]=input;
        });
        state.restoring = used.size>0;
      }
      state.phase = phase; state.round = raw.round; state.testing = modes.includes(phase) && (version === 1 || learningProgress().complete);
    }
    if (options.draft) restoreDraft(options.draft); else shuffleFutureRounds();
    return {words,state,modes,version,roundOrder,learningProgress,recordSpelling,setStudyInput,registerStudyWork,recordSpeaking,finishStudyRestore,getState,getDraft,begin,setAnswer,markPlayed,validateRound,submitRound,next,getSubmission:submission,promptFor};
  }

  function verifyTrainingArtifact(input,material) {
    const failed=reason=>({valid:false,submitted:false,testsCorrect:false,professionalPassed:false,mastered:false,trainingVersion:0,wordCount:0,reason});
    let value=input;
    try { if(typeof value==='string')value=JSON.parse(value);if(value?.answer&&!value.rounds)value=JSON.parse(value.answer); } catch(_){return failed('词汇原稿JSON无效。');}
    if(!value||typeof value!=='object'||Array.isArray(value)||value.kind!=='vocabulary-three-modes'||value.trainingComplete!==true||(value.trainingVersion??value.trainingSchema??value.schema)!==2)return failed('旧版或缺少新版三写三读原稿。');
    const source=Array.isArray(material?.vocabulary)?material.vocabulary:value.words;
    if(!Array.isArray(source)||!source.length||source.length>100)return failed('缺少绑定词汇材料。');
    const words=[...new Map(source.map(item=>[normalizeAnswer(item?.word),String(item?.word||'')])).values()],keys=words.map(normalizeAnswer);
    if(keys.some(word=>!word)||!Array.isArray(value.words)||value.words.length!==keys.length||value.words.some((item,index)=>normalizeAnswer(item.word)!==keys[index])||!Array.isArray(value.learning)||value.learning.length!==keys.length)return failed('学习原稿与本组必学词不一致。');
    const workIds=new Set(),hashes=new Set(),evidenceIds=new Set();let professionalPassed=true;
    for(let index=0;index<keys.length;index++){
      const item=value.learning[index];
      if(normalizeAnswer(item?.word)!==keys[index]||!Array.isArray(item.spellings)||item.spellings.length!==3||item.spellings.some(answer=>typeof answer!=='string'||normalizeAnswer(answer)!==keys[index])||!Array.isArray(item.speaking)||item.speaking.length!==3)return failed('每词必须保留三次正确输入和三份独立跟读。');
      for(const proof of item.speaking){
        if(!proof||!/^work-[A-Za-z0-9-]{8,100}$/.test(proof.workId)||!/^[a-f0-9]{64}$/.test(proof.hash)||typeof proof.evidenceId!=='string'||!proof.evidenceId||proof.evidenceId.length>120||proof.provider!=='Alibaba oral assessment'||!Number.isFinite(Date.parse(proof.recordedAt))||!Number.isFinite(proof.durationSeconds)||proof.durationSeconds<.25||proof.durationSeconds>15.1||['accuracy','fluency','completeness'].some(key=>typeof proof.result?.[key]!=='number'||!Number.isFinite(proof.result[key])||proof.result[key]<0||proof.result[key]>100)||workIds.has(proof.workId)||hashes.has(proof.hash)||evidenceIds.has(proof.evidenceId))return failed('跟读原音、音频hash或完整专业分数缺失／重复。');
        workIds.add(proof.workId);hashes.add(proof.hash);evidenceIds.add(proof.evidenceId);professionalPassed&&=proof.result.accuracy>=80&&proof.result.fluency>=75&&proof.result.completeness>=90;
      }
    }
    if(!Array.isArray(value.rounds)||value.rounds.length!==3)return failed('三轮测试尚未全部提交。');
    let testsCorrect=true;
    for(let index=0;index<3;index++){
      const round=value.rounds[index],mode=MODES[index];
      if(round?.mode!==mode||!Array.isArray(round.attempts)||round.attempts.length!==keys.length)return failed('测试顺序或每轮全量作答不完整。');
      const seen=new Set();
      for(const attempt of round.attempts){const key=normalizeAnswer(attempt?.word);if(attempt?.mode!==mode||!keys.includes(key)||seen.has(key)||normalizeAnswer(attempt.expectedAnswer)!==key||typeof attempt.userAnswer!=='string'||!attempt.userAnswer.trim()||attempt.userAnswer.length>200)return failed('测试原始答案缺项、重复或与材料不符。');seen.add(key);testsCorrect&&=normalizeAnswer(attempt.userAnswer)===key;
        if(mode==='dictation'&&(attempt.audio?.started!==true||attempt.audio?.completed!==true||!['local-audio','browser-tts'].includes(attempt.audio?.kind)||!Number.isFinite(Date.parse(attempt.audio?.completedAt))))return failed('听写没有成功完成的音频播放证据。');
      }
    }
    return{valid:true,submitted:true,testsCorrect,professionalPassed,mastered:testsCorrect&&professionalPassed,trainingVersion:2,wordCount:keys.length,reason:testsCorrect&&professionalPassed?'三写三读及三轮原始证据完整且本次全部达到门槛；同级新题仍用于迁移验证。':'三写三读及三轮已真实提交，原始错词或专业低分仍需统一错题订正和短验证。'};
  }

  function createAudioPlayer(options = {}) {
    const host = options.root || root;
    let cancelCurrent = null;
    function cancel() { if (cancelCurrent) { const fn = cancelCurrent; cancelCurrent = null; fn(); } }
    async function localAudio(word) {
      const AudioClass = options.Audio || host.Audio;
      if (!word.audio || !AudioClass) throw Error('本词没有可用的本地音频。');
      return new Promise((resolve,reject) => {
        const audio = new AudioClass(word.audio); let started = false, settled = false;
        const timeout = host.setTimeout?.(() => finish(Error('本地音频播放超时。')),30000);
        function finish(error) {
          if (settled) return; settled = true;
          if (timeout) host.clearTimeout?.(timeout);
          audio.pause?.(); cancelCurrent = null;
          audio.onplaying = audio.onended = audio.onerror = audio.onabort = null;
          if (error) reject(error); else resolve({kind:'local-audio',source:word.audio,started:true,completed:true,completedAt:new Date().toISOString(),durationSeconds:Math.max(0,Number(audio.currentTime) || 0)});
        }
        audio.onplaying = () => { started = true; };
        audio.onended = () => finish(started && Number(audio.currentTime) > 0 && !audio.muted && audio.volume !== 0 ? null : Error('音频未实际完成可听播放。'));
        audio.onerror = () => finish(Error('本地音频加载失败。'));
        audio.onabort = () => finish(Error('播放已中断。'));
        cancelCurrent = () => finish(Error('播放已取消。'));
        try { Promise.resolve(audio.play()).catch(() => finish(Error('浏览器未允许播放本地音频。'))); } catch (_) { finish(Error('本地音频无法播放。')); }
      });
    }
    async function browserTTS(word) {
      const synthesis = options.synthesis || host.speechSynthesis, Utterance = options.Utterance || host.SpeechSynthesisUtterance;
      if (!synthesis || !Utterance) throw Error('浏览器不支持英语合成语音，请安装英语声音或使用有本地词音的词。');
      const voices = synthesis.getVoices?.() || [], voice = voices.find(item => /^en[-_]US$/i.test(item.lang));
      if (!voice) throw Error('尚无可用英语（美式 en-US）声音。请在系统安装美国英语语音，稍后重试；本次不会换用英式或记为已听。');
      return new Promise((resolve,reject) => {
        const utterance = new Utterance(word.word); utterance.voice = voice; utterance.lang = 'en-US'; utterance.rate = .85;
        let startedAt = null, settled = false;
        const timeout = host.setTimeout?.(() => finish(Error('浏览器合成语音未完成。')),30000);
        function finish(error) {
          if (settled) return; settled = true;
          if (timeout) host.clearTimeout?.(timeout);
          cancelCurrent = null; utterance.onstart = utterance.onend = utterance.onerror = null;
          if (error) { synthesis.cancel?.(); reject(error); } else resolve({kind:'browser-tts',source:voice.name || voice.lang,locale:'en-US',started:true,completed:true,completedAt:new Date().toISOString()});
        }
        utterance.onstart = () => { startedAt = Date.now(); };
        utterance.onend = event => finish(startedAt !== null && (Number(event?.elapsedTime) > 0 || Date.now()-startedAt >= 100) ? null : Error('合成语音没有成功完成可听播放。'));
        utterance.onerror = () => finish(Error('浏览器合成语音失败，本次不会记为已听。'));
        cancelCurrent = () => finish(Error('播放已取消。'));
        try { synthesis.speak(utterance); } catch (_) { finish(Error('浏览器无法开始合成语音。')); }
      });
    }
    async function play(word, onStatus = () => {}) {
      cancel();
      const localPath=Dictionary?.safeAudioPath(word.audio)||'',prepared={...word,audio:localPath},indexed=(options.audioData||host.IELTSVocabularyAudio||root.IELTSVocabularyAudio)?.items?.[String(word.word).trim().toLowerCase()],variants=Array.isArray(indexed?.senseVariants)?indexed.senseVariants.filter(item=>item&&Dictionary.safeAudioPath(item.audio)===localPath):[],source=localPath?(indexed?.audio===localPath?indexed:variants.length===1?variants[0]:null):null,voice=source?String(source.voice||source.locale||''):'';
      const localLabel=/^en[-_]US/i.test(voice)?'本地美式英语合成词音':/^en[-_]GB/i.test(voice)?'本地英式英语合成词音（原文件）':'本地词音（口音按原来源）';
      if (localPath) {
        try { onStatus('正在播放'+localLabel+'……'); return await localAudio(prepared); }
        catch (error) { if (/取消|中断/.test(error.message)) throw error; onStatus('本地词音未能播放，尝试浏览器美式英语合成语音……'); }
      } else onStatus('使用浏览器美式英语合成语音……');
      return browserTTS(prepared);
    }
    return {play,cancel};
  }

  function mount(container, options = {}) {
    if (!container?.ownerDocument && !root.document) throw Error('词汇训练需要页面容器。');
    const doc = container.ownerDocument || root.document, session = createSession(options), player = options.player || createAudioPlayer(options);
    let destroyed = false, busy = false, saved = false, stale = false, lastRound = null, savePromise = null;
    const profile = root.IELTSProfiles?.current?.()?.id, notified = new Set(), studyRows = new Map(), studyRestoreNotes = new Map(), studyAttemptRun=uniqueId();
    let studySerial = 0;
    const box = doc.createElement('section'); box.className = 'vocabulary-practice'; box.setAttribute('aria-label','每日必学词与三轮测试');
    container.replaceChildren(box);
    function node(tag,className,text) { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = String(text); return el; }
    function check() { if (destroyed || stale || profile !== root.IELTSProfiles?.current?.()?.id) throw Error('学习档案或练习已切换，请保留原稿后重新打开。'); }
    function testingEvent(active) { if (root.CustomEvent && root.dispatchEvent) root.dispatchEvent(new root.CustomEvent('ielts:vocabulary-testing',{detail:{active}})); }
    function changed() { if (!destroyed) { box.dataset.vocabTesting = String(session.state.testing); testingEvent(session.state.testing); options.onChange?.(session.getState()); } }
    function button(text,action) { const el = node('button','vocab-button',text); el.type = 'button'; el.addEventListener('click',action); return el; }
    function status(text) { const el = node('p','vocab-status',text); el.setAttribute('role','status'); return el; }
    async function flushMistakes() {
      for (const attempt of session.state.rounds.flatMap(round => round.attempts).filter(item => !item.correct)) {
        if (notified.has(attempt.attemptId)) continue;
        check(); if (options.onMistake) await options.onMistake(clone(attempt)); check(); notified.add(attempt.attemptId);
      }
    }
    async function submit() {
      check(); const payload = session.getSubmission();
      if (!payload) throw Error('请先完成每个必学词的三轮测试。');
      if (saved) return payload;
      if (savePromise) return savePromise;
      savePromise = (async () => { await flushMistakes(); check(); if (options.onSubmit) { const committed=await options.onSubmit(clone(payload)); if(committed?.id)payload.recordId=committed.id; } check(); if(root.IELTSMemory)root.IELTSMemory.capture(clone(payload)); saved = true; changed(); return payload; })();
      try { return await savePromise; } finally { savePromise = null; }
    }
    function speakingContext(index) {
      const level=String(options.material?.level || 'A0').match(/A[012]|B[12]|C[12]/g)?.at(-1) || 'A0';
      return {word:session.words[index].word,wordIndex:index,trial:(session.state.study.speaking[index] || []).length+1,materialId:session.state.materialId,dayNumber:session.state.courseDay,level,returnUrl:options.returnUrl || '学习课程.html?day='+session.state.courseDay+'&material='+encodeURIComponent(session.state.materialId)+(new URLSearchParams(root.location?.search || '').get('preview')==='1'?'&preview=1':'')};
    }
    function updateSpeakingUI() {
      const active=speaker?.getState?.() || {busy:false},current=active.context?.wordIndex;
      for (const [index,row] of studyRows) {
        const progress=session.learningProgress().items[index],locked=destroyed || stale || session.state.restoring;
        row.start.disabled=locked || !speaker || active.busy || progress.spellings!==3 || progress.speaking>=3;
        row.stop.disabled=locked || current!==index || active.phase!=='recording';
        const pending=(session.state.study.workIds[index] || []).find(id=>!(session.state.study.speaking[index] || []).some(item=>item.workId===id));
        row.retry.hidden=!pending;row.retry.disabled=locked || active.busy || !speaker;row.pendingId=pending;
        if(current===index&&active.message)row.note.textContent=active.message;
      }
    }
    const factory=options.speakerFactory || root.IELTSVocabularySpeaking?.create;
    const speaker=session.version===2 && factory ? factory({...options,root, onState:()=>updateSpeakingUI(),onSaved:async(work,context)=>{check();session.registerStudyWork(context.wordIndex,work.id);render();changed();},onAttempt:async proof=>{check();session.recordSpeaking(proof.wordIndex,proof);studyRestoreNotes.delete(proof.wordIndex);render();changed();}}) : null;
    function renderLearn() {
      studyRows.clear();
      const summary=options.lessonSummary,whole=summary&&Number.isInteger(summary.wordCount)&&summary.wordCount>=session.words.length&&Number.isInteger(summary.groupCount)&&summary.groupCount>0;box.append(node('h3','',whole?'本课 '+summary.wordCount+' 个词项 · 当前第 '+(summary.currentGroup||1)+' / '+summary.groupCount+' 组（'+session.words.length+' 词）':'本组必学 '+session.words.length+' 词'),node('p','vocab-intro',session.version===2?'每个词先照词输入三遍正确英文，再听示范、分别录音跟读三次。全部词完成后，依次测试补全、中文写英文、听写。跟读专业低分计真实练习次数并进入错题本；网络失败或无声不计次数。专业指标为本次朗读的0–100分，不换算IELTS成绩。时间是参考预算，可按掌握速度提前进入下一步。':'这是旧版草稿，保留原来的中文写英文、补全、听写顺序及原稿；本轮不作为新版三写三读训练通过。'));
      const list = node('div','vocab-word-list');
      session.state.learningOrder.forEach((index,position) => {const word=session.words[index];
        const card = node('article','vocab-word-card'), header = node('div','vocab-word-header');
        header.append(node('strong','vocab-word',word.word),node('span','vocab-ipa',word.ipa || '音标待查询'));
        const history=options.wordHistory?.[normalizeAnswer(word.word)];if(history==='new'||history==='review'){card.dataset.wordHistory=history;header.append(node('span','vocab-word-history',history==='new'?'本课新词':'前课巩固'));}
        const note = status(studyRestoreNotes.get(index) || ''), play = button('听读',async () => { play.disabled = true; try { check(); if(['requesting','recording'].includes(speaker?.getState?.().phase))throw Error('请先结束当前麦克风录音，再播放示范，避免把示范声音录入。'); await player.play(word,text => { note.textContent = text; }); check(); note.textContent = '已完成听读。'; } catch (error) { note.textContent = error.message; } finally { if (!destroyed) play.disabled = false; } });
        header.append(play); card.append(header,node('p','vocab-meaning',word.meaning || '词义待查询'),node('p','vocab-example',word.example || '例句待查询'));
        const sourceLabel=sourceContextLabel(word,options.material,options);if(sourceLabel)card.append(node('p','vocab-source-context',sourceLabel));
        if (word.exampleTranslation) card.append(node('p','vocab-translation',word.exampleTranslation));
        if (options.lookup && (!word.ipa || !word.meaning || !word.example)) {
          const query = button('AI 补全词条',async () => {
            query.disabled = true; note.textContent = '正在补全词条……';
            try { check(); const value = await options.lookup(word.word,word.example || options.material?.passage || '',options.material?.level || 'A0'); check(); const merged = Dictionary.mergeAI(word,value); Object.assign(session.words[index],merged); render(); changed(); }
            catch (error) { note.textContent = '未能补全：'+error.message+'；缺项仍待查询。'; query.disabled = false; }
          }); card.append(query);
        }
        if (session.version===2) {
          const progress=session.learningProgress().items[index],practice=node('div','vocab-study'),meter=node('p','vocab-study-progress','正确输入 '+progress.spellings+'/3 · 真实跟读 '+progress.speaking+'/3');
          const label=node('label','vocab-answer-label','第 '+Math.min(3,progress.spellings+1)+' 遍英文输入'),input=node('input','vocab-answer');input.type='text';input.maxLength=200;input.autocomplete='off';input.spellcheck=false;input.value=session.state.study.inputs[index] || '';input.disabled=progress.spellings===3;input.setAttribute('aria-label','学习第'+(position+1)+'词的英文输入');
          input.addEventListener('input',()=>{try{check();session.setStudyInput(index,input.value);changed();}catch(error){note.textContent=error.message;}});label.append(input);
          const write=button('核对本遍输入',async()=>{if(write.disabled)return;try{check();if(session.recordSpelling(index,input.value)){render();changed();check();const row=studyRows.get(index),next=row?.input.disabled?row.start:row?.input;if(next&&!next.disabled)next.focus();}else{const detail=explainSpelling(word,input.value);note.textContent=detail?[detail.title,...detail.points,detail.next].filter(Boolean).join(' '):'拼写还不正确，请对照上方英文重新输入；本遍不计。';input.focus();input.select();if(options.onMistake)await options.onMistake({id:studyAttemptRun+'-study-'+(++studySerial),attemptId:studyAttemptRun+'-study-'+studySerial,source:'vocabulary-practice',skill:'vocabulary',taskId:'vocabulary',courseDay:session.state.courseDay,dayNumber:session.state.courseDay,materialId:session.state.materialId,materialVersion:session.state.materialVersion,word:word.word,meaning:word.meaning,ipa:word.ipa,example:word.example,mode:'study-spelling',prompt:word.meaning,userAnswer:input.value,expectedAnswer:word.word,correct:false,submittedAt:new Date().toISOString()});}}catch(error){note.textContent=error.message;}});write.disabled=progress.spellings===3;
          let composing=false;input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;});
          input.addEventListener('keydown',event=>{if(event.key!=='Enter'||composing||event.isComposing||event.keyCode===229)return;event.preventDefault();if(!event.repeat&&!write.disabled)write.click();});
          const startRead=button('开始第 '+Math.min(3,progress.speaking+1)+' 次跟读录音',async()=>{try{check();player.cancel();doc.querySelectorAll?.('audio').forEach(audio=>audio.pause?.());await speaker.start(word.word,speakingContext(index));}catch(error){note.textContent=error.message;}});
          const stopRead=button('结束本次录音并评测',async()=>{try{await speaker.stop();}catch(error){note.textContent=error.message;}});
          const retry=button('重试这份原音评测',async()=>{const id=studyRows.get(index)?.pendingId;if(!id)return;try{check();await speaker.retry(id,speakingContext(index));}catch(error){note.textContent=error.message;}});
          const controls=node('div','vocab-study-controls');controls.append(startRead,stopRead,retry);practice.append(meter,label,write,controls);
          if(progress.workIds.length){const playback=node('div','vocab-study-playbacks');progress.workIds.forEach((id,i)=>playback.append(button('回听原音 '+(i+1),async()=>{try{check();await speaker.play(id);}catch(error){note.textContent=error.message;}})));practice.append(playback);}
          for(const [trial,proof] of (session.state.study.speaking[index] || []).entries())practice.append(node('p','vocab-status','第'+(trial+1)+'次：准确度 '+proof.result.accuracy+' · 流利度 '+proof.result.fluency+' · 完整度 '+proof.result.completeness+'（0–100，'+(proof.passed?'达到本次门槛':'错项待订正')+'）'));
          card.append(practice);studyRows.set(index,{input,start:startRead,stop:stopRead,retry,note,pendingId:null});
          if(!speaker)note.textContent='跟读录音组件未加载，请刷新本地学习页面后继续；按钮点击不会代替真实跟读。';
        }
        card.append(note); list.append(card);
      });
      const note = status(session.state.restoring?'正在从本机作品验证跟读原音与专业结果……':''), start = button('学完了，开始第 1 轮',() => { try { check(); player.cancel(); if(session.version===2&&!session.learningProgress().complete)throw Error('每个词须先完成三遍正确输入和三次真实跟读。');if(session.state.phase==='learn')session.begin();render();changed(); } catch (error) { note.textContent = error.message; } });
      start.disabled=session.version===2&&!session.learningProgress().complete;
      start.classList?.add('vocab-primary'); box.append(list,start,note);updateSpeakingUI();
    }
    function renderRound() {
      const mode = session.state.phase;
      box.append(node('h3','','第 '+(session.modes.indexOf(mode)+1)+' / 3 轮 · '+NAMES[mode]),node('p','vocab-intro',mode === 'completion' ? '根据中文与保留字母，输入完整的英文词或词组。下划线表示缺失字母。' : mode === 'dictation' ? '先成功听完每个词，再写完整英文。可重听；英语声音不可用时本轮保持未完成。' : '根据本材料的中文词义，写出学习阶段的英文词或词组。'));
      const inputs = [], form = node('form','vocab-questions'); form.setAttribute('autocomplete','off');
      session.roundOrder(mode).forEach((index,position) => {
        const word=session.words[index];
        const row = node('fieldset','vocab-question'), legend = node('legend','','第 '+(position+1)+' 词'); row.append(legend);
        if (mode !== 'dictation') row.append(node('p','vocab-prompt',word.meaning));
        if (mode === 'completion') row.append(node('p','vocab-mask',maskWord(word.word)));
        const note = status(mode === 'dictation' && session.state.audio[index]?.completed ? '已成功听完，可作答。' : '');
        if (mode === 'dictation') {
          const play = button(session.state.audio[index]?.completed ? '重听第 '+(position+1)+' 词' : '播放第 '+(position+1)+' 词',async () => {
            if (busy) return; play.disabled = true;
            try { check(); const proof = await player.play(word,text => { note.textContent = text; }); check(); if (session.state.phase !== mode) return; session.markPlayed(index,proof); note.textContent = '已成功听完，可作答。'; play.textContent = '重听第 '+(position+1)+' 词'; changed(); }
            catch (error) { note.textContent = error.message; }
            finally { if (!destroyed) play.disabled = false; }
          }); row.append(play);
        }
        const label = node('label','vocab-answer-label','完整英文'), input = node('input','vocab-answer');
        input.type = 'text'; input.maxLength = 200; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocapitalize','off'); input.setAttribute('aria-label','第 '+(position+1)+' 词的完整英文'); input.value = session.state.answers[mode][index] || '';
        input.addEventListener('input',() => { if (busy) return; try { check(); session.setAnswer(index,input.value); changed(); } catch (error) { note.textContent = error.message; } });
        inputs.push(input); label.append(input); row.append(label,note); form.append(row);
      });
      const note = status(''), send = node('button','vocab-button vocab-primary','提交本轮并核对'); send.type = 'submit';
      form.append(send,note); form.addEventListener('submit',async event => {
        event.preventDefault(); if (busy) return;
        try { check(); session.validateRound(); busy = true; send.disabled = true; player.cancel(); lastRound = session.submitRound(); inputs.forEach(input => { input.disabled = true; }); changed(); await flushMistakes(); }
        catch (error) { note.textContent = error.message; }
        finally { busy = false; if (session.state.phase === 'feedback') render(); else send.disabled = false; }
      }); box.append(form);
    }
    function explainSpelling(word,answer) {
      return root.IELTSObjectiveFeedback?.explain({type:'spelling',answers:[word.word],prompt:word.meaning,explanation:word.meaning,evidence:word.example||''},answer,{grade:{correct:false,answered:!!normalizeAnswer(answer),gradable:true,withinLimit:true,expected:[word.word]},normalizeAnswer,sourceKind:'vocabulary',sourceText:word.example||''});
    }
    function renderFeedback() {
      const round = lastRound || session.state.rounds.at(-1);
      box.append(node('h3','',NAMES[round.mode]+'：'+round.correct+' / '+round.total),node('p','vocab-intro','本轮原始输入已保留。展开核对错误后，再继续下一轮。'));
      const errors = round.attempts.filter(item => !item.correct);
      if (!errors.length) box.append(node('p','vocab-success','本轮全部正确。'));
      else errors.forEach(attempt => { const row = node('details','vocab-error'); row.append(node('summary','','第 '+(round.attempts.indexOf(attempt)+1)+' 词 · 需要订正'),node('p','','你的原稿：'+attempt.userAnswer),node('p','','标准英文：'+attempt.expectedAnswer),node('p','',attempt.meaning),node('p','',attempt.example)); const detail=explainSpelling({word:attempt.expectedAnswer,meaning:attempt.meaning,example:attempt.example},attempt.userAnswer);if(detail){row.open=true;row.append(node('strong','',detail.title));for(const point of detail.points)row.append(node('p','',point));if(detail.next)row.append(node('p','',detail.next));} box.append(row); });
      const note = status(''), next = button(session.state.rounds.length === 3 ? '查看三轮总成绩' : '继续第 '+(session.state.rounds.length+1)+' 轮',async () => { if (busy) return; busy = true; next.disabled = true; try { check(); await flushMistakes(); session.next(); render(); changed(); } catch (error) { note.textContent = '错题本未能同步：'+error.message+'。请重试，原稿仍保留。'; next.disabled = false; } finally { busy = false; } });
      box.append(next,note);
    }
    function renderComplete() {
      const payload = session.getSubmission();
      box.append(node('h3','','三轮完成：'+payload.correct+' / '+payload.total),node('p','vocab-intro','共 '+payload.quantity+' 个词，每词三种测试。'+(payload.pass ? '本次全部正确。' : payload.mistakes.length+' 个错项需要在统一错题本订正复测。')));
      const table = node('div','vocab-mode-summary'); session.state.rounds.forEach(round => table.append(node('p','',NAMES[round.mode]+'：'+round.correct+' / '+round.total))); box.append(table);
      const raw = node('details','vocab-original'), original = node('pre','vocab-original-text'); original.textContent = payload.attempts.map(item => NAMES[item.mode]+' · '+item.word+'\n原稿：'+item.userAnswer+'\n判定：'+(item.correct ? '正确' : '错误')+'\n标准英文：'+item.expectedAnswer).join('\n\n'); raw.append(node('summary','','查看三轮原稿'),original); box.append(raw);
      const note = status(saved ? '本次三轮原稿已提交。' : '原稿尚未提交到课程作品记录。'), send = button(saved ? '已提交原稿' : '提交三轮原稿',async () => { send.disabled = true; note.textContent = '正在保存原稿与错题……'; try { await submit(); note.textContent = '三轮原稿已提交，错项已交给统一错题本。'; send.textContent = '已提交原稿'; } catch (error) { note.textContent = '未能提交：'+error.message+'。请重试，原始输入仍在本页。'; send.disabled = false; } }); send.disabled = saved; box.append(send,note);
    }
    function renderRestoring() {
      const phase=session.state.phase,round=phase==='feedback'?session.state.round+1:session.modes.indexOf(phase)+1;
      const label=round>0?'第 '+round+' 轮 · '+NAMES[session.modes[round-1]]:phase==='complete'?'三轮测试结果':'三写三读进度';
      const items=session.learningProgress().items,stored=items.reduce((sum,item)=>sum+item.workIds.length,0),verified=items.reduce((sum,item)=>sum+item.speaking,0);
      box.append(node('h3','','正在恢复'+label),status('已保留 '+session.state.rounds.length+' 轮原稿和全部已填答案；正在核对已保存的跟读原音 '+verified+' / '+stored+'。核对完成后接着原进度继续，无需重新开始。'));
      const list=node('ul','vocab-restore-progress');for(const item of items)list.append(node('li','',item.word+'：正确输入 '+item.spellings+'/3，已保存跟读 '+item.workIds.length+'/3'+(studyRestoreNotes.has(item.index)?' · 原音待重试':'')));box.append(list);
    }
    function render() {
      if (destroyed) return; box.replaceChildren();
      if(session.state.restoring){renderRestoring();box.dataset.vocabTesting=String(session.modes.includes(session.state.phase));return;}
      if (session.state.phase === 'learn' || session.version===2&&!session.learningProgress().complete) renderLearn(); else if (session.state.phase === 'feedback') renderFeedback(); else if (session.state.phase === 'complete') renderComplete(); else renderRound();
      box.dataset.vocabTesting = String(session.state.testing);
    }
    function profileChanged() { stale = true; speaker?.cancel?.();player.cancel(); box.querySelectorAll('input,button').forEach(item => { item.disabled = true; }); box.append(status('学习档案已切换，请刷新后继续；本页原稿不会写入另一档案。')); }
    root.addEventListener?.('ielts:profile-changed',profileChanged);
    render(); changed();
    const ready=(async()=>{
      if(session.version===2&&session.state.restoring){
        for(let index=0;index<session.words.length;index++)for(const id of session.state.study.workIds[index] || []){
          try{check();if(!speaker)throw Error('跟读组件未加载');const proof=await speaker.restore(id,speakingContext(index));check();session.recordSpeaking(index,proof);}
          catch(error){studyRestoreNotes.set(index,'已保存的测试答案和原音引用仍保留；本词原音待重新核对：'+error.message);}
          if(!destroyed&&!stale)render();
        }
        if(!destroyed&&!stale){session.finishStudyRestore();render();changed();}
      }
    })();
    return {ready,getMediaState:()=>speaker?.getState?.() || null,pause(){speaker?.cancel?.('练习已暂停，未完成的跟读不计次数。');player.cancel();},getState:session.getState,getDraft:session.getDraft,getSubmission:session.getSubmission,submit,destroy() { destroyed = true; testingEvent(false);speaker?.destroy?.(); player.cancel(); root.removeEventListener?.('ielts:profile-changed',profileChanged); }};
  }
  return {MODES,NAMES,verifyTrainingArtifact,normalizeAnswer,maskWord,wordsFor,sourceContextLabel,createSession,createAudioPlayer,mount};
});
