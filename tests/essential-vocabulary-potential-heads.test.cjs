'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/essential-vocabulary-core.js'),'utf8');
assert.ok(source.includes('return {TARGET, START_COURSE_DAY'));assert.ok(source.includes('return candidates.filter(head=>{'));
const exposed=source.replace('return {TARGET, START_COURSE_DAY','return {__potentialHeads:potentialHeads,__formIndex:FORM_INDEX,TARGET, START_COURSE_DAY')
  .replace('return candidates.filter(head=>{','return candidates.filter(head=>{root.__headVisits++;');
assert.notEqual(exposed,source,'test-only VM instrumentation must match the implementation');
const root={__headVisits:0};vm.runInNewContext(exposed,{globalThis:root});
const {__potentialHeads:potentialHeads,__formIndex:formIndex}=root.IELTSEssentialVocabulary;
const norm=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
function original(surface,entries){
  const raw=String(surface||'').trim(),key=norm(raw);
  if(Object.prototype.hasOwnProperty.call(formIndex,key))return Array.from(formIndex[key]);
  const parts=key.split(/\s+/),abbreviation=/^[A-Z]{2,}$/.test(raw);
  return entries.map(entry=>norm(entry.word)).filter(head=>{
    if(head.split(/\s+/).length!==parts.length)return false;
    if(head===key)return true;
    if(abbreviation||parts.length!==1||Math.abs(head.length-key.length)>3)return false;
    let common=0;while(common<Math.min(head.length,key.length)&&head[common]===key[common])common++;
    return common>=4&&common>=Math.min(head.length,key.length)-1;
  });
}
const actual=(surface,entries)=>Array.from(potentialHeads(surface,entries));
const freezeWords=words=>Object.freeze(words.map(word=>Object.freeze({word})));

test('indexed candidates preserve the original predicate, order and form index for public words',()=>{
  const catalog=require('../assets/essential-vocabulary-data.js');
  const words=catalog.entries.map(entry=>entry.word),entries=freezeWords(words);
  const inputs=['','a','ab','ABC','ABCD','teachers','classmates','foo bar','FOO BAR','foo\tbar',
    'hello-world',"student's",'éxample','😀word','ß','@@@','   library   ','qqqqzzzzzzzz'];
  let seed=0x1a2b3c4d;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<1600;i++){
    const word=words[next()%words.length];
    inputs.push([word,word+'s',word.toUpperCase(),word.slice(0,-1)+'z',word.slice(0,3),word+'-extra',word+' other',' '+word+' '][i%8]);
  }
  for(const input of inputs)assert.deepEqual(actual(input,entries),original(input,entries),`mismatch for ${JSON.stringify(input)}`);
  const query=words.find(word=>word.length>=4&&!Object.hasOwn(formIndex,norm(word)));assert.ok(query);
  root.__headVisits=0;assert.deepEqual(actual(query,entries),original(query,entries));
  assert.ok(root.__headVisits>0&&root.__headVisits<100,'frozen public entries inspect only the matching prefix group');
  const first=potentialHeads('teachers',entries);first.push('must-not-change-index');
  assert.deepEqual(actual('teachers',entries),original('teachers',entries));
});

test('exact, duplicate and approximate matches keep their original ordering',()=>{
  const entries=freezeWords(['zzzzab','zzzzabc','zzzzyy','zzzzab','zzzzaba','zzzz','other','zzzz ab']);
  for(const input of ['zzzzab','zzzzabb','ZZZZAB','zzzz','zzzz ab','zzzz abc','zzz','zzzzabx'])
    assert.deepEqual(actual(input,entries),original(input,entries),`mismatch for ${JSON.stringify(input)}`);
});

test('mutable arrays, mutable items and frozen accessors are reread on each call',()=>{
  const query='qqqqzzz';
  const mutable=[{word:'qqqqaaa'},{word:'qqqqbbb'}];
  assert.deepEqual(actual(query,mutable),original(query,mutable));
  mutable[0].word=query;mutable.push({word:'qqqqzzzz'});
  assert.deepEqual(actual(query,mutable),original(query,mutable));assert.ok(actual(query,mutable).includes(query));
  const rows=Object.freeze([{word:'qqqqaaa'},Object.freeze({word:'qqqqbbb'})]);
  assert.deepEqual(actual(query,rows),original(query,rows));rows[0].word=query;
  assert.deepEqual(actual(query,rows),original(query,rows));assert.ok(actual(query,rows).includes(query));
  const replaceable=[Object.freeze({word:'qqqqaaa'})];
  assert.deepEqual(actual(query,replaceable),original(query,replaceable));replaceable[0]=Object.freeze({word:query});
  assert.deepEqual(actual(query,replaceable),original(query,replaceable));assert.ok(actual(query,replaceable).includes(query));
  let live='qqqqaaa';const accessor=Object.freeze({get word(){return live;}}),accessors=Object.freeze([accessor]);
  assert.deepEqual(actual(query,accessors),original(query,accessors));live=query;
  assert.deepEqual(actual(query,accessors),original(query,accessors));assert.ok(actual(query,accessors).includes(query));
});
