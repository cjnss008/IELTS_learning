(function () {
  'use strict';
  const Core = globalThis.IELTSPlanCore;
  const Store = globalThis.IELTSPlanState;
  const Content = globalThis.IELTSPlanContent;
  const Curriculum = globalThis.IELTSCurriculumData;
  const Records = globalThis.IELTSRecords;
  const $ = (id) => document.getElementById(id);
  if (!Core || !Store || !Content || !Curriculum || !Records || !globalThis.IELTSProfiles) {
    $('storageMessage').hidden = false;
    $('storageMessage').textContent = '日程文件未完整加载，请保持 assets 文件夹与页面在同一目录后重新打开。';
    return;
  }
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  const previewLink = (url) => url + (preview ? (url.includes('?') ? '&' : '?') + 'preview=1' : '');
  const curriculumMaterials = new Map(Curriculum.materials.map((material) => [material.id, material]));
  const key = 'ielts52-daily-plan-v1';
  const skillNames = { listening: '听力', speaking: '口语', reading: '阅读', writing: '写作' };
  const kindNames = { study: '学习日', review: '复盘日', checkpoint: '阶段测评日' };
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function localDate() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  const today = () => localDate();
  let profileStorage;
  const storage = () => profileStorage || (profileStorage = IELTSProfiles.storage());
  let linkedRecords = [], linkedByDay = {}, linkedFailure = '';
  const linkedFor = (day) => linkedByDay[day] || { totalRecords: 0, minutes: 0, tasks: {}, records: [] };
  const effectiveFor = (day, plan) => Store.combineEvidence(plan || Store.getPlan(state, day, Content), recordFor(day).tasks, linkedFor(day));
  let blockedStorage = false;
  let originalCorruptData = null;
  let state = Store.newState(today());
  let persistTimer;
  let savingFailed = false;
  let showValidation = false;
  let currentPlan;
  let lastStoredRaw = null;
  let lastSavedState = null;
  let storageConflict = false;
  function showStorageError(message) {
    $('storageMessage').textContent = message;
    $('storageMessage').hidden = false;
  }
  try {
    const raw = storage().getItem(key);
    lastStoredRaw = raw;
    if (raw) {
      try { state = Store.parseState(raw); lastSavedState = JSON.stringify(state); }
      catch (error) {
        blockedStorage = true;
        originalCorruptData = raw;
        showStorageError('已有记录格式无法识别，原始记录已保留。请先点击“导出记录”保存原始备份，再导入有效记录恢复；当前不会覆盖旧记录。');
      }
    }
  } catch (error) {
    savingFailed = true;
    showStorageError('当前浏览器不允许保存记录。可以继续填写，并用“导出记录”保存本次进度。');
  }
  const actualDay = () => Core.dayForDate(state.startDate, today());
  const clampDay = (day) => Math.max(1, Math.min(364, day));
  const hashDay = /^#day(\d+)$/.exec(location.hash);
  let selectedDay = hashDay && Number(hashDay[1]) >= 1 && Number(hashDay[1]) <= 364 ? Number(hashDay[1]) : clampDay(actualDay());

  function persist() {
    clearTimeout(persistTimer);
    if (blockedStorage) return false;
    try {
      const serialized = JSON.stringify(state);
      if (serialized === lastSavedState) return true;
      if (storageConflict || storage().getItem(key) !== lastStoredRaw) {
        storageConflict = true;
        savingFailed = true;
        showStorageError('另一个标签页已更新学习记录，本页已停止自动保存以免覆盖。请先导出本页草稿，再刷新读取最新记录；必要时通过导入恢复选定备份。');
        $('saveStatus').textContent = '记录冲突：请先导出本页草稿';
        return false;
      }
      storage().setItem(key, serialized);
      lastStoredRaw = serialized;
      lastSavedState = serialized;
      savingFailed = false;
      $('saveStatus').textContent = preview ? '预览记录已保存到本次浏览器会话' : '已保存到当前浏览器';
      $('storageMessage').hidden = true;
      return true;
    } catch (error) {
      savingFailed = true;
      $('saveStatus').textContent = '尚未保存，请导出备份';
      showStorageError('浏览器未能保存更新，可能是存储空间不足或保存权限受限。当前输入仍在页面中，请立即导出记录备份。');
      return false;
    }
  }
  function scheduleSave() {
    clearTimeout(persistTimer);
    $('saveStatus').textContent = '正在保存…';
    persistTimer = setTimeout(() => { persist(); renderStats(); renderWeekDays(); }, 350);
  }
  function recordFor(day) { return state.days[String(day)] || { tasks: {} }; }
  function isSubmitted(day) {
    const record = recordFor(day);
    if (!record.completedAt || day > actualDay()) return false;
    const plan = Store.getPlan(state, day, Content);
    if (plan.kind === 'checkpoint' && !state.assessments.some((a) => a.week === plan.week)) return false;
    return Core.summarizeDay(plan, effectiveFor(day, plan)).complete;
  }
  function renderStats() {
    let completed = 0, overdue = 0, minutes = 0;
    const dayNow = actualDay();
    for (let d = 1; d <= 364; d++) {
      if (isSubmitted(d)) completed++;
      else if (d < dayNow) overdue++;
      if (d <= dayNow) minutes += Core.summarizeDay(Store.getPlan(state, d, Content), effectiveFor(d)).minutes;
    }
    $('completedDays').innerHTML = `${completed} <small>/ 364</small>`;
    $('loggedHours').innerHTML = `${(minutes / 60).toFixed(1)} <small>小时</small>`;
    $('overdueDays').textContent = String(overdue);
    const missing = Array.from({ length: 13 }, (_, i) => (i + 1) * 4).find((week) => !state.assessments.some((a) => a.week === week));
    $('nextCheckpoint').textContent = missing ? `第 ${missing} 周` : '13 次已记录';
  }
  function renderWeekDays() {
    const week = Math.ceil(selectedDay / 7);
    const dayNow = actualDay();
    $('weekDays').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = (week - 1) * 7 + i + 1;
      const done = isSubmitted(d);
      const label = done ? '✓ 已交' : d === dayNow ? '今天' : d < dayNow ? '待补' : '待学';
      const date = Core.dateForDay(state.startDate, d);
      return `<button type="button" class="day-button" data-day="${d}" aria-current="${d === selectedDay}"><span><strong>第 ${i + 1} 天</strong><small>${date.slice(5).replace('-', '/')}</small></span><span class="day-dot ${!done && d < dayNow ? 'overdue' : ''}">${label}</span></button>`;
    }).join('');
  }
  function renderWeek() {
    const w = currentPlan.weekInfo;
    const stage = Content.stages.find((s) => s.id === w.stageId);
    const courseWeek = Curriculum.weeks.find((item) => item.week === currentPlan.week);
    const guidance = currentPlan.planVersion === Core.LEGACY_PLAN_VERSION ? w.guidance : courseWeek?.extensive?.instructions || '从任务卡进入指定材料，保留独立作答、订正和新题复测的证据。';
    $('weekSelect').value = String(currentPlan.week);
    $('weekOverview').innerHTML = `<span class="stage-label">${escape(stage?.title || '')}</span><h3>${escape(w.title)}</h3><p><strong>本周语法：</strong>${escape(w.grammarFocus)}</p><p>${escape(guidance)}</p>`;
    const reading = w.foundation ? `<a href="基础入门.html?week=${w.week}">第 ${w.week} 周基础讲解与练习 →</a>` : w.lessonDay ? `<a href="开始学习.html#day${w.lessonDay}">第 ${w.lessonDay} 篇补充课文 →</a>` : '';
    const extensive = courseWeek?.extensive;
    const extensiveLinks = [['reading', '本周泛读材料'], ['listening', '本周泛听材料']].map(([skill, title]) => {
      const ids = extensive?.[skill + 'Ids'] || [];
      const materials = ids.map((id) => curriculumMaterials.get(id)).filter((material) => material?.skill === skill && material.pool === 'training' && !material.fullTest);
      return `<section class="extensive-materials" data-skill="${skill}"><h4>${title}</h4>${materials.length ? materials.map((material) => `<a href="${escape(previewLink('学习课程.html?day=' + selectedDay + '&material=' + encodeURIComponent(material.id) + '&mode=practice&activity=extensive'))}">${escape(material.title)} →</a>`).join('') : '<p>此类材料尚未生成。</p>'}</section>`;
    }).join('');
    const week = currentPlan.week;
    // Keep these edition blocks aligned with materials/textbook-training-map.json.
    const edition = week >= 49 ? 19 : week >= 37 ? 16 + Math.floor((week - 37) / 4) : week >= 21 ? 4 + Math.floor((week - 21) / 4) : null;
    const testNumber = edition === null ? null : (week - (week >= 37 ? 37 : 21)) % 4 + 1;
    const textbook = edition === null ? '' : `<h4>第 ${week} 周教材建议</h4><a data-textbook-week="${week}" href="${escape(previewLink('本地教材.html?edition=' + edition + '&type=exam'))}">剑桥 ${edition} · Test ${testNumber}${week >= 49 ? ' · 末期保留' : ''}：先核对曝光 →</a><p>${week >= 49 ? '先在教材库检查是否已见，准备使用时再展开保留卷。' : '教材读写练习安排在原阅读、写作时段内。'}进入索引不会登记曝光；点击 PDF 才登记。当前教材缺配套真题听力音频，不作为四科完整模考。</p>`;
    $('materials').innerHTML = `<h4>学习材料入口</h4><a href="${escape(previewLink('学习课程.html?day=' + selectedDay))}">第 ${selectedDay} 天课程与作品提交 →</a>${extensiveLinks}<p>泛读、泛听包含在原阅读、听力时段内，不另加时间；每天仍为 360 分钟。已见材料只作流畅度练习，不计陌生测评。</p>${textbook}<a href="${escape(previewLink('本地教材.html'))}">本地教材、剑雅试卷与曝光记录 →</a>${reading}<a href="生词复习.html">到期词卡与原句复习</a><a href="口语练习.html">口语录音与回听</a><a href="写作与AI辅导.html">写作与语法辅导</a><p>${currentPlan.planVersion === Core.LEGACY_PLAN_VERSION ? '此日保留旧版日程与完成量单位；课程可作为补充材料，相同单位的作品才计入旧任务。' : '各任务卡列出今日指定材料。按材料独立作答、提交原稿，再做订正与延迟复测；课程训练不等于正式成绩。'}</p>`;
    renderWeekDays();
  }
  function renderTasks() {
    const records = recordFor(selectedDay).tasks;
    $('taskList').innerHTML = currentPlan.tasks.map((task, i) => {
      const r = records[task.id] || {};
      const materials = task.materials ? `<div class="task-materials"><strong>本项指定材料</strong>${task.materials.length ? task.materials.map(m => `<a href="${escape(previewLink(m.url))}">${escape(m.title)} →</a>`).join('') : '<p>此项材料尚未生成，当前仅可预览日程。</p>'}</div>` : '';
      return `<article class="task-card" data-task="${escape(task.id)}"><div class="task-top"><div class="task-title"><span class="task-number">${String(i + 1).padStart(2, '0')}</span><div><h3>${escape(task.title)}</h3><p>${task.minutes} 分钟 · 至少 ${task.quantity} ${escape(task.unit)}</p></div></div><span class="task-status">待完成</span></div><p class="task-instruction">${escape(task.instruction)}</p>${materials}<div class="task-inputs"><label for="minutes-${task.id}">实际学习分钟<input type="number" min="0" max="600" step="1" id="minutes-${task.id}" data-field="actualMinutes" value="${escape(r.actualMinutes ?? '')}" inputmode="numeric"></label><label for="quantity-${task.id}">已完成数量（${escape(task.unit)}）<input type="number" min="0" max="10000" step="1" id="quantity-${task.id}" data-field="actualQuantity" value="${escape(r.actualQuantity ?? '')}" inputmode="numeric"></label></div><label class="evidence-label" for="evidence-${task.id}">学习成果与复盘记录<textarea id="evidence-${task.id}" data-field="evidence" maxlength="1200" placeholder="${escape(task.evidenceHint)}">${escape(r.evidence || '')}</textarea></label><p class="task-issues" hidden></p></article>`;
    }).join('');
    const future = selectedDay > actualDay();
    $('tasksForm').querySelectorAll('input,textarea,button').forEach((el) => { el.disabled = future || blockedStorage; });
    updateTaskProgress();
  }
  function updateTaskProgress() {
    const records = effectiveFor(selectedDay, currentPlan);
    currentPlan.tasks.forEach((task) => {
      const card = $('taskList').querySelector(`[data-task="${task.id}"]`);
      const result = Core.validateTask(task, records[task.id]);
      card.classList.toggle('complete', result.complete);
      card.querySelector('.task-status').textContent = result.complete ? '量已达标' : '待完成';
      const issues = card.querySelector('.task-issues');
      issues.hidden = !showValidation || result.complete;
      issues.textContent = result.issues.join('；');
      let linked = card.querySelector('.linked-task');
      if (!linked) { linked = document.createElement('p'); linked.className = 'linked-task small'; card.querySelector('.task-instruction').after(linked); }
      const work = linkedFor(selectedDay).tasks[task.id];
      linked.textContent = work ? `自动关联 ${work.count} 份作品 · ${work.minutes.toFixed(1)} 分钟 · ${Object.entries(work.quantities).map(([unit, n]) => `${n} ${unit}`).join('、') || '未标数量'}。同单位数量已计入本项；手填值视为包含作品的总量，取较大值以避免重复。` : '此项尚无关联作品。以下可填写线下学习的自报总量；不代表独立掌握。';
    });
    const summary = Core.summarizeDay(currentPlan, records);
    $('taskProgress').textContent = `${summary.completedTasks} / ${summary.totalTasks} 项达到计划量 · 已记 ${summary.minutes} 分钟`;
    $('dayProgress').max = summary.totalTasks;
    $('dayProgress').value = summary.completedTasks;
    $('dayResult').textContent = isSubmitted(selectedDay) ? '今日完成量已提交。自报记录与关联作品均不等于已掌握；请查看下方订正和复测。' : '关联作品自动计入相同单位的学习量。线下学习可补填自报总量和成果，再提交。';
    $('submitDay').textContent = isSubmitted(selectedDay) ? '更新今日成果' : '提交今日成果';
  }
  function renderDay() {
    currentPlan = Store.getPlan(state, selectedDay, Content);
    showValidation = false;
    location.hash = `day${selectedDay}`;
    $('dayEyebrow').textContent = `WEEK ${String(currentPlan.week).padStart(2, '0')} · DAY ${String(selectedDay).padStart(3, '0')}${preview ? ' · 预览模式' : ''}`;
    $('dayTitle').textContent = `第 ${currentPlan.week} 周 · 第 ${currentPlan.weekday} 天`;
    $('daySubtitle').textContent = `${Core.dateForDay(state.startDate, selectedDay)} · ${kindNames[currentPlan.kind]} · ${currentPlan.weekInfo.title}`;
    $('dayMinutes').textContent = currentPlan.totalMinutes;
    const messages = [];
    if (currentPlan.planVersion === Core.LEGACY_PLAN_VERSION) messages.push('此日已有旧版记录，继续沿用原任务、数量和单位。旧记录不会被换算为新课程的题数或词数。');
    else if (currentPlan.curriculumStatus !== 'complete-material-set') messages.push('课程材料仍在开发预览；任务卡只链接当前已生成材料，待材料完整后再按正式日程学习。');
    if (selectedDay > actualDay()) messages.push('这是未来日程预览。到对应日期后即可填写和提交学习成果。');
    if (actualDay() > 364) messages.push('52 周计划日期已结束。请依据最后测评结果继续补强，并以正式考试成绩确认目标。');
    if (currentPlan.kind === 'checkpoint') messages.push('今天包含阶段检查。请在下方保存本周测评记录，再提交今日成果。基础阶段使用适级任务，不强行换算雅思分数。');
    const previousCheckpoint = Math.floor((currentPlan.week - 1) / 4) * 4;
    if (previousCheckpoint && !state.assessments.some((a) => a.week === previousCheckpoint)) messages.push(`第 ${previousCheckpoint} 周测评尚未记录，请先补齐能力证据，确定本阶段需要加强的项目。`);
    $('dayNotice').hidden = !messages.length;
    $('dayNotice').textContent = messages.join(' ');
    const boost = state.boosts[String(selectedDay)];
    $('boostNotice').hidden = !boost;
    $('boostNotice').textContent = boost ? `本日补强重点：${skillNames[boost.skill]}。在对应任务内安排 20 分钟针对练习和 10 分钟复测，包含在每日 360 分钟内。` : '';
    renderWeek();
    renderTasks();
    renderEvidence();
    $('assessmentWeek').value = String(currentPlan.week);
  }
  function renderAssessments() {
    const readiness = Store.readiness(state);
    $('readiness').innerHTML = `<strong>${readiness.ready ? '近期录入结果达到 7.0 训练线' : '逐步积累达标证据'}</strong><span>最近 3 次完整测评中，${readiness.qualifyingCount} 次满足四项 ≥ 7.0 及评阅条件。此处依据手动录入；AI 反馈属于估计，不代表正式成绩。</span>`;
    const history = [...state.assessments].sort((a, b) => b.date.localeCompare(a.date));
    $('assessmentHistory').innerHTML = history.length ? history.slice(0, 8).map((a) => `<article class="assessment-entry"><h4>第 ${a.week} 周 · ${a.date}</h4><p>${a.type === 'foundation' ? '基础检查' : a.type === 'official' ? '正式成绩记录' : '完整模考记录'} · ${escape(a.source)}</p>${a.type === 'foundation' ? `<p class="scores">${a.result === 'pass' ? '基础任务可独立完成' : '需要补强：' + a.weakSkills.map((s) => skillNames[s]).join('、')}</p>` : `<p class="scores">听 ${a.scores.listening} · 说 ${a.scores.speaking} · 读 ${a.scores.reading} · 写 ${a.scores.writing}</p><p>${a.reviewed ? '已记录完整测评与评阅确认' : '评阅条件尚未确认'}</p>`}<p>${escape(a.notes)}</p></article>`).join('') : '<p class="empty-state">尚无测评记录。先完成入门学习，按阶段保留答题、作文与录音证据。</p>';
  }
  function renderAll() {
    $('startDate').value = state.startDate;
    $('assessmentDate').value = today();
    $('assessmentDate').max = today();
    $('assessmentDate').min = state.startDate;
    renderDay();
    renderStats();
    renderAssessments();
    if (preview) $('setupStatus').textContent = '预览模式：记录保存在独立的临时会话中，不影响正式学习记录。';
  }
  function renderEvidence() {
    const sum = linkedFor(selectedDay);
    $('evidenceStatus').textContent = linkedFailure || `本日 ${sum.totalRecords} 份作品，关联有效时间 ${sum.minutes.toFixed(1)} 分钟。时间重叠按提交时段保守去重；数量与掌握状态分别显示。`;
    const work = Object.values(sum.tasks).flatMap(t => t.records).sort((a,b) => b.submittedAt.localeCompare(a.submittedAt));
    $('linkedEvidence').innerHTML = work.length ? work.slice(0, 100).map(r => {
      const s = r.learningStatus, flags = Object.entries(r.assistance).filter(([,v])=>v).map(([k])=>({hint:'提示',answer:'看过答案',ai:'AI 辅助'}[k]));
      const url = new URLSearchParams({day:String(selectedDay),material:r.materialId,parent:r.id,mode:'practice',kind:'correction'});
      if(preview)url.set('preview','1');
      const due = Date.now() >= Date.parse(s.dueAt);
      const retest = new URLSearchParams({day:String(clampDay(actualDay())),parent:r.id,mode:'assessment',kind:'retest'});
      if(preview)retest.set('preview','1');
      const answer = r.answer.length > 12000 ? r.answer.slice(0,12000) + '\n…完整原稿保存在作品库，可到备份中心导出。' : r.answer;
      return `<article class="evidence-card"><div><strong>${escape(r.title)}</strong><span class="evidence-state">${escape(s.label)}</span></div><p class="small">${escape(r.source)} · ${escape(r.materialId)} · ${escape(r.submittedAt.replace('T',' ').slice(0,16))} UTC · ${r.minutes.toFixed(1)} 分钟 · ${r.quantity} ${escape(r.unit)} · ${flags.length?escape(flags.join('、')):'未标记使用辅助'} · v${r.version}</p><p class="small">${r.kind==='original'?'保留原稿':r.kind==='correction'?'订正作品':'复测作品'}${r.parentId?' · 前一作品 '+escape(r.parentId):''}；复测窗口 ${escape(s.dueAt.slice(0,16).replace('T',' '))}–${escape(s.until.slice(0,16).replace('T',' '))} UTC</p><details><summary>查看原稿、反馈与修订</summary><pre>${escape(answer||'原稿为录音，请到口语页回听或到备份中心导出音频。')}</pre>${r.media.map(m=>`<p class="small">录音：${escape(m.name)} · ${Math.round(m.durationSeconds)} 秒 · ${escape(m.id)}</p>`).join('')}${r.history.map(h=>`<div class="evidence-feedback"><strong>第 ${h.version} 版 · ${escape(h.evaluation.method)} · ${escape(h.evaluation.result)}</strong><pre>${escape(h.evaluation.feedback||'尚无反馈')}</pre><p>${escape(h.notes)}</p></div>`).join('')}</details><p><a href="学习课程.html?${escape(url.toString())}">保留原稿后订正</a>${due?` · <a href="学习课程.html?${escape(retest.toString())}">选择同技能新材料复测</a>`:' · 到 48 小时后可做新题复测'}</p></article>`;
    }).join('') : '<p class="small">课程、写作、口语或选区练习提交后，作品将自动关联到实际学习日。旧版打卡继续保留为自报；不会自动变成独立掌握证据。</p>';
    if(work.length>100)$('linkedEvidence').insertAdjacentHTML('beforeend','<p>本页显示最近 100 份作品；完整记录可到备份中心导出。</p>');
  }
  async function refreshEvidence() {
    try { linkedRecords = await Records.list(); linkedByDay = Records.summaries(linkedRecords); linkedFailure = ''; }
    catch(error) { linkedFailure = '作品库暂时无法读取，原记录保留：'+error.message; }
    renderEvidence(); updateTaskProgress(); renderStats(); renderWeekDays();
  }
  $('weekSelect').innerHTML = Content.weeks.map((w) => `<option value="${w.week}">第 ${w.week} 周 · ${escape(w.title)}</option>`).join('');
  $('assessmentWeek').innerHTML = Content.weeks.map((w) => `<option value="${w.week}">第 ${w.week} 周${w.week % 4 === 0 ? '（阶段检查）' : ''}</option>`).join('');
  $('weekSelect').addEventListener('change', () => { persist(); selectedDay = (Number($('weekSelect').value) - 1) * 7 + 1; renderDay(); });
  $('weekDays').addEventListener('click', (event) => { const b = event.target.closest('[data-day]'); if (b) { persist(); selectedDay = Number(b.dataset.day); renderDay(); } });
  $('todayButton').addEventListener('click', () => { persist(); selectedDay = clampDay(actualDay()); renderDay(); });
  $('startForm').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const date = $('startDate').value;
      Core.parseStartDate(date);
      Core.dateForDay(date, 364);
      if (blockedStorage) throw new Error('请先导出原始记录并通过导入恢复，再调整日期。');
      if (date !== state.startDate && (Object.keys(state.days).length || state.assessments.length || linkedRecords.length)) {
        $('setupStatus').textContent = '已有学习记录时保持开课日期固定，以免错置历史日期。新计划请先导出备份，再使用新的浏览器档案开始。';
        $('startDate').value = state.startDate;
        return;
      }
      state.startDate = date;
      persist(); selectedDay = clampDay(actualDay()); renderAll();
      $('setupStatus').textContent = `计划从 ${date} 开始，至 ${Core.dateForDay(date, 364)}。每天 360 分钟，共 2184 小时。${preview ? '（预览模式）' : ''}`;
    } catch (error) { $('setupStatus').textContent = error.message; }
  });
  $('tasksForm').addEventListener('input', (event) => {
    const field = event.target.dataset.field;
    const card = event.target.closest('[data-task]');
    if (!field || !card || selectedDay > actualDay() || blockedStorage) return;
    const day = state.days[String(selectedDay)] || (state.days[String(selectedDay)] = { planVersion: currentPlan.planVersion, tasks: {} });
    day.planVersion = currentPlan.planVersion;
    const r = day.tasks[card.dataset.task] || (day.tasks[card.dataset.task] = { actualMinutes: null, actualQuantity: null, evidence: '' });
    if (field === 'evidence') r[field] = event.target.value.slice(0, 1200);
    else {
      const value = event.target.value === '' ? null : Number(event.target.value);
      const maximum = field === 'actualMinutes' ? 600 : 10000;
      const valid = value === null || (Number.isInteger(value) && value >= 0 && value <= maximum);
      r[field] = valid ? value : null;
      event.target.setCustomValidity(valid ? '' : `请输入 0 到 ${maximum} 之间的整数。`);
      if (!valid) showValidation = true;
    }
    const dayMinutes = Object.values(day.tasks).reduce((sum, item) => sum + (item.actualMinutes || 0), 0);
    if (dayMinutes > 1440 && field === 'actualMinutes') {
      r.actualMinutes = null;
      event.target.setCustomValidity('一天记录的总分钟数不能超过 1440，请核对实际学习时间。');
      showValidation = true;
    }
    delete day.completedAt;
    updateTaskProgress();
    scheduleSave();
  });
  $('tasksForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (selectedDay > actualDay() || blockedStorage) return;
    showValidation = true; updateTaskProgress();
    const summary = Core.summarizeDay(currentPlan, effectiveFor(selectedDay, currentPlan));
    if (!summary.complete) { $('dayResult').textContent = '还有任务未达到要求，请按各项提示补齐真实学习成果。'; $('taskList').querySelector('.task-card:not(.complete)')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (currentPlan.kind === 'checkpoint' && !state.assessments.some((a) => a.week === currentPlan.week)) { $('dayResult').textContent = '请先在下方保存本周阶段测评记录，再提交今日成果。'; $('assessmentTitle').scrollIntoView({ behavior: 'smooth' }); return; }
    const savedDay = state.days[String(selectedDay)] || (state.days[String(selectedDay)] = { planVersion: currentPlan.planVersion, tasks: {} });
    savedDay.planVersion = currentPlan.planVersion;
    savedDay.completedAt = new Date().toISOString();
    persist(); updateTaskProgress(); renderStats(); renderWeekDays();
    if (savingFailed) $('dayResult').textContent = '成果已在当前页面整理完成，但浏览器未能保存。请立即导出备份。';
  });
  function toggleAssessmentFields() {
    const foundation = $('assessmentType').value === 'foundation';
    $('foundationFields').hidden = !foundation;
    $('bandFields').hidden = foundation;
    $('foundationFields').querySelectorAll('input,select').forEach(el => { el.disabled = !foundation; });
    $('bandFields').querySelectorAll('input').forEach(el => { el.disabled = foundation; });
  }
  $('assessmentType').addEventListener('change', toggleAssessmentFields);
  $('assessmentForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (blockedStorage) { $('assessmentStatus').textContent = '请先恢复已有记录后再填写测评。'; return; }
    const type = $('assessmentType').value;
    const input = { week: Number($('assessmentWeek').value), date: $('assessmentDate').value, type, source: $('assessmentSource').value.trim(), notes: $('assessmentNotes').value.trim(), reviewed: type === 'official' || $('assessmentReviewed').checked };
    if (type === 'foundation') { input.result = $('foundationResult').value; input.weakSkills = input.result === 'reinforce' ? [...document.querySelectorAll('input[name="weakSkill"]:checked')].map((el) => el.value) : []; }
    else {
      const fields = { listening: 'scoreListening', speaking: 'scoreSpeaking', reading: 'scoreReading', writing: 'scoreWriting' };
      if (Object.values(fields).some((id) => $(id).value.trim() === '')) { $('assessmentStatus').textContent = '请填写四项真实分数，缺少的项目不要填成 0。'; return; }
      input.scores = Object.fromEntries(Object.entries(fields).map(([skill, id]) => [skill, Number($(id).value)]));
    }
    try {
      const result = Store.addAssessment(state, input, today(), Content);
      state = result.state; persist(); renderAssessments(); renderStats(); renderDay();
      $('assessmentStatus').textContent = result.boostDays.length ? `测评已记录；后续 ${result.boostDays.length} 个学习日已安排针对 ${result.weakSkills.map((s) => skillNames[s]).join('、')} 的补强，保持每天 6 小时。` : '测评已记录。请继续按计划学习，并保留原始作答与评阅证据。';
    } catch (error) { $('assessmentStatus').textContent = error.message; }
  });
  function download(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('exportButton').addEventListener('click', () => {
    if (blockedStorage) { download(originalCorruptData || '', `IELTS学习记录_原始备份_${today()}.txt`, 'text/plain;charset=utf-8'); return; }
    download(JSON.stringify({ app: 'ielts52-daily-plan', exportedAt: new Date().toISOString(), state }, null, 2), `IELTS每日计划_${today()}.json`, 'application/json;charset=utf-8');
  });
  $('importFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error('备份文件超过 16 MB，请选择本页导出的日程记录。');
      const parsed = JSON.parse(await file.text());
      if (parsed.app && parsed.app !== 'ielts52-daily-plan') throw new Error('这不是每日学习计划的备份文件。');
      const candidate = Store.parseState(parsed.app ? parsed.state : parsed);
      if (!confirm('导入会替换当前浏览器中的日程记录。请确认已经导出现有备份，继续导入？')) return;
      state = candidate; blockedStorage = false; originalCorruptData = null;
      storageConflict = false; lastStoredRaw = storage().getItem(key); lastSavedState = null;
      selectedDay = clampDay(actualDay());
      persist(); renderAll();
      $('setupStatus').textContent = savingFailed ? '备份已读入页面，但尚未成功保存，请再次导出以保留。' : '日程记录已恢复。原有课文学习记录不受影响。';
    } catch (error) { $('setupStatus').textContent = `导入未完成：${error.message}`; }
    finally { event.target.value = ''; }
  });
  window.addEventListener('pagehide', () => persist());
  window.addEventListener('storage', event => {
    if (!preview && event.key === IELTSProfiles.scopeKey(key) && event.newValue !== lastStoredRaw) {
      storageConflict = true;
      showStorageError('另一个标签页已更新记录。请导出本页尚未保存的草稿，再刷新读取最新版本；本页不会覆盖其他标签页。');
    }
  });
  toggleAssessmentFields();
  IELTSProfiles.mount($('profilePanel'));
  renderAll();
  if (!blockedStorage && lastSavedState === null) persist();
  window.addEventListener(Records.EVENT, refreshEvidence);
  refreshEvidence();
})();
