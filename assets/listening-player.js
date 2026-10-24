(function (root) {
  'use strict';
  const AUDIO_EXTENSIONS = /\.(?:mp3|wav|ogg|m4a|webm|mp4|aac|flac)$/i;
  function safeSource(src, base = root.location?.href) {
    if (typeof src !== 'string' || !src.trim() || src.length > 2048 || /[\\\x00-\x1f\x7f]/.test(src) || /^\s*\/\//.test(src)) throw Error('音频路径无效，须使用本学习包的本地音频。');
    let baseURL, url;
    try { baseURL = new URL(base); url = new URL(src.trim(), baseURL); } catch (_) { throw Error('无法确认音频本地路径。'); }
    if (url.username || url.password || url.hash || !AUDIO_EXTENSIONS.test(url.pathname)) throw Error('音频路径不属于支持的本地音频文件。');
    if (baseURL.protocol === 'file:') {
      const directory = baseURL.pathname.slice(0, baseURL.pathname.lastIndexOf('/') + 1);
      if (url.protocol !== 'file:' || url.host !== baseURL.host || !url.pathname.startsWith(directory)) throw Error('音频必须位于当前学习包目录内。');
    } else if (!/^https?:$/.test(baseURL.protocol) || url.origin !== baseURL.origin || !/^https?:$/.test(url.protocol)) throw Error('音频必须来自当前本机学习服务，不能改用外部网址。');
    return url.href;
  }
  function mediaError(error, playError) {
    const messages = {
      1: '音频读取已中止。请重新载入后播放；本次不会记为已听完。',
      2: '音频网络读取失败或中断。请检查本机学习服务与文件连接，再重新载入；本次不会记为已听完。',
      3: '浏览器无法解码此音频，文件可能不完整或编码不受支持。请重新载入；仍失败时请核对本地文件。',
      4: '音频来源不可用或浏览器不支持此格式。请核对本地文件并重新载入。',
    };
    const code = Number.isInteger(error?.code) && messages[error.code] ? error.code : null;
    if (code) return { code: 'MEDIA_' + code, mediaCode: code, message: messages[code], retryable: true };
    if (playError?.name === 'NotAllowedError') return { code: 'PLAY_NOT_ALLOWED', mediaCode: null, message: '浏览器阻止了播放。请点击播放按钮，并检查本页声音权限与输出设备；本次不会记为已听完。', retryable: true };
    if (playError?.name === 'NotSupportedError') return { code: 'PLAY_NOT_SUPPORTED', mediaCode: null, message: '浏览器不能播放此本地音频。请重新载入；仍失败时请核对文件和浏览器支持的格式。', retryable: true };
    if (playError?.name === 'AbortError') return { code: 'PLAY_ABORTED', mediaCode: null, message: '播放已被中断。请重新载入后再播放；本次不会记为已听完。', retryable: true };
    return { code: 'PLAY_FAILED', mediaCode: null, message: '音频未能开始播放。请检查本机服务、声音输出与浏览器设置，然后重新载入重试。', retryable: true };
  }
  function createCoverage(options = {}) {
    const now = options.now || (() => Date.now()), ranges = []; let anchor = null, jumps = 0;
    function add(start, end) {
      if (end <= start) return;
      ranges.push([start, end]); ranges.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < ranges.length;) { if (ranges[i][0] <= ranges[i - 1][1] + 0.06) { ranges[i - 1][1] = Math.max(ranges[i - 1][1], ranges[i][1]); ranges.splice(i, 1); } else i++; }
    }
    function resetAnchor(time, active = false, rate = 1) { anchor = { time, wall: now(), active, rate }; }
    function sample(time, active, rate = 1) {
      const wall = now(); let jump = false;
      if (anchor && Number.isFinite(time) && Number.isFinite(anchor.time) && anchor.active && active && rate > 0 && Number.isFinite(rate)) {
        const delta = time - anchor.time, elapsed = Math.max(0, (wall - anchor.wall) / 1000), allowed = elapsed * Math.max(anchor.rate, 0.01) + 0.4;
        if (delta >= 0 && delta <= allowed) add(Math.max(0, anchor.time), time);
        else if (Math.abs(delta) > 0.08) { jump = true; jumps++; }
      }
      anchor = { time, wall, active, rate };
      return { jump };
    }
    function state(duration) {
      const covered = ranges.reduce((sum, range) => sum + Math.max(0, Math.min(Number.isFinite(duration) ? duration : Infinity, range[1]) - range[0]), 0);
      const tolerance = Number.isFinite(duration) ? Math.min(0.15, duration * 0.01) : 0;
      const complete = Number.isFinite(duration) && duration >= 0.1 && ranges.length === 1 && ranges[0][0] <= tolerance && ranges[0][1] >= duration - tolerance && covered >= duration - tolerance;
      return { ranges: ranges.map(r => r.slice()), coveredSeconds: covered, durationSeconds: Number.isFinite(duration) ? duration : null, complete, jumps };
    }
    return { sample, resetAnchor, state, clear() { ranges.length = 0; anchor = null; jumps = 0; } };
  }
  function mount(host, options = {}) {
    if (!host || !root.document) throw Error('听力播放器缺少挂载位置。');
    const doc = root.document, assessment = options.assessment === true, coverage = createCoverage({ now: options.now });
    let source = '', disposed = false, generation = 0, reloads = 0, phase = 'ready', available = false, complete = false, successful = false, ended = false, playing = false, failed = false, stalled = false, requesting = false, lastError = null, assistance = new Set();
    function node(tag, className, text) { const element = doc.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
    const box = node('div', 'listening-player'), audio = node('audio', 'listening-player-audio'), controls = node('div', 'course-audio-controls'), playButton = node('button', '', '播放听力'), reloadButton = node('button', '', '重新载入并重试'), status = node('p', 'course-small');
    audio.preload = 'metadata'; audio.controls = !assessment; playButton.type = reloadButton.type = 'button'; reloadButton.hidden = true; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    controls.append(playButton, reloadButton); box.append(audio, controls, status); host.replaceChildren(box);
    const listeners = [];
    function listen(name, handler) { audio.addEventListener(name, handler); listeners.push([name, handler]); }
    function callback(name, ...args) { try { options[name]?.(...args); } catch (_) {} }
    function help(reason) { if (!assistance.has(reason)) { assistance.add(reason); callback('onAssistance', 'hint', { reason }); } }
    function setAvailable(value, detail = {}) { if (available === value) return; available = value; callback('onAvailable', value, detail); }
    function setComplete(value, detail = {}) { if (complete === value) return; complete = value; callback('onComplete', value, { ...detail, coverage: coverage.state(audio.duration) }); }
    function render(message) {
      if (message !== undefined) status.textContent = message;
      status.dataset.phase = phase; playButton.disabled = disposed || requesting || assessment && successful && !failed && (phase !== 'paused' || audio.ended); reloadButton.hidden = !failed && !stalled; reloadButton.disabled = disposed || requesting && !stalled;
      playButton.textContent = failed ? '重新尝试播放' : phase === 'paused' && successful ? '继续播放听力' : assessment && successful ? '本次测评已开始播放' : '播放听力';
    }
    function audible() { return !audio.muted && audio.volume > 0; }
    function sample(active = playing, closingInterval = false) {
      const result = coverage.sample(audio.currentTime, active && (closingInterval || !audio.paused) && !audio.seeking && audible(), audio.playbackRate);
      if (result.jump) help('seek'); return result;
    }
    function invalidate(detail) { available = false; complete = false; callback('onAvailable', false, detail); callback('onComplete', false, { ...detail, coverage: coverage.state(audio.duration) }); }
    function fail(error, playError) {
      if (disposed) return;
      lastError = mediaError(error, playError); failed = true; requesting = false; phase = 'error'; playing = false; coverage.resetAnchor(audio.currentTime, false, audio.playbackRate); invalidate(lastError); render(lastError.message); callback('onError', lastError);
    }
    function beganPlaying() {
      if (disposed || failed || audio.paused) return;
      if (assessment && ended) { audio.pause(); render('本次测评已用完一次播放。请保留题目作答；不能重放计为独立听力。'); return; }
      if (!playing) coverage.resetAnchor(audio.currentTime, audible(), audio.playbackRate);
      playing = true; requesting = false; successful = true; ended = false; stalled = false; phase = 'playing'; setAvailable(true, { reason: 'playing' });
      render(audible() ? '正在播放。只有实际完整听完才会记为已听完。' : '当前音频静音或音量为零，静音时段不会记入完整听音。');
    }
    async function play() {
      if (disposed || requesting || assessment && successful && !failed && (phase !== 'paused' || audio.ended || ended)) return false;
      const token = generation;
      if (failed) return reload(true);
      if (ended && !assessment) help('replay');
      requesting = true; phase = 'loading'; render('正在载入本地听力音频…');
      try { await audio.play(); if (disposed || token !== generation) return false; if (!audio.paused && !audio.error) beganPlaying(); return !failed && !audio.paused; }
      catch (error) { if (!disposed && token === generation) { if (error.name === 'AbortError' && phase === 'paused') { requesting = false; render('已暂停。请通过播放按钮从原位置继续。'); } else fail(audio.error, error); } return false; }
    }
    function pause() { if (disposed) return; audio.pause(); requesting = false; if (!ended && !failed) { phase = 'paused'; render('已暂停，已实际播放的时段保留。请通过播放按钮从原位置继续。'); } }
    function reload(autoPlay = true) {
      if (disposed || !source || assessment && successful && !failed && !stalled) return Promise.resolve(false);
      if (successful || coverage.state(audio.duration).coveredSeconds > 0) help('retry-after-partial');
      generation++; requesting = false; playing = false; audio.pause();
      coverage.clear(); invalidate({ reason: 'reload' }); successful = false; ended = false; failed = false; stalled = false; lastError = null; phase = 'loading';
      const url = new URL(source); url.searchParams.set('_ielts_audio_retry', String((options.now || Date.now)()) + '-' + (++reloads)); audio.src = url.href; audio.load(); render('已重新载入本地文件，正在重试；不会把失败播放记为已听。');
      return autoPlay ? play() : Promise.resolve(true);
    }
    listen('play', () => {
      if (disposed) return;
      // Native controls bypass the custom button. PLAY records a pending start;
      // PLAYING (or a fulfilled play promise) confirms audio actually started.
      if (assessment && ended) { audio.pause(); return; }
      if (ended && !assessment) help('replay'); phase = 'loading'; render('音频已请求播放，正在等待实际开始…');
    });
    listen('playing', beganPlaying);
    listen('timeupdate', () => { if (!disposed) sample(); });
    listen('pause', () => { if (disposed) return; sample(playing, true); playing = false; requesting = false; if (!ended && !failed) { phase = 'paused'; render('已暂停。继续听完所有时段后才会记为已听完。'); } });
    listen('waiting', () => { if (!disposed && !failed) { sample(); stalled = true; render('正在缓冲本地音频，尚未完整听完。若一直无声音，可重新载入重试。'); } });
    listen('stalled', () => { if (!disposed && !failed) { stalled = true; render('音频读取暂时停顿。请等待；若仍无声音，可重新载入重试。'); } });
    listen('seeking', () => { if (disposed) return; help('seek'); coverage.resetAnchor(audio.currentTime, false, audio.playbackRate); setComplete(false, { reason: 'seek' }); });
    listen('seeked', () => { if (!disposed) coverage.resetAnchor(audio.currentTime, playing && audible(), audio.playbackRate); });
    listen('ratechange', () => { if (disposed) return; sample(); if (audio.playbackRate !== 1) help('rate'); coverage.resetAnchor(audio.currentTime, playing && audible(), audio.playbackRate); });
    listen('volumechange', () => { if (disposed) return; sample(); coverage.resetAnchor(audio.currentTime, playing && audible(), audio.playbackRate); if (!audible() && playing) render('当前音频静音或音量为零，静音时段不会记入完整听音。'); });
    listen('ended', () => {
      if (disposed || failed) return;
      sample(playing, true); playing = false; requesting = false; ended = true; stalled = false; phase = 'ended';
      const report = coverage.state(audio.duration);
      if (available && report.complete) { setComplete(true, { reason: 'complete-coverage' }); render('本次音频已实际完整播放到结尾。'); }
      else { setComplete(false, { reason: 'incomplete-coverage' }); render('已到结尾，但仍有未实际听到的时段；本次不记为完整听完。' + (assessment ? '请保留题目完成作答，再按练习材料重听。' : '请重新从头播放。')); }
    });
    listen('error', () => fail(audio.error));
    playButton.addEventListener('click', play); reloadButton.addEventListener('click', () => reload(true));
    try { source = safeSource(options.src, options.baseURL || root.location?.href); audio.src = source; render(assessment ? '测评只开放一次成功播放。音频失败可明确重新载入；失败不记为已听完。' : '练习可使用音频控件播放。完整听音按实际播放时段核对，跳到结尾不算听完。'); }
    catch (error) { lastError = { code: 'INVALID_SOURCE', mediaCode: null, message: error.message, retryable: false }; failed = true; phase = 'error'; invalidate(lastError); render(error.message); playButton.disabled = true; reloadButton.hidden = true; callback('onError', lastError); }
    function destroy() {
      if (disposed) return; disposed = true; generation++; playing = false; requesting = false;
      for (const [name, handler] of listeners) audio.removeEventListener(name, handler);
      audio.pause(); audio.removeAttribute('src'); audio.load(); phase = 'destroyed'; render();
    }
    return { destroy, play, pause, reload, getState: () => ({ phase, available, complete, successful, assessment, failed, error: lastError, coverage: coverage.state(audio.duration), disposed }) };
  }
  const api = Object.freeze({ mount, safeSource, mediaError, createCoverage }); root.IELTSListeningPlayer = api; if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
