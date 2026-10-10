import {
  hasAllowedKeys,
  hasExactKeys,
  hasNonEmptyString,
  isPlainObject,
  validCount,
} from './value-checks.mjs';

export const PROJECT_SOURCE_STATUSES = new Set([
  'not_measured',
  'needs_evidence',
  'review_required',
  'invalid',
  'verified_current',
]);
export const PROJECT_SOURCE_CURRENTNESS = new Set(['current', 'stale', 'unavailable']);
export const MEANING_ASSESSMENT_STATUSES = new Set([
  'verified_current',
  'review_required',
  'needs_evidence',
  'invalid',
]);
const MEANING_STRUCTURE_STATUSES = new Set(['ready', 'needs_structure', 'invalid']);
export const MEANING_QUESTION_STATUSES = new Set(['answered', 'partial', 'visible-gap', 'unassessed']);
export const MEANING_WITNESS_STATUSES = new Set(['resolved', 'missing', 'unavailable']);
export const MEANING_QUESTION_IDS = ['scope', 'domains', 'abilities', 'evidence', 'impact'];
const MEANING_REPAIR_PACKET_MAX_BYTES = 5 * 1024;
const PROJECT_SOURCE_LIVE_STATUSES = new Set([
  'witnesses_supported',
  'witnesses_missing',
  'inventory_truncated',
  'no_witnesses',
]);

/** The live re-check a stale receipt carries: relative paths and a revision only. */
export function validProjectSourceLive(value) {
  if (value === undefined) return true;
  return isPlainObject(value)
    && PROJECT_SOURCE_LIVE_STATUSES.has(value.status)
    && (value.basis === undefined || ['receipt', 'current_graph'].includes(value.basis))
    && (value.sourceRevision === null || hasNonEmptyString(value.sourceRevision))
    && isPlainObject(value.witnessSummary)
    && ['total', 'supported', 'missing'].every((field) => validCount(value.witnessSummary[field]))
    && value.witnessSummary.supported + value.witnessSummary.missing === value.witnessSummary.total
    && (value.missingPaths === undefined
      || (Array.isArray(value.missingPaths)
        && value.missingPaths.length <= 5
        && value.missingPaths.every((path) => hasNonEmptyString(path) && !/^(?:\/|[A-Za-z]:[\\/]|\.\.\/)/.test(path))))
    && !containsPrivateSourceField(value);
}

export function liveWitnessesSupported(source) {
  return source?.live?.status === 'witnesses_supported'
    && !(source.status === 'verified_current' && source.currentness === 'current');
}

export function validProjectSourceView(value, projectSlug) {
  if (
    !hasNonEmptyString(projectSlug)
    || !isPlainObject(value)
    || value.contractVersion !== 1
    || value.projectSlug !== projectSlug
    || !PROJECT_SOURCE_STATUSES.has(value.status)
    || !PROJECT_SOURCE_CURRENTNESS.has(value.currentness)
    || !(value.measuredAt === null || hasNonEmptyString(value.measuredAt))
    || !validCount(value.bindingCardinality)
    || !validProjectSourceGap(value.topGap)
    || !validProjectSourceAction(value.nextAction)
    || !validProjectSourceLive(value.live)
    || containsPrivateSourceField(value)
  ) return false;

  if (value.receipt === null) {
    return ['not_measured', 'invalid'].includes(value.status);
  }
  const receipt = value.receipt;
  if (
    !isPlainObject(receipt)
    || receipt.contractVersion !== value.contractVersion
    || receipt.projectSlug !== projectSlug
    || !['needs_evidence', 'review_required', 'verified_current'].includes(receipt.status)
    || receipt.currentness !== 'current'
    || !hasNonEmptyString(receipt.sourceId)
    || !['git', 'folder'].includes(receipt.sourceKind)
    || !hasNonEmptyString(receipt.sourceRevision)
    || !hasNonEmptyString(receipt.sourceFingerprint)
    || !hasNonEmptyString(receipt.graphHash)
    || !hasNonEmptyString(receipt.measuredAt)
    || !validProjectSourceGap(receipt.topGap)
    || !validProjectSourceAction(receipt.nextAction)
    || !isPlainObject(receipt.witnessSummary)
    || !['total', 'supported', 'missing'].every((field) => validCount(receipt.witnessSummary[field]))
    || receipt.witnessSummary.supported + receipt.witnessSummary.missing !== receipt.witnessSummary.total
    || !Array.isArray(receipt.witnesses)
  ) return false;
  return receipt.witnesses.every((witness) => (
    isPlainObject(witness)
    && hasNonEmptyString(witness.id)
    && hasNonEmptyString(witness.nodeSlug)
    && hasNonEmptyString(witness.role)
    && hasNonEmptyString(witness.path)
    && !/^(?:\/|[A-Za-z]:[\\/]|\.\.\/)/.test(witness.path)
    && typeof witness.supported === 'boolean'
  ));
}

