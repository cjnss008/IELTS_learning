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
    message: byId('actionMessage')
  };
  const state = { busy: '', serviceAvailable: null, connected: false, baseUrl: '', model: null, models: [] };

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
    elements.testModel.disabled = blocked || !state.connected || !hasModel(state.model) || elements.modelSelect.value !== state.model;
    elements.connect.textContent = state.busy === 'connect' ? '正在连接并获取模型…' : '确认连接并获取模型';
    elements.saveModel.textContent = state.busy === 'model' ? '正在保存…' : '保存模型选择';
    elements.testModel.textContent = state.busy === 'test' ? '正在验证，最多约 60 秒…' : '验证当前模型';
    elements.disconnect.textContent = state.busy === 'disconnect' ? '正在清除连接…' : '断开连接并清除密钥';
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
      elements.hint.textContent = '本地服务可用，请填写连接信息。';
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
      elements.modelHelp.textContent = '当前选择已保存于本地服务内存中。';
    } else {
      elements.modelHelp.textContent = '请从接口提供的列表中选择模型，再保存选择。';
    }
    setControls();
  }

  function acceptStatus(payload) {
    if (!payload || typeof payload.connected !== 'boolean') {
      throw { kind: 'format' };
    }
    const oldModel = state.model;
    state.serviceAvailable = true;
    state.connected = payload.connected;
    state.baseUrl = state.connected && typeof payload.baseUrl === 'string' ? payload.baseUrl : '';
    const seen = new Set();
    state.models = state.connected && Array.isArray(payload.models) ? payload.models.filter(function (item) {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).map(function (item) { return { id: item.id }; }) : [];
    state.model = state.connected && hasModel(payload.model) ? payload.model : null;
    if (oldModel !== state.model || !state.connected) clearTestResult();
    if (state.connected && state.baseUrl) elements.baseUrl.value = state.baseUrl;
    elements.warning.textContent = typeof payload.warning === 'string' ? payload.warning : '';
    elements.warning.hidden = !elements.warning.textContent;
    elements.guide.hidden = true;
    rebuildModels();
    renderConnection();
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

  function finish() {
    elements.apiKey.value = '';
    state.busy = '';
    setControls();
  }

  async function refreshStatus() {
    if (!begin('status', '正在检查本地服务和模型连接…')) return;
    try {
      const payload = await request('/api/ai/status', { timeout: 10000 });
      acceptStatus(payload);
      message(state.connected ? '已读取当前连接状态。' : '本地服务已就绪，请填写 API 地址和密钥。', state.connected ? 'success' : '');
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
      message('已保存当前模型：' + state.model + '。', 'success');
    } catch (error) {
      showFailure(error, '保存模型选择失败，请刷新连接状态后重试。');
    } finally {
      finish();
    }
  });

  elements.testModel.addEventListener('click', async function () {
    if (!state.connected || !hasModel(state.model) || elements.modelSelect.value !== state.model || !begin('test', '正在向当前模型发送极短测试请求，最多等待约 60 秒；本次测试不上传学习资料。')) return;
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
      finish();
    }
  });

  elements.disconnect.addEventListener('click', async function () {
    if (!state.connected || !begin('disconnect', '正在断开连接并清除本地服务中的密钥…')) return;
    clearTestResult();
    try {
      const payload = await request('/api/ai/connection', { method: 'DELETE' });
      acceptStatus(payload);
      message('已断开连接，本地服务中的密钥和模型选择已清除。', 'success');
    } catch (error) {
      showFailure(error, '断开连接失败，请刷新连接状态后重试。');
    } finally {
      finish();
    }
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
    renderConnection();
    refreshStatus();
  }
}());
