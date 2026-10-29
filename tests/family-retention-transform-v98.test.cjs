'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const T=require('../tools/apply-lexical-retention-v88.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8').replace(/\r\n/g,'\n');
const fixture=name=>read('tests/fixtures/family-retention-v98/'+name);
const app=read('assets/essential-vocabulary-app.js'),records=read('assets/learning-records.js');
const appPairs=[
 ["const recordsChanged = () => { R?.list?.().then(async values => { if (!disposed) { records = values; retention?.setRecords?.(values);if(!saving&&root.IELTSFamilyLessonExpansionV95?.runtime)await refreshFamily(day);if(!retention?.isBusy?.()&&!disposed)render(); } }).catch(error => notice(error.message)); };","const recordsChanged = () => { R?.list?.().then(values => { if (!disposed) { records = values; retention?.setRecords?.(values);if(!retention?.isBusy?.())render(); } }).catch(error => notice(error.message)); };",'records = values; render();'],
 ["setRecords(values){const runtime=root.IELTSFamilyLessonExpansionV95?.runtime?.();if(records===values&&(!runtime||runtime.isCurrentFullRecords(familySnapshots.get(day))))return;records=values;retention?.setRecords?.(values);render();if(root.IELTSFamilyLessonExpansionV95?.runtime)refreshFamily(day).then(()=>{if(!disposed)render();}).catch(error=>{if(!disposed)notice(error.message);});}","setRecords(values){records=values;retention?.setRecords?.(values);render();}","setRecords(values){records=values;render();}"]
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

const batchNames=['memory-core.js','contextual-vocabulary-course.js','essential-vocabulary-course.js','essential-vocabulary-core.js','year-planner.js','essential-vocabulary-app.js','learning-records.js'];
function withEndings(source,kind){let n=0;return source.replace(/\r\n/g,'\n').replace(/\n/g,()=>kind==='crlf'?'\r\n':kind==='mixed'&&n++%2?'\r\n':'\n');}
function bytesFixture(t,kind){
 const tempRoot=fs.realpathSync(os.tmpdir()),dir=fs.realpathSync(fs.mkdtempSync(path.join(tempRoot,'family-retention-bytes-')));
 assert.equal(path.dirname(dir).toLowerCase(),tempRoot.toLowerCase());t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'assets'));
 const project=process.env.FAMILY_V98_TEST_ROOT||path.resolve(__dirname,'..');for(const name of batchNames){const raw=fs.readFileSync(path.join(project,'assets',name),'utf8');fs.writeFileSync(path.join(dir,'assets',name),withEndings(raw,kind));}
 return{dir,read:()=>batchNames.map(name=>fs.readFileSync(path.join(dir,'assets',name)))};
}
test('a no-op batch preserves every original byte and performs no writes for LF, CRLF, or mixed line endings',t=>{
 for(const kind of ['lf','crlf','mixed']){
  const f=bytesFixture(t,kind),before=f.read(),text=before[5].toString('utf8'),normalized=text.replace(/\r\n/g,'\n');assert.equal(T.app(normalized),normalized);
  if(kind==='mixed'){assert.ok(text.includes('\r\n'));assert.ok(/(^|[^\r])\n/.test(text));}
  let writes=0;const write=fs.writeFileSync;fs.writeFileSync=(...args)=>{writes++;return write(...args);};
  try{assert.deepEqual(T.applyConsumers(f.dir),[]);assert.deepEqual(T.applyConsumers(f.dir),[]);}finally{fs.writeFileSync=write;}
  assert.equal(writes,0,kind);assert.deepEqual(f.read(),before,kind);
 }
});
test('a real transform keeps the existing newline policy and only writes the changed consumer',t=>{
 for(const kind of ['lf','crlf','mixed']){
  const f=bytesFixture(t,kind),file=path.join(f.dir,'assets','essential-vocabulary-app.js'),original=fixture('v88-unapplied-app.js'),input=withEndings(original,kind),transformed=T.app(original);
  assert.notEqual(transformed,original);fs.writeFileSync(file,input);const before=f.read();let writes=0;const write=fs.writeFileSync;fs.writeFileSync=(...args)=>{writes++;return write(...args);};
  try{assert.deepEqual(T.applyConsumers(f.dir),['assets/essential-vocabulary-app.js']);assert.equal(writes,1);assert.deepEqual(T.applyConsumers(f.dir),[]);assert.equal(writes,1);}finally{fs.writeFileSync=write;}
  const after=f.read(),expected=kind==='lf'?transformed:transformed.replace(/\n/g,'\r\n');assert.deepEqual(after[5],Buffer.from(expected));
  after.forEach((value,i)=>{if(i!==5)assert.deepEqual(value,before[i],kind+' '+batchNames[i]);});
 }
});
test('a later invalid consumer prevents writes even when an earlier transform would change bytes',t=>{
 const f=bytesFixture(t,'mixed'),appFile=path.join(f.dir,'assets','essential-vocabulary-app.js'),recordsFile=path.join(f.dir,'assets','learning-records.js'),unapplied=fixture('v88-unapplied-app.js');
 assert.notEqual(T.app(unapplied),unapplied);fs.writeFileSync(appFile,withEndings(unapplied,'mixed'));
 const marker='function validateFamilyVocabulary(input,records,context){',records=fs.readFileSync(recordsFile,'utf8');unique(records,marker);fs.writeFileSync(recordsFile,records.replace(marker,''));
 const before=f.read();let writes=0;const write=fs.writeFileSync;fs.writeFileSync=(...args)=>{writes++;return write(...args);};
 try{assert.throws(()=>T.applyConsumers(f.dir),/Missing|family records marker/);}finally{fs.writeFileSync=write;}
 assert.equal(writes,0);assert.deepEqual(f.read(),before);
});
