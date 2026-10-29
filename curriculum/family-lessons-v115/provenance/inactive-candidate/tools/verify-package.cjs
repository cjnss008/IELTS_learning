'use strict';
// Read-only candidate/source checks plus disposable local loader simulation.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const pkg = path.resolve(__dirname,'..');
const repo = '\\\\mynas\\family\\IELTS_learning开发';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').toLowerCase();
const clone = value => JSON.parse(JSON.stringify(value));
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,sorted(value[key])]));
  return value;
}
const canonicalSha = value => sha(JSON.stringify(sorted(value)));
function bytes(rel) {
  assert(typeof rel === 'string' && rel && !rel.includes('\\') && !path.isAbsolute(rel));
  assert(!rel.split('/').some(s => !s || s === '.' || s === '..'));
  const file = path.resolve(pkg,...rel.split('/'));
  assert(file.startsWith(pkg + path.sep));
  return fs.readFileSync(file);
}
const json = rel => JSON.parse(bytes(rel).toString('utf8'));
function pin(ref) {
  const value = bytes(ref.path); assert.equal(sha(value),ref.sha256); assert.equal(value.length,ref.bytes); return value;
}
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !['audioPending','audioCandidate','currentAudioCandidate'].includes(key)).map(([key,child]) => [key,clean(child)]));
}
function forbidden(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key,child] of Object.entries(value)) {
    assert(!['audioPending','audioCandidate','currentAudioCandidate'].includes(key),'Stale candidate marker');
    forbidden(child);
  }
}
const release = json('release.json'), proof = json('provenance/package-manifest.json');
assert.equal(release.schema,1); assert.equal(release.active,false);
assert.equal(release.id,'family-linked-days02-03-v115');
assert.equal(release.status,'author-draft-pending-review');
assert.equal(release.policy,'ordinary-six-module-unstarted-and-after-core-v95');
assert.equal(release.ordinaryPracticeOnly,true); assert.equal(release.independentAssessmentEligible,false);
assert(!Object.hasOwn(release,'rootReview')); assert(!fs.existsSync(path.join(pkg,'root-review.json')));
assert.equal(proof.active,false); assert.equal(proof.release.sha256,sha(bytes('release.json')));
assert.equal(release.materials.length,20); assert.equal(release.units.length,2);
for (const [rel,expected] of Object.entries(proof.projectInputHashes)) {
  assert.equal(sha(fs.readFileSync(path.join(repo,...rel.split('/')))),expected,'Project input drift: ' + rel);
}
const A = require(path.join(repo,'assets/assessment-core.js'));
const oral = require(path.join(repo,'assets/oral-practice.js'));
const helper = require(path.join(repo,'assets/family-lesson-expansion-v95.js'));
const essential = require(path.join(repo,'assets/essential-vocabulary-data.js'));
const player = require(path.join(repo,'assets/course-player.js'));
const loader = require(path.join(repo,'tools/apply-family-lessons-v95.cjs'));
const current = require(path.join(repo,'assets/curriculum-data.js'));
const core = new Map(essential.entries.map(x => [x.id,x])), resolve = helper.createLexemeResolver(essential.entries);
const materials = new Map(), rows = new Map();
for (const row of release.materials) {
  const raw = bytes(row.file), m = JSON.parse(raw);
  assert.equal(sha(raw),row.fileSha256); assert.equal(m.id,row.id);
  assert.equal(A.materialContentHash(m),row.materialContentHash);
  assert.equal(sha(JSON.stringify(m.questions || [])),row.questionsSha256);
  assert(/^family-linked-d0[23]-(?:vocabulary-v115-g[1-5]|grammar-v115|reading-v115|listening-v115|speaking-v115|writing-v115)$/.test(m.id));
  assert.equal(m.source.verification,'author-draft-pending-independent-review');
  assert.equal(m.source.practiceOnly,true); assert.equal(m.pool,'training');
  assert(!m.fullTest && !m.independentBank && !m.source.independentAssessmentEligible);
  forbidden(m); assert(!materials.has(m.id));
  materials.set(m.id,m); rows.set(m.id,row);
  if (['grammar','reading','listening'].includes(m.skill)) {
    const expected = m.skill === 'grammar' ? 12 : 10;
    const sourceText = m.skill === 'listening' ? m.transcript : m.passage;
    assert.equal(m.questionCount,expected); assert.equal(m.questions.length,expected);
    const ids = new Set();
    for (const q of m.questions) {
      assert(q.id && !ids.has(q.id)); ids.add(q.id);
      assert(q.prompt && q.explanation && q.evidence);
      assert.equal(q.evidenceOffsets.unit,'UTF-16-code-unit');
      assert.equal(sourceText.slice(q.evidenceOffsets.start,q.evidenceOffsets.end),q.evidence);
      assert(Array.isArray(q.options) && q.options.length === 4);
      assert(Array.isArray(q.answers) && q.answers.length && q.answers.every(a => q.options.includes(a)));
      for (const answer of q.answers) {
        const grade = A.gradeQuestion(q,answer);
        assert(grade.correct && grade.gradable, m.id + ':' + q.id);
      }
    }
  }
  player.freezeMaterialBinding(m,{assessment:A,task:{id:m.skill,mode:'practice',instructions:m.instructions},data:{materials:[...materials.values()]}});
}
const audioCounts = {}, assetBy = new Map(), outputHashes = new Set();
for (const a of proof.assets) {
  const data = bytes(a.src);
  assert.equal(data.length,a.bytes); assert.equal(sha(data),a.sha256);
  assert.equal(a.humanListened,false);
  assert(!assetBy.has(a.src)); assetBy.set(a.src,a);
  audioCounts[a.kind] = (audioCounts[a.kind] || 0) + 1;
  outputHashes.add(a.sha256);
  const meta = JSON.parse(pin(a.metadata));
  if (a.kind === 'word' || a.kind === 'speaking-full' || a.kind === 'speaking-segment') {
    assert.equal(meta.audioHash,a.sha256);
    assert.equal(canonicalSha(meta.identity),path.basename(a.metadata.path,'.json'));
    assert.equal(meta.identity.voice,a.voice);
    assert(Array.isArray(meta.wordBoundaries) && meta.wordBoundaries.length > 0);
    if (a.kind === 'word') {
      assert.equal(meta.identity.text,a.spokenText); assert.equal(sha(a.spokenText),a.textSha256);
    } else {
      assert.equal(sha(meta.identity.text),a.textSha256);
    }
  }
  if (a.kind === 'listening') {
    assert.equal(meta.audioHash,a.sha256); assert.equal(meta.transcriptHash,a.textSha256);
    assert.equal(canonicalSha(meta.configuration),meta.configurationHash);
    assert.equal(meta.synthetic,true); assert.equal(meta.locale,'en-US');
    pin(a.candidateMaterial);
    assert.equal(a.groups.length,2);
    for (const gr of a.groups) {
      const g = JSON.parse(pin(gr.metadata)), ga = pin(gr.audio);
      assert.equal(canonicalSha(g.identity),path.basename(gr.metadata.path,'.json'));
      assert.equal(g.audioHash,sha(ga));
    }
  }
}
assert.deepEqual(audioCounts,{word:60,listening:2,'speaking-full':2,'speaking-segment':4});
assert.equal(proof.assets.length,68);

