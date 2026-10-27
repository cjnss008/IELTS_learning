'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),T=require('../tools/apply-lexical-retention-v88.cjs'),R=require('../assets/lexical-retention-v88.js');
const read=file=>fs.readFileSync(path.join(root,file),'utf8'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
test('the exact root receipt approves all144 immutable questions while runtime and activation approval remain separate',()=>{
 const bytes=fs.readFileSync(path.join(root,'curriculum/lexical-retention-v88/root-derived-review.json')),value=JSON.parse(bytes);assert.equal(sha(bytes),R.INPUT_PINS.derivedReceiptFile);assert.equal(R.hash(value),R.INPUT_PINS.derivedReceipt);assert.equal(value.packetSha256,R.INPUT_PINS.derivedPacket);assert.equal(value.reviewedQuestions,144);assert.equal(value.approvedQuestionVariants,48);assert.equal(value.runtimeImplementationReviewed,false);assert.equal(value.activationApproved,false);assert.equal(value.independentEvidence,false);assert.equal(value.countsAsMastery,false);
});

test('the precise transforms are idempotent on actual consumers and refuse a missing source anchor',()=>{
 for(const[file,transform]of Object.entries({'assets/memory-core.js':T.memory,'assets/contextual-vocabulary-course.js':T.contextual,'assets/essential-vocabulary-course.js':T.course,'assets/essential-vocabulary-core.js':T.core,'assets/year-planner.js':T.year,'assets/essential-vocabulary-app.js':T.app,'assets/learning-records.js':T.records})){
  const text=read(file).replace(/\r\n/g,'\n');assert.equal(transform(text),text,file);
 }assert.throws(()=>T.year('unrelated source'),/Missing retention anchor/);assert.throws(()=>T.records(read('assets/learning-records.js')+'\n'+read('assets/learning-records.js')),/Ambiguous applied retention anchor/);
});
