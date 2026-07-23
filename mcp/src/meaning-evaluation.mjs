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

export function repositoryProposalFromGolden(expected, confidence = 0.9) {
  return {
    project: {
      ...expected.project,
      evidence: ['README.md'],
      confidence,
    },
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

export function validateMeaningProposalAgainstAnalysis(analysis, proposal) {
  if (proposal == null) {
    return {
      status: 'not-provided',
      canWrite: false,
      summary: {
        concepts: 0,
        findings: 0,
        errors: 0,
        warnings: 0,
      },
      gates: {
        projectDefined: false,
        conceptsDefined: false,
        citationsResolved: false,
        riskyEvidenceControlled: false,
        capabilityDomainsResolved: false,
        confidenceValid: false,
        competencyQuestionsAnswered: false,
      },
      findings: [],
      nextStep:
        'Pass proposal with project, domains, capabilities, citations, confidence, and competencyAnswers; proceed to writes only when canWrite is true.',
    };
  }
  validateRepositoryProposalShape(proposal);
  const findings = [];
  const evidenceBySource = new Map(
    analysis.semanticEvidence.map((row) => [row.source, row]),
  );
  const availableSources = new Set([
    ...evidenceBySource.keys(),
    ...analysis.domains.map((row) => row.evidence?.source),
    ...analysis.capabilities.map((row) => row.evidence?.source),
    ...analysis.elements.map((row) => row.evidence?.source),
  ].filter(Boolean));
  const concepts = [proposal.project, ...proposal.domains, ...proposal.capabilities];
  const proposalDomains = new Set(proposal.domains.map((row) => row.slug));
  const sharedDomains = new Set(analysis.meaningGate.businessOntology.domains);
  const seenSlugs = new Set();

  for (const [index, concept] of concepts.entries()) {
    const path = index === 0 ? 'project' : `concepts[${index - 1}]`;
    if (seenSlugs.has(concept.slug)) {
      findings.push(finding('duplicate-slug', 'error', path, `Duplicate proposal slug: ${concept.slug}`));
    }
    seenSlugs.add(concept.slug);
    if (!nonEmpty(concept.definition)) {
      findings.push(finding('missing-definition', 'error', path, 'Every project/domain/capability needs a non-circular definition.'));
    }
    if (!Array.isArray(concept.evidence) || concept.evidence.length === 0) {
      findings.push(finding('missing-citation', 'error', path, 'Every meaning claim needs at least one repository evidence source.'));
      continue;
    }
    const safeSources = [];
    for (const source of concept.evidence) {
      if (!availableSources.has(source)) {
        findings.push(finding('unknown-citation', 'error', path, `Citation is not present in the analysis evidence packet: ${source}`, [source]));
        continue;
      }
      const semantic = evidenceBySource.get(source);
      if (semantic?.trust === 'untrusted-instruction') {
        findings.push(finding('untrusted-citation', 'error', path, `Untrusted instruction content cannot support a meaning assertion: ${source}`, [source]));
      } else if (semantic?.trust === 'claim-review-required') {
        findings.push(finding('risky-citation', 'warning', path, `Temporal, negated, or deprecated content needs an independent current-state source: ${source}`, [source]));
      } else {
        safeSources.push(source);
      }
    }
    const usesRiskyEvidence = concept.evidence.some(
      (source) => evidenceBySource.get(source)?.trust === 'claim-review-required',
    );
    if (usesRiskyEvidence && safeSources.length === 0) {
      findings.push(finding('risky-citation-unconfirmed', 'error', path, 'Risky claim evidence has no independent current-state corroboration.', concept.evidence));
    }
    if (
      typeof concept.confidence !== 'number' ||
      concept.confidence < 0 ||
      concept.confidence > 1
    ) {
      findings.push(finding('invalid-confidence', 'error', path, 'confidence must be a number between 0 and 1.'));
    }
  }

  for (const [index, capability] of proposal.capabilities.entries()) {
    if (!proposalDomains.has(capability.domain) && !sharedDomains.has(capability.domain)) {
      findings.push(finding(
        'unresolved-capability-domain',
        'error',
        `capabilities[${index}].domain`,
        `Capability domain is absent from the proposal and shared ontology: ${capability.domain}`,
      ));
    }
  }

  const competencyKeys = ['scope', 'domains', 'abilities', 'evidence', 'impact'];
  for (const key of competencyKeys) {
    if (!nonEmpty(proposal.competencyAnswers?.[key])) {
      findings.push(finding(
        'unanswered-competency-question',
        'error',
        `competencyAnswers.${key}`,
        `Competency answer "${key}" is required before writes.`,
      ));
    }
  }

  const errors = findings.filter((row) => row.severity === 'error').length;
  const warnings = findings.filter((row) => row.severity === 'warning').length;
  const gates = {
    projectDefined: nonEmpty(proposal.project.definition),
    conceptsDefined: [...proposal.domains, ...proposal.capabilities]
      .every((row) => nonEmpty(row.definition)),
    citationsResolved: !findings.some((row) =>
      ['missing-citation', 'unknown-citation', 'untrusted-citation'].includes(row.code)),
    riskyEvidenceControlled: !findings.some((row) =>
      ['untrusted-citation', 'risky-citation-unconfirmed'].includes(row.code)),
    capabilityDomainsResolved: !findings.some((row) => row.code === 'unresolved-capability-domain'),
    confidenceValid: !findings.some((row) => row.code === 'invalid-confidence'),
    competencyQuestionsAnswered: !findings.some((row) => row.code === 'unanswered-competency-question'),
  };
  return {
    status: errors === 0 ? 'pass' : 'fail',
    canWrite: errors === 0,
    summary: {
      concepts: concepts.length,
      findings: findings.length,
      errors,
      warnings,
    },
    gates,
    findings,
    nextStep: errors === 0
      ? 'Show the validated proposal to the user; write only the concepts they approve.'
      : 'Revise the proposal from findings and call analyze_repo_structure again before any write tool.',
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

function validateRepositoryProposalShape(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    throw new TypeError('proposal must be an object');
  }
  if (!proposal.project || typeof proposal.project !== 'object') {
    throw new TypeError('proposal.project must be an object');
  }
  for (const field of ['domains', 'capabilities']) {
    if (!Array.isArray(proposal[field])) {
      throw new TypeError(`proposal.${field} must be an array`);
    }
  }
  for (const [path, concept] of [
    ['project', proposal.project],
    ...proposal.domains.map((row, index) => [`domains[${index}]`, row]),
    ...proposal.capabilities.map((row, index) => [`capabilities[${index}]`, row]),
  ]) {
    if (!concept || typeof concept !== 'object' || !nonEmpty(concept.slug)) {
      throw new TypeError(`proposal.${path}.slug must be a non-empty string`);
    }
    if (concept.evidence != null && (
      !Array.isArray(concept.evidence) ||
      concept.evidence.some((source) => !nonEmpty(source))
    )) {
      throw new TypeError(`proposal.${path}.evidence must be an array of non-empty strings`);
    }
  }
  for (const [index, capability] of proposal.capabilities.entries()) {
    if (!nonEmpty(capability.domain)) {
      throw new TypeError(`proposal.capabilities[${index}].domain must be a non-empty string`);
    }
  }
  if (!proposal.competencyAnswers || typeof proposal.competencyAnswers !== 'object') {
    throw new TypeError('proposal.competencyAnswers must be an object');
  }
}

function finding(code, severity, path, message, sources = []) {
  return { code, severity, path, message, sources };
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
