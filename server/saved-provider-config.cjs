'use strict';
// Only used while restoring an OS-encrypted local credential file. Never returned over HTTP.
function secret(value){if(typeof value!=='string'||value.length<8||value.length>4096||/[\s\x00-\x1f\x7f]/.test(value))throw Error('Invalid saved credential.');return value;}
function url(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port)throw Error('Invalid saved endpoint.');return u.href.replace(/\/$/,'');}
function model(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_.:/-]{1,200}$/.test(value))throw Error('Invalid saved model.');return value;}
function compatible(b){const next={baseUrl:url(b.baseUrl),apiKey:secret(b.apiKey),model:model(b.model)};if(next.baseUrl.includes(next.apiKey)||next.model.includes(next.apiKey))throw Error('Invalid saved public field.');return next;}
function azure(b){const endpoint=url(b.endpoint),u=new URL(endpoint);if(!/^[a-z0-9][a-z0-9-]*\.cognitiveservices\.azure\.com$/.test(u.hostname)||u.pathname!=='/'||typeof b.apiKey!=='string'||!/^[a-zA-Z0-9]{16,128}$/.test(b.apiKey)||endpoint.includes(b.apiKey))throw Error('Invalid saved Azure resource.');return {endpoint:u.origin,apiKey:b.apiKey};}
module.exports={secret,url,model,compatible,azure};
