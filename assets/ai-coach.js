'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const STORAGE_KEY = preview ? 'ielts-ai-coach-preview-v1' : 'ielts-ai-coach-v1';
  let storage;
  let blockedStorage = '';
  const levels = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const questions = {
    academic_task1: [
      { id: 'transport', title: '城市通勤方式', question: 'The table below shows the percentage of commuters using four types of transport in the fictional city of Brookford in 2010 and 2025. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', unit: '原创模拟数据：通勤人数占比（%）；每年合计 100%', columns: ['Transport', '2010', '2025'], rows: [['Car', 52, 38], ['Bus', 25, 29], ['Bicycle', 8, 18], ['Walking', 15, 15]] },
      { id: 'courses', title: '成人课程报名', question: 'The table below compares enrolments on four evening courses at a fictional adult education centre in 2022 and 2025. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', unit: '原创模拟数据：报名人次；一人可报名多门课', columns: ['Course', '2022', '2025'], rows: [['Languages', 120, 180], ['Computing', 90, 160], ['Cooking', 70, 75], ['Photography', 60, 45]] },
      { id: 'energy', title: '家庭用电结构', question: 'The table below shows how household electricity was used in two fictional regions, Northvale and Southmere, in 2025. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', unit: '原创模拟数据：各用途占地区家庭总用电量的比例（%）；每列合计 100%', columns: ['Use', 'Northvale', 'Southmere'], rows: [['Heating', 40, 18], ['Cooling', 8, 32], ['Water heating', 22, 20], ['Appliances', 20, 22], ['Lighting', 10, 8]] },
      { id: 'library', title: '图书馆访问变化', question: 'The table below gives annual visits to three fictional public library branches between 2018 and 2024. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', unit: '原创模拟数据：年访问人次（千人次）', columns: ['Branch', '2018', '2020', '2022', '2024'], rows: [['Central', 120, 70, 110, 140], ['Riverside', 60, 40, 65, 85], ['Hilltop', 45, 30, 40, 42]] },
      { id: 'recycling', title: '不同材料回收率', question: 'The table below shows the recycling rates for four materials in a fictional town in 2015, 2020 and 2025. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', unit: '原创模拟数据：各类废弃物被回收的比例（%）；各行独立，不相加', columns: ['Material', '2015', '2020', '2025'], rows: [['Paper', 48, 58, 65], ['Glass', 35, 47, 60], ['Metal', 55, 57, 59], ['Plastic', 12, 22, 38]] },
      { id: 'work', title: '每周远程工作天数', question: 'The table below shows the distribution of employees by the number of days they worked remotely each week at a fictional company in 2019 and 2025. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.', unit: '原创模拟数据：员工占比（%）；每年合计 100%', columns: ['Remote days per week', '2019', '2025'], rows: [['0 days', 70, 25], ['1–2 days', 20, 45], ['3–4 days', 8, 20], ['5 days', 2, 10]] },
    ],
    academic_task2: [
      { id: 'digital', title: '数字工具与学校教育', question: 'Some people believe schools should spend more money on digital learning tools, while others think that employing more teachers should be the priority. Discuss both views and give your own opinion.' },
      { id: 'transport-policy', title: '公共交通与道路建设', question: 'Governments should invest more in public transport than in building new roads. To what extent do you agree or disagree?' },
      { id: 'work-skills', title: '大学教育的目标', question: 'Some people think universities should mainly prepare students for employment. Others believe universities should also help students explore subjects without an immediate practical use. Discuss both views and give your own opinion.' },
      { id: 'food-waste', title: '家庭食物浪费', question: 'In many places, households throw away large amounts of food. What are the main causes of this problem, and what measures could reduce it?' },
      { id: 'remote-work', title: '远程工作的影响', question: 'More employers are allowing their staff to work from home. Do the advantages of this development outweigh the disadvantages?' },
      { id: 'cities', title: '城市公共空间', question: 'Some people argue that city centres should contain more parks and public spaces, even if this reduces the land available for shops and housing. To what extent do you agree or disagree?' },
    ],
  };
  function validStore(value) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
      (value.drafts === undefined || (value.drafts && typeof value.drafts === 'object' && !Array.isArray(value.drafts) &&
        Object.values(value.drafts).every(entry => entry && typeof entry === 'object' && !Array.isArray(entry) &&
          typeof entry.text === 'string' && entry.text.length <= 10000 &&
          [['context', 3000], ['beforeText', 10000], ['feedback', 24000], ['feedbackMeta', 500], ['disclaimer', 1000]].every(([key, max]) =>
            entry[key] === undefined || (typeof entry[key] === 'string' && entry[key].length <= max)))));
  }
  let stored;
  try {
    storage = preview ? sessionStorage : localStorage;
    stored = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (!validStore(stored)) throw new Error();
  } catch { stored = {}; blockedStorage = '无法读取原有记录，已停止自动保存并保留原数据。请先到备份中心导出记录，并导出当前练习。'; }
  let drafts = stored.drafts || {};
  let lastSavedEntry = 'null';
  let currentKey = '';
  let currentSelection = null;
  let beforeText = '';
  let feedback = '';
  let feedbackMeta = '';
  let disclaimer = '';
  let connection = null;
  let controller = null;
  let busy = false;
  let remaining = 20 * 60;
  let deadline = 0;
  let timerRunning = false;
  const localService = location.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

  function words(text) { return (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length; }
  function message(text, tone = '') { $('coachMessage').textContent = text; $('coachMessage').dataset.tone = tone; }
  function selectedQuestion() { return questions[$('writingTask').value].find(q => q.id === $('questionSelect').value) || questions[$('writingTask').value][0]; }
  function activeKey() { return $('coachMode').value === 'writing' ? 'writing:' + $('writingTask').value + ':' + selectedQuestion().id : $('coachMode').value; }
  function fullPrompt() {
    if ($('coachMode').value !== 'writing') return $('contextPrompt').value.trim();
    const q = selectedQuestion();
    return q.question + (q.columns ? '\n\n' + q.unit + '\n' + q.columns.join(' | ') + '\n' + q.rows.map(row => row.join(' | ')).join('\n') : '') +
      '\n' + ($('writingTask').value === 'academic_task1' ? 'Write at least 150 words.' : 'Give reasons for your answer and include relevant examples. Write at least 250 words.');
  }
  function persist() {
    if (!currentKey) return;
    if (blockedStorage) { $('draftSaved').textContent = blockedStorage; return; }
    try {
      const latest = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
      if (!validStore(latest)) throw new Error();
      const latestDrafts = latest.drafts || {};
      if (JSON.stringify(latestDrafts[currentKey] || null) !== lastSavedEntry) {
        blockedStorage = '另一标签页已修改此题，已停止自动保存。请导出当前练习，再刷新页面核对两份草稿。';
        $('draftSaved').textContent = blockedStorage; return;
      }
      const content = { text: $('coachDraft').value, context: $('contextPrompt').value, beforeText, feedback, feedbackMeta, disclaimer };
      const old = latestDrafts[currentKey];
      if ((!old && Object.values(content).every(value => !value)) || (old && Object.keys(content).every(key => content[key] === (old[key] || '')))) return;
      const entry = { ...content, updatedAt: new Date().toISOString() };
      const merged = { ...latestDrafts, [currentKey]: entry };
      storage.setItem(STORAGE_KEY, JSON.stringify({ ...latest, version: 1, mode: $('coachMode').value, level: $('coachLevel').value, task: $('writingTask').value, question: $('questionSelect').value, drafts: merged }));
      drafts = merged; lastSavedEntry = JSON.stringify(entry);
      $('draftSaved').textContent = (preview ? '预览记录仅保存在当前标签页 · ' : '已保存到此浏览器 · ') + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      blockedStorage = '记录无法安全保存，已停止自动覆盖。请到备份中心导出原记录，并导出当前练习。';
      $('draftSaved').textContent = blockedStorage;
    }
  }
  function showFeedback() {
    $('feedbackEmpty').hidden = !!feedback;
    $('feedbackResult').hidden = !feedback;
    $('coachFeedback').textContent = feedback;
    $('feedbackMeta').textContent = feedbackMeta;
    $('feedbackDisclaimer').textContent = disclaimer;
    compare();
  }
  function compare() {
    $('revisionSection').hidden = !beforeText;
    $('beforeDraft').textContent = beforeText;
    $('afterDraft').textContent = $('coachDraft').value;
    const originalCount = words(beforeText), currentCount = words($('coachDraft').value);
    $('revisionSummary').textContent = beforeText === $('coachDraft').value ?
      '尚未修改。按反馈挑选 3 个问题，直接在上方草稿中改写。' :
      '已修改：提交时 ' + originalCount + ' 词 → 当前 ' + currentCount + ' 词。请逐句确认每处修改的理由。';
  }
  function updateCount() {
    const count = words($('coachDraft').value);
    $('wordCount').textContent = count + ' 词 · ' + $('coachDraft').value.length + '/10000 字符';
    const min = $('writingTask').value === 'academic_task1' ? 150 : 250;
    $('lengthHint').textContent = $('coachMode').value === 'writing' ?
      '至少 ' + min + ' 词；' + (count < min ? '目前还差约 ' + (min - count) + ' 词。' : '已达到最低字数，继续检查内容与结构。') + '字数按英文词及数字估算。' :
      '支持中文问题和英文练习内容，最多 10000 个字符。英文词数只作参考。';
    compare();
  }
  function renderTable(q) {
    const target = $('questionData');
    target.replaceChildren();
    if (!q.columns) return;
    const table = document.createElement('table');
    const caption = document.createElement('caption'); caption.textContent = q.unit; table.append(caption);
    const head = document.createElement('thead'), row = document.createElement('tr');
    q.columns.forEach(value => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = value; row.append(th); });
    head.append(row); table.append(head);
    const body = document.createElement('tbody');
    q.rows.forEach(values => { const tr = document.createElement('tr'); values.forEach((value, i) => { const cell = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) cell.scope = 'row'; cell.textContent = String(value); tr.append(cell); }); body.append(tr); });
    table.append(body); target.append(table);
  }
  function resetTimer() {
    timerRunning = false; deadline = 0;
    remaining = $('writingTask').value === 'academic_task1' ? 20 * 60 : 40 * 60;
    updateTimer();
  }
  function updateTimer() {
    if (timerRunning) {
      remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (!remaining) { timerRunning = false; message('练习时间已到。请先保存这份计时答案，再检查和修改。'); }
    }
    $('timerClock').textContent = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
    $('timerToggle').textContent = timerRunning ? '暂停' : (remaining ? '开始计时' : '已结束');
    $('timerToggle').disabled = !remaining;
  }
  function renderQuestionOptions(preferred) {
    $('questionSelect').replaceChildren();
    questions[$('writingTask').value].forEach((q, i) => { const option = document.createElement('option'); option.value = q.id; option.textContent = String(i + 1).padStart(2, '0') + ' · ' + q.title; $('questionSelect').append(option); });
    if (questions[$('writingTask').value].some(q => q.id === preferred)) $('questionSelect').value = preferred;
  }
  function loadPractice() {
    const writing = $('coachMode').value === 'writing';
    $('writingOptions').hidden = !writing; $('questionBox').hidden = !writing;
    $('customContext').hidden = writing; $('timerBox').hidden = !writing;
    $('speakingNotice').hidden = $('coachMode').value !== 'speaking_text';
    $('draftLabel').textContent = writing ? '你的作文' : ($('coachMode').value === 'grammar' ? '要解释或纠正的句子' : '你的口语回答文字');
    const q = selectedQuestion();
    $('questionTitle').textContent = q.title;
    $('questionPrompt').textContent = q.question;
    $('questionTag').textContent = $('writingTask').value === 'academic_task1' ? 'ACADEMIC TASK 1 · 原创模拟数据' : 'ACADEMIC TASK 2 · 原创议论文题';
    $('questionRequirement').textContent = $('writingTask').value === 'academic_task1' ? '建议 20 分钟，至少 150 词。描述主要特点与关键比较，不推测未提供的原因。' : '建议 40 分钟，至少 250 词。清晰回答题目，用理由与相关示例支持观点。';
    renderTable(q);
    currentKey = activeKey();
    currentSelection = { mode: $('coachMode').value, task: $('writingTask').value, question: $('questionSelect').value };
    const entry = drafts[currentKey] || {};
    lastSavedEntry = JSON.stringify(drafts[currentKey] || null);
    const safe = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
    $('coachDraft').value = safe(entry.text, 10000);
    $('contextPrompt').value = safe(entry.context, 3000);
    beforeText = safe(entry.beforeText, 10000); feedback = safe(entry.feedback, 24000);
    feedbackMeta = safe(entry.feedbackMeta, 500); disclaimer = safe(entry.disclaimer, 1000);
    showFeedback(); updateCount(); resetTimer();
    $('draftSaved').textContent = blockedStorage || (preview ? '预览草稿只保存在当前标签页' : '草稿保存在此浏览器；输入后自动保存');
  }
  function setBusy(value) {
    busy = value;
    ['coachMode', 'coachLevel', 'writingTask', 'questionSelect', 'coachDraft', 'contextPrompt', 'clearDraft', 'refreshCoach'].forEach(id => { $(id).disabled = value; });
    $('refreshCoach').disabled = value || !localService;
    $('sendCoach').disabled = value || !localService || !connection?.connected || !connection?.model;
    $('cancelCoach').hidden = !value;
    $('feedbackResult').setAttribute('aria-busy', String(value));
  }
  async function refreshConnection() {
    if (!localService) {
      $('coachOffline').hidden = false; $('coachConnection').textContent = '离线练习模式'; $('refreshCoach').disabled = true;
      setBusy(false); return;
    }
    try {
      const response = await fetch('/api/ai/status', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error();
      connection = await response.json();
      $('coachConnection').textContent = connection.connected && connection.model ? connection.model : '尚未连接并选择模型';
      $('coachProvider').textContent = connection.connected ? connection.baseUrl : '在 AI 设置连接服务后，返回此页刷新。';
      $('sendDisclosure').textContent = '点击下方按钮，将把当前题目、学习阶段和输入内容发送至 ' + (connection.connected ? connection.baseUrl : '你在 AI 设置中选择的 API 服务') + '。服务商可能收费并按其规则处理内容。';
    } catch { connection = null; $('coachConnection').textContent = '本地服务不可用'; $('coachProvider').textContent = '请启动学习服务，然后刷新连接。'; }
    setBusy(busy);
  }
  async function send() {
    if (busy) return;
    const text = $('coachDraft').value.trim();
    if (!text) { message('请先写下练习内容。', 'error'); $('coachDraft').focus(); return; }
    if (!connection?.connected || !connection?.model) { message('请先在 AI 设置完成连接并选择模型。', 'error'); return; }
    const submittedText = $('coachDraft').value;
    const payload = { mode: $('coachMode').value, text, task: $('coachMode').value === 'writing' ? $('writingTask').value : '', prompt: fullPrompt(), level: $('coachLevel').value };
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort('timeout'), 95000);
    setBusy(true); message('已发送，正在等待模型反馈（最多约 90 秒）…', 'pending');
    try {
      const response = await fetch('/api/ai/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(typeof result.error?.message === 'string' ? result.error.message : '辅导请求失败，请重试。');
      if (typeof result.feedback !== 'string') throw new Error('模型未返回可显示的文字意见。');
      beforeText = submittedText; feedback = result.feedback;
      feedbackMeta = result.model + ' · ' + new Date().toLocaleString() + ' · 非官方训练反馈';
      disclaimer = typeof result.disclaimer === 'string' ? result.disclaimer : 'AI 可能出错，请核对后使用。';
      showFeedback(); persist(); message('反馈已收到。先读建议，再在原草稿上修改。');
    } catch (error) {
      if (controller?.signal.aborted) message(controller.signal.reason === 'timeout' ? '等待超时，草稿已保留。请稍后重试。' : '本次请求已取消，草稿已保留。已发送的内容可能已由服务商处理或计费。');
      else message(error.message || '无法获取反馈，请检查连接。', 'error');
    } finally { clearTimeout(timeout); controller = null; setBusy(false); }
  }
  $('coachMode').value = ['writing', 'grammar', 'speaking_text'].includes(stored.mode) ? stored.mode : (Object.keys(drafts).some(key => key.startsWith('writing:')) ? 'writing' : 'grammar');
  $('coachLevel').value = levels.includes(stored.level) ? stored.level : 'A0';
  $('writingTask').value = Object.hasOwn(questions, stored.task) ? stored.task : 'academic_task1';
  renderQuestionOptions(stored.question); loadPractice();
  function changePractice(kind) {
    persist();
    if (blockedStorage && $('coachDraft').value.trim()) {
      $('coachMode').value = currentSelection.mode; $('writingTask').value = currentSelection.task;
      renderQuestionOptions(currentSelection.question);
      message('当前草稿尚未安全保存，请先导出练习记录，再刷新页面处理存储问题。', 'error');
      return;
    }
    if (kind === 'task') renderQuestionOptions();
    loadPractice(); message('已切换练习。');
  }
  $('coachMode').addEventListener('change', () => changePractice('mode'));
  $('writingTask').addEventListener('change', () => changePractice('task'));
  $('questionSelect').addEventListener('change', () => changePractice('question'));
  $('coachLevel').addEventListener('change', persist);
  $('coachDraft').addEventListener('input', () => { updateCount(); persist(); });
  $('contextPrompt').addEventListener('input', persist);
  $('timerToggle').addEventListener('click', () => { if (timerRunning) { updateTimer(); timerRunning = false; } else { deadline = Date.now() + remaining * 1000; timerRunning = true; } updateTimer(); });
  $('timerReset').addEventListener('click', resetTimer);
  $('sendCoach').addEventListener('click', send);
  $('cancelCoach').addEventListener('click', () => controller?.abort('user'));
  $('refreshCoach').addEventListener('click', refreshConnection);
  $('clearDraft').addEventListener('click', () => {
    if (blockedStorage) { message(blockedStorage, 'error'); return; }
    if (!window.confirm('清除此题的草稿、反馈和修改对比？其他题目保留。')) return;
    $('coachDraft').value = ''; $('contextPrompt').value = ''; beforeText = ''; feedback = ''; feedbackMeta = ''; disclaimer = '';
    updateCount(); showFeedback(); persist(); message('已清除此题的本地记录。');
  });
  $('downloadDraft').addEventListener('click', () => {
    persist();
    const body = 'IELTS 练习记录\n模式：' + $('coachMode').selectedOptions[0].textContent + '\n阶段：' + $('coachLevel').value +
      '\n\n题目\n' + fullPrompt() + '\n\n当前草稿\n' + $('coachDraft').value + '\n\n最近提交\n' + beforeText +
      '\n\nAI 反馈\n' + feedbackMeta + '\n' + disclaimer + '\n' + feedback;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'IELTS练习-' + new Date().toISOString().slice(0, 10) + '.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.addEventListener('beforeunload', () => { persist(); controller?.abort('leave'); });
  if (preview) $('coachPreview').hidden = false;
  setInterval(updateTimer, 500);
  refreshConnection();
})();
