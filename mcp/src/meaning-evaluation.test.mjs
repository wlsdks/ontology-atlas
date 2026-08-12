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

function completeTypedRepositoryProposal() {
  const proposal = repositoryProposalFromGolden(expected);
  proposal.capabilities[0].path = 'src/features/checkout';
  proposal.capabilities[1].path = 'src/features/inventory-sync';
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
      from: 'northstar-commerce',
      to: 'domains/inventory',
      type: 'domains',
      why: 'The project owns the inventory responsibility boundary.',
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
      from: 'domains/inventory',
      to: 'capabilities/inventory-sync',
      type: 'capabilities',
      why: 'Inventory is realized through inventory synchronization.',
      evidence: ['README.md'],
      confidence: 0.9,
    },
    {
      from: 'capabilities/checkout',
      to: 'capabilities/inventory-sync',
      type: 'depends_on',
      why: 'Checkout depends on trustworthy inventory availability.',
      evidence: ['README.md'],
      confidence: 0.9,
    },
  ];
  proposal.competencyAnswers = {
    scope: {
      answer: expected.competencyAnswers.scope,
      status: 'answered',
      witnesses: {
        concepts: ['northstar-commerce'],
        relations: [],
        evidence: ['README.md'],
        paths: [],
      },
    },
    domains: {
      answer: expected.competencyAnswers.domains,
      status: 'answered',
      witnesses: {
        concepts: ['domains/purchase', 'domains/inventory'],
        relations: proposal.relations.slice(0, 2).map(relationWitness),
        evidence: ['README.md', 'docs/PRODUCT.md'],
        paths: [],
      },
    },
    abilities: {
      answer: expected.competencyAnswers.abilities,
      status: 'answered',
      witnesses: {
        concepts: ['capabilities/checkout', 'capabilities/inventory-sync'],
        relations: proposal.relations.slice(2, 4).map(relationWitness),
        evidence: ['README.md'],
        paths: [],
      },
    },
    evidence: {
      answer: expected.competencyAnswers.evidence,
      status: 'answered',
      witnesses: {
        concepts: ['capabilities/checkout', 'capabilities/inventory-sync'],
        relations: [],
        evidence: ['src/features/checkout', 'src/features/inventory-sync'],
        paths: ['src/features/checkout', 'src/features/inventory-sync'],
      },
    },
    impact: {
      answer: expected.competencyAnswers.impact,
      status: 'answered',
      witnesses: {
        concepts: ['capabilities/checkout', 'capabilities/inventory-sync'],
        relations: [relationWitness(proposal.relations[4])],
        evidence: ['README.md'],
        paths: [],
      },
    },
  };
  return proposal;
}

function relationWitness({ from, to, type }) {
  return { from, to, type };
}

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
  const proposal = completeTypedRepositoryProposal();
  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);
  assert.equal(result.status, 'pass');
  assert.equal(result.canWrite, true);
  assert.equal(result.summary.errors, 0);
  assert.ok(Object.values(result.gates).every(Boolean));
});

test('repository proposal requires typed competency witnesses before claiming a complete answer', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'pass');
  assert.equal(result.canWrite, true);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.warnings, 0);
  assert.equal(result.gates.competencyQuestionsAnswered, true);
  assert.equal(result.gates.competencyWitnessesResolved, true);
  assert.deepEqual(result.writePlan.competencyAnswers, proposal.competencyAnswers);
  const project = result.writePlan.concepts.find((row) => row.kind === 'project');
  assert.match(project.body, /## Competency answers/);
  assert.match(project.body, /Checkout depends on trustworthy inventory availability/);
  assert.match(project.body, /capabilities\/checkout.*depends_on.*capabilities\/inventory-sync/);
});

test('an answered abilities competency cannot cover only a strict subset of its domain targets', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();
  proposal.competencyAnswers.abilities.witnesses.concepts = ['capabilities/checkout'];
  proposal.competencyAnswers.abilities.witnesses.relations = [
    relationWitness(proposal.relations[2]),
  ];

  assert.equal(proposal.domains.length, 2, 'the target set must be non-empty and plural');

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'fail');
  assert.equal(result.canWrite, false);
  assert.equal(result.gates.competencyQuestionsAnswered, false);
  assert.equal(result.gates.competencyWitnessesResolved, false);
  assert.ok(result.findings.some((row) =>
    row.code === 'incomplete-competency-coverage'
      && row.path === 'competencyAnswers.abilities'
      && row.sources.includes('domains/inventory')));
});

test('an answered evidence competency cannot cover only a strict subset of its ability targets', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();
  proposal.competencyAnswers.evidence.witnesses.concepts = ['capabilities/checkout'];
  proposal.competencyAnswers.evidence.witnesses.evidence = ['src/features/checkout'];
  proposal.competencyAnswers.evidence.witnesses.paths = ['src/features/checkout'];

  assert.equal(proposal.capabilities.length, 2, 'the target set must be non-empty and plural');

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'fail');
  assert.equal(result.canWrite, false);
  assert.equal(result.gates.competencyQuestionsAnswered, false);
  assert.equal(result.gates.competencyWitnessesResolved, false);
  assert.ok(result.findings.some((row) =>
    row.code === 'incomplete-competency-coverage'
      && row.path === 'competencyAnswers.evidence'
      && row.sources.includes('capabilities/inventory-sync')));
});

