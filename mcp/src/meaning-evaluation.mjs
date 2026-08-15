import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { WRITE_RELATION_TYPE_VALUES } from './ontology-engine.mjs';
import { MEANING_COMPETENCY_QUESTIONS } from './meaning-assessment.mjs';
import { evaluateQuantifiedCompetencyCoverage } from './competency-coverage.mjs';
import { renderProjectCompetencyMarkdown } from './project-meaning-receipt.mjs';

const DEFAULT_THRESHOLDS = Object.freeze({
  conceptPrecision: 0.8,
  conceptRecall: 0.75,
  definitionCoverage: 1,
  citationRecall: 1,
  competencyCoverage: 1,
  maximumForbiddenLeakage: 0,
  maximumUnsupportedHighConfidence: 0,
});

export const COMPETENCY_QUESTION_CONTRACTS = MEANING_COMPETENCY_QUESTIONS;

const COMPETENCY_STATUSES = new Set(['answered', 'partial', 'visible-gap']);
const SELECTED_IMPORT_ELEMENT_LIMIT = 4;
const COMPETENCY_WITNESS_KEYS = Object.freeze([
  'concepts',
  'relations',
  'evidence',
  'paths',
]);

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
    elements: [],
    relations: [],
    competencyAnswers: { ...expected.competencyAnswers },
  };
}

export function repositoryProposalFromGolden(expected, confidence = 0.9) {
  const domainSlugs = expected.domains.map((row) => row.slug);
  const capabilitySlugs = expected.capabilities.map((row) => row.slug);
  const capabilityPaths = expected.capabilities
    .map((row) => row.evidence?.find((source) => source.startsWith('src/')))
    .filter(Boolean);
  return {
    project: {
      ...expected.project,
      evidence: ['README.md'],
      confidence,
    },
    domains: expected.domains.map((row) => ({ ...row, confidence })),
    capabilities: expected.capabilities.map((row) => ({
      ...row,
      ...(row.evidence?.find((source) => source.startsWith('src/'))
        ? { path: row.evidence.find((source) => source.startsWith('src/')) }
        : {}),
      confidence,
    })),
    elements: [],
    relations: [],
    competencyAnswers: {
      scope: competencyAnswer(expected.competencyAnswers.scope, 'answered', {
        concepts: [expected.project.slug],
        evidence: ['README.md'],
      }),
      domains: competencyAnswer(expected.competencyAnswers.domains, 'partial', {
        concepts: domainSlugs,
        evidence: uniqueConceptEvidence(expected.domains),
      }, 'The proposal has not yet attached project-to-domain relation witnesses.'),
      abilities: competencyAnswer(expected.competencyAnswers.abilities, 'partial', {
        concepts: capabilitySlugs,
        evidence: uniqueConceptEvidence(expected.capabilities),
      }, 'The proposal has not yet attached domain-to-capability relation witnesses.'),
      evidence: competencyAnswer(expected.competencyAnswers.evidence, 'answered', {
        concepts: capabilitySlugs,
        evidence: capabilityPaths,
        paths: capabilityPaths,
      }),
      impact: competencyAnswer(expected.competencyAnswers.impact, 'visible-gap', {
        concepts: capabilitySlugs,
        evidence: ['README.md'],
      }, 'The proposal has not yet attached a typed change-impact relation.'),
    },
  };
}

function competencyAnswer(answer, status, witnesses = {}, gap) {
  return {
    answer,
    status,
    ...(gap ? { gap } : {}),
    witnesses: Object.fromEntries(
      COMPETENCY_WITNESS_KEYS.map((key) => [key, witnesses[key] ?? []]),
    ),
  };
}

function uniqueConceptEvidence(concepts) {
  return [...new Set(concepts.flatMap((row) => row.evidence ?? []))];
}

export function candidateProposalFromAnalysis(analysis) {
  const evidenceFor = (row) => [
    row.evidence?.source,
    row.evidence?.implementation,
  ].filter(Boolean);
  return {
    domains: analysis.meaningGate.proposedBusinessOntology.domains.map((row) => ({
      slug: row.slug,
      evidence: evidenceFor(row),
      confidence: 0.5,
    })),
    capabilities: analysis.meaningGate.proposedBusinessOntology.capabilities.map((row) => ({
      slug: row.slug,
      evidence: evidenceFor(row),
      confidence: 0.5,
    })),
    competencyAnswers: {},
  };
}

