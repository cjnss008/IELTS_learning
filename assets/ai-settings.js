(function () {
  'use strict';

  const allowedOrigin = window.location.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
  const byId = function (id) { return document.getElementById(id); };
  const elements = {
    root: byId('aiSettings'),
    status: byId('connectionStatus'),
    hint: byId('connectionHint'),
    guide: byId('serviceGuide'),
    guideReason: byId('serviceGuideReason'),
    form: byId('connectionForm'),
    connectionFields: byId('connectionFields'),
    baseUrl: byId('apiBaseUrl'),
    apiKey: byId('apiKey'),
    preferredModel: byId('preferredModel'),
    connect: byId('connectButton'),
    activeBaseUrl: byId('activeBaseUrl'),
    activeModel: byId('activeModel'),
    modelCount: byId('modelCount'),
    modelFields: byId('modelFields'),
    modelSelect: byId('modelSelect'),
    modelHelp: byId('modelSelectionHelp'),
    warning: byId('modelWarning'),
    saveModel: byId('saveModelButton'),
    testModel: byId('testModelButton'),
    testResult: byId('testResult'),
    testHeading: byId('testResultHeading'),
    testReply: byId('testReply'),
    refresh: byId('refreshButton'),
    disconnect: byId('disconnectButton'),
    message: byId('actionMessage'),
    budgetMonth: byId('budgetMonth'), budgetLimitNote: byId('budgetLimitNote'),
    budgetSpent: byId('budgetSpent'), budgetReserved: byId('budgetReserved'), budgetRemaining: byId('budgetRemaining'),
    budgetMeter: byId('budgetMeter'), budgetMeterSpent: byId('budgetMeterSpent'), budgetMeterReserved: byId('budgetMeterReserved'),
    budgetTextLabel: byId('budgetTextLabel'), budgetSpeechLabel: byId('budgetSpeechLabel'),
    budgetText: byId('budgetText'), budgetSpeech: byId('budgetSpeech'), budgetStatus: byId('budgetStatus'),
    budgetThresholdNote: byId('budgetThresholdNote'), refreshBudget: byId('refreshBudgetButton'), testBudgetHelp: byId('testBudgetHelp'),
    budgetControlForm: byId('budgetControlForm'), budgetEnabled: byId('budgetEnabled'), saveBudgetControl: byId('saveBudgetControlButton'),
    textPriceForm: byId('textPriceForm'), textPriceFields: byId('textPriceFields'), textPriceTarget: byId('textPriceTarget'), textPriceStatus: byId('textPriceStatus'),
    textInputPrice: byId('textInputPrice'), textOutputPrice: byId('textOutputPrice'), textPriceSource: byId('textPriceSource'),
    textPriceConfirm: byId('textPriceConfirm'), saveTextPrice: byId('saveTextPriceButton'),
    speechPriceForm: byId('speechPriceForm'), speechPriceFields: byId('speechPriceFields'), speechPriceTarget: byId('speechPriceTarget'), speechPriceStatus: byId('speechPriceStatus'),
    speechUnitPrice: byId('speechUnitPrice'), speechPriceUnit: byId('speechPriceUnit'), speechBillingSeconds: byId('speechBillingSeconds'),
    speechPriceSource: byId('speechPriceSource'), speechPriceConfirm: byId('speechPriceConfirm'), saveSpeechPrice: byId('saveSpeechPriceButton')
  };
  const state = { busy: '', serviceAvailable: null, connected: false, baseUrl: '', model: null, models: [], persistenceHint: '', credentialStorage: '', budget: null, lastBudgetEnabled: false, budgetControlDirty: false, budgetError: '', speechEndpoint: '', speechStatusKnown: false, textPriceDirty: false, speechPriceDirty: false };

  const money = function (value) { return '¥' + value.toFixed(2); };
  const finiteMoney = function (value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; };
  function currentTextPrice() {
    const price = state.budget && state.budget.textPrice;
    return price && price.baseUrl === state.baseUrl && price.model === state.model ? price : null;
  }
  function paidReady() {
    if (!state.budget) return !state.lastBudgetEnabled;
    if (!state.budget.enabled) return true;
    return Boolean(['ok', 'warning'].includes(state.budget.state) && state.budget.remainingCny > 0 && state.budget.pricingKnown && currentTextPrice());
  }

  function message(text, tone) {
    elements.message.textContent = text;
    elements.message.dataset.tone = tone || '';
  }

  function clearTestResult() {
    elements.testResult.hidden = true;
    elements.testReply.textContent = '';
    elements.testHeading.textContent = '模型验证结果';
  }

  function hasModel(model) {
    return typeof model === 'string' && state.models.some(function (item) { return item.id === model; });
  }

  function setControls() {
    const blocked = !allowedOrigin || Boolean(state.busy) || state.serviceAvailable !== true;
    elements.root.setAttribute('aria-busy', String(Boolean(state.busy)));
    elements.connectionFields.disabled = blocked;
    elements.modelFields.disabled = blocked || !state.connected;
    elements.refresh.disabled = !allowedOrigin || Boolean(state.busy);
    elements.disconnect.disabled = blocked || !state.connected;
    elements.saveModel.disabled = blocked || !state.connected || !hasModel(elements.modelSelect.value) || elements.modelSelect.value === state.model;
    elements.testModel.disabled = blocked || !state.connected || !hasModel(state.model) || elements.modelSelect.value !== state.model || !paidReady();
    elements.refreshBudget.disabled = !allowedOrigin || Boolean(state.busy);
    elements.budgetEnabled.disabled = blocked;
    elements.saveBudgetControl.disabled = blocked;
    elements.textPriceFields.disabled = blocked || !hasModel(state.model) || elements.modelSelect.value !== state.model;
    elements.speechPriceFields.disabled = blocked || !state.speechStatusKnown || !state.speechEndpoint;
    elements.connect.textContent = state.busy === 'connect' ? '正在连接并获取模型…' : '确认连接并获取模型';
    elements.saveModel.textContent = state.busy === 'model' ? '正在保存…' : '保存模型选择';
    elements.testModel.textContent = state.busy === 'test' ? '正在验证，最多约 60 秒…' : '验证当前模型';
    elements.disconnect.textContent = state.busy === 'disconnect' ? '正在清除连接…' : '断开连接并清除密钥';
    elements.saveTextPrice.textContent = state.busy === 'textPrice' ? '正在保存报价…' : '确认并保存文字报价';
    elements.saveSpeechPrice.textContent = state.busy === 'speechPrice' ? '正在保存报价…' : '确认并保存语音报价';
    elements.refreshBudget.textContent = state.busy === 'budget' ? '正在读取…' : '刷新用量';
    elements.saveBudgetControl.textContent = state.busy === 'budgetControl' ? '正在保存…' : '保存限额开关';
    elements.testBudgetHelp.textContent = paidReady() ? '验证会发送极短请求，可能产生服务商费用。最多等待约 60 秒；本次不上传学习资料。' : '已启用的费用上限暂不允许验证。可在高级设置查看原因、补充报价或关闭限额；离线练习不受影响。';
  }

  function renderConnection() {
    if (!allowedOrigin || state.serviceAvailable === false) {
      elements.status.textContent = '服务不可用';
      elements.status.dataset.state = 'unavailable';
      elements.hint.textContent = '启动本地服务后，从本地设置地址打开。';
    } else if (state.serviceAvailable === null) {
      elements.status.textContent = '正在检查…';
      elements.status.dataset.state = 'checking';
      elements.hint.textContent = '正在检查本地服务。';
    } else if (state.connected) {
      elements.status.textContent = '已连接';
      elements.status.dataset.state = 'connected';
      elements.hint.textContent = state.model ? '模型已选择，可发送简短请求验证。' : 'API 已连接，请选择一个可用模型。';
    } else {
      elements.status.textContent = '未连接';
      elements.status.dataset.state = 'disconnected';
      elements.hint.textContent = state.persistenceHint || '本地服务可用，请填写连接信息。';
    }
    elements.activeBaseUrl.textContent = state.connected ? state.baseUrl : '尚未连接';
    elements.activeModel.textContent = state.model || '尚未选择';
    elements.modelCount.textContent = state.models.length + ' 个';
    setControls();
  }

  function rebuildModels() {
    elements.modelSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = state.connected ? (state.models.length ? '请选择一个可用模型' : '接口尚未返回可用模型') : '连接后加载模型列表';
    elements.modelSelect.appendChild(placeholder);
    state.models.forEach(function (model) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.id;
      elements.modelSelect.appendChild(option);
    });
    elements.modelSelect.value = hasModel(state.model) ? state.model : '';
    updateModelHelp();
  }

  function updateModelHelp() {
    if (!state.connected) {
      elements.modelHelp.textContent = '确认连接后，这里会显示接口返回的模型。';
    } else if (!state.models.length) {
      elements.modelHelp.textContent = '当前没有可选择的模型，请检查 API 服务后重新连接。';
    } else if (elements.modelSelect.value && elements.modelSelect.value !== state.model) {
      elements.modelHelp.textContent = '已选择新模型，请点击“保存模型选择”后再验证。';
    } else if (state.model) {
      elements.modelHelp.textContent = state.credentialStorage === 'memory' ? '当前模型选择已应用于本次服务；未启用长期保存，重启后需重新连接。' : state.credentialStorage === 'windows-dpapi-current-user' ? '当前模型选择已应用于本次服务；已开启本电脑与当前 Windows 账户的加密保存，实际保存结果见“本机配置保存”。' : '当前模型选择已应用于本次服务；是否可跨重启恢复，请查看“本机配置保存”的实际状态。';
    } else {
      elements.modelHelp.textContent = '请从接口提供的列表中选择模型，再保存选择。';
    }
    setControls();
  }

  function acceptStatus(payload) {
    if (!payload || typeof payload.connected !== 'boolean') {
      throw { kind: 'format' };
    }
    const oldModel = state.model, oldBaseUrl = state.baseUrl;
    state.serviceAvailable = true;
    state.connected = payload.connected;
    state.persistenceHint = '';
    state.credentialStorage = ['memory', 'windows-dpapi-current-user'].includes(payload.credentialStorage) ? payload.credentialStorage : '';
    state.baseUrl = state.connected && typeof payload.baseUrl === 'string' ? payload.baseUrl : '';
    const seen = new Set();
    state.models = state.connected && Array.isArray(payload.models) ? payload.models.filter(function (item) {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).map(function (item) { return { id: item.id }; }) : [];
    state.model = state.connected && hasModel(payload.model) ? payload.model : null;
    if (oldModel !== state.model || oldBaseUrl !== state.baseUrl) {
      state.budget = null; state.textPriceDirty = false;
      elements.textInputPrice.value = ''; elements.textOutputPrice.value = ''; elements.textPriceSource.value = ''; elements.textPriceConfirm.checked = false;
      renderBudget();
    }
    if (oldModel !== state.model || !state.connected) clearTestResult();
    if (state.connected && state.baseUrl) elements.baseUrl.value = state.baseUrl;
    elements.warning.textContent = typeof payload.warning === 'string' ? payload.warning : '';
    elements.warning.hidden = !elements.warning.textContent;
    elements.guide.hidden = true;
    rebuildModels();
    renderConnection();
  }

  function acceptBudget(payload) {
    const budget = payload && payload.budget;
    if (!payload || payload.ok !== true || !budget || budget.currency !== 'CNY' || !/^\d{4}-\d{2}$/.test(budget.month) || !['ok', 'warning', 'stopped', 'blocked'].includes(budget.state) ||
      !['monthlyLimitCny', 'warningAtCny', 'stopAtCny', 'spentCny', 'reservedCny', 'remainingCny'].every(function (key) { return finiteMoney(budget[key]); }) ||
      budget.stopAtCny > budget.monthlyLimitCny || budget.warningAtCny > budget.stopAtCny || typeof budget.pricingKnown !== 'boolean' || typeof budget.enabled !== 'boolean') throw { kind: 'format' };
    if (!budget.categories || !['text', 'speech'].every(function (key) {
      const category = budget.categories[key];
      return category && ['softLimitCny', 'spentCny', 'reservedCny'].every(function (field) { return finiteMoney(category[field]); });
    }) || !Array.isArray(budget.speechPrices)) throw { kind: 'format' };
    function validPrice(price) { return price && finiteMoney(price.inputPerMillionCny) && finiteMoney(price.outputPerMillionCny) && typeof price.baseUrl === 'string' && typeof price.model === 'string' && typeof price.source === 'string' && typeof price.confirmedAt === 'string'; }
    if (budget.textPrice !== null && !validPrice(budget.textPrice)) throw { kind: 'format' };
    if (budget.speechPrices.some(function (price) { return !price || typeof price.endpoint !== 'string' || !finiteMoney(price.perMinuteCny) || !Number.isInteger(price.billingIncrementSeconds) || price.billingIncrementSeconds < 1 || price.billingIncrementSeconds > 60 || typeof price.source !== 'string' || typeof price.confirmedAt !== 'string'; })) throw { kind: 'format' };
    state.budget = budget; state.lastBudgetEnabled = budget.enabled; state.budgetError = '';
    if (!state.budgetControlDirty) elements.budgetEnabled.checked = budget.enabled;
    renderBudget();
  }

  function renderBudget() {
    const budget = state.budget;
    if (!budget) {
      elements.budgetMonth.textContent = '';
      elements.budgetSpent.textContent = '—'; elements.budgetReserved.textContent = '—'; elements.budgetRemaining.textContent = '—';
      elements.budgetStatus.textContent = state.budgetError || (state.lastBudgetEnabled ? '已启用限额，但暂未读取可用预算。可关闭限额或稍后重试。' : '用量暂不可用，默认不启用费用上限；可继续连接和验证 AI。');
      elements.budgetStatus.dataset.state = state.lastBudgetEnabled ? 'blocked' : 'warning';
      elements.budgetText.textContent = '用量待确认'; elements.budgetSpeech.textContent = '用量待确认';
      elements.budgetMeterSpent.style.width = '0%'; elements.budgetMeterReserved.style.width = '0%';
      elements.budgetMeter.setAttribute('aria-valuenow', '0');
    } else {
      elements.budgetMonth.textContent = budget.month + ' · 香港时间';
      elements.budgetLimitNote.textContent = (budget.enabled ? '当前启用：' : '当前未启用限额。可选配置：') + '总预算 ' + money(budget.monthlyLimitCny) + '，调用额度 ' + money(budget.stopAtCny) + '，结算缓冲 ' + money(budget.monthlyLimitCny - budget.stopAtCny) + '。';
      elements.budgetSpent.textContent = money(budget.spentCny); elements.budgetReserved.textContent = money(budget.reservedCny); elements.budgetRemaining.textContent = budget.enabled ? money(budget.remainingCny) : '不限额';
      const spentPercent = budget.stopAtCny ? Math.min(100, 100 * budget.spentCny / budget.stopAtCny) : 0;
      const reservedPercent = budget.stopAtCny ? Math.min(100 - spentPercent, 100 * budget.reservedCny / budget.stopAtCny) : 0;
      elements.budgetMeterSpent.style.width = spentPercent + '%'; elements.budgetMeterReserved.style.width = reservedPercent + '%';
      elements.budgetMeter.setAttribute('aria-valuemax', String(budget.stopAtCny));
      elements.budgetMeter.setAttribute('aria-valuenow', String(Math.min(budget.stopAtCny, budget.spentCny + budget.reservedCny)));
      ['text', 'speech'].forEach(function (key) {
        const category = budget.categories[key], target = key === 'text' ? elements.budgetText : elements.budgetSpeech;
        const label = key === 'text' ? elements.budgetTextLabel : elements.budgetSpeechLabel;
        label.textContent = (key === 'text' ? '文字 AI' : '语音服务') + ' · 建议分配 ' + money(category.softLimitCny);
        target.textContent = '累计 ' + money(category.spentCny) + ' · 预留 ' + money(category.reservedCny) + (budget.enabled && category.spentCny + category.reservedCny >= category.softLimitCny ? ' · 已达分配提醒线，继续使用仍受总额度限制。' : '');
      });
      const labels = { ok: '本月调用额度可用。请先核对当前模型或语音服务的价格。', warning: '已接近本月停止线，请优先完成关卡反馈，其他任务可先离线练习。', stopped: '本月新增付费调用已暂停。继续保留作文与录音，额度可用后再主动送评。', blocked: '预算记录暂不可用，付费调用已暂停。请保留已有记录并检查本地服务，不要删除账本来重新计费。' };
      elements.budgetStatus.textContent = budget.enabled ? labels[budget.state] + (budget.state === 'blocked' && typeof budget.blockedReason === 'string' ? ' ' + budget.blockedReason.slice(0, 240) : '') : '未启用费用上限。未知报价或估算暂不可用不会阻止 AI 学习；显示的费用只覆盖可估算部分。';
      elements.budgetStatus.dataset.state = budget.enabled ? budget.state : 'ok';
      if (Number.isInteger(budget.unpricedRequests) && budget.unpricedRequests > 0) elements.budgetStatus.textContent += ' 本月另有 ' + budget.unpricedRequests + ' 次调用尚未估价。';
      if (budget.state === 'blocked') {
        elements.budgetSpent.textContent = '—'; elements.budgetReserved.textContent = '—';
        elements.budgetText.textContent = '用量暂不可读取'; elements.budgetSpeech.textContent = '用量暂不可读取';
        if (!budget.enabled) { elements.budgetStatus.textContent = '用量记录暂不可读取，金额不作零费用处理。未启用限额，不影响 AI 学习；请保留原始记录。'; elements.budgetStatus.dataset.state = 'warning'; }
      }
      elements.budgetThresholdNote.textContent = '仅启用限额时：累计估算达到 ' + money(budget.warningAtCny) + ' 提醒，达到 ' + money(budget.stopAtCny) + ' 停止新增付费请求。文字与语音共用额度，分配比例只用于提醒。暂停时仍可离线学习，不会自动补发任务。';
    }
    renderPrices(); setControls();
  }

  function renderPrices() {
    const textPrice = currentTextPrice();
    elements.textPriceTarget.textContent = state.connected && state.model ? state.baseUrl + ' · ' + state.model : '连接并选择模型后，设置对应价格。';
    elements.textPriceStatus.textContent = textPrice ? '当前生效报价：输入 ' + money(textPrice.inputPerMillionCny) + '、输出 ' + money(textPrice.outputPerMillionCny) + ' / 百万 tokens。依据：' + textPrice.source + '；记录日期 ' + textPrice.confirmedAt.slice(0, 10) + '。' : '此模型尚未估价，不代表免费。未启用限额时可直接使用；启用后需填写并确认报价。';
    if (!state.textPriceDirty) {
      elements.textInputPrice.value = textPrice ? String(textPrice.inputPerMillionCny) : '';
      elements.textOutputPrice.value = textPrice ? String(textPrice.outputPerMillionCny) : '';
      elements.textPriceSource.value = textPrice ? textPrice.source : '';
      elements.textPriceConfirm.checked = false;
    }
    const speechPrice = state.budget && state.budget.speechPrices.find(function (price) { return price.endpoint === state.speechEndpoint; });
    elements.speechPriceTarget.textContent = state.speechEndpoint ? '当前语音资源：' + state.speechEndpoint : '请先在口语练习页配置语音资源，再回来刷新用量并设置报价。';
    elements.speechPriceStatus.textContent = speechPrice ? '当前生效总价：' + money(speechPrice.perMinuteCny) + ' / 分钟，按 ' + speechPrice.billingIncrementSeconds + ' 秒向上取整。依据：' + speechPrice.source + '；记录日期 ' + speechPrice.confirmedAt.slice(0, 10) + '。' : '当前语音资源尚未估价。未启用限额时不因此阻止诊断；录音和回听不受影响。';
    if (!state.speechPriceDirty) {
      elements.speechPriceUnit.value = 'hour';
      elements.speechUnitPrice.value = speechPrice ? String(Number((speechPrice.perMinuteCny * 60).toFixed(6))) : '';
      elements.speechBillingSeconds.value = speechPrice ? String(speechPrice.billingIncrementSeconds) : '60';
      elements.speechPriceSource.value = speechPrice ? speechPrice.source : '';
      elements.speechPriceConfirm.checked = false;
    }
  }

  async function loadBudget() {
    const results = await Promise.allSettled([request('/api/budget/status'), request('/api/speech/status')]);
    if (results[1].status === 'fulfilled' && results[1].value && results[1].value.ok === true && typeof results[1].value.configured === 'boolean') {
      const endpoint = results[1].value.configured && typeof results[1].value.endpoint === 'string' ? results[1].value.endpoint : '';
      if (endpoint !== state.speechEndpoint) state.speechPriceDirty = false;
      state.speechEndpoint = endpoint; state.speechStatusKnown = true;
    } else { state.speechEndpoint = ''; state.speechStatusKnown = false; state.speechPriceDirty = false; }
    try {
      if (results[0].status === 'rejected') throw results[0].reason;
      acceptBudget(results[0].value);
    } catch (error) {
      state.budget = null;
      state.budgetError = error && error.kind === 'backend' ? safeBackendMessage(error.payload, '用量记录未能读取，请稍后刷新。') : '用量记录未能读取，请稍后刷新。未启用限额时不因此阻止学习；原始记录不会自动重置。';
      renderBudget();
    }
  }

  function safeBackendMessage(payload, fallback, privateValue) {
    const candidate = payload && payload.error && payload.error.message;
    if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > 240 || /[\r\n]/.test(candidate)) return fallback;
    if (privateValue && candidate.includes(privateValue)) return fallback;
    return candidate;
  }

  async function request(path, options) {
    if (!allowedOrigin) throw { kind: 'origin' };
    const controller = new AbortController();
    const settings = options || {};
    const timeout = window.setTimeout(function () { controller.abort(); }, settings.timeout || 15000);
    try {
      const init = {
        method: settings.method || 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      };
      if (Object.prototype.hasOwnProperty.call(settings, 'body')) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(settings.body);
      }
      const response = await fetch(path, init);
      let payload;
      try { payload = await response.json(); } catch (_) { throw { kind: 'format' }; }
      if (!response.ok || payload && payload.ok === false) throw { kind: 'backend', payload: payload };
      return payload;
    } catch (error) {
      if (error && error.kind) throw error;
      if (error && error.name === 'AbortError') throw { kind: 'timeout' };
      throw { kind: 'network' };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function showFailure(error, fallback, privateValue) {
    if (error && error.kind === 'backend') {
      state.serviceAvailable = true;
      message(safeBackendMessage(error.payload, fallback, privateValue), 'error');
    } else if (error && error.kind === 'format') {
      message('本地服务返回了无法识别的结果，请重新启动服务后重试。', 'error');
    } else {
      state.serviceAvailable = false;
      elements.guideReason.textContent = '当前无法确认本地服务状态。请确认服务窗口仍在运行，随后刷新连接状态。';
      elements.guide.hidden = false;
      message(error && error.kind === 'timeout' ? '等待本地服务响应超时。请刷新连接状态后重试。' : '无法连接本地服务。请先启动“启动学习.cmd”，再刷新连接状态。', 'error');
    }
    renderConnection();
  }

  function begin(operation, text) {
    if (state.busy || !allowedOrigin) return false;
    state.busy = operation;
    message(text, 'pending');
    setControls();
    return true;
  }

  function finish(clearKey) {
    if (clearKey !== false) elements.apiKey.value = '';
    state.busy = '';
    setControls();
  }

  function configurationRecoveryHint(data) {
    const reasons = {
      LOCAL_CONFIGURATION_REQUIRED: '这台电脑或当前 Windows 账户尚未配置，请在本机首次填写 AI 与语音服务。共享目录中其他电脑的加密配置保留。',
      LOCAL_CONFIGURATION_UNREADABLE: '这台电脑已保存的连接配置未能解密，请在本机重新配置 AI 与语音服务。原加密配置保留。',
      CREDENTIAL_STORAGE_FAILED: '这台电脑的配置读取或保存未完成，请检查本机保存状态后重新填写连接信息。现有加密文件保留。'
    };
    if (data && Object.hasOwn(reasons, data.errorCode)) return reasons[data.errorCode];
    return typeof data?.error === 'string' && data.error.trim() ? '这台电脑的已保存连接未能恢复，请在本机重新填写连接信息。原有配置文件保留。' : '';
  }

  async function refreshStatus() {
    if (!begin('status', '正在检查本地服务和模型连接…')) return;
    try {
      const payload = await request('/api/ai/status', { timeout: 10000 });
      acceptStatus(payload);
      if (!state.connected) {
        try { state.persistenceHint = configurationRecoveryHint(await request('/api/settings/persistence', { timeout: 10000 })); } catch (_) { state.persistenceHint = ''; }
        renderConnection();
      }
      await loadBudget();
      message(state.connected ? '已读取当前连接状态。' : state.persistenceHint || '本地服务已就绪，请填写 API 地址和密钥。', state.connected ? 'success' : '');
    } catch (error) {
      showFailure(error, '读取连接状态失败，请稍后重试。');
    } finally {
      finish();
    }
  }

  elements.form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (state.busy || !allowedOrigin) return;
    const details = { baseUrl: elements.baseUrl.value.trim(), apiKey: elements.apiKey.value.trim(), preferredModel: elements.preferredModel.value.trim() };
    if (!details.baseUrl || !details.apiKey) {
      elements.apiKey.value = '';
      details.apiKey = '';
      message('请填写 API 地址和密钥。', 'error');
      return;
    }
    if (!begin('connect', '正在通过本地服务确认连接并获取可用模型…')) {
      details.apiKey = '';
      elements.apiKey.value = '';
      return;
    }
    clearTestResult();
    try {
      const payload = await request('/api/ai/connect', { method: 'POST', body: details, timeout: 45000 });
      acceptStatus(payload);
      await loadBudget();
      message(state.model ? '连接成功，已选择模型 ' + state.model + '。' : 'API 连接成功，请从列表中选择并保存一个模型。', 'success');
    } catch (error) {
      showFailure(error, '连接失败，请检查 API 地址和密钥后重试。', details.apiKey);
    } finally {
      details.apiKey = '';
      finish();
    }
  });

  elements.modelSelect.addEventListener('change', updateModelHelp);
  elements.saveModel.addEventListener('click', async function () {
    const selected = elements.modelSelect.value;
    if (!hasModel(selected) || !state.connected || !begin('model', '正在保存模型选择…')) return;
    clearTestResult();
    try {
      const payload = await request('/api/ai/model', { method: 'POST', body: { model: selected } });
      acceptStatus(payload);
      await loadBudget();
      message('已保存当前模型：' + state.model + '。', 'success');
    } catch (error) {
      showFailure(error, '保存模型选择失败，请刷新连接状态后重试。');
    } finally {
      finish();
    }
  });

  elements.testModel.addEventListener('click', async function () {
    if (!state.connected || !hasModel(state.model) || !paidReady() || elements.modelSelect.value !== state.model || !begin('test', '正在向当前模型发送极短测试请求，最多等待约 60 秒；本次测试不上传学习资料。')) return;
    clearTestResult();
    try {
      const payload = await request('/api/ai/test', { method: 'POST', body: {}, timeout: 70000 });
      if (!payload || payload.ok !== true || typeof payload.reply !== 'string' || typeof payload.model !== 'string') throw { kind: 'format' };
      elements.testHeading.textContent = '验证成功 · ' + payload.model;
      elements.testReply.textContent = payload.reply.slice(0, 1200);
      elements.testResult.hidden = false;
      message('模型已返回测试回复，连接验证成功。', 'success');
    } catch (error) {
      showFailure(error, '模型验证失败，请检查当前模型是否可用后重试。');
    } finally {
      await loadBudget();
      finish();
    }
  });

  elements.disconnect.addEventListener('click', async function () {
    if (!state.connected || !begin('disconnect', '正在断开连接并清除本地服务中的密钥…')) return;
    clearTestResult();
    try {
      const payload = await request('/api/ai/connection', { method: 'DELETE' });
      acceptStatus(payload);
      await loadBudget();
      message('已断开连接，本地服务中的密钥和模型选择已清除。', 'success');
    } catch (error) {
      showFailure(error, '断开连接失败，请刷新连接状态后重试。');
    } finally {
      finish();
    }
  });

  elements.refreshBudget.addEventListener('click', async function () {
    if (!begin('budget', '正在读取用量与可选设置…')) return;
    try { await loadBudget(); message(state.budget ? '用量与设置已更新。' : '用量暂不可用；模型连接仍可继续使用。', state.budget ? 'success' : ''); }
    finally { finish(false); }
  });
  elements.budgetEnabled.addEventListener('change', function () { state.budgetControlDirty = true; });
  elements.budgetControlForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const enabled = elements.budgetEnabled.checked;
    if (!begin('budgetControl', '正在保存可选限额设置…')) return;
    try {
      const payload = await request('/api/budget/config', { method: 'POST', body: { enabled: enabled } });
      state.budgetControlDirty = false; acceptBudget(payload);
      message(enabled ? '已启用费用上限；未知报价或额度不足时会暂停新增付费调用。' : '已关闭费用上限，AI 使用不再受本站额度或报价限制。历史用量仍保留。', 'success');
    } catch (error) { showFailure(error, '限额设置未保存，请刷新后重试。'); }
    finally { finish(false); }
  });
  function enteredNumber(input, name) {
    const text = input.value.trim();
    const value = Number(text);
    if (!text || !Number.isFinite(value) || value <= 0 || value > 100000) throw new Error(name + '应为大于 0 且不超过 100000 的数值，不能留空。');
    return value;
  }
  function enteredSource(input) {
    const source = input.value.trim();
    if (source.replace(/\s/g, '').length < 4 || source.length > 300 || /[\r\n]/.test(source)) throw new Error('请填写 4–300 字的报价依据，不填写密钥或其他凭据。');
    return source;
  }
  elements.textPriceForm.addEventListener('input', function () { state.textPriceDirty = true; });
  elements.speechPriceForm.addEventListener('input', function () { state.speechPriceDirty = true; });
  elements.textPriceForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!state.connected || !hasModel(state.model) || elements.modelSelect.value !== state.model || state.busy) return;
    let price;
    try {
      if (!elements.textPriceConfirm.checked) throw new Error('请先核对并勾选报价确认。');
      price = { baseUrl: state.baseUrl, model: state.model, inputPerMillionCny: enteredNumber(elements.textInputPrice, '输入报价'), outputPerMillionCny: enteredNumber(elements.textOutputPrice, '输出报价'), source: enteredSource(elements.textPriceSource), confirmed: true };
    } catch (error) { message(error.message, 'error'); return; }
    if (!begin('textPrice', '正在保存当前模型的报价…')) return;
    try {
      const payload = await request('/api/budget/config', { method: 'POST', body: { textPrice: price } });
      state.textPriceDirty = false; acceptBudget(payload); message('模型报价已保存，之后的调用按新报价估算；历史用量保留。', 'success');
    } catch (error) { showFailure(error, '模型报价未保存，请核对输入后重试。'); }
    finally { finish(false); }
  });
  elements.speechPriceForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!state.speechStatusKnown || !state.speechEndpoint || state.busy) return;
    let price;
    try {
      if (!elements.speechPriceConfirm.checked) throw new Error('请先核对并勾选语音报价确认。');
      const rate = enteredNumber(elements.speechUnitPrice, '语音报价');
      const increment = Number(elements.speechBillingSeconds.value);
      if (!Number.isInteger(increment) || increment < 1 || increment > 60) throw new Error('计费时长应为 1–60 之间的整数秒。');
      if (!['hour', 'minute'].includes(elements.speechPriceUnit.value)) throw new Error('请选择有效报价单位。');
      price = { endpoint: state.speechEndpoint, perMinuteCny: elements.speechPriceUnit.value === 'hour' ? rate / 60 : rate, billingIncrementSeconds: increment, source: enteredSource(elements.speechPriceSource), confirmed: true };
    } catch (error) { message(error.message, 'error'); return; }
    if (!begin('speechPrice', '正在保存当前语音资源的报价…')) return;
    try {
      const payload = await request('/api/budget/config', { method: 'POST', body: { speechPrice: price } });
      state.speechPriceDirty = false; acceptBudget(payload); message('语音报价已保存。资源连接与实际发音诊断仍需在口语练习页验证。', 'success');
    } catch (error) { showFailure(error, '语音报价未保存，请核对输入后重试。'); }
    finally { finish(false); }
  });

  elements.refresh.addEventListener('click', refreshStatus);
  window.addEventListener('pagehide', function () { elements.apiKey.value = ''; });
  window.addEventListener('pageshow', function (event) {
    elements.apiKey.value = '';
    if (event.persisted && allowedOrigin && !state.busy) refreshStatus();
  });

  if (!allowedOrigin) {
    state.serviceAvailable = false;
    elements.apiKey.value = '';
    elements.guideReason.textContent = window.location.protocol === 'file:' ? '你当前通过本地文件打开此页。请先启动本地服务，再使用下方地址配置连接。' : '请使用本机服务提供的设置地址配置连接。';
    elements.guide.hidden = false;
    message('通过本地服务打开后，即可填写连接信息。', '');
    renderConnection();
  } else {
    renderBudget();
    renderConnection();
    refreshStatus();
  }
}());