const wordReport = json('provenance/audio-rebound/audio-report.json');
const eq = json('provenance/audio-rebound/audio-equivalence-for-rebinding.json');
const priorReport = json('provenance/audio-rebound/history/audio-report.json');
const oralPlan = json('provenance/oral/plan.json'), oralReport = json('provenance/oral/audio-report.json');
const sourcePins = {2:'8985133f495899bc533254c27669f53187305c8980da1bbb9e68ef8d8246a381',
  3:'48fa5999ddbda6af4334c22b67ec21c3db36ace81211c8612423ec804d508c13'};
const vocabInstructions = '先完成到期复习，再练本组六词：每词正确输入三遍、录音跟读三遍，再完成补全、中文写英文和听写。提交后查看结果与订正。';
const listenInstructions = '先按对话分段听人物与数字，再独立作答；订正时回听对应片段。';
const oldIds = new Set(current.materials.map(m => m.id));
const historicReleases = [109,114].map(v => json('provenance/history/family-lessons-v' + v + '-release.json'));
assert.deepEqual(historicReleases.map(r => r.units.length),[7,10]);
const historicTargets = historicReleases.flatMap(r => r.units.flatMap(u => u.targets));
assert.equal(historicTargets.length,510);
const historicalIds = new Set(historicTargets.map(t => t.canonicalId)), historicalForms = new Set();
for (const target of historicTargets) {
  const lex = resolve(target);
  for (const value of [target.surface,target.canonicalWord,target.trainingWord,lex.word,lex.canonicalWord,...lex.spellingVariants]) {
    if (value) historicalForms.add(norm(value));
  }
}
const seenIds = new Set(), seenForms = new Set(), seenRefs = new Set(), byDay = {}, asrExpected = new Map();
const changes = proof.authorizedChanges;
assert.equal(changes.length,8);
for (const day of [2,3]) {
  const dn = '0' + day, snapshot = proof.drafts.find(x => x.day === day);
  assert(snapshot && snapshot.sourceSha256 === sourcePins[day]);
  const raw = bytes(snapshot.path); assert.equal(sha(raw),snapshot.sourceSha256); assert.equal(raw.length,snapshot.sourceBytes);
  const draft = JSON.parse(raw), previousRaw = bytes(snapshot.previousSourcePath);
  assert.equal(sha(previousRaw),snapshot.previousSourceSha256);
  const previous = JSON.parse(previousRaw), source = new Map(draft.materials.map(m => [m.skill,m]));
  const previousBy = new Map(previous.materials.map(m => [m.skill,m]));
  assert.equal(draft.active,false); assert.equal(draft.day,day); assert.equal(draft.targets.length,30);
  assert.deepEqual(previous.targets.map(t => [t.word,t.canonicalId,t.ipa]),draft.targets.map(t => [t.word,t.canonicalId,t.ipa]));
  assert.equal(previousBy.get('reading').passage,source.get('reading').passage);
  assert.equal(previousBy.get('listening').transcript,source.get('listening').transcript);
  assert.deepEqual(previousBy.get('listening').questions,source.get('listening').questions);
  assert.equal(previousBy.get('speaking').reference,source.get('speaking').reference);
  assert.equal(previousBy.get('writing').reference,source.get('writing').reference);
  const unit = release.units.find(u => u.day === day);
  assert(unit); assert.equal(unit.id,'family-linked-d' + dn + '-unit-v115');
  assert(!current.familyLessonRelease.units.some(x => x.id === unit.id));
  assert.equal(unit.targetGoal,30); assert.equal(unit.targets.length,30); assert.equal(unit.tasks.length,6);
  assert.deepEqual(new Set(unit.tasks.map(t => t.id)),new Set(['vocabulary','grammar','listening','reading','speaking','writing']));
  for (const task of unit.tasks) {
    assert.deepEqual(task.requires,[]); assert.deepEqual(task.replaceIds,[]);
    assert.equal(task.materialRefs.length,task.id === 'vocabulary' ? 5 : 1);
    for (const ref of task.materialRefs) {
      const m = materials.get(ref.materialId);
      assert(m && m.skill === task.id && !seenRefs.has(m.id)); seenRefs.add(m.id);
      assert.equal(ref.contentHash,A.materialContentHash(m)); assert(!oldIds.has(m.id));
      if (task.id === 'listening') {
        const asset = assetBy.get(m.audio);
        assert.deepEqual(ref.audioRef,{src:asset.src,sha256:asset.sha256,bytes:asset.bytes});
      }
    }
  }
  const targetMap = new Map(unit.targets.map(t => [t.canonicalId,t]));
  assert.equal(targetMap.size,30);
  const readId = 'family-linked-d' + dn + '-reading-v115', reading = materials.get(readId);
  assert.equal(reading.passage,source.get('reading').passage);
  const readHash = A.sourceTextHash(reading.passage);
  const sourceCards = source.get('vocabulary').vocabulary;
  for (let i = 0; i < 30; i++) {
    const t = draft.targets[i], w = sourceCards[i], packed = targetMap.get(t.canonicalId), canonical = core.get(t.canonicalId);
    assert(canonical && packed); assert.equal(canonical.ipa,t.ipa); assert.equal(t.ipaAccent,'en-US');
    for (const key of ['word','canonicalId','meaning','pos','ipa','ipaAccent','ipaSource','ipaVerification']) assert.equal(w[key],t[key]);
    assert.equal(w.example,t.quote);
    assert.equal(t.sourceMaterialId,source.get('reading').id); assert.equal(t.sourceTextSha256,readHash);
    assert.equal(reading.passage.slice(t.start,t.end),t.surface);
    assert.equal(reading.passage.slice(t.quoteStart,t.quoteEnd),t.quote);
    assert(t.quoteStart <= t.start && t.quoteEnd >= t.end);
    const lex = resolve(packed); assert.equal(lex.word,t.word); assert.equal(lex.canonicalWord,canonical.word);
    const forms = [t.word,t.surface,lex.word,lex.canonicalWord,...lex.spellingVariants].filter(Boolean).map(norm);
    assert(!historicalIds.has(t.canonicalId)); assert(forms.every(x => !historicalForms.has(x)));
    assert(!seenIds.has(t.canonicalId) && !seenForms.has(norm(t.word)));
    seenIds.add(t.canonicalId); seenForms.add(norm(t.word));
    const groupNo = Math.floor(i / 6) + 1;
    const src = 'audio/curriculum/family-linked-d' + dn + '-vocabulary-v115-g' + groupNo + '-word-' + t.word.toLowerCase() + '.mp3';
    const asset = assetBy.get(src), report = wordReport.words.find(x => x.day === day && x.canonicalId === t.canonicalId);
    const old = priorReport.words.find(x => x.day === day && x.canonicalId === t.canonicalId);
    const equivalent = eq.wordFiles.find(x => x.day === day && x.canonicalId === t.canonicalId);
    assert(asset && report && old && equivalent);
    assert.equal(asset.spokenText,t.word); assert.equal(asset.sourceIpaReference,t.ipa);
    assert.equal(report.word,t.word); assert.equal(report.ipaReference,t.ipa);
    assert.equal(report.sha256,asset.sha256); assert.equal(old.sha256,asset.sha256);
    assert.equal(equivalent.audioSha256,asset.sha256); assert.equal(equivalent.afterPos,t.pos);
    assert.equal(asset.metadata.sha256,equivalent.authoringMetadataSha256);
    assert.deepEqual(packed,{canonicalId:t.canonicalId,canonicalWord:canonical.word,sourceMaterialId:readId,
      sourceTextSha256:readHash,surface:t.surface,start:t.start,end:t.end,quote:t.quote,
      quoteStart:t.quoteStart,quoteEnd:t.quoteEnd,meaning:t.meaning,partOfSpeech:t.pos,
      audioRef:{src,sha256:asset.sha256,bytes:asset.bytes}});
  }
  const grouping = changes.find(x => x.day === day && x.kind === 'vocabulary-grouping');
  assert(grouping); assert.equal(grouping.originalEstimatedMinutes,45);
  assert.equal(grouping.groupEstimatedMinutes,18); assert.equal(grouping.totalGroupEstimatedMinutes,90);
  for (const skill of ['vocabulary','listening']) {
    const c = changes.find(x => x.day === day && x.kind === 'instructions' && x.skill === skill);
    assert(c); assert.equal(c.before,source.get(skill).instructions);
    assert.equal(c.after,skill === 'vocabulary' ? vocabInstructions : listenInstructions);
  }
  for (let g = 0; g < 5; g++) {
    const id = 'family-linked-d' + dn + '-vocabulary-v115-g' + (g+1), m = materials.get(id);
    assert(m); const expected = clean(source.get('vocabulary'));
    expected.id = id; expected.title = '第' + day + '课主题词汇 · 第' + (g+1) + '/5组';
    expected.estimatedMinutes = 18; expected.instructions = vocabInstructions;
    expected.vocabulary = sourceCards.slice(g*6,(g+1)*6).map(w => {
      const card = clean(w); card.audio = targetMap.get(w.canonicalId).audioRef.src; return card;
    });
    assert.deepEqual(m,expected,'Vocabulary source projection mismatch: ' + id);
  }
  for (const skill of ['grammar','reading','listening','speaking','writing']) {
    const id = 'family-linked-d' + dn + '-' + skill + '-v115', m = materials.get(id);
    assert(m); const expected = clean(source.get(skill)); expected.id = id;
    if (skill === 'listening') {
      expected.instructions = listenInstructions;
      const q = expected.questions.find(x => x.id === (day === 2 ? 'l05' : 'l07'));
      const change = changes.find(x => x.day === day && x.kind === 'question-field');
      if (day === 2) {
        assert.equal(change.field,'prompt'); assert.equal(change.id,'l05');
        assert.equal(change.before,'What can Ava and Tom write in their books?');
        assert.equal(change.after,'What does Ava say they can write?');
      } else {
        assert.equal(change.field,'explanation'); assert.equal(change.id,'l07');
        assert.equal(change.before,'她下课后留下五分钟检查给老师的便条；没有说留下吃晚饭、等到十点或找鞋。');
        assert.equal(change.after,'结合“下课后留下五分钟”和紧接着“检查给老师的便条”两句，可推断她留下是为了检查便条；没有说留下吃晚饭、等到十点或找鞋。');
      }
      assert.equal(q[change.field],change.before); q[change.field] = change.after;
      const asset = assetBy.get(m.audio), meta = JSON.parse(pin(asset.metadata));
      const candidate = JSON.parse(pin(asset.candidateMaterial));
      const audit = wordReport.listeningAudit.items.find(x => x.id === candidate.id);
      assert.equal(candidate.transcript,source.get(skill).transcript);
      assert.deepEqual(candidate.questions,source.get(skill).questions);
      assert.equal(meta.transcriptHash,sha(expected.transcript)); assert.equal(audit.audioHash,asset.sha256);
      assert.equal(meta.configurationHash,audit.configurationHash);
      assert.equal(meta.segments.length,8); assert.equal(meta.voices.length,2);
      const groups = new Map();
      for (let i = 0; i < meta.segments.length; i++) {
        const s = meta.segments[i], config = meta.configuration.segments[i], label = meta.configuration.sourceLabels[i];
        const span = expected.transcript.slice(s.sourceStart,s.sourceEnd);
        assert.equal(span,config.text); assert.equal(sha(span),s.textHash);
        for (const key of ['role','speaker','sourceStart','sourceEnd','voice','boundary','pauseBeforeSeconds']) assert.equal(s[key],config[key]);
        assert.equal(expected.transcript.slice(label.sourceStart,label.sourceEnd),label.label + ': ');
        assert.equal(label.role,s.role); assert.equal(label.sourceEnd,s.sourceStart);
        assert.equal(meta.roleVoices[s.role],s.voice);
        if (i) {
          assert.notEqual(s.role,meta.segments[i-1].role);
          assert.equal(s.pauseBeforeSeconds,0.65);
          assert(Math.abs(s.startSeconds - meta.segments[i-1].endSeconds - 0.65) < 0.00001);
        } else assert.equal(s.pauseBeforeSeconds,0);
        const list = groups.get(s.groupConfigurationHash) || []; list.push({s,span}); groups.set(s.groupConfigurationHash,list);
      }
      assert.equal(groups.size,2);
      for (const [key,list] of groups) {
        const entry = asset.groups.find(g => path.basename(g.metadata.path,'.json') === key);
        assert(entry); const group = JSON.parse(pin(entry.metadata));
        assert.equal(group.identity.text,list.map(x => x.span).join('\n\n'));
        assert(list.every(x => x.s.voice === group.identity.voice && x.s.groupAudioHash === group.audioHash));
      }
      expected.audio = asset.src; expected.audioKind = 'synthetic'; expected.audioSynthetic = true;
      expected.audioLocale = 'en-US'; expected.audioVoices = meta.voices; expected.audioProvider = meta.provider;
      expected.audioDurationSeconds = meta.durationSeconds;
      expected.audioRequirements = {...expected.audioRequirements,accent:'en-US',minimumSpeakers:2,
        paragraphGapMs:800,turnGapMs:650,roleVoices:meta.roleVoices};
      delete expected.audioRequirements.productionStatus;
      for (let part = 0; part < 2; part++) {
        const s = meta.segments.slice(part*4,(part+1)*4);
        asrExpected.set('d' + day + '-listening-' + (part+1),{audioSha256:asset.sha256,
          reference:s.map(x => expected.transcript.slice(x.sourceStart,x.sourceEnd)).join(' '),
          start:s[0].startSeconds,end:s[s.length-1].endSeconds});
      }
    }
    if (skill === 'speaking') {
      const parts = oral.spokenReferenceParts(expected.reference,65);
      assert.equal(parts.length,2);
      const full = proof.assets.find(x => x.day === day && x.kind === 'speaking-full');
      const fullMeta = JSON.parse(pin(full.metadata));
      assert.equal(fullMeta.identity.text,expected.reference); assert.equal(full.textSha256,sha(expected.reference));
      const fullEntry = oralReport.entries.find(x => x.day === day && x.kind === 'full');
      const planEntry = oralPlan.entries.find(x => x.day === day && x.kind === 'full');
      assert(fullEntry && planEntry); assert.equal(fullEntry.audioSha256,full.sha256);
      for (const [key,value] of Object.entries(planEntry)) assert.deepEqual(fullEntry[key],value);
      expected.audio = full.src; expected.audioKind = 'synthetic'; expected.audioSynthetic = true;
      expected.audioVoice = fullEntry.voice; expected.audioLocale = 'en-US';
      expected.audioProvider = 'Microsoft online TTS via edge-tts'; expected.audioDurationSeconds = fullEntry.durationSeconds;
      asrExpected.set('d' + day + '-oral-full',{audioSha256:full.sha256,reference:expected.reference,start:0,end:fullEntry.durationSeconds});
      expected.oralModelAudio = parts.map((text,index) => {
        const asset = proof.assets.find(x => x.day === day && x.kind === 'speaking-segment' && x.part === index+1);
        const meta = JSON.parse(pin(asset.metadata)), entry = oralReport.entries.find(x => x.day === day && x.kind === 'segment' && x.segmentIndex === index);
        const plan = oralPlan.entries.find(x => x.day === day && x.kind === 'segment' && x.segmentIndex === index);
        assert(asset && entry && plan); for (const [key,value] of Object.entries(plan)) assert.deepEqual(entry[key],value);
        assert.equal(meta.identity.text,text); assert.equal(entry.reference,text);
        assert.equal(entry.audioSha256,asset.sha256); assert.equal(asset.textSha256,sha(text));
        asrExpected.set('d' + day + '-oral-' + (index+1),{audioSha256:asset.sha256,reference:text,start:0,end:entry.durationSeconds});
        return {text,src:asset.src,sha256:asset.sha256,bytes:asset.bytes};
      });
    }
    assert.deepEqual(m,expected,'Material differs beyond authorized projection: ' + id);
  }
  assert.equal(unit.tasks.find(t => t.id === 'vocabulary').instructions,vocabInstructions);
  assert.equal(unit.tasks.find(t => t.id === 'listening').instructions,listenInstructions);
  for (const skill of ['grammar','reading','speaking','writing']) {
    assert.equal(unit.tasks.find(t => t.id === skill).instructions,source.get(skill).instructions);
  }
  byDay[day] = {materials:10,targets:30,vocabularyGroups:5,
    grammarQuestions:12,readingQuestions:10,listeningQuestions:10,speakingSegments:2};
}
assert.equal(seenIds.size,60); assert.equal(seenForms.size,60); assert.equal(seenRefs.size,20);
assert.equal(current.materials.length,2012); assert.equal(current.days.length,365);
assert.equal(A.materialContentHash(current.days),proof.historicalCollisionCheck.currentDayHash);

