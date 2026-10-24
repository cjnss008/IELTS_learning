'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const review = require('../assets/review-core.js');
const START = '2026-01-01T08:00:00.000Z';
const TODAY = '2026-01-01';
const addMinutes = (iso, amount) => new Date(Date.parse(iso) + amount * 60000).toISOString();
const dateOf = iso => iso.slice(0, 10);

test('新卡状态、IIFE全局和CommonJS导出均可用', () => {
  const state = review.createState(['d1-v0', 'custom-test']);
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.algorithm, 'ielts-review-lite-v1');
  assert.equal(state.cards['d1-v0'].status, 'new');
  assert.equal(state.cards['d1-v0'].dueAt, null);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/review-core.js'), 'utf8'), context);
  assert.equal(context.IELTSReviewCore.DAILY_NEW_LIMIT, 20);
  assert.equal(context.IELTSReviewCore.MAX_INTERVAL_DAYS, 180);
});

test('again/hard/good/easy首次评分分别为1分钟、5分钟、10分钟和4天', () => {
  const state = review.createState(['word']);
  const before = JSON.stringify(state);
  const delays = { again: 1, hard: 5, good: 10, easy: 4 * 24 * 60 };
  for (const rating of Object.keys(delays)) {
    const result = review.reviewCard(state, 'word', rating, START, TODAY);
    assert.equal(result.nextDueAt, addMinutes(START, delays[rating]));
    assert.equal(result.isNew, true);
    assert.equal(result.card.repetitions, 1);
    assert.equal(result.card.introducedOn, TODAY);
    assert.equal(result.card.status, rating === 'easy' ? 'review' : 'learning');
    assert.deepEqual(review.parseState(result.state, ['word'], START), result.state);
  }
  assert.equal(JSON.stringify(state), before);
});

test('学习中再次正确后毕业到1天，忘记会重试并保留首次学习日', () => {
  let result = review.reviewCard(review.createState(['word']), 'word', 'again', START, TODAY);
  result = review.reviewCard(result.state, 'word', 'good', result.nextDueAt, TODAY);
  assert.equal(result.card.status, 'learning');
  assert.equal(result.card.step, 1);
  const now = result.nextDueAt;
  result = review.reviewCard(result.state, 'word', 'good', now, TODAY);
  assert.equal(result.card.status, 'review');
  assert.equal(result.card.intervalDays, 1);
  assert.equal(result.nextDueAt, addMinutes(now, 1440));
  const next = result.nextDueAt;
  result = review.reviewCard(result.state, 'word', 'again', next, dateOf(next));
  assert.equal(result.card.status, 'learning');
  assert.equal(result.card.intervalDays, 0);
  assert.equal(result.card.lapses, 1);
  assert.equal(result.card.introducedOn, TODAY);
  assert.equal(result.nextDueAt, addMinutes(next, 1));
});

test('到期前不能重复评分，时间不倒退，日期不能任意更改来绕过限额', () => {
  const result = review.reviewCard(review.createState(['word']), 'word', 'good', START, TODAY);
  assert.throws(() => review.reviewCard(result.state, 'word', 'good', START, TODAY), /尚未到/);
  assert.throws(() => review.reviewCard(result.state, 'word', 'good', addMinutes(START, -1), TODAY), /未来学习/);
  assert.throws(() => review.reviewCard(review.createState(['word']), 'word', 'good', START, '2026-02-01'), /不一致/);
  assert.throws(() => review.reviewCard(review.createState(['word']), 'word', 'bad', START, TODAY));
});

test('所有筛选共用每日20张首次评分额度；次日新词额度恢复', () => {
  const wordIds = Array.from({ length: 25 }, (_, i) => 'word-' + i);
  let state = review.createState(wordIds);
  for (let i = 0; i < 20; i++) state = review.reviewCard(state, wordIds[i], 'easy', START, TODAY).state;
  const filtered = review.getQueue(state, START, TODAY, wordIds.slice(20));
  assert.equal(filtered.newUsed, 20);
  assert.equal(filtered.newRemaining, 0);
  assert.deepEqual(filtered.newIds, []);
  assert.throws(() => review.reviewCard(state, wordIds[20], 'good', START, TODAY), /20 张/);
  const tomorrow = addMinutes(START, 1440);
  const nextQueue = review.getQueue(state, tomorrow, dateOf(tomorrow), wordIds.slice(20));
  assert.equal(nextQueue.newUsed, 0);
  assert.equal(nextQueue.newRemaining, 20);
  assert.equal(nextQueue.newIds.length, 5);
});

test('队列先到期再新词，到期学习中卡优先，未来到期卡提供等待时间', () => {
  let state = review.createState(['new-first', 'review-card', 'learning-card']);
  state = review.reviewCard(state, 'review-card', 'easy', START, TODAY).state;
  const fourthDay = addMinutes(START, 4 * 1440);
  state = review.reviewCard(state, 'learning-card', 'again', fourthDay, dateOf(fourthDay)).state;
  const due = addMinutes(fourthDay, 1);
  const queue = review.getQueue(state, due, dateOf(due));
  assert.deepEqual(queue.ids, ['learning-card', 'review-card', 'new-first']);
  assert.equal(queue.dueCount, 2);
  const beforeDue = review.getQueue(state, fourthDay, dateOf(fourthDay), ['learning-card']);
  assert.deepEqual(beforeDue.ids, []);
  assert.equal(beforeDue.nextDueAt, due);
});

