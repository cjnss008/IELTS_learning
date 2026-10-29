'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const file=process.env.IELTS_DICTIONARY_SOURCE||path.join(__dirname,'../assets/word-dictionary.js');
const raw=fs.readFileSync(file,'utf8');
function replaceOnce(text,from,to){assert.equal(text.split(from).length,2,`instrumentation anchor ${from}`);return text.replace(from,to);}
function harness({uncached=false}={}) {
  let source=raw;
  source=replaceOnce(source,'let publicIndex = eligible && frozenPublicIndexes.get(curriculum);','let publicIndex = eligible && frozenPublicIndexes.get(curriculum); if (publicIndex) __dictionaryStats.hits++;');
  source=replaceOnce(source,'frozenPublicIndexes.set(curriculum,built);','frozenPublicIndexes.set(curriculum,built); __dictionaryStats.builds++;');
  if(uncached) source=replaceOnce(source,'const eligible = publicIndexEligible(curriculum,options);','const eligible = false;');
  const c=vm.createContext({__dictionaryStats:{hits:0,builds:0}});
  vm.runInContext(`
    globalThis.__pron={
      variants(){return [this.ipa];},
      lookup(){return {ipa:this.ipa,ipaVariants:[this.ipa],ipaSource:'fixture',ipaAccent:'en-US'};},
      ipa:'/fixture-one/'
    };
    globalThis.IELTSAmericanPronunciations=__pron;
    globalThis.IELTSVocabularyAudio={items:{notebook:{audio:'audio/words/first.mp3'}}};
    globalThis.__freeze=function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
    globalThis.__course=()=>({materials:[
      {id:'first',vocabulary:[{word:'notebook',meaning:'笔记本',example:'A notebook is on the desk.',pos:'noun'}, {word:'walk',meaning:'行走',example:'We walk together.'}]},
      {id:'second',vocabulary:[{word:'notebook',meaning:'记录本',example:'A notebook is on the desk.',pos:'noun'}, {word:'key',meaning:'钥匙',example:'The key is here.'}]},
      {id:'reading',passage:'A spare passage.'}
    ]});
    globalThis.IELTSCurriculumData=__freeze(__course());
  `,c);
  vm.runInContext(source,c,{filename:'word-dictionary.js'});
  return {c,run:code=>vm.runInContext(`(()=>{${code}})()`,c),stats:c.__dictionaryStats};
}
function compare(left,right,code){
  const a=left.run(code),b=right.run(code);
  assert.equal(JSON.stringify(a),JSON.stringify(b),'cached and uncached dictionary results differ');
  return a;
}

test('frozen public index matches the old build for many words and binding contexts',()=>{
  const h=harness(),old=harness({uncached:true});
  const result=compare(h,old,`
    const names=['notebook','walk','key','hello','NOteBOOK','missing',...Array.from({length:120},(_,i)=>'sample'+i)];
    const rows=[];
    for(let n=0;n<3;n++){
      const d=IELTSWordDictionary.create({curriculumData:IELTSCurriculumData});
      for(const word of names)rows.push(d.lookup(word,'A notebook is on the desk.',n%2?'first':'second'));
      rows.push({size:d.size});
    }
    return rows;
  `);
  assert.ok(result.length>300);
  assert.equal(h.stats.builds,1);
  assert.equal(h.stats.hits,2);
  assert.equal(old.stats.hits,0);
  assert.equal(result[0].meaning,'记录本');
});

