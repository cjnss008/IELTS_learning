'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/ai-settings.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../AI设置.html'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const endpoint = 'https://sample.cognitiveservices.azure.com';
const connection = () => ({ ok: true, connected: true, baseUrl: 'https://example.test', model: 'sample-model', models: [{ id: 'sample-model' }, { id: 'other-model' }] });
function budget(overrides = {}) {
  return { month: '2026-10', timezone: 'Asia/Hong_Kong', currency: 'CNY', enabled: false, monthlyLimitCny: 100, warningAtCny: 70, stopAtCny: 80, spentCny: 0, reservedCny: 0, remainingCny: 80, state: 'ok', blockedReason: '', categories: { text: { softLimitCny: 45, spentCny: 0, reservedCny: 0 }, speech: { softLimitCny: 35, spentCny: 0, reservedCny: 0 } }, textPrice: null, speechPrices: [], pricingKnown: false, ...overrides };
}
const price = () => ({ baseUrl: 'https://example.test', model: 'sample-model', inputPerMillionCny: 2, outputPerMillionCny: 8, source: '测试报价依据', confirmedAt: '2026-10-24T00:00:00.000Z', version: 'test-v1' });

async function browser(options = {}) {
  const env = { elements: new Map(), calls: [], connection: connection(), budget: budget(), speech: { ok: true, configured: false, endpoint: '' }, ...options };
  class Element {
    constructor() { this.value = ''; this.textContent = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.events = {}; this.children = []; this.hidden = false; this.disabled = false; this.checked = false; }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    appendChild(item) { this.children.push(item); }
    replaceChildren(...items) { this.children = items; this.value = ''; }
  }
  const get = id => { if (!env.elements.has(id)) env.elements.set(id, new Element()); return env.elements.get(id); };
  env.get = get;
  env.event = async (id, name = 'click') => { await get(id).events[name]?.({ preventDefault() {} }); await flush(); };
  const windowEvents = {};
  const location = { protocol: options.protocol || 'http:', hostname: '127.0.0.1' };
  const context = { window: { location, setTimeout, clearTimeout, addEventListener(name, fn) { windowEvents[name] = fn; } }, document: { getElementById: get, createElement: () => new Element() }, AbortController, console: { log() {}, error() {} }, fetch: async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    env.calls.push({ url, method: init.method, body });
    let payload;
    if (url === '/api/ai/status') payload = env.connection;
    else if (url === '/api/settings/persistence') { if (env.persistenceFailure) throw new Error('Isolated persistence lookup failed.'); payload = env.persistence || { ok: true, enabled: true, supported: true, error: '' }; }
    else if (url === '/api/budget/status') {
      if (env.budgetFailure) throw new Error('test offline');
      payload = { ok: true, budget: env.budget };
    } else if (url === '/api/speech/status') payload = env.speech;
    else if (url === '/api/budget/config') {
      if (Object.hasOwn(body, 'enabled')) env.budget.enabled = body.enabled;
      if (body.textPrice) { env.budget.textPrice = { ...body.textPrice, confirmedAt: '2026-10-24T00:00:00.000Z', version: 'manual-v1' }; delete env.budget.textPrice.confirmed; env.budget.pricingKnown = true; }
      if (body.speechPrice) env.budget.speechPrices = [{ ...body.speechPrice, confirmedAt: '2026-10-24T00:00:00.000Z', version: 'manual-v1' }];
      payload = { ok: true, budget: env.budget };
    } else if (url === '/api/ai/test') payload = { ok: true, reply: 'TEST OK', model: env.connection.model };
    else if (url === '/api/ai/model') { env.connection.model = body.model; env.budget.textPrice = null; env.budget.pricingKnown = false; payload = env.connection; }
    else if (url === '/api/ai/connect') {
      if (env.echoKeyFailure) return { ok: false, json: async () => ({ ok: false, error: { message: 'echo ' + body.apiKey } }) };
      payload = env.connection;
    } else if (url === '/api/ai/connection') { env.connection = { ok: true, connected: false, model: null, models: [] }; env.budget.textPrice = null; env.budget.pricingKnown = false; payload = env.connection; }
    else throw new Error('Unexpected API: ' + url);
    return { ok: true, json: async () => clone(payload) };
  } };
  vm.runInNewContext(source, context, { filename: 'ai-settings.js' });
  env.windowEvents = windowEvents;
  await flush();
  return env;
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }

