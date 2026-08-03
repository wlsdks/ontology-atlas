import { GET_CONCEPTS_FULL_BODY_MAX } from './vault.mjs';

const CONTRACT = 'meaningRepair:v1';
const QUESTION_IDS = ['abilities', 'evidence'];
const STOP_CONDITIONS = Object.freeze([
  'source_not_current',
  'graph_or_source_provenance_changed',
  'scope_or_receipt_limited',
  'validation_or_compile_error',
  'human_approval_missing',
  'unresolved_evidence_marked_answered',
  'mtime_conflict',
]);

function safeSlug(value, maxLength = 300) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value
    && !value.startsWith('/')
    && !/^[A-Za-z]:[\\/]/.test(value)
    && !value.includes('\\')
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function safeGraphHash(value) {
  return typeof value === 'string' && /^project-graph-v1:[a-f0-9]{8}$/.test(value);
}

function nonBlank(value, maxLength = 500) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function sorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function writePolicy() {
  return {
    humanApprovalRequired: true,
    automaticWrite: false,
    automaticFinalize: false,
  };
}

function blocked(projectSlug, reason) {
  return {
    contract: CONTRACT,
    status: 'blocked',
    projectSlug: safeSlug(projectSlug, 200) ? projectSlug : null,
    blockedBy: reason,
    primaryQuestion: null,
    questionsNeedingReview: [],
    provenance: null,
    questions: null,
    workflow: [],
    stopWhen: [...STOP_CONDITIONS],
    writePolicy: writePolicy(),
  };
}

function questionById(competency, id) {
  return competency?.questions?.find((row) => row?.id === id) ?? null;
}

function relationKey(value) {
  return `${value.from}\0${value.to}\0${value.type}`;
}

function workflow(projectSlug, domainSlugs, capabilitySlugs) {
  const reviewTargets = [...new Set([projectSlug, ...domainSlugs, ...capabilitySlugs])];
  const readCalls = [];
  for (let offset = 0; offset < reviewTargets.length; offset += GET_CONCEPTS_FULL_BODY_MAX) {
    readCalls.push({
      tool: 'get_concepts',
      arguments: {
        slugs: reviewTargets.slice(offset, offset + GET_CONCEPTS_FULL_BODY_MAX),
        body: 'full',
      },
    });
  }
  return [
    {
      step: 'read_review_inputs',
      derivation: { slugs: 'project_and_all_review_targets' },
      calls: readCalls,
    },
    { step: 'human_semantic_approval', calls: [] },
    {
      step: 'write_approved_project_body',
      calls: [{
        tool: 'patch_concept',
        arguments: { slug: projectSlug },
        requiredReviewArguments: ['body', 'expected_mtime'],
      }],
    },
    {
      step: 'verify',
      calls: [
        { tool: 'validate_vault', arguments: {} },
        { tool: 'compile_ontology', arguments: { summary: true } },
      ],
    },
    {
      step: 'refresh_conflict_guard',
      calls: [{ tool: 'get_concept', arguments: { slug: projectSlug, body: 'full' } }],
    },
    {
      step: 'finalize',
      calls: [{
        tool: 'finalize_project_meaning',
        arguments: { projectSlug },
        requiredReviewArguments: ['expected_mtime'],
      }],
    },
  ];
}

/**
 * Project the already-loaded graph/source inventory into a bounded human review packet.
 * This function never upgrades a competency answer and never carries private source coordinates.
 */
