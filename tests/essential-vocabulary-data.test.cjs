'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const build=require('../tools/build-essential-vocabulary.cjs');
test('CSV import preserves multiline Chinese and quoted commas without inventing transcriptions',()=>{
 const rows=build.readCsv(Buffer.from('word,phonetic,translation\r\ncare,kɛə,"n. 照顾, 关心\nvt. 关怀"\r\nquote,kwəʊt,"他说""你好"""\r\n'));
 assert.equal(rows[0].translation,'n. 照顾, 关心\nvt. 关怀');assert.equal(rows[1].translation,'他说"你好"');
 assert.equal(build.makeIpa(''),'');assert.equal(build.makeIpa("'kєә"),'/ˈkeə/');
});
test('a contextual sentence is accepted but bare-word templates and embedded headword substrings are rejected',()=>{
 const entry={word:'book'};
 assert.deepEqual(build.checkExample(entry,{example:'I use this book to prepare for my science class.',exampleTranslation:'我用这本书准备科学课。'}),[]);
 assert.ok(build.checkExample(entry,{example:'I like the book.',exampleTranslation:'我喜欢这本书。'}).includes('generic-template'));
 assert.ok(build.checkExample(entry,{example:'The booking office closes at six.',exampleTranslation:'售票处六点关门。'}).includes('missing-exact-headword'));
 assert.deepEqual(build.checkExample({word:'word'},{example:'Please write the word clearly on the board.',exampleTranslation:'请把这个词清楚地写在板上。'}),[]);
});
test('examples with repeated sentences cannot masquerade as independent word contexts',()=>{
 const source={kind:'project-authored'},seed={entries:[{word:'book',meaning:'n. 书',source:{}},{word:'read',meaning:'v. 读',source:{}}]},items=[{word:'book',example:'I read a book about the history of our town.',exampleTranslation:'我读了一本关于我们镇历史的书。',contextMeaning:'书',source},{word:'read',example:'I read a book about the history of our town.',exampleTranslation:'我读了一本关于我们镇历史的书。',contextMeaning:'读',source}];
 assert.ok(build.applyExamples(seed,items).some(e=>e.errors.some(x=>x.startsWith('duplicate-example'))));
});
test('a missing contextual sense blocks release and a verified sense retains the dictionary gloss',()=>{
 const make=()=>({entries:[{word:'still',meaning:'n. 寂静；v. 使平静',source:{}}]}),source={kind:'project-authored'},item={word:'still',example:'The children are still waiting for their teacher.',exampleTranslation:'孩子们仍在等老师。',contextMeaning:'仍然',source};
 const incomplete=make();assert.ok(build.applyExamples(incomplete,[{...item,contextMeaning:''}])[0].errors.includes('missing-Chinese-context-meaning'));
 const complete=make();assert.deepEqual(build.applyExamples(complete,[item]),[]);assert.equal(complete.entries[0].meaning,'仍然');assert.equal(complete.entries[0].dictionaryMeaning,'n. 寂静；v. 使平静');
});
test('published essential pack has 8000 attributed complete headwords, no artificial phrase or inflection padding',()=>{
 const file=path.join(__dirname,'..','assets','essential-vocabulary-data.js'),data=require(file),audit=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vocabulary','essential','audit.json'),'utf8'));
 assert.equal(data.schema,1);assert.equal(data.status,'complete');assert.equal(data.target,8000);assert.equal(data.entries.length,8000);
 assert.equal(new Set(data.entries.map(e=>e.word.toLowerCase())).size,8000);assert.equal(new Set(data.entries.map(e=>e.id)).size,8000);
 assert.deepEqual(data.stages.map(s=>data.entries.filter(e=>e.stage===s.id).length),[1000,2000,3000,2000]);
 for(const [i,e] of data.entries.entries()){
  assert.equal(e.rank,i+1);assert.match(e.word,/^[A-Za-z]+$/);assert.match(e.ipa,/^\/.+\/$/);assert.doesNotMatch(e.ipa,/[\^?@\\єә]/);assert.match(e.meaning,/[\u3400-\u9fff]/);assert.ok(e.pos);
  assert.deepEqual(build.checkExample(e,e),[],e.word);assert.equal(e.audio.text,e.word);assert.equal(e.source.dictionary,'ecdict');assert.ok(e.source.sourcePhonetic);assert.ok(e.source.example?.provider||e.source.example?.kind);assert.equal(e.meaning,e.contextMeaning);assert.ok(e.dictionaryMeaning);
 }
 const set=new Set(data.entries.map(e=>e.word.toLowerCase()));for(const word of ['the','be','and','a','I','you','have','can','read','write','speak','listen'])assert.ok(set.has(word.toLowerCase()),word);
 for(const word of ['has','went','walking','readings','sydney','gcse','pence'])assert.equal(set.has(word),false,word);
 assert.equal(audit.examples.complete,8000);assert.equal(audit.examples.pending,0);assert.equal(audit.assetSha256,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
});
