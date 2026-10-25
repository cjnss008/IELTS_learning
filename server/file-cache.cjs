'use strict';

// Cache content, never filesystem authorization. Callers must obtain a fresh
// protected stat before looking up bytes, including on conditional requests.
function fileStamp(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs, stat.birthtimeMs].join(':');
}

function createFileCache({ maxBytes = 48 * 1024 * 1024, maxFileBytes = 4 * 1024 * 1024, maxEntries = 192 } = {}) {
  const entries = new Map();
  let bytes = 0;
  function remove(key) {
    const old = entries.get(key);
    if (old) { bytes -= old.bytes.length; entries.delete(key); }
  }
  function get(key, stamp) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.stamp !== stamp) { remove(key); return null; }
    entries.delete(key); entries.set(key, entry);
    return entry;
  }
  function set(key, stamp, content, extra = {}) {
    remove(key);
    if (content.length > maxFileBytes || content.length > maxBytes || maxEntries < 1) return null;
    while (entries.size && (entries.size >= maxEntries || bytes + content.length > maxBytes)) remove(entries.keys().next().value);
    const entry = { ...extra, stamp, bytes: content };
    entries.set(key, entry); bytes += content.length;
    return entry;
  }
  return { get, set, delete: remove, clear() { entries.clear(); bytes = 0; }, get size() { return entries.size; }, get bytes() { return bytes; } };
}

module.exports = { fileStamp, createFileCache };
