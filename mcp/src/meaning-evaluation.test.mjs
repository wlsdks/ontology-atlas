import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateMeaningProposal,
  proposalFromGolden,
  repositoryProposalFromGolden,
  validateMeaningProposalAgainstAnalysis,
} from './meaning-evaluation.mjs';
import { analyzeRepoStructure } from './analyze.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, '../../tests/fixtures/meaning-corpus/commerce-fsd');
const expected = JSON.parse(readFileSync(join(fixtureRoot, 'golden.json'), 'utf8')).expected;

test('gold proposal passes every meaning-quality gate', () => {
  const result = evaluateMeaningProposal(expected, proposalFromGolden(expected));
  assert.equal(result.passed, true);
  assert.deepEqual(result.metrics, {
    conceptPrecision: 1,
    conceptRecall: 1,
    conceptF1: 1,
    definitionCoverage: 1,
    citationPrecision: 1,
    citationRecall: 1,
    competencyCoverage: 1,
    confidenceCoverage: 1,
  });
  assert.deepEqual(result.failures, []);
});

test('near-miss proposal reports hallucination, omission, weak citation, and overconfidence', () => {
  const proposal = proposalFromGolden(expected);
  proposal.domains = proposal.domains.slice(0, 1);
  proposal.capabilities = [
    {
      slug: 'capabilities/checkout',
      definition: 'Complete a purchase.',
      evidence: ['src/features/checkout'],
      confidence: 0.9,
    },
    {
      slug: 'capabilities/theme-toggle',
      definition: 'Change the visual theme.',
      evidence: ['src/features/theme-toggle'],
      confidence: 0.95,
    },
  ];
  delete proposal.competencyAnswers.impact;

  const result = evaluateMeaningProposal(expected, proposal);
  assert.equal(result.passed, false);
  assert.equal(result.metrics.conceptPrecision, 0.6667);
  assert.equal(result.metrics.conceptRecall, 0.5);
  assert.equal(result.metrics.citationRecall, 0.75);
  assert.equal(result.metrics.competencyCoverage, 0.8);
  assert.deepEqual(result.findings.forbiddenLeakage, ['capabilities/theme-toggle']);
  assert.deepEqual(result.findings.unsupportedHighConfidence, ['capabilities/theme-toggle']);
  assert.deepEqual(result.findings.missedSlugs, [
    'capabilities/inventory-sync',
    'domains/inventory',
  ]);
});

test('invalid proposal rows and confidence ranges fail closed', () => {
  assert.throws(
    () => evaluateMeaningProposal(expected, { domains: [{}], capabilities: [] }),
    /proposal\.domains\[0\]\.slug/,
  );
  const proposal = proposalFromGolden(expected);
  proposal.capabilities[0].confidence = 2;
  const result = evaluateMeaningProposal(expected, proposal);
  assert.equal(result.passed, false);
  assert.deepEqual(result.findings.invalidConfidenceSlugs, ['capabilities/checkout']);
});

test('repository proposal passes only when definitions, citations, domains, and competency answers resolve', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = repositoryProposalFromGolden(expected);
  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);
  assert.equal(result.status, 'pass');
  assert.equal(result.canWrite, true);
  assert.equal(result.summary.errors, 0);
  assert.ok(Object.values(result.gates).every(Boolean));
});

test('repository proposal blocks unknown citations and unresolved capability domains', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = repositoryProposalFromGolden(expected);
  proposal.capabilities[0].evidence = ['docs/imaginary.md'];
  proposal.capabilities[0].domain = 'domains/imaginary';
  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);
  assert.equal(result.status, 'fail');
  assert.equal(result.canWrite, false);
  assert.ok(result.findings.some((row) => row.code === 'unknown-citation'));
  assert.ok(result.findings.some((row) => row.code === 'unresolved-capability-domain'));
});