test('默认不限额，未知模型价格也可验证，启动不会暗中开启限额', async () => {
  const b = await browser();
  assert.equal(b.get('budgetEnabled').checked, false);
  assert.equal(b.get('testModelButton').disabled, false);
  assert.equal(b.get('budgetRemaining').textContent, '不限额');
  assert.match(b.get('textPriceStatus').textContent, /尚未估价/);
  assert.equal(b.calls.filter(c => c.method === 'POST').length, 0);
  await b.event('testModelButton');
  assert.equal(b.calls.filter(c => c.url === '/api/ai/test').length, 1);
  assert.equal(b.get('testReply').textContent, 'TEST OK');
});

test('默认模式下用量读取失败不阻断模型使用', async () => {
  const b = await browser({ budgetFailure: true });
  assert.equal(b.get('testModelButton').disabled, false);
  assert.match(b.get('budgetStatus').textContent, /不.*阻止学习/);
  await b.event('testModelButton');
  assert.equal(b.get('testReply').textContent, 'TEST OK');
});

test('账本不可读时默认仍可使用AI，但金额显示未知而非零费用', async () => {
  const b = await browser({ budget: budget({ state: 'blocked', blockedReason: 'test unreadable' }) });
  assert.equal(b.get('testModelButton').disabled, false);
  assert.equal(b.get('budgetSpent').textContent, '—');
  assert.equal(b.get('budgetReserved').textContent, '—');
  assert.match(b.get('budgetStatus').textContent, /不作零费用处理/);
});

test('主动限额时未知报价阻断验证，用户确认后可保存报价', async () => {
  const b = await browser({ budget: budget({ enabled: true }) });
  assert.equal(b.get('testModelButton').disabled, true);
  await b.event('testModelButton');
  assert.equal(b.calls.filter(c => c.url === '/api/ai/test').length, 0);
  b.get('textInputPrice').value = '3.5'; b.get('textOutputPrice').value = '10'; b.get('textPriceSource').value = '测试服务当前报价';
  await b.event('textPriceForm', 'submit');
  assert.equal(b.calls.filter(c => c.url === '/api/budget/config').length, 0);
  b.get('textPriceConfirm').checked = true;
  await b.event('textPriceForm', 'submit');
  const request = b.calls.find(c => c.url === '/api/budget/config');
  assert.deepEqual(request.body, { textPrice: { baseUrl: 'https://example.test', model: 'sample-model', inputPerMillionCny: 3.5, outputPerMillionCny: 10, source: '测试服务当前报价', confirmed: true } });
  assert.equal(b.get('testModelButton').disabled, false);
  assert.equal(b.get('textPriceConfirm').checked, false);
});

test('关闭限额只改开关，不清空支出或重置已用额度', async () => {
  const b = await browser({ budget: budget({ enabled: true, spentCny: 79, reservedCny: 1, remainingCny: 0, state: 'stopped' }) });
  assert.equal(b.get('testModelButton').disabled, true);
  b.get('budgetEnabled').checked = false;
  await b.event('budgetEnabled', 'change'); await b.event('budgetControlForm', 'submit');
  assert.deepEqual(b.calls.find(c => c.url === '/api/budget/config').body, { enabled: false });
  assert.equal(b.get('budgetSpent').textContent, '¥79.00');
  assert.equal(b.get('budgetReserved').textContent, '¥1.00');
  assert.equal(b.get('testModelButton').disabled, false);
  await b.event('disconnectButton');
  assert.equal(b.budget.spentCny, 79);
});

test('按后端实际限额渲染比例，不固定展示100/80/45/35', async () => {
  const small = budget({ enabled: true, monthlyLimitCny: 50, stopAtCny: 40, warningAtCny: 35, spentCny: 12, reservedCny: 3, remainingCny: 25, textPrice: price(), pricingKnown: true, categories: { text: { softLimitCny: 22.5, spentCny: 12, reservedCny: 3 }, speech: { softLimitCny: 17.5, spentCny: 0, reservedCny: 0 } } });
  const b = await browser({ budget: small });
  assert.match(b.get('budgetLimitNote').textContent, /¥50\.00.*¥40\.00.*¥10\.00/);
  assert.match(b.get('budgetThresholdNote').textContent, /¥35\.00.*¥40\.00/);
  assert.match(b.get('budgetTextLabel').textContent, /22\.50/);
  assert.match(b.get('budgetSpeechLabel').textContent, /17\.50/);
  assert.equal(b.get('budgetMeter').attrs['aria-valuemax'], '40');
  assert.equal(b.get('budgetMeterSpent').style.width, '30%');
  assert.equal(b.get('budgetMeterReserved').style.width, '7.5%');
  assert.equal(b.get('budgetRemaining').textContent, '¥25.00');
});

