'use strict';
// Read-only screening of public lesson inputs. A clear screen is not a release
// approval; no personal records, review decisions, or audio are read or written.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const FORM_HASH = 'b6c722d087adc585f4b030de9a54bfd11cd5a0f37c0f60d39a93d6a09910e644';
const normal = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sha = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function readFormIndex(root = ROOT) {
  const source = fs.readFileSync(path.join(root, 'assets', 'essential-vocabulary-core.js'), 'utf8');
  const match = source.match(/FORM_INDEX=(\{[^\n]+\});/);
  if (!match) throw Error('Reviewed form index unavailable');
  const forms = JSON.parse(match[1]);
  if (sha(JSON.stringify(forms)) !== FORM_HASH) throw Error('Reviewed form index hash changed');
  return forms;
}

function makeIndex(entries, forms) {
  const byId = new Map(), byForm = new Map();
  const indexed = word => Object.hasOwn(forms, word) ? forms[word] : [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.word !== 'string') throw Error('Invalid core identity');
    if (byId.has(entry.id)) throw Error('Duplicate core ID');
    byId.set(entry.id, entry);
    for (const form of [entry.word, ...(entry.spellingVariants || [])]) {
      const key = normal(form), ids = byForm.get(key) || new Set();
      if (!key) throw Error('Invalid core spelling');
      ids.add(entry.id); byForm.set(key, ids);
    }
  }
  function keys(word) {
    const raw = normal(word), values = new Set([raw]);
    for (const id of byForm.get(raw) || []) values.add(normal(byId.get(id).word));
    for (const head of indexed(raw)) {
      values.add(normal(head));
      for (const id of byForm.get(normal(head)) || []) values.add(normal(byId.get(id).word));
    }
    values.delete('');
    return values;
  }
  return {byId, byForm, indexed, keys};
}

function dictionaryReferenceMatches(target) {
  const ref = target.dictionaryReview;
  if (!ref || ref.status !== 'dictionary-reference-checked' || ref.partOfSpeech !== target.pos || typeof target.meaning !== 'string' || !target.meaning.trim() || ref.audioListeningReview !== 'pending') return false;
  try {
    const url = new URL(ref.sourceUrl), day = ref.checkedOn;
    return url.protocol === 'https:' && url.hostname === 'dictionary.cambridge.org' && url.pathname === '/us/dictionary/english/' + normal(target.word) && !url.search && !url.hash && /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(day + 'T00:00:00.000Z').toISOString().slice(0, 10) === day;
  } catch (_) { return false; }
}

function evidence(row) {
  const result = {source: row.source, day: row.day, word: row.word};
  for (const field of ['canonicalId', 'meaning', 'pos', 'quote', 'sourceMaterialId', 'sourceTextSha256', 'start', 'end', 'quoteStart', 'quoteEnd']) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== '') result[field] = row[field];
  }
  return result;
}

