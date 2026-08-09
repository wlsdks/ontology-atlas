import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONSTRUCTION_QUALIFICATION_AUDIENCES,
  CONSTRUCTION_QUALIFICATION_CONTRACT,
  CONSTRUCTION_QUALITY_AXES,
  evaluateConstructionQualification,
} from './construction-qualification.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  '../../tests/fixtures/construction-qualification/qualified.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

function clone(value = fixture) {
  return structuredClone(value);
}

test('the fixture exercises every audience and independent quality axis', () => {
  assert.deepEqual(
    [...new Set(fixture.scenarios.map(({ audience }) => audience))].sort(),
    [...CONSTRUCTION_QUALIFICATION_AUDIENCES].sort(),
  );
  assert.deepEqual(
    fixture.axisResults.map(({ axis }) => axis).sort(),
    [...CONSTRUCTION_QUALITY_AXES].sort(),
  );
  assert.ok(fixture.competencyQuestions.length >= CONSTRUCTION_QUALIFICATION_AUDIENCES.length);
  assert.ok(fixture.claims.length > 0);
  assert.ok(fixture.witnesses.length > 0);
});

test('a complete independently evaluated packet qualifies without an aggregate score', () => {
  const result = evaluateConstructionQualification(fixture);

  assert.equal(result.contract, CONSTRUCTION_QUALIFICATION_CONTRACT);
  assert.equal(result.status, 'qualified');
  assert.equal(result.findings.length, 0);
  assert.equal('overallScore' in result, false);
  assert.equal('score' in result, false);
  assert.ok(Object.values(result.axes).every(({ status }) => status === 'passed'));
  assert.ok(result.competencyQuestions.every(({ status }) => status === 'passed'));
  assert.deepEqual(result.claimLedger, {
    counts: { supported: 4, partial: 0, unsupported: 0, conflict: 0 },
    citationChecks: { verified: 4, mismatch: 0, missing: 0 },
  });
  assert.deepEqual(result.resourceUse, fixture.resourceUse);
  assert.deepEqual(result.metrics, {
    claimAccuracy: { correct: 4, total: 4, rate: 1 },
    citationAccuracy: { correct: 4, total: 4, rate: 1 },
    resourceUse: fixture.resourceUse,
  });
});

test('one failed quality axis stays red even when every other axis passes', () => {
  const packet = clone();
  const semantic = packet.axisResults.find(({ axis }) => axis === 'semantic');
  semantic.status = 'failed';
  semantic.findingIds = ['finding:semantic-boundary'];
  packet.diagnostics.push({
    id: 'finding:semantic-boundary',
    axis: 'semantic',
    category: 'evidence',
    message: 'A boundary claim lacks a counterexample-backed source.',
    evidenceRefs: ['w:boundary'],
  });

  const result = evaluateConstructionQualification(packet);

  assert.equal(result.status, 'not_qualified');
  assert.equal(result.axes.semantic.status, 'failed');
  assert.ok(Object.values(result.axes).filter(({ status }) => status === 'passed').length >= 6);
  assert.equal('overallScore' in result, false);
});

test('each-quantified CQ reports uncovered targets instead of averaging coverage', () => {
  const packet = clone();
  const row = packet.cqResults.find(({ cqId }) => cqId === 'cq:employee-process');
  row.targetResults = row.targetResults.filter(({ target }) => target === 'role:operator');
  row.coveredTargets = ['role:operator', 'process:handoff'];
  row.status = 'answered';
  packet.axisResults.find(({ axis }) => axis === 'functional').status = 'failed';
  packet.axisResults.find(({ axis }) => axis === 'functional').findingIds = [
    'finding:employee-process-gap',
  ];
  packet.diagnostics.push({
    id: 'finding:employee-process-gap',
    axis: 'functional',
    category: 'prompt',
    message: 'The evaluator answered only one of two required process targets.',
    evidenceRefs: ['w:employee-role'],
  });

  const result = evaluateConstructionQualification(packet);
  const cq = result.competencyQuestions.find(({ id }) => id === row.cqId);

  assert.equal(result.status, 'not_qualified');
  assert.equal(cq.status, 'failed');
  assert.deepEqual(cq.uncoveredTargets, ['process:handoff']);
  assert.equal(result.axes.functional.status, 'failed');
});

test('honest unknown and refusal remain visible and cannot qualify', () => {
  const packet = clone();
  const row = packet.cqResults.find(({ cqId }) => cqId === 'cq:agent-next-action');
  row.status = 'unknown';
  row.targetResults = [];
  row.gap = 'The source-hidden packet does not contain a current verification receipt.';
  packet.axisResults.find(({ axis }) => axis === 'functional').status = 'unknown';
  packet.axisResults.find(({ axis }) => axis === 'functional').findingIds = [
    'finding:agent-currentness-unknown',
  ];
  packet.diagnostics.push({
    id: 'finding:agent-currentness-unknown',
    axis: 'functional',
    category: 'evidence',
    message: row.gap,
    evidenceRefs: ['w:source-hidden-task'],
  });

  const result = evaluateConstructionQualification(packet);
  const cq = result.competencyQuestions.find(({ id }) => id === row.cqId);

  assert.equal(result.status, 'not_qualified');
  assert.equal(cq.status, 'unknown');
  assert.equal(cq.gap, row.gap);
  assert.equal(result.axes.functional.status, 'unknown');

  row.status = 'refused';
  const refused = evaluateConstructionQualification(packet);
  assert.equal(
    refused.competencyQuestions.find(({ id }) => id === row.cqId).status,
    'refused',
  );
});