test('语音报价绑定当前endpoint，小时价换算分钟价且必须确认', async () => {
  const b = await browser({ speech: { ok: true, configured: true, endpoint } });
  b.get('speechUnitPrice').value = '60'; b.get('speechPriceUnit').value = 'hour'; b.get('speechBillingSeconds').value = '30'; b.get('speechPriceSource').value = '测试区域评测合计报价';
  await b.event('speechPriceForm', 'submit');
  assert.equal(b.calls.filter(c => c.url === '/api/budget/config').length, 0);
  b.get('speechPriceConfirm').checked = true;
  await b.event('speechPriceForm', 'submit');
  assert.deepEqual(b.calls.find(c => c.url === '/api/budget/config').body, { speechPrice: { endpoint, perMinuteCny: 1, billingIncrementSeconds: 30, source: '测试区域评测合计报价', confirmed: true } });
});

test('空价格、非法数值或计费粒度不能悄悄变成零价', async () => {
  const b = await browser({ speech: { ok: true, configured: true, endpoint } });
  b.get('textInputPrice').value = ''; b.get('textOutputPrice').value = '8'; b.get('textPriceSource').value = '测试报价依据'; b.get('textPriceConfirm').checked = true;
  await b.event('textPriceForm', 'submit');
  b.get('textInputPrice').value = '-1'; await b.event('textPriceForm', 'submit');
  b.get('speechUnitPrice').value = '60'; b.get('speechPriceUnit').value = 'hour'; b.get('speechBillingSeconds').value = '0'; b.get('speechPriceSource').value = '测试报价依据'; b.get('speechPriceConfirm').checked = true;
  await b.event('speechPriceForm', 'submit');
  assert.equal(b.calls.filter(c => c.url === '/api/budget/config').length, 0);
});

test('切换模型时旧报价不用于新模型，启用限额才阻止未知价验证', async () => {
  const b = await browser({ budget: budget({ enabled: true, textPrice: price(), pricingKnown: true }) });
  assert.equal(b.get('testModelButton').disabled, false);
  b.get('modelSelect').value = 'other-model'; await b.event('modelSelect', 'change');
  assert.equal(b.get('testModelButton').disabled, true);
  await b.event('saveModelButton');
  assert.equal(b.get('testModelButton').disabled, true);
  assert.equal(b.get('textInputPrice').value, '');
  assert.match(b.get('textPriceTarget').textContent, /other-model/);
});

test('连接失败不回显测试密钥，完成请求和离开页面都清空密钥输入', async () => {
  const b = await browser({ echoKeyFailure: true });
  b.get('apiBaseUrl').value = 'https://example.test'; b.get('apiKey').value = 'FAKE_TEST_KEY'; b.get('preferredModel').value = 'sample-model';
  await b.event('connectionForm', 'submit');
  assert.equal(b.get('apiKey').value, '');
  assert.doesNotMatch(b.get('actionMessage').textContent, /FAKE_TEST_KEY/);
  b.get('apiKey').value = 'FAKE_TEST_KEY'; b.windowEvents.pagehide(); assert.equal(b.get('apiKey').value, '');
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.setItem/);
});

test('高级用量、报价与可选语音服务默认折叠，文件模式不请求任何API', async () => {
  assert.equal((html.match(/<details class="ai-advanced">/g) || []).length, 3);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  const b = await browser({ protocol: 'file:' });
  assert.equal(b.calls.length, 0);
  assert.equal(b.get('testModelButton').disabled, true);
  assert.equal(b.get('serviceGuide').hidden, false);
});