export function validMeaningAssessment(value, projectSlug) {
  const rootKeys = ['contract', 'projectSlug', 'status', 'dimensions', 'topGap', 'nextAction', 'provenance'];
  if (
    !isPlainObject(value)
    || !hasExactKeys(value, rootKeys)
    || value.contract !== 'meaningAssessment:v1'
    || value.projectSlug !== projectSlug
    || !MEANING_ASSESSMENT_STATUSES.has(value.status)
  ) return false;

  const dimensions = value.dimensions;
  const structure = dimensions?.structure;
  const competency = dimensions?.competency;
  const source = dimensions?.source;
  if (
    !isPlainObject(dimensions)
    || !hasExactKeys(dimensions, ['structure', 'competency', 'source'])
    || !isPlainObject(structure)
    || !hasExactKeys(structure, ['status', 'basis'])
    || !MEANING_STRUCTURE_STATUSES.has(structure.status)
    || structure.basis !== 'structure_only'
    || !isPlainObject(competency)
    || !hasExactKeys(competency, ['status', 'questions'])
    || !['answered', 'needs_evidence'].includes(competency.status)
    || !Array.isArray(competency.questions)
    || competency.questions.length !== MEANING_QUESTION_IDS.length
    || !isPlainObject(source)
    || !hasExactKeys(source, ['status', 'currentness'])
    || !PROJECT_SOURCE_STATUSES.has(source.status)
    || !PROJECT_SOURCE_CURRENTNESS.has(source.currentness)
  ) return false;

  for (let index = 0; index < competency.questions.length; index += 1) {
    const question = competency.questions[index];
    if (
      !isPlainObject(question)
      || !hasExactKeys(question, ['id', 'status', 'witnessStatus'])
      || question.id !== MEANING_QUESTION_IDS[index]
      || !MEANING_QUESTION_STATUSES.has(question.status)
      || !MEANING_WITNESS_STATUSES.has(question.witnessStatus)
    ) return false;
  }
  const allAnswered = competency.questions.every(
    (question) => question.status === 'answered' && question.witnessStatus === 'resolved',
  );
  if ((competency.status === 'answered') !== allAnswered) return false;

  if (value.topGap !== null && (
    !isPlainObject(value.topGap)
    || !hasAllowedKeys(value.topGap, ['dimension', 'id', 'questionId'])
    || !hasNonEmptyString(value.topGap.dimension, value.topGap.id)
    || (value.topGap.questionId !== undefined && !hasNonEmptyString(value.topGap.questionId))
  )) return false;
  if (
    !isPlainObject(value.nextAction)
    || !hasAllowedKeys(value.nextAction, ['id', 'target'])
    || !hasNonEmptyString(value.nextAction.id)
    || (value.nextAction.target !== undefined && !hasNonEmptyString(value.nextAction.target))
  ) return false;

  const provenanceFields = [
    'evaluator',
    'graphHash',
    'competencyContract',
    'competencyEvaluator',
    'competencyGraphHash',
    'witnessInventoryContract',
    'witnessInventoryGraphHash',
    'witnessInventorySourceFingerprint',
    'sourceGraphHash',
    'sourceReceiptContractVersion',
    'sourceId',
    'sourceRevision',
    'sourceFingerprint',
    'sourceMeasuredAt',
    'sourceGapId',
  ];
  const provenance = value.provenance;
  return isPlainObject(provenance)
    && hasExactKeys(provenance, provenanceFields)
    && hasNonEmptyString(provenance.evaluator)
    && provenanceFields
      .filter((field) => !['evaluator', 'sourceReceiptContractVersion'].includes(field))
      .every((field) => provenance[field] === null || hasNonEmptyString(provenance[field]))
    && (provenance.sourceReceiptContractVersion === null || provenance.sourceReceiptContractVersion === 1);
}

