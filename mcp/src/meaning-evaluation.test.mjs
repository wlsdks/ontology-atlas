import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateMeaningProposal,
  proposalFromGolden,
} from './meaning-evaluation.mjs';

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