export function validateMeaningProposalAgainstAnalysis(
  analysis,
  proposal,
  importEvidence = {},
) {
  if (proposal == null) {
    return {
      status: 'not-provided',
      canWrite: false,
      summary: {
        concepts: 0,
        relations: 0,
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
        elementDomainsResolved: false,
        elementPathsResolved: false,
        relationsResolved: false,
        confidenceValid: false,
        competencyQuestionsAnswered: false,
        competencyWitnessesResolved: false,
      },
      findings: [],
      nextStep:
        'Pass the complete proposal with project, domains, capabilities, elements, relations, citations, confidence, and competencyAnswers; proceed to writes only when canWrite is true.',
    };
  }
  validateRepositoryProposalShape(proposal);
  const findings = [];
  const evidenceBySource = new Map(
    analysis.semanticEvidence.map((row) => [row.source, row]),
  );
  const observedImportEdges = (importEvidence.observedImportEdges ?? []).filter(
    (row) => nonEmpty(row?.from) && nonEmpty(row?.to),
  );
  const importEndpointSources = new Set(
    observedImportEdges.flatMap((row) => [row.from, row.to]),
  );
  const availableSources = new Set([
    ...evidenceBySource.keys(),
    ...analysis.domains.map((row) => row.evidence?.source),
    ...analysis.capabilities.map((row) => row.evidence?.source),
    ...analysis.elements.map((row) => row.evidence?.source),
    ...importEndpointSources,
  ].filter(Boolean));
  const concepts = [
    proposal.project,
    ...proposal.domains,
    ...proposal.capabilities,
    ...proposal.elements,
  ];
  const proposalDomains = new Set(proposal.domains.map((row) => row.slug));
  const sharedDomains = new Set(analysis.meaningGate.businessOntology.domains);
  const sharedConcepts = new Set([
    ...analysis.meaningGate.businessOntology.domains,
    ...analysis.meaningGate.businessOntology.capabilities,
    ...(analysis.meaningGate.implementationEvidence.elements ?? []),
  ]);
  const importBoundarySlugs = new Set(
    (importEvidence.importBoundaryElements ?? []).map((row) => row.slug),
  );
  const importBoundarySources = new Set(
    (importEvidence.importBoundaryElements ?? [])
      .map((row) => row.evidence?.source)
      .filter(nonEmpty),
  );
  const observedImportRelationKeys = new Set(
    (importEvidence.observedImportRelations ?? [])
      .map((row) => relationKey({ ...row, type: 'depends_on' })),
  );
  const observedImportPathKeys = new Set(
    observedImportEdges.map((row) => `${row.from}\0${row.to}`),
  );
  const proposalElementPaths = new Map(
    proposal.elements.map((row) => [row.slug, row.path]),
  );
  const proposalConceptPaths = new Map(
    concepts
      .filter((row) => repositoryPathExists(analysis.rootPath, row.path))
      .map((row) => [row.slug, row.path]),
  );
  const selectedImportEndpointElements = proposal.elements.filter(
    (row) => importEndpointSources.has(row.path) && !importBoundarySources.has(row.path),
  );
  if (selectedImportEndpointElements.length > SELECTED_IMPORT_ELEMENT_LIMIT) {
    findings.push(finding(
      'python-selected-import-element-limit',
      'error',
      'elements',
      `Select at most ${SELECTED_IMPORT_ELEMENT_LIMIT} exact import endpoints beyond the analyzer boundaries; received ${selectedImportEndpointElements.length}.`,
      selectedImportEndpointElements.map((row) => row.path),
    ));
  }
  const seenSlugs = new Set();

  for (const [index, concept] of concepts.entries()) {
    const path = index === 0 ? 'project' : `concepts[${index - 1}]`;
    if (seenSlugs.has(concept.slug)) {
      findings.push(finding('duplicate-slug', 'error', path, `Duplicate proposal slug: ${concept.slug}`));
    }
    seenSlugs.add(concept.slug);
    if (!nonEmpty(concept.definition)) {
      findings.push(finding('missing-definition', 'error', path, 'Every proposed concept needs a non-circular definition.'));
    }
    validateOptionalConceptBoundaryList(concept.includes, `${path}.includes`, findings);
    validateOptionalConceptBoundaryList(concept.excludes, `${path}.excludes`, findings);
    validateCitationsAndConfidence({
      row: concept,
      path,
      availableSources,
      evidenceBySource,
      findings,
      label: 'meaning',
    });
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

  for (const [index, element] of proposal.elements.entries()) {
    if (!proposalDomains.has(element.domain) && !sharedDomains.has(element.domain)) {
      findings.push(finding(
        'unresolved-element-domain',
        'error',
        `elements[${index}].domain`,
        `Element domain is absent from the proposal and shared ontology: ${element.domain}`,
      ));
    }
    if (!repositoryPathExists(analysis.rootPath, element.path)) {
      findings.push(finding(
        'missing-element-path',
        'error',
        `elements[${index}].path`,
        `Element path is absent from the repository or escapes its root: ${element.path ?? ''}`,
        [element.path].filter(nonEmpty),
      ));
    }
  }

  const relationKeys = new Set();
  const relationEndpoints = new Set([...seenSlugs, ...sharedConcepts]);
  for (const [index, relation] of proposal.relations.entries()) {
    const path = `relations[${index}]`;
    const key = relationKey(relation);
    if (relationKeys.has(key)) {
      findings.push(finding(
        'duplicate-relation',
        'error',
        path,
        `Duplicate proposal relation: ${relation.from} --${relation.type}--> ${relation.to}`,
      ));
    }
    relationKeys.add(key);
    if (!seenSlugs.has(relation.from)) {
      findings.push(finding(
        'relation-source-not-in-write-plan',
        'error',
        `${path}.from`,
        `Relation source is not a proposed concept, so its evidence and confidence cannot be preserved by add_concepts: ${relation.from}`,
      ));
    }
    if (!WRITE_RELATION_TYPE_VALUES.includes(relation.type)) {
      findings.push(finding(
        'unsupported-relation-type',
        'error',
        `${path}.type`,
        `Relation type is not supported by add_relations: ${relation.type}`,
      ));
    }
    for (const endpoint of ['from', 'to']) {
      if (!relationEndpoints.has(relation[endpoint])) {
        findings.push(finding(
          'missing-relation-endpoint',
          'error',
          `${path}.${endpoint}`,
          `Relation ${endpoint} endpoint is absent from the proposal and shared ontology: ${relation[endpoint]}`,
        ));
      }
    }
    if (!nonEmpty(relation.why)) {
      findings.push(finding(
        'missing-relation-rationale',
        'error',
        `${path}.why`,
        'Every proposed relation needs a one-line rationale.',
      ));
    }
    const endpointPaths = [...new Set([
      proposalConceptPaths.get(relation.from),
      proposalConceptPaths.get(relation.to),
    ].filter(nonEmpty))];
    const namedEndpointPaths = endpointPaths.filter((source) =>
      textNamesExactPath(relation.why, source));
    const missingNamedPathCitations = namedEndpointPaths.filter((source) =>
      !relation.evidence?.includes(source));
    if (missingNamedPathCitations.length > 0) {
      findings.push(finding(
        'relation-path-citation-mismatch',
        'error',
        path,
        'A relation rationale that names an exact endpoint path must cite that same path as relation evidence.',
        missingNamedPathCitations,
      ));
    }
    const relationAvailableSources = new Set([...availableSources, ...endpointPaths]);
    validateCitationsAndConfidence({
      row: relation,
      path,
      availableSources: relationAvailableSources,
      evidenceBySource,
      findings,
      label: 'relation',
    });
    if (
      relation.type === 'depends_on' &&
      importBoundarySlugs.has(relation.from) &&
      importBoundarySlugs.has(relation.to) &&
      relation.evidence?.some((source) => importBoundarySources.has(source)) &&
      !observedImportRelationKeys.has(key)
    ) {
      findings.push(finding(
        'unobserved-python-import-dependency',
        'error',
        path,
        `Observed import evidence does not support this dependency direction: ${relation.from} --depends_on--> ${relation.to}`,
        relation.evidence,
      ));
    }
    const fromPath = proposalElementPaths.get(relation.from);
    const toPath = proposalElementPaths.get(relation.to);
    if (
      relation.type === 'depends_on' &&
      importEndpointSources.has(fromPath) &&
      importEndpointSources.has(toPath) &&
      relation.evidence?.some((source) => importEndpointSources.has(source)) &&
      !observedImportPathKeys.has(`${fromPath}\0${toPath}`)
    ) {
      findings.push(finding(
        'unobserved-python-import-dependency',
        'error',
        path,
        `Observed import evidence does not support this exact file dependency direction: ${fromPath} -> ${toPath}`,
        relation.evidence,
      ));
    }
  }

  const competencyAudit = validateCompetencyAnswers({
    analysis,
    proposal,
    availableSources,
    evidenceBySource,
    conceptSlugs: relationEndpoints,
    proposalPaths: new Set(concepts.map((row) => row.path).filter(nonEmpty)),
    relationKeys,
    findings,
  });

  const errors = findings.filter((row) => row.severity === 'error').length;
  const warnings = findings.filter((row) => row.severity === 'warning').length;
  const gates = {
    projectDefined: nonEmpty(proposal.project.definition),
    conceptsDefined: [...proposal.domains, ...proposal.capabilities, ...proposal.elements]
      .every((row) => nonEmpty(row.definition)),
    citationsResolved: !findings.some((row) =>
      ['missing-citation', 'unknown-citation', 'untrusted-citation'].includes(row.code)),
    riskyEvidenceControlled: !findings.some((row) =>
      ['untrusted-citation', 'risky-citation-unconfirmed'].includes(row.code)),
    capabilityDomainsResolved: !findings.some((row) => row.code === 'unresolved-capability-domain'),
    elementDomainsResolved: !findings.some((row) => row.code === 'unresolved-element-domain'),
    elementPathsResolved: !findings.some((row) =>
      ['missing-element-path', 'python-selected-import-element-limit'].includes(row.code)),
    relationsResolved: !findings.some((row) => [
      'duplicate-relation',
      'missing-relation-endpoint',
      'missing-relation-rationale',
      'relation-source-not-in-write-plan',
      'unsupported-relation-type',
      'unobserved-python-import-dependency',
      'relation-path-citation-mismatch',
    ].includes(row.code)),
    confidenceValid: !findings.some((row) => row.code === 'invalid-confidence'),
    competencyQuestionsAnswered: competencyAudit.allAnswered,
    competencyWitnessesResolved: competencyAudit.witnessesResolved,
  };
  const result = {
    status: errors === 0 ? 'pass' : 'fail',
    canWrite: errors === 0,
    summary: {
      concepts: concepts.length,
      relations: proposal.relations.length,
      findings: findings.length,
      errors,
      warnings,
    },
    gates,
    findings,
    nextStep: errors === 0
      ? warnings > 0
        ? 'Show the validated graph and every partial/visible competency gap to the user. After approval, pass writePlan rows unchanged to add_concepts first; call add_relations only when every concept row succeeds.'
        : 'Show the validated full graph to the user. After approval, pass writePlan rows unchanged to add_concepts first; call add_relations only when every concept row succeeds.'
      : 'Revise the proposal from findings and call analyze_repo_structure again before any write tool.',
  };
  if (errors === 0) result.writePlan = buildWritePlan(proposal);
  return result;
}

function validateOptionalConceptBoundaryList(value, path, findings) {
  if (value == null) return;
  const valid = Array.isArray(value) &&
    value.length <= 20 &&
    value.every(nonEmpty) &&
    new Set(value).size === value.length;
  if (valid) return;
  findings.push(finding(
    'invalid-concept-boundary-list',
    'error',
    path,
    'Concept includes/excludes must be a unique array of at most 20 non-empty strings.',
  ));
}

function validateCompetencyAnswers({
  analysis,
  proposal,
  availableSources,
  evidenceBySource,
  conceptSlugs,
  proposalPaths,
  relationKeys,
  findings,
}) {
  let answered = 0;
  const findingStart = findings.length;
  for (const contract of COMPETENCY_QUESTION_CONTRACTS) {
    const path = `competencyAnswers.${contract.id}`;
    const row = proposal.competencyAnswers?.[contract.id];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      findings.push(finding(
        'unstructured-competency-answer',
        'error',
        path,
        `Competency answer "${contract.id}" must include answer, status, and typed witnesses.`,
      ));
      continue;
    }
    if (!nonEmpty(row.answer)) {
      findings.push(finding(
        'unanswered-competency-question',
        'error',
        `${path}.answer`,
        `Competency answer "${contract.id}" needs a non-empty answer.`,
      ));
    }
    if (!COMPETENCY_STATUSES.has(row.status)) {
      findings.push(finding(
        'invalid-competency-status',
        'error',
        `${path}.status`,
        `Competency status must be answered, partial, or visible-gap.`,
      ));
    }
    const witnesses = row.witnesses;
    if (
      !witnesses ||
      typeof witnesses !== 'object' ||
      COMPETENCY_WITNESS_KEYS.some((key) => !Array.isArray(witnesses[key]))
    ) {
      findings.push(finding(
        'invalid-competency-witnesses',
        'error',
        `${path}.witnesses`,
        `Competency witnesses must contain concepts, relations, evidence, and paths arrays.`,
      ));
      continue;
    }

    for (const [index, slug] of witnesses.concepts.entries()) {
      if (!nonEmpty(slug) || !conceptSlugs.has(slug)) {
        findings.push(finding(
          'unknown-competency-concept',
          'error',
          `${path}.witnesses.concepts[${index}]`,
          `Competency witness concept is absent from the proposal or shared ontology: ${slug ?? ''}`,
          [slug].filter(nonEmpty),
        ));
      }
    }
    for (const [index, relation] of witnesses.relations.entries()) {
      if (
        !relation ||
        typeof relation !== 'object' ||
        !nonEmpty(relation.from) ||
        !nonEmpty(relation.to) ||
        !nonEmpty(relation.type) ||
        !relationKeys.has(relationKey(relation))
      ) {
        findings.push(finding(
          'unknown-competency-relation',
          'error',
          `${path}.witnesses.relations[${index}]`,
          `Competency witness relation is absent from the validated proposal.`,
          [relation?.from, relation?.to].filter(nonEmpty),
        ));
      }
    }
    for (const [index, source] of witnesses.evidence.entries()) {
      if (!nonEmpty(source) || !availableSources.has(source)) {
        findings.push(finding(
          'unknown-competency-evidence',
          'error',
          `${path}.witnesses.evidence[${index}]`,
          `Competency witness evidence is absent from the analysis packet: ${source ?? ''}`,
          [source].filter(nonEmpty),
        ));
        continue;
      }
      const semantic = evidenceBySource.get(source);
      if (semantic?.trust === 'untrusted-instruction') {
        findings.push(finding(
          'untrusted-competency-evidence',
          'error',
          `${path}.witnesses.evidence[${index}]`,
          `Untrusted instruction content cannot support a competency answer: ${source}`,
          [source],
        ));
      } else if (semantic?.trust === 'claim-review-required') {
        findings.push(finding(
          'risky-competency-evidence',
          'warning',
          `${path}.witnesses.evidence[${index}]`,
          `This competency witness needs independent current-state corroboration: ${source}`,
          [source],
        ));
      }
    }
    for (const [index, sourcePath] of witnesses.paths.entries()) {
      if (!repositoryPathExists(analysis.rootPath, sourcePath)) {
        findings.push(finding(
          'missing-competency-path',
          'error',
          `${path}.witnesses.paths[${index}]`,
          `Competency witness path is absent from the repository or escapes its root: ${sourcePath ?? ''}`,
          [sourcePath].filter(nonEmpty),
        ));
      } else if (!proposalPaths.has(sourcePath)) {
        findings.push(finding(
          'unattached-competency-path',
          'error',
          `${path}.witnesses.paths[${index}]`,
          `Competency witness path is not attached to any proposed concept: ${sourcePath}`,
          [sourcePath],
        ));
      }
    }

    if (row.status === 'answered') {
      let complete = true;
      for (const witnessKey of contract.requiredWitnesses) {
        if (witnesses[witnessKey].length > 0) continue;
        complete = false;
        findings.push(finding(
          'missing-competency-witness',
          'error',
          `${path}.witnesses.${witnessKey}`,
          `Answered competency "${contract.id}" requires at least one ${witnessKey} witness.`,
        ));
      }
      if (
        contract.id === 'impact' &&
        !witnesses.relations.some((relation) => relation?.type === 'depends_on')
      ) {
        complete = false;
        findings.push(finding(
          'missing-impact-dependency-witness',
          'error',
          `${path}.witnesses.relations`,
          `An answered impact competency requires a depends_on relation witness.`,
        ));
      }
      const coverage = evaluateQuantifiedCompetencyCoverage({
        id: contract.id,
        domains: proposal.domains,
        capabilities: proposal.capabilities,
        witnesses,
        requireCapabilityPaths: true,
      });
      if (coverage && coverage.uncovered.length > 0) {
        complete = false;
        findings.push(finding(
          'incomplete-competency-coverage',
          'error',
          path,
          `Answered competency "${contract.id}" covers ${coverage.covered.length} of ${coverage.targetSet.length} required targets.`,
          coverage.uncovered,
        ));
      }
      if (complete) answered += 1;
    } else if (COMPETENCY_STATUSES.has(row.status)) {
      if (!nonEmpty(row.gap)) {
        findings.push(finding(
          'missing-competency-gap',
          'error',
          `${path}.gap`,
          `A ${row.status} competency answer must state the remaining evidence gap.`,
        ));
      } else {
        findings.push(finding(
          row.status === 'partial'
            ? 'partial-competency-answer'
            : 'visible-competency-gap',
          'warning',
          path,
          `Competency "${contract.id}" remains ${row.status}: ${row.gap}`,
        ));
      }
    }
  }
  const competencyFindings = findings.slice(findingStart);
  return {
    allAnswered: answered === COMPETENCY_QUESTION_CONTRACTS.length,
    witnessesResolved: !competencyFindings.some((row) => row.severity === 'error'),
  };
}