test('public index never exposes its rows through mutable returned words',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    const a=IELTSWordDictionary.create().lookup('notebook','', 'first');
    a.word='changed';a.meaning='changed';a.ipaVariants.push('/forged/');a.materialId='changed';
    const b=IELTSWordDictionary.create().lookup('notebook','', 'first');
    const d=IELTSWordDictionary.create().lookup('notebook','', 'first');
    b.ipaVariants[0]='changed';
    return {b,d};
  `);
  assert.equal(value.d.meaning,'笔记本');
  assert.deepEqual(Array.from(value.d.ipaVariants),['/fixture-one/']);
  assert.equal(h.stats.hits,2);
});

test('mutable course is rebuilt and custom entries retain the original path',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    const opts={courseData:{vocab:[{word:'tent',meaning:'第一次',example:'The tent is open.'}]}};
    const a=IELTSWordDictionary.create(opts).lookup('tent');
    opts.courseData.vocab[0].meaning='第二次';
    const b=IELTSWordDictionary.create(opts).lookup('tent');
    const entries=[{word:'harbor',meaning:'旧港',example:'The harbor is quiet.'}];
    const c=IELTSWordDictionary.create({entries}).lookup('harbor');
    entries[0].meaning='新港';
    const d=IELTSWordDictionary.create({entries}).lookup('harbor');
    return {a,b,c,d};
  `);
  assert.deepEqual([value.a.meaning,value.b.meaning,value.c.meaning,value.d.meaning],['第一次','第二次','旧港','新港']);
  assert.equal(h.stats.builds,1);assert.equal(h.stats.hits,1);
});

test('overlapping course, public and custom entries retain original precedence and exact size',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    const courseData={vocab:[{word:'notebook',meaning:'旧课',example:'Course notebook.'},{word:'tent',meaning:'帐篷',example:'A tent.'}]};
    const entries=[{word:'notebook',meaning:'自定义',example:'Custom notebook.',source:'curriculum',materialId:'first'}, {word:'tent',meaning:'新帐篷'}, {word:'compass',meaning:'指南针'}];
    const before=IELTSWordDictionary.create({courseData,entries});
    const a={first:before.lookup('notebook','','first'),second:before.lookup('notebook','','second'),tent:before.lookup('tent'),compass:before.lookup('compass'),size:before.size};
    courseData.vocab[0].meaning='旧课修改';entries[0].meaning='自定义修改';entries.push({word:'fence',meaning:'围栏'});
    const after=IELTSWordDictionary.create({courseData,entries});
    const b={first:after.lookup('notebook','','first'),second:after.lookup('notebook','','second'),tent:after.lookup('tent'),fence:after.lookup('fence'),size:after.size};
    return {a,b};
  `);
  assert.equal(value.a.first.meaning,'笔记本');
  assert.equal(value.a.second.meaning,'记录本');
  assert.equal(value.b.size,value.a.size+1);
  assert.equal(value.b.fence.meaning,'围栏');
  assert.equal(h.stats.builds,0);assert.equal(h.stats.hits,0);
});

test('overlapping mutable course entries preserve preference, order and size on a public-cache hit',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    const courseData={vocab:[{word:'notebook',meaning:'旧课',example:'Course notebook.'},{word:'tent',meaning:'帐篷',example:'A tent.'}]};
    const first=IELTSWordDictionary.create({courseData});
    const a={first:first.lookup('notebook','','first'),second:first.lookup('notebook','','second'),tent:first.lookup('tent'),size:first.size};
    courseData.vocab[0].meaning='旧课修改';courseData.vocab[1].meaning='新帐篷';courseData.vocab.push({word:'compass',meaning:'指南针'});
    const next=IELTSWordDictionary.create({courseData});
    const b={first:next.lookup('notebook','','first'),second:next.lookup('notebook','','second'),tent:next.lookup('tent'),compass:next.lookup('compass'),size:next.size};
    return {a,b};
  `);
  assert.equal(value.a.first.meaning,'笔记本');assert.equal(value.a.second.meaning,'记录本');
  assert.equal(value.b.tent.meaning,'新帐篷');assert.equal(value.b.size,value.a.size+1);
  assert.equal(h.stats.builds,1);assert.equal(h.stats.hits,1);
});

