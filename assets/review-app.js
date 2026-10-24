(function () {
  'use strict';
  var Core = globalThis.IELTSReviewCore;
  var preview = new URLSearchParams(location.search).get('preview') === '1';
  var KEY = preview ? 'ielts52-review-preview-v1' : 'ielts52-review-v1';
  var NOTEBOOK_KEY = preview ? 'ielts52-notebook-preview-v1' : 'ielts52-notebook-v1';
  var MAX_IMPORT = 16 * 1024 * 1024;
  var storage = null, baseRaw = null, state = null, deck = [], cardMap = new Map();
  var currentId = null, flipped = false, locked = false, busy = false, audio = null;
  var $ = function (id) { return document.getElementById(id); };
  var ratingButtons = Array.from(document.querySelectorAll('[data-rating]'));
  function today() {
    var date = new Date();
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function now() { return new Date().toISOString(); }
  function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
  function error(message) {
    locked = true;
    $('error-message').textContent = message + ' 原有浏览器记录不会被自动覆盖。';
    $('error-box').hidden = false;
    $('raw-export').hidden = baseRaw === null;
    disablePractice();
  }
  function disablePractice() {
    $('flip-button').disabled = locked || busy || !currentId;
    ratingButtons.forEach(function (button) { button.disabled = locked || busy || !flipped || !currentId; });
    $('export-button').disabled = !state;
    $('anki-button').disabled = !deck.length;
  }
  function localDue(value) {
    return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function stopAudio() { if (audio) { audio.pause(); audio = null; } }
  function filteredIds() {
    var filter = $('lesson-filter').value;
    return deck.filter(function (card) { return filter === 'all' || (filter === 'custom' ? card.id.indexOf('custom-') === 0 : String(card.day) === filter); }).map(function (card) { return card.id; });
  }
  function readDeck() {
    if (!Core || !globalThis.IELTSCourse || !Array.isArray(IELTSCourse.vocab)) throw new Error('课程资源未能加载，请保持 assets 文件夹完整。');
    var custom = globalThis.IELTSNotebook ? IELTSNotebook.load() : [];
    deck = IELTSCourse.vocab.concat(custom);
    Core.createState(deck.map(function (card) { return card.id; }));
    cardMap = new Map(deck.map(function (card) { return [card.id, card]; }));
    var selected = $('lesson-filter').value;
    $('lesson-filter').replaceChildren();
    function option(value, label) { var node = document.createElement('option'); node.value = value; node.textContent = label; $('lesson-filter').appendChild(node); }
    option('all', '全部词卡'); option('custom', '我的生词本');
    (IELTSCourse.lessons || []).forEach(function (lesson) { option(String(lesson.day), '第 ' + lesson.day + ' 篇 · ' + (lesson.cn || lesson.title || '课文')); });
    if (Array.from($('lesson-filter').options).some(function (item) { return item.value === selected; })) $('lesson-filter').value = selected;
  }
  function refreshDelays() {
    if (!currentId || !state) return;
    var time = now();
    ratingButtons.forEach(function (button) {
      try {
        var result = Core.reviewCard(state, currentId, button.dataset.rating, time, today());
        var minutes = Math.round((Date.parse(result.nextDueAt) - Date.parse(time)) / 60000);
        button.querySelector('[data-delay]').textContent = minutes < 1440 ? minutes + ' 分钟后' : Math.round(minutes / 1440) + ' 天后';
      } catch (err) { button.querySelector('[data-delay]').textContent = '刷新后重试'; }
    });
  }
  function renderCard(id) {
    stopAudio(); currentId = id; flipped = false;
    $('audio-message').textContent = '';
    $('card-answer').hidden = true; $('rating-buttons').hidden = true;
    $('flip-button').hidden = false; $('recall-prompt').hidden = false;
    $('card-area').hidden = false; $('empty-state').hidden = true;
    var card = cardMap.get(id), record = state.cards[id];
    $('card-status').textContent = record.status === 'new' ? '新词 · 先尝试回忆' : record.status === 'learning' ? '学习中 · 再次回想' : '到期复习';
    $('card-lesson').textContent = (id.indexOf('custom-') === 0 ? '我的生词 · ' : '') + '第 ' + card.day + ' 篇';
    $('card-word').textContent = card.word;
    $('card-ipa').textContent = card.ipa || '';
    $('audio-button').hidden = !card.audio;
    $('audio-message').textContent = card.audio ? '' : '这张词卡未附音频';
    $('card-meaning').textContent = card.meaning;
    $('card-context').textContent = card.context || '';
    $('context-box').hidden = !card.context;
    $('lesson-link').href = '开始学习.html' + (preview ? '?preview=1' : '') + '#day' + encodeURIComponent(card.day);
    refreshDelays(); disablePractice();
  }
  function renderQueue(keepCurrent) {
    if (!state) { $('empty-title').textContent = '先恢复可读取的记录'; $('empty-message').textContent = '可以下载原始记录保留副本，再导入有效的复习 JSON。'; $('card-area').hidden = true; $('empty-state').hidden = false; return; }
    try {
      var ids = filteredIds(), time = now(), date = today();
      var queue = Core.getQueue(state, time, date, ids);
      var allQueue = Core.getQueue(state, time, date, deck.map(function (card) { return card.id; }));
      $('due-count').textContent = queue.dueCount; $('new-used').textContent = queue.newUsed; $('deck-count').textContent = ids.length;
      $('deck-caption').textContent = $('lesson-filter').value === 'all' ? '课程词汇与个人生词' : '当前所选篇章 / 生词本';
      var missing = Object.keys(state.cards).filter(function (id) { return !cardMap.has(id); }).length;
      $('history-note').textContent = missing ? '已保留 ' + missing + ' 张当前词库未加载的历史卡片；恢复对应生词本后会重新显示，今天的学习额度仍计入。' : '本机记录覆盖 ' + Object.keys(state.cards).length + ' 张词卡。请定期备份。';
      $('queue-note').textContent = '本筛选待处理 ' + queue.ids.length + ' 张；今天还可首次评分 ' + queue.newRemaining + ' 张新词。' + (allQueue.dueCount > queue.dueCount ? ' 其他篇章还有 ' + (allQueue.dueCount - queue.dueCount) + ' 张到期，请切回全部词卡优先复习。' : '');
      if (keepCurrent && currentId && queue.ids.indexOf(currentId) >= 0) { disablePractice(); return; }
      if (queue.ids.length) renderCard(queue.ids[0]);
      else {
        stopAudio(); currentId = null; flipped = false;
        $('card-area').hidden = true; $('empty-state').hidden = false;
        $('empty-title').textContent = !ids.length ? '这个选择里还没有词卡' : queue.newRemaining === 0 && queue.newAvailable ? '今天的新词额度已完成' : '当前到期词卡已处理';
        $('empty-message').textContent = !ids.length ? '可以选择其他篇章，或在课文中添加个人生词。' : (queue.nextDueAt ? '下一张将在 ' + localDue(queue.nextDueAt) + ' 到期。到期后会自动加入队列。' : '稍后或明天再来回想，也可以把词放进自己的句子里。') + (queue.newRemaining === 0 && queue.newAvailable ? ' 新词上限明天恢复；已学词的到期复习不受这个上限限制。' : '');
        disablePractice();
      }
    } catch (err) { error('复习队列未能读取：' + err.message); }
  }
  function load() {
    stopAudio(); currentId = null; flipped = false; state = null; locked = false; baseRaw = null;
    $('error-box').hidden = true; notice('');
    try {
      storage = preview ? sessionStorage : localStorage;
      baseRaw = storage.getItem(KEY);
      if (baseRaw !== null && baseRaw.length > MAX_IMPORT) throw new Error('已保存的复习记录超过 16 MB，请先下载原始记录。');
      readDeck();
      state = baseRaw === null ? Core.createState(deck.map(function (card) { return card.id; })) : Core.parseState(baseRaw, deck.map(function (card) { return card.id; }), now());
      renderQueue(false);
    } catch (err) { error('无法读取复习资料：' + err.message); renderQueue(false); }
    disablePractice();
  }
  function save(candidate, recovery) {
    if (!storage) throw new Error('浏览器存储不可用，请允许此页面保存本机记录。');
    if (locked && !recovery) throw new Error('保存已暂停，请先重新读取或恢复记录。');
    if (storage.getItem(KEY) !== baseRaw) throw new Error('另一页面已更新复习记录。请先导出本页副本，再重新读取最新记录。');
    var serialized = JSON.stringify(Core.parseState(candidate, deck.map(function (card) { return card.id; }), now()));
    storage.setItem(KEY, serialized);
    baseRaw = serialized; state = candidate;
  }
  function flip() {
    if (!currentId || locked || busy || flipped) return;
    flipped = true;
    $('card-answer').hidden = false; $('rating-buttons').hidden = false;
    $('flip-button').hidden = true; $('recall-prompt').hidden = true;
    refreshDelays(); disablePractice();
  }
  function rate(rating) {
    if (!currentId || !flipped || locked || busy) return;
    busy = true; disablePractice();
    try {
      var word = cardMap.get(currentId).word;
      var result = Core.reviewCard(state, currentId, rating, now(), today());
      save(result.state, false);
      notice('已保存「' + word + '」的评分，下次复习：' + localDue(result.nextDueAt) + '。');
      renderQueue(false);
    } catch (err) { error('本次评分未保存：' + err.message); }
    finally { busy = false; disablePractice(); }
  }
  function download(text, name, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type || 'application/json;charset=utf-8' }));
    var link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  $('flip-button').addEventListener('click', flip);
  ratingButtons.forEach(function (button) { button.addEventListener('click', function () { rate(button.dataset.rating); }); });
  $('lesson-filter').addEventListener('change', function () { renderQueue(false); });
  $('refresh-queue').addEventListener('click', function () { renderQueue(true); });
  $('reload-button').addEventListener('click', load);
  $('audio-button').addEventListener('click', function () {
    if (!currentId || !cardMap.get(currentId).audio) return;
    stopAudio();
    try {
      var source = cardMap.get(currentId).audio;
      if (!/^audio\/[A-Za-z0-9_./%\-]+\.mp3$/.test(source) || source.indexOf('..') >= 0) throw new Error('音频路径无效');
      audio = new Audio(source); $('audio-message').textContent = '正在播放';
      audio.addEventListener('ended', function () { $('audio-message').textContent = ''; });
      audio.addEventListener('error', function () { $('audio-message').textContent = '无法播放，请检查 audio 文件夹是否完整。'; });
      audio.play().catch(function () { $('audio-message').textContent = '播放未成功，请再次点击或检查音频文件。'; });
    } catch (err) { $('audio-message').textContent = err.message; }
  });
  $('export-button').addEventListener('click', function () { if (state) download(JSON.stringify(state, null, 2), 'IELTS-生词复习-' + today() + '.json'); });
  $('raw-export').addEventListener('click', function () { if (baseRaw !== null) download(baseRaw, 'IELTS-生词复习-原始记录-' + today() + '.txt', 'text/plain;charset=utf-8'); });
  $('anki-button').addEventListener('click', function () {
    try {
      var ids = filteredIds();
      if (!ids.length) { notice('当前筛选没有可导出的词卡。'); return; }
      download(Core.toAnkiTSV(ids.map(function (id) { return cardMap.get(id); })), 'IELTS-词卡-' + today() + '.tsv', 'text/tab-separated-values;charset=utf-8');
      notice('已导出 ' + ids.length + ' 张词卡；复习安排请另存 JSON。');
    } catch (err) { notice('导出失败：' + err.message); }
  });
  $('import-input').addEventListener('change', async function (event) {
    var file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT) throw new Error('备份超过 16 MB。');
      if (!deck.length) readDeck();
      var candidate = Core.parseState(await file.text(), deck.map(function (card) { return card.id; }), now());
      if (!window.confirm('已验证 ' + Object.keys(candidate.cards).length + ' 张词卡的复习记录。导入会替换本浏览器的复习日程；继续前请确认已经导出当前记录。是否导入？')) return;
      save(candidate, true); locked = false; $('error-box').hidden = true; renderQueue(false);
      notice('复习记录已恢复，未在当前词库中的历史卡片也已保留。');
    } catch (err) { notice('未导入：' + err.message); }
  });
  document.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.code === 'Space') { event.preventDefault(); flip(); }
    else if (/^[1-4]$/.test(event.key) && flipped) { event.preventDefault(); rate(['again', 'hard', 'good', 'easy'][Number(event.key) - 1]); }
  });
  window.addEventListener('storage', function (event) {
    if (event.storageArea !== storage) return;
    if ((event.key === KEY || event.key === null) && event.newValue !== baseRaw) error('另一个页面已修改本机复习记录。请先导出本页副本，然后重新读取。');
    if (event.key === NOTEBOOK_KEY) notice('个人生词本已更新。刷新此页面加载新词卡。');
  });
  $('preview-banner').hidden = !preview;
  if (preview) document.querySelectorAll('a[href$=".html"]').forEach(function (link) { link.href += '?preview=1'; });
  load();
  setInterval(function () { if (!document.hidden && !locked && !busy && state) renderQueue(true); }, 10000);
})();
