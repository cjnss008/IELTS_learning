'use strict';
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DEFAULT_PORT, createServer, closeOnSignals } = require('../server/server.cjs');
const HOST = '127.0.0.1', SERVICE = 'ielts-learning-local';

class LauncherError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function parsePort(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 65535) throw new LauncherError('INVALID_PORT', 'IELTS_PORT需要为1–65535的整数。');
  return Number(value);
}
function serviceURL(port) { return 'http://' + HOST + ':' + parsePort(port) + '/'; }
function occupiedError(port) { return new LauncherError('PORT_IN_USE', '端口' + port + '已被其他服务或未响应的程序占用，不能启动本学习包。请关闭占用该端口的程序，或设置其他IELTS_PORT后重试。不会重复启动服务。'); }

// A TCP connection by itself does not establish that this is our learning app.
// A redirect, invalid JSON, old/unrelated endpoint, or hung peer is occupied.
function probeService(port, options = {}) {
  const requestImpl = options.request || http.request, timeoutMs = options.timeoutMs || 1500;
  return new Promise(resolve => {
    let settled = false, request;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    try {
      request = requestImpl(new URL('api/health', serviceURL(port)), { method: 'GET', agent: false, headers: { Accept: 'application/json', Connection: 'close' } }, response => {
        const chunks = []; let size = 0;
        response.on('data', chunk => { size += chunk.length; if (size > 16384) { finish({ state: 'occupied', reason: 'HEALTH_TOO_LARGE' }); request.destroy(); } else chunks.push(chunk); });
        response.once('aborted', () => finish({ state: 'occupied', reason: 'HEALTH_INTERRUPTED' }));
        response.once('error', () => finish({ state: 'occupied', reason: 'HEALTH_INTERRUPTED' }));
        response.once('end', () => {
          if (settled) return;
          let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {}
          if (response.statusCode === 200 && value?.ok === true && value.service === SERVICE && value.home === '/' && typeof value.version === 'string' && value.version.length > 0 && value.version.length <= 80) finish({ state: 'ready', version: value.version });
          else finish({ state: 'occupied', reason: 'DIFFERENT_SERVICE' });
        });
      });
      request.once('error', error => finish({ state: error.code === 'ECONNREFUSED' ? 'absent' : 'occupied', reason: error.code || 'HEALTH_FAILED' }));
      request.setTimeout(timeoutMs, () => { finish({ state: 'occupied', reason: 'HEALTH_TIMEOUT' }); request.destroy(); });
      request.end();
    } catch (_) { finish({ state: 'occupied', reason: 'HEALTH_FAILED' }); request?.destroy(); }
  });
}

function startDetached(port, options = {}) {
  const spawnImpl = options.spawn || spawn;
  const child = spawnImpl(options.execPath || process.execPath, [path.resolve(__filename), '--serve', '--port', String(parsePort(port))], {
    cwd: path.resolve(__dirname, '..'), detached: true, windowsHide: true, stdio: 'ignore', env: options.env || process.env,
  });
  const status = { exited: false, exitCode: null, error: null };
  child.once('error', () => { status.error = 'SPAWN_FAILED'; status.exited = true; });
  child.once('exit', code => { status.exited = true; status.exitCode = code; });
  child.unref();
  return status;
}

function openBrowser(url, options = {}) {
  const spawnImpl = options.spawn || spawn, platform = options.platform || process.platform;
  // Only the short-lived shell helper is hidden. START invokes the user's
  // normal visible default browser, without a hidden service console window.
  const command = platform === 'win32' ? 'cmd.exe' : platform === 'darwin' ? 'open' : 'xdg-open';
  if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url)) return Promise.reject(new LauncherError('INVALID_HOME', '首页地址无效。'));
  // This generated ASCII URL contains no spaces or shell metacharacters, so
  // separate arguments avoid nested CMD quoting and START's quoted-title rule.
  const args = platform === 'win32' ? ['/d', '/c', 'start', url] : [url];
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnImpl(command, args, { windowsHide: true, stdio: 'ignore' }); } catch (_) { reject(new LauncherError('BROWSER_FAILED', '服务已就绪，但未能打开默认浏览器。请手动打开' + url)); return; }
    child.once('error', () => reject(new LauncherError('BROWSER_FAILED', '服务已就绪，但未能打开默认浏览器。请手动打开' + url)));
    child.once('exit', code => code === 0 ? resolve() : reject(new LauncherError('BROWSER_FAILED', '服务已就绪，但默认浏览器启动失败。请手动打开' + url)));
  });
}

