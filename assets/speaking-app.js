'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const { limitsFor, validDuration, formatTime, encodeWav } = globalThis.IELTSSpeakingAudio;
  const lessons = Array.isArray(globalThis.IELTSCourse?.lessons) ? globalThis.IELTSCourse.lessons : [];
  const localService = location.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const canRecord = Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder && AudioContextClass && OfflineContextClass);
  const foundationSentences = ['Hello. My name is Lin.', 'I am learning English.', 'I live in a city.', 'I work from home.', 'I study every day.', 'This is my book.', 'I have a question.', 'Please say that again.', 'I do not understand.', 'Thank you for your help.'];
  const freePrompts = {
    foundation: '零基础：先说 2–3 句，不要求说满一分钟。\n1. Hello. My name is …（你好，我叫……）\n2. I live in …（我住在……）\n3. I am learning English.（我正在学习英语。）\n\n用自己的信息替换省略号；说完回听，再遮住示例试一次。',
    part1: '1. What do you enjoy about the place where you live?\n2. How do you usually organise your study time?\n3. Do you prefer learning alone or with other people? Why?\n\n每次选一道题，用直接回答 + 一个细节练习。',
    part2: 'Describe a skill you would like to learn.\nYou should say:\n• what the skill is\n• why you want to learn it\n• how you would practise it\nand explain how it could change your daily life.\n\n先准备 1 分钟，再连续陈述 1–2 分钟。本页支持最长 3 分钟录音，无需拆段。',
    part3: '1. Why do some adults find it difficult to continue learning?\n2. How can communities make learning more accessible?\n3. Should employers give workers time to learn new skills?\n\n每次选一道，用观点 + 理由 + 例子展开，不背整段答案。',
  };
  let sentences = [];
  let phase = 'idle';
  let stream = null;
  let recorder = null;
  let recordStarted = 0;
  let activeRecordLimit = 25;
  let recordTimer = null;
  let displayTimer = null;
  let generation = 0;
  let audioContext = null;
  let cancelProbe = null;
  let audioUrl = '';
  let wavBytes = null;
  let referenceAtRecording = '';
  let modeAtRecording = '';
  let speechConfig = null;
  let requestController = null;
  let serviceBusy = false;
  let disposed = false;

  function note(id, text, tone = '') { $(id).textContent = text; $(id).dataset.tone = tone; }
  function wordCount(text) { return text.trim() ? text.trim().split(/\s+/).length : 0; }
  function referenceValid() {
    const text = $('referenceText').value.trim();
    return text.length >= 2 && text.length <= 1000 && wordCount(text) <= 80;
  }
  function controls() {
    const locked = phase !== 'idle' || serviceBusy;
    const reading = $('speakingMode').value === 'reading';
    const invalidReference = reading && !referenceValid();
    ['speakingLesson', 'speakingSentence', 'referenceText', 'speakingPart', 'audioImport'].forEach(id => { $(id).disabled = locked; });
    $('speakingMode').disabled = serviceBusy;
    $('recordStart').disabled = locked || !canRecord || invalidReference;
    $('audioImport').disabled = locked || invalidReference;
    $('referenceInvalid').hidden = !invalidReference;
    $('referenceText').setAttribute('aria-invalid', String(invalidReference));
    $('recordStop').disabled = !['requesting', 'recording'].includes(phase);
    ['speechEndpoint', 'speechKey', 'saveSpeechConfig', 'refreshSpeech', 'disconnectSpeech'].forEach(id => { $(id).disabled = serviceBusy || !localService; });
    $('assessSpeech').disabled = locked || !localService || !speechConfig?.configured || !wavBytes || $('speakingMode').value !== 'reading' || !referenceValid();
    $('cancelSpeech').hidden = !requestController;
    $('recordDot').dataset.recording = String(phase === 'recording');
    $('recordHelp').textContent = reading ? '建议每段 10–25 秒；25 秒自动停止并关闭麦克风。也可导入不超过 30 秒的本地音频。' :
      '自由口语可连续录音或导入最长 3 分钟音频；03:00 自动停止并关闭麦克风。Part 2 建议连续陈述 1–2 分钟。';
    $('assessSpeech').textContent = reading ? '发送录音进行发音评测' : '自由口语不发送发音评测';
    $('speechEmpty').textContent = reading ? '录一段短句，先回听，再决定是否评测。' : '自由口语仅在本机录音、回听和下载，不会调用发音评测接口。';
  }
  function clearResult() { $('speechResults').hidden = true; $('speechEmpty').hidden = false; $('speechWords').replaceChildren(); $('speechScores').replaceChildren(); }
  function clearAudio() {
    $('recordPlayback').pause(); $('recordPlayback').removeAttribute('src'); $('recordPlayback').load();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = ''; wavBytes = null; referenceAtRecording = ''; modeAtRecording = '';
    $('audioDownload').removeAttribute('href'); $('playbackSection').hidden = true;
    clearResult(); controls();
  }
  function stopTracks() { stream?.getTracks().forEach(track => track.stop()); stream = null; }
  function stopTimers() { clearTimeout(recordTimer); clearInterval(displayTimer); recordTimer = null; displayTimer = null; }
  function clock() {
    const seconds = Math.min(activeRecordLimit, (Date.now() - recordStarted) / 1000);
    $('recordClock').textContent = formatTime(seconds);
  }
  function cancelCapture() {
    generation++;
    const previousRecorder = recorder; recorder = null;
    stopTimers(); stopTracks();
    if (previousRecorder && previousRecorder.state !== 'inactive') previousRecorder.stop();
    cancelProbe?.(); cancelProbe = null;
    audioContext?.close().catch(() => {}); audioContext = null;
    phase = 'idle'; $('recordStatus').textContent = '准备录音'; $('recordClock').textContent = '00:00';
  }
  function splitSentences(text) {
    if (typeof Intl.Segmenter === 'function') return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)].map(item => item.segment.trim()).filter(Boolean);
    return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map(s => s.trim()).filter(Boolean);
  }
  function renderSentences() {
    const lesson = lessons.find(item => String(item.day) === $('speakingLesson').value);
    sentences = $('speakingLesson').value === 'foundation' ? foundationSentences.slice() : splitSentences(lesson?.text || '');
    $('speakingSentence').replaceChildren();
    sentences.forEach((sentence, i) => {
      const option = document.createElement('option'); option.value = String(i);
      option.textContent = String(i + 1).padStart(2, '0') + ' · ' + sentence.slice(0, 45) + (sentence.length > 45 ? '…' : '');
      $('speakingSentence').append(option);
    });
    $('referenceText').value = sentences[0] || 'I am learning English a little every day.';
    clearAudio();
  }
  function changeMode() {
    cancelCapture(); requestController?.abort('mode');
    const reading = $('speakingMode').value === 'reading';
    $('readingControls').hidden = !reading; $('freeControls').hidden = reading;
    $('freePrompt').textContent = freePrompts[$('speakingPart').value];
    clearAudio();
    note('recordMessage', reading ? '先读清参考句，再开始录音。' : '自由回答只在本机录音回听，不进行发音评测。');
  }
  async function prepareAudio(blob, expectedGeneration, selectedReference, selectedMode, recorded = false) {
    if (!AudioContextClass || !OfflineContextClass) throw new Error('此浏览器不支持音频格式转换，请换用近期 Chrome 或 Edge。');
    const decodeContext = new AudioContextClass(); audioContext = decodeContext;
    let decoded;
    try { decoded = await decodeContext.decodeAudioData(await blob.arrayBuffer()); }
    finally { await decodeContext.close().catch(() => {}); if (audioContext === decodeContext) audioContext = null; }
    if (disposed || generation !== expectedGeneration) return;
    // Timer callbacks can run slightly late. Trim recordings at their mode limit; imports remain strict.
    const duration = recorded && Number.isFinite(decoded.duration) ? Math.min(decoded.duration, limitsFor(selectedMode).recordSeconds) : decoded.duration;
    if (!validDuration(duration, selectedMode)) throw new Error('当前模式仅支持 0.1–' + limitsFor(selectedMode).importSeconds + ' 秒音频。');
    const frames = Math.floor(duration * 16000);
    const offline = new OfflineContextClass(1, frames, 16000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    const rendered = await offline.startRendering();
    if (disposed || generation !== expectedGeneration) return;
    wavBytes = encodeWav(rendered.getChannelData(0));
    referenceAtRecording = selectedReference; modeAtRecording = selectedMode;
    audioUrl = URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }));
    $('recordPlayback').src = audioUrl;
    $('audioDownload').href = audioUrl;
    $('audioDownload').download = 'IELTS口语练习-' + new Date().toISOString().replace(/[:.]/g, '-') + '.wav';
    $('audioInfo').textContent = formatTime(duration) + '（' + duration.toFixed(1) + ' 秒）· 16 kHz · 单声道 PCM WAV';
    $('playbackSection').hidden = false;
    $('recordStatus').textContent = '录音已就绪';
    note('recordMessage', '音频已在本地准备好。先回听；需要保留时请主动下载。');
  }
  async function startRecording() {
    if (phase !== 'idle' || serviceBusy || !canRecord) return;
    if ($('speakingMode').value === 'reading' && !referenceValid()) { note('recordMessage', '请将参考文本控制在 1–80 个英语单词内。', 'error'); return; }
    const thisGeneration = ++generation;
    const selectedReference = $('referenceText').value.trim(), selectedMode = $('speakingMode').value;
    clearAudio(); phase = 'requesting'; controls();
    $('recordStatus').textContent = '等待麦克风权限'; $('recordClock').textContent = '00:00';
    try {
      const receivedStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (generation !== thisGeneration || disposed) { receivedStream.getTracks().forEach(track => track.stop()); return; }
      stream = receivedStream;
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(value => MediaRecorder.isTypeSupported(value));
      const currentRecorder = new MediaRecorder(stream, type ? { mimeType: type } : {});
      recorder = currentRecorder;
      const chunks = [];
      currentRecorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
      currentRecorder.onerror = () => { if (generation !== thisGeneration || disposed) return; note('recordMessage', '录音失败，请检查麦克风或换用近期 Chrome / Edge。', 'error'); stopRecording(); };
      currentRecorder.onstop = async () => {
        if (generation !== thisGeneration || disposed) return;
        stopTimers(); stopTracks(); recorder = null;
        phase = 'processing'; $('recordStatus').textContent = '正在整理本地音频'; controls();
        try { await prepareAudio(new Blob(chunks, { type: currentRecorder.mimeType }), thisGeneration, selectedReference, selectedMode, true); }
        catch (error) { if (generation !== thisGeneration || disposed) return; note('recordMessage', error.message || '无法处理这段录音，请重新录制。', 'error'); $('recordStatus').textContent = '请重新录音'; }
        finally { if (generation === thisGeneration) { phase = 'idle'; controls(); } }
      };
      currentRecorder.start(1000); recordStarted = Date.now(); phase = 'recording';
      activeRecordLimit = limitsFor(selectedMode).recordSeconds;
      $('recordStatus').textContent = '正在录音'; note('recordMessage', '麦克风已开启，' + formatTime(activeRecordLimit) + ' 时自动停止。录音尚未发送。');
      displayTimer = setInterval(clock, 250); recordTimer = setTimeout(stopRecording, activeRecordLimit * 1000); controls();
    } catch (error) {
      if (generation !== thisGeneration || disposed) return;
      stopTimers(); stopTracks(); recorder = null;
      phase = 'idle'; $('recordStatus').textContent = '未能开始录音';
      note('recordMessage', error.name === 'NotAllowedError' ? '麦克风权限未获允许。请在浏览器站点权限中允许麦克风，或导入本地短音频。' : '无法使用麦克风。请检查设备、浏览器权限，或导入本地音频。', 'error');
      controls();
    }
  }
  function stopRecording() {
    if (phase === 'requesting') { generation++; phase = 'idle'; stopTracks(); $('recordStatus').textContent = '已取消麦克风请求'; controls(); return; }
    if (recorder && recorder.state !== 'inactive') {
      clock(); phase = 'processing'; recorder.stop(); stopTimers(); stopTracks(); controls();
    }
  }
  async function fileDuration(file, selectedMode) {
    return new Promise((resolve, reject) => {
      const probe = document.createElement('audio'), url = URL.createObjectURL(file);
      const timer = setTimeout(() => done(new Error('无法确认音频时长，请导入短 WAV 或 MP3 文件。')), 7000);
      const cancel = () => done(new Error('音频导入已取消。')); cancelProbe = cancel;
      function done(error) { clearTimeout(timer); if (cancelProbe === cancel) cancelProbe = null; probe.onloadedmetadata = null; probe.onerror = null; probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(url); error ? reject(error) : resolve(); }
      probe.onloadedmetadata = () => done(!validDuration(probe.duration, selectedMode) ? new Error('当前模式导入音频需不超过 ' + limitsFor(selectedMode).importSeconds + ' 秒；无法确认时长时请先转换为 WAV 文件。') : null);
      probe.onerror = () => done(new Error('浏览器无法读取这份音频，请使用 WAV 或 MP3 格式。'));
      probe.preload = 'metadata'; probe.src = url;
    });
  }
  async function importAudio(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || phase !== 'idle' || serviceBusy) return;
    if (file.size > 20 * 1024 * 1024) { note('recordMessage', '文件过大，请选择不超过 20 MB、' + limitsFor($('speakingMode').value).importSeconds + ' 秒的音频。', 'error'); return; }
    if ($('speakingMode').value === 'reading' && !referenceValid()) { note('recordMessage', '请先填写准确的短句参考文本。', 'error'); return; }
    const thisGeneration = ++generation, selectedReference = $('referenceText').value.trim(), selectedMode = $('speakingMode').value;
    clearAudio(); phase = 'processing'; $('recordStatus').textContent = '正在读取本地音频'; controls();
    try { await fileDuration(file, selectedMode); if (generation !== thisGeneration || disposed) return; await prepareAudio(file, thisGeneration, selectedReference, selectedMode); }
    catch (error) { if (generation !== thisGeneration || disposed) return; note('recordMessage', error.message || '无法处理此音频，请使用 WAV 文件。', 'error'); $('recordStatus').textContent = '请重新选择音频'; }
    finally { if (generation === thisGeneration) { phase = 'idle'; controls(); } }
  }
  async function speechRequest(path, body, method = body ? 'POST' : 'GET', signal) {
    const response = await fetch('/api/speech/' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal });
    let data; try { data = await response.json(); } catch { throw new Error('本地语音服务返回格式无效，请重启后重试。'); }
    if (!response.ok || !data.ok) throw new Error(typeof data.error?.message === 'string' ? data.error.message : '语音服务请求失败。');
    return data;
  }
  function showConfig(data) {
    speechConfig = data;
    $('speechConfigStatus').textContent = data.configured ? '已保存配置，尚未验证 · ' + data.endpoint : '尚未配置独立的 Azure Speech 资源';
    $('speechEndpoint').value = data.endpoint || '';
    $('speechDisclosure').textContent = '点击“发送录音进行发音评测”，会将当前参考句和录音发送至 ' + (data.configured ? data.endpoint : '你配置的 Azure Speech 资源') + '，可能产生费用，服务商按其规则处理内容。';
    controls();
  }
  async function refreshSpeech() {
    if (!localService) { $('speechConfigStatus').textContent = '语音评测需通过“启动学习.cmd”打开本地服务。录音回听仍可本地使用。'; controls(); return; }
    try { showConfig(await speechRequest('status', undefined, 'GET', AbortSignal.timeout(8000))); }
    catch { speechConfig = null; $('speechConfigStatus').textContent = '本地服务不可用，请启动或重启学习服务后刷新。'; controls(); }
  }
  async function configure(event) {
    event.preventDefault(); if (!localService || serviceBusy) return;
    serviceBusy = true; controls();
    try {
      const result = await speechRequest('configure', { endpoint: $('speechEndpoint').value.trim(), apiKey: $('speechKey').value.trim() }, 'POST', AbortSignal.timeout(10000));
      showConfig(result); note('speechMessage', '语音配置已保存在本地服务内存中；尚未向 Azure 验证。');
    } catch (error) { note('speechMessage', error.message, 'error'); }
    finally { $('speechKey').value = ''; serviceBusy = false; controls(); }
  }
  function encodedAudio() {
    const chunks = [];
    for (let i = 0; i < wavBytes.length; i += 32768) chunks.push(String.fromCharCode(...wavBytes.subarray(i, i + 32768)));
    return btoa(chunks.join(''));
  }
  function scoreLabel(value) { return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '未提供'; }
  function renderResult(data) {
    const result = data.result;
    $('speechScores').replaceChildren();
    [['accuracy', '准确度'], ['fluency', '朗读流利度'], ['completeness', '完整度'], ['pronunciation', '综合发音诊断']].forEach(([key, label]) => {
      const card = document.createElement('div'); card.className = 'speech-score';
      const title = document.createElement('span'); title.textContent = label;
      const value = document.createElement('strong'); value.textContent = scoreLabel(result[key]);
      card.append(title, value); $('speechScores').append(card);
    });
    $('speechRecognized').textContent = result.text || '服务未返回识别文本。';
    $('speechDisclaimer').textContent = data.disclaimer + ' 本次评测语言：' + data.language + '。';
    $('speechWords').replaceChildren();
    const errorLabels = { None: '未标记错误', Omission: '疑似漏读', Insertion: '疑似多读', Mispronunciation: '疑似读音偏差', Unknown: '未提供错误分类' };
    (result.words || []).forEach(word => {
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = word.word + ' · ' + scoreLabel(word.accuracy) + ' · ' + (errorLabels[word.error] || errorLabels.Unknown);
      details.append(summary);
      const phonemes = document.createElement('div'); phonemes.className = 'speech-phonemes';
      (word.phonemes || []).forEach(item => { const span = document.createElement('span'); span.textContent = item.phoneme + '：' + scoreLabel(item.accuracy); phonemes.append(span); });
      if (!word.phonemes?.length) { const p = document.createElement('p'); p.textContent = '本词未返回音素分数。'; details.append(p); }
      details.append(phonemes); $('speechWords').append(details);
    });
    if (!result.words?.length) { const p = document.createElement('p'); p.textContent = '服务未返回逐词明细。'; $('speechWords').append(p); }
    $('speechResults').hidden = false; $('speechEmpty').hidden = true;
  }
  async function assess() {
    if (serviceBusy || phase !== 'idle' || !wavBytes || !speechConfig?.configured || $('speakingMode').value !== 'reading') return;
    if (modeAtRecording !== 'reading' || referenceAtRecording !== $('referenceText').value.trim()) { note('speechMessage', '参考文本已改变，请按新文本重新录音。', 'error'); return; }
    requestController = new AbortController(); serviceBusy = true; controls();
    const timer = setTimeout(() => requestController?.abort('timeout'), 65000);
    note('speechMessage', '已发送短句与录音，正在等待 Azure 评测（最多约 60 秒）…', 'pending');
    try {
      const result = await speechRequest('assess', { reference: referenceAtRecording, audio: encodedAudio() }, 'POST', requestController.signal);
      renderResult(result); note('speechMessage', '本次诊断已返回。选一个具体问题重练，并用回听核对。');
    } catch (error) {
      if (requestController?.signal.aborted) note('speechMessage', requestController.signal.reason === 'timeout' ? '请求超时，录音仍在本页，可回听或下载。' : '已取消等待；录音仍在本页。已发送的音频可能已被服务商处理或计费。');
      else note('speechMessage', error.message, 'error');
    } finally { clearTimeout(timer); requestController = null; serviceBusy = false; controls(); }
  }
  const starterOption = document.createElement('option'); starterOption.value = 'foundation'; starterOption.textContent = '零基础 · 10 个生活短句'; $('speakingLesson').append(starterOption);
  lessons.forEach(lesson => { const option = document.createElement('option'); option.value = String(lesson.day); option.textContent = '第 ' + lesson.day + ' 篇 · ' + lesson.cn; $('speakingLesson').append(option); });
  const day = Number(new URLSearchParams(location.search).get('day') || 0);
  if (lessons.some(lesson => lesson.day === day)) $('speakingLesson').value = String(day);
  renderSentences(); $('freePrompt').textContent = freePrompts[$('speakingPart').value] || freePrompts.foundation;
  $('recordSupport').textContent = canRecord ? '点击开始后浏览器才会申请麦克风权限。音频格式转换在本机完成。' : '当前浏览器不支持完整录音能力，或页面不在安全环境。请用近期 Chrome / Edge 通过 localhost 打开；支持音频解码时也可导入本地短音频。';
  $('speakingMode').addEventListener('change', changeMode);
  $('speakingLesson').addEventListener('change', renderSentences);
  $('speakingSentence').addEventListener('change', () => { $('referenceText').value = sentences[Number($('speakingSentence').value)] || ''; clearAudio(); });
  $('referenceText').addEventListener('input', () => { if (wavBytes) note('recordMessage', '参考文本已改变，旧录音已释放，请重新录音。'); clearAudio(); });
  $('speakingPart').addEventListener('change', () => { $('freePrompt').textContent = freePrompts[$('speakingPart').value]; clearAudio(); });
  $('recordStart').addEventListener('click', startRecording); $('recordStop').addEventListener('click', stopRecording);
  $('audioImport').addEventListener('change', importAudio);
  $('speechConfigForm').addEventListener('submit', configure); $('refreshSpeech').addEventListener('click', refreshSpeech);
  $('disconnectSpeech').addEventListener('click', async () => {
    if (serviceBusy || !localService) return;
    serviceBusy = true; controls();
    try { showConfig(await speechRequest('connection', undefined, 'DELETE', AbortSignal.timeout(10000))); note('speechMessage', '本地服务中的语音密钥已清除。'); }
    catch (error) { note('speechMessage', error.message, 'error'); }
    finally { $('speechKey').value = ''; serviceBusy = false; controls(); }
  });
  $('assessSpeech').addEventListener('click', assess); $('cancelSpeech').addEventListener('click', () => requestController?.abort('user'));
  window.addEventListener('pagehide', () => {
    disposed = true; cancelCapture();
    requestController?.abort('leave'); clearAudio(); $('speechKey').value = '';
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    disposed = false; phase = 'idle'; recorder = null; requestController = null; serviceBusy = false;
    $('recordStatus').textContent = '准备录音'; $('recordClock').textContent = '00:00'; controls(); refreshSpeech();
  });
  controls(); refreshSpeech();
})();
