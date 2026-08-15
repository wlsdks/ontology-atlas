import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateQ17Qualification,
  proposalClaimRefs,
  q17ArtifactDigest,
} from './q17-qualification.mjs';

const SOURCE_DIGEST = `sha256:${'b'.repeat(64)}`;

function proposal() {
  return {
    project: { slug: 'projects/commerce-core' },
    domains: [{ slug: 'domains/checkout' }],
    capabilities: [{ slug: 'capabilities/place-order' }],
    elements: [{ slug: 'elements/order-handler' }],
    relations: [{
      from: 'capabilities/place-order',
      to: 'elements/order-handler',
      type: 'elements',
    }],
    competencyAnswers: { scope: {}, impact: {} },
  };
}

function reviewPlanFrom(proposed) {
  return {
    concepts: [
      { slug: proposed.project.slug, kind: 'project', body: '## Definition\n\nCommerce.' },
      { slug: proposed.domains[0].slug, kind: 'domain', body: '## Definition\n\nCheckout.' },
      { slug: proposed.capabilities[0].slug, kind: 'capability', body: '## Definition\n\nPlace orders.' },
      { slug: proposed.elements[0].slug, kind: 'element', body: '## Definition\n\nOrder handler.' },
    ],
    relations: structuredClone(proposed.relations),
    competencyAnswers: structuredClone(proposed.competencyAnswers),
  };
}

function analysisFor(plan) {
  const claims = proposalClaimRefs(plan).map((ref) => ({
    ref,
    confidence: 0.7,
    status: 'supported',
    evidenceRefs: ['README.md'],
  }));
  return {
    claims,
    relationWitnesses: plan.relations.map((relation) => ({
      ref: proposalClaimRefs({ concepts: [], relations: [relation], competencyAnswers: {} })[0],
      from: relation.from,
      to: relation.to,
      type: relation.type,
      supported: true,
    })),
    proposalValidation: {
      canWrite: false,
      constructionLifecycle: {
        qualificationStatus: 'not_qualified',
        writeEligibility: 'reviewable',
        admission: { tier: 'human_review_required' },
      },
    },
  };
}

function artifact() {
  const proposed = proposal();
  const reviewPlan = reviewPlanFrom(proposed);
  const analysis = analysisFor(reviewPlan);
  const payload = { proposal: proposed, analysis, reviewPlan, sourceDigest: SOURCE_DIGEST };
  return {
    ...payload,
    proposalDigest: q17ArtifactDigest(proposed),
    analysisDigest: q17ArtifactDigest(analysis),
    reviewPlanDigest: q17ArtifactDigest(reviewPlan),
    artifactDigest: q17ArtifactDigest(payload),
  };
}

function sourceHiddenFor(name, artifactPacket) {
  const answers = Array.from({ length: 20 }, (_, index) => ({
    id: `cq${String(index + 1).padStart(2, '0')}`,
    status: 'answered',
    evidenceRefs: ['README.md'],
  }));
  const packet = {
    artifact: name,
    proposalDigest: artifactPacket.proposalDigest,
    reviewPlanDigest: artifactPacket.reviewPlanDigest,
    sourceDigest: artifactPacket.sourceDigest,
    evaluationStatus: 'measured',
    qualificationStatus: 'measured',
    sourceAccess: false,
    packetKind: 'independent-persisted-vault',
    canWrite: false,
    answers,
    claimRefs: proposalClaimRefs(artifactPacket.reviewPlan),
  };
  return { ...packet, packetDigest: q17ArtifactDigest(packet) };
}

function citationAuditFor(name, artifactPacket) {
  const entries = artifactPacket.analysis.claims.map(({ ref }) => ({
    claimRef: ref,
    citation: 'README.md',
    pathExists: true,
    supportsClaim: true,
  }));
  const packet = {
    artifact: name,
    proposalDigest: artifactPacket.proposalDigest,
    reviewPlanDigest: artifactPacket.reviewPlanDigest,
    sourceDigest: artifactPacket.sourceDigest,
    entries,
  };
  return { ...packet, packetDigest: q17ArtifactDigest(packet) };
}

function metricSet(falseNegativeCount) {
  return {
    concept: { precision: 0.9, recall: 0.85, falseNegativeCount },
    meaning: { definitionCoverage: 1, boundaryCoverage: 1 },
    relations: { precision: 1, directionErrorCount: 0 },
    citations: { pathAccuracy: 1, supportAccuracy: 1, recall: 1 },
    sourceHidden: { completeCount: 16, questionCount: 20 },
    hallucination: { unsupportedPresentedAsFact: 0 },
    determinism: { runs: 3, identical: 3 },
    performance: {
      nodeMajor: 24,
      runs: 5,
      medianMs: 1_000,
      maxMs: 2_000,
      peakRssBytes: 128 * 1024 * 1024,
    },
  };
}

function qualificationPacket() {
  const baseline = artifact();
  const current = artifact();
  const packet = {
    contract: 'atlasQ17Qualification:v1',
    sourceHidden: true,
    canWrite: false,
    baseline,
    current,
    citationAudit: {
      baseline: citationAuditFor('baseline', baseline),
      current: citationAuditFor('current', current),
    },
    sourceHiddenEvidence: {
      baseline: sourceHiddenFor('baseline', baseline),
      current: sourceHiddenFor('current', current),
    },
    metrics: {
      baseline: metricSet(2),
      current: metricSet(1),
      improvements: [{
        axis: 'concept',
        measure: 'falseNegativeCount',
        baseline: 2,
        current: 1,
      }],
    },
  };
  packet.metrics.current.determinism.digests = [
    current.artifactDigest,
    current.artifactDigest,
    current.artifactDigest,
  ];
  packet.metrics.baseline.determinism.digests = [
    baseline.artifactDigest,
    baseline.artifactDigest,
    baseline.artifactDigest,
  ];
  return packet;
}

