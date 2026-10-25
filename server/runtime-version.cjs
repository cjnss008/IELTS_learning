'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RUNTIME_SCHEMA = 1;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STARTED_AT = new Date().toISOString();
const INSTANCE_ID = crypto.randomUUID();

function canonicalRoot(rootDir) {
  const resolved = fs.realpathSync(path.resolve(rootDir));
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// Only application code and VERSION enter this digest. Never inspect user data,
// local credentials, environment variables or Git configuration.
function readProjectRuntime(rootDir = PROJECT_ROOT, options = {}) {
  const root = canonicalRoot(rootDir), strict = options.strict !== false;
  const files = ['VERSION', 'calibration/official-sample-index.json', 'tools/start-learning.cjs', 'tools/restart-learning-service.ps1'];
  for (const [directory, extension] of [['server', '.cjs'], ['assets', '.js']]) {
    try { files.push(...fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith(extension)).sort().map(name => directory + '/' + name)); }
    catch (error) { if (strict || error.code !== 'ENOENT') throw error; }
  }
  const digest = crypto.createHash('sha256');
  let version = 'unknown';
  for (const relative of files.sort()) {
    digest.update(relative + '\0');
    let bytes;
    try { bytes = fs.readFileSync(path.join(root, relative)); }
    catch (error) { if (strict || error.code !== 'ENOENT') throw error; bytes = Buffer.from('[missing]'); }
    if (relative === 'VERSION' && !bytes.equals(Buffer.from('[missing]'))) version = bytes.toString('utf8').trim();
    digest.update(String(bytes.length) + '\0'); digest.update(bytes); digest.update('\0');
  }
  if (strict && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('学习包 VERSION 文件无效，请完成升级后重新启动。');
  return Object.freeze({ runtimeSchema: RUNTIME_SCHEMA, version, buildSignature: 'sha256:' + digest.digest('hex'), projectId: 'sha256:' + crypto.createHash('sha256').update(root).digest('hex') });
}

function captureRuntime(rootDir = PROJECT_ROOT, options = {}) {
  return Object.freeze({ ...readProjectRuntime(rootDir, options), instanceId: INSTANCE_ID, startedAt: STARTED_AT, pid: process.pid });
}

module.exports = { RUNTIME_SCHEMA, PROJECT_ROOT, canonicalRoot, readProjectRuntime, captureRuntime };
