(function (root, factory) {
  'use strict';
  const api = factory(); root.IELTSLargeText = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DATABASE = 'ielts52-large-text-cache-v1', STORE = 'entries', MARKER = 'ielts52-large-text:';
  const managed = key => typeof key === 'string' && /^(?:ielts52-profile:p-[A-Za-z0-9-]{8,80}:)?ielts52-memory-v1$/.test(key);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  function failure(message, code = 'LARGE_TEXT_SAVE') { return Object.assign(Error(message), {code}); }
  function marker(revision) { return MARKER + revision; }
  function revisionOf(value) { if (typeof value !== 'string' || !value.startsWith(MARKER)) return null; const revision = Number(value.slice(MARKER.length)); if (!Number.isSafeInteger(revision) || revision < 1) throw failure('大型记忆档案的缓存标记无效，原记录保留。', 'LARGE_TEXT_CORRUPT'); return revision; }
  function cleanRow(row) {
    if (!row || !managed(row.key) || !Number.isSafeInteger(row.revision) || row.revision < 1 || !(row.raw === null || typeof row.raw === 'string' && row.raw.length <= 128 * 1024 * 1024) || typeof row.writer !== 'string') throw failure('大型记忆档案缓存无法校验，未覆盖已有记录。', 'LARGE_TEXT_CORRUPT');
    return row;
  }
  function createIndexedBackend(indexedDB) {
    let opening;
    function open() {
      if (!indexedDB?.open) return Promise.reject(failure('浏览器不能打开大型记忆档案缓存；原进度未被覆盖。'));
      if (!opening) opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, {keyPath: 'key'}); };
        request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
        request.onerror = () => { opening = null; reject(failure('大型记忆档案缓存未能打开，原稿与旧记录保留。')); };
        request.onblocked = () => { opening = null; reject(failure('另一页面正在升级记忆缓存，请关闭旧页面后重试。')); };
      });
      return opening;
    }
    async function all() {
      const db = await open();
      return new Promise((resolve, reject) => { const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).getAll(); tx.oncomplete = () => { try { resolve(request.result.map(cleanRow)); } catch (e) { reject(e); } }; tx.onerror = tx.onabort = () => reject(failure('大型记忆档案缓存读取失败，原记录保留。')); });
    }
    async function compareAndSet(key, expectedRevision, raw, writer) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE), request = store.get(key); let row, error;
        request.onsuccess = () => {
          const prior = request.result;
          if ((prior?.revision || 0) !== expectedRevision) { error = failure('另一页面已更新记忆档案，本页输入保留，请刷新后继续。', 'LARGE_TEXT_CONFLICT'); tx.abort(); return; }
          row = {key, revision: expectedRevision + 1, raw, writer, updatedAt: new Date().toISOString()}; store.put(row);
        };
        tx.oncomplete = () => resolve(row);
        tx.onerror = tx.onabort = () => reject(error || failure('大型记忆档案尚未耐久保存，请保留本页输入后重试。'));
      });
    }
    return {all, compareAndSet};
  }
  function createStore(options = {}) {
    const native = options.storage, backend = options.backend || createIndexedBackend(options.indexedDB), writer = options.writer || 'writer-' + (globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random());
    if (!native?.getItem || !native?.setItem) throw failure('浏览器文字缓存不可用。');
    const raw = {get: native.getItem.bind(native), set: native.setItem.bind(native), remove: native.removeItem.bind(native)}, cache = new Map(), listeners = new Set();
    let started = false, hydrated = false, ready = null, flushing = null, sequence = 0, lastError = null;
    const notify = error => { lastError = error; options.onError?.(error); };
    function keys() { const out = []; for (let i = 0; i < native.length; i++) { const key = native.key(i); if (key != null) out.push(key); } for (const [key, value] of cache) { if (value.raw !== null && !out.includes(key)) out.push(key); if (value.raw === null && out.includes(key)) out.splice(out.indexOf(key), 1); } return out; }
    function check(value, key) {
      if (!started) throw failure('大型记忆档案仍在读取，请等待启动完成。');
      if (value.stale || raw.get(key) !== value.marker) { value.stale = true; const error = failure('另一页面已更新记忆档案，本页输入保留，请刷新后继续。', 'LARGE_TEXT_CONFLICT'); notify(error); throw error; }
    }
    function current(key) {
      let value = cache.get(key);
      if (!value) { const original = raw.get(key); if (revisionOf(original) !== null) throw failure('大型记忆档案尚未完整读取，未使用空白记录。', 'LARGE_TEXT_CORRUPT'); value = {raw: original, revision: 0, marker: original, dirty: false, sequence: 0, stale: false}; cache.set(key, value); }
      check(value, key); return value;
    }
    function change(key, value, internal = false) {
      const old = current(key); if (old.raw === value) return;
      if (!internal) for (const listener of listeners) listener.before?.(key);
      old.raw = value; old.dirty = true; old.sequence = ++sequence; lastError = null;
      if (!internal) for (const listener of listeners) listener.changed?.(key);
      Promise.resolve().then(() => flush()).catch(() => {});
    }
    async function initialise() {
      if (ready) return ready;
      ready = (async () => {
        const rows = await backend.all(), indexed = new Map(rows.map(row => [row.key, cleanRow(row)])), allKeys = new Set([...keys().filter(managed), ...indexed.keys()]);
        for (const key of allKeys) {
          const stored = raw.get(key), revision = revisionOf(stored), row = indexed.get(key);
          if (revision !== null) {
            if (!row || row.revision < revision) throw failure('记忆缓存标记缺少完整原稿，未启动空白档案。', 'LARGE_TEXT_CORRUPT');
            // A commit can finish immediately before a page closes. Its complete
            // IDB row is authoritative even if the tiny marker lagged behind.
            const nextMarker = row.raw === null ? null : marker(row.revision); if (stored !== nextMarker) nextMarker === null ? raw.remove(key) : raw.set(key, nextMarker);
            cache.set(key, {raw: row.raw, revision: row.revision, marker: nextMarker, dirty: false, sequence: 0, stale: false});
          } else if (row) {
            if (stored !== null && stored !== row.raw) throw failure('旧页面与大型记忆缓存有不同版本，已保留两份，未自动覆盖。', 'LARGE_TEXT_CONFLICT');
            if (row.raw === null) raw.remove(key); else raw.set(key, marker(row.revision));
            cache.set(key, {raw: row.raw, revision: row.revision, marker: row.raw === null ? null : marker(row.revision), dirty: false, sequence: 0, stale: false});
          } else {
            cache.set(key, {raw: stored, revision: 0, marker: stored, dirty: stored !== null, sequence: ++sequence, stale: false});
          }
        }
        started = true;
        try { await flush(); }
        catch (error) {
          // Two fresh pages may migrate the same old bytes simultaneously.
          // Accept only an identical completed migration, never different work.
          if (error.code !== 'LARGE_TEXT_CONFLICT') throw error;
          const completed = new Map((await backend.all()).map(row => [row.key, cleanRow(row)]));
          for (const [key, value] of cache) if (value.dirty) {
            const row = completed.get(key), pointer = raw.get(key);
            if (!row || row.raw !== value.raw || pointer !== (row.raw === null ? null : marker(row.revision))) throw error;
            cache.set(key, {raw: row.raw, revision: row.revision, marker: pointer, dirty: false, sequence: 0, stale: false});
          }
          lastError = null;
        }
        hydrated = true; return storage;
      })();
      ready.catch(error => { notify(error); }); return ready;
    }
    function flush() {
      if (flushing) return flushing;
      const run = async () => {
        if (!started) throw failure('大型记忆档案尚未读取，未写入用户文件夹。');
        for (;;) {
          const pending = [...cache].find(([, value]) => value.dirty); if (!pending) break;
          const [key, value] = pending; check(value, key);
          const next = value.raw, submittedSequence = value.sequence, beforeMarker = value.marker;
          let row;
          try { row = cleanRow(await backend.compareAndSet(key, value.revision, next, writer)); }
          catch (error) { if (error.code === 'LARGE_TEXT_CONFLICT') value.stale = true; throw error; }
          if (raw.get(key) !== beforeMarker) { value.stale = true; throw failure('另一页面同时修改了记忆档案，已保留完整候选，请刷新核对。', 'LARGE_TEXT_CONFLICT'); }
          // The IDB transaction is complete before the native marker changes.
          // A quota failure here leaves the full new row durable for recovery.
          const nextMarker = next === null ? null : marker(row.revision);
          try { nextMarker === null ? raw.remove(key) : raw.set(key, nextMarker); }
          catch (error) { value.revision = row.revision; value.marker = raw.get(key); throw failure('完整记忆已保留在浏览器缓存，但索引尚未保存，请保留页面重试。'); }
          value.revision = row.revision; value.marker = nextMarker; value.dirty = value.sequence !== submittedSequence;
        }
        lastError = null; return true;
      };
      flushing = Promise.resolve().then(run).catch(error => { notify(error); throw error; }).finally(() => { flushing = null; });
      return flushing;
    }
    function setItem(key, value) { key = String(key); managed(key) ? change(key, String(value)) : native.setItem(key, String(value)); }
    function removeItem(key) { key = String(key); managed(key) ? change(key, null) : native.removeItem(key); }
    const storage = {get length() { return keys().length; }, key: index => keys()[index] ?? null, getItem(key) { key = String(key); return managed(key) ? current(key).raw : raw.get(key); }, setItem, removeItem, clear() { for (const key of keys()) removeItem(key); }};
    const api = {storage, nativeStorage: native, initialise, get ready() { return ready || initialise(); }, flush, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, pending: () => [...cache].filter(([, value]) => value.dirty).map(([key, value]) => ({key, raw: value.raw, revision: value.revision})), status: () => ({ready: hydrated, pending: [...cache.values()].filter(value => value.dirty).length, error: lastError}), capture() { return {get: storage.getItem.bind(storage), set(key, value) { managed(key) ? change(key, String(value), true) : raw.set(key, String(value)); }, remove(key) { managed(key) ? change(key, null, true) : raw.remove(key); }}; }};
    Object.defineProperty(storage, '__ieltsLargeText', {value: api}); return api;
  }
  let runtime;
  function install(root = globalThis) {
    if (runtime) return runtime;
    if (root.location && new URLSearchParams(root.location.search).get('preview') === '1') return {ready: Promise.resolve(), flush: async () => true};
    const native = root.localStorage, store = createStore({storage: native, indexedDB: root.indexedDB, onError: error => root.dispatchEvent?.(new root.CustomEvent('ielts:user-data-storage-error', {detail: {message: error.message, code: error.code}}))});
    Object.defineProperty(root, 'localStorage', {configurable: true, get: () => store.storage}); runtime = store;
    root.addEventListener?.('beforeunload', event => { if (store.pending().length) { event.preventDefault(); event.returnValue = ''; } });
    root.addEventListener?.('pagehide', () => store.flush().catch(() => {}));
    store.initialise(); return store;
  }
  return {DATABASE, STORE, MARKER, managed, revisionOf, createIndexedBackend, createStore, install};
});
