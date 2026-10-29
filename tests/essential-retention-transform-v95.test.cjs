'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const T=require('../tools/apply-lexical-retention-v88.cjs'),appPath=process.env.ESSENTIAL_REPLAY_APP_SOURCE||path.join(__dirname,'../assets/essential-vocabulary-app.js'),source=fs.readFileSync(appPath,'utf8').replace(/\r\n/g,'\n');
function change(from,to=''){assert.equal(source.split(from).length-1,1,'Exact test seam: '+from);return source.replace(from,to);}
const open="async function openBatch(value) {\n      if(opening){notice('正在核对词组来源与预算，原输入保留。');return false;}\n      const saved = allBatches().find(item => item.id === (typeof value === 'string' ? value : value.id));\n      if (saved?.status === 'submitted' && !saved.draft) return openSavedBatch(saved.id);\n      check();if(retention?.isActive?.()){notice('先保存并收起新语境保持练习，原输入保留。');return false;}",
busy="isBusy:()=>!!opening || !!saving || historyReading || !!retention?.isBusy?.() || !!controller?.getMediaState?.()?.busy",
oldApi="return {render,openBatch,openSavedBatch,refreshSavedBatches,start,getPlan:currentPlan,getRetentionPlan:()=>retention?.getPlan?.()||{required:false,ready:[],waiting:[],completed:[],lapses:0},startRetention:(key,index)=>retention?.start?.(key,index),submitRetention:()=>retention?.submit?.(),getDrafts:()=>{const rows=E.activityDrafts(M.read());",
newApi=oldApi.replace('getPlan:currentPlan,','getPlan:currentPlan,getReviewPlan:currentReviewPlan,'),
reviewFunction="    function currentReviewPlan() {\n      if(typeof E.reviewPlan!=='function')return currentPlan();\n      check();const budget=options.getBudget?.()||{remainingMinutes:360,exhausted:false};\n      return E.reviewPlan(M.read(),{data,now:now(),remainingMinutes:budget.exhausted||budget.dayEnded?0:budget.remainingMinutes,timerState:root.IELTSStudyTimer?.snapshot?.(),courseDay:day,records,familyRecords:familySnapshots.get(day)});\n    }\n",
api=source.includes('getReviewPlan:')?newApi:oldApi;
function variants(){
 const notice='    function notice(text) { statusText = text; render(); }',old=api===newApi?source.replace(newApi,oldApi).replace(reviewFunction,''):source;
 assert.equal(old.split(oldApi).length-1,1);assert.equal(old.split(notice).length-1,1);
 return{old,current:old.replace(oldApi,newApi).replace(notice,reviewFunction+notice)};
}
test('both historical and review-plan saved-history consumers remain byte-exact across repeated transforms',()=>{
 const {old,current}=variants();for(const value of [old,current]){assert.equal(T.app(value),value);assert.equal(T.app(T.app(value)),value);}
});
test('review-plan declaration and API must be complete, exact, unique and never mixed',()=>{
 const {old,current}=variants();assert.throws(()=>T.app(current.replace(reviewFunction,'')),/Missing|Ambiguous/);assert.throws(()=>T.app(current.replace(newApi,oldApi)),/Missing|Ambiguous/);
 assert.throws(()=>T.app(current+'\n'+newApi),/Ambiguous/);assert.throws(()=>T.app(current+'\n'+oldApi),/Ambiguous/);assert.throws(()=>T.app(current+'\n'+reviewFunction),/Ambiguous/);
 assert.throws(()=>T.app(current.replace('if(typeof E.reviewPlan', 'if(typeof E.changedReviewPlan')),/Missing|Ambiguous/);assert.throws(()=>T.app(old+'\ngetReviewPlan:currentPlan'),/Missing|Ambiguous/);
 assert.throws(()=>T.app(current+'\nfunction currentReviewPlan (x){return x;}'),/Missing|Ambiguous/);assert.throws(()=>T.app(old+'\nfunction currentReviewPlan (x){return x;}'),/Missing|Ambiguous/);
 for(const variant of ['getReviewPlan : currentPlan, ',"'getReviewPlan': currentPlan, ",'["getReviewPlan"]: currentPlan, ','get getReviewPlan(){return currentPlan;}, '])for(const value of [old,current]){uniqueReviewBusy(value);assert.throws(()=>T.app(value.replace(busy,variant+busy)),/Missing|Ambiguous/);}
});
function uniqueReviewBusy(value){assert.equal(value.split(busy).length-1,1,'Exact busy test seam');}
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
