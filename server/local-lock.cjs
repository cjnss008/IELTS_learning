'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const stamp=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs,stat.birthtimeMs].join(':');
function snapshot(file){
 let descriptor;
 try{
  const before=fs.lstatSync(file);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size<1||before.size>4096)return null;
  descriptor=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));const opened=fs.fstatSync(descriptor);if(stamp(opened)!==stamp(before))return null;
  const bytes=fs.readFileSync(descriptor),after=fs.fstatSync(descriptor),current=fs.lstatSync(file);if(bytes.length!==before.size||stamp(after)!==stamp(before)||stamp(current)!==stamp(before))return null;
  const holder=JSON.parse(bytes.toString('utf8'));if(!holder||Array.isArray(holder)||typeof holder.hostname!=='string'||!holder.hostname||holder.hostname.length>255||!Number.isSafeInteger(holder.pid)||holder.pid<1||typeof holder.owner!=='string'||holder.owner.length<8||holder.owner.length>200||/[\x00-\x1f\x7f]/.test(holder.hostname+holder.owner))return null;
  return{holder,stamp:stamp(before),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 }catch{return null;}finally{if(descriptor!==undefined)try{fs.closeSync(descriptor);}catch{}}
}
function removeDeadLocalLock(file,{checked=value=>value}={}){
 if(typeof file!=='string'||!path.isAbsolute(file))return false;
 file=checked(file);const guard=checked(file+'.reclaim.lock'),owner=crypto.randomUUID();let descriptor;
 // Reclaimers serialize separately from the real writer lease. A normal writer
 // can still win the subsequent exclusive open; its new owner is never removed.
 try{descriptor=fs.openSync(guard,'wx',0o600);}catch{return false;}
 try{
  fs.writeFileSync(descriptor,JSON.stringify({hostname:os.hostname(),pid:process.pid,owner}));fs.fsyncSync(descriptor);
  const first=snapshot(checked(file));if(!first||first.holder.hostname!==os.hostname())return false;
  try{process.kill(first.holder.pid,0);return false;}catch(error){if(error.code!=='ESRCH')return false;}
  const current=snapshot(checked(file));if(!current||current.stamp!==first.stamp||current.sha256!==first.sha256||current.holder.owner!==first.holder.owner)return false;
  fs.unlinkSync(checked(file));return true;
 }catch{return false;}finally{
  try{fs.closeSync(descriptor);}catch{}
  const held=snapshot(checked(guard));if(held?.holder.owner===owner)try{fs.unlinkSync(checked(guard));}catch{}
 }
}
module.exports={removeDeadLocalLock};
