'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),base=path.resolve(__dirname,'..'),assets=path.join(base,'assets');
const load=name=>require(path.join(assets,name));
function helper(name,exposed){const file=path.join(base,'tests',name),raw=fs.readFileSync(file,'utf8'),m={exports:{}};new Function('require','__dirname','module',raw.slice(0,raw.indexOf('\ntest('))+'\nmodule.exports={'+exposed+'};')(createRequire(file),path.dirname(file),m);return m.exports;}
const M=load('memory-core.js'),V=load('essential-vocabulary-data.js'),S=load('memory-session.js'),R=load('learning-records.js'),Timer=load('study-timer-core.js');
const NOW=Date.parse('2026-10-27T12:00:00Z'),DAY=86400000;
function dueState(count=600){const words=V.entries.slice(0,count),attempts=words.map((word,index)=>({id:'isolated-seed-'+index,word:word.word,meaning:word.meaning,example:word.example,mode:'meaning',submittedAt:new Date(NOW-3*DAY).toISOString(),correct:true,userAnswer:word.word}));return M.captureTraining(M.newState(),{attempts});}
function spentRecord(minutes=120){const item={...V.entries[700],skill:'spelling'},draft={...S.makeDraft(item,{id:'memory-spent-review',courseDay:2,now:NOW-minutes*60000-1000}),answer:item.word,activeSeconds:minutes*60,activityByDate:{[new Date(NOW).toISOString().slice(0,10)]:minutes*60}},input=S.recordFor(draft,item,{correct:true},{now:NOW});return R.put(R.newState(),input,new Date(NOW).toISOString()).record;}
module.exports={base,assets,load,helper,M,V,S,R,Timer,NOW,DAY,dueState,spentRecord};
