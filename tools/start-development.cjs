'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { readProjectRuntime, PROJECT_ROOT } = require('../server/runtime-version.cjs');
const HOST = '127.0.0.1', PORT = 18765, MARKER = '.ielts-development-data.json';
const STABLE_PROJECT = '\\\\mynas\\family\\IELTS_52篇学习包';
function fail(code, message) { throw Object.assign(Error(message), { code }); }
function equalPath(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }
function contains(base, target) { const r = path.relative(base, target); return !r || r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); }
function noLinks(target) {
  const absolute = path.resolve(target), parsed = path.parse(absolute); let current = parsed.root;
  for (const part of ['', ...absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    let stat; try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('DEV_DATA_PATH', '开发数据路径不能包含目录联接、符号链接或普通文件。');
  }
}
function parse(argv) {
  const result = { init: false, check: false }; const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i]; if (seen.has(name)) fail('DEV_ARGUMENT', '开发启动参数不能重复。'); seen.add(name);
    if (name === '--init') result.init = true;
    else if (name === '--check') result.check = true;
    else if (name === '--data-dir' && argv[i + 1] && !argv[i + 1].startsWith('--')) result.dataDir = argv[++i];
    else fail('DEV_ARGUMENT', '用法：node tools/start-development.cjs --data-dir "本地专用绝对路径" [--init] [--check]');
  }
  if (!result.dataDir) fail('DEV_DATA_REQUIRED', '必须显式提供 --data-dir；不会使用 IELTS_DATA_DIR 或项目默认用户数据目录。');
  return result;
}
function prepare(config, options = {}) {
  const projectRoot = fs.realpathSync(path.resolve(options.projectRoot || PROJECT_ROOT));
  if (equalPath(projectRoot, STABLE_PROJECT) || path.basename(projectRoot).toLowerCase() === 'ielts_52篇学习包') fail('DEV_STABLE_PROJECT', '正式学习包不能作为开发服务启动，请使用独立 develop 工作树。');
  if (typeof config.dataDir !== 'string' || !path.isAbsolute(config.dataDir) || /^\\\\/.test(config.dataDir) || process.platform === 'win32' && !/^[A-Za-z]:[\\/]/.test(config.dataDir)) fail('DEV_DATA_PATH', '开发数据目录必须是本机磁盘的明确绝对路径，不能使用 NAS UNC 或相对路径。');
  const dataDir = path.resolve(config.dataDir);
  if (dataDir === path.parse(dataDir).root || contains(projectRoot, dataDir) || contains(dataDir, projectRoot) || contains(STABLE_PROJECT, dataDir) || contains(dataDir, STABLE_PROJECT) || dataDir.split(path.sep).includes('用户数据')) fail('DEV_DATA_PATH', '开发数据必须放在项目外的专用目录，不能使用正式用户数据或代码目录。');
  noLinks(dataDir);
  const runtime = (options.readRuntime || readProjectRuntime)(projectRoot), markerPath = path.join(dataDir, MARKER);
  let marker;
  if (fs.existsSync(markerPath)) {
    const stat = fs.lstatSync(markerPath); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) fail('DEV_DATA_MARKER', '开发目录身份标记无效，未读取任何学习内容或配置。');
    try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); } catch { fail('DEV_DATA_MARKER', '开发目录身份标记损坏，未修改原目录。'); }
    if (marker.schemaVersion !== 1 || marker.purpose !== 'isolated-ielts-development' || marker.projectId !== runtime.projectId || marker.port !== PORT || !equalPath(marker.projectRoot || '', projectRoot) || !equalPath(marker.dataDir || '', dataDir)) fail('DEV_DATA_OWNER', '该开发目录属于另一项目或端口，未读取或更改其内容。');
  } else {
    if (!config.init) fail('DEV_DATA_INIT_REQUIRED', '首次启动需同时指定 --init；现有资料不会自动导入。');
    if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length) fail('DEV_DATA_NOT_EMPTY', '首次初始化仅接受不存在或完全空的专用目录；原有目录内容未读取、复制或修改。');
    marker = { schemaVersion: 1, purpose: 'isolated-ielts-development', projectId: runtime.projectId, projectRoot, dataDir, port: PORT, createdAt: new Date().toISOString(), id: crypto.randomUUID() };
    if (!config.check) { fs.mkdirSync(dataDir, { recursive: true }); noLinks(dataDir); fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); }
  }
  return { projectRoot, dataDir, port: PORT, host: HOST, projectId: runtime.projectId, version: runtime.version, markerPath, check: Boolean(config.check) };
}
function serverOptions(plan) {
  return { rootDir: plan.projectRoot, dataDir: plan.dataDir, migrateLegacy: false, materialMigration: false, legacyDataPaths: { credentials: null, budget: null, 'writing-signing': null }, legacyCredentialFilePaths: [], credentialFilePath: path.join(plan.dataDir, 'config', 'development-credentials.dpapi'), credentialPreferenceFilePath: path.join(plan.dataDir, 'config', 'development-credential-policy.json'), defaultCredentialPersistence: false, restartOnRestore: true };
}
async function start(plan, options = {}) {
  if (plan.port !== PORT || plan.host !== HOST) fail('DEV_PORT', '开发服务只允许绑定 127.0.0.1:18765。');
  if (plan.check) return { plan, server: null };
  const checked = prepare({ dataDir: plan.dataDir, check: true }, { projectRoot: plan.projectRoot });
  if (checked.projectId !== plan.projectId) fail('DEV_DATA_OWNER', '开发项目身份已改变，尚未读取学习内容或配置。');
  // Never probe, reuse, stop or restart a service found on this port. Only this
  // process owns the server it creates; an occupied port is an ordinary failure.
  const service = options.service || require('../server/server.cjs'), server = service.createServer(serverOptions(checked));
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, () => { server.removeListener('error', reject); resolve(); }); }); }
  catch (error) { server.close(); server.closeAllConnections?.(); if (error.code === 'EADDRINUSE') fail('DEV_PORT_IN_USE', '开发端口 18765 已占用；未接管或结束任何服务。请关闭自己的开发终端后重试。'); throw error; }
  service.closeOnSignals(server, options.runtime || process);
  return { plan, server };
}
async function main(argv = process.argv.slice(2), options = {}) {
  if (Number(String(options.nodeVersion || process.versions.node).split('.')[0]) < 22) fail('DEV_NODE_VERSION', '开发工具需要 Node.js 22 或更新版本。');
  const config = parse(argv), plan = prepare(config, options);
  const result = await start(plan, options);
  (options.log || console.log)(JSON.stringify({ mode: plan.check ? 'development-check-only' : 'development-foreground', projectRoot: plan.projectRoot, projectId: plan.projectId, dataDir: plan.dataDir, url: 'http://' + HOST + ':' + PORT + '/', browserOpened: false, legacyMigration: false, credentialPersistenceDefault: false }));
  return result;
}
if (require.main === module) main().catch(error => { console.error('[' + (error.code || 'DEV_START_FAILED') + '] ' + error.message); process.exitCode = 1; });
module.exports = { HOST, PORT, MARKER, parse, prepare, serverOptions, start, main };
