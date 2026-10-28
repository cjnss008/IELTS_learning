'use strict';
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { readProjectRuntime, PROJECT_ROOT } = require('../server/runtime-version.cjs');
// A launcher only probes/starts a service. Loading the whole server here also
// parsed the course and hashed every asset before doing the same hash again.
const DEFAULT_PORT = 8765;
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

function classifyHealth(value, expected) {
  if (value?.ok !== true || value.service !== SERVICE || value.home !== '/' || typeof value.version !== 'string' || !value.version || value.version.length > 80) return { state: 'occupied', reason: 'DIFFERENT_SERVICE' };
  if (value.projectId && value.projectId !== expected.projectId) return { state: 'occupied', reason: 'OTHER_PROJECT' };
  const runtime = Object.fromEntries(['version', 'runtimeSchema', 'buildSignature', 'projectId', 'instanceId', 'startedAt', 'pid'].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  const complete = value.runtimeSchema === 1 && /^sha256:[a-f0-9]{64}$/.test(value.buildSignature || '') && value.projectId === expected.projectId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.instanceId || '') && typeof value.startedAt === 'string' && !Number.isNaN(Date.parse(value.startedAt)) && Number.isSafeInteger(value.pid) && value.pid > 0;
  if (!complete) return { state: 'stale', reason: 'MISSING_RUNTIME', ...runtime };
  if (value.version !== expected.version || value.buildSignature !== expected.buildSignature) return { state: 'stale', ...runtime };
  if (value.ready === false) {
    const source=value.startup||{},phase=['restoring','retry-wait','failed'].includes(source.phase)?source.phase:'restoring';
    const codes=new Set(['EPERM','EACCES','EBUSY','EAGAIN','ETIMEDOUT','ECONNRESET','ECONNABORTED','ENETDOWN','ENETUNREACH','EHOSTUNREACH','ESTALE','USER_DATA_BUSY','USER_DATA_MIGRATION_BUSY','STARTUP_RESTORE_FAILED']);
    return {state:'starting',...runtime,startup:{phase,retryable:typeof source.retryable==='boolean'?source.retryable:true,code:codes.has(source.code)?source.code:null}};
  }
  // Health responses predating the readiness field remain compatible.
  if (Object.hasOwn(value,'ready') && value.ready !== true) return {state:'occupied',reason:'INVALID_READINESS'};
  return { state: 'ready', ...runtime };
}

// A TCP connection by itself does not establish that this is our learning app.
// A redirect, invalid JSON, old/unrelated endpoint, or hung peer is occupied.
function probeService(port, options = {}) {
  const requestImpl = options.request || http.request, timeoutMs = options.timeoutMs || 1500;
  const expected = options.expectedRuntime || readProjectRuntime();
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
          if (response.statusCode === 200) finish(classifyHealth(value, expected));
          else finish({ state: 'occupied', reason: 'DIFFERENT_SERVICE' });
        });
      });
      request.once('error', error => finish({ state: error.code === 'ECONNREFUSED' ? 'absent' : 'occupied', reason: error.code || 'HEALTH_FAILED' }));
      request.setTimeout(timeoutMs, () => { finish({ state: 'occupied', reason: 'HEALTH_TIMEOUT' }); request.destroy(); });
      request.end();
    } catch (_) { finish({ state: 'occupied', reason: 'HEALTH_FAILED' }); request?.destroy(); }
  });
}

function restartError(port, reason = 'RESTART_UNVERIFIED') {
  const busy = reason === 'RESTART_BUSY';
  return new LauncherError(busy ? 'RESTART_BUSY' : 'RESTART_UNVERIFIED', busy ? '另一启动窗口正在更新端口' + port + '的服务，请稍候再双击“启动学习.cmd”。' : '检测到旧版后台服务，但无法安全确认端口' + port + '只属于这份学习包（' + reason + '）。为保护其他程序，未强制结束任何未经确认的服务。请关闭另一份学习包的启动窗口后重试；若没有启动窗口，请重新启动这台电脑，再双击“启动学习.cmd”。浏览器中的未保存输入继续保留。');
}