function validateCitationsAndConfidence({
  row,
  path,
  availableSources,
  evidenceBySource,
  findings,
  label,
}) {
  if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
    findings.push(finding(
      'missing-citation',
      'error',
      path,
      `Every ${label} claim needs at least one repository evidence source.`,
    ));
  } else {
    const safeSources = [];
    for (const source of row.evidence) {
      if (!availableSources.has(source)) {
        findings.push(finding(
          'unknown-citation',
          'error',
          path,
          `Citation is not present in the analysis evidence packet: ${source}`,
          [source],
        ));
        continue;
      }
      const semantic = evidenceBySource.get(source);
      if (semantic?.trust === 'untrusted-instruction') {
        findings.push(finding(
          'untrusted-citation',
          'error',
          path,
          `Untrusted instruction content cannot support a ${label} assertion: ${source}`,
          [source],
        ));
      } else if (semantic?.trust === 'claim-review-required') {
        findings.push(finding(
          'risky-citation',
          'warning',
          path,
          `Temporal, negated, or deprecated ${label} evidence needs an independent current-state source: ${source}`,
          [source],
        ));
      // Structural candidates prove paths, not independent current product meaning.
      } else if (semantic) {
        safeSources.push(source);
      }
    }
    const usesRiskyEvidence = row.evidence.some(
      (source) => evidenceBySource.get(source)?.trust === 'claim-review-required',
    );
    if (usesRiskyEvidence && safeSources.length === 0) {
      findings.push(finding(
        'risky-citation-unconfirmed',
        'error',
        path,
        `Risky ${label} evidence has no independent current-state corroboration.`,
        row.evidence,
      ));
    }
  }
  if (
    typeof row.confidence !== 'number' ||
    row.confidence < 0 ||
    row.confidence > 1
  ) {
    findings.push(finding(
      'invalid-confidence',
      'error',
      path,
      'confidence must be a number between 0 and 1.',
    ));
  }
}

