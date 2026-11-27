import { NODE_UID_RE, hasNonEmptyString } from '../value-checks.mjs';
import {
  agentBriefExactKeys,
  agentBriefPlainObject,
  agentBriefPrivateSourceCoordinate,
} from './agent-brief-shapes.mjs';
import { compareText } from '../../../src/compare-text.mjs';

const MEANING_REPAIR_PACKET_MAX_BYTES = 5 * 1024;

export function validAgentBriefMeaningRepair(value, projectSlug) {
  const rootFields = [
    'contract', 'status', 'projectSlug', 'blockedBy', 'primaryQuestion',
    'questionsNeedingReview', 'provenance', 'reviewRevision', 'questions', 'workflow',
    'stopWhen', 'writePolicy',
  ];
  if (
    !agentBriefExactKeys(value, rootFields)
    || value.contract !== 'meaningRepair:v2'
    || value.projectSlug !== projectSlug
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > MEANING_REPAIR_PACKET_MAX_BYTES
    || !['blocked', 'human_review_required', 'not_needed'].includes(value.status)
    || agentBriefPrivateSourceCoordinate(value)
    || !Array.isArray(value.questionsNeedingReview)
    || value.questionsNeedingReview.some((id) => !['abilities', 'evidence'].includes(id))
    || !Array.isArray(value.workflow)
    || !Array.isArray(value.stopWhen)
    || value.stopWhen.length === 0
    || value.stopWhen.some((id) => !hasNonEmptyString(id))
    || !agentBriefExactKeys(value.writePolicy, [
      'humanApprovalRequired', 'automaticWrite', 'automaticFinalize',
    ])
    || value.writePolicy.humanApprovalRequired !== true
    || value.writePolicy.automaticWrite !== false
    || value.writePolicy.automaticFinalize !== false
  ) return false;
  if (value.status === 'blocked') {
    return hasNonEmptyString(value.blockedBy)
      && value.primaryQuestion === null
      && value.questionsNeedingReview.length === 0
      && value.provenance === null
      && value.reviewRevision === null
      && value.questions === null
      && value.workflow.length === 0;
  }
  if (
    value.blockedBy !== null
    || !(value.primaryQuestion === null || ['abilities', 'evidence'].includes(value.primaryQuestion))
    || !agentBriefExactKeys(value.provenance, [
      'graphHash', 'sourceFingerprint', 'sourceMeasuredAt', 'sourceCurrentness',
    ])
    || !hasNonEmptyString(
      value.provenance.graphHash,
      value.provenance.sourceFingerprint,
      value.provenance.sourceMeasuredAt,
    )
    || value.provenance.sourceCurrentness !== 'current'
    || !/^sha256:[a-f0-9]{64}$/.test(value.reviewRevision)
    || !agentBriefExactKeys(value.questions, ['abilities', 'evidence'])
  ) return false;
  const abilities = value.questions.abilities;
  const evidence = value.questions.evidence;
  if (
    !agentBriefExactKeys(abilities, ['basis', 'answerStatus', 'targetCount', 'review'])
    || abilities.basis !== 'typed_containment'
    || !['answered', 'partial', 'visible-gap', 'unassessed'].includes(abilities.answerStatus)
    || !Number.isInteger(abilities.targetCount)
    || abilities.targetCount < 0
    || !agentBriefExactKeys(abilities.review, [
      'state', 'alreadyDeclared', 'candidateAdditions', 'declaredWithoutSupport', 'unresolved',
    ])
    || abilities.review.state !== 'structural_candidates_only'
    || !agentBriefExactKeys(evidence, ['basis', 'answerStatus', 'targetCount', 'review'])
    || evidence.basis !== 'current_source_canonical_path'
    || !['answered', 'partial', 'visible-gap', 'unassessed'].includes(evidence.answerStatus)
    || !Number.isInteger(evidence.targetCount)
    || evidence.targetCount < 0
    || !agentBriefExactKeys(evidence.review, [
      'state', 'alreadyDeclared', 'candidateAdditions', 'declaredWithoutSupport', 'unresolved',
    ])
    || evidence.review.state !== 'source_path_candidates_only'
    || ![
      abilities.review.alreadyDeclared,
      abilities.review.candidateAdditions,
      abilities.review.declaredWithoutSupport,
      abilities.review.unresolved,
      evidence.review.alreadyDeclared,
      evidence.review.candidateAdditions,
      evidence.review.declaredWithoutSupport,
      evidence.review.unresolved,
    ].every((count) => Number.isInteger(count) && count >= 0)
    || abilities.review.alreadyDeclared
      + abilities.review.candidateAdditions
      + abilities.review.declaredWithoutSupport
      + abilities.review.unresolved !== abilities.targetCount
    || evidence.review.alreadyDeclared
      + evidence.review.candidateAdditions
      + evidence.review.declaredWithoutSupport
      + evidence.review.unresolved !== evidence.targetCount
  ) return false;
  if (value.status === 'not_needed') {
    return value.primaryQuestion === null
      && value.questionsNeedingReview.length === 0
      && value.workflow.length === 0;
  }
  if (
    value.questionsNeedingReview.length === 0
    || value.primaryQuestion !== value.questionsNeedingReview[0]
    || value.workflow.length !== 6
  ) return false;
  const readStep = value.workflow[0];
  if (
    !agentBriefExactKeys(readStep, ['step', 'derivation', 'calls'])
    || readStep.step !== 'read_review_inputs'
    || !agentBriefExactKeys(readStep.derivation, ['operation', 'order'])
    || readStep.derivation.operation !== 'meaning_repair_review'
    || readStep.derivation.order !== 'project_then_domains_then_capabilities'
    || !Array.isArray(readStep.calls)
    || readStep.calls.length !== 1
  ) return false;
  const call = readStep.calls[0];
  return value.questionsNeedingReview.length > 0
    && value.primaryQuestion === value.questionsNeedingReview[0]
    && agentBriefExactKeys(call, ['tool', 'arguments'])
    && call.tool === 'query_ontology'
    && agentBriefExactKeys(call.arguments, [
      'operation',
      'project',
      'expectedGraphHash',
      'expectedSourceFingerprint',
      'reviewRevision',
    ])
    && call.arguments.operation === 'meaning_repair_review'
    && call.arguments.project === projectSlug
    && call.arguments.expectedGraphHash === value.provenance.graphHash
    && call.arguments.expectedSourceFingerprint === value.provenance.sourceFingerprint
    && call.arguments.reviewRevision === value.reviewRevision;
}

