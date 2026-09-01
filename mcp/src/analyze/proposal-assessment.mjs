// `buildProposalAssessment` — the second export of the analyze surface. It judges a
// proposed meaning set against the analysis that produced it and returns the
// questions, quality findings, and lifecycle verdict an agent must answer before
// writing anything to the vault.

import { createHash } from 'node:crypto';
import { uniqueStrings } from './text.mjs';

/**
 * Turn the candidate-only result into an independently reviewable, but never
 * self-qualifying, competency packet. The statuses here describe how much of
 * the proposal can be inspected from this bounded result; they are deliberately
 * not the qualification contract's `answered` status.
 */
export function buildProposalAssessment(result) {
  const {
    project,
    domains,
    capabilities,
    elements,
    meaningGate,
    extractionContract,
    semanticEvidence,
    suggestedRelations,
    skipped,
  } = result;
  const candidateDomains = meaningGate.proposedBusinessOntology.domains;
  const candidateCapabilities = meaningGate.proposedBusinessOntology.capabilities;
  const persistedDomains = meaningGate.businessOntology.domains;
  const persistedCapabilities = meaningGate.businessOntology.capabilities;
  const dependencyRelations = suggestedRelations.filter((relation) => relation.type === 'depends_on');
  const productionBoundaryCount = extractionContract.qualityGates.typedRelationsProposed
    - suggestedRelations.filter((relation) => relation.type === 'contains').length;
  const trustedEvidence = semanticEvidence.filter((row) => row.trust === 'candidate-evidence');
  const riskEvidence = semanticEvidence.filter(
    (row) =>
      row.riskFlags.length > 0 ||
      (row.reviewRequiredEvidence?.length ?? 0) > 0,
  );
  const digestInput = {
    framework: result.framework,
    project,
    domains,
    capabilities,
    elements,
    meaningGate,
    extractionContract,
    semanticEvidence,
    configurationEvidence: result.configurationEvidence,
    suggestedRelations,
    skipped,
  };
  const sourceRefs = uniqueStrings(trustedEvidence.map((row) => row.source));
  const projectRefs = project ? [project.slug] : [];
  const domainRefs = uniqueStrings([
    ...domains.map((row) => row.slug),
    ...candidateDomains.map((row) => row.slug),
  ]);
  const capabilityRefs = uniqueStrings([
    ...capabilities.map((row) => row.slug),
    ...candidateCapabilities.map((row) => row.slug),
  ]);
  const elementRefs = elements.map((row) => row.slug);

  const evidence = {
    project: project
      ? [
          {
            evidenceType: 'project-purpose',
            sourceRef: project.evidence?.[0] ?? sourceRefs[0] ?? 'repository-root',
            location: project.evidence?.[0] ?? 'repository-root',
            excerpt: project.definition ?? project.title,
            resolution: project.definition ? 'bounded-candidate' : 'identity-only',
            supports: Boolean(project.definition && project.evidence?.length),
          },
        ]
      : [],
    domains: candidateDomains.slice(0, 12).map((row) => ({
      evidenceType: 'domain-candidate',
      sourceRef: row.evidence?.source ?? 'repository-structure',
      location: row.evidence?.line ? `${row.evidence.source}:${row.evidence.line}` : row.evidence?.source ?? 'repository-structure',
      excerpt: row.definition ?? row.reason,
      resolution: row.confidence >= 0.8 ? 'bounded-candidate' : 'proposal-only',
      supports: Boolean(row.evidence?.source),
    })),
    capabilities: candidateCapabilities.slice(0, 12).map((row) => ({
      evidenceType: 'capability-candidate',
      sourceRef: row.evidence?.source ?? row.evidenceSources?.[0] ?? 'repository-structure',
      location: row.evidence?.implementation ?? row.evidence?.source ?? 'repository-structure',
      excerpt: row.definition ?? row.reason,
      resolution: row.confidence >= 0.8 ? 'bounded-candidate' : 'proposal-only',
      supports: Boolean(row.evidence?.source || row.evidenceSources?.length),
    })),
    elements: elements.slice(0, 24).map((row) => ({
      evidenceType: 'implementation-path',
      sourceRef: row.evidence?.source ?? row.path,
      location: row.path,
      excerpt: `${row.title}; observed implementation path: ${row.path}`,
      resolution: 'path-observed',
      supports: Boolean(row.path && row.evidence?.source),
    })),
    relations: dependencyRelations.slice(0, 24).map((row) => ({
      evidenceType: 'static-production-import',
      sourceRef: row.evidence?.[0] ?? 'infer_imports',
      location: row.evidence?.join(', ') ?? 'infer_imports',
      excerpt: row.why,
      resolution: 'static-only',
      supports: Boolean(row.from && row.to && row.evidence?.length),
    })),
    omissions: skipped.slice(0, 12).map((row) => ({
      evidenceType: 'bounded-scan-omission',
      sourceRef: row.path,
      location: row.path,
      excerpt: row.reason,
      resolution: 'bounded-scan',
      supports: false,
    })),
  };

  const questions = [
    makeAssessmentQuestion({
      id: 'scope',
      status: project?.definition && project?.evidence?.length ? 'partial' : 'missing',
      statusReason: project?.definition
        ? 'A repository-purpose candidate is bounded by evidence, but no shared semantic approval is present.'
        : 'No bounded project-purpose witness was found in the scanned evidence.',
      claim: project?.definition ?? 'Repository purpose is not established by this bounded scan.',
      candidateRefs: projectRefs,
      questionEvidence: evidence.project,
      limits: [
        'Repository prose is a proposal witness, not a shared business assertion.',
        ...(project?.excludes ?? []),
        ...(project?.uncertainty ? [project.uncertainty] : []),
      ],
      nextAction: {
        action: 'qualify_project_scope',
        targets: sourceRefs.slice(0, 6),
        completionCriterion: 'An independent evaluator confirms the purpose, includes, and excludes against portable evidence.',
      },
    }),
    makeAssessmentQuestion({
      id: 'domains',
      status: persistedDomains.length > 0
        ? 'reviewable_candidate'
        : candidateDomains.length > 0
          ? 'partial'
          : 'missing',
      statusReason: persistedDomains.length > 0
        ? 'Persisted domain evidence is available for review.'
        : candidateDomains.length > 0
          ? 'Domain-shaped candidates exist, but repository headings do not establish stable business boundaries.'
          : 'No bounded domain candidate with independent evidence was found.',
      claim: candidateDomains.length > 0
        ? `${candidateDomains.length} bounded domain candidate(s) require boundary review.`
        : 'No business domain boundary is asserted.',
      candidateRefs: domainRefs,
      questionEvidence: evidence.domains,
      limits: [
        'README headings and folder names are structural clues, not shared domain meaning.',
        'Overlaps, ownership, and external-system boundaries are not established by this scan.',
      ],
      nextAction: {
        action: 'confirm_domain_boundaries',
        targets: domainRefs.slice(0, 12),
        completionCriterion: 'Each retained domain has an independent responsibility sentence, excludes, and evidence-backed placement.',
      },
    }),
    makeAssessmentQuestion({
      id: 'abilities',
      status: candidateCapabilities.length > 0
        ? 'reviewable_candidate'
        : capabilities.length > 0
          ? 'partial'
          : 'missing',
      statusReason: candidateCapabilities.length > 0
        ? 'Outcome-oriented candidate abilities have bounded prose and implementation witnesses, but remain unqualified.'
        : capabilities.length > 0
          ? 'Implementation-shaped capabilities exist without enough independent business outcome evidence.'
          : 'No capability candidate was found.',
      claim: candidateCapabilities.length > 0
        ? `${candidateCapabilities.length} outcome-oriented capability candidate(s) are reviewable without automatic promotion.`
        : 'No business ability is asserted by this bounded scan.',
      candidateRefs: capabilityRefs,
      questionEvidence: evidence.capabilities,
      limits: [
        'A capability candidate is not a persisted capability and cannot be admitted automatically.',
        'The scan does not establish ownership, user success criteria, or complete behavior.',
      ],
      nextAction: {
        action: 'confirm_capability_outcomes',
        targets: capabilityRefs.slice(0, 12),
        completionCriterion: 'Each retained ability states an observable outcome, responsibility boundary, excludes, and evidence path.',
      },
    }),
    makeAssessmentQuestion({
      id: 'evidence',
      status: elements.length > 0 && elements.every((row) => row.path && row.evidence?.source)
        ? 'reviewable_candidate'
        : elements.length > 0
          ? 'partial'
          : 'missing',
      statusReason: elements.length > 0
        ? 'Implementation elements expose bounded repository-relative paths; role accuracy still requires review.'
        : 'No implementation element path was admitted by this bounded scan.',
      claim: `${elements.length} implementation element candidate(s) carry repository-relative evidence paths.`,
      candidateRefs: elementRefs,
      questionEvidence: evidence.elements,
      limits: [
        'A path proves an observable implementation location, not the business role assigned to it.',
        'Unsupported languages, runtime behavior, and tests are not silently inferred.',
      ],
      nextAction: {
        action: 'resolve_implementation_citations',
        targets: elementRefs.slice(0, 24),
        completionCriterion: 'Every retained ability has an exact, portable implementation path whose role is independently confirmed.',
      },
    }),
    makeAssessmentQuestion({
      id: 'impact',
      status: dependencyRelations.length > 0 ? 'reviewable_candidate' : 'unmeasured',
      statusReason: dependencyRelations.length > 0
        ? 'Static production import boundaries are available as review candidates; runtime impact is not measured.'
        : productionBoundaryCount > 0
          ? 'Typed import boundaries were observed, but no bounded dependency proposal was safe to emit.'
          : 'No production dependency witness was available in this bounded scan.',
      claim: dependencyRelations.length > 0
        ? `${dependencyRelations.length} bounded static dependency candidate(s) are available for impact review.`
        : 'Impact remains unmeasured.',
      candidateRefs: uniqueStrings(dependencyRelations.flatMap((row) => [row.from, row.to])),
      questionEvidence: evidence.relations,
      limits: [
        'Static imports are not runtime impact, business dependency, or approval to write depends_on.',
        'A dependency relation requires exact direction, rationale, and independent semantic review.',
      ],
      nextAction: {
        action: 'review_dependency_impact',
        targets: dependencyRelations.slice(0, 24).map((row) => `${row.from}->${row.to}`),
        completionCriterion: 'An independent evaluator confirms direction and business impact, or records a visible gap without promotion.',
      },
    }),
    makeAssessmentQuestion({
      id: 'omissions',
      status: skipped.length > 0 || extractionContract.limitations.length > 0 ? 'partial' : 'unmeasured',
      statusReason: 'The scan reports bounded omissions and limitations, but cannot establish the behavior of what it did not inspect.',
      claim: `${skipped.length} bounded scan omission(s) and ${extractionContract.limitations.length} general limitation(s) are visible.`,
      candidateRefs: uniqueStrings([...projectRefs, ...domainRefs, ...capabilityRefs]),
      questionEvidence: evidence.omissions,
      limits: [
        'Runtime, test, package, external-system, and unsupported-language behavior may remain outside this scan.',
        'A missing witness is not evidence that the behavior does not exist.',
      ],
      nextAction: {
        action: 'inspect_omitted_behavior',
        targets: uniqueStrings(skipped.map((row) => row.path)).slice(0, 12),
        completionCriterion: 'Each omission is either covered by a portable witness or kept visible as an unresolved gap.',
      },
    }),
  ];

  const qualityFindings = [];
  if (persistedDomains.length === 0 && persistedCapabilities.length === 0 && (candidateDomains.length > 0 || candidateCapabilities.length > 0)) {
    qualityFindings.push(makeQualityFinding({
      category: 'weak_meaning',
      severity: 'warning',
      summary: 'Repository evidence proposes meaning, but no shared business ontology is available to confirm it.',
      affectedQuestionIds: ['scope', 'domains', 'abilities'],
      affectedCandidateRefs: uniqueStrings([...projectRefs, ...domainRefs, ...capabilityRefs]),
      evidenceRefs: sourceRefs.slice(0, 6),
      detectionBasis: 'persisted business domain/capability evidence is empty while proposal candidates are present',
      remediation: 'Keep candidates proposal-only and obtain an independent semantic witness before admission.',
    }));
  }
  if (candidateDomains.length === 0 || candidateDomains.some((row) => row.reason?.includes('heading'))) {
    qualityFindings.push(makeQualityFinding({
      category: 'missing_boundary',
      severity: 'warning',
      summary: candidateDomains.length === 0
        ? 'No stable business domain boundary was found.'
        : 'Some domain candidates are heading-shaped and need explicit responsibility boundaries.',
      affectedQuestionIds: ['domains', 'omissions'],
      affectedCandidateRefs: domainRefs,
      evidenceRefs: sourceRefs.slice(0, 6),
      detectionBasis: candidateDomains.length === 0 ? 'no domain candidate with bounded evidence' : 'domain candidate reason identifies heading-only evidence',
      remediation: 'Supply a responsibility sentence, includes/excludes, ownership boundary, and independent source witness.',
    }));
  }
  if (dependencyRelations.length > 0 || productionBoundaryCount > 0) {
    qualityFindings.push(makeQualityFinding({
      category: 'runtime_impact_unmeasured',
      severity: 'warning',
      summary: 'Static production import evidence is visible, but runtime and business impact remain unmeasured.',
      affectedQuestionIds: ['impact'],
      affectedCandidateRefs: uniqueStrings(dependencyRelations.flatMap((row) => [row.from, row.to])),
      evidenceRefs: uniqueStrings(dependencyRelations.flatMap((row) => row.evidence ?? [])).slice(0, 12),
      detectionBasis: `${dependencyRelations.length} bounded depends_on candidate(s) or ${productionBoundaryCount} typed relation(s) observed`,
      remediation: 'Review exact direction and rationale independently; do not promote the edge to ontology truth without impact evidence.',
    }));
  }
  if (riskEvidence.length > 0) {
    qualityFindings.push(makeQualityFinding({
      category: 'policy_risk_conflict',
      severity: 'warning',
      summary: 'Evidence carries policy/risk flags that require review before semantic promotion.',
      affectedQuestionIds: ['scope', 'domains', 'abilities', 'omissions'],
      affectedCandidateRefs: uniqueStrings([...domainRefs, ...capabilityRefs]),
      evidenceRefs: riskEvidence.map((row) => row.source).slice(0, 12),
      detectionBasis: 'semantic evidence rows contain explicit riskFlags',
      remediation: 'Inspect each flagged source, distinguish current policy from instruction/future/negated prose, and record any contradiction explicitly.',
    }));
  }

  return {
    schemaVersion: 'proposalAssessment:v1',
    assessmentPolicyVersion: 'q1-q6-proposal-only:v1',
    analyzerResultDigest: stableAssessmentDigest(digestInput),
    sourceVisibility: 'analyzer-visible',
    assessmentKind: 'proposal_competency',
    qualificationState: 'unqualified_proposal',
    admissionState: 'not_admitted',
    proposalOnly: true,
    questions,
    qualityFindings,
    globalCaveats: uniqueStrings([
      'This assessment is a review packet, not an ontology qualification result.',
      'No analyzer-generated status is equivalent to answered, verified, or qualified.',
      'Automatic business assertions, admission, and write plans remain blocked until the existing independent qualification lifecycle succeeds.',
      ...extractionContract.limitations,
    ]),
    recommendedNextAction: {
      action: 'independent_semantic_review',
      targets: uniqueStrings([...projectRefs, ...domainRefs, ...capabilityRefs]).slice(0, 24),
      completionCriterion: 'An independent evaluator resolves or preserves every Q1-Q6 gap with portable evidence before any write consideration.',
    },
  };
}

function makeAssessmentQuestion({
  id,
  status,
  statusReason,
  claim,
  candidateRefs,
  questionEvidence,
  limits,
  nextAction,
}) {
  return {
    id,
    status,
    statusReason,
    claim,
    candidateRefs: uniqueStrings(candidateRefs),
    evidence: questionEvidence,
    limits: uniqueStrings(limits),
    nextAction,
    blocksQualification: true,
  };
}

function makeQualityFinding({
  category,
  severity,
  summary,
  affectedQuestionIds,
  affectedCandidateRefs,
  evidenceRefs,
  detectionBasis,
  remediation,
}) {
  return {
    category,
    severity,
    summary,
    affectedQuestionIds,
    affectedCandidateRefs: uniqueStrings(affectedCandidateRefs),
    evidenceRefs: uniqueStrings(evidenceRefs),
    detectionBasis,
    remediation,
    blocksBeta: false,
    blocksQualification: true,
  };
}

function stableAssessmentDigest(value) {
  const canonical = (input) => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, canonical(child)]),
      );
    }
    return input;
  };
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex')}`;
}