test('固定规则递增间隔且不超过180天', () => {
  let result = review.reviewCard(review.createState(['word']), 'word', 'easy', START, TODAY);
  for (let i = 0; i < 12; i++) {
    const now = result.nextDueAt;
    result = review.reviewCard(result.state, 'word', 'easy', now, dateOf(now));
    assert.ok(result.card.intervalDays <= 180);
    assert.deepEqual(review.parseState(result.state, ['word'], now), result.state);
  }
  assert.equal(result.card.intervalDays, 180);
  const now = result.nextDueAt;
  const hard = review.reviewCard(result.state, 'word', 'hard', now, dateOf(now));
  assert.equal(hard.card.intervalDays, 180);
});

test('备份严格限制字段、原型、ID、数值、时间和学习状态一致性', () => {
  const fresh = review.createState(['word']);
  assert.throws(() => review.parseState({ ...fresh, schemaVersion: 2 }, ['word'], START));
  assert.throws(() => review.parseState({ ...fresh, algorithm: 'fsrs' }, ['word'], START));
  assert.throws(() => review.parseState({ ...fresh, complete: true }, ['word'], START));
  assert.throws(() => review.parseState({ ...fresh, cards: [] }, ['word'], START));
  assert.throws(() => review.parseState(JSON.stringify(fresh).replace('"cards":{', '"cards":{"__proto__":{},'), ['word'], START));
  assert.equal({}.polluted, undefined);
  assert.throws(() => review.createState(['constructor']));
  assert.throws(() => review.createState(['word', 'word']));
  assert.throws(() => review.createState(new Array(1)));
  assert.throws(() => review.parseState({ ...fresh, cards: { word: { ...fresh.cards.word, repetitions: 1 } } }, ['word'], START));
  const learned = review.reviewCard(fresh, 'word', 'easy', START, TODAY).state;
  for (const patch of [{ intervalDays: 181 }, { repetitions: -1 }, { lapses: 2 }, { dueAt: '2026-01-03T08:00:00.000Z' }, { lastReviewedAt: '2026-01-02T08:00:00.000Z' }, { introducedOn: '2026-02-01' }, { lastRating: 'again' }]) {
    assert.throws(() => review.parseState({ ...learned, cards: { word: { ...learned.cards.word, ...patch } } }, ['word'], START));
  }
});

test('新增生词补初始状态，暂未加载的历史卡与额度保留', () => {
  const original = review.reviewCard(review.createState(['old-word']), 'old-word', 'easy', START, TODAY).state;
  const before = JSON.stringify(original);
  const merged = review.parseState(JSON.stringify(original), ['custom-new'], START);
  assert.equal(merged.cards['custom-new'].status, 'new');
  assert.deepEqual(merged.cards['old-word'], original.cards['old-word']);
  const queue = review.getQueue(merged, START, TODAY, ['custom-new']);
  assert.deepEqual(queue.ids, ['custom-new']);
  assert.equal(queue.newUsed, 1);
  assert.equal(queue.newRemaining, 19);
  assert.equal(JSON.stringify(original), before);
});

test('伪造同日21张新卡记录、未知筛选项与超过词库上限均被拒绝', () => {
  const learned = review.reviewCard(review.createState(['one']), 'one', 'easy', START, TODAY).state.cards.one;
  const forged = review.createState(Array.from({ length: 21 }, (_, i) => 'word-' + i));
  Object.keys(forged.cards).forEach(id => { forged.cards[id] = { ...learned }; });
  assert.throws(() => review.parseState(forged, undefined, START), /20 张/);
  assert.throws(() => review.getQueue(review.createState(['one']), START, TODAY, ['missing']), /未知词卡/);
  assert.throws(() => review.createState(Array.from({ length: 10001 }, (_, i) => 'word-' + i)), /10000/);
});

test('Anki 导出两列纯文本，换行与制表符不增列，危险公式前缀转义', () => {
  const text = review.toAnkiTSV([
    { word: '=HYPERLINK("x")', meaning: '+SUM(A1)', context: 'one\ttwo\nthree', day: 1 },
    { word: ' continent ', meaning: 'n. 大洲', ipa: '/continent/' }
  ]);
  const rows = text.split('\r\n').map(row => row.split('\t'));
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.length === 2));
  assert.equal(rows[0][0], '\'=HYPERLINK("x")');
  assert.ok(rows[0][1].startsWith("'+SUM(A1)"));
  assert.ok(rows[0][1].includes('one two three'));
  assert.equal(rows[1][0], 'continent');
  assert.throws(() => review.toAnkiTSV([{ word: 'bad' }]));
});