function repositoryPathExists(rootPath, value) {
  if (!nonEmpty(rootPath) || !nonEmpty(value) || isAbsolute(value)) return false;
  const absoluteRoot = resolve(rootPath);
  const candidate = resolve(absoluteRoot, value);
  const relativePath = relative(absoluteRoot, candidate);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) return false;
  return existsSync(candidate);
}

function textNamesExactPath(text, path) {
  if (!nonEmpty(text) || !nonEmpty(path)) return false;
  const pathCharacter = /[A-Za-z0-9_./-]/;
  let offset = 0;
  while (offset <= text.length - path.length) {
    const index = text.indexOf(path, offset);
    if (index < 0) return false;
    const before = index > 0 ? text[index - 1] : '';
    const afterIndex = index + path.length;
    const after = afterIndex < text.length ? text[afterIndex] : '';
    if ((!before || !pathCharacter.test(before)) && (!after || !pathCharacter.test(after))) {
      return true;
    }
    offset = index + path.length;
  }
  return false;
}

function buildWritePlan(proposal) {
  const typedConcepts = [
    ['project', proposal.project],
    ...proposal.domains.map((row) => ['domain', row]),
    ...proposal.capabilities.map((row) => ['capability', row]),
    ...proposal.elements.map((row) => ['element', row]),
  ];
  const outgoing = new Map();
  for (const relation of proposal.relations) {
    const rows = outgoing.get(relation.from) ?? [];
    rows.push(relation);
    outgoing.set(relation.from, rows);
  }
  return {
    concepts: typedConcepts.map(([kind, concept]) => ({
      slug: concept.slug,
      kind,
      title: concept.title,
      ...(nonEmpty(concept.domain) ? { domain: concept.domain } : {}),
      ...(nonEmpty(concept.path) ? { path: concept.path } : {}),
      body: buildConceptBody(
        concept,
        outgoing.get(concept.slug) ?? [],
        kind === 'project' ? proposal.competencyAnswers : null,
      ),
    })),
    relations: proposal.relations.map(({ from, to, type, why }) => ({
      from,
      to,
      type,
      why,
    })),
    competencyAnswers: normalizeCompetencyAnswers(proposal.competencyAnswers),
  };
}

