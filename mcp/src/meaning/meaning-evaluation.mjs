import { WRITE_RELATION_TYPE_VALUES } from '../ontology-engine.mjs';
import { MEANING_COMPETENCY_QUESTIONS } from './meaning-assessment.mjs';
import { parseTaskNavigationEvidenceSource } from '../agent-brief/task-navigation-evidence.mjs';
import { parseSourceRangeCitation } from './source-range-citation.mjs';
import {
  MEANING_AUTHORITY_CONFIDENCE_THRESHOLD,
  MEANING_AUTHORITY_MIN_SOURCES,
  PURPOSE_AUTHORITY_ROLES,
  alignedSemanticAuthoritySources,
  domainAuthoritySources,
} from './meaning-authority.mjs';
import { validateCompetencyAnswers } from './proposal-competency-review.mjs';
import {
  repositoryPathExists,
  textNamesExactPath,
  validateCitationsAndConfidence,
  validateElementTaskNavigationEvidence,
  validateOptionalConceptBoundaryList,
} from './proposal-evidence-review.mjs';
import { finding, nonEmpty, proposalGates, relationKey } from './proposal-findings.mjs';
import { validateRepositoryProposalShape } from './proposal-shape.mjs';
import { buildWritePlan } from './meaning-write-plan.mjs';
/*
 * The rule lives in the text layer so the write-path findings share it without
 * importing this module, which would close a cycle
 * (`ontology-engine` → findings → here → `ontology-engine`).
 */
import { isEpistemicExclusionBoundary } from '../construction/construction-rules.mjs';

export {
  candidateProposalFromAnalysis,
  evaluateMeaningProposal,
  proposalFromGolden,
  repositoryProposalFromGolden,
} from './golden-corpus-scoring.mjs';

export const COMPETENCY_QUESTION_CONTRACTS = MEANING_COMPETENCY_QUESTIONS;