test('unsupported claims fail evidence/provenance even when the submitted axis says passed', () => {
  const packet = clone();
  packet.claims[0].status = 'unsupported';
  packet.claims[0].witnessRefs = [];
  packet.citationChecks[0].status = 'missing';
  packet.citationChecks[0].witnessRef = null;

  const result = evaluateConstructionQualification(packet);

  assert.equal(result.status, 'not_qualified');
  assert.equal(result.axes.evidence_provenance.status, 'failed');
  assert.deepEqual(result.claimLedger.counts, {
    supported: 3,
    partial: 0,
    unsupported: 1,
    conflict: 0,
  });
  assert.deepEqual(result.claimLedger.citationChecks, {
    verified: 3,
    mismatch: 0,
    missing: 1,
  });
  assert.deepEqual(result.metrics.claimAccuracy, { correct: 3, total: 4, rate: 0.75 });
  assert.deepEqual(result.metrics.citationAccuracy, { correct: 3, total: 4, rate: 0.75 });
});

test('stale witnesses and missing claim citation checks cannot hide behind passed input axes', () => {
  const stale = clone();
  stale.witnesses.find(({ id }) => id === 'w:outcome').current = false;
  const staleResult = evaluateConstructionQualification(stale);
  assert.equal(staleResult.status, 'not_qualified');
  assert.equal(staleResult.axes.evidence_provenance.status, 'failed');
  assert.deepEqual(staleResult.metrics.claimAccuracy, { correct: 3, total: 4, rate: 0.75 });

  const missing = clone();
  missing.citationChecks = missing.citationChecks.filter(
    ({ claimId }) => claimId !== 'claim:employee',
  );
  const missingResult = evaluateConstructionQualification(missing);
  assert.equal(missingResult.status, 'not_qualified');
  assert.equal(missingResult.axes.evidence_provenance.status, 'failed');
  assert.ok(missingResult.findings.some(({ code }) => code === 'missing-claim-citation-check'));
  assert.deepEqual(
    missingResult.metrics.citationAccuracy,
    { correct: 3, total: 4, rate: 0.75 },
  );

  const staleAxis = clone();
  staleAxis.witnesses.find(({ id }) => id === 'w:round-trip').current = false;
  const staleAxisResult = evaluateConstructionQualification(staleAxis);
  assert.equal(staleAxisResult.status, 'not_qualified');
  assert.equal(staleAxisResult.axes.interoperability.status, 'failed');
  assert.ok(staleAxisResult.axes.interoperability.diagnostics.some(
    ({ id }) => id === 'derived:interoperability:stale-evidence',
  ));
});

test('citation checks cannot substitute an unrelated witness from another claim', () => {
  const packet = clone();
  packet.citationChecks[0].witnessRef = 'w:employee-process';

  const result = evaluateConstructionQualification(packet);

  assert.equal(result.status, 'invalid');
  assert.ok(result.findings.some(({ code }) => code === 'citation-outside-claim'));
});

test('a passing source-hidden task must evaluate the complete claim ledger', () => {
  const packet = clone();
  packet.sourceHiddenTask.claimIds = packet.sourceHiddenTask.claimIds.slice(0, -1);

  const result = evaluateConstructionQualification(packet);

  assert.equal(result.status, 'not_qualified');
  assert.equal(result.axes.pragmatic.status, 'failed');
  assert.ok(result.findings.some(
    ({ code }) => code === 'incomplete-source-hidden-claim-coverage',
  ));
});

test('maker self-evaluation and non-human CQ approval fail closed as invalid input', () => {
  const selfEvaluated = clone();
  selfEvaluated.actors.evaluator.id = selfEvaluated.actors.builder.id;
  selfEvaluated.sourceHiddenTask.evaluatorId = selfEvaluated.actors.builder.id;
  const selfEvaluatedResult = evaluateConstructionQualification(selfEvaluated);
  assert.equal(selfEvaluatedResult.status, 'invalid');
  assert.ok(selfEvaluatedResult.findings.some(({ code }) => code === 'maker-self-evaluation'));

  const machineApproved = clone();
  machineApproved.competencyQuestions[0].owner.authority = 'agent';
  const result = evaluateConstructionQualification(machineApproved);
  assert.equal(result.status, 'invalid');
  assert.ok(result.findings.some(({ code }) => code === 'cq-owner-not-human'));
});

test('source-hidden witness provenance rejects private absolute paths', () => {
  const packet = clone();
  packet.witnesses[0].provenance.sourceRef = '/Users/private/source/product.md';

  const result = evaluateConstructionQualification(packet);

  assert.equal(result.status, 'invalid');
  assert.ok(result.findings.some(({ code }) => code === 'invalid-witness'));
});

test('every non-passing axis needs an explicit evidence/prompt/ui/missing-primitive diagnosis', () => {
  const packet = clone();
  packet.axisResults.find(({ axis }) => axis === 'pragmatic').status = 'not_measured';

  const result = evaluateConstructionQualification(packet);

  assert.equal(result.status, 'invalid');
  assert.ok(result.findings.some(({ code }) => code === 'unclassified-quality-axis'));
});