function codes(result) {
  return result.findings.map(({ code }) => code);
}

function expectRed(mutator, expectedCode) {
  const packet = qualificationPacket();
  mutator(packet);
  const result = evaluateQ17Qualification(packet);
  assert.equal(result.status, 'fail');
  assert.ok(codes(result).includes(expectedCode), `${expectedCode} was not reported`);
}

test('Q17 evaluator accepts a complete independent non-writing packet without an aggregate score', () => {
  const result = evaluateQ17Qualification(qualificationPacket());

  assert.equal(result.status, 'pass');
  assert.deepEqual(Object.values(result.axes).map(({ status }) => status), [
    'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass',
  ]);
  assert.equal('score' in result, false);
  assert.equal('overallScore' in result, false);
});

test('Q17 mutation gate makes every critical evidence defect red', async (t) => {
  const mutations = [
    [
      'omitted proposal claim',
      (packet) => packet.current.analysis.claims.pop(),
      'omitted-proposal-claim',
    ],
    [
      'proposal digest mismatch',
      (packet) => { packet.current.proposalDigest = `sha256:${'a'.repeat(64)}`; },
      'proposal-digest-mismatch',
    ],
    [
      'source-hidden bound to another plan',
      (packet) => { packet.sourceHiddenEvidence.current.reviewPlanDigest = `sha256:${'a'.repeat(64)}`; },
      'source-hidden-review-plan-digest-mismatch',
    ],
    [
      'unsupported high-confidence claim',
      (packet) => {
        packet.current.analysis.claims[0].status = 'unsupported';
        packet.current.analysis.claims[0].confidence = 0.95;
      },
      'unsupported-high-confidence-claim',
    ],
    [
      'unsupported citation',
      (packet) => { packet.citationAudit.current.entries[0].supportsClaim = false; },
      'unsupported-citation',
    ],
    [
      'invalid relation type',
      (packet) => { packet.current.reviewPlan.relations[0].type = 'invented'; },
      'invalid-relation-type',
    ],
    [
      'invalid relation direction',
      (packet) => { packet.current.analysis.relationWitnesses[0].to = 'elements/wrong-handler'; },
      'invalid-relation-direction',
    ],
    [
      'write before qualification',
      (packet) => { packet.current.analysis.proposalValidation.canWrite = true; },
      'can-write-before-qualification',
    ],
    [
      'missing admission tier',
      (packet) => { delete packet.current.analysis.proposalValidation.constructionLifecycle.admission.tier; },
      'missing-admission-tier',
    ],
    [
      'source-hidden summary canWrite true',
      (packet) => { packet.sourceHiddenEvidence.current.canWrite = true; },
      'source-hidden-can-write',
    ],
    [
      'source-hidden summary writePlan present',
      (packet) => { packet.sourceHiddenEvidence.current.writePlan = {}; },
      'source-hidden-write-plan-present',
    ],
    [
      'source-hidden packet canWrite true',
      (packet) => { packet.canWrite = true; },
      'source-hidden-packet-can-write',
    ],
    [
      'source-hidden packet writePlan present',
      (packet) => { packet.writePlan = {}; },
      'source-hidden-packet-write-plan-present',
    ],
    [
      'source-hidden packet sourceHidden false',
      (packet) => { packet.sourceHidden = false; },
      'source-hidden-packet-boundary',
    ],
    [
      'source-hidden packet sourceHidden missing',
      (packet) => { delete packet.sourceHidden; },
      'source-hidden-packet-boundary',
    ],
  ];

  assert.ok(mutations.length >= 9, 'the mutation census must stay non-empty');
  for (const [name, mutate, code] of mutations) {
    await t.test(name, () => expectRed(mutate, code));
  }
});

test('Q17 source-hidden evidence rejects fixture-only, private-path, and incomplete packets', () => {
  expectRed(
    (packet) => { packet.sourceHiddenEvidence.current.evaluationStatus = 'fixture_only'; },
    'fixture-only-source-hidden',
  );
  expectRed(
    (packet) => { packet.sourceHiddenEvidence.current.answers[0].evidenceRefs = ['/Users/private/repo/README.md']; },
    'source-hidden-private-path',
  );
  expectRed(
    (packet) => { packet.sourceHiddenEvidence.current.answers.pop(); },
    'source-hidden-question-count-mismatch',
  );
});

test('Q17 source-hidden trial fails closed for missing impact witness and semantic citation support', () => {
  const missingImpactWitness = qualificationPacket();
  missingImpactWitness.current.reviewPlan.relations[0].type = 'depends_on';
  missingImpactWitness.current.analysis.relationWitnesses = [];
  const witnessResult = evaluateQ17Qualification(missingImpactWitness);
  assert.equal(witnessResult.status, 'fail');
  assert.ok(codes(witnessResult).includes('missing-relation-witness'));

  const unsupportedSemanticCitation = qualificationPacket();
  unsupportedSemanticCitation.citationAudit.current.entries[0].supportsClaim = false;
  const citationResult = evaluateQ17Qualification(unsupportedSemanticCitation);
  assert.equal(citationResult.status, 'fail');
  assert.ok(codes(citationResult).includes('unsupported-citation'));
});

test('Q17 determinism and performance failures remain categorical', () => {
  expectRed(
    (packet) => { packet.metrics.current.determinism.digests[2] = `sha256:${'c'.repeat(64)}`; },
    'non-deterministic-current-artifact',
  );
  expectRed(
    (packet) => { packet.metrics.current.performance.maxMs = 30_001; },
    'performance-max-exceeded',
  );
});
