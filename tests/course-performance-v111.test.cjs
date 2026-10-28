'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../assets/assessment-core.js'),source=fs.readFileSync(path.join(__dirname,'../assets/essential-vocabulary-core.js'),'utf8');
test('dictionary prepares pronunciation only for requested words and retains separate material senses',()=>{
 const calls=[],root={IELTSAmericanPronunciations:{lookup:word=>{calls.push(word);return{ipa:'/test/',ipaVariants:['/test/'],ipaSource:'test'};}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/word-dictionary.js'),'utf8'),{globalThis:root});calls.length=0;
 const d=root.IELTSWordDictionary.create({curriculumData:{materials:[{id:'river',vocabulary:[{word:'bank',meaning:'河岸',example:'The river bank.'}]},{id:'money',vocabulary:[{word:'bank',meaning:'银行',example:'The bank is open.'},{word:'shelf',meaning:'架子'}]}]},audioData:{items:{}}});
 assert.equal(calls.length,0,'constructing a lookup must not normalize every pronunciation');assert.equal(d.lookup('bank','','river').meaning,'河岸');assert.equal(d.lookup('bank','','money').meaning,'银行');assert.ok(!calls.includes('shelf'),'unrequested words are not processed');
});
test('canonical vocabulary preparation is reused but live records, drafts and owner proof are not cached',()=>{
 const catalog=JSON.parse(JSON.stringify(require('../assets/essential-vocabulary-data.js')));let hashes=0,current=true,verifications=0;
 const root={IELTS_ESSENTIAL_VOCABULARY:catalog,IELTSAssessment:{...A,sourceTextHash:s=>{hashes++;return A.sourceTextHash(s);}},IELTSFamilyLessonExpansionV95:{runtime:()=>({isCurrentFullRecords:()=>current})},IELTSVocabularyPractice:{verifyTrainingArtifact:()=>{verifications++;return{valid:false};}},IELTSMemory:{read:()=>({items:{}})}};
 vm.runInNewContext(source,{globalThis:root});const E=root.IELTSEssentialVocabulary,records=[];
 assert.equal(E.verifiedFormEvidence({records}).status,'ready');const once=hashes;
 for(let i=0;i<10;i++)assert.equal(E.verifiedFormEvidence({records}).status,'ready');assert.equal(hashes,once,'public 8000-word index is hashed once');assert.ok(Object.isFrozen(catalog.entries));assert.ok(Object.isFrozen(catalog.entries[0]));
 const draft={id:'test-draft',taskId:'vocabulary',text:JSON.stringify({kind:'vocabulary-practice-draft',wordKeys:['book']})};assert.equal(E.verifiedFormEvidence({records,drafts:[draft]}).potentialBySurface.length,1);assert.equal(E.verifiedFormEvidence({records,drafts:[]}).potentialBySurface.length,0);
 records.push({id:'test-record',kind:'original',skill:'vocabulary',submittedAt:'2026-10-20T10:00:00Z',answer:JSON.stringify({words:[{word:'book'}]})});E.verifiedFormEvidence({records});assert.equal(verifications,1);E.verifiedFormEvidence({records});assert.equal(verifications,2);
 current=false;assert.equal(E.verifiedFormEvidence({records}).status,'pending');current=true;
 catalog.entries=catalog.entries.map(row=>({...row}));catalog.entries[0].word='corrupted';assert.equal(E.verifiedFormEvidence({records}).status,'pending','a replacement catalogue must be checked again');
});

test('browser SHA cache reuses exact text only, stays bounded, and matches Unicode digests',()=>{
 const root={hashRuns:0},code=fs.readFileSync(path.join(__dirname,'../assets/assessment-core.js'),'utf8').replace('const bytes=[];for(const char of text)','root.hashRuns++;const bytes=[];for(const char of text)');vm.runInNewContext(code,{globalThis:root});const api=root.IELTSAssessment,crypto=require('node:crypto'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 for(const s of ['', 'abc','图书馆 📚 café','a'.repeat(70000)])assert.equal(api.sourceTextHash(s),hash(s));const text=JSON.stringify({passage:'A learner visits the library.',answers:['book']});api.sourceTextHash(text);const before=root.hashRuns;for(let n=0;n<100;n++)assert.equal(api.sourceTextHash((' '+text).slice(1)),hash(text));assert.equal(root.hashRuns,before);assert.notEqual(api.sourceTextHash(text+' '),hash(text));for(let n=0;n<300;n++)api.sourceTextHash('bounded-'+n);const after=root.hashRuns;api.sourceTextHash(text);assert.equal(root.hashRuns,after+1,'older text is evicted instead of retaining unbounded learning content');
});
