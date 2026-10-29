'use strict';
// The real candidate stays inactive and unsigned. The temporary review markers
// below exist only inside an isolated disposable local test root.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));

module.exports = function simulate({pkg, repo, assessment:A, loader, essential, player}) {
  const work = path.dirname(pkg), realWork = fs.realpathSync(work);
  const tmp = fs.mkdtempSync(path.join(work, 'linked02-03-loader-simulation-'));
  const realTmp = fs.realpathSync(tmp);
  assert(realTmp.startsWith(realWork + path.sep));
  assert(path.basename(realTmp).startsWith('linked02-03-loader-simulation-'));
  const skills = ['vocabulary','grammar','listening','reading','speaking','writing'];
  const base = () => ({materials:[],days:[2,3].map(day => ({day,totalMinutes:360,
    tasks:skills.map(id => ({id,mode:'practice',materialIds:[],minutes:60}))}))});
  const write = (rel, bytes) => {
    const dst = path.join(tmp,...rel.split('/'));
    assert(path.resolve(dst).startsWith(path.resolve(tmp) + path.sep));
    fs.mkdirSync(path.dirname(dst),{recursive:true}); fs.writeFileSync(dst,bytes);
  };
  const sourceRelease = JSON.parse(fs.readFileSync(path.join(pkg,'release.json')));
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(pkg,'provenance/package-manifest.json')));
  const before = base(), beforeText = JSON.stringify(before);
  const inactive = loader.apply(before,{root:pkg,releasePath:'release.json'});
  assert.equal(inactive.active,false); assert.equal(inactive.added,0); assert.equal(JSON.stringify(before),beforeText);
  try {
    // First prove an active copy without a review is rejected, entirely inside tmp.
    const unsigned = copy(sourceRelease); unsigned.active = true;
    write('release.json',JSON.stringify(unsigned,null,2) + '\n');
    assert.throws(() => loader.apply(base(),{root:tmp,releasePath:'release.json',
      assessment:A,essential,player}),/Root review pin required/);

    const simulated = copy(sourceRelease); simulated.active = true;
    const materialHashes = new Map();
    for (const row of simulated.materials) {
      const m = JSON.parse(fs.readFileSync(path.join(pkg,...row.file.split('/'))));
      assert.equal(m.source.verification,'author-draft-pending-independent-review');
      m.source.verification = 'reviewed'; // TEMPORARY STRUCTURAL SIMULATION ONLY
      const bytes = Buffer.from(JSON.stringify(m,null,2) + '\n');
      row.fileSha256 = sha(bytes); row.materialContentHash = A.materialContentHash(m);
      row.questionsSha256 = sha(JSON.stringify(m.questions || []));
      materialHashes.set(m.id,row.materialContentHash); write(row.file,bytes);
    }
    for (const unit of simulated.units) for (const task of unit.tasks) for (const ref of task.materialRefs) {
      ref.contentHash = materialHashes.get(ref.materialId);
    }
    for (const item of sourceManifest.assets) {
      const bytes = fs.readFileSync(path.join(pkg,...item.src.split('/')));
      assert.equal(sha(bytes),item.sha256); write(item.src,bytes);
    }
    const helper = fs.readFileSync(path.join(repo,'assets/family-lesson-expansion-v95.js'));
    assert.equal(sha(helper),'fff72eb8b252bec9d33de32db98159b7b60867f80949b821b5c35ed8e32cfaa6');
    write('assets/family-lesson-expansion-v95.js',helper);
    const payload = {id:simulated.id,policy:simulated.policy,materials:simulated.materials,units:simulated.units};
    const review = {schema:1,simulationOnly:true,notAnApproval:true,releaseId:simulated.id,
      decision:'approved-ordinary-six-module-content',reviewStatus:'root-ai-content-and-binding-reviewed-not-human',
      independentAssessmentEligible:false,targetBindingsReviewed:true,releasePayloadSha256:sha(JSON.stringify(payload)),
      materials:copy(simulated.materials),units:simulated.units.map(u => ({id:u.id,unitPayloadSha256:sha(JSON.stringify(u))}))};
    const reviewBytes = Buffer.from(JSON.stringify(review,null,2) + '\n');
    write('SIMULATION-ONLY-review.json',reviewBytes);
    simulated.rootReview = {file:'SIMULATION-ONLY-review.json',sha256:sha(reviewBytes)};
    write('release.json',JSON.stringify(simulated,null,2) + '\n');
    const data = base(), originalDays = JSON.stringify(data.days);
    const outcome = loader.apply(data,{root:tmp,releasePath:'release.json',assessment:A,essential,player});
    assert.equal(outcome.active,true); assert.equal(outcome.added,20); assert.equal(outcome.units,2);
    assert.equal(data.materials.length,20); assert.equal(JSON.stringify(data.days),originalDays);

    // Tampering with a bound word audio or material in the isolated copy must fail.
    const word = simulated.units[0].targets[0].audioRef;
    const wordPath = path.join(tmp,...word.src.split('/')), savedWord = fs.readFileSync(wordPath), changedWord = Buffer.from(savedWord);
    changedWord[changedWord.length - 1] ^= 1; fs.writeFileSync(wordPath,changedWord);
    assert.throws(() => loader.apply(base(),{root:tmp,releasePath:'release.json',assessment:A,essential,player}));
    fs.writeFileSync(wordPath,savedWord);
    const materialPath = path.join(tmp,...simulated.materials[0].file.split('/'));
    const savedMaterial = fs.readFileSync(materialPath), changedMaterial = JSON.parse(savedMaterial);
    changedMaterial.title += ' SIMULATION-TAMPER'; fs.writeFileSync(materialPath,JSON.stringify(changedMaterial,null,2) + '\n');
    assert.throws(() => loader.apply(base(),{root:tmp,releasePath:'release.json',assessment:A,essential,player}));
    fs.writeFileSync(materialPath,savedMaterial);
    return {scope:'isolated synthetic root; review and reviewed flags are fabricated solely for structural testing',
      approval:false,base:'two synthetic lessons with no learner records',
      inactiveCandidate:{active:inactive.active,added:inactive.added,unchanged:JSON.stringify(before)===beforeText},
      unsignedActiveRejected:true,temporarySimulatedLoader:{added:outcome.added,units:outcome.units,
        syntheticDaysUnchanged:JSON.stringify(data.days)===originalDays},
      wordAudioTamperRejected:true,materialTamperRejected:true};
  } finally {
    // The recursively removed path is the verified private directory created above.
    assert.equal(fs.realpathSync(tmp),realTmp);
    assert(realTmp.startsWith(realWork + path.sep));
    assert(path.basename(realTmp).startsWith('linked02-03-loader-simulation-'));
    fs.rmSync(realTmp,{recursive:true,force:false});
  }
};
