'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const MICRO = 1e6;
class BudgetError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function endpoint(value, azure = false) {
  let url; try { url = new URL(value); } catch { throw new BudgetError(400, 'INVALID_PRICE', '请填写报价对应的有效服务地址。'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      (azure && (!/^[a-z0-9][a-z0-9-]*\.cognitiveservices\.azure\.com$/.test(url.hostname) || url.protocol !== 'https:' || url.pathname !== '/' || url.port))) {
    throw new BudgetError(400, 'INVALID_PRICE', '报价地址格式无效，请勿包含凭据或查询参数。');
  }
  return url.href.replace(/\/+$/, '');
}
function sourceText(value) {
  if (value === undefined) return '用户确认报价';
  if (typeof value !== 'string' || value.trim().length < 4 || value.length > 300) throw new BudgetError(400, 'INVALID_PRICE', '价格依据应为 4–300 个字符，请勿填写密钥。');
  return value.trim();
}
function validPrice(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000; }
function cny(value) { return value / MICRO; }
function createBudget({ filePath, now = () => new Date() }) {
  const lockPath = path.join(path.dirname(filePath), 'budget.lock');
  const restoreMarker = path.basename(path.dirname(filePath)).toLowerCase() === 'config' ? path.join(path.dirname(filePath), '..', 'backups', 'daily', 'restore-in-progress.json') : null;
  const owner = crypto.randomUUID();
  let lockFd, data, blockedReason = '', enabled = false, closed = false, disabledOverride = false;
  const defaultPrice = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', inputPerMillionCny: 2, outputPerMillionCny: 8,
    source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/ · 2026-10-24 高峰非缓存价', confirmedAt: '2026-10-24T00:00:00.000Z', version: 'deepseek-flash-2026-10-24-2-8' };
  function month() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit' }).format(now()); }
  function initial() { return { schema: 1, enabled: false, monthlyLimitCny: 100, textPrices: { 'https://api.deepseek.com|deepseek-flash': defaultPrice, 'https://api.deepseek.com/v1|deepseek-flash': { ...defaultPrice, baseUrl: 'https://api.deepseek.com/v1' } }, speechPrices: {}, months: {}, reservations: {} }; }
  function failure() { return new BudgetError(503, 'BUDGET_BLOCKED', blockedReason || '预算记录不可用或正由另一服务进程使用；可关闭可选预算限制后继续学习。请勿直接覆盖旧账本。'); }
  function lockReason() {
    let holder;
    try { if (fs.statSync(lockPath).size > 4096) throw Error(); holder = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { return '预算锁记录无法核实，请先关闭相关学习服务；保留账本，不会自动删除锁文件。'; }
    if (!holder || typeof holder.hostname !== 'string' || !holder.hostname) return '预算锁为未记录主机的旧格式，无法安全判断持有者；请先确认各设备服务均已关闭，保留账本，再核实并清理旧锁。';
    if (holder.hostname !== os.hostname()) return '预算锁由另一台主机创建；请在该主机关闭学习服务，当前服务不会自动删除共享目录中的锁。';
    if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0) return '预算锁的进程信息无效；请先核实服务状态，保留账本，不会自动删除锁。';
    try { process.kill(holder.pid, 0); return '本机另一个学习服务进程仍持有预算锁，请先关闭重复服务；账本保持不变。'; }
    catch (error) {
      if (error.code === 'ESRCH') return '本机预算锁对应的进程已退出；请先关闭其他学习服务，保留 budget-ledger.json，仅清理核实后的 budget.lock，再重新启动。';
      return '无法核实本机预算锁进程是否仍在运行；请检查进程权限，当前服务不会自动删除锁。';
    }
  }
  function validate(value) {
    if (!value || value.schema !== 1 || typeof value.enabled !== 'boolean' || typeof value.monthlyLimitCny !== 'number' ||
        value.monthlyLimitCny < 0 || value.monthlyLimitCny > 100000 || !Number.isFinite(value.monthlyLimitCny)) throw Error();
    for (const field of ['textPrices', 'speechPrices', 'months', 'reservations']) if (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field])) throw Error();
    for (const price of Object.values(value.textPrices)) if (!validPrice(price.inputPerMillionCny) || !validPrice(price.outputPerMillionCny) || typeof price.version !== 'string') throw Error();
    for (const price of Object.values(value.speechPrices)) if (!validPrice(price.perMinuteCny) || !Number.isInteger(price.billingIncrementSeconds) || price.billingIncrementSeconds < 1 || price.billingIncrementSeconds > 60) throw Error();
    for (const [key, entry] of Object.entries(value.months)) if (!/^\d{4}-\d{2}$/.test(key) || !entry || !['text', 'speech', 'uncertain', 'unpriced'].every(k => Number.isSafeInteger(entry[k]) && entry[k] >= 0)) throw Error();
    for (const item of Object.values(value.reservations)) if (!item || !['text', 'speech'].includes(item.kind) || !/^\d{4}-\d{2}$/.test(item.month) || !Number.isSafeInteger(item.maxMicro) || item.maxMicro < 0) throw Error();
    return value;
  }
  function row(key = month()) { return data.months[key] ||= { text: 0, speech: 0, uncertain: 0, unpriced: 0 }; }
  function checkRestore() { if (restoreMarker && fs.existsSync(restoreMarker)) { blockedReason = '完整备份正在恢复，预算记录暂停写入；请待恢复完成并重新启动学习服务。'; throw failure(); } }
  function persist() {
    checkRestore();
    const tmp = filePath + '.' + owner + '.tmp';
    try {
      const fd = fs.openSync(tmp, 'w', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, filePath);
    } catch { try { fs.unlinkSync(tmp); } catch {} blockedReason = '账本写入失败，原文件未被主动重置。'; throw failure(); }
  }
  function ensure() {
    if (closed) throw failure();
    checkRestore();
    if (blockedReason) throw failure();
    if (data) return;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      try { lockFd = fs.openSync(lockPath, 'wx', 0o600); }
      catch (error) { if (error.code === 'EEXIST') blockedReason = lockReason(); throw error; }
      fs.writeFileSync(lockFd, JSON.stringify({ owner, pid: process.pid, hostname: os.hostname(), createdAt: now().toISOString() }));
      data = fs.existsSync(filePath) ? validate(JSON.parse(fs.readFileSync(filePath, 'utf8'))) : initial();
      enabled = data.enabled;
      // A request reserved before the last shutdown may have reached the provider.
      for (const ticket of Object.values(data.reservations)) {
        const entry = row(ticket.month); entry[ticket.kind] += ticket.maxMicro; entry.uncertain++; if (!ticket.price) entry.unpriced++;
      }
      data.reservations = {}; persist();
    } catch {
      // A second process must respect an existing opt-in setting without writing
      // the ledger. Explicitly disabling the optional limit remains available.
      if (!disabledOverride && !data) {
        try { if (JSON.parse(fs.readFileSync(filePath, 'utf8')).enabled === true) enabled = true; } catch {}
      }
      blockedReason ||= '账本损坏、不可读取，或已由其他进程锁定。';
      throw failure();
    }
  }
  function attempt(fn, strict = enabled) { try { ensure(); return fn(); } catch (error) { if (strict || enabled) throw error instanceof BudgetError ? error : failure(); return null; } }
  function status(connection) {
    try { ensure(); } catch {}
    const current = data || initial(), key = month(), entry = current.months[key] || { text: 0, speech: 0, uncertain: 0, unpriced: 0 };
    const reserved = { text: 0, speech: 0 };
    for (const item of Object.values(current.reservations)) if (item.month === key) reserved[item.kind] += item.maxMicro;
    const spent = entry.text + entry.speech, held = reserved.text + reserved.speech, cap = current.monthlyLimitCny;
    const price = connection?.model ? current.textPrices[connection.baseUrl + '|' + connection.model] || null : null;
    return { enabled, month: key, timezone: 'Asia/Hong_Kong', currency: 'CNY', monthlyLimitCny: cap, warningAtCny: cap * .7, stopAtCny: cap * .8,
      spentCny: cny(spent), reservedCny: cny(held), remainingCny: Math.max(0, cap * .8 - cny(spent + held)),
      state: blockedReason ? 'blocked' : !enabled ? 'ok' : cny(spent + held) >= cap * .8 ? 'stopped' : cny(spent + held) >= cap * .7 ? 'warning' : 'ok',
      blockedReason, categories: { text: { softLimitCny: cap * .45, spentCny: cny(entry.text), reservedCny: cny(reserved.text) }, speech: { softLimitCny: cap * .35, spentCny: cny(entry.speech), reservedCny: cny(reserved.speech) } },
      textPrice: price, speechPrices: Object.values(current.speechPrices), pricingKnown: Boolean(price), uncertainCharges: entry.uncertain, unpricedRequests: entry.unpriced };
  }
  function configure(body) {
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') throw new BudgetError(400, 'INVALID_BUDGET', '预算开关格式无效。');
    try { ensure(); } catch {
      if (body.enabled === false) { enabled = false; disabledOverride = true; return; }
      throw failure();
    }
    const next = structuredClone(data);
    if (body.enabled !== undefined) next.enabled = body.enabled;
    if (body.monthlyLimitCny !== undefined) {
      if (typeof body.monthlyLimitCny !== 'number' || !Number.isFinite(body.monthlyLimitCny) || body.monthlyLimitCny < 0 || body.monthlyLimitCny > 100000) throw new BudgetError(400, 'INVALID_BUDGET', '可选月预算须在 0–100000 元之间。');
      next.monthlyLimitCny = body.monthlyLimitCny;
    }
    if (body.textPrice !== undefined) {
      const p = body.textPrice;
      if (!p || p.confirmed !== true || !validPrice(p.inputPerMillionCny) || !validPrice(p.outputPerMillionCny) || typeof p.model !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(p.model)) throw new BudgetError(400, 'INVALID_PRICE', '请确认模型及有效的输入、输出单价。');
      const baseUrl = endpoint(p.baseUrl);
      next.textPrices[baseUrl + '|' + p.model] = { baseUrl, model: p.model, inputPerMillionCny: p.inputPerMillionCny, outputPerMillionCny: p.outputPerMillionCny, source: sourceText(p.source), confirmedAt: now().toISOString(), version: crypto.randomUUID() };
    }
    if (body.speechPrice !== undefined) {
      const p = body.speechPrice;
      if (!p || p.confirmed !== true || !validPrice(p.perMinuteCny) || !Number.isInteger(p.billingIncrementSeconds) || p.billingIncrementSeconds < 1 || p.billingIncrementSeconds > 60) throw new BudgetError(400, 'INVALID_PRICE', '请确认语音分钟单价与 1–60 秒计费粒度。');
      const url = endpoint(p.endpoint, true);
      next.speechPrices[url] = { endpoint: url, perMinuteCny: p.perMinuteCny, billingIncrementSeconds: p.billingIncrementSeconds, source: sourceText(p.source), confirmedAt: now().toISOString(), version: crypto.randomUUID() };
    }
    data = next; enabled = data.enabled; disabledOverride = !enabled; persist();
  }
  function reserve(kind, price, maximum) {
    if (enabled && !price) throw new BudgetError(409, 'PRICE_UNKNOWN', '可选预算限制已启用，但当前模型或语音服务没有确认报价。请确认报价或关闭预算限制。');
    const amount = price ? Math.ceil(maximum) : 0;
    if (!Number.isSafeInteger(amount) || amount < 0) throw new BudgetError(400, 'INVALID_PRICE', '无法计算本次费用。');
    const entry = row(), held = Object.values(data.reservations).filter(r => r.month === month()).reduce((n, r) => n + r.maxMicro, 0);
    if (enabled && entry.text + entry.speech + held + amount > Math.floor(data.monthlyLimitCny * .8 * MICRO)) throw new BudgetError(429, 'BUDGET_EXHAUSTED', '已达到启用的可选预算上限；可关闭预算限制后继续使用 AI。');
    const ticket = { id: crypto.randomUUID(), kind, month: month(), maxMicro: amount, price: price ? structuredClone(price) : null, createdAt: now().toISOString() };
    data.reservations[ticket.id] = ticket; persist(); return ticket;
  }
  function reserveText(config, messages, maxTokens) {
    return attempt(() => {
      const p = data.textPrices[config.baseUrl + '|' + config.model];
      const inputUpper = Buffer.byteLength(JSON.stringify(messages), 'utf8') + 1024 + messages.length * 64;
      return reserve('text', p, p ? inputUpper * p.inputPerMillionCny + maxTokens * p.outputPerMillionCny : 0);
    });
  }
  function reserveSpeech(config, seconds) {
    return attempt(() => { const p = data.speechPrices[config.endpoint]; return reserve('speech', p, p ? Math.ceil(seconds / p.billingIncrementSeconds) * p.billingIncrementSeconds / 60 * p.perMinuteCny * MICRO : 0); });
  }
  function settle(ticket, usage) {
    if (!ticket) return;
    return attempt(() => {
      const item = data.reservations[ticket.id]; if (!item) return;
      let amount = item.maxMicro, certain = false;
      if (item.kind === 'text' && item.price && usage && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0) {
        const measured = Math.ceil(usage.prompt_tokens * item.price.inputPerMillionCny + usage.completion_tokens * item.price.outputPerMillionCny);
        if (Number.isSafeInteger(measured) && measured >= 0) { amount = measured; certain = true; }
      }
      const entry = row(item.month); entry[item.kind] += amount;
      if (!certain) entry.uncertain++;
      if (!item.price) entry.unpriced++;
      delete data.reservations[ticket.id]; persist();
    });
  }
  function close() {
    closed = true;
    if (lockFd !== undefined) { try { fs.closeSync(lockFd); } catch {} lockFd = undefined; try { if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).owner === owner) fs.unlinkSync(lockPath); } catch {} }
  }
  return { status, configure, reserveText, reserveSpeech, settle, close };
}
module.exports = { createBudget, BudgetError };