test('mutable nested curriculum, foreign input, and replacement public data cannot reuse stale indexes',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    const first=IELTSWordDictionary.create().lookup('notebook','', 'first');
    IELTSWordDictionary.create();
    const changed=__course();changed.materials[0].vocabulary[0].meaning='新材料';
    IELTSCurriculumData=Object.freeze(changed);
    const a=IELTSWordDictionary.create().lookup('notebook','', 'first');
    changed.materials[0].vocabulary[0].meaning='修改后';
    const b=IELTSWordDictionary.create().lookup('notebook','', 'first');
    const foreign=__freeze(__course());
    const c=IELTSWordDictionary.create({curriculumData:foreign}).lookup('notebook','', 'first');
    const replacement=__course();replacement.materials[0].vocabulary[0].meaning='另一份';
    IELTSCurriculumData=__freeze(replacement);
    const d=IELTSWordDictionary.create().lookup('notebook','', 'first');
    const e=IELTSWordDictionary.create().lookup('notebook','', 'first');
    return {first,a,b,c,d,e};
  `);
  assert.deepEqual([value.first.meaning,value.a.meaning,value.b.meaning,value.c.meaning,value.d.meaning,value.e.meaning],['笔记本','新材料','修改后','笔记本','另一份','另一份']);
  assert.equal(h.stats.builds,2);assert.equal(h.stats.hits,2);
});

test('current audio and captured American provider are read afresh by every dictionary',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    const a=IELTSWordDictionary.create().lookup('notebook','', 'first');
    IELTSVocabularyAudio={items:{notebook:{audio:'audio/words/second.mp3'}}};
    __pron.ipa='/fixture-two/';
    const b=IELTSWordDictionary.create().lookup('notebook','', 'first');
    IELTSVocabularyAudio.items.notebook.audio='audio/words/third.mp3';
    const c=IELTSWordDictionary.create().lookup('notebook','', 'first');
    IELTSAmericanPronunciations={variants:()=>['/other/'],lookup:()=>({ipa:'/other/',ipaVariants:['/other/']})};
    const d=IELTSWordDictionary.create().lookup('notebook','', 'first');
    return {a,b,c,d};
  `);
  assert.deepEqual([value.a.audio,value.b.audio,value.c.audio,value.d.audio],['audio/words/first.mp3','audio/words/second.mp3','audio/words/third.mp3','audio/words/third.mp3']);
  assert.deepEqual([value.a.ipa,value.b.ipa,value.d.ipa],['/fixture-one/','/fixture-two/','/fixture-two/']);
  assert.equal(h.stats.hits,3);
});

test('prototype changes and accessors use original path with the same reads',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    IELTSWordDictionary.create();IELTSWordDictionary.create();
    Object.prototype.vocabulary=[{word:'prototypeword',meaning:'来自原型',example:'A prototype word.'}];
    const inherited=IELTSWordDictionary.create().lookup('prototypeword');
    delete Object.prototype.vocabulary;
    let reads=0;
    const data={};Object.defineProperty(data,'materials',{enumerable:true,get(){reads++;return [{id:'accessor',vocabulary:[{word:'getterword',meaning:'来自读取器',example:'A getter word.'}]}];}});
    IELTSCurriculumData=Object.freeze(data);
    const getter=IELTSWordDictionary.create().lookup('getterword');
    return {inherited,getter,reads};
  `);
  assert.equal(value.inherited.meaning,'来自原型');
  assert.equal(value.getter.meaning,'来自读取器');
  assert.equal(value.reads,1);
  assert.equal(h.stats.builds,1);assert.equal(h.stats.hits,1);
});

test('array and Map prototype changes force the ordinary path and preserve its result and size',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    IELTSWordDictionary.create();IELTSWordDictionary.create();
    Object.defineProperty(Array.prototype,Symbol.isConcatSpreadable,{value:false,configurable:true});
    const a=IELTSWordDictionary.create().lookup('notebook','','first');
    delete Array.prototype[Symbol.isConcatSpreadable];
    const sizeDescriptor=Object.getOwnPropertyDescriptor(Map.prototype,'size');
    Object.defineProperty(Map.prototype,'size',{get(){return sizeDescriptor.get.call(this)+1;},configurable:true});
    const b=IELTSWordDictionary.create().size;
    Object.defineProperty(Map.prototype,'size',sizeDescriptor);
    return {a,b};
  `);
  assert.equal(value.a.meaning,'笔记本');
  assert.ok(value.b>0);
  assert.equal(h.stats.builds,1);assert.equal(h.stats.hits,1);
});

