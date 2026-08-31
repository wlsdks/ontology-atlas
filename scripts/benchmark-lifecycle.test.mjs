import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CASES,
  MODES,
  OUTPUT_SCHEMA,
  TASKS,
  benchmarkPlan,
  buildCodexConfig,
  classifyEvidence,
  parseTranscriptAnswer,
  readPublishedCoverage,
  regradeRun,
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

test('required evidence is classified by what an arm could possibly write', () => {
  assert.equal(classifyEvidence('domains/purchase'), 'vocabulary');
  assert.equal(classifyEvidence('capabilities/checkout'), 'vocabulary');
  assert.equal(classifyEvidence('elements/policy-package'), 'vocabulary');
  assert.equal(classifyEvidence('src/features/checkout/index.ts'), 'path');
  assert.equal(classifyEvidence('packages/realtime'), 'path');
  assert.equal(classifyEvidence('excludes'), 'phrase');
});

test('definitions prove the classification instead of trusting the label', () => {
  // validateDefinitions asserts that every vocabulary token is a slug in that
  // subject's prepared vault and is absent from the fixture tree. Without that,
  // "a control arm cannot score this token" would be an assumption.
  assert.deepEqual(validateDefinitions(), []);
  for (const entry of CASES) {
    const slugs = new Set(entry.nodes.map((node) => node.slug));
    for (const task of TASKS[entry.id]) {
      for (const token of task.required) {
        if (classifyEvidence(token) === 'vocabulary') assert.ok(slugs.has(token), `${token} must be a vault slug`);
        else assert.ok(!slugs.has(token), `${token} must not be a vault slug`);
      }
    }
  }
});

test('scoring separates the comparable half from the vault-only half', () => {
  const task = TASKS.greenfield[1];
  const controlShaped = {
    // What a control arm can reach: the source path and the boundary in its own
    // words. It names no canonical slug because no vault exists to name one.
    answer: 'Inventory reconciliation stays in Inventory; checkout only confirms a reviewed cart. It is explicitly outside checkout because stock trust is maintained elsewhere.',
    evidence: ['src/features/inventory-sync/index.ts'],
    nextAction: 'Read the inventory sync entrypoint.',
    unknowns: ['runtime behavior is unknown'],
  };
  const control = scoreFinalAnswer(controlShaped, task);
  assert.equal(control.vocabularyCoverage, 0);
  assert.equal(control.comparableCoverage, 0.5);
  assert.equal(control.breakdown.path.coverage, 1);
  assert.equal(control.breakdown.phrase.coverage, 0, 'stating the boundary in other words scores zero on the literal phrase');

  const vaultShaped = scoreFinalAnswer({
    ...controlShaped,
    evidence: ['capabilities/checkout', 'capabilities/inventory-sync', 'src/features/inventory-sync/index.ts', 'checkout excludes reconciliation'],
  }, task);
  assert.equal(vaultShaped.vocabularyCoverage, 1);
  assert.equal(vaultShaped.comparableCoverage, 1);
  assert.equal(vaultShaped.coverage, 1);
});

test('the blended score stays byte-compatible with published runs', () => {
  const task = TASKS.greenfield[0];
  const grade = scoreFinalAnswer({
    answer: 'Purchase owns it.',
    evidence: ['src/features/checkout/index.ts'],
    nextAction: 'Read it.',
    unknowns: ['unmeasured'],
  }, task);
  // 1 of 4 required tokens, which is the published greenfield control average.
  assert.equal(grade.coverage, 0.25);
  assert.equal(grade.pass, false);
});

test('re-grading reads the saved stdout answer, never the reasoning log', () => {
  const answer = { answer: 'a', evidence: ['b'], nextAction: 'c', unknowns: ['d'] };
  const transcript = `${JSON.stringify(answer)}\n\n[stderr]\n{"answer":"log noise"}\nmcp: ontology-atlas/get_concepts (completed)`;
  const parsed = parseTranscriptAnswer(transcript);
  assert.deepEqual(parsed.value, answer);
  assert.equal(parsed.error, null);

  const broken = parseTranscriptAnswer('not json\n[stderr]\nlog');
  assert.equal(broken.value, null);
  assert.match(broken.error, /JSON/i);
});

test('a re-grade recovers the published coverage so it cannot silently score other answers', () => {
  const published = readPublishedCoverage([
    '| Subject | Arm | Cells | Content passes | Usable cells | Required coverage |',
    '| greenfield | off | 6 | 0 | 6 | 0.25 |',
    '| greenfield | on | 6 | 4 | 6 | 0.875 |',
  ].join('\n'));
  assert.equal(published.get('greenfield:off'), 0.25);
  assert.equal(published.get('greenfield:on'), 0.875);
});

test('re-grading a saved matrix reports arm integrity without spawning Codex', () => {
  const root = mkdtempSync(join(tmpdir(), 'lifecycle-regrade-'));
  try {
    const answer = {
      answer: 'domains/purchase owns it through capabilities/checkout and capabilities/inventory-sync.',
      evidence: ['src/features/checkout/index.ts'],
      nextAction: 'Read the entrypoint.',
      unknowns: ['unmeasured'],
    };
    // The control transcript carries MCP traffic, which is the exact defect an
    // earlier round hid: a control arm that silently held the treatment.
    writeFileSync(join(root, 'run-greenfield-G1-off-r1.txt'), `${JSON.stringify(answer)}\n\n[stderr]\nmcp: ontology-atlas/get_concepts (completed)\n`, 'utf8');
    writeFileSync(join(root, 'run-greenfield-G1-on-r1.txt'), `${JSON.stringify(answer)}\n\n[stderr]\nmcp: ontology-atlas/get_concepts (completed)\n`, 'utf8');
    const { rows, summary, reproduction } = regradeRun({ runId: 'run', outputRoot: root });
    assert.equal(rows.length, 2);
    const off = rows.find((row) => row.mode === 'off');
    assert.equal(off.integrity.passed, false, 'a control transcript carrying MCP traffic is a leaked arm');
    assert.equal(off.usable, false);
    assert.equal(rows.find((row) => row.mode === 'on').integrity.passed, true);
    assert.equal(off.grade.coverage, 1);
    assert.equal(summary.arms.length, 4);
    assert.ok(reproduction.every((row) => row.reproduced === null), 'no published summary beside the transcripts');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
