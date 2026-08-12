import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CONSTRUCTION_LIFECYCLE_CONTRACT,
  constructionPlanDigest,
  evaluateConstructionLifecycle,
} from './construction-lifecycle.mjs';

const qualificationFixture = JSON.parse(readFileSync(
  new URL('../../tests/fixtures/construction-qualification/qualified.json', import.meta.url),
  'utf8',
));

const reviewPlan = Object.freeze({
  concepts: [
    {
      slug: 'northstar-commerce',
      kind: 'project',
      title: 'Northstar Commerce',
      body: '# Northstar Commerce\n',
    },
  ],
  relations: [],
  competencyAnswers: {},
});

function qualification(overrides = {}) {
  const packet = structuredClone(qualificationFixture);
  packet.purposeAuthority = {
    outcome: 'Preserve trustworthy commerce decisions.',
    decisions: ['Choose the safe release and handoff boundary.'],
    scope: 'Northstar Commerce product meaning and implementation evidence.',
    nonGoals: ['Claim RDF or OWL conformance.'],
    owners: [{ id: 'human:product-owner', authority: 'human' }],
    sourceRefs: ['docs/product-brief.md'],
  };
  packet.regression = {
    baselineQualificationId: 'qualification:northstar-commerce:v0',
    status: 'passed',
    priorCqIds: packet.competencyQuestions.map(({ id }) => id),
    rerunCqIds: packet.competencyQuestions.map(({ id }) => id),
    evidenceRefs: ['w:regression'],
  };
  packet.subject.graphDigest = constructionPlanDigest(reviewPlan);
  packet.subject.sourceDigest = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  packet.acceptance.planDigest = constructionPlanDigest(reviewPlan);
  packet.acceptance.planRevision = 1;
  packet.acceptance.acceptedGapIds = [];
  return Object.assign(packet, overrides);
}

function evaluate(packet) {
  return evaluateConstructionLifecycle({
    reviewPlan,
    sourceDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    qualification: packet,
  });
}

test('a proposal without lifecycle evidence exposes a non-writing review plan only', () => {
  const result = evaluateConstructionLifecycle({
    reviewPlan,
    sourceDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });

  assert.equal(result.contract, CONSTRUCTION_LIFECYCLE_CONTRACT);
  assert.equal(result.writeEligibility, 'reviewable');
  assert.equal(result.qualificationStatus, 'not_qualified');
  assert.equal(result.firstBlockingPhase, 'purpose_authority');
  assert.deepEqual(result.reviewPlan, reviewPlan);
  assert.equal(result.writePlan, undefined);
  assert.equal(result.phases.length, 8, 'the lifecycle gate must not idle on an empty phase set');
});

test('every visible proposal warning becomes an exact acceptance gap', () => {
  const warning = {
    code: 'visible-competency-gap',
    severity: 'warning',
    path: 'competencyAnswers.impact',
    message: 'Impact remains visible-gap.',
  };
  const preview = evaluateConstructionLifecycle({
    reviewPlan,
    sourceDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    proposalFindings: [warning],
  });
  assert.deepEqual(preview.requiredGapIds, [
    'proposal:visible-competency-gap:competencyAnswers.impact',
  ]);

  const unaccepted = evaluateConstructionLifecycle({
    reviewPlan,
    sourceDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    qualification: qualification(),
    proposalFindings: [warning],
  });
  assert.equal(unaccepted.writeEligibility, 'blocked');
  assert.equal(unaccepted.writePlan, undefined);

  const packet = qualification();
  packet.acceptance.acceptedGapIds = preview.requiredGapIds;
  const accepted = evaluateConstructionLifecycle({
    reviewPlan,
    sourceDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    qualification: packet,
    proposalFindings: [warning],
  });
  assert.equal(accepted.writeEligibility, 'executable');
});

test('mandatory proposal warnings cannot be laundered through human gap acceptance', () => {
  const warning = {
    code: 'risky-competency-evidence',
    severity: 'warning',
    path: 'competencyAnswers.scope.witnesses.evidence[0]',
    message: 'The source needs independent current-state corroboration.',
  };
  const packet = qualification();
  packet.acceptance.acceptedGapIds = [
    `proposal:${warning.code}:${warning.path}`,
  ];
  const result = evaluateConstructionLifecycle({
    reviewPlan,
    sourceDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    qualification: packet,
    proposalFindings: [warning],
  });

  assert.equal(result.writeEligibility, 'blocked');
  assert.equal(result.writePlan, undefined);
  assert.deepEqual(result.requiredGapIds, []);
  assert.ok(result.diagnostics.some(({ code, phase: phaseId }) => (
    code.startsWith('proposal-warning-not-gap-eligible:') && phaseId === 'evidence_reuse'
  )));
});