const SELECTED_IMPORT_ELEMENT_LIMIT = 4;

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
  const sourceEvidenceRows = (importEvidence.sourceEvidence?.rows ?? [])
    .filter((row) => row.status === 'read');
  const sourceEvidenceCitations = new Set(sourceEvidenceRows.map((row) => row.citation));
  for (const citation of sourceEvidenceCitations) {
    if (parseSourceRangeCitation(citation) !== null) continue;
    findings.push(finding(
      'source-citation-unpersistable',
      'error',
      'sourceReads',
      'Source-range evidence must use a persistable safe relative path and exact range/hash grammar.',
      [citation],
    ));
  }
  const availableSources = new Set([
    ...evidenceBySource.keys(),
    ...analysis.domains.map((row) => row.evidence?.source),
    ...analysis.capabilities.map((row) => row.evidence?.source),
    ...analysis.elements.map((row) => row.evidence?.source),
    ...importEndpointSources,
    ...sourceEvidenceCitations,
  ].filter(Boolean));
  if ((importEvidence.sourceEvidence?.rows ?? []).some((row) => row.status !== 'read')) {
    findings.push(finding(
      'incomplete-source-replay',
      'error',
      'sourceReads',
      'Every requested source range must be freshly delivered before proposal review or release.',
      (importEvidence.sourceEvidence?.rows ?? []).filter((row) => row.status !== 'read').map((row) => row.path),
    ));
  }
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
    if (Array.isArray(concept.excludes)) {
      for (const [boundaryIndex, boundary] of concept.excludes.entries()) {
        if (!nonEmpty(boundary) || !isEpistemicExclusionBoundary(boundary)) continue;
        findings.push(finding(
          'epistemic-exclusion-boundary',
          'error',
          `${path}.excludes[${boundaryIndex}]`,
          'Excludes must state a sourced product/concept boundary, not an unknown or unmeasured evidence limit. Move this statement to uncertainty or a competency gap.',
        ));
      }
      /*
       * A project exclusion inherits the scope answer that governs it. A source-hidden reader cannot
       * check an exclusion, so an unfinished scope answer beside one is a warning. Fabrication is not
       * detected.
       */
      if (concept === proposal.project && concept.excludes.some((row) => nonEmpty(row))) {
        const scopeStatus = proposal.competencyAnswers?.scope?.status;
        if (scopeStatus && scopeStatus !== 'answered') {
          findings.push(finding(
            'unqualified-project-exclusion',
            'warning',
            `${path}.excludes`,
            `The project states ${concept.excludes.length} exclusion(s) while its scope competency answer is "${scopeStatus}". A project-level exclusion cannot be checked against the source, so it carries that same status until the scope answer is complete.`,
          ));
        }
      }
    }
    const navigationEvidence = (concept.evidence ?? [])
      .map((source) => ({ source, parsed: parseTaskNavigationEvidenceSource(source) }))
      .filter((row) => row.parsed !== null);
    const isElement = proposal.elements.includes(concept);
    if (!isElement && navigationEvidence.length > 0) {
      findings.push(finding(
        'navigation-evidence-non-element',
        'error',
        `${path}.evidence`,
        'Task-navigation coordinates are implementation evidence and may be authored only on element concepts.',
        navigationEvidence.map((row) => row.source),
      ));
    }
    validateCitationsAndConfidence({
      row: {
        ...concept,
        evidence: (concept.evidence ?? []).filter(
          (source) => parseTaskNavigationEvidenceSource(source) === null,
        ),
      },
      path,
      availableSources,
      evidenceBySource,
      findings,
      label: 'meaning',
    });
  }

  if (
    proposal.project.confidence >= MEANING_AUTHORITY_CONFIDENCE_THRESHOLD &&
    alignedSemanticAuthoritySources({
      sources: proposal.project.evidence,
      claim: `${proposal.project.title}\n${proposal.project.definition}`,
      evidenceBySource,
      allowedRoles: PURPOSE_AUTHORITY_ROLES,
    }).length < MEANING_AUTHORITY_MIN_SOURCES
  ) {
    findings.push(finding(
      'insufficient-purpose-authority',
      'error',
      'project',
      'High-confidence repository purpose needs two claim-aligned current semantic sources, or it must remain below 0.8 with an explicit competency gap.',
      proposal.project.evidence,
    ));
  }

  for (const [index, domain] of proposal.domains.entries()) {
    if (
      domain.confidence < MEANING_AUTHORITY_CONFIDENCE_THRESHOLD ||
      sharedDomains.has(domain.slug)
    ) {
      continue;
    }
    const alignedSources = domainAuthoritySources({
      sources: domain.evidence,
      domain,
      claim: `${domain.title}\n${domain.definition}`,
      evidenceBySource,
    });
    if (alignedSources.length >= MEANING_AUTHORITY_MIN_SOURCES) continue;
    findings.push(finding(
      'insufficient-domain-authority',
      'error',
      `concepts[${index}]`,
      `High-confidence domain meaning needs two responsibility-specific current semantic sources, or it must remain below 0.8 with an explicit competency gap: ${domain.slug}`,
      domain.evidence,
    ));
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
    validateElementTaskNavigationEvidence({
      element,
      index,
      rootPath: analysis.rootPath,
      findings,
    });
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
    const proposedDomain = proposal.domains.find(
      (domain) => domain.slug === relation.to,
    );
    if (
      relation.from === proposal.project.slug &&
      proposedDomain &&
      !sharedDomains.has(proposedDomain.slug) &&
      relation.confidence >= MEANING_AUTHORITY_CONFIDENCE_THRESHOLD &&
      domainAuthoritySources({
        sources: relation.evidence,
        domain: proposedDomain,
        claim: `${proposedDomain.title}\n${proposedDomain.definition}\n${relation.why}`,
        evidenceBySource,
      }).length < MEANING_AUTHORITY_MIN_SOURCES
    ) {
      findings.push(finding(
        'insufficient-domain-relation-authority',
        'error',
        path,
        'A high-confidence project-to-domain relation needs two responsibility-specific current semantic sources, or it must remain below 0.8.',
        relation.evidence,
      ));
    }
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
    sourceEvidenceCitations,
    sharedDomains,
    conceptSlugs: relationEndpoints,
    proposalPaths: new Set(concepts.map((row) => row.path).filter(nonEmpty)),
    relationKeys,
    findings,
  });

  const errors = findings.filter((row) => row.severity === 'error').length;
  const warnings = findings.filter((row) => row.severity === 'warning').length;
  const gates = proposalGates(proposal, findings, competencyAudit);
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