function restartService(port, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32') return Promise.reject(restartError(port, 'WINDOWS_RESTART_REQUIRED'));
  const expected = options.expectedRuntime || readProjectRuntime(), spawnImpl = options.spawn || spawn;
  const helper = path.join(PROJECT_ROOT, 'tools', 'restart-learning-service.ps1');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const launcherPath = fs.realpathSync(options.launcherPath || __filename);
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Port', String(parsePort(port)), '-LauncherPath', launcherPath, '-Version', expected.version, '-BuildSignature', expected.buildSignature, '-ProjectId', expected.projectId];
  return new Promise((resolve, reject) => {
    let child, output = '', settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    let timer;
    try { child = spawnImpl(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (_) { finish(restartError(port)); return; }
    timer = setTimeout(() => { child.kill(); finish(restartError(port, 'RESTART_TIMEOUT')); }, options.timeoutMs || 45000);
    child.stdout.on('data', bytes => { output += bytes.toString('utf8'); if (output.length > 16384) { child.kill(); finish(restartError(port)); } });
    child.stderr.on('data', () => {});
    child.once('error', () => finish(restartError(port)));
    child.once('close', code => {
      let result; try { result = JSON.parse(output.trim()); } catch (_) {}
      if (code === 0 && ['current', 'stopped', 'absent'].includes(result?.state)) finish(null, result);
      else finish(restartError(port, /^[A-Z_]+$/.test(result?.code || '') ? result.code : 'RESTART_UNVERIFIED'));
    });
  });
}

function checkedLogPath(dataDir, file) {
  const target=path.resolve(file),relative=path.relative(dataDir,target);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new LauncherError('LOG_PATH','启动日志必须保存在用户数据目录内。');
  let current=dataDir;for(const part of [null,...relative.split(path.sep)]){if(part!==null)current=path.join(current,part);let stat;try{stat=fs.lstatSync(current);}catch(error){if(error.code==='ENOENT')break;throw error;}if(stat.isSymbolicLink()||current===target&&stat.nlink>1)throw new LauncherError('LOG_PATH','启动日志路径不能经过符号链接、目录联接或共享硬链接。');if(current!==target&&!stat.isDirectory())throw new LauncherError('LOG_PATH','启动日志父路径不是文件夹。');if(current===target&&!stat.isFile())throw new LauncherError('LOG_PATH','启动日志路径不是普通文件。');}
  return target;
}

function startDetached(port, options = {}) {
  const spawnImpl = options.spawn || spawn;
  let logFd, logPath;
  if (!options.spawn || options.logPath) {
    const dataDir = path.resolve(options.env?.IELTS_DATA_DIR || process.env.IELTS_DATA_DIR || path.join(__dirname, '..', '用户数据'));
    logPath = checkedLogPath(dataDir, options.logPath || path.join(dataDir, 'logs', 'startup-' + parsePort(port) + '.log'));
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    checkedLogPath(dataDir,logPath);
    logFd = fs.openSync(logPath, fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|(fs.constants.O_NOFOLLOW||0),0o600);
  }
  let child;
  try {
  child = spawnImpl(options.execPath || process.execPath, [path.resolve(__filename), '--serve', '--port', String(parsePort(port))], {
    cwd: path.resolve(__dirname, '..'), detached: true, windowsHide: true, stdio: logFd === undefined ? 'ignore' : ['ignore', logFd, logFd], env: options.env || process.env,
  });
  } finally { if (logFd !== undefined) fs.closeSync(logFd); }
  const status = { exited: false, exitCode: null, error: null };
  status.failure = () => { if (!logPath) return ''; try { return fs.readFileSync(logPath, 'utf8').slice(-4000).trim(); } catch { return ''; } };
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
  const expectedRuntime = options.expectedRuntime || readProjectRuntime();
  const probe = options.probe || (port => probeService(port, { timeoutMs: options.probeTimeoutMs, expectedRuntime }));
  const start = options.start || startDetached, open = options.open || openBrowser;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const pollMs = options.pollMs || 250, maxPolls = options.maxPolls || 60;
  let status = await probe(port), reused = ['ready','starting'].includes(status.state), upgraded = false;
  if (status.state === 'stale') {
    options.report?.('检测到旧版后台服务，正在核实本机进程并安全更新，请稍候。浏览器原稿继续保留。');
    const restarted = await (options.restart || restartService)(port, { expectedRuntime });
    upgraded = restarted?.state === 'stopped';
    status = await probe(port); reused = ['ready','starting'].includes(status.state);
    // Each double click makes at most one restart attempt. If files changed
    // during startup, never enter a loop that could kill the new service.
    if (status.state === 'stale') throw new LauncherError('RUNTIME_STALE', '后台仍在运行不同版本，请等待学习包文件升级完成后重新双击“启动学习.cmd”。浏览器原稿继续保留。');
  }
  if (status.state === 'occupied') throw occupiedError(port);
  if (status.state !== 'ready') {
    if (!['absent','starting'].includes(status.state)) throw new LauncherError('HEALTH_FAILED', '未能确认本机学习服务状态，请稍后重试。');
    // A verified instance that is still restoring owns the port already. Wait
    // for it; never spawn a second service or terminate it as a foreign port.
    const processStatus = status.state === 'absent' ? (start(port) || {}) : null;
    const failedStartup=()=>status.state==='starting'&&status.startup?.phase==='failed'&&status.startup.retryable===false;
    const startupError=()=>new LauncherError('STARTUP_RESTORE_FAILED','本地学习服务无法完成启动核验；已有记录保留。请检查本机环境和用户数据目录后重试，首页尚未打开。');
    if(failedStartup())throw startupError();
    for (let i = 0; i < maxPolls; i++) {
      await sleep(pollMs); status = await probe(port);
      if (status.state === 'ready') break;
      if (status.state === 'occupied') throw occupiedError(port);
      if (status.state === 'stale') throw new LauncherError('RUNTIME_CHANGED', '服务启动期间学习包发生更新，请完成文件更新后重新双击“启动学习.cmd”。浏览器原稿继续保留。');
      if (failedStartup()) throw startupError();
      // Check health first: a simultaneous double click may have started the
      // single owning service while this helper lost the listen race.
      if (processStatus?.exited && status.state !== 'starting') throw new LauncherError('START_FAILED', '本地学习服务启动进程已退出。请检查学习包和用户数据目录。' + (processStatus.failure?.() ? '\n' + processStatus.failure() : ''));
    }
    if (status.state !== 'ready') throw new LauncherError('START_TIMEOUT', '本地学习服务未能按时就绪。请检查学习包和用户数据目录后重试；首页尚未打开。' + (status.state!=='starting'&&processStatus?.failure?.() ? '\n' + processStatus.failure() : ''));
  }
  await open(url);
  return { ok: true, reused, upgraded, url, version: status.version };
}

function serve(options = {}) {
  const service = options.createServer && options.closeOnSignals ? options : require('../server/server.cjs');
  const port = parsePort(options.port ?? process.env.IELTS_PORT), server = (options.createServer || service.createServer)({restartOnRestore:true});
  return new Promise((resolve, reject) => {
    const onError = error => { server.close(); reject(error?.code === 'EADDRINUSE' ? occupiedError(port) : new LauncherError('START_FAILED', '本地学习服务启动失败，请检查学习包目录和本机端口。')); };
    server.once('error', onError);
    (options.closeOnSignals || service.closeOnSignals)(server, options.runtime || process);
    server.listen(port, HOST, () => { server.removeListener('error', onError); resolve(server); });
  });
}

async function main(argv = process.argv.slice(2), options = {}) {
  if (path.basename(PROJECT_ROOT).toLowerCase() === 'ielts_learning开发') throw new LauncherError('DEVELOPMENT_WORKTREE', '开发工作树请使用 node tools/start-development.cjs --data-dir "本地专用绝对路径" --init；普通启动器不会启动正式端口或读取用户数据。');
  const nodeMajor = Number(String(options.nodeVersion || process.versions.node).split('.')[0]);
  if (nodeMajor < 22) throw new LauncherError('NODE_VERSION', '请先安装Node.js 22或更新的LTS版本，然后重新打开“启动学习.cmd”。');
  let daemon = false, port = options.port ?? process.env.IELTS_PORT;
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--serve') daemon = true; else if (argv[i] === '--port' && i + 1 < argv.length) port = argv[++i]; else throw new LauncherError('INVALID_ARGUMENT', '启动参数无效。请直接双击“启动学习.cmd”。'); }
  if (daemon) return serve({ ...options, port });
  return launch({ ...options, port, report: options.report || console.log });
}

if (require.main === module) main().then(result => { if (result?.url) console.log((result.upgraded ? '本机后台服务已安全更新，首页已打开：' : result.reused ? '已复用正在运行的本项目服务，首页已打开：' : '本地服务已在后台启动，首页已打开：') + result.url); }).catch(error => { console.error('[' + (error.code || 'START_FAILED') + '] ' + String(error.message || '启动失败，请检查学习包和用户数据目录。').replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED]')); process.exitCode = 1; });
module.exports = { SERVICE, HOST, LauncherError, parsePort, serviceURL, classifyHealth, probeService, restartService, startDetached, openBrowser, launch, serve, main };
