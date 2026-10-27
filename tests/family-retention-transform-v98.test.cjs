'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const T=require('../tools/apply-lexical-retention-v88.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8').replace(/\r\n/g,'\n');
const fixture=name=>read('tests/fixtures/family-retention-v98/'+name);
const app=read('assets/essential-vocabulary-app.js'),records=read('assets/learning-records.js');
const appPairs=[
 ["const recordsChanged = () => { R?.list?.().then(async values => { if (!disposed) { records = values; retention?.setRecords?.(values);if(!saving&&root.IELTSFamilyLessonExpansionV95?.runtime)await refreshFamily(day);if(!retention?.isBusy?.()&&!disposed)render(); } }).catch(error => notice(error.message)); };","const recordsChanged = () => { R?.list?.().then(values => { if (!disposed) { records = values; retention?.setRecords?.(values);if(!retention?.isBusy?.())render(); } }).catch(error => notice(error.message)); };",'records = values; render();'],
 ["setRecords(values){records=values;retention?.setRecords?.(values);familySnapshots.clear();render();if(root.IELTSFamilyLessonExpansionV95?.runtime)refreshFamily(day).then(()=>{if(!disposed)render();}).catch(error=>{if(!disposed)notice(error.message);});}","setRecords(values){records=values;retention?.setRecords?.(values);render();}","setRecords(values){records=values;render();}"]
];
const recordPairs=[
 ['async record(input,context){const result=await adapter.transaction(state=>{options.validateRecordInput?.(input,state.records,context);const r=put(state,input,clock());','async record(input){const result=await adapter.transaction(state=>{options.validateRecordInput?.(input,state.records);const r=put(state,input,clock());','async record(input){const result=await adapter.transaction(state=>{const r=put(state,input,clock());'],
 ["store=createStore(adapter,{notify,validateRecordInput(input,records,context){if(input.source==='reviewed-context-retention-v88'&&placedCourseDay(input,{records})!==input.dayNumber)throw Error('保持练习的来源、档案或恢复代际在保存前发生变化，原输入保留。');validateFamilyLessonRecord(input,records);validateFamilyVocabulary(input,records,context);}});return store;","store=createStore(adapter,{notify,validateRecordInput(input,records){if(input.source==='reviewed-context-retention-v88'&&placedCourseDay(input,{records})!==input.dayNumber)throw Error('保持练习的来源、档案或恢复代际在保存前发生变化，原输入保留。');}});return store;","store=createStore(adapter,{notify});return store;"],
 ['result=await target.record(autoLink(input,{records}),context);','result=await target.record(autoLink(input,{records}));',null]
];
function unique(source,text){assert.equal(source.split(text).length-1,1,'fixture anchor must be unique: '+text);}
test('actual 98 family consumers and 97 saved-history consumers remain byte-exact on repeated passes',()=>{
 for(const [source,fn] of [[app,T.app],[records,T.records],[fixture('97-essential-vocabulary-app.js'),T.app],[fixture('97-learning-records.js'),T.records]]){assert.equal(fn(source),source);assert.equal(fn(fn(source)),source);}
});
test('original pre-retention v88 consumers still transform once and then remain stable',()=>{
 for(const [source,fn] of [[fixture('v88-unapplied-app.js'),T.app],[fixture('v88-unapplied-records.js'),T.records]]){const once=fn(source);assert.notEqual(once,source);assert.equal(fn(once),once);}
});
test('each 98 EA anchor rejects removal, duplication, old applied and old unapplied mixtures',()=>{
 for(const [later,prior,unapplied] of appPairs){unique(app,later);assert.throws(()=>T.app(app.replace(later,'')),/Missing|already complete/);assert.throws(()=>T.app(app.replace(later,later+'\n'+later)),/Ambiguous/);assert.throws(()=>T.app(app+'\n'+prior),/Ambiguous/);assert.throws(()=>T.app(app+'\n'+unapplied),/Ambiguous/);}
 const marker='const familySnapshots=new Map(),familyEpoch=new Map();';unique(app,marker);assert.throws(()=>T.app(app.replace(marker,'')),/family retention marker/);assert.throws(()=>T.app(app+'\n'+marker),/family retention marker/);
 for(const required of ['let currentContext = null, contextSignature = null, retention = null;','if(retention?.isActive?.()){retention.tick?.();return;}','const retentionAPI=root.IELTSLexicalRetentionV88;']){unique(app,required);assert.throws(()=>T.app(app.replace(required,'')),/Missing|already complete/);}
});
test('each 98 transaction anchor rejects removal, duplication, old applied and old unapplied mixtures',()=>{
 for(const [later,prior,unapplied] of recordPairs){unique(records,later);assert.throws(()=>T.records(records.replace(later,'')),/Missing|already complete/);assert.throws(()=>T.records(records.replace(later,later+'\n'+later)),/Ambiguous/);assert.throws(()=>T.records(records+'\n'+prior),/Ambiguous/);if(unapplied)assert.throws(()=>T.records(records+'\n'+unapplied),/Ambiguous/);}
 for(const marker of ['function validateFamilyVocabulary(input,records,context){','function validateFamilyLessonRecord(input,records){']){unique(records,marker);assert.throws(()=>T.records(records.replace(marker,'')),/family records marker/);assert.throws(()=>T.records(records+'\n'+marker),/family records marker/);}
 for(const text of ['validateFamilyLessonRecord(input,records);','validateFamilyVocabulary(input,records,context);']){unique(records,text);assert.throws(()=>T.records(records.replace(text,'')),/Missing/);}
});
test('batch transform validates every consumer before writing any bytes',()=>{
 const project=process.env.FAMILY_V98_TEST_ROOT||path.resolve(__dirname,'..');
 const files=['memory-core.js','contextual-vocabulary-course.js','essential-vocabulary-course.js','essential-vocabulary-core.js','year-planner.js','essential-vocabulary-app.js','learning-records.js'],dir=fs.mkdtempSync(path.join(os.tmpdir(),'family-retention-transform-'));fs.mkdirSync(path.join(dir,'assets'));
 for(const name of files)fs.copyFileSync(path.join(project,'assets',name),path.join(dir,'assets',name));
 const bytes=()=>files.map(name=>fs.readFileSync(path.join(dir,'assets',name),'utf8'));
 const initial=bytes();assert.deepEqual(T.applyConsumers(dir),[]);assert.deepEqual(bytes(),initial);
 const broken=initial[5].replace(appPairs[0][0],'');assert.notEqual(broken,initial[5]);fs.writeFileSync(path.join(dir,'assets',files[5]),broken);const corrupt=bytes();assert.throws(()=>T.applyConsumers(dir),/family retention anchor/);assert.deepEqual(bytes(),corrupt);
});
