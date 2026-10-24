'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.IELTSTextbookLibrary = require('../assets/textbook-library-core.js');
const Library = global.IELTSTextbookLibrary;
const Backup = require('../assets/backup-core.js');
const KEY = Library.KEY;
const early = '2026-10-20T00:00:00.000Z', later = '2026-10-24T00:00:00.000Z';
function storage(initial = {}) { const data = { ...initial }; return { data, getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: k => { delete data[k]; } }; }
function state(item) { return { schemaVersion: 1, items: { 'cambridge-17-test-1': { status: 'seen', updatedAt: later, firstSeenAt: early, source: 'pdf-open', seenCount: 4, ...item } } }; }

test('统一备份纳入教材曝光并使用教材模块严格校验，旧备份仍可恢复', () => {
  const raw = JSON.stringify(state());
  assert.ok(Backup.KEYS[KEY]);
  assert.equal(Backup.parseBundle({ app: 'ielts52-backup', schemaVersion: 1, entries: { [KEY]: raw } })[KEY], raw);
  assert.deepEqual(Backup.validate(KEY, raw), Library.parseState(raw));
  assert.deepEqual(Backup.parseBundle({ app: 'ielts52-backup', schemaVersion: 1, entries: { 'ielts40-translation-visible': 'false' } }), { 'ielts40-translation-visible': 'false' });
  assert.throws(() => Backup.validate(KEY, JSON.stringify({ schemaVersion: 1, items: { unknown: {} } })), /身份/);
  assert.throws(() => Backup.validate(KEY, JSON.stringify(state({ status: 'seen', firstSeenAt: null }))), /首次曝光/);
  assert.throws(() => Backup.validate(KEY, JSON.stringify({ ...state(), secret: true })), /字段/);
});

test('恢复旧教材备份保留首次曝光和最大次数，并合并新增试卷', async () => {
  const old = JSON.stringify(state());
  const incoming = state({ status: 'unseen', updatedAt: early, firstSeenAt: null, source: 'manual', seenCount: 0 });
  incoming.items['cambridge-18-test-2'] = { status: 'seen', updatedAt: later, firstSeenAt: later, source: 'related-pdf-open', seenCount: 1 };
  const store = storage({ [KEY]: old });
  await Backup.restoreAll(store, { [KEY]: JSON.stringify(incoming) }, [KEY]);
  const restored = Library.parseState(store.getItem(KEY));
  assert.equal(restored.items['cambridge-17-test-1'].firstSeenAt, early);
  assert.equal(restored.items['cambridge-17-test-1'].seenCount, 4);
  assert.equal(restored.items['cambridge-17-test-1'].status, 'seen');
  assert.equal(restored.items['cambridge-18-test-2'].source, 'related-pdf-open');
});

test('较新的手动未见更正仍保存历史曝光，损坏模块在写入前停止', () => {
  const old = JSON.stringify(state({ updatedAt: early }));
  const incoming = JSON.stringify(state({ status: 'unseen', updatedAt: later, firstSeenAt: null, source: 'manual', seenCount: 0 }));
  const store = storage({ [KEY]: old, 'ielts40-translation-visible': 'false' });
  Backup.restore(store, { [KEY]: incoming }, [KEY]);
  const item = Library.parseState(store.getItem(KEY)).items['cambridge-17-test-1'];
  assert.equal(item.status, 'unseen');
  assert.equal(item.firstSeenAt, early);
  assert.equal(item.seenCount, 4);
  assert.equal(Library.seen(item), true);
  const before = store.getItem(KEY);
  assert.throws(() => Backup.restore(store, { [KEY]: '{"schemaVersion":2,"items":{}}', 'ielts40-translation-visible': 'true' }, ['ielts40-translation-visible', KEY]));
  assert.equal(store.getItem('ielts40-translation-visible'), 'false');
  assert.equal(store.getItem(KEY), before);
});

test('教材曝光合并只在准备区执行，后续存储失败可完整回滚', async () => {
  const old = JSON.stringify(state()), initial = { [KEY]: old, 'ielts40-translation-visible': 'false' }, store = storage(initial);
  let writes = 0;
  store.setItem = (key, raw) => { if (++writes === 2) throw Error('quota'); store.data[key] = raw; };
  const incoming = state();
  incoming.items['cambridge-18-test-2'] = incoming.items['cambridge-17-test-1'];
  await assert.rejects(Backup.restoreAll(store, { [KEY]: JSON.stringify(incoming), 'ielts40-translation-visible': 'true' }, [KEY, 'ielts40-translation-visible']), /还原/);
  assert.deepEqual(store.data, initial);
});

test('备份页面只加载教材核心，不启动教材UI', () => {
  const html = fs.readFileSync(path.join(__dirname, '../备份中心.html'), 'utf8');
  assert.match(html, /src="assets\/textbook-library-core\.js"/);
  assert.doesNotMatch(html, /src="assets\/textbook-library\.js"/);
  assert.ok(html.indexOf('assets/textbook-library-core.js') < html.indexOf('assets/backup-core.js'));
});