const MEANING_REVIEW_DISPOSITIONS = new Set([
  'already_declared',
  'candidate_addition',
  'declared_without_support',
  'unresolved',
]);

function validMeaningRepairReviewTarget(row) {
  if (!agentBriefPlainObject(row) || !hasNonEmptyString(row.slug)) return false;
  const mtimeValid = typeof row.expectedMtime === 'number'
    && Number.isFinite(row.expectedMtime)
    && row.expectedMtime >= 0;
  if (!mtimeValid) return false;
  if (row.kind === 'project') {
    return agentBriefExactKeys(row, ['slug', 'kind', 'expectedMtime']);
  }
  if (row.kind === 'domain') {
    return agentBriefExactKeys(row, ['slug', 'kind', 'expectedMtime', 'abilitiesDisposition'])
      && MEANING_REVIEW_DISPOSITIONS.has(row.abilitiesDisposition);
  }
  if (row.kind !== 'capability' || !agentBriefExactKeys(row, [
    'slug', 'kind', 'expectedMtime', 'abilityWitness', 'evidenceDisposition',
  ])) return false;
  const witnessValid = row.abilityWitness === null || (
    agentBriefExactKeys(row.abilityWitness, ['from', 'type'])
    && hasNonEmptyString(
      row.abilityWitness.from,
      row.abilityWitness.type,
    )
    && ['capabilities', 'contains'].includes(row.abilityWitness.type)
  );
  return witnessValid && MEANING_REVIEW_DISPOSITIONS.has(row.evidenceDisposition);
}

