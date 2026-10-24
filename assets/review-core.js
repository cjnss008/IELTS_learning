(function (root, factory) {
  'use strict';
  var api = factory();
  root.IELTSReviewCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAY_MS = 86400000;
  var MINUTE_MS = 60000;
  var NEW_LIMIT = 20;
  var MAX_INTERVAL = 180;
  var MAX_CARDS = 10000;
  var ALGORITHM = 'ielts-review-lite-v1';
  var RATINGS = ['again', 'hard', 'good', 'easy'];
  var OWN = Object.prototype.hasOwnProperty;

  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(name + '必须是对象。');
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError(name + '不得使用自定义原型。');
    return value;
  }
  function keys(value, allowed, name) {
    object(value, name);
    Reflect.ownKeys(value).forEach(function (key) {
      if (typeof key !== 'string' || allowed.indexOf(key) < 0) throw new TypeError(name + '包含未知字段。');
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor.get || descriptor.set) throw new TypeError(name + '不得包含访问器。');
    });
  }
  function cardId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value) || ['__proto__', 'constructor', 'prototype'].indexOf(value) >= 0) {
      throw new TypeError('词卡 id 格式无效。');
    }
    return value;
  }
  function ids(value) {
    if (!Array.isArray(value) || value.length > MAX_CARDS || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError('词卡列表必须是最多 ' + MAX_CARDS + ' 项的数组。');
    if (Reflect.ownKeys(value).some(function (key) { return key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length); })) throw new TypeError('词卡列表包含非法数组字段。');
    var seen = new Set();
    var result = [];
    for (var i = 0; i < value.length; i += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || descriptor.get || descriptor.set) throw new TypeError('词卡列表不得包含空项或访问器。');
      var id = cardId(value[i]);
      if (seen.has(id)) throw new TypeError('词卡 id 不得重复。');
      seen.add(id); result.push(id);
    }
    return result;
  }
  function integer(value, min, max, name) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(name + '超出允许范围。');
    return value;
  }
  function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('学习日期应为 YYYY-MM-DD。');
    var parts = value.split('-').map(Number);
    var date = new Date(0);
    date.setUTCHours(0, 0, 0, 0); date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    if (parts[0] < 1 || date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) throw new RangeError('学习日期不存在。');
    return date.getTime();
  }
  function instant(value, name) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw new TypeError(name + '应为 UTC ISO 时间。');
    calendarDate(value.slice(0, 10));
    var time = Date.parse(value);
    if (!Number.isFinite(time) || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) throw new RangeError(name + '时间无效。');
    return time;
  }
  function nowTime(value) { return instant(value === undefined ? new Date().toISOString() : value, '当前时间'); }
  function iso(time) {
    var date = new Date(time);
    if (!Number.isFinite(time) || date.getUTCFullYear() > 9999 || date.getUTCFullYear() < 1) throw new RangeError('复习时间超出有效范围。');
    return date.toISOString();
  }
  function studyDateForInstant(date, time) {
    var midnight = calendarDate(date);
    if (Math.abs(midnight - calendarDate(iso(time).slice(0, 10))) > DAY_MS) throw new RangeError('学习日期与当前时间不一致。');
    return date;
  }
  function emptyCard() {
    return { status: 'new', step: 0, intervalDays: 0, dueAt: null, lastReviewedAt: null, introducedAt: null, introducedOn: null, repetitions: 0, lapses: 0, lastRating: null };
  }
  function createState(cardIds) {
    var cards = {};
    ids(cardIds).forEach(function (id) { cards[id] = emptyCard(); });
    return { schemaVersion: 1, algorithm: ALGORITHM, cards: cards };
  }
  function cleanCard(value, now) {
    keys(value, ['status', 'step', 'intervalDays', 'dueAt', 'lastReviewedAt', 'introducedAt', 'introducedOn', 'repetitions', 'lapses', 'lastRating'], '词卡记录');
    if (['new', 'learning', 'review'].indexOf(value.status) < 0) throw new TypeError('词卡学习状态无效。');
    integer(value.step, 0, 1, '学习步骤');
    integer(value.intervalDays, 0, MAX_INTERVAL, '复习间隔');
    integer(value.repetitions, 0, 1000000, '评分次数');
    integer(value.lapses, 0, value.repetitions, '遗忘次数');
    if (value.status === 'new') {
      var fresh = emptyCard();
      if (Object.keys(fresh).some(function (key) { return value[key] !== fresh[key]; })) throw new TypeError('新词卡不得带有已学习记录。');
      return fresh;
    }
    if (RATINGS.indexOf(value.lastRating) < 0 || value.repetitions < 1) throw new TypeError('已学习词卡缺少有效评分记录。');
    var introduced = instant(value.introducedAt, '首次学习时间');
    var reviewed = instant(value.lastReviewedAt, '最近学习时间');
    var due = instant(value.dueAt, '到期时间');
    var introducedOn = studyDateForInstant(value.introducedOn, introduced);
    if (introduced > reviewed || reviewed > now || due <= reviewed) throw new RangeError('词卡时间顺序无效或包含未来学习记录。');
    if (value.status === 'learning') {
      if (value.intervalDays !== 0 || value.lastRating === 'easy') throw new TypeError('学习中词卡的间隔或评分不一致。');
      var delay = (due - reviewed) / MINUTE_MS;
      if ([1, 5, 10].indexOf(delay) < 0 || (value.lastRating === 'again' && (value.step !== 0 || delay !== 1)) || (value.lastRating === 'hard' && delay !== 5) || (value.lastRating === 'good' && (value.step !== 1 || delay !== 10))) {
        throw new TypeError('学习中重试时间与评分不一致。');
      }
    } else if (value.intervalDays < 1 || value.step !== 0 || value.lastRating === 'again' || due - reviewed !== value.intervalDays * DAY_MS) {
      throw new TypeError('复习词卡的间隔与到期时间不一致。');
    }
    return { status: value.status, step: value.step, intervalDays: value.intervalDays, dueAt: iso(due), lastReviewedAt: iso(reviewed), introducedAt: iso(introduced), introducedOn: introducedOn, repetitions: value.repetitions, lapses: value.lapses, lastRating: value.lastRating };
  }
  function parseState(value, knownIds, nowIso) {
    var now = nowTime(nowIso);
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (error) { throw new TypeError('复习备份不是有效 JSON。'); }
    }
    keys(value, ['schemaVersion', 'algorithm', 'cards'], '复习备份');
    if (value.schemaVersion !== 1 || value.algorithm !== ALGORITHM) throw new RangeError('复习备份版本或算法标识不受支持。');
    object(value.cards, '词卡记录集合');
    var cardKeys = Reflect.ownKeys(value.cards);
    if (cardKeys.length > MAX_CARDS) throw new RangeError('词卡记录超过 ' + MAX_CARDS + ' 项。');
    var result = { schemaVersion: 1, algorithm: ALGORITHM, cards: {} };
    var newByDay = new Map();
    cardKeys.forEach(function (key) {
      cardId(key);
      var descriptor = Object.getOwnPropertyDescriptor(value.cards, key);
      if (descriptor.get || descriptor.set) throw new TypeError('词卡记录不得包含访问器。');
      var card = cleanCard(value.cards[key], now);
      result.cards[key] = card;
      if (card.introducedOn) {
        var count = (newByDay.get(card.introducedOn) || 0) + 1;
        if (count > NEW_LIMIT) throw new RangeError('备份中同一天首次评分的新词超过 20 张。');
        newByDay.set(card.introducedOn, count);
      }
    });
    if (knownIds !== undefined) ids(knownIds).forEach(function (id) { if (!OWN.call(result.cards, id)) result.cards[id] = emptyCard(); });
    if (Object.keys(result.cards).length > MAX_CARDS) throw new RangeError('合并新词后超过 ' + MAX_CARDS + ' 张词卡。');
    return result;
  }
  function newUsed(state, todayDate) {
    return Object.keys(state.cards).filter(function (id) { return state.cards[id].introducedOn === todayDate; }).length;
  }
  function getQueue(state, nowIso, todayDate, filterIds) {
    var now = nowTime(nowIso);
    studyDateForInstant(todayDate, now);
    var clean = parseState(state, undefined, iso(now));
    var selected = filterIds === undefined ? Object.keys(clean.cards) : ids(filterIds);
    if (selected.some(function (id) { return !OWN.call(clean.cards, id); })) throw new TypeError('筛选列表包含未知词卡。');
    var dueIds = selected.filter(function (id) { return clean.cards[id].status !== 'new' && Date.parse(clean.cards[id].dueAt) <= now; });
    dueIds.sort(function (a, b) {
      var left = clean.cards[a], right = clean.cards[b];
      return (left.status === 'learning' ? 0 : 1) - (right.status === 'learning' ? 0 : 1) || Date.parse(left.dueAt) - Date.parse(right.dueAt);
    });
    var used = newUsed(clean, todayDate);
    var remaining = Math.max(0, NEW_LIMIT - used);
    var available = selected.filter(function (id) { return clean.cards[id].status === 'new'; });
    var newIds = available.slice(0, remaining);
    var future = selected.map(function (id) { return clean.cards[id].dueAt; }).filter(function (date) { return date && Date.parse(date) > now; }).sort();
    return { ids: dueIds.concat(newIds), dueIds: dueIds, newIds: newIds, dueCount: dueIds.length, newUsed: used, newRemaining: remaining, newAvailable: available.length, nextDueAt: future.length ? future[0] : null };
  }
  function reviewCard(state, id, rating, nowIso, todayDate) {
    var now = nowTime(nowIso);
    studyDateForInstant(todayDate, now);
    cardId(id);
    if (RATINGS.indexOf(rating) < 0) throw new TypeError('请选择 again、hard、good 或 easy。');
    var clean = parseState(state, undefined, iso(now));
    if (!OWN.call(clean.cards, id)) throw new TypeError('词卡不存在。');
    var card = Object.assign({}, clean.cards[id]);
    var isNew = card.status === 'new';
    if (isNew && newUsed(clean, todayDate) >= NEW_LIMIT) throw new RangeError('今天首次评分的新词已达 20 张，请先完成到期复习。');
    if (!isNew && Date.parse(card.dueAt) > now) throw new RangeError('这张词卡尚未到复习时间。');
    if (isNew) { card.introducedAt = iso(now); card.introducedOn = todayDate; }
    var priorStatus = card.status;
    var delayMinutes = 0;
    var interval = 0;
    if (rating === 'again') {
      card.status = 'learning'; card.step = 0; delayMinutes = 1;
      if (priorStatus === 'review') card.lapses += 1;
    } else if (priorStatus === 'review') {
      card.status = 'review'; card.step = 0;
      interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(card.intervalDays * (rating === 'hard' ? 1.2 : rating === 'good' ? 2 : 2.5)) + (rating === 'easy' ? 1 : 0)));
    } else if (rating === 'easy') {
      card.status = 'review'; card.step = 0; interval = 4;
    } else if (rating === 'hard') {
      card.status = 'learning'; delayMinutes = 5;
    } else if (priorStatus === 'learning' && card.step === 1) {
      card.status = 'review'; card.step = 0; interval = 1;
    } else {
      card.status = 'learning'; card.step = 1; delayMinutes = 10;
    }
    card.intervalDays = interval;
    card.lastReviewedAt = iso(now);
    card.lastRating = rating;
    card.repetitions += 1;
    card.dueAt = iso(now + (delayMinutes ? delayMinutes * MINUTE_MS : interval * DAY_MS));
    clean.cards[id] = card;
    return { state: clean, card: Object.assign({}, card), nextDueAt: card.dueAt, isNew: isNew };
  }
  function toAnkiTSV(cards) {
    if (!Array.isArray(cards) || cards.length > MAX_CARDS) throw new TypeError('导出词卡列表无效。');
    function cell(value) {
      var text = String(value === undefined || value === null ? '' : value).replace(/[\t\r\n\u0000-\u001f\u007f]/g, ' ').trim();
      return /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
    }
    return cards.map(function (card) {
      if (!card || typeof card.word !== 'string' || typeof card.meaning !== 'string') throw new TypeError('导出词卡缺少单词或释义。');
      var back = [card.meaning, card.ipa || '', card.context || '', card.day ? '第 ' + card.day + ' 篇' : ''].filter(Boolean).join(' · ');
      return cell(card.word) + '\t' + cell(back);
    }).join('\r\n');
  }
  return Object.freeze({ DAILY_NEW_LIMIT: NEW_LIMIT, MAX_INTERVAL_DAYS: MAX_INTERVAL, ALGORITHM: ALGORITHM, createState: createState, parseState: parseState, getQueue: getQueue, reviewCard: reviewCard, toAnkiTSV: toAnkiTSV });
});
