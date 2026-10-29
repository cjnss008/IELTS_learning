'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const Activation = require('../tools/year-runtime-activation.cjs');
const current = 'curriculum/year-first-use-runtime-contract-v117-vocabulary-response.json';
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');

test('the current build resolves the reviewed daily queue with all existing role paths and unchanged historical contract bytes', () => {
  const actual = Activation.validateRuntimeContract({root});
  assert.equal(actual.sourcePath, current);
  assert.deepEqual(Activation.validateRuntimeContract({root, contractPath: current}).metadata, actual.metadata);
  const previous = JSON.parse(fs.readFileSync(path.join(root, 'curriculum/year-first-use-runtime-contract-v93-family.json'), 'utf8'));
  assert.deepEqual(actual.metadata.components.slice(0, 52).map(({role, path}) => ({role, path})), previous.components.map(({role, path}) => ({role, path})));
  assert.equal(actual.metadata.components.length, 55);
  assert.equal(Activation.REQUIRED_ROLES.length, 51);
  assert.equal(Activation.MAX_COMPONENTS, 52);
  assert.equal(sha('curriculum/year-first-use-runtime-contract.json'), '06272530120956c9ce01fab7288afb3037147be824f63c58ab3cce3ade9baf7d');
  assert.equal(sha('curriculum/year-first-use-runtime-contract-v93-family.json'), 'b6c25de6b6ada3ae69866f0f568146c74298fd8e70e79e0be84e9e0aae40e50a');
  assert.equal(sha('curriculum/year-first-use-runtime-contract-v97-family-lessons.json'), '5d2997e64cad8a9536c20e157ca80ec1ac1c34abc1f7f685312c8fa2a9137c2a');
  assert.equal(sha('curriculum/year-first-use-runtime-contract-v107-broadcast.json'), 'b3cf89eb3f9e4d6fd1d7678d27f829ebce6b59c1c1559ed56760590a0553895b');
});

test('adding this release does not make arbitrary version-like contract paths valid', () => {
  for (const contractPath of [current + '.backup', current.replace(/-v\d+-/, '-v999-'), '../' + current, path.resolve(root, current)]) {
    assert.throws(() => Activation.validateRuntimeContract({root, contractPath}), /Unsupported exact runtime contract path/);
  }
});