test('a digest-bound qualified packet releases exactly the reviewed rows', () => {
  const result = evaluate(qualification());

  assert.equal(result.writeEligibility, 'executable');
  assert.equal(result.qualificationStatus, 'qualified');
  assert.equal(result.planDigest, constructionPlanDigest(reviewPlan));
  assert.deepEqual(result.writePlan, reviewPlan);
  assert.notEqual(result.writePlan, reviewPlan, 'the evaluator must not leak a mutable caller object');
  assert.equal(result.phases.find(({ id }) => id === 'prior_cq_regression').status, 'pending_post_write');
});

test('missing purpose authority and prior-CQ regression fail closed', () => {
  const noPurpose = qualification();
  delete noPurpose.purposeAuthority;
  const noRegression = qualification();
  delete noRegression.regression;

  for (const [packet, phase] of [
    [noPurpose, 'purpose_authority'],
    [noRegression, 'prior_cq_regression'],
  ]) {
    const result = evaluate(packet);
    assert.equal(result.writeEligibility, 'blocked');
    assert.equal(result.qualificationStatus, 'invalid');
    assert.equal(result.firstBlockingPhase, phase);
    assert.equal(result.writePlan, undefined);
  }
});

test('maker-only evaluation, missing source-hidden execution, and stale evidence cannot be approved through', () => {
  const makerOnly = qualification();
  makerOnly.actors.evaluator.id = makerOnly.actors.builder.id;
  const notMeasured = qualification();
  notMeasured.sourceHiddenTask.status = 'not_measured';
  const staleEvidence = qualification();
  staleEvidence.witnesses.find(({ id }) => id === 'w:outcome').current = false;

  const mutations = [makerOnly, notMeasured, staleEvidence];
  assert.equal(mutations.length, 3, 'the adversarial census must remain non-empty');
  for (const packet of mutations) {
    const result = evaluate(packet);
    assert.equal(result.writeEligibility, 'blocked');
    assert.equal(result.writePlan, undefined);
  }
});

test('plan or source mutation invalidates a recorded acceptance', () => {
  const planMismatch = qualification();
  planMismatch.acceptance.planDigest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const sourceMismatch = qualification();
  sourceMismatch.subject.sourceDigest = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

  for (const packet of [planMismatch, sourceMismatch]) {
    const result = evaluate(packet);
    assert.equal(result.writeEligibility, 'blocked');
    assert.equal(result.writePlan, undefined);
    assert.ok(result.diagnostics.some(({ code }) => code.includes('digest')));
  }
});

test('only independently measured functional or pragmatic gaps can be accepted without becoming qualified', () => {
  const packet = qualification();
  packet.cqResults[0].status = 'partial';
  packet.cqResults[0].gap = 'The risk boundary remains partial.';
  packet.axisResults.find(({ axis }) => axis === 'functional').status = 'unknown';
  packet.axisResults.find(({ axis }) => axis === 'functional').findingIds = ['gap:functional'];
  packet.diagnostics.push({
    id: 'gap:functional',
    axis: 'functional',
    category: 'evidence',
    message: 'One approved CQ remains partial.',
    evidenceRefs: ['w:outcome'],
  });
  packet.acceptance.acceptedGapIds = ['axis:functional', 'cq:cq:executive-risk'];

  const result = evaluate(packet);
  assert.equal(result.writeEligibility, 'executable');
  assert.equal(result.qualificationStatus, 'not_qualified');
  assert.equal(result.phases.find(({ id }) => id === 'independent_source_hidden').status, 'gap_accepted');
  assert.deepEqual(result.writePlan, reviewPlan);
});

test('unaccepted gaps and mandatory-axis regressions withhold the write plan', () => {
  const unaccepted = qualification();
  unaccepted.cqResults[0].status = 'partial';
  unaccepted.cqResults[0].gap = 'The risk boundary remains partial.';
  unaccepted.axisResults.find(({ axis }) => axis === 'functional').status = 'unknown';
  unaccepted.axisResults.find(({ axis }) => axis === 'functional').findingIds = ['gap:functional'];
  unaccepted.diagnostics.push({
    id: 'gap:functional',
    axis: 'functional',
    category: 'evidence',
    message: 'One approved CQ remains partial.',
    evidenceRefs: ['w:outcome'],
  });
  const regression = qualification();
  regression.regression.status = 'failed';

  for (const packet of [unaccepted, regression]) {
    const result = evaluate(packet);
    assert.equal(result.writeEligibility, 'blocked');
    assert.equal(result.writePlan, undefined);
  }
});
