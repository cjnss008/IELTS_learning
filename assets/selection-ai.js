(function (root) {
  'use strict';
  const LOCAL_ORIGIN = 'http://127.0.0.1:8765';
  function isLocalOrigin(value) {
    try {
      const url = new URL(value);
      return url.origin === value && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password;
    } catch (_) { return false; }
  }
  const serviceOrigin = value => isLocalOrigin(value) ? value : LOCAL_ORIGIN;
  const CACHE_KEY = 'ielts52-selection-ai-cache-v1';
  const MAX_SELECTION = 800;
  const MAX_FEEDBACK = 32000;
  const MAX_CACHE = 20;
  const TIMEOUT = 95000;
  const PRACTICE_KEY = 'ielts52-selection-practice-v1';
  function parsePractice(raw) {
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    if(!value||value.schema!==1||!Array.isArray(value.items)||value.items.length>300||Object.keys(value).some(k=>!['schema','items'].includes(k)))throw Error('词句巩固记录格式无效。');
    const ids=new Set();
    return {schema:1,items:value.items.map(item=>{
      if(!item||Object.keys(item).some(k=>!['id','materialId','lessonId','text','context','createdAt','dueAt','parentId','exercises'].includes(k))||typeof item.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item.id)||ids.has(item.id)||!Number.isFinite(Date.parse(item.createdAt))||!Number.isFinite(Date.parse(item.dueAt))||Date.parse(item.dueAt)<Date.parse(item.createdAt)||typeof item.text!=='string'||!item.text.trim()||item.text.length>800||typeof item.context!=='string'||item.context.length>2000||!Array.isArray(item.exercises)||item.exercises.length<1||item.exercises.length>5)throw Error('词句巩固内容无效。');
      if(!(typeof item.materialId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item.materialId)||Number.isInteger(item.lessonId)&&item.lessonId>=1&&item.lessonId<=52)||item.parentId!==null&&(typeof item.parentId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item.parentId)))throw Error('词句巩固关联无效。');
      ids.add(item.id);const questionIds=new Set();const exercises=item.exercises.map(q=>{if(!q||typeof q.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(q.id)||questionIds.has(q.id)||q.type!=='choice'||typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>1500||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(o=>typeof o!=='string'||!o.trim()||o.length>1000)||!Array.isArray(q.answers)||q.answers.length!==1||!Number.isInteger(q.answers[0])||q.answers[0]<0||q.answers[0]>=q.options.length||typeof q.explanation!=='string'||q.explanation.length>3000)throw Error('巩固题结构无效。');questionIds.add(q.id);return{id:q.id,type:'choice',prompt:q.prompt,options:q.options.slice(),answers:q.answers.slice(),explanation:q.explanation};});
      return{id:item.id,...(item.materialId?{materialId:item.materialId}:{lessonId:item.lessonId}),text:item.text,context:item.context,createdAt:item.createdAt,dueAt:item.dueAt,parentId:item.parentId,exercises};
    })};
  }
  const normalize = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const editable = element => Boolean(element && (element.isContentEditable || element.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]')));
  // Explicit learning surfaces only: settings, credentials, imports and backups
  // have no selection target, even if they contain English text.
  const TRANSLATION_SURFACES = Object.freeze({
    '今日学习.html':'#coursePlayerApp',
    '开始学习.html':'#lesson',
    '基础入门.html':'#foundationApp',
    '词汇记忆.html':'#essentialVocabularyDashboard,#essentialVocabularyPractice,#memoryPractice',
    '写作与AI辅导.html':'#questionBox,#customContext,#coachDraft,#coachFeedback,#revisionSection',
    '写作补强.html':'#writingPathBody',
    '口语练习.html':'#readingControls,#freeControls,#speechResults,#rawTranscript,#editedTranscript,#spokenTaskPrompt,#transcriptSegments,#spokenFeedback,#speechAdvice',
    '无稿口语.html':'#dialogueTask,#dialogueQuestion,#dialogueHints,#dialogueTurns,#dialogueFeedback',
    '生词复习.html':'#card-answer',
    '单词分组学习.html':'#cards',
    '陌生材料库.html':'#bankMaterials',
    '每日学习计划.html':'#weekOverview,#materials,#taskList,#linkedEvidence',
    '本地教材.html':'#textbookResults,#textbookProvenance',
    '真人听力来源.html':'#humanSourceApp',
    '评分校准.html':'#calibrationTask',
    '个性化学习.html':'#personalEffects,#personalHistory',
    '课程目标与资源.html':'main[data-ai-learning-root="true"]'
  });
  const TRANSLATION_BLOCKED='[hidden],[data-vocab-testing="true"],[data-assessment="true"],[data-mode="assessment"],[data-ai-translate-off],#writingPathTransfer,#writingPathTransferBody,.selection-ai-panel,.selection-ai-trigger,.selection-ai-saved,script,style,nav,header,footer';
  const TRANSLATION_PARAGRAPH='p,li,label,legend,td,th,blockquote,figcaption,h1,h2,h3,h4,strong.vocab-word,[data-ai-translate]';
  function pageName(location) { try { return decodeURIComponent(String(location?.pathname||'').split('/').pop()||''); } catch (_) { return ''; } }
  function translationSurface(element,page) {
    if(!element||!TRANSLATION_SURFACES[page]||element.closest?.(TRANSLATION_BLOCKED))return null;
    return element.closest?.(TRANSLATION_SURFACES[page])||null;
  }
  function translationTextControl(element,page) {
    if(!translationSurface(element,page)||element.tagName?.toLowerCase()!=='textarea'||element.disabled||element.readOnly)return false;
    return element.lang==='en'||element.getAttribute?.('lang')==='en'||['contextPrompt','editedTranscript','spokenTaskPrompt'].includes(element.id)||Boolean(element.closest?.('#courseOutput'));
  }
  function translationSnapshot(text,context,meta={}) {
    const clean=String(text||'').trim();if(!clean||clean.length>MAX_SELECTION||!/[A-Za-z]/.test(clean)||meta.mode==='assessment'||!TRANSLATION_SURFACES[meta.page])return null;
    const raw=String(context||''),at=raw.indexOf(clean);if(at<0)return null;
    const from=Math.max(0,Math.min(at-600,raw.length-2000)),excerpt=raw.slice(from,from+2000);
    if(!excerpt.includes(clean))return null;
    return {kind:'translation',text:clean,context:excerpt,page:meta.page,mode:'practice',start:at-from,end:at-from+clean.length,sourceText:excerpt,materialId:meta.materialId,skill:meta.skill,verify:meta.verify||(()=>true),rect:meta.rect||{left:8,right:8,top:8,bottom:8}};
  }
  function captureTranslation(selection,doc,meta={}) {
    if(meta.mode==='assessment'||meta.assessment||meta.vocabularyTesting)return null;
    const control=doc?.activeElement;
    if(translationTextControl(control,meta.page)&&Number.isInteger(control.selectionStart)&&control.selectionEnd>control.selectionStart){
      const source=control.value,start=control.selectionStart,end=control.selectionEnd;
      return translationSnapshot(source.slice(start,end),source,{...meta,rect:control.getBoundingClientRect?.(),verify:()=>control.isConnected!==false&&control.value===source&&!control.closest?.(TRANSLATION_BLOCKED)});
    }
    if(!selection||selection.isCollapsed||selection.rangeCount!==1)return null;
    try{
      const range=selection.getRangeAt(0),elementOf=n=>n?.nodeType===1?n:n?.parentElement,first=elementOf(range.startContainer),last=elementOf(range.endContainer);
      if(editable(first)||editable(last)||!translationSurface(first,meta.page)||translationSurface(first,meta.page)!==translationSurface(last,meta.page))return null;
      const paragraph=first.closest?.(TRANSLATION_PARAGRAPH);if(!paragraph||paragraph!==last.closest?.(TRANSLATION_PARAGRAPH))return null;
      const text=range.toString(),source=paragraph.textContent;if(!source?.includes(text)||paragraph.closest?.(TRANSLATION_BLOCKED))return null;
      const box=range.getBoundingClientRect?.()||paragraph.getBoundingClientRect?.();
      return translationSnapshot(text,source,{...meta,rect:box,verify:()=>paragraph.isConnected!==false&&paragraph.textContent===source&&!paragraph.closest?.(TRANSLATION_BLOCKED)});
    }catch(_){return null;}
  }
  function createTranslationController(options={}) {
    let generation=0,active=null,last=null,state={phase:'idle',snapshot:null,feedback:'',model:'',threadId:'',remaining:0,history:[],error:'',code:'',cacheHit:false,offlineCache:false,truncated:false};
    const emit=()=>options.onChange?.({...state,history:[]});
    const patch=value=>{state={...state,...value};emit();};
    function cancel(){generation++;active?.abort();active=null;if(state.phase==='loading')patch({phase:'cancelled',error:'已取消本次翻译。',code:'CANCELLED'});}
    async function explain(snapshot){
      if(snapshot?.kind!=='translation'||snapshot.mode!=='practice'||!snapshot.verify?.())return false;
      cancel();const ticket=generation;last=snapshot;patch({phase:'loading',snapshot,feedback:'',model:'',error:'',code:''});
      if(!isLocalOrigin(options.origin)){patch({phase:'error',error:'请从“启动学习.cmd”打开本机学习页，再使用划词翻译。',code:'LOCAL_SERVICE_REQUIRED'});return false;}
      const fetchImpl=options.fetch||(typeof root.fetch==='function'?root.fetch.bind(root):null);if(!fetchImpl){patch({phase:'error',error:'本机 AI 服务暂不可用。',code:'SERVICE_UNAVAILABLE'});return false;}
      const aborter=new AbortController();active=aborter;let timedOut=false;const timer=setTimeout(()=>{timedOut=true;aborter.abort();},options.timeout||TIMEOUT);
      try{
        const response=await fetchImpl('/api/ai/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:snapshot.text,context:snapshot.context,page:snapshot.page,mode:'practice'}),signal:aborter.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
        const value=await response.json();if(ticket!==generation||!snapshot.verify())return false;
        if(!response.ok||value.ok===false)throw apiError(value.error?.code||'TRANSLATION_FAILED',value.error?.message||'翻译未完成，请重试。');
        if(value.feedbackFormat!=='text'||typeof value.feedback!=='string'||!value.feedback.trim()||value.feedback.length>MAX_FEEDBACK||typeof value.model!=='string'||!value.model||value.model.length>200||typeof value.promptVersion!=='string'||!value.promptVersion||value.assistance!==true)throw apiError('INVALID_RESPONSE','翻译返回内容不完整，请重试。');
        await options.onAssistance?.(snapshot,value);if(ticket!==generation||!snapshot.verify())return false;
        patch({phase:'done',snapshot,feedback:value.feedback,model:value.model,promptVersion:value.promptVersion});return true;
      }catch(error){if(ticket!==generation)return false;patch({phase:'error',error:timedOut?'翻译等待超时，所选原文与输入均已保留，可重试。':error.message||'无法连接本机 AI 服务，请重试。',code:timedOut?'TIMEOUT':error.code||'SERVICE_UNAVAILABLE'});return false;}
      finally{clearTimeout(timer);if(ticket===generation)active=null;}
    }
    return{explain,cancel,retry:()=>last?explain(last):false,reset(){cancel();last=null;patch({phase:'idle',snapshot:null,feedback:'',error:'',code:''});},getState:()=>({...state,history:[]})};
  }

  function paragraphRanges(data) {
    if (!data?.lesson || typeof data.lesson.text !== 'string' || !Array.isArray(data.groups)) return [];
    let cursor = 0;
    const ranges = [];
    data.groups.filter(group => group.index > 0).forEach(group => {
      const start = data.lesson.text.indexOf(group.text, cursor);
      if (start < 0) return;
      ranges.push({index: group.index, text: group.text, start, end: start + group.text.length});
      cursor = start + group.text.length;
    });
    return ranges;
  }
  function makeSnapshot(data, paragraphIndex, from, to) {
    if (data?.mode === 'assessment') return null;
    const paragraph = paragraphRanges(data).find(item => item.index === paragraphIndex);
    if (!paragraph || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > paragraph.text.length || from >= to) return null;
    const raw = paragraph.text.slice(from, to);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const start = paragraph.start + from + leading;
    const end = paragraph.start + to - trailing;
    const text = data.lesson.text.slice(start, end);
    if (!text || text.length > MAX_SELECTION || !/[A-Za-z]/.test(text)) return null;
    return {...(data.materialId ? {materialId:data.materialId} : {lessonId:data.lesson.day}), title: data.lesson.title, sourceText: data.lesson.text, start, end, text, context: paragraph.text};
  }
  function captureSelection(selection, data) {
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
    try {
      const range = selection.getRangeAt(0);
      const elementOf = node => node.nodeType === 1 ? node : node.parentElement;
      const first = elementOf(range.startContainer);
      const last = elementOf(range.endContainer);
      if (editable(first) || editable(last)) return null;
      const paragraph = first?.closest('[data-ai-reading]');
      if (!paragraph || paragraph !== last?.closest('[data-ai-reading]') || (!paragraph.closest('#lesson') && !paragraph.closest('[data-ai-course-root]')) || paragraph.closest('[hidden]')) return null;
      const index = Number(paragraph.dataset.aiParagraph);
      const known = paragraphRanges(data).find(item => item.index === index);
      if (!known || paragraph.textContent !== known.text) return null;
      const prefix = range.cloneRange();
      prefix.selectNodeContents(paragraph); prefix.setEnd(range.startContainer, range.startOffset);
      const offset = prefix.toString().length;
      const selected = range.toString();
      if (known.text.slice(offset, offset + selected.length) !== selected) return null;
      const snapshot = makeSnapshot(data, index, offset, offset + selected.length);
      if (snapshot) {
        const box = range.getBoundingClientRect();
        snapshot.rect = {left: box.left, right: box.right, top: box.top, bottom: box.bottom};
      }
      return snapshot;
    } catch (_) { return null; }
  }
  function matches(snapshot, data) {
    return Boolean(snapshot && data?.lesson && data.mode !== 'assessment' && (snapshot.materialId ? snapshot.materialId === data.materialId : !data.materialId && snapshot.lessonId === data.lesson.day) && snapshot.sourceText === data.lesson.text &&
      Number.isInteger(snapshot.start) && Number.isInteger(snapshot.end) && snapshot.start >= 0 && snapshot.end <= data.lesson.text.length &&
      snapshot.end > snapshot.start && snapshot.end - snapshot.start <= MAX_SELECTION && data.lesson.text.slice(snapshot.start, snapshot.end) === snapshot.text);
  }
  function cacheKey(snapshot, lessonVersion, connection) {
    return JSON.stringify([snapshot.materialId || snapshot.lessonId, lessonVersion, snapshot.start, snapshot.end, snapshot.text, connection.baseUrl, connection.model, connection.connectionVersion, connection.selectionPromptVersion, 'both', 'A0', 'detail-ui-v2']);
  }
  function parseCache(raw) {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.schema !== 1 || !Array.isArray(value.entries) || value.entries.length > MAX_CACHE) throw Error('选区解释缓存格式无效。');
    const entries = value.entries.map(item => {
      if (!item || !(typeof item.materialId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(item.materialId) || Number.isInteger(item.lessonId) && item.lessonId >= 1 && item.lessonId <= 52) || !Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < 0 || item.end <= item.start ||
          !['key', 'sourceText', 'text', 'context', 'feedback', 'model', 'version', 'promptVersion'].every(key => typeof item[key] === 'string') ||
          item.key.length > 2500 || item.sourceText.length > 64000 || item.text.length > MAX_SELECTION || item.context.length > 2000 || item.feedback.length > MAX_FEEDBACK || !item.feedback.trim() || item.model.length > 200 || !/^[a-f0-9]{64}$/i.test(item.version) ||
          !item.promptVersion || item.promptVersion.length > 100 || item.sourceText.slice(item.start, item.end) !== item.text || !item.context.includes(item.text)) throw Error('选区解释缓存内容无效。');
      return {key: item.key, ...(item.materialId ? {materialId:item.materialId} : {lessonId:item.lessonId}), sourceText: item.sourceText, start: item.start, end: item.end, text: item.text, context: item.context, feedback: item.feedback, model: item.model, version: item.version, promptVersion: item.promptVersion};
    });
    return {schema: 1, entries};
  }
  function makeCache(storage, key) {
    let entries = [], writable = true;
    try { const raw = storage?.getItem(key); if (raw) { if (raw.length > 2500000) throw Error(); entries = parseCache(raw).entries; } } catch (_) { writable = false; }
    return {
      exact: key => entries.find(item => item.key === key),
      offline: snapshot => entries.slice().reverse().find(item => item.lessonId === snapshot.lessonId && item.materialId === snapshot.materialId && item.sourceText === snapshot.sourceText && item.start === snapshot.start && item.end === snapshot.end && item.text === snapshot.text),
      put(entry) {
        const valid = parseCache({schema: 1, entries: [entry]}).entries[0];
        entries = entries.filter(item => item.key !== valid.key).concat(valid).slice(-MAX_CACHE);
        const serialized = JSON.stringify({schema: 1, entries});
        if (writable && storage) { try { storage.setItem(key, serialized); } catch (_) { writable = false; } }
      }
    };
  }
  function apiError(code, message) { const error = new Error(message); error.code = code; return error; }
  function createController(options = {}) {
    const fetchImpl = options.fetch || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    const cache = makeCache(options.storage, options.cacheKey || CACHE_KEY);
    let data = null, generation = 0, active = null, lastAttempt = null;
    let state = {phase: 'idle', snapshot: null, feedback: '', model: '', threadId: '', remaining: 0, history: [], error: '', code: '', cacheHit: false, offlineCache: false, truncated: false};
    const notify = () => options.onChange?.({...state, history: state.history.slice()});
    function patch(value) { state = {...state, ...value}; notify(); }
    function abort() { generation++; if (active) active.abort(); active = null; }
    function setLesson(next) {
      abort(); data = next; lastAttempt = null;
      state = {phase: 'idle', snapshot: null, feedback: '', model: '', threadId: '', remaining: 0, history: [], error: '', code: '', cacheHit: false, offlineCache: false, truncated: false}; notify();
    }
    function cancel() { const pending = state.phase === 'loading'; abort(); if (pending) patch({phase: 'cancelled', error: '已取消本次请求。', code: 'CANCELLED'}); }
    function cached(entry, snapshot, offline) {
      patch({phase: 'done', snapshot: {...snapshot, context: entry.context}, feedback: entry.feedback, model: entry.model, version: entry.version, promptVersion: entry.promptVersion, threadId: '', remaining: 0, history: [], cacheHit: true, offlineCache: offline, truncated: false, error: '', code: ''});
    }
    async function json(path, body, signal) {
      if (!fetchImpl) throw apiError('SERVICE_UNAVAILABLE', '本地 AI 服务不可用。');
      const response = await fetchImpl(path, {method: body ? 'POST' : 'GET', ...(body ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {}), signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
      let value; try { value = await response.json(); } catch (_) { throw apiError('INVALID_RESPONSE', '本地服务返回了无法读取的响应。'); }
      if (!response.ok || value.ok === false) {
        const message = typeof value.error?.message === 'string' && value.error.message.length <= 500 ? value.error.message : '请求未完成，请检查本地服务及 AI 设置。';
        throw apiError(typeof value.error?.code === 'string' ? value.error.code : 'REQUEST_FAILED', message);
      }
      return value;
    }
    function validateResponse(result, snapshot, version, promptVersion) {
      const selection = result.selection;
      if (typeof result.feedback !== 'string' || !result.feedback.trim() || result.feedback.length > MAX_FEEDBACK || result.feedbackFormat !== 'text' || typeof result.model !== 'string' || result.model.length > 200 ||
          result.promptVersion !== promptVersion || (result.truncated !== undefined && typeof result.truncated !== 'boolean') || typeof result.threadId !== 'string' || !result.threadId || result.threadId.length > 200 || !Number.isInteger(result.followupsRemaining) || result.followupsRemaining < 0 || result.followupsRemaining > 2 ||
          !selection || (snapshot.materialId ? selection.materialId !== snapshot.materialId : selection.lessonId !== snapshot.lessonId) || selection.start !== snapshot.start || selection.end !== snapshot.end || selection.text !== snapshot.text || selection.version !== version ||
          typeof selection.context !== 'string' || selection.context.length > 2000 || !selection.context.includes(snapshot.text)) throw apiError('INVALID_RESPONSE', '解释与所选原文不匹配，请重试。');
      return result;
    }
    async function run(snapshot, question, force) {
      if (!matches(snapshot, data)) return false;
      if (state.phase === 'loading' && state.snapshot?.start === snapshot.start && state.snapshot?.end === snapshot.end && !question) return false;
      const previous = {...state, history: state.history.slice()};
      if (question && (!previous.threadId || previous.remaining < 1 || question.length > 400)) return false;
      abort(); const token = generation; const aborter = new AbortController(); active = aborter;
      lastAttempt = {snapshot, question: question || '', force: Boolean(force)};
      patch({phase: 'loading', snapshot, error: '', code: '', ...(question ? {} : {feedback: '', model: '', threadId: '', remaining: 0, history: [], cacheHit: false, offlineCache: false, truncated: false})});
      if (!isLocalOrigin(options.origin)) {
        active = null;
        const entry = !question && cache.offline(snapshot);
        if (entry) { cached(entry, snapshot, true); return true; }
        patch({phase: 'error', error: '双击“启动学习.cmd”自动打开本机学习首页，再打开课文。AI 不会从文件页面直接发送请求。', code: 'LOCAL_SERVICE_REQUIRED'}); return false;
      }
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; aborter.abort(); }, options.timeout || TIMEOUT);
      try {
        let result, version, promptVersion, connection;
        if (question) {
          version = previous.version;
          promptVersion = previous.promptVersion;
          result = await json('/api/ai/selection', {threadId: previous.threadId, question}, aborter.signal);
        } else {
          connection = await json('/api/ai/status', null, aborter.signal);
          if (token !== generation) return false;
          if (!connection.connected || !connection.model) throw apiError('NOT_CONNECTED', '请先在“AI 设置”连接服务并保存一个可用模型。');
          if (typeof connection.baseUrl !== 'string' || typeof connection.model !== 'string' || typeof connection.connectionVersion !== 'string' || typeof connection.selectionPromptVersion !== 'string' || !connection.selectionPromptVersion || connection.selectionPromptVersion.length > 100) throw apiError('INVALID_RESPONSE', 'AI 服务版本不匹配，请重启本地服务。');
          promptVersion = connection.selectionPromptVersion;
          const canonical = await json('/api/ai/selection/' + (snapshot.materialId ? 'material/' + encodeURIComponent(snapshot.materialId) : 'lesson/' + snapshot.lessonId), null, aborter.signal);
          if (token !== generation) return false;
          if (canonical.lesson?.id !== (snapshot.materialId || snapshot.lessonId) || canonical.lesson.text !== snapshot.sourceText || typeof canonical.lesson.version !== 'string' || !/^[a-f0-9]{64}$/i.test(canonical.lesson.version)) throw apiError('COURSE_CHANGED', '课文版本已变化，请刷新页面后重新选择。');
          if (canonical.lesson.promptVersion !== promptVersion) throw apiError('PROMPT_CHANGED', '讲解配置已更新，请重新解释。');
          version = canonical.lesson.version;
          const key = cacheKey(snapshot, version, connection);
          const entry = !force && cache.exact(key);
          if (entry) { cached(entry, snapshot, false); return true; }
          result = await json('/api/ai/selection', {...(snapshot.materialId ? {materialId:snapshot.materialId,mode:'practice'} : {lessonId:snapshot.lessonId}), version, start: snapshot.start, end: snapshot.end, selectedText: snapshot.text, intent: 'both', level: 'A0'}, aborter.signal);
        }
        if (token !== generation || !matches(snapshot, data)) return false;
        validateResponse(result, snapshot, version, promptVersion);
        const history = question ? previous.history.concat({question, feedback: result.feedback}) : [];
        patch({phase: 'done', snapshot: {...snapshot, context: result.selection.context}, feedback: question ? previous.feedback : result.feedback, model: result.model, version, promptVersion, threadId: result.threadId, remaining: result.followupsRemaining, history, cacheHit: false, offlineCache: false, truncated: result.truncated === true, error: '', code: ''});
        if (!question && result.model === connection.model && result.truncated !== true) cache.put({key: cacheKey(snapshot, version, connection), ...(snapshot.materialId ? {materialId:snapshot.materialId} : {lessonId:snapshot.lessonId}), sourceText: snapshot.sourceText, start: snapshot.start, end: snapshot.end, text: snapshot.text, context: result.selection.context, feedback: result.feedback, model: result.model, version, promptVersion});
        return true;
      } catch (error) {
        if (token !== generation) return false;
        if (!question && !force && !error.code && !timedOut) {
          const entry = cache.offline(snapshot);
          if (entry) { cached(entry, snapshot, true); return true; }
        }
        const code = timedOut ? 'TIMEOUT' : error.code || 'SERVICE_UNAVAILABLE';
        const message = timedOut ? '等待超过 95 秒，已停止等待。可重新解释；本地服务可能仍在结束请求。' : error.code ? error.message : '无法连接本地 AI 服务。请双击“启动学习.cmd”，检查网络后重试。';
        patch({phase: 'error', error: message, code, ...(code === 'THREAD_EXPIRED' || code === 'FOLLOWUP_LIMIT' ? {threadId: '', remaining: 0} : {})});
        return false;
      } finally { clearTimeout(timer); if (token === generation) active = null; }
    }
    return {
      setLesson, cancel, getState: () => ({...state, history: state.history.slice()}),
      explain: (snapshot, force = false) => run(snapshot, '', force),
      followup: question => { const text = typeof question === 'string' ? question.trim() : ''; return text && text.length <= 400 && state.snapshot && state.threadId && state.remaining > 0 && state.phase !== 'loading' ? run(state.snapshot, text, false) : false; },
      retry: () => lastAttempt && run(lastAttempt.snapshot, lastAttempt.question, lastAttempt.force),
      reset: () => setLesson(data)
    };
  }

  let readTimer = null, drag = null, suppressUntil = 0, currentData = null;
  function shouldSuppressReadingClick(event) {
    if (event?.button > 0 || event?.detail > 1 || Date.now() < suppressUntil) return true;
    try { const selection = root.getSelection?.(); return Boolean(selection && !selection.isCollapsed && selection.toString().trim()); } catch (_) { return false; }
  }
  function handleReadClick(event, play) {
    clearTimeout(readTimer);
    if (shouldSuppressReadingClick(event)) return true;
    if (!event || event.type === 'keydown' || event.detail === 0) { play(); return true; }
    readTimer = setTimeout(() => { if (!shouldSuppressReadingClick(event)) play(); }, 240);
    return true;
  }
  function init() {
    const doc = root.document;
    const page=pageName(root.location),legacyPage=Boolean(doc?.getElementById('lesson')||doc?.getElementById('coursePlayerApp'));
    if (!doc||!legacyPage&&!TRANSLATION_SURFACES[page]) return;
    const localOrigin = serviceOrigin(root.location.origin);
    function node(tag, className, text) { const element = doc.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
    const trigger = node('button', 'selection-ai-trigger', 'AI 详细解释'); trigger.type = 'button'; trigger.hidden = true;
    trigger.title = '解释选中词句（Alt + Enter）';
    const panel = node('section', 'selection-ai-panel'); panel.hidden = true; panel.setAttribute('role', 'complementary'); panel.setAttribute('aria-labelledby', 'selectionAiHeading');
    const top = node('div', 'selection-ai-top'); const heading = node('h2', '', '词句 AI 详解'); heading.id = 'selectionAiHeading'; heading.tabIndex = -1;
    const close = node('button', 'selection-ai-close', '关闭'); close.type = 'button'; top.append(heading, close);
    const hint = node('p', 'selection-ai-hint', '默认按零基础详细解释：语境中的词义与功能词、句子主干、通俗例句和练习。AI 解释可能有误，请结合原文核对。');
    const selected = node('blockquote', 'selection-ai-selected'); selected.lang = 'en';
    const contextDetails = node('details', 'selection-ai-context'); contextDetails.append(node('summary', '', '本次原句上下文'));
    const context = node('p'); context.lang = 'en'; contextDetails.append(context);
    const status = node('p', 'selection-ai-status'); status.setAttribute('role', 'status');
    const settings = node('a', 'selection-ai-link', '打开 AI 设置'); settings.href = 'AI设置.html';
    const launch = node('a', 'selection-ai-link', '从本地服务打开学习页'); launch.href = localOrigin + '/开始学习.html'; launch.hidden = true;
    const actions = node('div', 'selection-ai-actions');
    const cancel = node('button', '', '取消请求'); cancel.type = 'button'; cancel.hidden = true;
    const retry = node('button', '', '重试'); retry.type = 'button'; retry.hidden = true;
    const regenerate = node('button', '', '重新解释'); regenerate.type = 'button'; regenerate.hidden = true;
    actions.append(cancel, retry, regenerate, settings, launch);
    const result = node('div', 'selection-ai-result'); result.setAttribute('aria-live', 'polite');
    const feedback = node('div', 'selection-ai-feedback'); const conversation = node('div', 'selection-ai-conversation'); result.append(feedback, conversation);
    const followupForm = node('form', 'selection-ai-followup');
    const questionLabel = node('label', '', '继续追问（每次解释最多 2 次，20 分钟内有效）'); questionLabel.htmlFor = 'selectionAiQuestion';
    const question = node('textarea'); question.id = 'selectionAiQuestion'; question.maxLength = 400; question.rows = 2; question.placeholder = '例如：这里为什么用 measuring，而不是 measures？';
    const ask = node('button', '', '发送追问'); ask.type = 'submit'; const followupNote = node('p', 'selection-ai-small'); followupForm.append(questionLabel, question, ask, followupNote); followupForm.hidden = true;
    const collect = node('details', 'selection-ai-collect'); collect.append(node('summary', '', '收藏选中词句到原句生词本'));
    const collectForm = node('form');
    const kindLabel = node('label', '', '收藏类型'); const kind = node('select'); kind.id = 'selectionAiKind'; kindLabel.htmlFor = kind.id;
    [['phrase', '词或词组（最多 80 字符）'], ['sentence', '句子（最多 800 字符）']].forEach(([value, text]) => { const option = node('option', '', text); option.value = value; kind.append(option); });
    const meaningLabel = node('label', '', '写下自己的中文释义或用法，再保存'); const meaning = node('textarea'); meaning.id = 'selectionAiMeaning'; meaningLabel.htmlFor = meaning.id; meaning.maxLength = 300; meaning.required = true; meaning.rows = 3; meaning.placeholder = '可参考上面的解释，用自己理解的中文写清楚。';
    const contextLabel = node('label', '', '原句／上下文（可编辑，最多 1500 字符）'); const saveContext = node('textarea'); saveContext.id = 'selectionAiContext'; contextLabel.htmlFor = saveContext.id; saveContext.maxLength = 1500; saveContext.required = true; saveContext.rows = 3;
    const save = node('button', '', '保存到原句生词本'); save.type = 'submit'; const saveStatus = node('p', 'selection-ai-small'); saveStatus.setAttribute('role', 'status');
    collectForm.append(kindLabel, kind, meaningLabel, meaning, contextLabel, saveContext, save, saveStatus); collect.append(collectForm);
    const practiceBox=node('section','selection-ai-practice');const practiceButton=node('button','','生成 2 道巩固题');practiceButton.type='button';const practiceStatus=node('p','selection-ai-small');const practiceCancel=node('button','','取消生成');practiceCancel.type='button';practiceCancel.hidden=true;const practiceQuestions=node('div');practiceBox.append(node('h3','','解释之后，自己试一试'),practiceButton,practiceCancel,practiceStatus,practiceQuestions);
    const report=node('details','selection-ai-collect');report.append(node('summary','','记录解释或题目问题'));const reportText=node('textarea');reportText.maxLength=1500;reportText.placeholder='指出疑似错误、原句依据与自己的理解。只保存本机，不自动对外发送。';const reportSave=node('button','','保存纠错报告');reportSave.type='button';report.append(reportText,reportSave);
    panel.append(top, hint, selected, contextDetails, status, actions, result, followupForm, practiceBox, collect,report);
    doc.body.append(trigger, panel);
    const savedSection=node('details','selection-ai-saved');savedSection.append(node('summary','','我的词句巩固与延迟复测'));const savedList=node('div');savedSection.append(node('p','selection-ai-small','至少间隔 48 小时再答。重做同一道题仅检验回忆，不能当作新情境独立迁移。'),savedList);(doc.querySelector('main')||doc.body).append(savedSection);
    let pending = null, lastSelectionKey = '', displayedHistory = '', contextEdited = false, storage;
    const preview = new URLSearchParams(root.location.search).get('preview') === '1';
    try { storage = root.sessionStorage; } catch (_) { storage = null; }
    let controller = createController({fetch: root.fetch?.bind(root), origin: root.location.origin, storage, cacheKey: root.IELTSProfiles?.scopeKey(preview ? 'ielts52-selection-ai-cache-preview-v1' : CACHE_KEY) || (preview ? 'ielts52-selection-ai-cache-preview-v1' : CACHE_KEY), onChange: render});
    let assessment=false,vocabularyTesting=false,courseContext=null,activeController=controller;
    async function translationAssistance(snapshot,value){
      if(assessment||vocabularyTesting||courseContext?.mode==='assessment')throw apiError('ASSESSMENT_ASSISTANCE_DENIED','独立测评期间不提供翻译。');
      if(snapshot.materialId&&snapshot.materialId===courseContext?.material?.id)courseContext.markAssistance?.('ai');
      const R=root.IELTSRecords;if(!R?.record||!R.makeId)throw apiError('ASSISTANCE_RECORD_REQUIRED','辅助记录模块尚未就绪，请刷新本学习页后重试。');
      const skill=snapshot.skill||(/词|单词/.test(page)?'vocabulary':/口语/.test(page)?'speaking':/写作/.test(page)?'writing':'grammar');
      await R.record({id:R.makeId('translation'),materialId:snapshot.materialId||'translation-page-'+Object.keys(TRANSLATION_SURFACES).indexOf(page),title:'划词翻译：'+snapshot.text.slice(0,100),skill,source:'selection-ai-translation',answer:JSON.stringify({schema:1,page,selection:snapshot.text,context:snapshot.context,model:value.model,promptVersion:value.promptVersion}),minutes:0,activeSeconds:0,quantity:0,unit:'次',assistance:{hint:true,answer:false,ai:true},kind:'original',exposure:'seen',evaluation:{method:'none',result:'unverified',feedback:'练习中使用了词句翻译；本记录不代表独立作答、掌握或能力通过。'}});
    }
    let translationController=createTranslationController({fetch:root.fetch?.bind(root),origin:root.location.origin,onChange:render,onAssistance:translationAssistance});
    savedSection.hidden=!legacyPage;
    let practiceAbort=null,practiceGeneration=0,practiceItem=null,practiceClock=null;
    function clearPractice(){practiceCancel.hidden=true;practiceAbort?.abort();practiceGeneration++;clearInterval(practiceClock);practiceClock=null;practiceItem=null;practiceQuestions.replaceChildren();practiceStatus.textContent='';}
    function practiceStorage(){return root.IELTSProfiles?.storage()||(preview?root.sessionStorage:root.localStorage);}
    function savePractice(item){const store=practiceStorage(),raw=store.getItem(PRACTICE_KEY),value=raw?parsePractice(raw):{schema:1,items:[]};const index=value.items.findIndex(i=>i.id===item.id);if(index<0)value.items.push(item);else value.items[index]=item;const clean=parsePractice(value);if(store.getItem(PRACTICE_KEY)!==raw)throw Error('另一页面更新了巩固题，请刷新后重试。');store.setItem(PRACTICE_KEY,JSON.stringify(clean));renderSaved();}
    function renderSaved(){savedList.replaceChildren();try{const saved=parsePractice(practiceStorage().getItem(PRACTICE_KEY)||'{"schema":1,"items":[]}');if(!saved.items.length)savedList.append(node('p','selection-ai-small','生成并提交巩固题后，可保存到这里。'));saved.items.slice().reverse().forEach(item=>{const row=node('div');row.append(node('p','',item.text),node('p','selection-ai-small','复测时间：'+new Date(item.dueAt).toLocaleString()));const b=node('button','',Date.now()>=Date.parse(item.dueAt)?'打开延迟回忆题':'提前练习（不算到期复测）');b.type='button';b.onclick=()=>{panel.hidden=false;practiceItem=item;renderExercises(item,true);heading.focus({preventScroll:true});};row.append(b);savedList.append(row);});}catch(error){savedList.append(node('p','selection-ai-small','原记录无法读取，已保留：'+error.message));}}
    function renderExercises(item,delayed){clearInterval(practiceClock);practiceBox.hidden=false;practiceQuestions.replaceChildren();const started=Date.now(),answers={},insideCourse=Boolean(doc.getElementById('coursePlayerApp'));let usedAnswers=false,recordId=root.IELTSRecords?.makeId('selection')||null,activeSeconds=0,lastActive=started;practiceItem=item;practiceClock=setInterval(()=>{const now=Date.now();if(!doc.hidden&&!panel.hidden&&practiceItem===item&&!insideCourse)activeSeconds+=Math.min(2,Math.max(0,(now-lastActive)/1000));lastActive=now;},1000);
      item.exercises.forEach((q,i)=>{const field=node('fieldset');field.append(node('legend','',(i+1)+'. '+q.prompt));q.options.forEach((option,j)=>{const label=node('label'),input=node('input');input.type='radio';input.name='selection-'+item.id+'-'+q.id;input.value=String(j);input.onchange=()=>answers[q.id]=j;label.append(input,node('span','',option));field.append(label);});practiceQuestions.append(field);});
      const submit=node('button','','提交巩固答案');submit.type='button';const feedback=node('p','selection-ai-small'),delayedSave=node('button','','保存到 48 小时后复测');delayedSave.type='button';delayedSave.hidden=true;practiceQuestions.append(submit,feedback,delayedSave);
      submit.onclick=async()=>{if(item.exercises.some(q=>!Number.isInteger(answers[q.id]))){feedback.textContent='请先完成每一道题。';return;}submit.disabled=true;const correct=item.exercises.filter(q=>q.answers.includes(answers[q.id])).length,elapsed=Math.min(86400,(Date.now()-started)/1000);try{if(root.IELTSRecords){const hasParent=delayed&&item.parentId&&(await root.IELTSRecords.list()).some(r=>r.id===item.parentId);await root.IELTSRecords.record({id:recordId,materialId:'selection-'+item.id,title:'词句巩固：'+item.text.slice(0,100),skill:'grammar',source:'selection-ai-practice',answer:JSON.stringify({schema:1,selection:item.text,context:item.context,questions:item.exercises,answers}),minutes:Math.min(activeSeconds,elapsed)/60,activeSeconds:Math.min(activeSeconds,elapsed),elapsedSeconds:elapsed,quantity:item.exercises.length,unit:'题',assistance:{hint:false,answer:usedAnswers,ai:!delayed},kind:hasParent?'retest':'original',...(hasParent?{parentId:item.parentId}:{}),exposure:'seen',startedAt:new Date(started).toISOString(),submittedAt:new Date().toISOString(),evaluation:{method:'objective',result:correct===item.exercises.length?'pass':'revise',score:correct,maxScore:item.exercises.length,threshold:1,feedback:'AI 生成词句练习；同题延迟回忆不等于新情境独立迁移。'}});}clearInterval(practiceClock);feedback.textContent=(insideCourse?'本题时间由课程会话统一记录，避免重复累计。':'')+'本次 '+correct+' / '+item.exercises.length+'。答案解析默认折叠，可展开核对；已记录真实作答。';practiceQuestions.querySelectorAll('input').forEach(n=>n.disabled=true);item.exercises.forEach(q=>{const details=node('details');details.append(node('summary','','查看「'+q.prompt+'」答案与解释'),node('p','',q.options[q.answers[0]]),node('p','',q.explanation));details.addEventListener('toggle',()=>{if(details.open)usedAnswers=true;});practiceQuestions.append(details);});delayedSave.hidden=false;}catch(error){feedback.textContent='未保存作答：'+error.message;submit.disabled=false;}};
      delayedSave.onclick=()=>{try{const next={...item,createdAt:new Date().toISOString(),dueAt:new Date(Date.now()+48*3600000).toISOString(),parentId:recordId||item.parentId};savePractice(next);feedback.textContent='已保存原题与关联作答；48 小时后可闭卷回忆。';delayedSave.disabled=true;}catch(error){feedback.textContent='未保存复测：'+error.message;}};
      practiceStatus.textContent=delayed?'同题闭卷回忆。即使答对，也不会被标为未见新题通过。':'先作答，再展开答案解析。';
    }
    practiceButton.onclick=async()=>{const state=controller.getState();if(!state.threadId||state.phase==='loading')return;practiceAbort?.abort();const aborter=new AbortController();practiceAbort=aborter;const token=++practiceGeneration;practiceButton.disabled=true;practiceCancel.hidden=false;practiceStatus.textContent='正在生成与选区对应的巩固题。';const timer=setTimeout(()=>aborter.abort(),95000);try{const response=await root.fetch('/api/ai/selection/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadId:state.threadId}),signal:aborter.signal});const result=await response.json();if(token!==practiceGeneration)return;if(!response.ok||!result.ok)throw Error(result.error?.message||'暂时无法生成巩固题。');const now=new Date().toISOString(),item=parsePractice({schema:1,items:[{id:root.IELTSRecords?.makeId('practice')||'practice-'+Date.now(),...(state.snapshot.materialId?{materialId:state.snapshot.materialId}:{lessonId:state.snapshot.lessonId}),text:state.snapshot.text,context:state.snapshot.context,createdAt:now,dueAt:new Date(Date.now()+48*3600000).toISOString(),parentId:null,exercises:result.exercises}]}).items[0];renderExercises(item,false);}catch(error){if(token===practiceGeneration)practiceStatus.textContent='巩固题未生成：'+(error.name==='AbortError'?'已取消或等待超时。':error.message);}finally{clearTimeout(timer);if(token===practiceGeneration){practiceButton.disabled=false;practiceCancel.hidden=true;}}};
    practiceCancel.onclick=()=>{clearPractice();practiceButton.disabled=!controller.getState().threadId;practiceStatus.textContent='已取消巩固题生成。';};
    reportSave.onclick=async()=>{const state=controller.getState();if(!state.snapshot||!reportText.value.trim())return;try{if(!root.IELTSRecords)throw Error('作品记录模块尚未加载。');await root.IELTSRecords.record({id:root.IELTSRecords.makeId('report'),materialId:state.snapshot.materialId||'lesson-'+state.snapshot.lessonId,title:'词句解释纠错报告',skill:'grammar',source:'selection-ai-report',answer:JSON.stringify({selection:state.snapshot.text,context:state.snapshot.context,report:reportText.value.trim(),model:state.model,promptVersion:state.promptVersion}),minutes:0,quantity:0,unit:'报告',assistance:{hint:false,answer:false,ai:true},kind:'original',exposure:'seen',evaluation:{method:'none',result:'unverified',feedback:'用户问题报告，仅在本机保留，不作为学习达标。'}});practiceStatus.textContent='纠错报告已保存在本档案作品记录中。';reportText.value='';}catch(error){practiceStatus.textContent='未保存报告：'+error.message;}};
    function render(state) {
      const busy = state.phase === 'loading';
      if (state.phase === 'idle') { panel.hidden = true; return; }
      const translating=state.snapshot?.kind==='translation';
      heading.textContent=translating?'词句翻译与讲解':'词句 AI 详解';
      hint.textContent=translating?'先给中文翻译，再解释当前词义和语法。题目只翻译文字；使用后会保存辅助记录。AI 解释仍需结合原文核对。':'默认按零基础详细解释：语境中的词义与功能词、句子主干、通俗例句和练习。AI 解释可能有误，请结合原文核对。';
      panel.hidden = false;
      selected.textContent = state.snapshot?.text || '';
      context.textContent = state.snapshot?.context || '';
      const selectionKey = state.snapshot ? JSON.stringify([state.snapshot.materialId || state.snapshot.lessonId, state.snapshot.start, state.snapshot.end]) : '';
      if (selectionKey !== lastSelectionKey) { meaning.value = ''; saveStatus.textContent = ''; collect.open = false; question.value = ''; contextEdited = false; lastSelectionKey = selectionKey; if (state.snapshot) kind.value = state.snapshot.text.length > 80 || /[.!?]$/.test(state.snapshot.text) ? 'sentence' : 'phrase'; }
      if (state.snapshot && !contextEdited) saveContext.value = state.snapshot.context;
      status.textContent = busy ? '正在生成详细解释，最长约 90 秒；可以取消。' : state.error || (state.truncated ? '本次解释未完整生成，未写入缓存。可追问“请继续补全”，或缩短选区后重新解释。' : state.cacheHit ? (state.offlineCache ? '服务暂不可用，显示本次会话中保存的历史解释。' : '已使用本次会话缓存，没有重复生成解释。') : state.phase === 'done' ? '解释完成。' : '');
      if (state.model && !busy) status.textContent += ' 模型：' + state.model + '。';
      cancel.hidden = !busy; retry.hidden = !['error', 'cancelled'].includes(state.phase); regenerate.hidden = !state.feedback || busy;
      launch.hidden = isLocalOrigin(root.location.origin);
      launch.href = state.snapshot?.materialId ? localOrigin + '/学习课程.html?material=' + encodeURIComponent(state.snapshot.materialId) + (preview ? '&preview=1' : '') : localOrigin + '/开始学习.html' + (preview ? '?preview=1' : '') + '#day' + (state.snapshot?.lessonId || 1);
      settings.href = 'AI设置.html' + (preview ? '?preview=1' : '');
      feedback.textContent = state.feedback;
      const newHistory = JSON.stringify(state.history);
      if (newHistory !== displayedHistory) { conversation.replaceChildren(); state.history.forEach(turn => { conversation.append(node('p', 'selection-ai-question', '追问：' + turn.question), node('div', 'selection-ai-feedback', turn.feedback)); }); displayedHistory = newHistory; }
      followupForm.hidden = translating||!state.feedback;
      ask.disabled = busy || !state.threadId || state.remaining < 1; question.disabled = ask.disabled;
      followupNote.textContent = state.threadId ? '还可追问 ' + state.remaining + ' 次。追问只围绕本次选区。' : '缓存或已过期解释不能直接追问；点击“重新解释”建立新会话。';
      collect.hidden=translating;report.hidden=translating;
      save.disabled = translating||!state.snapshot || !root.IELTSNotebook?.add;
      panel.setAttribute('aria-busy', String(busy));
      practiceButton.disabled=busy||!state.threadId;practiceBox.hidden=translating||!state.feedback&&!practiceItem;
      if (state.phase === 'done' && state.snapshot) root.dispatchEvent(new CustomEvent('ielts:selection-assistance', {detail:{materialId:state.snapshot.materialId,lessonId:state.snapshot.lessonId,page,kind:translating?'translation':'explanation',assistance:true}}));
    }
    function selectionNow() {
      if(assessment||vocabularyTesting||currentData?.mode==='assessment'||courseContext?.mode==='assessment')return null;
      const selection=root.getSelection?.();
      return captureSelection(selection,currentData)||captureTranslation(selection,doc,{page,mode:'practice',assessment,vocabularyTesting,materialId:courseContext?.material?.id||currentData?.materialId,skill:courseContext?.skill});
    }
    function updateTrigger() {
      const value = selectionNow();
      trigger.hidden = !value;
      if (!value) return;
      pending = value;
      const width = 150;
      trigger.style.left = Math.max(8, Math.min(value.rect.left, root.innerWidth - width - 8)) + 'px';
      trigger.style.top = Math.max(8, Math.min(value.rect.bottom + 8, root.innerHeight - 52)) + 'px';
    }
    function begin(snapshot) {
      if(snapshot?.kind==='translation'){
        if(assessment||vocabularyTesting||!snapshot.verify?.())return;
        controller.cancel();activeController=translationController;clearTimeout(readTimer);clearPractice();trigger.hidden=true;
        doc.getElementById('wordMeaningTooltip')?.setAttribute('hidden','');translationController.explain(snapshot);heading.focus({preventScroll:true});return;
      }
      if (!matches(snapshot, currentData)) return;
      translationController.cancel();activeController=controller;
      clearTimeout(readTimer); clearPractice();trigger.hidden = true;
      doc.getElementById('wordMeaningTooltip')?.setAttribute('hidden', '');
      controller.explain(snapshot); heading.focus({preventScroll: true});
    }
    trigger.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') event.preventDefault(); });
    trigger.addEventListener('click', () => begin(pending));
    cancel.addEventListener('click', () => activeController.cancel());
    retry.addEventListener('click', () => activeController.retry());
    regenerate.addEventListener('click', () => { const state = activeController.getState(); if (state.snapshot) { clearPractice();activeController.explain(state.snapshot, true); } });
    close.addEventListener('click', () => { clearPractice();activeController.reset(); panel.hidden = true; });
    saveContext.addEventListener('input', () => { contextEdited = true; });
    followupForm.addEventListener('submit', event => { event.preventDefault(); const text = question.value.trim(); if (!text) { followupNote.textContent = '先写下一个与当前选区有关的问题。'; return; } if (text.length > 400) { followupNote.textContent = '追问请控制在 400 字符以内。'; return; } controller.followup(text); });
    collectForm.addEventListener('submit', event => {
      event.preventDefault(); const state = controller.getState();
      if (!matches(state.snapshot, currentData) || !root.IELTSNotebook?.add) return;
      if (!meaning.value.trim()) { saveStatus.textContent = '请先写下或修改中文释义，再保存。'; meaning.focus(); return; }
      try {
        const saved = root.IELTSNotebook.add({day: state.snapshot.lessonId || null, materialId:state.snapshot.materialId, word: state.snapshot.text, meaning: meaning.value.trim(), context: saveContext.value.trim(), kind: kind.value});
        saveStatus.textContent = saved.added ? '已保存；到复习页刷新即可加入词卡队列。' : '本课已收藏这段文字，保留已有释义，未重复添加。';
      } catch (error) { saveStatus.textContent = '未保存：' + (error.message || '请检查生词本记录。'); }
    });
    doc.addEventListener('contextmenu', event => {
      if (editable(event.target)&&!translationTextControl(event.target,page)||!event.target.closest?.('[data-ai-reading]')&&!translationSurface(event.target,page)) return;
      const snapshot = selectionNow(); if (!snapshot) return;
      event.preventDefault(); begin(snapshot);
    }, true);
    doc.addEventListener('keydown', event => {
      if (editable(event.target)&&!translationTextControl(event.target,page)) return;
      if ((event.altKey && event.key === 'Enter') || (event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
        const snapshot = selectionNow(); if (snapshot) { event.preventDefault(); begin(snapshot); }
      } else if (event.key === 'Escape' && !panel.hidden) { activeController.reset(); panel.hidden = true; trigger.hidden = true; }
    }, true);
    doc.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.target.closest?.('.read-word')) return;
      clearTimeout(readTimer); drag = {x: event.clientX, y: event.clientY, moved: false};
    }, true);
    doc.addEventListener('pointermove', event => { if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true; }, true);
    doc.addEventListener('pointerup', () => { if (drag?.moved || selectionNow()) { suppressUntil = Date.now() + 400; clearTimeout(readTimer); } drag = null; updateTrigger(); }, true);
    doc.addEventListener('pointercancel', () => { drag = null; suppressUntil = Date.now() + 400; clearTimeout(readTimer); }, true);
    doc.addEventListener('selectionchange', () => { if (selectionNow()) clearTimeout(readTimer); updateTrigger(); });
    doc.addEventListener('select',updateTrigger,true);
    doc.addEventListener('scroll', () => { trigger.hidden = true; }, true);
    root.addEventListener('resize', () => { trigger.hidden = true; });
    function setLesson(data) { clearTimeout(readTimer); clearPractice();translationController.reset();activeController=controller;currentData = data; pending = null; trigger.hidden = true; lastSelectionKey = ''; displayedHistory = ''; conversation.replaceChildren(); controller.setLesson(data); }
    root.addEventListener('ielts:lesson', event => setLesson(event.detail));
    root.addEventListener('ielts:material', event => setLesson(event.detail));
    root.addEventListener('ielts:assessment-mode', event => {assessment=event.detail?.active===true;savedSection.hidden=assessment||!legacyPage;if(assessment){clearPractice();controller.reset();translationController.reset();panel.hidden=true;trigger.hidden=true;}});
    root.addEventListener('ielts:vocabulary-testing',event=>{vocabularyTesting=event.detail?.active===true;if(vocabularyTesting){controller.reset();translationController.reset();panel.hidden=true;trigger.hidden=true;}});
    root.addEventListener('ielts:course-session',event=>{courseContext=event.detail||null;translationController.reset();trigger.hidden=true;});
    root.addEventListener('ielts:course-started',event=>{courseContext=event.detail||null;});
    root.addEventListener('ielts:profile-changed', () => { controller.cancel();translationController.cancel();courseContext=null;setLesson(null); controller = createController({fetch:root.fetch?.bind(root),origin:root.location.origin,storage,cacheKey:root.IELTSProfiles?.scopeKey(CACHE_KEY)||CACHE_KEY,onChange:render});activeController=controller;renderSaved(); });
    root.addEventListener('ielts:lesson-clear', () => {courseContext=null;setLesson(null);});
    root.addEventListener('pagehide', () => { clearTimeout(readTimer); controller.cancel();translationController.cancel(); });
    setLesson(root.IELTSCurrentLesson || null);
    renderSaved();
  }
  const api = {LOCAL_ORIGIN, isLocalOrigin, serviceOrigin, MAX_SELECTION, PRACTICE_KEY, parsePractice, normalize, paragraphRanges, makeSnapshot, captureSelection, matches, cacheKey, parseCache, createController, shouldSuppressReadingClick, handleReadClick,TRANSLATION_SURFACES,pageName,translationSurface,translationTextControl,translationSnapshot,captureTranslation,createTranslationController};
  root.IELTSSelectionAI = Object.freeze(api);
  if (typeof module === 'object' && module.exports) module.exports = root.IELTSSelectionAI;
  if (root.document?.getElementById('lesson') || root.document?.getElementById('coursePlayerApp')||root.document&&TRANSLATION_SURFACES[pageName(root.location)]) init();
})(typeof window !== 'undefined' ? window : globalThis);
