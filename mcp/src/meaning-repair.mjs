import { createHash } from 'node:crypto';

import { GET_CONCEPTS_FULL_BODY_MAX } from './vault.mjs';

const CONTRACT = 'meaningRepair:v2';
const REVIEW_CONTRACT = 'meaningRepairReviewPage:v1';
const CURSOR_CONTRACT = 'meaningRepairReviewCursor:v1';
const CURSOR_PREFIX = 'mrp1';
const PACKET_MAX_BYTES = 5 * 1024;
const QUESTION_IDS = ['abilities', 'evidence'];
const STOP_CONDITIONS = Object.freeze([
  'source_not_current',
  'graph_or_source_provenance_changed',
  'scope_or_receipt_limited',
  'validation_or_compile_error',
  'human_approval_missing',
  'review_pages_incomplete',
  'review_inputs_changed',
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
    reviewRevision: null,
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

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function packetBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function normalizedMtime(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function disposition({ declared, supported }) {
  if (declared && supported) return 'already_declared';
  if (!declared && supported) return 'candidate_addition';
  if (declared) return 'declared_without_support';
  return 'unresolved';
}

function countDispositions(rows, readDisposition) {
  const counts = {
    alreadyDeclared: 0,
    candidateAdditions: 0,
    declaredWithoutSupport: 0,
    unresolved: 0,
  };
  for (const row of rows) {
    const value = readDisposition(row);
    if (value === 'already_declared') counts.alreadyDeclared += 1;
    else if (value === 'candidate_addition') counts.candidateAdditions += 1;
    else if (value === 'declared_without_support') counts.declaredWithoutSupport += 1;
    else if (value === 'unresolved') counts.unresolved += 1;
  }
  return counts;
}

function workflow(projectSlug, provenance, reviewRevision) {
  return [
    {
      step: 'read_review_inputs',
      derivation: {
        operation: 'meaning_repair_review',
        order: 'project_then_domains_then_capabilities',
      },
      calls: [{
        tool: 'query_ontology',
        arguments: {
          operation: 'meaning_repair_review',
          project: projectSlug,
          expectedGraphHash: provenance.graphHash,
          expectedSourceFingerprint: provenance.sourceFingerprint,
          reviewRevision,
        },
      }],
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

function buildProjection(input = {}) {
  const {
    projectSlug,
    graphHash,
    meaningAssessment,
    competency,
    inventoryResult,
    scopedDocs,
  } = input;
  if (!safeSlug(projectSlug, 200) || !safeGraphHash(graphHash)) {
    return { blockedBy: 'invalid_project_context', projectSlug };
  }
  if (
    meaningAssessment?.contract !== 'meaningAssessment:v1'
    || meaningAssessment.projectSlug !== projectSlug
    || meaningAssessment.dimensions?.source?.currentness !== 'current'
    || meaningAssessment.dimensions?.source?.status !== 'verified_current'
  ) return { blockedBy: 'source_not_current', projectSlug };
  const sourceProvenance = meaningAssessment.provenance;
  if (
    sourceProvenance?.graphHash !== graphHash
    || !nonBlank(sourceProvenance.sourceFingerprint, 200)
    || !nonBlank(sourceProvenance.sourceMeasuredAt, 100)
  ) return { blockedBy: 'provenance_mismatch', projectSlug };
  if (inventoryResult?.status !== 'ready') {
    return {
      blockedBy: inventoryResult?.reason ?? 'witness_inventory_unavailable',
      projectSlug,
    };
  }
  const inventory = inventoryResult.inventory;
  if (
    inventory?.graphHash !== graphHash
    || inventory?.sourceFingerprint !== sourceProvenance.sourceFingerprint
    || !Array.isArray(inventory.concepts)
    || !Array.isArray(inventory.relations)
    || !Array.isArray(inventoryResult.evidenceClaims)
    || !Array.isArray(scopedDocs)
  ) return { blockedBy: 'witness_inventory_mismatch', projectSlug };

  const scope = new Set(inventory.concepts);
  const docsBySlug = new Map(scopedDocs.map((doc) => [doc?.slug, doc]));
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
    return { blockedBy: 'meaning_targets_unavailable', projectSlug };
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
  const structuralByCapability = new Map(
    structuralRelations.map((relation) => [relation.to, relation]),
  );
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
    return { blockedBy: 'competency_questions_unavailable', projectSlug };
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

  const domainRows = domainSlugs.map((slug) => ({
    slug,
    kind: 'domain',
    expectedMtime: normalizedMtime(docsBySlug.get(slug)?.mtime),
    abilitiesDisposition: disposition({
      declared: declaredDomains.has(slug),
      supported: structurallySupportedDomains.has(slug),
    }),
  }));
  const capabilityRows = capabilitySlugs.map((slug) => {
    const relation = structuralByCapability.get(slug);
    return {
      slug,
      kind: 'capability',
      expectedMtime: normalizedMtime(docsBySlug.get(slug)?.mtime),
      abilityWitness: relation
        ? { from: relation.from, type: relation.type }
        : null,
      evidenceDisposition: disposition({
        declared: declaredEvidence.has(slug),
        supported: supportedEvidence.has(slug),
      }),
    };
  });
  const rows = [
    {
      slug: projectSlug,
      kind: 'project',
      expectedMtime: normalizedMtime(docsBySlug.get(projectSlug)?.mtime),
    },
    ...domainRows,
    ...capabilityRows,
  ];
  if (rows.some(({ expectedMtime }) => expectedMtime === null)) {
    return { blockedBy: 'review_mtime_unavailable', projectSlug };
  }
  const abilityCounts = countDispositions(domainRows, (row) => row.abilitiesDisposition);
  const evidenceCounts = countDispositions(capabilityRows, (row) => row.evidenceDisposition);
  const questions = {
    abilities: {
      basis: 'typed_containment',
      answerStatus: abilityQuestion.status,
      targetCount: domainRows.length,
      review: { state: 'structural_candidates_only', ...abilityCounts },
    },
    evidence: {
      basis: 'current_source_canonical_path',
      answerStatus: evidenceQuestion.status,
      targetCount: capabilityRows.length,
      review: { state: 'source_path_candidates_only', ...evidenceCounts },
    },
  };
  const questionStatuses = new Map([
    ['abilities', abilityQuestion.status],
    ['evidence', evidenceQuestion.status],
  ]);
  const questionsNeedingReview = QUESTION_IDS.filter((id) => {
    const review = questions[id].review;
    return questionStatuses.get(id) !== 'answered'
      || review.candidateAdditions > 0
      || review.declaredWithoutSupport > 0
      || review.unresolved > 0;
  });
  const requestedPrimary = meaningAssessment.nextAction?.target;
  const primaryQuestion = questionsNeedingReview.includes(requestedPrimary)
    ? requestedPrimary
    : questionsNeedingReview[0] ?? null;
  const provenance = {
    graphHash,
    sourceFingerprint: sourceProvenance.sourceFingerprint,
    sourceMeasuredAt: sourceProvenance.sourceMeasuredAt,
    sourceCurrentness: 'current',
  };
  const reviewRevision = digest(JSON.stringify({
    contract: REVIEW_CONTRACT,
    projectSlug,
    provenance,
    questionStatuses: QUESTION_IDS.map((id) => [id, questionStatuses.get(id)]),
    rows,
  }));
  return {
    blockedBy: null,
    projectSlug,
    provenance,
    reviewRevision,
    questions,
    questionsNeedingReview,
    primaryQuestion,
    rows,
  };
}

function encodeCursor(projectSlug, reviewRevision, afterTarget) {
  const payload = JSON.stringify({
    contract: CURSOR_CONTRACT,
    projectSlug,
    reviewRevision,
    afterTarget,
  });
  return `${CURSOR_PREFIX}.${digest(payload).slice('sha256:'.length, 'sha256:'.length + 32)}`;
}

function decodeCursor(value, projection) {
  if (!nonBlank(value, 4096)) throw new TypeError('cursor_invalid');
  if (!/^mrp1\.[a-f0-9]{32}$/.test(value)) throw new TypeError('cursor_invalid');
  return projection.rows.find(({ slug }) => (
    encodeCursor(projection.projectSlug, projection.reviewRevision, slug) === value
  ))?.slug ?? null;
}

function reviewBlocked(projection, reason) {
  return {
    operation: 'meaning_repair_review',
    contract: REVIEW_CONTRACT,
    sideEffect: false,
    status: 'blocked',
    projectSlug: safeSlug(projection?.projectSlug, 200) ? projection.projectSlug : null,
    blockedBy: reason,
    provenance: projection?.provenance ? {
      graphHash: projection.provenance.graphHash,
      sourceFingerprint: projection.provenance.sourceFingerprint,
    } : null,
    reviewRevision: projection?.reviewRevision ?? null,
    pagination: {
      total: Array.isArray(projection?.rows) ? projection.rows.length : 0,
      returned: 0,
      hasMore: false,
      nextCursor: null,
    },
    targets: [],
    readCall: null,
    nextCall: null,
  };
}

function reviewPage(projection, start, count) {
  const targets = projection.rows.slice(start, start + count);
  const hasMore = start + targets.length < projection.rows.length;
  const nextCursor = hasMore
    ? encodeCursor(projection.projectSlug, projection.reviewRevision, targets.at(-1).slug)
    : null;
  const nextArguments = nextCursor
    ? {
      operation: 'meaning_repair_review',
      project: projection.projectSlug,
      reviewRevision: projection.reviewRevision,
      cursor: nextCursor,
    }
    : null;
  return {
    operation: 'meaning_repair_review',
    contract: REVIEW_CONTRACT,
    sideEffect: false,
    status: 'ready',
    projectSlug: projection.projectSlug,
    blockedBy: null,
    provenance: {
      graphHash: projection.provenance.graphHash,
      sourceFingerprint: projection.provenance.sourceFingerprint,
    },
    reviewRevision: projection.reviewRevision,
    pagination: {
      total: projection.rows.length,
      returned: targets.length,
      hasMore,
      nextCursor,
    },
    targets,
    readCall: {
      tool: 'get_concepts',
      arguments: { slugs: targets.map(({ slug }) => slug), body: 'full' },
    },
    nextCall: nextArguments ? { tool: 'query_ontology', arguments: nextArguments } : null,
  };
}

/**
 * Project the already-loaded graph/source inventory into a bounded human review packet.
 * This function never upgrades a competency answer and never carries private source coordinates.
 */
export function buildMeaningRepair(input = {}) {
  const projection = buildProjection(input);
  if (projection.blockedBy) return blocked(projection.projectSlug, projection.blockedBy);
  const result = {
    contract: CONTRACT,
    status: projection.questionsNeedingReview.length > 0 ? 'human_review_required' : 'not_needed',
    projectSlug: projection.projectSlug,
    blockedBy: null,
    primaryQuestion: projection.primaryQuestion,
    questionsNeedingReview: projection.questionsNeedingReview,
    provenance: projection.provenance,
    reviewRevision: projection.reviewRevision,
    questions: projection.questions,
    workflow: projection.questionsNeedingReview.length > 0
      ? workflow(projection.projectSlug, projection.provenance, projection.reviewRevision)
      : [],
    stopWhen: [...STOP_CONDITIONS],
    writePolicy: writePolicy(),
  };
  if (packetBytes(result) > PACKET_MAX_BYTES) {
    return blocked(projection.projectSlug, 'meaning_repair_manifest_too_large');
  }
  return result;
}

/** Return one deterministic, provenance-bound page of typed review evidence. */
export function buildMeaningRepairReviewPage(input = {}, args = {}) {
  const projection = buildProjection(input);
  if (projection.blockedBy) return reviewBlocked(projection, projection.blockedBy);
  if (projection.questionsNeedingReview.length === 0) {
    return reviewBlocked(projection, 'review_not_required');
  }
  const explicitProvenanceChanged = args.cursor === undefined
    ? args.expectedGraphHash !== projection.provenance.graphHash
      || args.expectedSourceFingerprint !== projection.provenance.sourceFingerprint
    : (args.expectedGraphHash !== undefined
        && args.expectedGraphHash !== projection.provenance.graphHash)
      || (args.expectedSourceFingerprint !== undefined
        && args.expectedSourceFingerprint !== projection.provenance.sourceFingerprint);
  if (explicitProvenanceChanged || args.reviewRevision !== projection.reviewRevision) {
    return reviewBlocked(projection, 'provenance_changed');
  }

  let start = 0;
  if (args.cursor !== undefined) {
    const afterTarget = decodeCursor(args.cursor, projection);
    if (afterTarget === null) return reviewBlocked(projection, 'cursor_not_found');
    const boundary = projection.rows.findIndex(({ slug }) => slug === afterTarget);
    if (boundary < 0 || boundary >= projection.rows.length - 1) {
      return reviewBlocked(projection, 'cursor_not_found');
    }
    start = boundary + 1;
  }
  const maxCount = Math.min(GET_CONCEPTS_FULL_BODY_MAX, projection.rows.length - start);
  for (let count = maxCount; count > 0; count -= 1) {
    const page = reviewPage(projection, start, count);
    if (packetBytes(page) <= PACKET_MAX_BYTES) return page;
  }
  return reviewBlocked(projection, 'review_target_too_large');
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
