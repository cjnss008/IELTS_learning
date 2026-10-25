'use strict';
const crypto = require('node:crypto'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
let localOwner;

function currentCredentialOwner() {
  if (localOwner) return { ...localOwner };
  let userId;
  if (process.platform === 'win32') {
    // The account SID, unlike USERNAME, distinguishes a local account from a
    // domain account with the same display name. It is never sent to clients.
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe');
    const output = execFileSync(executable, ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, encoding: 'utf8', timeout: 5000, maxBuffer: 16384, stdio: ['ignore', 'pipe', 'ignore'] });
    const matches = output.match(/S-1-\d+(?:-\d+)+/gi);
    if (matches?.length !== 1) throw Error('无法核实当前 Windows 账户。');
    userId = matches[0];
  } else userId = String(os.userInfo().uid);
  localOwner = { deviceId: os.hostname(), userId }; return { ...localOwner };
}
function credentialPaths({ filePath, preferenceFilePath, ownerIdentity = currentCredentialOwner() } = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw Error('本机配置路径无效。');
  const identity = typeof ownerIdentity === 'function' ? ownerIdentity() : ownerIdentity;
  if (!identity || ['deviceId', 'userId'].some(key => typeof identity[key] !== 'string' || !identity[key].trim() || identity[key].length > 512 || /[\x00-\x1f\x7f]/.test(identity[key]))) throw Error('无法核实本机配置所属设备和账户。');
  const ownerKey = crypto.createHash('sha256').update(JSON.stringify({ version: 1, deviceId: identity.deviceId.trim().toLowerCase(), userId: identity.userId.trim().toLowerCase() })).digest('hex');
  const ownerDirectory = path.join(path.dirname(filePath), 'credential-owners', ownerKey);
  return { filePath: path.join(ownerDirectory, path.basename(filePath)), preferenceFilePath: path.join(ownerDirectory, path.basename(preferenceFilePath || 'credential-policy.json')), legacyFilePath: filePath, legacyPreferenceFilePath: preferenceFilePath || null };
}
module.exports = { currentCredentialOwner, credentialPaths };