async function launch(options = {}) {
  const port = parsePort(options.port ?? process.env.IELTS_PORT), url = serviceURL(port);
  const probe = options.probe || (port => probeService(port, { timeoutMs: options.probeTimeoutMs }));
  const start = options.start || startDetached, open = options.open || openBrowser;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const pollMs = options.pollMs || 250, maxPolls = options.maxPolls || 60;
  let status = await probe(port), reused = status.state === 'ready';
  if (status.state === 'occupied') throw occupiedError(port);
  if (!reused) {
    if (status.state !== 'absent') throw new LauncherError('HEALTH_FAILED', '未能确认本机学习服务状态，请稍后重试。');
    const processStatus = start(port) || {};
    for (let i = 0; i < maxPolls; i++) {
      await sleep(pollMs); status = await probe(port);
      if (status.state === 'ready') break;
      if (status.state === 'occupied') throw occupiedError(port);
      // Check health first: a simultaneous double click may have started the
      // single owning service while this helper lost the listen race.
      if (processStatus.exited) throw new LauncherError('START_FAILED', '本地学习服务启动进程已退出。请确认Node.js 22或更新版本已安装，且学习包目录可以访问。');
    }
    if (status.state !== 'ready') throw new LauncherError('START_TIMEOUT', '本地学习服务未能按时就绪。请检查学习包目录和Node.js安装后重试；首页尚未打开。');
  }
  await open(url);
  return { ok: true, reused, url, version: status.version };
}

function serve(options = {}) {
  const port = parsePort(options.port ?? process.env.IELTS_PORT), server = (options.createServer || createServer)();
  return new Promise((resolve, reject) => {
    const onError = error => { server.close(); reject(error?.code === 'EADDRINUSE' ? occupiedError(port) : new LauncherError('START_FAILED', '本地学习服务启动失败，请检查学习包目录和本机端口。')); };
    server.once('error', onError);
    (options.closeOnSignals || closeOnSignals)(server, options.runtime || process);
    server.listen(port, HOST, () => { server.removeListener('error', onError); resolve(server); });
  });
}

async function main(argv = process.argv.slice(2), options = {}) {
  const nodeMajor = Number(String(options.nodeVersion || process.versions.node).split('.')[0]);
  if (nodeMajor < 22) throw new LauncherError('NODE_VERSION', '请先安装Node.js 22或更新的LTS版本，然后重新打开“启动学习.cmd”。');
  let daemon = false, port = options.port ?? process.env.IELTS_PORT;
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--serve') daemon = true; else if (argv[i] === '--port' && i + 1 < argv.length) port = argv[++i]; else throw new LauncherError('INVALID_ARGUMENT', '启动参数无效。请直接双击“启动学习.cmd”。'); }
  if (daemon) return serve({ ...options, port });
  return launch({ ...options, port });
}

if (require.main === module) main().then(result => { if (result?.url) console.log((result.reused ? '已复用正在运行的本项目服务，首页已打开：' : '本地服务已在后台启动，首页已打开：') + result.url); }).catch(error => { console.error(error instanceof LauncherError ? error.message : '启动失败，请检查Node.js安装和学习包目录。'); process.exitCode = 1; });
module.exports = { SERVICE, HOST, LauncherError, parsePort, serviceURL, probeService, startDetached, openBrowser, launch, serve, main };