export function validMeaningRepair(value, projectSlug) {
  const rootKeys = [
    'contract',
    'status',
    'projectSlug',
    'blockedBy',
    'primaryQuestion',
    'questionsNeedingReview',
    'provenance',
    'reviewRevision',
    'questions',
    'workflow',
    'stopWhen',
    'writePolicy',
  ];
  if (
    !isPlainObject(value)
    || !hasExactKeys(value, rootKeys)
    || value.contract !== 'meaningRepair:v2'
    || value.projectSlug !== projectSlug
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > MEANING_REPAIR_PACKET_MAX_BYTES
    || !['blocked', 'human_review_required', 'not_needed'].includes(value.status)
    || containsPrivateSourceField(value)
    || !Array.isArray(value.questionsNeedingReview)
    || value.questionsNeedingReview.some((id) => !['abilities', 'evidence'].includes(id))
    || new Set(value.questionsNeedingReview).size !== value.questionsNeedingReview.length
    || !Array.isArray(value.workflow)
    || !Array.isArray(value.stopWhen)
    || value.stopWhen.length === 0
    || value.stopWhen.some((id) => !hasNonEmptyString(id))
    || !isPlainObject(value.writePolicy)
    || !hasExactKeys(value.writePolicy, ['humanApprovalRequired', 'automaticWrite', 'automaticFinalize'])
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
    || !isPlainObject(value.provenance)
    || !hasExactKeys(value.provenance, [
      'graphHash', 'sourceFingerprint', 'sourceMeasuredAt', 'sourceCurrentness',
    ])
    || !hasNonEmptyString(
      value.provenance.graphHash,
      value.provenance.sourceFingerprint,
      value.provenance.sourceMeasuredAt,
    )
    || value.provenance.sourceCurrentness !== 'current'
    || !/^sha256:[a-f0-9]{64}$/.test(value.reviewRevision)
    || !isPlainObject(value.questions)
    || !hasExactKeys(value.questions, ['abilities', 'evidence'])
  ) return false;
  const abilities = value.questions.abilities;
  const evidence = value.questions.evidence;
  if (
    !validMeaningRepairQuestion(abilities, 'typed_containment', 'structural_candidates_only')
    || !validMeaningRepairQuestion(evidence, 'current_source_canonical_path', 'source_path_candidates_only')
  ) return false;
  if (value.status === 'not_needed') {
    return value.primaryQuestion === null
      && value.questionsNeedingReview.length === 0
      && value.workflow.length === 0;
  }
  return value.questionsNeedingReview.length > 0
    && value.primaryQuestion === value.questionsNeedingReview[0]
    && validMeaningRepairWorkflow(value.workflow, value, projectSlug);
}

function validMeaningRepairQuestion(value, basis, state) {
  if (
    !isPlainObject(value)
    || !hasExactKeys(value, ['basis', 'answerStatus', 'targetCount', 'review'])
    || value.basis !== basis
    || !MEANING_QUESTION_STATUSES.has(value.answerStatus)
    || !validCount(value.targetCount)
    || !isPlainObject(value.review)
    || !hasExactKeys(value.review, [
      'state', 'alreadyDeclared', 'candidateAdditions', 'declaredWithoutSupport', 'unresolved',
    ])
    || value.review.state !== state
    || !validCount(value.review.alreadyDeclared)
    || !validCount(value.review.candidateAdditions)
    || !validCount(value.review.declaredWithoutSupport)
    || !validCount(value.review.unresolved)
    || value.review.alreadyDeclared
      + value.review.candidateAdditions
      + value.review.declaredWithoutSupport
      + value.review.unresolved !== value.targetCount
  ) return false;
  return true;
}

function validMeaningRepairWorkflow(workflow, repair, projectSlug) {
  const steps = [
    'read_review_inputs',
    'human_semantic_approval',
    'write_approved_project_body',
    'verify',
    'refresh_conflict_guard',
    'finalize',
  ];
  const shapeValid = workflow.length === steps.length && workflow.every((row, index) => (
    isPlainObject(row)
    && row.step === steps[index]
    && Array.isArray(row.calls)
    && row.calls.every((call) => (
      isPlainObject(call)
      && hasNonEmptyString(call.tool)
      && isPlainObject(call.arguments)
    ))
  ));
  if (!shapeValid) return false;
  const readStep = workflow[0];
  if (
    !hasExactKeys(readStep, ['step', 'derivation', 'calls'])
    || !isPlainObject(readStep.derivation)
    || !hasExactKeys(readStep.derivation, ['operation', 'order'])
    || readStep.derivation.operation !== 'meaning_repair_review'
    || readStep.derivation.order !== 'project_then_domains_then_capabilities'
    || readStep.calls.length !== 1
  ) return false;
  const call = readStep.calls[0];
  return hasExactKeys(call, ['tool', 'arguments'])
    && call.tool === 'query_ontology'
    && hasExactKeys(call.arguments, [
      'operation',
      'project',
      'expectedGraphHash',
      'expectedSourceFingerprint',
      'reviewRevision',
    ])
    && call.arguments.operation === 'meaning_repair_review'
    && call.arguments.project === projectSlug
    && call.arguments.expectedGraphHash === repair.provenance.graphHash
    && call.arguments.expectedSourceFingerprint === repair.provenance.sourceFingerprint
    && call.arguments.reviewRevision === repair.reviewRevision;
}

function validProjectSourceGap(value) {
  return value === null || (isPlainObject(value) && hasNonEmptyString(value.id));
}

function validProjectSourceAction(value) {
  return isPlainObject(value) && hasNonEmptyString(value.id);
}

// Depth-first over the parsed response, O(values); parsed JSON cannot be cyclic.
function containsPrivateSourceField(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsPrivateSourceField);
  for (const [key, nested] of Object.entries(value)) {
    if (['rootPath', 'remote', 'remoteUrl', 'privateRemote'].includes(key)) return true;
    if (containsPrivateSourceField(nested)) return true;
  }
  return false;
}
