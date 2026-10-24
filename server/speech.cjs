'use strict';
const { BudgetError } = require('./budget.cjs');
// Azure short-audio pronunciation REST: see docs/语音评测.md. No credential or audio persistence.
function checkWav(buffer) {
  if (buffer.length < 46 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw Error('请选择或录制 PCM WAV 音频。');
  if (buffer.readUInt32LE(4) + 8 !== buffer.length) throw Error('WAV 文件长度无效。');
  let format, dataSize = 0, formatCount = 0, dataCount = 0, offset = 12;
  for (; offset + 8 <= buffer.length;) {
    const name = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > buffer.length) throw Error('WAV 文件不完整。');
    if (name === 'fmt ') {
      formatCount++;
      if (size < 16) throw Error('WAV 格式信息不完整。');
      format = [buffer.readUInt16LE(start), buffer.readUInt16LE(start + 2), buffer.readUInt32LE(start + 4), buffer.readUInt16LE(start + 14)];
      if (buffer.readUInt32LE(start + 8) !== 32000 || buffer.readUInt16LE(start + 12) !== 2) throw Error('WAV 音频采样参数无效。');
    }
    if (name === 'data') { dataCount++; dataSize += size; }
    offset = start + size + (size % 2);
  }
  if (offset !== buffer.length || formatCount !== 1 || dataCount !== 1 || !format || format.join() !== '1,1,16000,16' || dataSize < 3200 || dataSize > 960000 || dataSize % 2) throw Error('音频须为 0.1–30 秒、16 kHz、单声道、16-bit PCM WAV。');
  return dataSize / 32000;
}
const score = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
function normalizeResult(body) {
  const best = body?.NBest?.[0];
  if (body?.RecognitionStatus !== 'Success' || !best) throw Error('没有识别到清晰的英语朗读，请检查录音后重试。');
  const scores = best.PronunciationAssessment || best;
  if (score(scores.AccuracyScore) === null) throw Error('服务未返回发音评测结果，请检查服务配置。');
  return { text: String(best.Display || body.DisplayText || '').slice(0, 3000), accuracy: score(scores.AccuracyScore), fluency: score(scores.FluencyScore), completeness: score(scores.CompletenessScore), pronunciation: score(scores.PronScore), words: (Array.isArray(best.Words) ? best.Words : []).slice(0, 150).map(w => {
    const p = w.PronunciationAssessment || w;
    return { word: String(w.Word || '').slice(0, 100), accuracy: score(p.AccuracyScore), error: ['None','Omission','Insertion','Mispronunciation'].includes(p.ErrorType) ? p.ErrorType : 'Unknown', phonemes: (Array.isArray(w.Phonemes) ? w.Phonemes : []).slice(0, 40).map(p => ({ phoneme: String(p.Phoneme || '').slice(0, 40), accuracy: score((p.PronunciationAssessment || p).AccuracyScore) })) };
  }) };
}
function createSpeechHandler({ fetchImpl = fetch, timeoutMs = 60000, budget } = {}) {
  let config = null, busy = false, controller = null;
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const status = () => ({ ok: true, configured: Boolean(config), endpoint: config?.endpoint || '', credentialStorage: 'memory', verified: false });
  async function body(req) {
    if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') throw Error('请使用 JSON 提交。');
    if (Number(req.headers['content-length']) > 1400000) { req.resume(); throw Error('录音过大，请控制在 30 秒内。'); }
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 1400000) throw Error('录音过大，请控制在 30 秒内。'); chunks.push(chunk); }
    try { const result = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error(); return result; } catch { throw Error('提交格式无效。'); }
  }
  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/speech/')) return false;
    let ownController;
    try {
      if (pathname === '/api/speech/status' && req.method === 'GET') send(res, 200, status());
      else if (pathname === '/api/speech/connection' && req.method === 'DELETE') { config = null; controller?.abort(); send(res, 200, status()); }
      else if (pathname === '/api/speech/configure' && req.method === 'POST') {
        const b = await body(req); let u;
        try { u = new URL(b.endpoint); } catch { throw Error('请填写 Azure Speech 资源的 HTTPS endpoint。'); }
        if (u.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.cognitiveservices\.azure\.com$/.test(u.hostname) || u.port || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw Error('请使用 https://资源名.cognitiveservices.azure.com 格式的资源 endpoint。');
        if (typeof b.apiKey !== 'string' || !/^[a-zA-Z0-9]{16,128}$/.test(b.apiKey)) throw Error('请填写该 Speech 资源的密钥。');
        if (u.origin.includes(b.apiKey)) throw Error('请将语音密钥单独填写，不要写入地址。');
        controller?.abort(); config = { endpoint: u.origin, apiKey: b.apiKey }; send(res, 200, status());
      } else if (pathname === '/api/speech/assess' && req.method === 'POST') {
        if (!config) { send(res, 409, { ok:false,error:{code:'SPEECH_NOT_CONFIGURED',message:'请先配置独立的 Azure Speech 服务。DeepSeek 密钥不能用于发音评测。'} }); return true; }
        if (busy) { send(res, 429, { ok:false,error:{code:'BUSY',message:'已有发音评测正在进行，请稍后再试。'} }); return true; }
        busy = true; ownController = controller = new AbortController();
        const b = await body(req);
        if (typeof b.reference !== 'string' || b.reference.trim().length < 2 || b.reference.length > 1000 || b.reference.trim().split(/\s+/).length > 80) throw Error('参考文本应为 1–80 个英语单词的短句。');
        if (typeof b.audio !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.audio) || b.audio.length > 1300000) throw Error('录音格式无效或过大。');
        const audio = Buffer.from(b.audio, 'base64');
        if (audio.toString('base64') !== b.audio) throw Error('录音编码无效。');
        const seconds = checkWav(audio);
        const active = config;
        const ticket = budget?.reserveSpeech(active, seconds);
        const timer = setTimeout(() => ownController.abort(), timeoutMs);
        const cancel = () => { if (!res.writableEnded) ownController.abort(); }; res.once('close', cancel);
        try {
          const upstream = await fetchImpl(active.endpoint + '/stt/speech/recognition/conversation/cognitiveservices/v1?language=en-GB&format=detailed', { method:'POST',redirect:'error',signal:ownController.signal, headers:{ 'Ocp-Apim-Subscription-Key':active.apiKey, 'Content-Type':'audio/wav; codecs=audio/pcm; samplerate=16000', Accept:'application/json', 'Pronunciation-Assessment':Buffer.from(JSON.stringify({ReferenceText:b.reference.trim(),GradingSystem:'HundredMark',Granularity:'Phoneme',Dimension:'Comprehensive',EnableMiscue:'True'})).toString('base64') },body:audio });
          if (!upstream.ok) { await upstream.body?.cancel(); send(res, upstream.status === 401 || upstream.status === 403 ? 401 : 502, {ok:false,error:{code:'SPEECH_UPSTREAM',message:upstream.status === 401 || upstream.status === 403 ? '语音服务认证失败，请检查资源地址、密钥和权限。' : '语音服务暂时不可用，请检查配额或稍后重试。'}}); return true; }
          let bytes = 0; const chunks = [];
          for await (const c of upstream.body) { bytes += c.length; if (bytes > 1024 * 1024) throw Error('语音服务返回过大，请缩短参考句。'); chunks.push(c); }
          let parsed; try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Error('语音服务返回格式无效。'); }
          const result = JSON.parse(JSON.stringify(normalizeResult(parsed)).split(active.apiKey).join('[已隐藏]'));
          if (ownController.signal.aborted || config !== active) throw Error('评测已取消，请重新连接后再试。');
          send(res,200,{ok:true,provider:'Azure Speech',language:'en-GB',result,disclaimer:'0–100 为自动发音诊断，不是雅思口语 Band；噪声和录音设备会影响结果。'});
        } catch (error) {
          if (res.destroyed) return true;
          // Upstream errors may contain credentials. Never forward arbitrary messages.
          const allowed = ['没有识别到清晰的英语朗读，请检查录音后重试。','服务未返回发音评测结果，请检查服务配置。','语音服务返回过大，请缩短参考句。','语音服务返回格式无效。','评测已取消，请重新连接后再试。'];
          throw Error(allowed.includes(error.message) ? error.message : '语音请求失败或超时，请检查连接后重试。');
        } finally { clearTimeout(timer); res.removeListener('close',cancel); budget?.settle(ticket); }
      } else send(res,404,{ok:false,error:{code:'NOT_FOUND',message:'语音接口不存在。'}});
    } catch (error) { if (!res.headersSent && !res.destroyed) send(res,error instanceof BudgetError ? error.status : 400,{ok:false,error:{code:error instanceof BudgetError ? error.code : 'SPEECH_REQUEST',message:error.message}}); }
    finally { if (ownController) { busy = false; if (controller === ownController) controller = null; } }
    return true;
  }
  handle.close = () => { config = null; controller?.abort(); };
  handle.containsCredential = text => Boolean(config?.apiKey && text.includes(config.apiKey));
  return handle;
}
module.exports = { checkWav, normalizeResult, createSpeechHandler };