test('另一电脑的加密配置不可用时明确引导本电脑首次配置且不回显私有错误内容', async () => {
  const disconnected = { ok: true, connected: false, baseUrl: '', model: null, models: [] }, persistence = { ok: true, enabled: true, supported: true, scope: 'device-windows-user', errorCode: 'LOCAL_CONFIGURATION_REQUIRED', error: 'FAKE_SECRET_TOKEN C:\\private-test\\credentials.dpapi S-1-5-FAKE' }, before = clone(persistence), b = await browser({ connection: disconnected, persistence });
  assert.match(b.get('connectionHint').textContent, /这台电脑或当前 Windows 账户尚未配置.*本机首次填写 AI 与语音服务/);
  assert.match(b.get('actionMessage').textContent, /其他电脑的加密配置保留/);assert.equal(b.get('connectionFields').disabled, false);assert.equal(b.get('apiKey').value, '');
  assert.doesNotMatch(b.get('connectionHint').textContent + b.get('actionMessage').textContent, /FAKE_SECRET_TOKEN|private-test|S-1-5-FAKE/);assert.equal(b.calls.some(c => c.method !== 'GET'), false);assert.deepEqual(persistence, before);assert.deepEqual(b.connection, disconnected);
});

test('本账户解密失败与未知保存错误使用脱敏原因，仍可填写连接信息', async () => {
  for (const [persistence,expected] of [[{errorCode:'LOCAL_CONFIGURATION_UNREADABLE',error:'FAKE_PRIVATE_DETAILS'},/已保存的连接配置未能解密/],[{errorCode:'CREDENTIAL_STORAGE_FAILED',error:'FAKE_PRIVATE_DETAILS'},/配置读取或保存未完成/],[{error:'FAKE_PRIVATE_DETAILS'},/已保存连接未能恢复/]]) {
    const b = await browser({connection:{ok:true,connected:false,models:[]},persistence:{ok:true,...persistence}});assert.match(b.get('connectionHint').textContent,expected);assert.equal(b.get('connectionFields').disabled,false);assert.doesNotMatch(b.get('actionMessage').textContent,/FAKE_PRIVATE_DETAILS/);assert.equal(b.calls.some(c=>c.method!=='GET'),false);
  }
});

test('本电脑连接恢复后刷新清除旧的首次配置提示，且不自动改写配置', async () => {
  const b = await browser({connection:{ok:true,connected:false,models:[]},persistence:{ok:true,errorCode:'LOCAL_CONFIGURATION_REQUIRED',error:'Local setup needed.'}});assert.match(b.get('connectionHint').textContent,/本机首次填写/);b.connection=connection();const start=b.calls.length;await b.event('refreshButton');assert.equal(b.get('connectionStatus').textContent,'已连接');assert.doesNotMatch(b.get('connectionHint').textContent+b.get('actionMessage').textContent,/首次填写|尚未配置/);assert.equal(b.calls.slice(start).some(c=>c.url==='/api/settings/persistence'),false);assert.equal(b.calls.some(c=>c.method!=='GET'),false);
});

test('旧版服务缺少配置恢复状态时不阻断首次连接表单', async () => {
  const b=await browser({connection:{ok:true,connected:false,models:[]},persistenceFailure:true});assert.equal(b.get('connectionStatus').textContent,'未连接');assert.equal(b.get('connectionFields').disabled,false);assert.match(b.get('actionMessage').textContent,/填写 API 地址和密钥/);assert.doesNotMatch(b.get('actionMessage').textContent,/Isolated persistence/);assert.equal(b.calls.some(c=>c.method!=='GET'),false);
});

test('模型选择说明区分加密保存开关、当前服务和未知保存模式，不把开关当作落盘成功', async () => {
  for(const [credentialStorage,expected]of [['memory',/未启用长期保存，重启后需重新连接/],['windows-dpapi-current-user',/已开启本电脑与当前 Windows 账户的加密保存，实际保存结果见/],['unknown-mode',/是否可跨重启恢复，请查看.*实际状态/]]){const current={...connection(),credentialStorage},before=clone(current),b=await browser({connection:current});assert.match(b.get('modelSelectionHelp').textContent,expected);assert.equal(b.calls.some(c=>c.method!=='GET'),false);assert.deepEqual(current,before);}
});

test('刷新连接状态会更新模型保存模式说明，不会自动启用或关闭持久保存', async () => {
  const b=await browser({connection:{...connection(),credentialStorage:'memory'}});assert.match(b.get('modelSelectionHelp').textContent,/未启用长期保存/);b.connection.credentialStorage='windows-dpapi-current-user';await b.event('refreshButton');assert.match(b.get('modelSelectionHelp').textContent,/当前 Windows 账户的加密保存，实际保存结果见/);assert.equal(b.calls.some(c=>c.method!=='GET'),false);
});
