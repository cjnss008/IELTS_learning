'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const {inspectCandidates, auditProject} = require('../tools/audit-linked-lexeme-collisions.cjs');

const entries = [
  {id:'essential:litre', word:'litre', spellingVariants:['liter']},
  {id:'essential:heat', word:'heat', spellingVariants:[]},
  {id:'essential:bank', word:'bank', spellingVariants:[]}
];
const forms = {heating:['heat'], banks:['bank']};
const review = (word, pos) => ({status:'dictionary-reference-checked', sourceUrl:'https://dictionary.cambridge.org/us/dictionary/english/'+word.toLowerCase(), partOfSpeech:pos, checkedOn:'2026-10-29', audioListeningReview:'pending'});
const candidate = (word, id, extra={}) => ({source:'candidate-family', day:13, word, canonicalId:id, meaning:'语境义', pos:'n.', quote:'Synthetic context.', ...extra});
const run = (prior, candidates) => inspectCandidates({entries, forms, prior, candidates});

test('same explicit identity is a definite repeat across a spelling variant', () => {
  const r = run([{source:'published',day:4,word:'litre',canonicalId:'essential:litre'}],
    [candidate('liter','essential:litre',{canonicalWord:'litre'})]);
  assert.equal(r.status,'rejected'); assert.equal(r.gatePassed,false);
  assert.equal(r.counts.definiteRepeats,1); assert.equal(r.collisions[0].reason,'same-explicit-canonical-id');
});

test('same surface without prior identity is a review lead, not an automatic repeat', () => {
  const r = run([{source:'legacy',day:2,word:'bank',meaning:'河岸',pos:'n.'}],
    [candidate('bank','essential:bank',{meaning:'银行'})]);
  assert.equal(r.status,'semantic-review-required'); assert.equal(r.gatePassed,false);
  assert.equal(r.counts.definiteRepeats,0); assert.equal(r.counts.semanticReviewNeeded,1);
  assert.equal(r.collisions[0].reason,'same-surface-sense-unconfirmed');
});

test('same and future legacy days are planned review leads; earlier days remain review blockers', () => {
  for (const [day,relation] of [[13,'same-day'],[16,'later']]) {
    const r=run([{source:'legacy',day,word:'bank',canonicalId:'essential:bank'}], [candidate('bank','essential:bank')]);
    assert.equal(r.status,'screen-clear-only'); assert.equal(r.gatePassed,true); assert.equal(r.counts.plannedReviewLeads,1);
    assert.equal(r.collisions[0].classification,'planned-review'); assert.equal(r.collisions[0].courseDayRelation,relation);
  }
  const earlier=run([{source:'legacy',day:12,word:'bank',canonicalId:'essential:bank'}], [candidate('bank','essential:bank')]);
  assert.equal(earlier.status,'rejected'); assert.equal(earlier.collisions[0].courseDayRelation,'earlier');
});

test('a duplicate target in another candidate unit blocks even if supplied out of chronological order', () => {
  const r=run([], [candidate('bank','essential:bank',{day:18}),candidate('bank','essential:bank',{day:12})]);
  assert.equal(r.status,'rejected'); assert.equal(r.counts.definiteRepeats,1); assert.equal(r.collisions[0].courseDayRelation,'later');
});

test('independent-looking heating is flagged for semantic review without rejecting its noun sense', () => {
  const r = run([{source:'legacy',day:4,word:'heat',meaning:'加热',pos:'v.'}],
    [candidate('heating','extension:heating',{meaning:'供暖',dictionaryReview:review('heating','n.')})]);
  assert.equal(r.status,'semantic-review-required'); assert.equal(r.counts.invalid,0); assert.equal(r.counts.definiteRepeats,0);
  const row = r.collisions.find(x => x.reason==='extension-surface-is-indexed-core-inflection');
  assert.equal(row.prior.canonicalId,'essential:heat'); assert.equal(row.dictionaryReview.sourceUrl,'https://dictionary.cambridge.org/us/dictionary/english/heating');
  assert.equal(row.candidate.meaning,'供暖'); assert.equal(row.candidate.pos,'n.');
});

test('Celsius may retain capitalization; claiming the core spelling liter as an extension is invalid', () => {
  const good = run([], [candidate('Celsius','extension:celsius',{pos:'adj.',dictionaryReview:review('Celsius','adj.')})]);
  assert.equal(good.status,'screen-clear-only'); assert.equal(good.gatePassed,true); assert.equal(good.extensions[0].word,'Celsius');
  const bad = run([], [candidate('liter','extension:liter',{dictionaryReview:review('liter','n.')})]);
  assert.equal(bad.status,'rejected'); assert.ok(bad.invalid.some(x=>x.reason.includes('core spelling alias')));
});

test('unsubstantiated and malformed claimed dictionary metadata cannot clear the screen', () => {
  for (const dictionaryReview of [undefined, {...review('kilogram','n.'),sourceUrl:'https://example.com/fake'}, {...review('kilogram','n.'),checkedOn:'2026-02-30'}, {...review('kilogram','n.'),partOfSpeech:'v.'}]) {
    const r=run([], [candidate('kilogram','extension:kilogram',{dictionaryReview})]);
    assert.equal(r.status,'rejected'); assert.equal(r.gatePassed,false);
    assert.ok(r.invalid.some(x=>x.reason.includes('dictionary reference')));
  }
});

test('actual public drafts report 24 extensions, preserve evidence and leave collisions held', () => {
  const r = auditProject(), again = auditProject();
  assert.equal(r.candidateCount,300); assert.equal(r.extensionCount,24);
  assert.equal(r.status,'semantic-review-required'); assert.equal(r.gatePassed,false);
  assert.deepEqual(r.counts,again.counts);
  for (const word of ['heating','freezing']) {
    const row=r.collisions.find(x=>x.candidate.word===word&&x.reason==='extension-surface-is-indexed-core-inflection');
    assert.ok(row); assert.ok(row.candidate.quote); assert.ok(row.candidate.sourceTextSha256); assert.ok(Number.isInteger(row.candidate.quoteStart));
    assert.equal(row.dictionaryReview.status,'dictionary-reference-checked'); assert.equal(row.dictionaryReview.audioListeningReview,'pending');
  }
  assert.equal(r.counts.semanticReviewNeeded,2);
  assert.ok(r.collisions.some(x=>x.candidate.word==='nurse' && x.prior.source.startsWith('legacy-') && x.classification==='planned-review' && x.courseDayRelation==='later'));
  assert.ok(r.collisions.some(x=>x.candidate.word==='kitchen' && x.classification==='planned-review' && x.courseDayRelation==='later'));
  const command=spawnSync(process.execPath,[path.join(__dirname,'../tools/audit-linked-lexeme-collisions.cjs'),'--summary','--require-clear'],{encoding:'utf8'});
  assert.equal(command.status,2,command.stderr); assert.equal(JSON.parse(command.stdout).gatePassed,false);
});