const asrPlan = JSON.parse(pin(proof.asr.plan)), asrReport = JSON.parse(pin(proof.asr.report));
assert.equal(asrPlan.active,false); assert.equal(asrPlan.sourcePromptProvided,false);
assert.equal(asrReport.active,false); assert.equal(asrReport.sourcePromptProvided,false);
assert.equal(asrExpected.size,10); assert.equal(proof.asr.results.length,10);
const asrDifferences = [];
for (const ref of proof.asr.results) {
  const raw = bytes(ref.path); assert.equal(sha(raw),ref.sha256);
  const item = JSON.parse(raw), job = asrPlan.jobs.find(x => x.id === ref.id);
  const report = asrReport.results.find(x => x.id === ref.id), expected = asrExpected.get(ref.id);
  assert(job && report && expected);
  for (const [key,value] of Object.entries(job)) assert.deepEqual(item[key],value);
  assert.equal(item.active,false); assert.equal(item.sourcePromptProvided,false);
  assert.equal(job.audioSha256,expected.audioSha256); assert.equal(job.reference,expected.reference);
  assert.equal(job.referenceSha256,sha(expected.reference));
  assert(Math.abs(job.start-expected.start)<0.00001 && Math.abs(job.end-expected.end)<0.00001);
  assert.equal(ref.normalizedEdits,item.normalizedDiff.edits); assert.equal(report.normalizedEdits,ref.normalizedEdits);
  if (ref.normalizedEdits) asrDifferences.push({id:ref.id,edits:ref.normalizedEdits,changes:item.normalizedDiff.changes});
}
assert.equal(asrDifferences.length,4);
assert.deepEqual(asrDifferences.map(x => x.id).sort(),['d2-listening-1','d3-listening-2','d3-oral-1','d3-oral-full']);

