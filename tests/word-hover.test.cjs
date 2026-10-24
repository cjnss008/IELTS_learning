 'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../assets/word-dictionary.js');
const H = require('../assets/word-hover.js');

test('local lookup retains the material sense/example while preferring the verified word audio',() => {
  const options = {courseData:{vocab:[{word:'bank',meaning:'银行',ipa:'/bæŋk/',audio:'audio/words/bank.mp3',context:'I work in a bank.'}]},curriculumData:{materials:[{id:'river',vocabulary:[{word:'bank',meaning:'河岸',example:'They sat on the river bank.'}]},{id:'money',vocabulary:[{word:'bank',meaning:'银行',example:'She works at the bank.'}]}]}};
  const dictionary = D.create({...options,audioData:{items:{bank:{audio:'audio/vocabulary/bank-verified.mp3'}}}});
  const result = dictionary.lookup('BANK','They sat on the river bank.','river');
  assert.equal(result.meaning,'河岸'); assert.equal(result.example,'They sat on the river bank.'); assert.equal(result.ipa,'/bæŋk/'); assert.equal(result.audio,'audio/vocabulary/bank-verified.mp3');
  const fallback = D.create({...options,audioData:{items:{}}}).lookup('bank','','river');
  assert.equal(fallback.audio,'audio/words/bank.mp3'); assert.equal(fallback.meaning,'河岸'); assert.equal(fallback.example,'They sat on the river bank.');
  assert.equal(dictionary.lookup('zzunknown','').ipa,'');
  assert.equal(dictionary.lookup('zzunknown','').source,'missing');
  assert.equal(D.safeEntry({word:'bank',audio:'https://untrusted.test/bank.mp3'}).audio,'');
  assert.equal(D.safeEntry({word:'bank',audio:'audio/words/../bank.mp3'}).audio,'');
});

test('AI supplementation never overwrites an authored sense, and rejects a different word',async () => {
  let calls=0;
  const lookup = H.createLookup({entries:[{word:'specialword',meaning:'课文的特定义',example:'This is a specialword.'}],lookupAI:async word => { calls++; return {word,ipa:'/test/',meaning:'另一词义',example:'AI example.'}; }});
  const result = await lookup.enrich('specialword','context','A0');
  assert.equal(result.meaning,'课文的特定义'); assert.equal(result.example,'This is a specialword.'); assert.equal(result.ipa,'/test/');
  assert.equal((await lookup.enrich('specialword','context','A0')).ipa,'/test/'); assert.equal(calls,1);
  assert.throws(() => D.mergeAI(result,{word:'different',ipa:'/test/'}),/不一致/);
});

test('concurrent identical queries share one request and profile clearing blocks stale cache refill',async () => {
  let calls=0,resolve;
  const lookup = H.createLookup({lookupAI:word => { calls++; return new Promise(done => { resolve=() => done({word,ipa:'/test/',meaning:'测试',example:'An example.'}); }); }});
  const a = lookup.enrich('pendingword','context'), b = lookup.enrich('pendingword','context');
  assert.equal(calls,1); lookup.clear(); resolve();
  await assert.rejects(a,/档案已切换/); await assert.rejects(b,/档案已切换/); assert.equal(lookup.cacheSize(),0);
});

test('offline missing entries remain explicitly incomplete and cache is bounded',async () => {
  const offline = H.createLookup(); assert.equal(offline.lookup('unknownword').complete,false); await assert.rejects(offline.enrich('unknownword'),/未配置AI/);
  const lookup = H.createLookup({lookupAI:async word => ({word,ipa:'/test/',meaning:'测试',example:'Test.'})});
  for (let i=0;i<270;i++) await lookup.enrich('word'+String.fromCharCode(97+Math.floor(i/26))+String.fromCharCode(97+i%26),'context');
  assert.equal(lookup.cacheSize(),256);
});

test('word hit testing handles punctuation, apostrophes and café without spanning whitespace',() => {
  assert.deepEqual(H.tokenAt('Hello, student.',1),{word:'Hello',start:0,end:5});
  assert.equal(H.tokenAt('Hello, student.',5),null); assert.equal(H.tokenAt('Hello, student.',6),null);
  assert.deepEqual(H.tokenAt("a student's café",8),{word:"student's",start:2,end:11});
  assert.equal(H.tokenAt("a student's café",15).word,'café');
});
