import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONSTRUCTION_QUALIFICATION_AUDIENCES,
  CONSTRUCTION_QUALIFICATION_CONTRACT,
  CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA,
  CONSTRUCTION_QUALIFICATION_REQUIRED_AUDIENCES,
  CONSTRUCTION_QUALITY_AXES,
  FDE_AUDIENCE_AUTHORITY_DECISION,
  FDE_AUDIENCE_AUTHORITY_WITNESS_KIND,
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

test('the fixture exercises every required audience and independent quality axis', () => {
  assert.deepEqual(
    [...CONSTRUCTION_QUALIFICATION_REQUIRED_AUDIENCES].sort(),
    ['agent', 'employee', 'executive'],
  );
  assert.ok(CONSTRUCTION_QUALIFICATION_AUDIENCES.includes('fde'));
  assert.deepEqual(
    [...new Set(fixture.scenarios.map(({ audience }) => audience))].sort(),
    ['agent', 'employee', 'executive'],
  );
  assert.deepEqual(
    fixture.axisResults.map(({ axis }) => axis).sort(),
    [...CONSTRUCTION_QUALITY_AXES].sort(),
  );
  assert.ok(fixture.competencyQuestions.length >= 4);
  assert.equal(CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA.properties.scenarios.minItems, 4);
  assert.equal(CONSTRUCTION_QUALIFICATION_INPUT_SCHEMA.properties.competencyQuestions.minItems, 4);
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

function withAuthorizedFde(packet = clone()) {
  const scenario = packet.scenarios.find(({ id }) => id === 'scenario:agent-impact');
  const question = packet.competencyQuestions.find(({ id }) => id === 'cq:agent-impact');
  const result = packet.cqResults.find(({ cqId }) => cqId === 'cq:agent-impact');
  const claim = packet.claims.find(({ id }) => id === 'claim:agent-impact');
  scenario.audience = 'fde';
  question.audience = 'fde';
  packet.purposeAuthority.decisions.push(FDE_AUDIENCE_AUTHORITY_DECISION);
  packet.purposeAuthority.owners.push({
    id: question.owner.id,
    authority: 'human',
  });
  question.requiredWitnessKinds.push(FDE_AUDIENCE_AUTHORITY_WITNESS_KIND);
  packet.witnesses.push({
    id: 'w:fde-authority',
    kind: FDE_AUDIENCE_AUTHORITY_WITNESS_KIND,
    current: true,
    provenance: {
      sourceRef: 'docs/product-brief.md',
      digest: 'sha256:abababababababababababababababababababababababababababababababab',
    },
  });
  result.witnessRefs.push('w:fde-authority');
  for (const target of result.targetResults) target.witnessRefs.push('w:fde-authority');
  claim.witnessRefs.push('w:fde-authority');
  packet.citationChecks.push({
    claimId: claim.id,
    witnessRef: 'w:fde-authority',
    status: 'verified',
  });
  return packet;
}

test('FDE is optional and requires exact current project-owned audience authority when used', () => {
  assert.equal(evaluateConstructionQualification(fixture).status, 'qualified');

  const authorized = withAuthorizedFde();
  assert.equal(evaluateConstructionQualification(authorized).status, 'qualified');

  const missingAuthorityDecision = withAuthorizedFde();
  missingAuthorityDecision.purposeAuthority.decisions = missingAuthorityDecision
    .purposeAuthority.decisions.filter((decision) => decision !== FDE_AUDIENCE_AUTHORITY_DECISION);

  const ownerOutsideProject = withAuthorizedFde();
  const outsideQuestion = ownerOutsideProject.competencyQuestions
    .find(({ id }) => id === 'cq:agent-impact');
  outsideQuestion.owner.id = 'human:outside-project';
  outsideQuestion.revision.approvedBy = 'human:outside-project';

  const missingWitnessRequirement = withAuthorizedFde();
  missingWitnessRequirement.competencyQuestions
    .find(({ id }) => id === 'cq:agent-impact')
    .requiredWitnessKinds = ['relation', 'path', 'validation'];

  const sourceOutsideProject = withAuthorizedFde();
  sourceOutsideProject.witnesses
    .find(({ id }) => id === 'w:fde-authority')
    .provenance.sourceRef = 'docs/outside-project-claim.md';

  const missingCarry = withAuthorizedFde();
  const missingCarryResult = missingCarry.cqResults.find(
    ({ cqId }) => cqId === 'cq:agent-impact',
  );
  missingCarryResult.witnessRefs = missingCarryResult.witnessRefs.filter(
    (ref) => ref !== 'w:fde-authority',
  );
  for (const target of missingCarryResult.targetResults) {
    target.witnessRefs = target.witnessRefs.filter((ref) => ref !== 'w:fde-authority');
  }

  const staleAuthority = withAuthorizedFde();
  staleAuthority.witnesses.find(({ id }) => id === 'w:fde-authority').current = false;

  const claimDoesNotCarry = withAuthorizedFde();
  claimDoesNotCarry.claims
    .find(({ id }) => id === 'claim:agent-impact')
    .witnessRefs = ['w:agent-impact-relation', 'w:agent-impact-path', 'w:validation'];

  const authorityCitationMissing = withAuthorizedFde();
  authorityCitationMissing.citationChecks = authorityCitationMissing.citationChecks.filter(
    ({ witnessRef }) => witnessRef !== 'w:fde-authority',
  );

  const mutations = [
    [missingAuthorityDecision, 'fde-audience-authority-decision-missing'],
    [ownerOutsideProject, 'fde-audience-authority-owner-unbound'],
    [missingWitnessRequirement, 'fde-audience-authority-not-required'],
    [sourceOutsideProject, 'fde-audience-authority-source-unbound'],
    [missingCarry, 'fde-audience-authority-not-carried'],
    [staleAuthority, 'fde-audience-authority-not-current'],
    [claimDoesNotCarry, 'fde-audience-authority-claim-missing'],
    [authorityCitationMissing, 'fde-audience-authority-citation-missing'],
  ];
  assert.equal(mutations.length, 8, 'the FDE authority gate probe must stay non-idle');
  for (const [packet, code] of mutations) {
    const evaluated = evaluateConstructionQualification(packet);
    assert.notEqual(evaluated.status, 'qualified');
    assert.ok(evaluated.findings.some((finding) => finding.code === code), code);
  }
});

test('executive, employee, and agent remain required even though FDE is optional', () => {
  for (const audience of ['executive', 'employee', 'agent']) {
    const packet = clone();
    packet.scenarios = packet.scenarios.filter((row) => row.audience !== audience);
    const evaluated = evaluateConstructionQualification(packet);
    assert.ok(evaluated.findings.some(
      ({ code, message }) => code === 'missing-audience-scenario' && message.includes(audience),
    ));
  }
});

test('the direct evaluator preserves the four-case breadth floor outside transport validation', () => {
  const packet = clone();
  packet.scenarios = packet.scenarios.filter(({ id }) => id !== 'scenario:agent-next-action');
  packet.competencyQuestions = packet.competencyQuestions.filter(
    ({ id }) => id !== 'cq:agent-next-action',
  );
  packet.cqResults = packet.cqResults.filter(
    ({ cqId }) => cqId !== 'cq:agent-next-action',
  );
  packet.claims = packet.claims.filter(({ id }) => id !== 'claim:agent');
  packet.citationChecks = packet.citationChecks.filter(
    ({ claimId }) => claimId !== 'claim:agent',
  );
  packet.sourceHiddenTask.claimIds = packet.sourceHiddenTask.claimIds.filter(
    (id) => id !== 'claim:agent',
  );
  packet.regression.priorCqIds = packet.regression.priorCqIds.filter(
    (id) => id !== 'cq:agent-next-action',
  );
  packet.regression.rerunCqIds = packet.regression.rerunCqIds.filter(
    (id) => id !== 'cq:agent-next-action',
  );

  const evaluated = evaluateConstructionQualification(packet);
  assert.notEqual(evaluated.status, 'qualified');
  assert.deepEqual(
    evaluated.findings
      .filter(({ code }) => code.startsWith('insufficient-'))
      .map(({ code }) => code)
      .sort(),
    ['insufficient-competency-questions', 'insufficient-cq-results', 'insufficient-scenarios'],
  );
});

test('purpose authority, prior-CQ regression, and exact plan acceptance are required lifecycle artifacts', () => {
  const missingPurpose = structuredClone(fixture);
  delete missingPurpose.purposeAuthority;
  const missingRegression = structuredClone(fixture);
  delete missingRegression.regression;
  const unboundAcceptance = structuredClone(fixture);
  delete unboundAcceptance.acceptance.planDigest;
  delete unboundAcceptance.acceptance.planRevision;
  delete unboundAcceptance.acceptance.acceptedGapIds;

  const mutations = [missingPurpose, missingRegression, unboundAcceptance];
  assert.equal(mutations.length, 3, 'the lifecycle artifact census must remain non-empty');
  for (const packet of mutations) {
    const result = evaluateConstructionQualification(packet);
    assert.equal(result.status, 'invalid');
  }
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
