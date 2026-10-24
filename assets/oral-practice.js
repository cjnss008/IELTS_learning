(function (root) {
  'use strict';
  const DEFAULT_THRESHOLDS = Object.freeze({ accuracy: 80, fluency: 75, completeness: 90 });
  const score = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  const BUSY = new Set(['requesting', 'recording', 'saving', 'assessing', 'coaching']);
  const LABELS = { accuracy: '准确度', fluency: '流利度', completeness: '完整度' };
  const passageFormat = root.IELTSPassageFormat || (typeof module === 'object' && module.exports ? require('./passage-format.js') : null);
  function requiredScores(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !Object.hasOwn(DEFAULT_THRESHOLDS, k))) throw Error('朗读门槛格式无效。');
    const out = { ...DEFAULT_THRESHOLDS, ...value };
    if (Object.values(out).some(v => !score(v))) throw Error('朗读门槛须为0–100的有限分数。');
    return out;
  }
  function judge(result, required = DEFAULT_THRESHOLDS) {
    const missing = Object.keys(required).filter(k => !score(result?.[k]));
    const below = Object.keys(required).filter(k => score(result?.[k]) && result[k] < required[k]);
    return { pass: missing.length ? null : below.length === 0, verdict: missing.length ? 'pending' : below.length ? 'needs-practice' : 'passed', missing, below, thresholds: { ...required } };
  }
  function splitReference(text, maxWords = 65) {
    if (typeof text !== 'string' || !text.trim() || text.length > 30000) throw Error('每日口语需要1–30000字符的课程原文。');
    if (!Number.isInteger(maxWords) || maxWords < 10 || maxWords > 100) throw Error('每段长度应为10–100词。');
    const sourceParagraphs = passageFormat?.paragraphs(text) || text.split(/\r\n|\r|\n/).map(p=>p.trim()).filter(Boolean);
    const paragraphs = [];
    for (let i = 0; i < sourceParagraphs.length; i++) {
      // Some source books place a section letter on its own line. It stays
      // visible with its following text, rather than becoming an "A" task.
      if (/^[A-Z]\.?$/.test(sourceParagraphs[i]) && i + 1 < sourceParagraphs.length) paragraphs.push(sourceParagraphs[i] + '\n' + sourceParagraphs[++i]);
      else paragraphs.push(sourceParagraphs[i]);
    }
    const parts = [];
    for (const paragraph of paragraphs) {
      const sentences = []; let sentenceStart = 0;
      for (const end of paragraph.matchAll(/[.!?]+["')\]]*(?=\s|$)/g)) {
        const through = end.index + end[0].length, before = paragraph.slice(0, through);
        // Paragraph labels, personal initials and common abbreviations belong
        // with the following words, never as a standalone model recording.
        if (/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\.|\b(?:[A-Z]\.)*[A-Z]\.|\b[ap]\.m\.)$/i.test(before)) continue;
        const sentence = paragraph.slice(sentenceStart, through).trim(); if (sentence) sentences.push(sentence); sentenceStart = through;
      }
      const tail = paragraph.slice(sentenceStart).trim(); if (tail) sentences.push(tail);
      let current = '';
      for (const sentence of sentences) {
      const words = sentence.match(/\S+/g) || [];
      if (words.length > maxWords) {
        if (current) { parts.push(current); current = ''; }
        // Long source sentences are divided at word boundaries, with all words retained.
        for (let i = 0; i < words.length;) { let end = Math.min(words.length, i + maxWords); if (end < words.length && /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|[A-Z])\.$/i.test(words[end - 1]) && end - i > 1) end--; parts.push(words.slice(i, end).join(' ')); i = end; }
      } else if (current && (current.match(/\S+/g).length + words.length > maxWords)) {
        parts.push(current); current = sentence;
      } else current = current ? current + ' ' + sentence : sentence;
      }
      if (current) parts.push(current);
    }
    if (!parts.length || parts.length > 100) throw Error('课程原文无法分段，请缩短本次材料。');
    return parts;
  }
  function checkAbort(signal) {
    if (signal?.aborted) { const error = new Error('已取消等待，原音与参考原文仍保留。'); error.name = 'AbortError'; throw error; }
  }
  async function json(path, body, options = {}) {
    checkAbort(options.signal);
    const fetcher = options.fetch || root.fetch.bind(root);
    const response = await fetcher(path, { method: body ? 'POST' : 'GET', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: options.signal });
    let result;
    try { result = await response.json(); } catch (_) { throw Error('本地服务返回的数据无法读取，录音仍保留。'); }
    checkAbort(options.signal);
    if (!response.ok || result?.ok === false) { const error = new Error(typeof result?.error?.message === 'string' ? result.error.message.slice(0, 500) : '本地口语服务暂不可用。'); error.code = result?.error?.code; throw error; }
    return result;
  }
  async function prepareAudio(blob, options = {}) {
    const Context = options.AudioContext || root.AudioContext || root.webkitAudioContext;
    const Offline = options.OfflineAudioContext || root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const encoder = options.encodeWav || root.IELTSSpeakingAudio?.encodeWav;
    const base64 = options.base64 || root.IELTSMediaLibrary?.base64;
    if (!Context || !Offline || !encoder || !base64) throw Error('当前浏览器不能整理录音，请通过本地服务用近期Chrome或Edge打开。');
    const context = new Context(); let decoded;
    try { decoded = await context.decodeAudioData(await blob.arrayBuffer()); } finally { await context.close().catch(() => {}); }
    checkAbort(options.signal);
    if (!Number.isFinite(decoded.duration) || decoded.duration < 0.1 || decoded.duration > 180.1) throw Error('每段朗读录音须为0.1–180秒，请按段重录。');
    const frames = Math.floor(Math.min(decoded.duration, 180) * 16000), offline = new Offline(1, frames, 16000), source = offline.createBufferSource();
    source.buffer = decoded; source.connect(offline.destination); source.start();
    const rendered = await offline.startRendering(); checkAbort(options.signal);
    return { audio: base64(encoder(rendered.getChannelData(0))), durationSeconds: frames / 16000 };
  }
  async function requestCoach(professional, options = {}) {
    const status = await json('/api/ai/status', null, options);
    if (status.connected !== true || !status.model) { const error = new Error('通用AI尚未连接，专业分数已保留；到AI设置连接后重试说明。'); error.code = 'AI_NOT_CONNECTED'; throw error; }
    options.onProgress?.('coaching', '专业结果已返回，正在请通用AI逐项解释并给出重练方法。');
    const coach = await json('/api/ai/oral-coach', { evidenceId: professional.evidenceId, reference: options.reference, level: options.level || 'A0', materialId: options.materialId || '', thresholds: requiredScores(options.thresholds) }, options);
    if (coach.evidenceId !== professional.evidenceId || coach.feedbackFormat !== 'oral-coach-v1' || typeof coach.summary !== 'string' || !Array.isArray(coach.problems)) throw Error('AI说明没有对应本次专业证据，原音与分数已保留。');
    return coach;
  }
  async function assessRecording(blob, options = {}) {
    if (!(blob instanceof Blob) || !blob.size || blob.size > 32 * 1024 * 1024 || !/^audio\//.test(blob.type)) throw Error('请提供本次真实的原始音频，不能只用转写文字进行发音评测。');
    const required = requiredScores(options.thresholds), reference = String(options.reference || '').trim();
    if (!reference || reference.length > 6000) throw Error('本段参考原文无效。');
    const status = await json('/api/oral/status', null, options);
    if (status.configured !== true) { const error = new Error('阿里专业口语评测尚未配置。原音已保存，本段保持待评；到AI设置连接后重试。'); error.code = 'ORAL_NOT_CONFIGURED'; throw error; }
    options.onProgress?.('assessing', '正在整理并发送本段原音给阿里专业口语评测，首次授权可能需要较长时间。');
    const prepared = await (options.prepareAudio || prepareAudio)(blob, options); checkAbort(options.signal);
    if (typeof prepared?.audio !== 'string' || !prepared.audio) throw Error('未能取得有效原音，不能进行专业评测。');
    const assessment = await json('/api/oral/assess', { reference, audio: prepared.audio, coreType: /[.!?].+\S/.test(reference) ? 'en.pred.score' : 'en.sent.score' }, options);
    if (assessment.provider !== 'Alibaba oral assessment' || typeof assessment.evidenceId !== 'string' || !assessment.evidenceId || assessment.result?.text !== reference || !score(assessment.result?.accuracy)) throw Error('专业结果不完整或与本段原文不一致，本段保持待评。');
    const professional = { ...judge(assessment.result, required), result: assessment.result, provider: assessment.provider, evidenceId: assessment.evidenceId, disclaimer: assessment.disclaimer || '朗读诊断0–100分，不能换算IELTS Band。' };
    await options.onProfessional?.(professional); checkAbort(options.signal);
    let coach = null, coachError = '';
    try { coach = await requestCoach(professional, { ...options, reference, thresholds: required }); } catch (error) { checkAbort(options.signal); coachError = error.message || 'AI说明暂未完成，专业结果已保留。'; }
    return { professional, coach, coachError, status: coach && professional.pass !== null ? 'complete' : 'pending', overallPass: professional.pass === true && Boolean(coach) };
  }
  function mistakesFor(professional, context) {
    if (professional.pass !== false) return [];
    const result = professional.result, seen = new Set(), items = [];
    for (const word of Array.isArray(result.words) ? result.words : []) {
      if (typeof word.word !== 'string' || !word.word.trim() || !context.reference.toLowerCase().includes(word.word.trim().toLowerCase()) || !(word.error === 'Omission' || score(word.accuracy) && word.accuracy < professional.thresholds.accuracy)) continue;
      const key = word.word.trim().toLowerCase(); if (seen.has(key)) continue; seen.add(key);
      items.push({ questionId: context.questionId + ':word-' + encodeURIComponent(key), quote: word.word.trim(), word: word.word.trim(), reference: context.reference, dimension: 'accuracy', accuracy: score(word.accuracy) ? word.accuracy : null, error: word.error || 'Unknown' });
    }
    for (const dimension of professional.below) {
      if (dimension === 'accuracy' && items.length) continue;
      items.push({ questionId: context.questionId + ':' + dimension, quote: context.reference, reference: context.reference, dimension, accuracy: null, error: 'DimensionBelowThreshold' });
    }
    return items.slice(0, 30);
  }
  async function mount(host, options = {}) {
    if (!host || !root.document) throw Error('口语练习缺少挂载位置。');
    const doc = root.document, reference = String(options.reference || '').trim(), parts = splitReference(reference, options.maxWords || 65), required = requiredScores(options.thresholds);
    const level = String(options.level || 'A0').match(/A[012]|B[12]|C[12]/g)?.at(-1) || 'A0';
    const profile = () => root.IELTSProfiles?.current().id || 'legacy', capturedProfile = profile();
    const library = options.library || root.IELTSMediaLibrary?.createLibrary?.() || root.IELTSMediaLibrary;
    const fetcher = options.fetch || root.fetch?.bind(root), maxSeconds = Math.min(180, Math.max(10, Number(options.maxSeconds) || 180));
    let index = 0, phase = 'idle', note = '', generation = 0, disposed = false, blocked = false, controller = null, recorder = null, stream = null, timer = null, clockTimer = null, started = 0, previewURL = '', currentBlob = null;
    const results = Array(parts.length).fill(null), works = Array(parts.length).fill(null);
    function el(tag, className, text) { const node = doc.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
    function button(text, handler) { const node = el('button', '', text); node.type = 'button'; node.addEventListener('click', handler); return node; }
    const box = el('section', 'oral-practice'), heading = el('h3', '', options.title || '每日口语 · 分段跟读'), intro = el('p', 'oral-practice-intro', '先听示范，再按原文朗读。结束录音后自动进行专业评测和中文说明；每段通过后完成本篇。');
    const progress = el('p', 'oral-practice-progress'), select = el('select'), text = el('p', 'oral-practice-reference'), referenceRow = el('div', 'oral-practice-reference-row');
    select.setAttribute('aria-label', '选择朗读段落'); text.lang = 'en'; parts.forEach((part, i) => { const option = el('option', '', '第' + (i + 1) + '段 / ' + parts.length); option.value = String(i); select.append(option); });
    const modelButton = button('听本段正确读音（合成示范）', () => demonstrate(parts[index])), stopModel = button('停止示范', () => { modelPlayback.pause(); root.speechSynthesis?.cancel(); });
    referenceRow.append(select, modelButton, stopModel);
    const controls = el('div', 'oral-practice-controls'), startButton = button('开始录音', startRecording), stopButton = button('结束录音并自动评测', stopRecording), cancelButton = button('取消等待', () => cancel()), retryButton = button('重试未完成步骤', retry), clock = el('span', 'oral-practice-clock', '00:00');
    controls.append(startButton, stopButton, cancelButton, retryButton, clock);
    const disclosure = el('p', 'oral-practice-small', '结束录音后会把本段原文与原音发送至已配置的阿里专业评测，再把专业证据交给通用AI解释；在线服务可能计费。原音和原文同时保存在当前本机档案。');
    const statusNode = el('p', 'oral-practice-status'); statusNode.setAttribute('role', 'status'); statusNode.setAttribute('aria-live', 'polite');
    const modelPlayback = el('audio', 'oral-practice-playback'); modelPlayback.controls = true; modelPlayback.hidden = true; modelPlayback.preload = 'none'; modelPlayback.setAttribute('aria-label', '本地正确读音示范');
    modelPlayback.addEventListener('error', () => { if (!disposed) setPhase(phase, '本地示范音读取失败，请检查学习包文件后点击重试。'); });
    const playback = el('audio', 'oral-practice-playback'); playback.controls = true; playback.hidden = true;
    const download = el('a', 'oral-practice-download', '下载本次原始录音'); download.hidden = true;
    const feedback = el('div', 'oral-practice-feedback'), thresholdsNode = el('p', 'oral-practice-small', '本练习门槛：准确度≥' + required.accuracy + '，流利度≥' + required.fluency + '，完整度≥' + required.completeness + '（0–100）。缺少任何关键维度保持待评；分数不换算雅思Band。');
    box.append(heading, intro, progress, referenceRow, text, controls, disclosure, statusNode, modelPlayback, playback, download, feedback, thresholdsNode); host.replaceChildren(box);
    function valid(token) { return !disposed && !blocked && token === generation && profile() === capturedProfile; }
    function allSegments() { return parts.map((part, i) => { const result = results[i], professional = result?.professional, coach = result?.coach; return { index: i, reference: part, workId: works[i]?.id || '', evidenceId: professional?.evidenceId || '', source: professional?.archived ? 'local-archive' : professional ? 'live-assessment' : '', status: result?.status || 'pending', pass: result?.overallPass === true, professional: professional ? { pass: professional.pass, result: professional.result, thresholds: required } : null, coach: professional && coach?.feedbackFormat === 'oral-coach-v1' && coach.evidenceId === professional.evidenceId ? { feedbackFormat: coach.feedbackFormat, evidenceId: coach.evidenceId } : null }; }); }
    function modelDone(segments) { return segments.length === parts.length && new Set(segments.map(s => s.workId)).size === parts.length && new Set(segments.map(s => s.evidenceId)).size === parts.length && segments.every(s => s.workId && s.evidenceId && s.status === 'complete' && s.professional?.result?.text === s.reference && Object.keys(required).every(key => score(s.professional.result[key])) && s.coach?.feedbackFormat === 'oral-coach-v1' && s.coach.evidenceId === s.evidenceId); }
    function getState() { const segments = allSegments(), complete = segments.filter(s => s.pass).length, modelComplete = modelDone(segments); return { phase, busy: BUSY.has(phase), message: note, profileId: capturedProfile, segmentIndex: index, segmentCount: parts.length, completedSegments: complete, modelComplete, overallPass: complete === parts.length && modelComplete, workId: works[index]?.id || '', reference: parts[index], segments, blocked, disposed }; }
    function notify() { try { options.onState?.(getState()); } catch (_) {} }
    function setPhase(next, message) { if (disposed) return; phase = next; if (message !== undefined) note = message; render(); notify(); }
    function showPreview(blob) { playback.pause(); if (previewURL) root.URL.revokeObjectURL(previewURL); previewURL = ''; playback.hidden = download.hidden = !blob; if (blob) { previewURL = root.URL.createObjectURL(blob); playback.src = previewURL; download.href = previewURL; download.download = '每日口语-第' + (index + 1) + '段-' + Date.now() + '.' + (blob.type.includes('mp4') ? 'm4a' : blob.type.includes('wav') ? 'wav' : blob.type.includes('ogg') ? 'ogg' : 'webm'); } else { playback.removeAttribute('src'); playback.load?.(); download.removeAttribute('href'); } }
    function render() {
      const current = results[index], complete = results.filter(r => r?.overallPass).length, locked = blocked || disposed;
      text.textContent = parts[index]; select.value = String(index); progress.textContent = level + ' · 已完成' + complete + '/' + parts.length + '段';
      parts.forEach((part, i) => { if (select.children[i]) select.children[i].textContent = '第' + (i + 1) + '段 / ' + parts.length + ' · ' + (results[i]?.overallPass ? '已通过' : results[i]?.professional?.pass === false ? '需重练' : works[i] ? '待完成评测' : '待录音'); });
      statusNode.textContent = note; statusNode.dataset.phase = phase; startButton.disabled = locked || BUSY.has(phase); startButton.textContent = works[index] ? '重新录音（保留旧原音）' : '开始录音'; stopButton.disabled = locked || phase !== 'recording'; cancelButton.hidden = !BUSY.has(phase); cancelButton.disabled = locked; retryButton.hidden = !works[index] || BUSY.has(phase) || current?.overallPass === true; retryButton.disabled = locked; retryButton.textContent = current?.professional?.archived ? '重新评测已存原音' : '重试未完成步骤'; select.disabled = locked || phase === 'saving'; modelButton.disabled = locked || BUSY.has(phase);
      feedback.replaceChildren();
      if (!current?.professional) return;
      const professional = current.professional, scores = el('div', 'oral-practice-scores');
      for (const key of Object.keys(required)) { const row = el('div', 'oral-practice-score'), value = professional.result[key]; row.dataset.pass = score(value) ? String(value >= required[key]) : 'pending'; row.append(el('span', '', LABELS[key]), el('strong', '', score(value) ? value.toFixed(1) : '待提供')); scores.append(row); }
      feedback.append(scores, el('p', 'oral-practice-verdict', professional.pass === true ? '本段专业指标已达到朗读门槛。' : professional.pass === false ? '本段需针对问题重练；未达到门槛的词句已交给错题本。' : '缺少关键专业指标，本段仍待评。'));
      if (professional.archived) feedback.append(el('p', 'oral-practice-small', '这些分数和说明来自本机原音作品归档，不是当前服务新返回的评测。需要新的专业证据时，请重录或重新评测。'));
      if (current.coach) {
        feedback.append(el('p', '', current.coach.summary));
        for (const problem of current.coach.problems) { const card = el('article', 'oral-practice-problem'); card.append(el('blockquote', '', problem.quote), el('p', '', problem.explanation), el('p', '', problem.practice), button('听这里的正确读音', () => demonstrate(problem.demonstrationText || problem.quote))); feedback.append(card); }
        feedback.append(el('p', '', current.coach.nextStep), el('p', 'oral-practice-small', current.coach.limitations));
      } else feedback.append(el('p', 'oral-practice-pending', current.coachError || '专业证据已保留，中文说明仍待完成。'));
      if (professional.missing.length) feedback.append(el('p', 'oral-practice-pending', '未提供：' + professional.missing.map(k => LABELS[k]).join('、')));
    }
    function stopTracks() { stream?.getTracks().forEach(track => track.stop()); stream = null; }
    function clearTimers() { root.clearTimeout(timer); root.clearInterval(clockTimer); timer = clockTimer = null; }
    function cancel(message = '已取消等待，已保存的原音、参考原文和专业结果仍保留。') { generation++; controller?.abort(); controller = null; clearTimers(); const old = recorder; recorder = null; if (old && old.state !== 'inactive') old.stop(); stopTracks(); modelPlayback.pause(); root.speechSynthesis?.cancel(); setPhase('cancelled', message); }
    function profileChanged() { if (profile() === capturedProfile) return; cancel('学习档案已切换。当前原音保留在原档案，本页不会写入新档案，请刷新后继续。'); blocked = true; setPhase('profile-changed'); }
    function contextFor(segmentIndex, workId, professional) { return { provider: 'ali', verified: professional.archived !== true, archived: professional.archived === true, workId, evidenceId: professional.evidenceId, materialId: options.materialId || '', dayNumber: options.dayNumber, profileId: capturedProfile, segmentIndex, questionId: 'oral:' + (options.materialId || 'daily') + ':segment-' + segmentIndex, reference: parts[segmentIndex], thresholds: required, result: professional.result }; }
    async function professionalReady(professional, segmentIndex, work, token) {
      if (!valid(token)) return;
      results[segmentIndex] = { professional, coach: null, coachError: '', status: 'pending', overallPass: false };
      works[segmentIndex] = await library.update(work.id, { diagnosis: { provider: professional.provider, result: professional.result, evidenceId: professional.evidenceId, thresholds: required, verdict: professional.verdict }, evidenceId: professional.evidenceId, queueStatus: 'pending', lastError: '' });
      if (!valid(token)) return; render();
      if (professional.pass === false) { const context = contextFor(segmentIndex, work.id, professional), items = mistakesFor(professional, context); const capture = options.onMistakes || ((items, context) => root.IELTSMistakes?.captureOral(items, context)); await capture(items, context); }
      if (!valid(token)) return; notify();
    }
    function outcome(segmentIndex) {
      const result = results[segmentIndex] || {}, professional = result.professional || null, work = works[segmentIndex], segments = allSegments();
      const media = work ? { id: work.id, name: work.name, mime: work.blob.type, durationSeconds: work.durationSeconds } : null;
      const modelComplete = modelDone(segments);
      return { ...result, workId: work?.id || '', media, reference: parts[segmentIndex], profileId: capturedProfile, evidenceId: professional?.evidenceId || '', ...(professional && work && !professional.archived ? { professionalContext: contextFor(segmentIndex, work.id, professional) } : {}), segmentIndex, segmentCount: parts.length, allSegments: segments, modelComplete, overallPass: segments.every(s => s.pass) && modelComplete, recordable: { format: 'ielts-oral-practice-v1', materialId: options.materialId || '', reference: parts[segmentIndex], workId: work?.id || '', evidenceId: professional?.evidenceId || '', thresholds: required, professional: professional?.result || null, verdict: professional?.verdict || 'pending', coach: result.coach || null, status: result.status || 'pending', modelComplete, segments } };
    }
    async function publish(segmentIndex, token) { if (!valid(token)) return; const payload = outcome(segmentIndex); await options.onResult?.(payload); if (!valid(token)) return; root.dispatchEvent?.(new root.CustomEvent('ielts:oral-result', { detail: payload })); }
    async function evaluate(work, segmentIndex, token, feedbackOnly = false) {
      if (!valid(token)) return;
      controller = new AbortController(); const own = controller, timeout = root.setTimeout(() => own.abort(), feedbackOnly ? 100000 : 240000), opts = { fetch: fetcher, reference: parts[segmentIndex], level, materialId: options.materialId || '', thresholds: required, signal: own.signal, prepareAudio: options.prepareAudio, onProgress: (phase, message) => { if (valid(token)) setPhase(phase, message); }, onProfessional: professional => professionalReady(professional, segmentIndex, work, token) };
      setPhase(feedbackOnly ? 'coaching' : 'assessing', feedbackOnly ? '正在重试本次专业证据的中文说明。' : '原音与原文已保存，正在自动提交专业评测。');
      try {
        let result;
        if (feedbackOnly) { const professional = results[segmentIndex].professional; let coach = null, coachError = ''; try { coach = await requestCoach(professional, opts); } catch (error) { checkAbort(own.signal); coachError = error.message; } result = { professional, coach, coachError, status: coach && professional.pass !== null ? 'complete' : 'pending', overallPass: professional.pass === true && Boolean(coach) }; }
        else result = await assessRecording(work.blob, opts);
        if (!valid(token)) return;
        results[segmentIndex] = result;
        works[segmentIndex] = await library.update(work.id, { ...(result.coach ? { advice: [result.coach.summary, ...result.coach.problems.map(p => p.quote + '：' + p.explanation + '\n' + p.practice), result.coach.nextStep, result.coach.limitations].join('\n\n').slice(0, 24000), audioReview: result.coach } : {}), queueStatus: result.status === 'complete' ? 'reviewed' : 'pending', lastError: result.coachError.slice(0, 500) });
        if (!valid(token)) return;
        setPhase(result.status === 'complete' ? 'complete' : 'pending', result.status !== 'complete' ? result.coachError || '关键专业指标不足，原音保留，本段仍待评。' : result.professional.pass ? (results.every(r => r?.overallPass) ? '每段专业评测和中文说明均已完成，本篇跟读已通过。' : '本段通过。请选择下一段继续录音。') : '专业结果与中文练法已保存。听问题词句的正确读音，再重新录这一段。');
        await publish(segmentIndex, token);
      } catch (error) {
        if (!valid(token)) return;
        const previous = results[segmentIndex]; results[segmentIndex] = { ...(previous || {}), status: 'pending', overallPass: false, coachError: previous?.coachError || '' };
        const message = own.signal.aborted ? '等待超时或已取消。原音与已有专业证据保留，本段仍待完成。' : error.message || '评测暂未完成，原音已保存。';
        try { works[segmentIndex] = await library.update(work.id, { queueStatus: 'pending', lastError: message.slice(0, 500) }); } catch (_) {}
        if (!valid(token)) return; setPhase('pending', message); await publish(segmentIndex, token);
      } finally { root.clearTimeout(timeout); if (controller === own) controller = null; if (valid(token)) render(); }
    }
    async function submitRecording(blob, durationSeconds) {
      if (disposed || blocked || profile() !== capturedProfile || BUSY.has(phase) && phase !== 'recording') return;
      const token = ++generation, segmentIndex = index; results[segmentIndex] = null; currentBlob = blob; showPreview(blob); setPhase('saving', '正在保存本次原始录音和参考原文。');
      try {
        if (!library?.create || !library?.update || !(blob instanceof Blob) || !blob.size || !/^audio\//.test(blob.type)) throw Error('原始录音无法保存，请先下载保留后检查浏览器存储。');
        const duration = Number(durationSeconds); if (!Number.isFinite(duration) || duration < 0.1 || duration > 180.1) throw Error('本段录音须为0.1–180秒，请重新录音。');
        const work = await library.create({ kind: 'audio', name: (options.title || '每日口语') + ' · 第' + (segmentIndex + 1) + '段原音', originalText: parts[segmentIndex], prompt: parts[segmentIndex], mode: 'daily_reading', task: 'oral_reading', level, dayNumber: options.dayNumber, materialId: options.materialId || '', durationSeconds: Math.min(duration, 180) }, blob);
        if (!valid(token)) return; works[segmentIndex] = work;
        await options.onAudioSaved?.(work, { reference: parts[segmentIndex], fullReference: reference, segmentIndex, segmentCount: parts.length, profileId: capturedProfile }); if (!valid(token)) return;
        await evaluate(work, segmentIndex, token);
      } catch (error) { if (valid(token)) setPhase('pending', '录音尚未完成保存或评测：' + error.message + ' 可先下载本次原音；不会记为已通过。'); }
    }
    async function startRecording() {
      if (BUSY.has(phase) || disposed || blocked || profile() !== capturedProfile) return;
      if (!root.navigator?.mediaDevices?.getUserMedia || !root.MediaRecorder || !library) { setPhase('pending', '当前浏览器不能录音或保存原音，请通过本机服务用近期Chrome或Edge打开并允许麦克风。'); return; }
      root.speechSynthesis?.cancel(); modelPlayback.pause(); playback.pause();
      const token = ++generation; results[index] = null; setPhase('requesting', '请允许浏览器使用麦克风。');
      try {
        const received = await root.navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
        if (!valid(token)) { received.getTracks().forEach(track => track.stop()); return; }
        stream = received; const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => root.MediaRecorder.isTypeSupported?.(type));
        const local = new root.MediaRecorder(received, mime ? { mimeType: mime } : {}), chunks = []; recorder = local;
        local.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
        local.onerror = () => { if (valid(token)) cancel('麦克风录音失败，请检查设备后重录。'); };
        local.onstop = async () => {
          received.getTracks().forEach(track => track.stop()); if (stream === received) stream = null;
          if (!valid(token)) return; clearTimers(); recorder = null;
          const duration = Math.min(maxSeconds, (Date.now() - started) / 1000); await submitRecording(new Blob(chunks, { type: local.mimeType || mime || 'audio/webm' }), duration);
        };
        local.start(500); started = Date.now(); clock.textContent = '00:00';
        clockTimer = root.setInterval(() => { clock.textContent = root.IELTSSpeakingAudio?.formatTime(Math.min(maxSeconds, (Date.now() - started) / 1000)) || String(Math.floor((Date.now() - started) / 1000)) + '秒'; }, 250);
        timer = root.setTimeout(stopRecording, maxSeconds * 1000); setPhase('recording', '正在录音。读完请结束；最多' + maxSeconds + '秒后自动停止、保存并评测。');
      } catch (error) { if (valid(token)) { stopTracks(); setPhase('pending', error.name === 'NotAllowedError' ? '麦克风权限未获允许，请在浏览器站点设置允许后重试。' : '无法开启麦克风，请检查设备和浏览器权限。'); } }
    }
    function stopRecording() { if (recorder?.state === 'recording') { recorder.stop(); clearTimers(); stopTracks(); setPhase('recording', '录音已结束，正在整理原音。'); } }
    async function retry() { if (BUSY.has(phase) || disposed || blocked || !works[index]) return; const token = ++generation, current = results[index]; await evaluate(works[index], index, token, Boolean(current?.professional?.evidenceId && !current.professional.archived && !current.coach)); }
    async function demonstrate(value) {
      if (disposed || blocked || BUSY.has(phase)) return; const token = generation;
      const exact = String(value || '').trim(); if (!exact) return;
      const resolveModel = text => {
        let entry;
        if (typeof options.modelAudio === 'function') entry = options.modelAudio(text);
        else if (options.modelAudio?.get) entry = options.modelAudio.get(text);
        else if (options.modelAudio && typeof options.modelAudio === 'object') entry = options.modelAudio[text];
        else if (typeof options.modelAudio === 'string' && parts.length === 1 && text === parts[0]) entry = options.modelAudio;
        if (!entry) entry = root.IELTSOralModelAudio?.get(text);
        if (entry && typeof entry !== 'string' && entry.reference !== text) return null;
        return typeof entry === 'string' ? { src: entry, reference: text } : entry || null;
      };
      const word = root.IELTSVocabularyAudio?.items?.[exact.toLowerCase().replace(/\s+/g, ' ')];
      let model = resolveModel(exact) || (word?.audio ? { src: word.audio, reference: exact } : null), contextModel = false;
      if (!model && exact !== parts[index] && parts[index].toLowerCase().includes(exact.toLowerCase())) { model = resolveModel(parts[index]); contextModel = Boolean(model); }
      if (model) {
        // Maps contain package-relative files only. Never turn model text or a
        // supplied provider URL into an external media request.
        const src = model.src;
        if (typeof src !== 'string' || !/^audio\/[A-Za-z0-9_./-]+\.(?:mp3|wav|ogg|m4a|webm)$/i.test(src) || src.split('/').includes('..')) { setPhase(phase, '本地示范音路径无效，请更新学习包音频。'); return; }
        root.speechSynthesis?.cancel(); playback.pause(); modelPlayback.pause(); modelPlayback.src = src; modelPlayback.hidden = false;
        try { await modelPlayback.play(); if (!valid(token)) { modelPlayback.pause(); return; } setPhase(phase, contextModel ? '正在播放包含该词的整段本地合成示范，请对照原文定位目标词。' : '正在播放本地英文合成示范。听后再录音比较。'); }
        catch (_) { if (valid(token)) setPhase(phase, '本地示范音未能播放，请检查本地文件和浏览器声音设置，再点击重试。'); }
        return;
      }
      if (typeof options.demonstrate === 'function') { try { await options.demonstrate(value, { segmentIndex: index }); } catch (_) { if (valid(token)) setPhase(phase, '示范音未能播放，请检查声音输出后重试。'); } return; }
      if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) { setPhase(phase, '当前浏览器没有英文合成示范能力，请在系统安装英语声音后重试。'); return; }
      let voices = root.speechSynthesis.getVoices().filter(v => /^en([-_]|$)/i.test(v.lang));
      if (!voices.length) { await new Promise(resolve => { const done = () => { root.clearTimeout(wait); root.speechSynthesis.removeEventListener?.('voiceschanged', done); resolve(); }, wait = root.setTimeout(done, 1500); root.speechSynthesis.addEventListener?.('voiceschanged', done, { once: true }); }); voices = root.speechSynthesis.getVoices().filter(v => /^en([-_]|$)/i.test(v.lang)); }
      if (!valid(token)) return; if (!voices.length) { setPhase(phase, '系统未提供英语声音，无法播放正确读音示范。请安装英语语音后重试；本段仍可录音评测。'); return; }
      root.speechSynthesis.cancel(); const utterance = new root.SpeechSynthesisUtterance(value); utterance.voice = voices.find(v => /^en-GB$/i.test(v.lang)) || voices[0]; utterance.lang = utterance.voice.lang; utterance.rate = 0.85;
      utterance.onerror = () => { if (valid(token)) setPhase(phase, '英文合成示范未能完成，请检查声音输出后重试。'); }; root.speechSynthesis.speak(utterance);
    }
    select.addEventListener('change', () => { const next = Number(select.value); if (!Number.isInteger(next) || next < 0 || next >= parts.length || next === index) return; cancel(); index = next; currentBlob = works[index]?.blob || null; showPreview(currentBlob); setPhase('idle', '本段' + (results[index]?.overallPass ? '已通过，可回听或重录。' : '等待录音；结束后会自动评测。')); });
    root.addEventListener?.('ielts:profile-changed', profileChanged); root.addEventListener?.('pagehide', destroy);
    function destroy() { if (disposed) return; cancel(); disposed = true; root.removeEventListener?.('ielts:profile-changed', profileChanged); root.removeEventListener?.('pagehide', destroy); modelPlayback.pause(); modelPlayback.removeAttribute('src'); modelPlayback.load?.(); playback.pause(); if (previewURL) root.URL.revokeObjectURL(previewURL); previewURL = ''; notify(); }
    async function restore() {
      const saved = options.resumeState;
      if (saved === undefined || saved === null) { setPhase('idle', '先听本段示范，再点击开始录音。'); return; }
      // The draft contains IDs only. Never trust its pass flags, scores or AI
      // text; recover each item from the current profile's immutable raw work.
      if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !Array.isArray(saved.workIds) || saved.workIds.length !== parts.length || saved.workIds.some(id => typeof id !== 'string' || id && !/^work-[A-Za-z0-9-]{8,100}$/.test(id)) || new Set(saved.workIds.filter(Boolean)).size !== saved.workIds.filter(Boolean).length || !library?.get) { setPhase('pending', '保存的分段引用与当前材料不匹配。原音仍在作品库，本次请按当前原文重新录音。'); return; }
      if (Number.isInteger(saved.segmentIndex) && saved.segmentIndex >= 0 && saved.segmentIndex < parts.length) index = saved.segmentIndex;
      phase = 'saving'; note = '正在从本机原音作品恢复分段记录…'; render();
      const token = generation; let restored = 0, unavailable = 0;
      for (let i = 0; i < saved.workIds.length; i++) {
        if (!saved.workIds[i]) continue;
        let work; try { work = await library.get(saved.workIds[i]); } catch (_) { unavailable++; continue; }
        if (!valid(token)) return;
        if (!work || work.id !== saved.workIds[i] || work.kind !== 'audio' || work.mode !== 'daily_reading' || work.task !== 'oral_reading' || work.materialId !== (options.materialId || '') || options.dayNumber !== undefined && work.dayNumber !== options.dayNumber || work.originalText !== parts[i] || work.prompt !== parts[i] || !(work.blob instanceof Blob) || !work.blob.size || !/^audio\//.test(work.blob.type) || !Number.isFinite(work.durationSeconds) || work.durationSeconds < 0.1 || work.durationSeconds > 180.1) { unavailable++; continue; }
        works[i] = work; restored++;
        const diagnosis = work.diagnosis;
        if (diagnosis?.provider !== 'Alibaba oral assessment' || diagnosis.result?.text !== parts[i] || !score(diagnosis.result?.accuracy) || typeof diagnosis.evidenceId !== 'string' || !diagnosis.evidenceId || diagnosis.evidenceId.length > 120 || work.evidenceId !== diagnosis.evidenceId) continue;
        const professional = { ...judge(diagnosis.result, required), result: diagnosis.result, provider: diagnosis.provider, evidenceId: diagnosis.evidenceId, archived: true, disclaimer: '来自本机原音作品归档的朗读诊断0–100分，不能换算IELTS Band。' };
        const candidate = work.audioReview, textField = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
        const validCoach = work.queueStatus === 'reviewed' && candidate?.feedbackFormat === 'oral-coach-v1' && candidate.evidenceId === diagnosis.evidenceId && textField(candidate.summary, 1200) && textField(candidate.nextStep, 1200) && textField(candidate.limitations, 800) && Array.isArray(candidate.problems) && candidate.problems.length <= 12 && candidate.problems.every(p => p && textField(p.quote, 6000) && parts[i].toLowerCase().includes(p.quote.toLowerCase()) && p.demonstrationText === p.quote && textField(p.explanation, 1200) && textField(p.practice, 1200));
        const coach = validCoach ? candidate : null;
        results[i] = { professional, coach, coachError: coach ? '' : '本机归档缺少可核对的完整AI说明。需要继续时请重新评测原音，取得当前服务的新证据。', status: coach && professional.pass !== null ? 'complete' : 'pending', overallPass: professional.pass === true && Boolean(coach) };
      }
      if (!valid(token)) return;
      currentBlob = works[index]?.blob || null; showPreview(currentBlob);
      setPhase(results.every(r => r?.overallPass) ? 'complete' : 'pending', restored ? '已从本机作品恢复' + restored + '/' + parts.length + '段原音与已有结果。显示的是归档记录，需要新证据时请重录或重新评测。' + (unavailable ? '另有引用未能匹配当前材料，未恢复为通过。' : '') : '本机未找到与本篇匹配的原音作品。旧引用未作为通过依据，请重新录音。');
    }
    await restore();
    // Mount is awaitable while restoring local works. No remote calls are
    // issued and no archived evidence is announced as a fresh assessment.
    return { destroy, cancel, retry, start: startRecording, stop: stopRecording, submitRecording, demonstrate, getState };
  }
  const api = Object.freeze({ DEFAULT_THRESHOLDS, requiredScores, judge, splitReference, prepareAudio, requestCoach, assessRecording, mistakesFor, mount });
  root.IELTSOralPractice = api; if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
