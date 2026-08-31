import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASES,
  MODES,
  OUTPUT_SCHEMA,
  TASKS,
  benchmarkPlan,
  buildCodexConfig,
  scoreFinalAnswer,
  validateDefinitions,
} from './benchmark-lifecycle.mjs';

test('lifecycle benchmark definitions cover paired greenfield and brownfield subjects', () => {
  assert.deepEqual(CASES.map(({ id }) => id), ['greenfield', 'brownfield']);
  assert.deepEqual(MODES, ['off', 'on']);
  assert.deepEqual(Object.keys(TASKS), ['greenfield', 'brownfield']);
  assert.deepEqual(validateDefinitions(), []);
  assert.equal(benchmarkPlan({ repeat: 3 }).length, 24);
});

test('the Atlas arm is scoped to a temporary subject and never needs global config', () => {
  const config = buildCodexConfig({
    vaultRoot: '/tmp/subject/atlas',
    repoRoot: '/tmp/subject',
    serverPath: '/checkout/mcp/src/index.js',
  });
  assert.match(config, /mcp_servers\.ontology-atlas/);
  assert.match(config, /OATLAS_VAULT = "/);
  assert.match(config, /OATLAS_REPO_ROOT = "/);
  assert.doesNotMatch(config, /codex mcp (add|remove)/);
  assert.doesNotMatch(config, /mcp_servers\.chrome-devtools/);
});

test('machine scoring reads only the final structured answer, not transcript evidence', () => {
  const task = TASKS.greenfield[0];
  const good = {
    answer: 'The purchase domain owns checkout and it touches inventory sync; unknown runtime behavior remains unmeasured.',
    evidence: [
      'domains/purchase',
      'capabilities/checkout',
      'capabilities/inventory-sync',
      'src/features/checkout/index.ts',
    ],
    nextAction: 'Read the checkout path first.',
    unknowns: ['runtime behavior is unmeasured'],
  };
  const grade = scoreFinalAnswer(good, task);
  assert.equal(grade.pass, true);
  assert.equal(grade.coverage, 1);

  const transcriptOnly = scoreFinalAnswer({
    answer: 'I could not inspect the repository.',
    evidence: [],
    nextAction: '',
    unknowns: [],
  }, task);
  assert.equal(transcriptOnly.pass, false);
  assert.equal(transcriptOnly.required.matched, 0);

  const schemaDrift = scoreFinalAnswer({
    answer: good.answer,
    evidence: good.evidence,
    nextAction: good.nextAction,
    unknowns: 'not-an-array',
  }, task);
  assert.equal(schemaDrift.valid, false);
  assert.equal(schemaDrift.pass, false);
});

test('output schema is strict and keeps unknowns explicit', () => {
  assert.equal(OUTPUT_SCHEMA.additionalProperties, false);
  assert.deepEqual(OUTPUT_SCHEMA.required, ['answer', 'evidence', 'nextAction', 'unknowns']);
  assert.equal(OUTPUT_SCHEMA.properties.unknowns.type, 'array');
});
