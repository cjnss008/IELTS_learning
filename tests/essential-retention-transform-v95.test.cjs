'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('../tools/apply-lexical-retention-v88.cjs'),appPath=process.env.ESSENTIAL_REPLAY_APP_SOURCE||path.join(__dirname,'../assets/essential-vocabulary-app.js'),source=fs.readFileSync(appPath,'utf8').replace(/\r\n/g,'\n');
function change(from,to=''){assert.equal(source.split(from).length-1,1,'Exact test seam: '+from);return source.replace(from,to);}
const open="async function openBatch(value) {\n      const saved = allBatches().find(item => item.id === (typeof value === 'string' ? value : value.id));\n      if (saved?.status === 'submitted' && !saved.draft) return openSavedBatch(saved.id);\n      check();if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return false;}",
busy="isBusy:()=>!!saving || historyReading || !!retention?.isBusy?.() || !!controller?.getMediaState?.()?.busy",
api="return {render,openBatch,openSavedBatch,refreshSavedBatches,start,getPlan:currentPlan,getRetentionPlan:()=>retention?.getPlan?.()||{required:false,ready:[],waiting:[],completed:[],lapses:0},startRetention:(key,index)=>retention?.start?.(key,index),submitRetention:()=>retention?.submit?.(),getDrafts:()=>{const rows=E.activityDrafts(M.read());";
test('v95 saved-history consumer remains byte-exact under both legacy transform passes',()=>{assert.equal(T.app(source),source);assert.equal(T.app(T.app(source)),source);});
test('all three later applied variants are required exactly once, including mixed old/new ambiguity',()=>{
 for(const anchor of [open,busy,api]){assert.throws(()=>T.app(change(anchor)),/Missing|already complete/);assert.throws(()=>T.app(source+'\n'+anchor),/Ambiguous/);}
 assert.throws(()=>T.app(source+'\nisBusy:()=>!!saving || !!retention?.isBusy?.() || !!controller?.getMediaState?.()?.busy'),/Ambiguous/);
});
test('normalization still checks legacy retention owner, active guard, clock, mount and API',()=>{
 for(const anchor of [
  'let currentContext = null, contextSignature = null, retention = null;',
  "check();if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return false;}",
  'if(retention?.isActive?.()){retention.tick?.();return;}',
  'const retentionAPI=root.IELTSLexicalRetentionV88;',
  'getRetentionPlan:()=>retention?.getPlan?.()||{required:false,ready:[],waiting:[],completed:[],lapses:0},'
 ])assert.throws(()=>T.app(change(anchor)),/Missing|already complete/);
});
test('Bank mapping guard remains exact and cannot be removed or doubled for a saved-history consumer',()=>{
 const guard="    if(releaseMapping.status!=='ready')throw Error('已保存词汇的版本待核验，原答案和原音保留，请重试加载完整学习包。');\n";
 assert.throws(()=>T.app(change(guard)),/exact Bank mapping anchor/);assert.throws(()=>T.app(change(guard,guard+guard)),/exact Bank mapping anchor/);assert.throws(()=>T.app('unrelated source'),/Missing retention anchor/);
});
