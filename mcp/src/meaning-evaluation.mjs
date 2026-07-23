const DEFAULT_THRESHOLDS = Object.freeze({
  conceptPrecision: 0.8,
  conceptRecall: 0.75,
  definitionCoverage: 1,
  citationRecall: 1,
  competencyCoverage: 1,
  maximumForbiddenLeakage: 0,
  maximumUnsupportedHighConfidence: 0,
});

export function evaluateMeaningProposal(expected, proposal, thresholds = {}) {
  validateExpected(expected);
  validateProposal(proposal);
  const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const expectedConcepts = conceptMap(expected);
  const proposedConcepts = conceptMap(proposal);
  const expectedSlugs = new Set(expectedConcepts.keys());
  const proposedSlugs = new Set(proposedConcepts.keys());
  const matchedSlugs = [...proposedSlugs].filter((slug) => expectedSlugs.has(slug));
  const falsePositiveSlugs = [...proposedSlugs].filter((slug) => !expectedSlugs.has(slug));
  const missedSlugs = [...expectedSlugs].filter((slug) => !proposedSlugs.has(slug));
  const precision = ratio(matchedSlugs.length, proposedSlugs.size);
  const recall = ratio(matchedSlugs.length, expectedSlugs.size);

  let definedMatches = 0;
  let expectedCitationCount = 0;
  let citedExpectedCount = 0;
  let proposedCitationCount = 0;
  let supportedProposedCitationCount = 0;
  for (const slug of matchedSlugs) {
    const expectedConcept = expectedConcepts.get(slug);
    const proposedConcept = proposedConcepts.get(slug);
    if (nonEmpty(proposedConcept.definition)) definedMatches += 1;
    const expectedEvidence = new Set(expectedConcept.evidence ?? []);
    const proposedEvidence = new Set(proposedConcept.evidence ?? []);
    expectedCitationCount += expectedEvidence.size;
    proposedCitationCount += proposedEvidence.size;
    for (const source of expectedEvidence) {
      if (proposedEvidence.has(source)) citedExpectedCount += 1;
    }
    for (const source of proposedEvidence) {
      if (expectedEvidence.has(source)) supportedProposedCitationCount += 1;
    }
  }

  const forbidden = new Set(expected.forbiddenBusinessConcepts ?? []);
  const forbiddenLeakage = [...proposedSlugs].filter((slug) => forbidden.has(slug));
  const confidenceRows = [...proposedConcepts.values()].filter(
    (concept) => typeof concept.confidence === 'number',
  );
  const invalidConfidenceSlugs = confidenceRows
    .filter((concept) => concept.confidence < 0 || concept.confidence > 1)
    .map((concept) => concept.slug);
  const unsupportedHighConfidence = falsePositiveSlugs.filter(
    (slug) => (proposedConcepts.get(slug).confidence ?? 0) >= 0.8,
  );
  const expectedCompetencyKeys = Object.keys(expected.competencyAnswers ?? {});
  const answeredCompetencyKeys = expectedCompetencyKeys.filter((key) =>
    nonEmpty(proposal.competencyAnswers?.[key]),
  );

  const metrics = {
    conceptPrecision: precision,
    conceptRecall: recall,
    conceptF1: f1(precision, recall),
    definitionCoverage: ratio(definedMatches, matchedSlugs.length),
    citationPrecision: ratio(supportedProposedCitationCount, proposedCitationCount),
    citationRecall: ratio(citedExpectedCount, expectedCitationCount),
    competencyCoverage: ratio(answeredCompetencyKeys.length, expectedCompetencyKeys.length),
    confidenceCoverage: ratio(confidenceRows.length, proposedSlugs.size),
  };
  const failures = [];
  for (const metric of [
    'conceptPrecision',
    'conceptRecall',
    'definitionCoverage',
    'citationRecall',
    'competencyCoverage',
  ]) {
    if (metrics[metric] < resolvedThresholds[metric]) {
      failures.push({
        gate: metric,
        actual: metrics[metric],
        expected: `>= ${resolvedThresholds[metric]}`,
      });
    }
  }
  if (forbiddenLeakage.length > resolvedThresholds.maximumForbiddenLeakage) {
    failures.push({
      gate: 'forbiddenLeakage',
      actual: forbiddenLeakage.length,
      expected: `<= ${resolvedThresholds.maximumForbiddenLeakage}`,
    });
  }
  if (unsupportedHighConfidence.length > resolvedThresholds.maximumUnsupportedHighConfidence) {
    failures.push({
      gate: 'unsupportedHighConfidence',
      actual: unsupportedHighConfidence.length,
      expected: `<= ${resolvedThresholds.maximumUnsupportedHighConfidence}`,
    });
  }
  if (invalidConfidenceSlugs.length > 0) {
    failures.push({
      gate: 'validConfidenceRange',
      actual: invalidConfidenceSlugs.length,
      expected: '0',
    });
  }

  return {
    passed: failures.length === 0,
    metrics,
    counts: {
      expectedConcepts: expectedSlugs.size,
      proposedConcepts: proposedSlugs.size,
      matchedConcepts: matchedSlugs.length,
      expectedCitations: expectedCitationCount,
      matchedCitations: citedExpectedCount,
    },
    findings: {
      matchedSlugs: matchedSlugs.sort(),
      falsePositiveSlugs: falsePositiveSlugs.sort(),
      missedSlugs: missedSlugs.sort(),
      forbiddenLeakage: forbiddenLeakage.sort(),
      unsupportedHighConfidence: unsupportedHighConfidence.sort(),
      invalidConfidenceSlugs: invalidConfidenceSlugs.sort(),
      unansweredCompetencyKeys: expectedCompetencyKeys
        .filter((key) => !answeredCompetencyKeys.includes(key))
        .sort(),
    },
    thresholds: resolvedThresholds,
    failures,
  };
}