// Decode every package audio; check the central half of each declared listening pause.
const pauseAudit = [];
for (const asset of proof.assets) {
  const file = path.join(pkg,...asset.src.split('/'));
  const decoded = cp.spawnSync('ffmpeg',['-v','error','-i',file,'-ar','24000','-ac','1','-f','s16le','-'],
    {windowsHide:true,maxBuffer:16*1024*1024});
  assert.equal(decoded.status,0,decoded.stderr && decoded.stderr.toString());
  const pcm = decoded.stdout; assert(pcm.length > 100 && pcm.length % 2 === 0);
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 2) peak = Math.max(peak,Math.abs(pcm.readInt16LE(i)));
  assert(peak > 0,'Silent decoded asset: ' + asset.src);
  if (asset.kind === 'listening') {
    const meta = JSON.parse(pin(asset.metadata)), sampleRate = 24000;
    let maximum = 0;
    for (let i = 1; i < meta.segments.length; i++) {
      const s = meta.segments[i], gap = s.startSeconds - meta.segments[i-1].endSeconds;
      const left = Math.round((s.startSeconds-gap*0.75)*sampleRate)*2;
      const right = Math.round((s.startSeconds-gap*0.25)*sampleRate)*2;
      assert(left >= 0 && right <= pcm.length && right > left);
      let squares = 0, n = 0;
      for (let at = left; at < right; at += 2) { const value = pcm.readInt16LE(at)/32768; squares += value*value; n++; }
      const rms = Math.sqrt(squares/n); maximum = Math.max(maximum,rms);
      assert(rms <= 0.003,'Encoded turn gap exceeds silence threshold');
    }
    pauseAudit.push({day:asset.day,turns:8,gaps:7,expectedGapSeconds:0.65,maximumCentralGapRms:maximum});
  }
}
const simulation = require('./simulate-loader.cjs')({pkg,repo,assessment:A,loader,essential,player});