// Same explicit canonical ID is a definite repeat. Raw spelling or an indexed
// form is a lead for semantic review, never automatic proof of the same sense.
function inspectCandidates({entries, forms, prior, candidates}) {
  if (!Array.isArray(entries) || !forms || !Array.isArray(prior) || !Array.isArray(candidates)) throw Error('Incomplete audit inputs');
  const index = makeIndex(entries, forms), seen = [], collisions = [], invalid = [], extensions = [];
  function addPrior(row, otherCandidate = false) {
    if (!row || typeof row.word !== 'string' || !normal(row.word)) throw Error('Invalid prior word');
    seen.push({...row, key: normal(row.word), heads: index.keys(row.word), otherCandidate});
  }
  prior.forEach(row => addPrior(row));
  for (const target of candidates) {
    if (!target || typeof target.word !== 'string' || typeof target.canonicalId !== 'string' || !normal(target.word) || !Number.isInteger(target.day)) {
      invalid.push({source: target?.source || 'candidate', day: target?.day ?? null, reason: 'missing target identity'}); continue;
    }
    const key = normal(target.word), id = target.canonicalId, head = target.canonicalWord || target.word;
    if (!/^[a-z]+(?:['-][a-z]+)*$/.test(key)) invalid.push({day: target.day, word: target.word, reason: 'invalid lexical headword spelling'});
    const base = index.byId.get(id), baseForms = base && [base.word, ...(base.spellingVariants || [])].map(normal);
    if (id.startsWith('extension:')) {
      const ext = {day: target.day, word: target.word, canonicalId: id, meaning: target.meaning, pos: target.pos, dictionaryReview: target.dictionaryReview || null};
      extensions.push(ext);
      if (id !== 'extension:' + key || index.byForm.has(key)) invalid.push({day: target.day, word: target.word, reason: 'invalid extension ID or core spelling alias'});
      if (!dictionaryReferenceMatches(target)) invalid.push({day: target.day, word: target.word, reason: 'missing or mismatched claimed dictionary reference, part of speech, meaning, date, or pending listening-review status'});
      const linkedCore = [...new Set(index.indexed(key).flatMap(form => [...(index.byForm.get(normal(form)) || [])]))];
      for (const coreId of linkedCore) collisions.push({classification: 'semantic-review-needed', reason: 'extension-surface-is-indexed-core-inflection', candidate: evidence(target), prior: {source: '8000-core-index', word: index.byId.get(coreId).word, canonicalId: coreId}, indexedHeads: index.indexed(key), dictionaryReview: target.dictionaryReview || null});
    } else if (!base || !baseForms.includes(key) || target.canonicalWord && normal(target.canonicalWord) !== normal(base.word)) {
      invalid.push({day: target.day, word: target.word, reason: 'core ID, canonical word, or spelling variant mismatch'});
    }
    const heads = index.keys(head); for (const h of index.keys(target.word)) heads.add(h);
    for (const old of seen) {
      const sameId = !!old.canonicalId && old.canonicalId === id;
      const shared = [...heads].filter(h => old.heads.has(h));
      if (!sameId && !shared.length) continue;
      const relation = !Number.isInteger(old.day) ? 'unknown' : old.day < target.day ? 'earlier' : old.day === target.day ? 'same-day' : 'later';
      // Previous/future *candidate* units must be cross-checked against one
      // another regardless of input order. A same/future historical timetable
      // is only a planned review, not evidence that this learner saw the word.
      const planned = !old.otherCandidate && (relation === 'same-day' || relation === 'later');
      collisions.push({classification: planned ? 'planned-review' : sameId ? 'definite-repeat' : 'semantic-review-needed',
        reason: planned ? 'same-or-later-prior-course-not-prior-learning' : sameId ? 'same-explicit-canonical-id' : key === old.key ? 'same-surface-sense-unconfirmed' : 'indexed-form-or-spelling-variant',
        courseDayRelation: relation,
        candidate: evidence(target), prior: evidence(old), sharedHeads: shared, dictionaryReview: target.dictionaryReview || null});
    }
    addPrior({...target, source: target.source || 'candidate-family'}, true);
  }
  const definite = collisions.filter(x => x.classification === 'definite-repeat').length;
  const semantic = collisions.filter(x => x.classification === 'semantic-review-needed').length;
  const planned = collisions.filter(x => x.classification === 'planned-review').length;
  return {status: invalid.length || definite ? 'rejected' : semantic ? 'semantic-review-required' : 'screen-clear-only',
    gatePassed: invalid.length === 0 && definite === 0 && semantic === 0,
    scope: 'Lexical collision screen only; dictionary-reference metadata is not checked against the live dictionary and does not approve a source, meaning, audio, content, or release.',
    courseOrderPolicy: 'Earlier published/legacy lessons and all other candidate units can block the screen. Same/later legacy lessons are future review leads, not evidence of past learning. Actual learner history, including skipped-ahead lessons, is checked separately at runtime.',
    limitations: 'The pinned project form index and spelling variants do not cover every possible English form, inflection, homograph, or meaning; an empty collision list is not a proof of lexical or historical uniqueness.',
    candidateCount: candidates.length, priorEntryCount: prior.length, extensionCount: extensions.length,
    counts: {invalid: invalid.length, definiteRepeats: definite, semanticReviewNeeded: semantic, plannedReviewLeads: planned,
      plannedSameDay: collisions.filter(x => x.classification === 'planned-review' && x.courseDayRelation === 'same-day').length,
      plannedLater: collisions.filter(x => x.classification === 'planned-review' && x.courseDayRelation === 'later').length}, invalid, collisions, extensions};
}

function auditProject(root = ROOT) {
  const core = require(path.join(root, 'assets', 'essential-vocabulary-data.js')).entries;
  const data = require(path.join(root, 'assets', 'curriculum-data.js'));
  const forms = readFormIndex(root), materialById = new Map((data.materials || []).map(m => [m.id, m]));
  const prior = [], seenMaterial = new Set();
  function material(day, id, label) {
    const materialKey = `${day}\0${id}`; if (seenMaterial.has(materialKey)) return; seenMaterial.add(materialKey);
    const m = materialById.get(id); if (!m) throw Error(`Missing legacy material ${id}`);
    for (const item of m.vocabulary || []) {
      const row = typeof item === 'string' ? {word: item} : item;
      if (!row?.word) throw Error(`Legacy material ${id} has no word`);
      const source = materialById.get(row.sourceMaterialId), text = source?.skill === 'listening' ? source.transcript : source?.passage;
      const quote = row.sourceQuote || row.example, quoteStart = typeof text === 'string' && quote ? text.indexOf(quote) : -1;
      prior.push({source: `${label}/${id}`, day, word: row.word, canonicalId: row.canonicalId, meaning: row.meaning, pos: row.pos,
        ...(quote ? {quote} : {}), ...(quoteStart >= 0 ? {sourceMaterialId: source.id, sourceTextSha256: sha(text), quoteStart, quoteEnd: quoteStart + quote.length} : {})});
    }
  }
  for (const day of data.days.filter(d => d.day >= 2 && d.day <= 20)) for (const task of day.tasks || []) for (const id of task.materialIds || []) material(day.day, id, 'legacy-scheduled');
  const legacyContext = Object.create(null);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets', 'curriculum-legacy-plans.js'), 'utf8'), legacyContext, {timeout: 5000});
  const plans = legacyContext.IELTSLegacyDayPlans?.days;
  if (!plans) throw Error('Captured legacy plans unavailable');
  for (let day = 2; day <= 20; day++) for (const task of plans[day]?.tasks || []) for (const id of task.materialIds || []) material(day, id, 'legacy-captured');
  for (const expansion of data.lessonExpansions || []) if (expansion.day >= 2 && expansion.day <= 20) for (const id of expansion.materialIds || []) material(expansion.day, id, 'legacy-expansion');
  const published = data.familyLessonRelease?.units;
  if (!Array.isArray(published) || new Set(published.filter(unit => unit.day >= 4 && unit.day <= 10).map(unit => unit.day)).size !== 7) throw Error('Published family days 4–10 unavailable');
  for (const unit of published.filter(unit => unit.day >= 4 && unit.day <= 10)) for (const t of unit.targets || []) prior.push({source: 'published-family', day: unit.day, word: t.canonicalWord, ...t, pos: t.partOfSpeech});
  const candidates = [];
  for (let day = 11; day <= 20; day++) {
    const lesson = read(path.join(root, 'curriculum', 'linked-course-next', `day${day}.json`));
    if (lesson.day !== day || !Array.isArray(lesson.targets) || lesson.targets.length !== 30) throw Error(`Draft day ${day} does not have 30 targets`);
    const reading = lesson.materials?.find(m => m.skill === 'reading'), text = reading?.passage;
    if (typeof text !== 'string') throw Error(`Draft day ${day} reading unavailable`);
    const textHash = sha(text);
    for (const t of lesson.targets) {
      if (typeof t.word !== 'string' || typeof t.quote !== 'string' || ![t.start, t.end, t.quoteStart, t.quoteEnd].every(Number.isInteger) || t.quoteStart < 0 || t.quoteStart > t.start || t.end <= t.start || t.quoteEnd < t.end || t.quoteEnd > text.length || normal(text.slice(t.start, t.end)) !== normal(t.word) || text.slice(t.quoteStart, t.quoteEnd) !== t.quote || t.sourceMaterialId && t.sourceMaterialId !== reading.id || t.sourceTextSha256 && t.sourceTextSha256 !== textHash) throw Error(`Draft day ${day} has an invalid reading binding for ${t.word || '?'}`);
      candidates.push({...t, day, source: 'candidate-family', sourceMaterialId: reading.id, sourceTextSha256: textHash});
    }
  }
  const report = inspectCandidates({entries: core, forms, prior, candidates});
  return {...report, formIndexSha256: FORM_HASH, corpus: 'Legacy scheduled/captured/expansion vocabulary days 2–20; published family days 4–10; candidate family days 11–20.'};
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--summary', '--require-clear'].includes(arg))) { console.error('Usage: node tools/audit-linked-lexeme-collisions.cjs [--summary] [--require-clear]'); process.exitCode = 1; }
  else try {
    const report = auditProject();
    const output = args.includes('--summary') ? (({status, gatePassed, scope, courseOrderPolicy, limitations, candidateCount, priorEntryCount, extensionCount, counts, formIndexSha256, corpus}) => ({status, gatePassed, scope, courseOrderPolicy, limitations, candidateCount, priorEntryCount, extensionCount, counts, formIndexSha256, corpus}))(report) : report;
    console.log(JSON.stringify(output, null, 2));
    if (args.includes('--require-clear') && !report.gatePassed) process.exitCode = 2;
  } catch (error) { console.error(`Lexeme audit failed: ${error.message}`); process.exitCode = 1; }
}
module.exports = {FORM_HASH, readFormIndex, makeIndex, inspectCandidates, auditProject};
