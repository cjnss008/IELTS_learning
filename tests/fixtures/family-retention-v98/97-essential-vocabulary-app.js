(function (root, factory) {
  'use strict';
  const api = factory(root);
  root.IELTSEssentialVocabularyApp = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const BATCH_SIZE = 6;
  const SOURCE = 'essential-vocabulary';
  const normalize = value => String(value || '').trim().toLowerCase();

  function courseDay(options = {}) {
    const params = new URLSearchParams(options.search ?? root.location?.search ?? '');
    const requested = Number(params.get('day'));
    if (Number.isInteger(requested) && requested >= 1 && requested <= 365) return requested;
    let saved;
    try { saved = JSON.parse((options.storage || root.IELTSProfiles?.storage())?.getItem('ielts52-course-player-v1') || 'null'); } catch (_) {}
    const selected = saved?.selectedCourseDay?.day;
    if (Number.isInteger(selected) && selected >= 1 && selected <= 365) return selected;
    return Math.min(365, Math.max(1, Number(options.currentDay ?? root.IELTSRecords?.currentDay?.()) || 1));
  }

  function courseWords(day, data = root.IELTSCurriculumData) {
    const base = data?.days?.find(item => item.day === day);
    const plan = base && (root.IELTSAdaptivePlan?.getDay?.(base) || base);
    const task = plan?.tasks?.find(item => item.id === 'vocabulary');
    const ids = new Set(task?.coreMaterialIds || task?.materialIds || []);
    return (data?.materials || []).filter(item => ids.has(item.id)).flatMap(item => item.vocabulary || []);
  }

  function pendingCourseWords(storage) {
    try {
      const state=JSON.parse(storage?.getItem('ielts52-course-player-v1')||'null'),words=[];
      for(const draft of Object.values(state?.drafts||{})){
        if(draft.taskId!=='vocabulary'||!draft.text)continue;
        let value;try{value=JSON.parse(draft.text);}catch(_){continue;}
        if(value.kind==='vocabulary-practice-draft')words.push(...(value.wordKeys||[]));
      }
      return [...new Set(words.map(normalize))];
    } catch (_) { return []; }
  }

  function hasUnsubmittedReviews(memory, records = [], session = root.IELTSMemorySession) {
    const byId = new Map(records.map(record => [record.id,record]));
    for (const draft of Object.values(memory?.drafts || {})) {
      const item = Object.values(memory.items || {}).find(value => value.word === draft.word && value.skill === draft.skill);
      const record = byId.get(draft.id);
      if (!item || !record || !session?.committedEvidence || !session?.recordFor) return true;
      try {
        const saved = session.committedEvidence(record,draft,item), artifact = saved.artifact;
        const expected = JSON.parse(session.recordFor(draft,item,saved.result,{now:Date.parse(record.submittedAt)}).answer);
        if (record.dayNumber !== draft.courseDay || record.startedAt !== draft.startedAt ||
            ['schema','mode','kind','courseDay','memorySkill','word','originalMaterialId','text','answers','questions','assisted','audioCompleted','result']
              .some(key => JSON.stringify(artifact[key]) !== JSON.stringify(expected[key]))) return true;
      } catch (_) { return true; }
    }
    return false;
  }

  function recordForBatch(batch, payload, options = {}) {
    let artifact;
    try { artifact = JSON.parse(payload.answer); } catch (_) { throw Error('新词原稿无法读取，输入与录音已保留。'); }
    if (!payload.id || payload.trainingVersion !== 2 || !payload.trainingComplete || !payload.allModesCompleted || artifact.kind !== 'vocabulary-three-modes') throw Error('请先完成本组每词三写三读及三轮测试。');
    const submittedAt = new Date(options.now ?? Date.now()).toISOString();
    const startedAt = payload.startedAt;
    const elapsedSeconds = Math.min(86400, Math.max(0, (Date.parse(submittedAt) - Date.parse(startedAt)) / 1000));
    const activeSeconds = Math.min(elapsedSeconds, Math.max(0, batch.activeSeconds || 0));
    const activityByDate={};let remaining=activeSeconds;
    for(const [date,seconds]of Object.entries(batch.activityByDate||{}).sort(([a],[b])=>a.localeCompare(b))){const credited=Math.min(remaining,seconds);if(credited>0)activityByDate[date]=credited;remaining-=credited;}
    const answer = JSON.stringify({...artifact, schema:1, trainingSchema:2, mode:'practice', courseDay:batch.courseDay,
      activityByDate, startedAt, activeSeconds, elapsedSeconds, essentialBatchId:batch.id,...(batch.contextSource?{contextSource:clone(batch.contextSource)}:{})});
    if (answer.length > 50000) throw Error('这份原稿较大，已保留草稿和原音，请先重试保存或备份。');
    return {id:payload.id, materialId:batch.materialId, materialVersion:String(batch.materialVersion || '1'),
      title:'8000必学词 · 本组 '+payload.quantity+' 词', skill:'vocabulary', taskId:'vocabulary', source:SOURCE,
      dayNumber:batch.courseDay, kind:'original', answer, minutes:activeSeconds / 60, activeSeconds, elapsedSeconds,
      quantity:payload.quantity, unit:payload.unit || '条', startedAt, submittedAt, exposure:'seen',
      assistance:{hint:false,answer:false,ai:false}, media:[], evaluation:clone(payload.evaluation)};
  }

  function committedRecord(record, batch, payload) {
    let stored, current;
    try { stored = JSON.parse(record.answer); current = JSON.parse(payload.answer); } catch (_) { throw Error('已存新词原稿无法读取，原记录保留。'); }
    if (record.id !== payload.id || record.source !== SOURCE || record.materialId !== batch.materialId ||
        String(record.materialVersion) !== String(batch.materialVersion || '1') || stored.essentialBatchId !== batch.id || JSON.stringify(stored.contextSource)!==JSON.stringify(batch.contextSource) ||
        stored.kind !== 'vocabulary-three-modes' || stored.trainingVersion !== 2 || stored.trainingComplete !== true ||
        ['words','rounds','learning'].some(key => JSON.stringify(stored[key]) !== JSON.stringify(current[key]))) {
      throw Error('已存作品与当前新词答案不一致，请保留当前输入，从原稿核对。');
    }
    return record;
  }

  function legacyReleaseMapping(memory, options = {}) {
    const retention = options.retention || root.IELTSLexicalRetentionV88;
    const field = retention?.FIELD || 'reviewedRetention';
    if (!Object.hasOwn(memory, field)) return {status:'ready',kind:'legacy-not-started',rewritten:false};
    try {
      const bank = options.bankRuntime || root.IELTSLexicalBankRuntime;
      if (!bank) {
        // Older standalone pages retain their existing v88 validation path.
        // This fallback neither understands nor enables a future release.
        if (!retention?.parseState || !retention?.cleanContract) throw Error('旧词汇版本组件未加载');
        const state = retention.parseState(memory[field]);
        for (const contract of Object.values(state.contracts)) retention.cleanContract(contract);
        return {status:'ready',kind:'direct-legacy-delegate',contractsVerified:Object.keys(state.contracts).length,rewritten:false};
      }
      if (typeof bank.createRuntime !== 'function') throw Error('词库版本核验组件不完整');
      const result = bank.createRuntime({legacyCodec:retention}).restoreLegacyState(memory[field]);
      if (result.status !== 'ready') return {status:'pending',reason:result.reason,rewritten:false,learningFailure:false};
      return {status:'ready',kind:'immutable-legacy-release',releaseId:bank.LEGACY_RELEASE_ID,
        descriptorSha256:bank.LEGACY_DESCRIPTOR_SHA256,contractsVerified:Object.keys(result.state.contracts).length,rewritten:false};
    } catch (error) {
      return {status:'pending',reason:error.code || 'BANK_LEGACY_MAPPING_PENDING',message:error.message,rewritten:false,learningFailure:false};
    }
  }

  function mount(options = {}) {
    const doc = options.document || root.document;
    const dashboard = options.dashboard || doc?.getElementById('essentialVocabularyDashboard');
    const practice = options.practice || doc?.getElementById('essentialVocabularyPractice');
    const E = options.essential || root.IELTSEssentialVocabulary;
    const M = options.memory || root.IELTSMemory;
    const V = options.vocabulary || root.IELTSVocabularyPractice;
    const R = options.records || root.IELTSRecords;
    const P = options.profiles || root.IELTSProfiles;
    const data = options.data || root.IELTS_ESSENTIAL_VOCABULARY;
    if (!doc || !dashboard || !practice || !E || !M || !V || !data) return null;
    const now = options.now || Date.now;
    const owner = P?.current?.()?.id;
    const store = M.createStore(P.storage(), {assertCurrent:check});
    let controller = null, batch = null, signature = null, saving = null, finished = false, disposed = false, paused = false;
    let records = options.initialRecords || [], tickAt = now(), lastInteraction = now(), statusText = '', savingDraft = false, unsaved = false;
    const entryById = new Map(data.entries.map(entry => [entry.id, entry]));
    const day = options.courseDay || courseDay({storage:P.storage(),currentDay:R?.currentDay?.()});
    const contextual = options.contextual || root.IELTSContextualVocabulary;
    let currentContext = null, contextSignature = null, retention = null;
    let historyFilter = 'all', historyLimit = 10, historyBox = null, historyNote = null, historyView = null, historyReading = false;
    const ownedOptions=()=>({ownedSemanticCatalog:options.ownedSemanticCatalog,ownedSourceAcceptance:options.ownedSourceAcceptance,verifiedSkillLevels:options.verifiedSkillLevels,placement:options.placement,player:options.player||root.IELTSCoursePlayer,assessment:options.assessment||root.IELTSAssessment,recordCorrectionStatus:options.recordCorrectionStatus||root.IELTSMistakes?.recordCorrectionStatus,mistakeState:options.mistakeState});
    const sourceOptions=()=>({day,data:options.curriculum||root.IELTSCurriculumData,memory:M.read(),records,adaptive:options.adaptive||root.IELTSAdaptivePlan,...ownedOptions(),now:now()});
    function sourceAccess(value){const marker=value?.contextSource;if(marker?.schema!==2||!['owned-source-context-v82','mixed-context-v82'].includes(marker.role))return{allowed:true};return contextual?.batchTrainingAccess?.(value,sourceOptions())||{allowed:false};}
    const ownedBatch=value=>value?.contextSource?.schema===2&&['owned-source-context-v82','mixed-context-v82'].includes(value.contextSource.role);
    const ownedContext=()=>currentContext?.contexts?.some(c=>c.contract?.words?.some(w=>w.source?.role==='owned-source-context-v82'))||currentContext?.contract?.words?.some(w=>w.source?.role==='owned-source-context-v82');

    function check() {
      P?.assertFresh?.();
      if (disposed || owner !== P?.current?.()?.id) throw Error('学习档案已切换，请刷新后继续。当前原稿保留。');
    }
    function node(tag, text, cls) {
      const el = doc.createElement(tag);
      if (text !== undefined && text !== null) el.textContent = String(text);
      if (cls) el.className = cls;
      return el;
    }
    function button(text, action, primary = false) {
      const el = node('button', text, 'button '+(primary ? 'primary' : 'secondary'));
      el.type = 'button';
      el.addEventListener('click', async () => {
        if (el.disabled || saving) return;
        el.disabled = true;
        try { check(); await action(); } catch (error) { statusText = error.message; render(); }
        finally { if (!disposed && el.isConnected !== false) el.disabled = false; }
      });
      return el;
    }
    function allBatches(state = M.read()) { return Object.values(state.essential?.batches || {}); }
    function currentBatch(state = M.read()) { return batch && allBatches(state).find(value => value.id === batch.id); }
    function wordsForBatch(value) {
      const words = value.words || value.wordIds || [];
      return words.map(word => typeof word === 'string' ? entryById.get(word) || data.entries.find(entry => normalize(entry.word) === normalize(word)) : word).filter(Boolean);
    }
    function historyBlocked() {
      const state = controller?.getState?.();
      return retention?.isActive?.() === true || options.isReviewActive?.() === true || hasUnsubmittedReviews(M.read(),records) ||
        state?.restoring === true || !!state && state.phase !== 'learn' && state.phase !== 'complete';
    }
    function savedRows(state = M.read()) {
      const byBatch = new Map();
      for (const record of records) {
        if (record.source !== SOURCE) continue;
        let artifact; try { artifact = JSON.parse(record.answer); } catch (_) { continue; }
        if (artifact?.essentialBatchId) {
          if (!byBatch.has(artifact.essentialBatchId)) byBatch.set(artifact.essentialBatchId, []);
          byBatch.get(artifact.essentialBatchId).push(record);
        }
      }
      return allBatches(state).filter(value => Number.isInteger(value.courseDay) && value.courseDay >= 2 && value.courseDay <= day &&
        (value.status === 'submitted' || value.recordId || byBatch.has(value.id))).sort((a,b) => b.courseDay-a.courseDay ||
          String(b.submittedAt || b.startedAt).localeCompare(String(a.submittedAt || a.startedAt)) || a.id.localeCompare(b.id));
    }
    function savedArtifact(value, listed) {
      const expectedId = value.recordId || value.draft?.id;
      const matching = listed.filter(record => record.source === SOURCE && record.materialId === value.materialId &&
        String(record.materialVersion) === String(value.materialVersion || '1') && record.kind === 'original' &&
        record.dayNumber === value.courseDay && (!expectedId || record.id === expectedId)).filter(record => {
          try { const artifact = JSON.parse(record.answer); return artifact.essentialBatchId === value.id && artifact.courseDay === value.courseDay; }
          catch (_) { return false; }
        });
      if (!expectedId || matching.length !== 1) throw Error('本组已存原稿的编号或课次待核对，原记录和待提交草稿保留，请重新读取后重试。');
      const record = matching[0], artifact = JSON.parse(record.answer), words = wordsForBatch(value);
      if (JSON.stringify(artifact.contextSource) !== JSON.stringify(value.contextSource) ||
          !V.verifyTrainingArtifact(artifact, {vocabulary:words}).valid) throw Error('本组原版本或三写三读证据待核对，原记录与草稿保留。');
      return {record, artifact};
    }
    async function refreshSavedBatches() {
      check();
      if (!R?.list) throw Error('作品记录组件未加载，已保存词组和原输入保留。');
      const listed = await R.list(); check();
      records = listed; retention?.setRecords?.(listed); render();
      return savedRows().map(value => ({id:value.id,courseDay:value.courseDay,recordId:value.recordId || null}));
    }
    async function openSavedBatch(id) {
      check();
      if (historyReading || saving) return false;
      if (historyBlocked()) { notice('正在作答或有未交复习稿，先完成本次复习或测试，再查看已保存词组。原输入保留。'); return false; }
      if (controller?.getMediaState?.()?.busy) throw Error('正在录音或评测，请先完成当前操作。');
      if (!R?.list) throw Error('作品记录组件未加载，已保存原稿和原输入保留。');
      historyReading = true;
      try {
        const before = allBatches().find(value => value.id === id);
        if (!before || before.courseDay > day) throw Error('这份已保存词组不属于当前可查看的课次，原记录保留。');
        const binding = JSON.stringify(before), listed = await R.list(); check();
        if (historyBlocked()) throw Error('当前已进入复习或测试，原输入保留，完成后再查看历史。');
        if (controller?.getMediaState?.()?.busy) throw Error('正在录音或评测，请先完成当前操作。');
        const latest = allBatches().find(value => value.id === id);
        if (!latest || JSON.stringify(latest) !== binding) throw Error('另一页面更新了本组，原输入保留，请重新读取已保存词组。');
        const {record,artifact} = savedArtifact(latest, listed);
        records = listed;
        if (!sourceAccess(latest).allowed) throw Error('本组来源版本或同源原稿待核对，原答案和原音保留，暂不展示。');
        if (batch && !finished) {
          const current = batch.id === latest.id && controller?.getSubmission?.();
          if (current) committedRecord(record,latest,current);
          else { activity(); saveDraft(); }
        }
        await options.onNewWordsOpened?.(); check();
        if (historyBlocked()) throw Error('当前有未交复习稿，原输入保留，完成后再查看历史。');
        await options.onActiveChange?.(true,{kind:'saved-vocabulary',batchId:latest.id,recordId:record.id,courseDay:latest.courseDay}); check();
        if (historyBlocked()) throw Error('当前已进入复习或测试，原输入保留，完成后再查看历史。');
        if (controller?.getMediaState?.()?.busy) throw Error('正在录音或评测，请先完成当前操作。');
        controller?.pause?.(); controller?.destroy?.(); controller = null; batch = null; finished = false;
        historyView = {batchId:latest.id,recordId:record.id};
        const result = node('div',null,'memory-panel essential-saved-original');
        result.style.overflowWrap = 'anywhere';
        result.append(node('h2','本组初学原稿已提交'),node('p','第 '+latest.courseDay+' 课 · 原提交：'+record.submittedAt,'memory-subtle'),
          node('p','只读查看原三写三读、三轮答案与原音引用；不会重新训练或改变原成绩。原错误仍按今日错题安排订正。','memory-subtle'));
        const learning = node('details'); learning.append(node('summary','三写三读原始证据'),node('p','原稿编号：'+record.id,'memory-subtle'));
        for (const item of artifact.learning) {
          const detail = node('div'); detail.append(node('h3',item.word));
          item.spellings.forEach((answer,index) => detail.append(node('p','第 '+(index+1)+' 次原输入：'+answer)));
          item.speaking.forEach((proof,index) => detail.append(node('p','第 '+(index+1)+' 份原音：'+proof.workId+'\nSHA-256：'+proof.hash+
            '\n原专业结果：准确度 '+proof.result.accuracy+'，流利度 '+proof.result.fluency+'，完整度 '+proof.result.completeness+'\n'+proof.recordedAt,'memory-subtle')));
          learning.append(detail);
        }
        result.append(learning);
        const meanings = new Map(artifact.words.map(word => [normalize(word.word),word.meaning]));
        for (const round of artifact.rounds) {
          const detail = node('details',null,'vocab-original'); detail.append(node('summary',V.NAMES[round.mode]+' · '+round.correct+' / '+round.total));
          for (const attempt of round.attempts) detail.append(node('p',attempt.word+'：'+(meanings.get(normalize(attempt.word)) || '')+'\n你的原稿：'+attempt.userAnswer+'\n'+
            (attempt.correct?'本次正确。':'参考英文：'+attempt.expectedAnswer),'memory-feedback'));
          result.append(detail);
        }
        result.append(button('收起已保存原稿',async () => { historyView = null; practice.replaceChildren(); await options.onActiveChange?.(false,{kind:'saved-vocabulary-closed'}); render(); }));
        const link = node('a','返回今日学习，继续错题或下一模块','button secondary'); link.href = '今日学习.html?day='+day+(P.isPreview?.()?'&preview=1':''); result.append(link);
        practice.replaceChildren(result); statusText = latest.draft ? '已存原稿只读展示；原待同步草稿仍保留，可从“继续未完成词组”重试原提交。' : '';
        render(); practice.scrollIntoView?.({block:'start',behavior:'smooth'}); return true;
      } finally { historyReading = false; }
    }
    function renderSavedBatches() {
      const rows = savedRows(), box = node('details',null,'essential-saved-history');
      box.open = historyBox?.open === true;
      box.append(node('summary','已保存词汇组 · '+rows.length+' 组'));
      const filter = node('select'); filter.setAttribute('aria-label','按课次筛选已保存词汇组');
      const choices = [['all','当前课及前课'],['current','只看本课（第 '+day+' 课）'],['previous','只看前课'],
        ...[...new Set(rows.map(value=>value.courseDay))].map(value=>[String(value),'第 '+value+' 课'])];
      for (const [value,label] of choices) { const option = node('option',label); option.value = value; filter.append(option); }
      filter.value = historyFilter; filter.addEventListener('change',() => { check(); historyFilter = filter.value; historyLimit = 10; render(); });
      box.append(filter,button('重新读取已保存词汇组',refreshSavedBatches));
      const filtered = rows.filter(value => historyFilter === 'all' || historyFilter === 'current' && value.courseDay === day || historyFilter === 'previous' && value.courseDay < day || String(value.courseDay) === historyFilter);
      if (!filtered.length) box.append(node('p','此课次筛选下暂无已保存词组；未交草稿继续从上方恢复。','memory-subtle'));
      for (const value of filtered.slice(0,historyLimit)) {
        const line = node('p'),label = '第 '+value.courseDay+' 课 · '+(value.wordKeys?.length || value.words?.length || 0)+' 词 · '+(value.submittedAt || value.startedAt);
        line.append(node('span',label+' '),button('查看第 '+value.courseDay+' 课已保存词组',() => openSavedBatch(value.id)));
        if (value.draft) line.append(node('span',' · 待同步草稿也保留','memory-subtle'));
        box.append(line);
      }
      if (filtered.length > historyLimit) box.append(button('展开更多已保存词组（余 '+(filtered.length-historyLimit)+' 组）',() => { historyLimit += 10; render(); }));
      historyBox = box; box.hidden = historyBlocked();
      historyNote = node('p','已保存词汇组 · '+rows.length+' 组仍保留；完成当前复习或测试后可展开查看原答案。','memory-subtle');
      historyNote.hidden = !box.hidden || !rows.length;
      const wrapper = node('div'); wrapper.append(box,historyNote); return wrapper;
    }
    function currentPlan() {
      check();
      const budget = options.getBudget?.() || {remainingMinutes:360,exhausted:false};
      const memory=M.read(),explicitContext=Object.hasOwn(options,'contextWords')||typeof options.getContextWords==='function',curriculum=options.curriculum||root.IELTSCurriculumData;
      let contextWords=options.contextWords||options.getContextWords?.()||[];
      const ownedWord=word=>word?.source?.role==='owned-source-context-v82'||word?.sourceProof?.role==='owned-source-context-v82',requestedContext=contextWords,explicitOwned=explicitContext&&contextWords.some(ownedWord);
      currentContext=null;
      if((!explicitContext||explicitOwned)&&contextual&&curriculum){
        const course=contextual.courseContext({storage:P.storage()}),drafts=[...course.drafts,...E.activityDrafts(memory)],adaptive=options.adaptive||root.IELTSAdaptivePlan;
        const nextSignature=JSON.stringify([records.map(r=>[r.id,r.version,r.dayNumber,r.submittedAt]),drafts.map(d=>[d.id,d.courseDay,d.materialId,d.dayPlanBinding?.contentHash])]);
        if(nextSignature!==contextSignature){adaptive?.adoptStarted?.({records,drafts,exposures:course.exposures});contextSignature=nextSignature;}
        currentContext=(contextual.daily||contextual.resolve)({day,data:curriculum,memory,records,drafts,budget,adaptive,vocabularyData:data,sourceContexts:options.sourceContexts,semanticCatalog:options.semanticCatalog,...ownedOptions(),now:now()});contextWords=explicitContext?[...requestedContext.filter(w=>!ownedWord(w)),...currentContext.words.filter(w=>requestedContext.some(r=>ownedWord(r)&&normalize(r.word)===normalize(w.word)&&r.meaning===w.meaning&&r.example===w.example&&(r.source?.materialId||r.sourceProof?.materialId)===w.source?.materialId))]:currentContext.words;
      }
      if(explicitOwned&&!currentContext)contextWords=requestedContext.filter(w=>!ownedWord(w));
      const dailyWords=options.courseWords||currentContext?.currentCoreWords||courseWords(day,curriculum);
      const planOptions={data,now:now(),remainingMinutes:budget.exhausted || budget.dayEnded ? 0 : budget.remainingMinutes,timerState:root.IELTSStudyTimer?.snapshot?.(),courseDay:day,courseWords:dailyWords,contextWords,pendingWords:pendingCourseWords(P.storage()),vocabularyDrafts:options.getVocabularyDrafts?.()||[],records,...(currentContext?.available?currentContext.budget:{})};const rawPlan=E.plan(memory,planOptions),plan=contextual?.applySourceTrainingGate?.(rawPlan,sourceOptions())||rawPlan;if(currentContext?.words?.some(w=>w.source?.role==='owned-source-context-v82')&&plan.due.length)plan.newWords=[];return plan;
    }
    function notice(text) { statusText = text; render(); }
    function saveDraft(change) {
      if (!batch || finished || disposed || savingDraft) return;
      check();
      const latest = currentBatch();
      if (!latest || latest.status === 'submitted' && !latest.draft) return;
      const value = change?.draft || controller?.getDraft?.();
      if (!value) return;
      unsaved = true;
      savingDraft = true;
      try {
        const state = store.read();
        const next = E.saveBatchDraft(state, batch.id, {draft:value,activeSeconds:batch.activeSeconds || 0,activityByDate:batch.activityByDate || {}}, now(), {expectedDraft:signature});
        store.save(next);
        signature = JSON.stringify(value);
        batch = clone(allBatches(next).find(item => item.id === batch.id));
        unsaved = false;
        statusText = '输入与录音进度已暂存，可继续学习；保存状态见顶部。';
      } finally { savingDraft = false; }
    }
    function activity() {
      if(retention?.isActive?.()){retention.tick?.();return;}
      const time = now(), delta = Math.min(5, Math.max(0, (time - tickAt) / 1000));
      tickAt = time;
      if (!batch || finished || paused || saving || disposed || doc.hidden || doc.hasFocus && !doc.hasFocus() || time - lastInteraction > 120000 || controller?.getMediaState?.()?.busy) return;
      const budget = options.getBudget?.() || {remainingMinutes:360};
      if (budget.exhausted || budget.dayEnded || budget.remainingMinutes <= 0) { paused=true;controller?.pause?.();saveDraft();practice.querySelectorAll('input,textarea,button').forEach(el=>{el.disabled=true;});notice('今日学习已暂停，输入与原音已保存，恢复今日任务或下一日继续。');return; }
      const add = Math.min(delta, budget.remainingMinutes * 60);
      if (add > 0) {
        const date = root.IELTSYearPlanner?.dateKey?.(time) || new Date(time).toISOString().slice(0,10);
        batch.activeSeconds = (batch.activeSeconds || 0) + add;
        batch.activityByDate ||= {};
        batch.activityByDate[date] = (batch.activityByDate[date] || 0) + add;
      }
      if (Math.floor(time / 1000) % 15 === 0) saveDraft();
    }
    async function durable() {
      if (options.durable) await options.durable();
      else if (!P.isPreview?.()) await root.IELTSUserData?.syncNow?.();
      check();
    }
    async function submit(payload) {
      if (saving) return saving;
      if (finished) return;
      activity();
      saveDraft();
      const pendingBatch = clone(batch);
      saving = (async () => {
        check();
        if (!R?.record || !R?.list) throw Error('作品记录组件未加载，原稿与原音保留。');
        const listed = await R.list();if(ownedBatch(pendingBatch))records=listed;let existing = listed.find(record => record.id === payload.id);
        check();
        if(!sourceAccess(pendingBatch).allowed)throw Error('请先完成同源听读原稿、完整听音和订正；本组原输入与原音保留。');
        const budget=options.getBudget?.() || {remainingMinutes:360};
        if(!existing&&(paused||budget.exhausted||budget.dayEnded||budget.remainingMinutes<=0))throw Error('今日学习已暂停，完整原稿与原音保留，恢复今日任务或下一日提交。');
        if (existing) existing = committedRecord(existing, pendingBatch, payload);
        else {
          const result = await R.record(recordForBatch(pendingBatch, payload));
          check();
          existing = committedRecord(result.record, pendingBatch, payload);
        }
        let state = store.read();
        state = E.completeBatch(state, pendingBatch.id, payload, existing);
        store.save(state);
        await durable();
        state = store.read();
        store.save(E.clearBatchDraft(state, pendingBatch.id));
        await durable();
        records = await R.list();
        check();
        finished = true;
        statusText = '本组原稿已保存。错词和低分项请到今日错题订正；延迟回忆会在到期后再次出现。';
        render();
        options.onActiveChange?.(false,{kind:'submitted',batchId:pendingBatch.id});
        Promise.resolve(options.onSubmitted?.(existing,pendingBatch,payload)).catch(error=>notice('原稿已保存，课程状态刷新待重试：'+error.message));
        root.dispatchEvent?.(new root.CustomEvent('ielts:essential-submitted', {detail:{batchId:pendingBatch.id,recordId:existing.id,courseDay:day}}));
        return existing;
      })();
      try { return await saving; }
      catch (error) { statusText = error.browserCached ? '原稿已保存在浏览器，用户文件夹同步待重试。请保留本页，点击“提交三轮原稿”重试保存。' : error.message; render(); throw error; }
      finally { saving = null; }
    }
    async function openBatch(value) {
      const saved = allBatches().find(item => item.id === (typeof value === 'string' ? value : value.id));
      if (saved?.status === 'submitted' && !saved.draft) return openSavedBatch(saved.id);
      check();if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return false;}
      if (controller?.getMediaState?.()?.busy) throw Error('正在录音或评测，请先完成当前操作。');
      if (batch && !finished) { activity(); saveDraft(); }
      const savedValue=allBatches(M.read()).find(item=>item.id===(typeof value==='string'?value:value.id))||value;if(ownedBatch(savedValue)&&R?.list)records=await R.list();check();if(!sourceAccess(savedValue).allowed){controller?.pause?.();controller?.destroy?.();controller=null;batch=null;statusText='这份词组等待同源听读原稿、完整听音和订正；原输入与原音保留，原句暂不展示。';practice.replaceChildren(node('p',statusText,'memory-feedback'));render();return false;}
      controller?.destroy?.();
      const state = M.read();
      batch = clone(allBatches(state).find(item => item.id === (typeof value==='string'?value:value.id)) || value);
      finished = false;paused=false;historyView=null;
      signature = batch.draft ? JSON.stringify(batch.draft) : null;
      tickAt = now(); lastInteraction = now();
      const words = wordsForBatch(batch);
      if (!words.length) throw Error('这份新词组的词条未加载，原稿保留。');
      await options.onActiveChange?.(true,{kind:'new',batchId:batch.id});tickAt=now();
      const material = {id:batch.materialId,version:String(batch.materialVersion || '1'),title:'8000必学词',skill:'vocabulary',type:'vocabulary',level:'A0',vocabulary:words};
      const heading = node('div', null, 'essential-session-heading');
      heading.append(node('h2',(batch.contextSource?.originCourseDay<batch.courseDay?'第 '+batch.contextSource.originCourseDay+' 课待补语境 · ':'')+'继续本组 '+words.length+' 词'),node('p','每词三次正确输入和三次独立原音，再完成三轮测试。','memory-subtle'));
      const close = button('保存并收起', () => {
        if (controller?.getMediaState?.()?.busy) throw Error('正在录音或评测，请先完成当前操作，再收起。');
        activity(); saveDraft(); controller.destroy(); controller = null; batch = null; practice.replaceChildren();options.onActiveChange?.(false,{kind:'paused'}); render();
      });
      heading.append(close);
      const host = node('div');
      practice.replaceChildren(heading,host);
      options.onNewWordsOpened?.();
      controller = V.mount(host, {material,courseDay:batch.courseDay,draft:batch.draft || undefined,
        returnUrl:options.returnUrlForBatch?.(batch)||'词汇记忆.html?day='+day+'&batch='+encodeURIComponent(batch.id)+(P.isPreview?.() ? '&preview=1' : ''),
        onChange:change => { try { if (!finished) saveDraft(change); } catch (error) { statusText = error.message; } const status=dashboard.querySelector('.essential-status');if(status)status.textContent=statusText;const list=dashboard.querySelector('.essential-new-list');if(list)list.hidden=change.testing===true||['completion','meaning','dictation'].includes(change.phase)||options.isReviewActive?.()===true;if(historyBox){historyBox.hidden=historyBlocked();if(historyNote)historyNote.hidden=!historyBox.hidden||!savedRows().length;} },
        onMistake:event => { check(); if (!root.IELTSMistakes?.captureVocabulary) throw Error('错题本组件未加载，原答案保留。'); return root.IELTSMistakes.captureVocabulary(event); },
        lookup:async (word,context,level) => {
          check();
          const response = await root.fetch('/api/ai/glossary', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({word,context,level}),credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(90000)});
          const result = await response.json();
          check();
          if (!response.ok || result.ok === false) throw Error(result.error?.message || '词条补查未完成，可保留原稿后重试。');
          return result;
        },
        onSubmit:submit});
      await controller.ready;
      check();
      practice.scrollIntoView?.({block:'start',behavior:'smooth'});
      render();
    }
    async function start(requestedOrigin) {
      if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return;}
      if(day<2){notice('8000必学词与新增循环复习从第2课开始。本课先完成原有词汇训练。');return;}
      await options.refreshBudget?.();
      check();
      if(ownedContext()&&R?.list)records=await R.list();check();
      const plan = currentPlan();
      const existing = plan.activeBatches?.[0];
      if (existing) return openBatch(existing);
      if(plan.reviewDebt?.required||plan.due?.length){notice('必做复习、错词间隔或未交原稿仍待处理；先复习，保留新词目标与原输入。');await options.openReview?.();return;}
      const availableWords=plan.newWords||[],origin=Number.isInteger(requestedOrigin)?requestedOrigin:availableWords[0]?.originCourseDay,words=(origin?(plan.pendingContextWords||availableWords).filter(word=>word.originCourseDay===origin&&word.heldForVerification!==true):availableWords).slice(0,Math.min(BATCH_SIZE,availableWords.length));
      if (!words.length) { render(); return; }
      if(currentContext?.available)(contextual.beginDay||contextual.freeze)(currentContext,{day,data:options.curriculum||root.IELTSCurriculumData,memory:M.read(),records,drafts:contextual.courseContext({storage:P.storage()}).drafts,budget:options.getBudget?.()||{remainingMinutes:360},adaptive:options.adaptive||root.IELTSAdaptivePlan,vocabularyData:data,sourceContexts:options.sourceContexts,semanticCatalog:options.semanticCatalog,...ownedOptions(),now:now()});
      const id = 'essential-batch-'+(root.crypto?.randomUUID?.() || now().toString(36)+'-'+Math.random().toString(36).slice(2));
      const source=currentContext?.contexts?.find(c=>c.contract.day===origin)||(words.some(w=>w.source?.role==='owned-source-context-v82')?currentContext:null),contextSource=source?.contract?(contextual.contextSourceFor?.(source.contract,words)||{originCourseDay:source.contract.day,contractHash:source.contract.contentHash}):undefined;
      const state = store.read(), next = E.startBatch(state, {id,words,now:now(),courseDay:day,...(contextSource?{contextSource}:{})});
      store.save(next);
      return openBatch(allBatches(next).find(item => item.id === id));
    }
    function render() {
      if (disposed) return;
      if (historyView && historyBlocked()) { historyView=null;if(practice.querySelector('.essential-saved-original'))practice.replaceChildren(); }
      let plan;
      try { plan = currentPlan(); } catch (error) { dashboard.replaceChildren(node('p',error.message,'memory-feedback')); return; }
      const s = plan.stats || {}, active = plan.activeBatches?.[0];
      const started = s.started ?? s.startedWords ?? 0, due = s.due ?? s.dueWords ?? plan.allDue?.length ?? 0;
      const repair = s.pendingLearning || 0, verified = s.delayedVerifiedWords || 0;
      const grid = node('div',null,'essential-stats');
      for (const [label,value,note] of [['总目标',data.target || 8000,'必学词'],['已开始',started,'有学习或练习记录'],['到期复习',due,'按个人遗忘节奏安排'],['待补训练',repair,'已开始但初学训练未完整'],['延迟已验证',verified,'有四项技能跨天回忆证据']]) {
        const tile = node('div',null,'memory-tile');
        tile.append(node('span',label),node('strong',value),node('small',note)); grid.append(tile);
      }
      const top = node('div',null,'essential-heading');
      top.append(node('h2','8000 必学词'),node('p','认识一个词只是开始；会写、会听、会用，需要到期后再次独立回忆。','memory-subtle'));
      const progress = node('progress'); progress.max = data.target || 8000; progress.value = started;
      progress.setAttribute('aria-label','8000必学词已开始进度');
      const route = node('div',null,'essential-today');
      const review = node('article',null,'essential-step');
      const reviewCount = plan.due?.length || 0, reviewRequired=plan.reviewDebt?.required===true||reviewCount>0;
      review.append(node('span',options.preferNewWords?'02':'01','essential-step-number'),node('h3',options.preferNewWords?'到期复习':'先复习'),node('p',reviewCount ? '全部 '+reviewCount+' 项到期复习均为必做，不设每日次数上限；按共享总预算逐题继续，超时保留积压。' : reviewRequired ? '错词仍待规定间隔或未交复习原稿；今天的复习尚未完成，不释放新词。' : '当前没有已到期复习；未来安排与测量暂缓不表示已掌握。'));
      const reviewButton = button(reviewCount ? '开始本轮复习（'+reviewCount+'项）' : reviewRequired ? '查看待继续复习' : '查看复习安排', async () => {
        if (controller?.getMediaState?.()?.busy) throw Error('正在录音或评测，请先完成当前操作。');
        if (batch && !finished) { activity(); saveDraft(); }
        if(retention?.isActive?.())await retention.close();
        controller?.destroy?.(); controller = null; batch = null; practice.replaceChildren();
        historyView=null;options.onActiveChange?.(false,{kind:'review-switch'});
        await options.openReview?.();
      }, !options.preferNewWords && reviewCount > 0 && !active);
      review.append(reviewButton);
      const fresh = node('article',null,'essential-step');
      const available = day<2?0:plan.newWords?.length || 0;
      const pendingCount=(plan.newWords||[]).filter(word=>word.learningKind==='complete-initial').length,newCount=available-pendingCount;
      const firstOrigin=plan.newWords?.[0]?.originCourseDay,groupSize = Math.min(BATCH_SIZE,firstOrigin?plan.newWords.filter(w=>w.originCourseDay===firstOrigin).length:available);
      fresh.append(node('span',options.preferNewWords?'01':'02','essential-step-number'),node('h3',active ? '继续已开始的词组' : options.preferNewWords?'今日新词':'再学新词与待补词'),
        node('p',day>=2?plan.quota.dailyTarget?'每日新词目标 '+plan.quota.dailyTarget+'；已实际提交 '+plan.dayProgress.initialCompleted+'/'+plan.quota.dailyTarget+'、当前可开 '+available+' 词。来源或预算不足的差额待补；先复习。':'核心词初学已全部提交，继续到期复习与深化，不再安排不存在的新词。':'第1课原有词汇与进度保留。'),node('p',day<2?'8000必学词从第2课开始；第1课先完成原有词汇训练。':active ? '未完成组已保留，继续原来的词与作答顺序。' : available ? '今日安排 '+newCount+' 个新词'+(pendingCount?'、'+pendingCount+' 个待补词':'')+'，先完成一组 '+groupSize+' 词。' : '今天先巩固已有词；新词量会随复习积压与剩余预算调整。'));
      const startButton = button(active ? '继续未完成词组' : available ? '开始本组 '+groupSize+' 词' : '暂不增加新词', active ? () => openBatch(active) : start, !!options.preferNewWords || !!active || !reviewCount);
      startButton.disabled = day<2 || !active && (!available || reviewRequired) || !!batch && !finished;
      fresh.append(startButton);const sourceWaiting=currentContext?.awaitingSourceWords?.length||0;if(sourceWaiting)fresh.append(node('p',contextual?.waitingMessage?.(currentContext.awaitingSourceWords)||'对应来源资格待核验，原输入保留。','memory-subtle'));if(plan.heldSourceBatches?.length)fresh.append(node('p','有旧词组等待同源原稿核验，原输入与原音保留，暂不开训练。','memory-subtle'));const heldSenses=(currentContext?.pending||[]).filter(p=>p.reason==='owned-source-existing-word-snapshot-preserved');if(heldSenses.length)fresh.append(node('p','有 '+heldSenses.length+' 个新语境义项与旧词卡不同，旧义与原稿保留；新义项待单独安排。','memory-subtle'));const held=(plan.pendingContextWords||[]).filter(w=>w.heldForVerification===true);if(held.length)fresh.append(node('p','有 '+held.length+' 个原课语境词的原文版本待核验，原词义与来源已保留；核验后继续，不用新版原文替代。','memory-subtle'));if(currentContext?.heldContexts?.length)fresh.append(node('p','有旧语境来源合同待核对，原任务保留，暂不新增该组。','memory-subtle'));const carryGroups=new Map();for(const word of plan.pendingContextWords||[])if(word.originCourseDay<day&&word.heldForVerification!==true)carryGroups.set(word.originCourseDay,(carryGroups.get(word.originCourseDay)||0)+1);if(carryGroups.size){fresh.append(node('p','前课待补内容仍保留；补学原稿与用时计入当前课次和实际日期，旧课结果不重开。','memory-subtle'));for(const [originDay,count]of carryGroups){fresh.append(node('p','第 '+originDay+' 课：'+count+' 个语境词待补'));const resume=button('补第 '+originDay+' 课语境词',()=>start(originDay));resume.disabled=!!active||!!batch&&!finished||reviewRequired||!available;fresh.append(resume);}}if(options.preferNewWords&&!reviewRequired)route.append(fresh,review);else route.append(review,fresh);
      if(!options.inline&&(plan.quota?.courseReservedToday||pendingCourseWords(P.storage()).length)){const line=node('p',plan.quota?.courseReservedToday?'本课另有 '+plan.quota.courseReservedToday+' 个必学新词，沿用课程训练，不重复初学。':'课程中的未提交词汇已保留，继续原稿即可。','memory-subtle'),link=node('a','继续本课词汇');link.href='今日学习.html?day='+day+(P.isPreview?.()?'&preview=1':'');line.append(doc.createTextNode(' '),link);fresh.append(line);}
      const feedback = node('p',statusText,'essential-status'); feedback.setAttribute('role','status');
      const note = node('p','以8000个核心词为目标，每日新词目标40，来源不足时保留缺口并继续听读；先完成全部必做复习与错词，不用次数上限隐藏积压。学习与番茄休息共用360分钟，超时继续保留待办。技能轮换，语境表达结合听读说写；同日正确和旧自评保留为练习记录。','memory-subtle');
      dashboard.replaceChildren(top,grid,progress,route,feedback,note);
      if(options.inline){const supplied=plan.todayNewWords||plan.dayNewWords||options.getTodayWords?.(plan)||[],fallback=supplied.length?supplied:[...(plan.activeBatches||[]).flatMap(value=>wordsForBatch(value).map(word=>({...word,state:'started'}))),...(plan.newWords||[])],seen=new Set(),today=fallback.map(value=>value.entry?{...value.entry,state:value.state}:value).filter(word=>{const key=normalize(word.word);if(!key||seen.has(key))return false;seen.add(key);return true;});const list=node('div',null,'essential-new-list');list.append(node('h3','本课语境候选与已开始词组 · '+today.length+' 词'));const words=node('div',null,'essential-word-chips');for(const word of today){const chip=node('span',word.word+(word.state==='submitted'?' · 原稿已交':word.state==='started'?' · 续做':''),'essential-word-chip');chip.setAttribute('data-ai-word',word.word);chip.setAttribute('data-state',word.state||'not-started');words.append(chip);}list.append(words,node('p','先复习到期词，再选择有材料语境的新词。已开始组可续作；独立词库候选不自动算作本课必学。没有明确材料关联时，回到原课语境练习。','memory-subtle'));const current=controller?.getState?.();list.hidden=retention?.isActive?.()===true||!!options.isReviewActive?.()||current?.testing===true||['completion','meaning','dictation'].includes(current?.phase);const stats=node('details');stats.append(node('summary','查看8000词总进度与证据'),grid,progress);dashboard.replaceChildren(top,route,list,feedback,stats,note);}
      dashboard.append(renderSavedBatches());
      if (finished) {
        const next = button(available ? '继续下一组必学词' : '查看今日下一步', async () => {
          controller?.destroy?.(); controller = null; batch = null; practice.replaceChildren();
          if (available) await start(); else await options.openReview?.();
        },true);
        dashboard.append(next);
      }
      retention?.render?.(dashboard);
    }
    const retentionAPI=root.IELTSLexicalRetentionV88;
    const releaseMapping=legacyReleaseMapping(M.read(),{retention:retentionAPI,bankRuntime:options.bankRuntime});
    if(releaseMapping.status!=='ready')throw Error('已保存词汇的版本待核验，原答案和原音保留，请重试加载完整学习包。');
    retention=retentionAPI?.mount?.({document:doc,practice,memory:M,store,records:R,profiles:P,storage:P.storage(),day,now,check,durable,initialRecords:records,sourceOptions,getRecords:()=>records,getNormalPlan:currentPlan,getContext:()=>currentContext,getBudget:options.getBudget,refreshBudget:options.refreshBudget,setRecords:values=>{records=values;},render,canStart:()=>!controller?.getMediaState?.()?.busy&&(!batch||finished),onActiveChange:async(active,detail)=>{if(active){await options.onNewWordsOpened?.();check();controller?.destroy?.();controller=null;batch=null;finished=false;}await options.onActiveChange?.(active,detail);}})||null;
    const interact = () => { lastInteraction = now();retention?.interact?.(); };
    const changed = () => { if (!savingDraft && !saving && !retention?.isBusy?.()) render(); };
    const recordsChanged = () => { R?.list?.().then(values => { if (!disposed) { records = values; retention?.setRecords?.(values);if(!retention?.isBusy?.())render(); } }).catch(error => notice(error.message)); };
    const profileChanged = () => { disposed = true; retention?.destroy?.();controller?.destroy?.();practice.querySelectorAll('input,textarea,button').forEach(el=>{el.disabled=true;});dashboard.replaceChildren(node('p','学习档案已切换，请刷新后继续。')); };
    const pagehide = () => { try { retention?.save?.();activity(); saveDraft(); } catch (_) {} controller?.pause?.(); };
    const beforeunload=event=>{if(!disposed&&(unsaved||saving||controller?.getMediaState?.()?.busy)){event.preventDefault();event.returnValue='';}};
    ['pointerdown','keydown','input'].forEach(type => doc.addEventListener(type,interact,{passive:true}));
    root.addEventListener?.('ielts:memory-changed',changed);
    root.addEventListener?.('ielts:records-changed',recordsChanged);
    root.addEventListener?.('ielts:profile-changed',profileChanged);
    root.addEventListener?.('pagehide',pagehide);
    root.addEventListener?.('beforeunload',beforeunload);
    const timer = root.setInterval?.(() => { try { activity(); } catch (error) { notice(error.message); } },1000);
    render();
    if(!Object.hasOwn(options,'initialRecords'))recordsChanged();
    return {render,openBatch,openSavedBatch,refreshSavedBatches,start,getPlan:currentPlan,getRetentionPlan:()=>retention?.getPlan?.()||{required:false,ready:[],waiting:[],completed:[],lapses:0},startRetention:(key,index)=>retention?.start?.(key,index),submitRetention:()=>retention?.submit?.(),getDrafts:()=>{const rows=E.activityDrafts(M.read());if(batch&&!finished){const id=batch.draft?.id||batch.id,index=rows.findIndex(row=>row.id===id),live={id,materialId:batch.materialId,courseDay:batch.courseDay,taskId:'vocabulary',skill:'vocabulary',startedAt:batch.draft?.startedAt||batch.startedAt,activeSeconds:batch.activeSeconds||0,activityByDate:{...(batch.activityByDate||{})}};if(index>=0)rows[index]=live;else rows.push(live);}return rows;},pause(){retention?.pause?.();activity();saveDraft();controller?.pause?.();},getState:()=>controller?.getState?.()||null,setRecords(values){records=values;retention?.setRecords?.(values);render();},
      isBusy:()=>!!saving || historyReading || !!retention?.isBusy?.() || !!controller?.getMediaState?.()?.busy,save:pagehide,destroy(){pagehide();disposed=true;retention?.destroy?.();controller?.destroy?.();root.clearInterval?.(timer);
        ['pointerdown','keydown','input'].forEach(type => doc.removeEventListener?.(type,interact));
        root.removeEventListener?.('ielts:memory-changed',changed);root.removeEventListener?.('ielts:records-changed',recordsChanged);root.removeEventListener?.('ielts:profile-changed',profileChanged);root.removeEventListener?.('pagehide',pagehide);root.removeEventListener?.('beforeunload',beforeunload);}};
  }
  return {BATCH_SIZE,SOURCE,courseDay,courseWords,pendingCourseWords,hasUnsubmittedReviews,recordForBatch,committedRecord,legacyReleaseMapping,mount};
});