function buildConceptBody(concept, relations, competencyAnswers = null) {
  const sections = [
    ['Definition', concept.definition],
    ['Evidence', concept.evidence.map((source) => `- \`${source}\``).join('\n')],
    ['Confidence', String(concept.confidence)],
  ];
  if (concept.includes?.length) {
    sections.push(['Includes', concept.includes.map((row) => `- ${row}`).join('\n')]);
  }
  if (concept.excludes?.length) {
    sections.push(['Excludes', concept.excludes.map((row) => `- ${row}`).join('\n')]);
  }
  if (nonEmpty(concept.uncertainty)) {
    sections.push(['Uncertainty', concept.uncertainty]);
  }
  if (relations.length > 0) {
    sections.push(['Relations', relations.map((relation) => [
      `- \`${relation.type}\` → \`${relation.to}\`: ${relation.why}`,
      `  - Evidence: ${relation.evidence.map((source) => `\`${source}\``).join(', ')}`,
      `  - Confidence: ${relation.confidence}`,
    ].join('\n')).join('\n')]);
  }
  const rendered = sections.map(([heading, body]) => `## ${heading}\n\n${body}`).join('\n\n');
  return competencyAnswers
    ? `${rendered}\n\n${renderProjectCompetencyMarkdown(competencyAnswers)}`
    : `${rendered}\n`;
}

function normalizeCompetencyAnswers(answers) {
  return Object.fromEntries(
    COMPETENCY_QUESTION_CONTRACTS.map(({ id }) => {
      const row = answers[id];
      return [id, {
        answer: row.answer,
        status: row.status,
        ...(nonEmpty(row.gap) ? { gap: row.gap } : {}),
        witnesses: {
          concepts: [...row.witnesses.concepts],
          relations: row.witnesses.relations.map(({ from, to, type }) => ({
            from,
            to,
            type,
          })),
          evidence: [...row.witnesses.evidence],
          paths: [...row.witnesses.paths],
        },
      }];
    }),
  );
}

function relationKey(relation) {
  return `${relation.from}\u0000${relation.type}\u0000${relation.to}`;
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
  for (const field of ['domains', 'capabilities', 'elements', 'relations']) {
    if (!Array.isArray(proposal[field])) {
      throw new TypeError(`proposal.${field} must be an array`);
    }
  }
  for (const [path, concept] of [
    ['project', proposal.project],
    ...proposal.domains.map((row, index) => [`domains[${index}]`, row]),
    ...proposal.capabilities.map((row, index) => [`capabilities[${index}]`, row]),
    ...proposal.elements.map((row, index) => [`elements[${index}]`, row]),
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
  for (const [index, element] of proposal.elements.entries()) {
    if (!nonEmpty(element.domain)) {
      throw new TypeError(`proposal.elements[${index}].domain must be a non-empty string`);
    }
    if (!nonEmpty(element.path)) {
      throw new TypeError(`proposal.elements[${index}].path must be a non-empty string`);
    }
  }
  for (const [index, relation] of proposal.relations.entries()) {
    if (!relation || typeof relation !== 'object') {
      throw new TypeError(`proposal.relations[${index}] must be an object`);
    }
    for (const field of ['from', 'to', 'type', 'why']) {
      if (!nonEmpty(relation[field])) {
        throw new TypeError(`proposal.relations[${index}].${field} must be a non-empty string`);
      }
    }
    if (relation.evidence != null && (
      !Array.isArray(relation.evidence) ||
      relation.evidence.some((source) => !nonEmpty(source))
    )) {
      throw new TypeError(`proposal.relations[${index}].evidence must be an array of non-empty strings`);
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