test('repository proposal preserves an honest visible competency gap without reporting findings zero', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();
  proposal.relations.pop();
  proposal.competencyAnswers.impact = {
    answer: 'The current evidence does not prove a change-impact dependency.',
    status: 'visible-gap',
    gap: 'No typed dependency relation is supported by the bounded evidence packet.',
    witnesses: {
      concepts: ['capabilities/checkout', 'capabilities/inventory-sync'],
      relations: [],
      evidence: ['README.md'],
      paths: [],
    },
  };

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'pass');
  assert.equal(result.canWrite, true);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.warnings, 1);
  assert.equal(result.gates.competencyQuestionsAnswered, false);
  assert.equal(result.gates.competencyWitnessesResolved, true);
  assert.ok(result.findings.some((row) => row.code === 'visible-competency-gap'));
  assert.deepEqual(
    result.writePlan.competencyAnswers.impact,
    proposal.competencyAnswers.impact,
  );
});

test('repository proposal rejects an answered impact claim without a relation witness', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();
  proposal.competencyAnswers.impact.witnesses.relations = [];

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'fail');
  assert.equal(result.canWrite, false);
  assert.equal(result.gates.competencyWitnessesResolved, false);
  assert.equal(result.writePlan, undefined);
  assert.ok(result.findings.some((row) => row.code === 'missing-competency-witness'));
  assert.ok(result.findings.some((row) => row.code === 'missing-impact-dependency-witness'));
});

test('repository proposal rejects a competency witness for an unknown concept', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();
  proposal.competencyAnswers.scope.witnesses.concepts.push('concepts/imaginary');

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'fail');
  assert.equal(result.gates.competencyWitnessesResolved, false);
  assert.ok(result.findings.some((row) => row.code === 'unknown-competency-concept'));
});

test('repository proposal rejects a missing repository path as competency evidence', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();
  proposal.competencyAnswers.evidence.witnesses.paths.push('src/features/missing');

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'fail');
  assert.equal(result.gates.competencyWitnessesResolved, false);
  assert.ok(result.findings.some((row) => row.code === 'missing-competency-path'));
});

test('repository proposal reports malformed concept boundary lists without crashing the tool', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();
  proposal.project.includes = 'Checkout and inventory behavior.';
  proposal.capabilities[0].excludes = ['Inventory synchronization.', 'Inventory synchronization.'];

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'fail');
  assert.equal(result.canWrite, false);
  assert.equal(result.writePlan, undefined);
  assert.ok(result.findings.some((row) =>
    row.code === 'invalid-concept-boundary-list' && row.path === 'project.includes'));
  assert.ok(result.findings.some((row) =>
    row.code === 'invalid-concept-boundary-list' && row.path === 'concepts[2].excludes'));
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

test('repository proposal does not treat a structural path as independent semantic corroboration', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const readmeEvidence = analysis.semanticEvidence.find((row) => row.source === 'README.md');
  readmeEvidence.trust = 'claim-review-required';
  readmeEvidence.riskFlags = ['temporal-claim'];
  const proposal = completeTypedRepositoryProposal();

  for (const concept of [
    proposal.project,
    ...proposal.domains,
    ...proposal.capabilities,
    ...proposal.elements,
  ]) {
    concept.evidence = ['docs/PRODUCT.md'];
  }
  for (const relation of proposal.relations) {
    relation.evidence = ['docs/PRODUCT.md'];
  }
  for (const answer of Object.values(proposal.competencyAnswers)) {
    answer.witnesses.evidence = ['docs/PRODUCT.md'];
  }
  proposal.capabilities[0].evidence = ['README.md', 'src/features/checkout'];

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'fail');
  assert.equal(result.canWrite, false);
  assert.equal(result.gates.riskyEvidenceControlled, false);
  assert.ok(result.findings.some((row) =>
    row.code === 'risky-citation-unconfirmed'
      && row.path === 'concepts[2]'
      && row.sources.includes('src/features/checkout')));
});

test('repository proposal accepts a trusted semantic source as independent corroboration', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const readmeEvidence = analysis.semanticEvidence.find((row) => row.source === 'README.md');
  readmeEvidence.trust = 'claim-review-required';
  readmeEvidence.riskFlags = ['temporal-claim'];
  const proposal = completeTypedRepositoryProposal();

  for (const concept of [
    proposal.project,
    ...proposal.domains,
    ...proposal.capabilities,
    ...proposal.elements,
  ]) {
    concept.evidence = ['docs/PRODUCT.md'];
  }
  for (const relation of proposal.relations) {
    relation.evidence = ['docs/PRODUCT.md'];
  }
  for (const answer of Object.values(proposal.competencyAnswers)) {
    answer.witnesses.evidence = ['docs/PRODUCT.md'];
  }
  proposal.capabilities[0].evidence = ['README.md', 'docs/PRODUCT.md'];

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'pass');
  assert.equal(result.canWrite, true);
  assert.equal(result.gates.riskyEvidenceControlled, true);
  assert.ok(result.findings.some((row) => row.code === 'risky-citation'));
  assert.ok(!result.findings.some((row) => row.code === 'risky-citation-unconfirmed'));
});

test('repository proposal validates the complete approved graph and returns an exact write plan', () => {
  const analysis = analyzeRepoStructure(fixtureRoot);
  const proposal = completeTypedRepositoryProposal();
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
  proposal.relations.push({
    from: 'capabilities/checkout',
    to: 'elements/checkout-entrypoint',
    type: 'elements',
    why: 'The checkout entrypoint implements checkout behavior.',
    evidence: ['src/features/checkout'],
    confidence: 0.9,
  });

  const result = validateMeaningProposalAgainstAnalysis(analysis, proposal);

  assert.equal(result.status, 'pass');
  assert.equal(result.canWrite, true);
  assert.deepEqual(result.summary, {
    concepts: 6,
    relations: 6,
    findings: 0,
    errors: 0,
    warnings: 0,
  });
  assert.equal(result.writePlan.concepts.length, 6);
  assert.equal(result.writePlan.relations.length, 6);
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
  assert.deepEqual(result.writePlan.relations.find(
    (row) => row.to === 'elements/checkout-entrypoint',
  ), {
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