test('a frozen graph containing an accessor is never cached or read more often',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    let reads=0;const entry={meaning:'旧义',example:'A word.'};
    Object.defineProperty(entry,'word',{enumerable:true,get(){reads++;return 'accessorword';}});
    Object.freeze(entry);
    const material=Object.freeze({id:'accessor',vocabulary:Object.freeze([entry])});
    IELTSCurriculumData=Object.freeze({materials:Object.freeze([material])});
    const a=IELTSWordDictionary.create().lookup('accessorword');
    const b=IELTSWordDictionary.create().lookup('accessorword');
    return {a,b,reads};
  `);
  assert.equal(value.a.meaning,'旧义');assert.equal(value.reads,2);
  assert.equal(h.stats.builds,0);assert.equal(h.stats.hits,0);
});

test('custom entry getters preserve the original read and fallback even if they change a prototype',()=>{
  const h=harness(),old=harness({uncached:true});
  const value=compare(h,old,`
    IELTSWordDictionary.create();IELTSWordDictionary.create();
    let reads=0;const options={};
    Object.defineProperty(options,'entries',{get(){reads++;Object.defineProperty(Array.prototype,Symbol.isConcatSpreadable,{value:false,configurable:true});return [{word:'customword',meaning:'自定义'}];}});
    const dictionary=IELTSWordDictionary.create(options);
    const result={word:dictionary.lookup('customword'),size:dictionary.size,reads};
    delete Array.prototype[Symbol.isConcatSpreadable];return result;
  `);
  assert.equal(value.word.meaning,'自定义');assert.equal(value.reads,1);
  assert.equal(h.stats.builds,1);assert.equal(h.stats.hits,1);
});

test('real public curriculum, old course, pronunciation and audio entries match every vocabulary lookup',()=>{
  const root=process.env.IELTS_PROJECT_ROOT||path.join(__dirname,'..');
  const c=vm.createContext({__dictionaryStats:{hits:0,builds:0}});
  for(const name of ['curriculum-data.js','course-data.js','american-pronunciations.js','vocabulary-audio.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),c,{filename:name});
  }
  vm.runInContext(`(()=>{const todo=[IELTSCurriculumData],seen=new WeakSet();while(todo.length){const x=todo.pop();if(!x||typeof x!=='object'||seen.has(x))continue;seen.add(x);for(const value of Object.values(x))todo.push(value);Object.freeze(x);}})()`,c);
  let instrumented=replaceOnce(raw,'let publicIndex = eligible && frozenPublicIndexes.get(curriculum);','let publicIndex = eligible && frozenPublicIndexes.get(curriculum); if(publicIndex)__dictionaryStats.hits++;');
  instrumented=replaceOnce(instrumented,'frozenPublicIndexes.set(curriculum,built);','frozenPublicIndexes.set(curriculum,built); __dictionaryStats.builds++;');
  vm.runInContext(instrumented,c,{filename:'word-dictionary-cached.js'});c.__cached=c.IELTSWordDictionary;
  const reference=replaceOnce(raw,'const eligible = publicIndexEligible(curriculum,options);','const eligible = false;');
  vm.runInContext(reference,c,{filename:'word-dictionary-uncached.js'});c.__reference=c.IELTSWordDictionary;
  const result=vm.runInContext(`(()=>{
    const opts={courseData:IELTSCourse,curriculumData:IELTSCurriculumData};
    __cached.create(opts);const cached=__cached.create(opts),reference=__reference.create(opts);
    if(cached.size!==reference.size)throw Error('dictionary size differs');
    let count=0;
    for(const material of IELTSCurriculumData.materials||[])for(const word of material.vocabulary||[]){
      const context=word?.example||material.passage||'';
      if(JSON.stringify(cached.lookup(word?.word,context,material.id))!==JSON.stringify(reference.lookup(word?.word,context,material.id)))throw Error('lookup differs for '+material.id);
      count++;
    }
    return {count,size:cached.size};
  })()`,c);
  assert.ok(result.count>6000);assert.ok(result.size>0);
  assert.equal(c.__dictionaryStats.builds,1);assert.equal(c.__dictionaryStats.hits,1);
});
