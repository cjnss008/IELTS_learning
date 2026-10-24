'use strict';
(function (root) {
  const LIMITS = Object.freeze({
    reading: Object.freeze({ recordSeconds: 25, importSeconds: 30 }),
    free: Object.freeze({ recordSeconds: 180, importSeconds: 180 }),
  });
  function limitsFor(mode) { return mode === 'free' ? LIMITS.free : LIMITS.reading; }
  function validDuration(duration, mode) { return Number.isFinite(duration) && duration >= 0.1 && duration <= limitsFor(mode).importSeconds; }
  function formatTime(duration) {
    const seconds = Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 0;
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  function encodeWav(samples) {
    if (!samples || !Number.isInteger(samples.length) || samples.length < 1 || samples.length > 16000 * 180) throw new Error('音频采样长度无效。');
    const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
    function chars(at, text) { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); }
    chars(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); chars(8, 'WAVE'); chars(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    chars(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const value = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
      view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
    }
    return new Uint8Array(buffer);
  }
  const api = Object.freeze({ limitsFor, validDuration, formatTime, encodeWav });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IELTSSpeakingAudio = api;
})(globalThis);