test('repository proposal validates the complete approved graph and returns an exact write plan', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = repositoryProposalFromGolden(expected);
  proposal.elements = [{
    slug: 'elements/checkout-entrypoint',
    title: 'Checkout Entrypoint',
    definition: 'The source entrypoint that implements checkout behavior.',
    domain: 'domains/purchase',
    path: 'src/features/checkout/index.ts',
    evidence: ['src/features/checkout'],
    confidence: 0.9,
    includes: ['The checkout feature entrypoint.'],
    excludes: ['Inventory reconciliation.'],
    uncertainty: 'Individual helper symbols remain outside this proposal.',
  }];
  proposal.relations = [
    {
      from: 'northstar-commerce',
      to: 'domains/purchase',
      type: 'domains',
      why: 'The project owns the purchase responsibility boundary.',
      evidence: ['README.md'],
      confidence: 0.9,
    },
    {
      from: 'domains/purchase',
      to: 'capabilities/checkout',
      type: 'capabilities',
      why: 'Purchase is realized through checkout.',
      evidence: ['README.md'],
      confidence: 0.9,
    },
    {
      from: 'capabilities/checkout',
      to: 'elements/checkout-entrypoint',
      type: 'elements',
      why: 'The checkout entrypoint implements checkout behavior.',
      evidence: ['src/features/checkout'],
      confidence: 0.9,
    },
  ];

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'pass');
  assert.equal(result.canWrite, true);
  assert.deepEqual(result.summary, {
    concepts: 6,
    relations: 3,
    findings: 0,
    errors: 0,
    warnings: 0,
  });
  assert.equal(result.writePlan.concepts.length, 6);
  assert.equal(result.writePlan.relations.length, 3);
  const capability = result.writePlan.concepts.find(
    (row) => row.slug === 'capabilities/checkout',
  );
  assert.equal(capability.kind, 'capability');
  assert.equal(capability.slug, 'capabilities/checkout');
  assert.equal(capability.domain, 'domains/purchase');
  const element = result.writePlan.concepts.find(
    (row) => row.slug === 'elements/checkout-entrypoint',
  );
  assert.equal(element.domain, 'domains/purchase');
  assert.equal(element.path, 'src/features/checkout/index.ts');
  assert.match(element.body, /## Definition[\s\S]*source entrypoint/i);
  assert.match(element.body, /## Evidence[\s\S]*src\/features\/checkout/i);
  assert.match(element.body, /## Confidence[\s\S]*0\.9/i);
  assert.match(element.body, /## Includes[\s\S]*checkout feature entrypoint/i);
  assert.match(element.body, /## Excludes[\s\S]*Inventory reconciliation/i);
  assert.match(element.body, /## Uncertainty[\s\S]*helper symbols/i);
  assert.deepEqual(result.writePlan.relations[2], {
    from: 'capabilities/checkout',
    to: 'elements/checkout-entrypoint',
    type: 'elements',
    why: 'The checkout entrypoint implements checkout behavior.',
  });
});

test('repository proposal fails closed on incomplete or invalid approved graph rows', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = repositoryProposalFromGolden(expected);
  proposal.elements = [{
    slug: 'capabilities/checkout',
    title: 'Duplicate Checkout',
    definition: 'A duplicate slug in another kind.',
    domain: 'domains/missing',
    path: 'src/features/missing/index.ts',
    evidence: ['docs/imaginary.md'],
    confidence: 0.9,
  }];
  proposal.relations = [
    {
      from: 'capabilities/checkout',
      to: 'elements/missing',
      type: 'contains',
      why: 'The missing element would implement checkout.',
      evidence: ['README.md'],
      confidence: 0.9,
    },
    {
      from: 'capabilities/checkout',
      to: 'elements/missing',
      type: 'contains',
      why: 'Duplicate relation.',
      evidence: ['README.md'],
      confidence: 0.9,
    },
    {
      from: 'northstar-commerce',
      to: 'domains/purchase',
      type: 'invented_relation',
      why: 'Unsupported relation type.',
      evidence: ['README.md'],
      confidence: 0.9,
    },
  ];

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'fail');
  assert.equal(result.canWrite, false);
  assert.equal(result.writePlan, undefined);
  for (const code of [
    'duplicate-slug',
    'unknown-citation',
    'unresolved-element-domain',
    'missing-element-path',
    'missing-relation-endpoint',
    'duplicate-relation',
    'unsupported-relation-type',
  ]) {
    assert.ok(result.findings.some((row) => row.code === code), `missing ${code}`);
  }
});

test('repository proposal rejects relation sources that the write plan cannot preserve', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  analysis.meaningGate.businessOntology.domains.push('domains/existing');
  const proposal = repositoryProposalFromGolden(expected);
  proposal.relations = [{
    from: 'domains/existing',
    to: 'capabilities/checkout',
    type: 'capabilities',
    why: 'The existing domain owns checkout.',
    evidence: ['README.md'],
    confidence: 0.9,
  }];

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.canWrite, false);
  assert.equal(result.writePlan, undefined);
  assert.ok(result.findings.some(
    (row) => row.code === 'relation-source-not-in-write-plan',
  ));
});