export function meaningRepairReviewChainFailure(agentBrief, pages, requestArguments = []) {
  const repair = agentBrief?.meaningRepair;
  if (repair?.status !== 'human_review_required') {
    return pages.length === 0 ? null : 'meaning repair review pages returned when review was not required';
  }
  if (pages.length === 0) return 'meaning repair review page chain missing';
  if (requestArguments.length !== pages.length) {
    return 'meaning repair review request/page count mismatch';
  }
  const expectedTotal = 1
    + repair.questions.abilities.targetCount
    + repair.questions.evidence.targetCount;
  const allTargets = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const expectedRequest = index === 0
      ? repair.workflow[0].calls[0].arguments
      : pages[index - 1].nextCall?.arguments;
    if (JSON.stringify(requestArguments[index]) !== JSON.stringify(expectedRequest)) {
      return `meaning repair review request ${index + 1} does not match the issued call`;
    }
    if (
      !agentBriefExactKeys(page, [
        'operation', 'contract', 'sideEffect', 'status', 'projectSlug', 'blockedBy',
        'provenance', 'reviewRevision', 'pagination', 'targets', 'readCall', 'nextCall',
      ])
      || page.operation !== 'meaning_repair_review'
      || page.contract !== 'meaningRepairReviewPage:v1'
      || page.sideEffect !== false
      || page.status !== 'ready'
      || page.blockedBy !== null
      || page.projectSlug !== repair.projectSlug
      || page.reviewRevision !== repair.reviewRevision
      || JSON.stringify(page.provenance) !== JSON.stringify({
        graphHash: repair.provenance.graphHash,
        sourceFingerprint: repair.provenance.sourceFingerprint,
      })
      || new TextEncoder().encode(JSON.stringify(page)).byteLength > MEANING_REPAIR_PACKET_MAX_BYTES
      || !agentBriefExactKeys(page.pagination, [
        'total', 'returned', 'hasMore', 'nextCursor',
      ])
      || page.pagination.total !== expectedTotal
      || !Number.isInteger(page.pagination.returned)
      || page.pagination.returned < 1
      || page.pagination.returned > 20
      || typeof page.pagination.hasMore !== 'boolean'
      || !Array.isArray(page.targets)
      || page.targets.length !== page.pagination.returned
      || page.targets.some((row) => !validMeaningRepairReviewTarget(row))
    ) return `meaning repair review page ${index + 1} is malformed`;
    const slugs = page.targets.map(({ slug }) => slug);
    if (
      !agentBriefExactKeys(page.readCall, ['tool', 'arguments'])
      || page.readCall.tool !== 'get_concepts'
      || !agentBriefExactKeys(page.readCall.arguments, ['slugs', 'body'])
      || page.readCall.arguments.body !== 'full'
      || JSON.stringify(page.readCall.arguments.slugs) !== JSON.stringify(slugs)
    ) return `meaning repair review page ${index + 1} readCall does not match targets`;
    const isLast = index === pages.length - 1;
    if (page.pagination.hasMore) {
      if (
        !hasNonEmptyString(page.pagination.nextCursor)
        || !agentBriefExactKeys(page.nextCall, ['tool', 'arguments'])
        || page.nextCall.tool !== 'query_ontology'
        || page.nextCall.arguments.cursor !== page.pagination.nextCursor
      ) return `meaning repair review page ${index + 1} nextCall is malformed`;
      if (isLast) return 'meaning repair review page chain ended before hasMore=false';
    } else if (page.pagination.nextCursor !== null || page.nextCall !== null || !isLast) {
      return `meaning repair review page ${index + 1} ended the chain early`;
    }
    allTargets.push(...page.targets);
  }
  const slugs = allTargets.map(({ slug }) => slug);
  if (slugs.length !== expectedTotal || new Set(slugs).size !== slugs.length) {
    return 'meaning repair review page union has missing or duplicate targets';
  }
  if (allTargets[0]?.kind !== 'project' || allTargets[0]?.slug !== repair.projectSlug) {
    return 'meaning repair review page order must start with the project';
  }
  const domains = allTargets.filter(({ kind }) => kind === 'domain').map(({ slug }) => slug);
  const capabilities = allTargets.filter(({ kind }) => kind === 'capability').map(({ slug }) => slug);
  const kinds = allTargets.map(({ kind }) => kind).join(',');
  const expectedKinds = [
    'project',
    ...Array(domains.length).fill('domain'),
    ...Array(capabilities.length).fill('capability'),
  ].join(',');
  if (
    domains.length !== repair.questions.abilities.targetCount
    || capabilities.length !== repair.questions.evidence.targetCount
    || kinds !== expectedKinds
    || domains.some((slug, index) => index > 0 && compareText(domains[index - 1], slug) > 0)
    || capabilities.some((slug, index) => index > 0 && compareText(capabilities[index - 1], slug) > 0)
  ) return 'meaning repair review page union order or kind counts drifted';
  return null;
}

export function meaningRepairFullBodyReadsFailure(pages, readPayloads) {
  if (readPayloads.length !== pages.length) {
    return 'meaning repair full-body read/page count mismatch';
  }
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const targets = pages[pageIndex]?.targets;
    const concepts = readPayloads[pageIndex]?.concepts;
    if (!Array.isArray(targets) || !Array.isArray(concepts) || concepts.length !== targets.length) {
      return `meaning repair full-body read ${pageIndex + 1} row count mismatch`;
    }
    for (let rowIndex = 0; rowIndex < targets.length; rowIndex += 1) {
      const target = targets[rowIndex];
      const row = concepts[rowIndex];
      if (
        !agentBriefPlainObject(row)
        || row.ok !== true
        || row.slug !== target.slug
        || !hasNonEmptyString(row.uid)
        || !NODE_UID_RE.test(row.uid)
        || !agentBriefPlainObject(row.frontmatter)
        || row.frontmatter.kind !== target.kind
        || typeof row.body !== 'string'
        || !agentBriefPlainObject(row.bodyInfo)
        || !Number.isInteger(row.bodyInfo.totalChars)
        || row.bodyInfo.totalChars < 0
        || !Number.isInteger(row.bodyInfo.returnedChars)
        || row.bodyInfo.returnedChars < 0
        || row.bodyInfo.truncated !== false
        || row.bodyInfo.returnedChars !== row.bodyInfo.totalChars
      ) return `meaning repair full-body read ${pageIndex + 1} row ${rowIndex + 1} is incomplete`;
      if (row.mtime !== target.expectedMtime) {
        return `meaning repair full-body read ${pageIndex + 1} mtime changed for ${target.slug}`;
      }
    }
  }
  return null;
}