function enumerate(dir, relative = '') {
  const items = [];
  for (const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b) => a.name.localeCompare(b.name,'en'))) {
    const rel = relative ? relative + '/' + entry.name : entry.name, full = path.join(dir,entry.name);
    assert(!entry.isSymbolicLink());
    if (entry.isDirectory()) items.push(...enumerate(full,rel));
    else {
      assert(entry.isFile());
      if (['file-hashes.json','structural-validation.json'].includes(rel)) continue;
      const value = fs.readFileSync(full); items.push({path:rel,bytes:value.length,sha256:sha(value)});
    }
  }
  return items;
}
function writeStable(rel,value) {
  const out = Buffer.from(JSON.stringify(value,null,2) + '\n'), file = path.join(pkg,rel);
  if (fs.existsSync(file)) assert(fs.readFileSync(file).equals(out),'Existing report differs: ' + rel);
  else fs.writeFileSync(file,out,{flag:'wx'});
  return {path:rel,sha256:sha(out),bytes:out.length};
}
const inventory = writeStable('file-hashes.json',{schema:1,
  scope:'Every package file except this inventory and structural-validation.json; the latter pins this inventory.',
  files:enumerate(pkg)});
const result = {schema:1,active:false,status:'structural-checks-passed-review-pending',
  releaseSha256:sha(bytes('release.json')),packageFileInventory:inventory,
  counts:{days:2,materials:20,vocabularyGroups:10,targets:60,grammarQuestions:24,
    readingQuestions:20,listeningQuestions:20,audio:audioCounts},byDay,
  sourceEquivalence:{allFieldsMatchAfterDocumentedProjection:true,draftHashes:sourcePins,
    allowedChanges:changes,originalReadingListeningAndReferencesPreserved:true},
  collisionCheck:{historicDays:'4–20',historicCanonicalTargets:510,candidateCanonicalTargets:60,
    canonicalIdCollisions:0,spellingVariantCollisions:0,existingMaterialIdCollisions:0,
    existingUnitIdCollisions:0,installedMaterialsChecked:2012},
  audioVerification:{decodedNonSilentFiles:68,wordAndIpaReferencesMatched:60,
    listeningTranscriptRoleAndGapChecks:pauseAudit,fullSpeakingReferences:2,
    exactSpokenReferenceParts65:4,synthetic:true},
  asr:{unprompted:true,segments:10,normalizedExact:6,segmentsWithDifferences:4,
    differences:asrDifferences,classification:'pending-root-review',
    scope:'ASR covered listening and oral examples; it did not assess the 60 word clips.'},
  scheduling:{sourceVocabularyEstimateMinutes:45,perGroupEstimateMinutes:18,
    vocabularyGroups:5,vocabularyEstimateTotalMinutes:90,otherModuleEstimateMinutes:300,
    suggestedTotalMinutes:390,dailyAvailableMinutes:360,
    note:'390 minutes excludes due review and breaks. Actual budget and carry-forward remain for runtime validation; unfinished work must remain outstanding.'},
  loaderSimulation:simulation,
  limitations:['The candidate is unsigned and inactive; all source.verification fields remain pending.',
    'The 4 ASR differences require contextual classification; no pronunciation or learner outcome is certified.',
    'Semantic review, real browser playback, old-draft/backup compatibility and runtime budget behavior remain separate acceptance steps.',
    'No service was started and no learner state was used.']};
const report = writeStable('structural-validation.json',result);
console.log(JSON.stringify({status:result.status,releaseSha256:result.releaseSha256,
  fileInventorySha256:inventory.sha256,reportSha256:report.sha256,counts:result.counts,
  decodedNonSilentFiles:result.audioVerification.decodedNonSilentFiles,
  listeningPauseAudit:pauseAudit,asr:{exact:6,withDifferences:4},loaderSimulation:simulation.temporarySimulatedLoader}));