export function buildMeaningRepair(input = {}) {
  const {
    projectSlug,
    graphHash,
    meaningAssessment,
    competency,
    inventoryResult,
    scopedDocs,
  } = input;
  if (!safeSlug(projectSlug, 200) || !safeGraphHash(graphHash)) {
    return blocked(projectSlug, 'invalid_project_context');
  }
  if (
    meaningAssessment?.contract !== 'meaningAssessment:v1'
    || meaningAssessment.projectSlug !== projectSlug
    || meaningAssessment.dimensions?.source?.currentness !== 'current'
    || meaningAssessment.dimensions?.source?.status !== 'verified_current'
  ) return blocked(projectSlug, 'source_not_current');
  const provenance = meaningAssessment.provenance;
  if (
    provenance?.graphHash !== graphHash
    || !nonBlank(provenance.sourceFingerprint, 200)
    || !nonBlank(provenance.sourceMeasuredAt, 100)
  ) return blocked(projectSlug, 'provenance_mismatch');
  if (inventoryResult?.status !== 'ready') {
    return blocked(projectSlug, inventoryResult?.reason ?? 'witness_inventory_unavailable');
  }
  const inventory = inventoryResult.inventory;
  if (
    inventory?.graphHash !== graphHash
    || inventory?.sourceFingerprint !== provenance.sourceFingerprint
    || !Array.isArray(inventory.concepts)
    || !Array.isArray(inventory.relations)
    || !Array.isArray(inventoryResult.evidenceClaims)
    || !Array.isArray(scopedDocs)
  ) return blocked(projectSlug, 'witness_inventory_mismatch');

  const scope = new Set(inventory.concepts);
  const domains = scopedDocs
    .filter((doc) => scope.has(doc?.slug) && doc?.frontmatter?.kind === 'domain' && safeSlug(doc.slug))
    .map((doc) => doc.slug);
  const capabilities = scopedDocs
    .filter((doc) => (
      scope.has(doc?.slug)
      && doc?.frontmatter?.kind === 'capability'
      && safeSlug(doc.slug)
      && safeSlug(doc.frontmatter.domain)
    ))
    .map((doc) => ({
      slug: doc.slug,
      domain: doc.frontmatter.domain,
      path: doc.frontmatter.path,
    }));
  const domainSlugs = sorted(domains);
  const capabilitySlugs = sorted(capabilities.map(({ slug }) => slug));
  if (domainSlugs.length === 0 || capabilitySlugs.length === 0) {
    return blocked(projectSlug, 'meaning_targets_unavailable');
  }
  const domainSet = new Set(domainSlugs);
  const capabilityBySlug = new Map(capabilities.map((row) => [row.slug, row]));

  const structuralRelations = inventory.relations
    .filter((relation) => (
      relation
      && domainSet.has(relation.from)
      && capabilityBySlug.has(relation.to)
      && (relation.type === 'capabilities' || relation.type === 'contains')
      && capabilityBySlug.get(relation.to).domain === relation.from
    ))
    .sort((left, right) => relationKey(left).localeCompare(relationKey(right)));
  const capabilitiesByDomain = new Map(domainSlugs.map((slug) => [slug, []]));
  for (const relation of structuralRelations) {
    capabilitiesByDomain.get(relation.from).push(relation.to);
  }
  for (const [slug, rows] of capabilitiesByDomain) {
    capabilitiesByDomain.set(slug, sorted(rows));
  }
  const structurallySupportedDomains = new Set(
    domainSlugs.filter((slug) => capabilitiesByDomain.get(slug).length > 0),
  );

  const abilityQuestion = questionById(competency, 'abilities');
  const evidenceQuestion = questionById(competency, 'evidence');
  if (!abilityQuestion || !evidenceQuestion) {
    return blocked(projectSlug, 'competency_questions_unavailable');
  }
  const abilityWitnessConcepts = new Set(abilityQuestion.witnesses?.concepts ?? []);
  const validStructuralKeys = new Set(structuralRelations.map(relationKey));
  const declaredDomains = new Set(
    (abilityQuestion.witnesses?.relations ?? [])
      .filter((relation) => (
        validStructuralKeys.has(relationKey(relation))
        && abilityWitnessConcepts.has(relation.to)
      ))
      .map((relation) => relation.from),
  );

  const supportedEvidence = new Set();
  for (const claim of inventoryResult.evidenceClaims) {
    const capability = capabilityBySlug.get(claim?.concept);
    if (
      capability
      && nonBlank(claim.path)
      && nonBlank(capability.path)
      && capability.path === claim.path
    ) supportedEvidence.add(capability.slug);
  }
  const declaredEvidence = new Set(
    (evidenceQuestion.witnesses?.concepts ?? []).filter((slug) => capabilityBySlug.has(slug)),
  );

  const abilityRow = (slug) => ({
    slug,
    witnessCapabilities: capabilitiesByDomain.get(slug),
  });
  const abilityAlreadyDeclared = domainSlugs
    .filter((slug) => declaredDomains.has(slug) && structurallySupportedDomains.has(slug))
    .map(abilityRow);
  const abilityCandidateAdditions = domainSlugs
    .filter((slug) => !declaredDomains.has(slug) && structurallySupportedDomains.has(slug))
    .map(abilityRow);
  const abilityDeclaredWithoutSupport = domainSlugs
    .filter((slug) => declaredDomains.has(slug) && !structurallySupportedDomains.has(slug));
  const abilityUnresolved = domainSlugs.filter((slug) => !structurallySupportedDomains.has(slug));

  const evidenceAlreadyDeclared = capabilitySlugs
    .filter((slug) => declaredEvidence.has(slug) && supportedEvidence.has(slug));
  const evidenceCandidateAdditions = capabilitySlugs
    .filter((slug) => !declaredEvidence.has(slug) && supportedEvidence.has(slug));
  const evidenceDeclaredWithoutSupport = capabilitySlugs
    .filter((slug) => declaredEvidence.has(slug) && !supportedEvidence.has(slug));
  const evidenceUnresolved = capabilitySlugs.filter((slug) => !supportedEvidence.has(slug));

  const questions = {
    abilities: {
      basis: 'typed_containment',
      targetCount: domainSlugs.length,
      review: {
        state: 'structural_candidates_only',
        alreadyDeclared: abilityAlreadyDeclared,
        candidateAdditions: abilityCandidateAdditions,
        declaredWithoutSupport: abilityDeclaredWithoutSupport,
        unresolved: abilityUnresolved,
      },
    },
    evidence: {
      basis: 'current_source_canonical_path',
      targetCount: capabilitySlugs.length,
      review: {
        state: 'source_path_candidates_only',
        alreadyDeclared: evidenceAlreadyDeclared,
        candidateAdditions: evidenceCandidateAdditions,
        declaredWithoutSupport: evidenceDeclaredWithoutSupport,
        unresolved: evidenceUnresolved,
      },
    },
  };
  const questionStatuses = new Map([
    ['abilities', abilityQuestion.status],
    ['evidence', evidenceQuestion.status],
  ]);
  const questionsNeedingReview = QUESTION_IDS.filter((id) => (
    questionStatuses.get(id) !== 'answered'
    || questions[id].review.candidateAdditions.length > 0
    || questions[id].review.declaredWithoutSupport.length > 0
    || questions[id].review.unresolved.length > 0
  ));
  const requestedPrimary = meaningAssessment.nextAction?.target;
  const primaryQuestion = questionsNeedingReview.includes(requestedPrimary)
    ? requestedPrimary
    : questionsNeedingReview[0] ?? null;
  return {
    contract: CONTRACT,
    status: questionsNeedingReview.length > 0 ? 'human_review_required' : 'not_needed',
    projectSlug,
    blockedBy: null,
    primaryQuestion,
    questionsNeedingReview,
    provenance: {
      graphHash,
      sourceFingerprint: provenance.sourceFingerprint,
      sourceMeasuredAt: provenance.sourceMeasuredAt,
      sourceCurrentness: 'current',
    },
    questions,
    workflow: questionsNeedingReview.length > 0
      ? workflow(projectSlug, domainSlugs, capabilitySlugs)
      : [],
    stopWhen: [...STOP_CONDITIONS],
    writePolicy: writePolicy(),
  };
}

/** Attach the packet while making its one human decision visible before generic health work. */
export function attachMeaningRepair(agentBrief, repair) {
  const nextActions = Array.isArray(agentBrief?.nextActions) ? agentBrief.nextActions : [];
  if (repair?.contract !== CONTRACT || repair.status !== 'human_review_required') {
    return { ...agentBrief, nextActions, meaningRepair: repair };
  }
  const action = {
    id: 'review_competency_repair',
    kind: 'competency_repair',
    severity: 'warn',
    count: repair.questionsNeedingReview.length,
    target: repair.primaryQuestion,
    detailContract: CONTRACT,
    message: 'Review current competency claims against graph-structural and current-source candidates; explicit human approval is required before any write.',
  };
  return {
    ...agentBrief,
    nextActions: [
      action,
      ...nextActions.filter((row) => row?.id !== action.id),
    ],
    meaningRepair: repair,
  };
}