export function proposalFromGolden(expected, confidence = 0.9) {
  return {
    domains: expected.domains.map((row) => ({ ...row, confidence })),
    capabilities: expected.capabilities.map((row) => ({ ...row, confidence })),
    competencyAnswers: { ...expected.competencyAnswers },
  };
}

export function candidateProposalFromAnalysis(analysis) {
  return {
    domains: analysis.meaningGate.proposedBusinessOntology.domains.map((row) => ({
      slug: row.slug,
      evidence: [row.evidence?.source].filter(Boolean),
      confidence: 0.5,
    })),
    capabilities: analysis.meaningGate.proposedBusinessOntology.capabilities.map((row) => ({
      slug: row.slug,
      evidence: [row.evidence?.source].filter(Boolean),
      confidence: 0.5,
    })),
    competencyAnswers: {},
  };
}

function conceptMap(value) {
  return new Map(
    [...(value.domains ?? []), ...(value.capabilities ?? [])]
      .map((concept) => [concept.slug, concept]),
  );
}

function validateExpected(expected) {
  if (!expected || typeof expected !== 'object') {
    throw new TypeError('expected must be an object');
  }
  if (!expected.project || !Array.isArray(expected.domains) || !Array.isArray(expected.capabilities)) {
    throw new TypeError('expected must include project, domains, and capabilities');
  }
}

function validateProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    throw new TypeError('proposal must be an object');
  }
  for (const field of ['domains', 'capabilities']) {
    if (!Array.isArray(proposal[field])) {
      throw new TypeError(`proposal.${field} must be an array`);
    }
    for (const [index, concept] of proposal[field].entries()) {
      if (!concept || typeof concept !== 'object' || !nonEmpty(concept.slug)) {
        throw new TypeError(`proposal.${field}[${index}].slug must be a non-empty string`);
      }
    }
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function ratio(numerator, denominator) {
  if (denominator === 0) return 1;
  return Number((numerator / denominator).toFixed(4));
}

function f1(precision, recall) {
  if (precision + recall === 0) return 0;
  return Number(((2 * precision * recall) / (precision + recall)).toFixed(4));
}
