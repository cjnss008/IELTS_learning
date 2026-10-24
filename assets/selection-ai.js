(function (root) {
  'use strict';
  const LOCAL_ORIGIN = 'http://127.0.0.1:8765';
  const CACHE_KEY = 'ielts52-selection-ai-cache-v1';
  const MAX_SELECTION = 800;
  const MAX_FEEDBACK = 32000;
  const MAX_CACHE = 20;
  const TIMEOUT = 95000;
  const normalize = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const editable = element => Boolean(element && (element.isContentEditable || element.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]')));

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
    const paragraph = paragraphRanges(data).find(item => item.index === paragraphIndex);
    if (!paragraph || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > paragraph.text.length || from >= to) return null;
    const raw = paragraph.text.slice(from, to);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const start = paragraph.start + from + leading;
    const end = paragraph.start + to - trailing;
    const text = data.lesson.text.slice(start, end);
    if (!text || text.length > MAX_SELECTION || !/[A-Za-z]/.test(text)) return null;
    return {lessonId: data.lesson.day, title: data.lesson.title, sourceText: data.lesson.text, start, end, text, context: paragraph.text};
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
      if (!paragraph || paragraph !== last?.closest('[data-ai-reading]') || !paragraph.closest('#lesson') || paragraph.closest('[hidden]')) return null;
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
    return Boolean(snapshot && data?.lesson && snapshot.lessonId === data.lesson.day && snapshot.sourceText === data.lesson.text &&
      Number.isInteger(snapshot.start) && Number.isInteger(snapshot.end) && snapshot.start >= 0 && snapshot.end <= data.lesson.text.length &&
      snapshot.end > snapshot.start && snapshot.end - snapshot.start <= MAX_SELECTION && data.lesson.text.slice(snapshot.start, snapshot.end) === snapshot.text);
  }
  function cacheKey(snapshot, lessonVersion, connection) {
    return JSON.stringify([snapshot.lessonId, lessonVersion, snapshot.start, snapshot.end, snapshot.text, connection.baseUrl, connection.model, connection.connectionVersion, connection.selectionPromptVersion, 'both', 'A0', 'detail-ui-v1']);
  }
  function parseCache(raw) {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.schema !== 1 || !Array.isArray(value.entries) || value.entries.length > MAX_CACHE) throw Error('选区解释缓存格式无效。');
    const entries = value.entries.map(item => {
      if (!item || !Number.isInteger(item.lessonId) || item.lessonId < 1 || item.lessonId > 52 || !Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < 0 || item.end <= item.start ||
          !['key', 'sourceText', 'text', 'context', 'feedback', 'model', 'version', 'promptVersion'].every(key => typeof item[key] === 'string') ||
          item.key.length > 2500 || item.sourceText.length > 12000 || item.text.length > MAX_SELECTION || item.context.length > 2000 || item.feedback.length > MAX_FEEDBACK || !item.feedback.trim() || item.model.length > 200 || !/^[a-f0-9]{64}$/i.test(item.version) ||
          !item.promptVersion || item.promptVersion.length > 100 || item.sourceText.slice(item.start, item.end) !== item.text || !item.context.includes(item.text)) throw Error('选区解释缓存内容无效。');
      return {key: item.key, lessonId: item.lessonId, sourceText: item.sourceText, start: item.start, end: item.end, text: item.text, context: item.context, feedback: item.feedback, model: item.model, version: item.version, promptVersion: item.promptVersion};
    });
    return {schema: 1, entries};
  }
  function makeCache(storage, key) {
    let entries = [], writable = true;
    try { const raw = storage?.getItem(key); if (raw) { if (raw.length > 900000) throw Error(); entries = parseCache(raw).entries; } } catch (_) { writable = false; }
    return {
      exact: key => entries.find(item => item.key === key),
      offline: snapshot => entries.slice().reverse().find(item => item.lessonId === snapshot.lessonId && item.sourceText === snapshot.sourceText && item.start === snapshot.start && item.end === snapshot.end && item.text === snapshot.text),
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
          !selection || selection.lessonId !== snapshot.lessonId || selection.start !== snapshot.start || selection.end !== snapshot.end || selection.text !== snapshot.text || selection.version !== version ||
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
      if (options.origin !== LOCAL_ORIGIN) {
        active = null;
        const entry = !question && cache.offline(snapshot);
        if (entry) { cached(entry, snapshot, true); return true; }
        patch({phase: 'error', error: '双击“启动学习.cmd”，保持窗口打开，再从本地学习地址打开课文。AI 不会从文件页面直接发送请求。', code: 'LOCAL_SERVICE_REQUIRED'}); return false;
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
          const canonical = await json('/api/ai/selection/lesson/' + snapshot.lessonId, null, aborter.signal);
          if (token !== generation) return false;
          if (canonical.lesson?.id !== snapshot.lessonId || canonical.lesson.text !== snapshot.sourceText || typeof canonical.lesson.version !== 'string' || !/^[a-f0-9]{64}$/i.test(canonical.lesson.version)) throw apiError('COURSE_CHANGED', '课文版本已变化，请刷新页面后重新选择。');
          if (canonical.lesson.promptVersion !== promptVersion) throw apiError('PROMPT_CHANGED', '讲解配置已更新，请重新解释。');
          version = canonical.lesson.version;
          const key = cacheKey(snapshot, version, connection);
          const entry = !force && cache.exact(key);
          if (entry) { cached(entry, snapshot, false); return true; }
          result = await json('/api/ai/selection', {lessonId: snapshot.lessonId, version, start: snapshot.start, end: snapshot.end, selectedText: snapshot.text, intent: 'both', level: 'A0'}, aborter.signal);
        }
        if (token !== generation || !matches(snapshot, data)) return false;
        validateResponse(result, snapshot, version, promptVersion);
        const history = question ? previous.history.concat({question, feedback: result.feedback}) : [];
        patch({phase: 'done', snapshot: {...snapshot, context: result.selection.context}, feedback: question ? previous.feedback : result.feedback, model: result.model, version, promptVersion, threadId: result.threadId, remaining: result.followupsRemaining, history, cacheHit: false, offlineCache: false, truncated: result.truncated === true, error: '', code: ''});
        if (!question && result.model === connection.model && result.truncated !== true) cache.put({key: cacheKey(snapshot, version, connection), lessonId: snapshot.lessonId, sourceText: snapshot.sourceText, start: snapshot.start, end: snapshot.end, text: snapshot.text, context: result.selection.context, feedback: result.feedback, model: result.model, version, promptVersion});
        return true;
      } catch (error) {
        if (token !== generation) return false;
        if (!question && !force && !error.code && !timedOut) {
          const entry = cache.offline(snapshot);
          if (entry) { cached(entry, snapshot, true); return true; }
        }
        const code = timedOut ? 'TIMEOUT' : error.code || 'SERVICE_UNAVAILABLE';
        const message = timedOut ? '等待超过 95 秒，已停止等待。可重新解释；本地服务可能仍在结束请求。' : error.code ? error.message : '无法连接本地 AI 服务。请检查服务窗口与网络后重试。';
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
    if (!doc?.getElementById('lesson')) return;
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
    const launch = node('a', 'selection-ai-link', '从本地服务打开学习页'); launch.href = LOCAL_ORIGIN + '/开始学习.html'; launch.hidden = true;
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
    panel.append(top, hint, selected, contextDetails, status, actions, result, followupForm, collect);
    doc.body.append(trigger, panel);
    let pending = null, lastSelectionKey = '', displayedHistory = '', contextEdited = false, storage;
    const preview = new URLSearchParams(root.location.search).get('preview') === '1';
    try { storage = root.sessionStorage; } catch (_) { storage = null; }
    const controller = createController({fetch: root.fetch?.bind(root), origin: root.location.origin, storage, cacheKey: preview ? 'ielts52-selection-ai-cache-preview-v1' : CACHE_KEY, onChange: render});
    function render(state) {
      const busy = state.phase === 'loading';
      if (state.phase === 'idle') { panel.hidden = true; return; }
      panel.hidden = false;
      selected.textContent = state.snapshot?.text || '';
      context.textContent = state.snapshot?.context || '';
      const selectionKey = state.snapshot ? JSON.stringify([state.snapshot.lessonId, state.snapshot.start, state.snapshot.end]) : '';
      if (selectionKey !== lastSelectionKey) { meaning.value = ''; saveStatus.textContent = ''; collect.open = false; question.value = ''; contextEdited = false; lastSelectionKey = selectionKey; if (state.snapshot) kind.value = state.snapshot.text.length > 80 || /[.!?]$/.test(state.snapshot.text) ? 'sentence' : 'phrase'; }
      if (state.snapshot && !contextEdited) saveContext.value = state.snapshot.context;
      status.textContent = busy ? '正在生成详细解释，最长约 90 秒；可以取消。' : state.error || (state.truncated ? '本次解释未完整生成，未写入缓存。可追问“请继续补全”，或缩短选区后重新解释。' : state.cacheHit ? (state.offlineCache ? '服务暂不可用，显示本次会话中保存的历史解释。' : '已使用本次会话缓存，没有重复生成解释。') : state.phase === 'done' ? '解释完成。' : '');
      if (state.model && !busy) status.textContent += ' 模型：' + state.model + '。';
      cancel.hidden = !busy; retry.hidden = !['error', 'cancelled'].includes(state.phase); regenerate.hidden = !state.feedback || busy;
      launch.hidden = root.location.origin === LOCAL_ORIGIN;
      launch.href = LOCAL_ORIGIN + '/开始学习.html' + (preview ? '?preview=1' : '') + '#day' + (state.snapshot?.lessonId || 1);
      settings.href = 'AI设置.html' + (preview ? '?preview=1' : '');
      feedback.textContent = state.feedback;
      const newHistory = JSON.stringify(state.history);
      if (newHistory !== displayedHistory) { conversation.replaceChildren(); state.history.forEach(turn => { conversation.append(node('p', 'selection-ai-question', '追问：' + turn.question), node('div', 'selection-ai-feedback', turn.feedback)); }); displayedHistory = newHistory; }
      followupForm.hidden = !state.feedback;
      ask.disabled = busy || !state.threadId || state.remaining < 1; question.disabled = ask.disabled;
      followupNote.textContent = state.threadId ? '还可追问 ' + state.remaining + ' 次。追问只围绕本次选区。' : '缓存或已过期解释不能直接追问；点击“重新解释”建立新会话。';
      save.disabled = !state.snapshot || !root.IELTSNotebook?.add;
      panel.setAttribute('aria-busy', String(busy));
    }
    function selectionNow() { return captureSelection(root.getSelection?.(), currentData); }
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
      if (!matches(snapshot, currentData)) return;
      clearTimeout(readTimer); trigger.hidden = true;
      doc.getElementById('wordMeaningTooltip')?.setAttribute('hidden', '');
      controller.explain(snapshot); heading.focus({preventScroll: true});
    }
    trigger.addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') event.preventDefault(); });
    trigger.addEventListener('click', () => begin(pending));
    cancel.addEventListener('click', () => controller.cancel());
    retry.addEventListener('click', () => controller.retry());
    regenerate.addEventListener('click', () => { const state = controller.getState(); if (state.snapshot) controller.explain(state.snapshot, true); });
    close.addEventListener('click', () => { controller.reset(); panel.hidden = true; });
    saveContext.addEventListener('input', () => { contextEdited = true; });
    followupForm.addEventListener('submit', event => { event.preventDefault(); const text = question.value.trim(); if (!text) { followupNote.textContent = '先写下一个与当前选区有关的问题。'; return; } if (text.length > 400) { followupNote.textContent = '追问请控制在 400 字符以内。'; return; } controller.followup(text); });
    collectForm.addEventListener('submit', event => {
      event.preventDefault(); const state = controller.getState();
      if (!matches(state.snapshot, currentData) || !root.IELTSNotebook?.add) return;
      if (!meaning.value.trim()) { saveStatus.textContent = '请先写下或修改中文释义，再保存。'; meaning.focus(); return; }
      try {
        const saved = root.IELTSNotebook.add({day: state.snapshot.lessonId, word: state.snapshot.text, meaning: meaning.value.trim(), context: saveContext.value.trim(), kind: kind.value});
        saveStatus.textContent = saved.added ? '已保存；到复习页刷新即可加入词卡队列。' : '本课已收藏这段文字，保留已有释义，未重复添加。';
      } catch (error) { saveStatus.textContent = '未保存：' + (error.message || '请检查生词本记录。'); }
    });
    doc.addEventListener('contextmenu', event => {
      if (editable(event.target) || !event.target.closest?.('[data-ai-reading]')) return;
      const snapshot = selectionNow(); if (!snapshot) return;
      event.preventDefault(); begin(snapshot);
    }, true);
    doc.addEventListener('keydown', event => {
      if (editable(event.target)) return;
      if ((event.altKey && event.key === 'Enter') || (event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
        const snapshot = selectionNow(); if (snapshot) { event.preventDefault(); begin(snapshot); }
      } else if (event.key === 'Escape' && !panel.hidden) { controller.reset(); panel.hidden = true; trigger.hidden = true; }
    }, true);
    doc.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.target.closest?.('.read-word')) return;
      clearTimeout(readTimer); drag = {x: event.clientX, y: event.clientY, moved: false};
    }, true);
    doc.addEventListener('pointermove', event => { if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true; }, true);
    doc.addEventListener('pointerup', () => { if (drag?.moved || selectionNow()) { suppressUntil = Date.now() + 400; clearTimeout(readTimer); } drag = null; updateTrigger(); }, true);
    doc.addEventListener('pointercancel', () => { drag = null; suppressUntil = Date.now() + 400; clearTimeout(readTimer); }, true);
    doc.addEventListener('selectionchange', () => { if (selectionNow()) clearTimeout(readTimer); updateTrigger(); });
    doc.addEventListener('scroll', () => { trigger.hidden = true; }, true);
    root.addEventListener('resize', () => { trigger.hidden = true; });
    function setLesson(data) { clearTimeout(readTimer); currentData = data; pending = null; trigger.hidden = true; lastSelectionKey = ''; displayedHistory = ''; conversation.replaceChildren(); controller.setLesson(data); }
    root.addEventListener('ielts:lesson', event => setLesson(event.detail));
    root.addEventListener('ielts:lesson-clear', () => setLesson(null));
    root.addEventListener('pagehide', () => { clearTimeout(readTimer); controller.cancel(); });
    setLesson(root.IELTSCurrentLesson || null);
  }
  const api = {LOCAL_ORIGIN, MAX_SELECTION, normalize, paragraphRanges, makeSnapshot, captureSelection, matches, cacheKey, parseCache, createController, shouldSuppressReadingClick, handleReadClick};
  root.IELTSSelectionAI = Object.freeze(api);
  if (typeof module === 'object' && module.exports) module.exports = root.IELTSSelectionAI;
  if (root.document?.getElementById('lesson')) init();
})(typeof window !== 'undefined' ? window : globalThis);
