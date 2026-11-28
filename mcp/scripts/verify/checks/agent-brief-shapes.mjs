import { hasNonEmptyString } from '../value-checks.mjs';

const AGENT_BRIEF_SOURCE_STATUSES = new Set([
  'not_measured',
  'needs_evidence',
  'review_required',
  'invalid',
  'verified_current',
]);
const AGENT_BRIEF_SOURCE_CURRENTNESS = new Set(['current', 'stale', 'unavailable']);
const AGENT_BRIEF_MEANING_STATUSES = new Set([
  'verified_current',
  'review_required',
  'needs_evidence',
  'invalid',
]);
const AGENT_BRIEF_QUESTION_IDS = ['scope', 'domains', 'abilities', 'evidence', 'impact'];
const AGENT_BRIEF_PROVENANCE_FIELDS = [
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

export function agentBriefPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function agentBriefExactKeys(value, keys) {
  return agentBriefPlainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function agentBriefPrivateSourceCoordinate(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(agentBriefPrivateSourceCoordinate);
  for (const [key, nested] of Object.entries(value)) {
    if (['rootPath', 'remote', 'remoteUrl', 'privateRemote'].includes(key)) return true;
    if (agentBriefPrivateSourceCoordinate(nested)) return true;
  }
  return false;
}

const AGENT_BRIEF_LIVE_WITNESS_STATUSES = new Set([
  'witnesses_supported', 'witnesses_missing', 'no_witnesses', 'inventory_truncated',
]);

// `projectSource.live` appears only when the receipt is behind the source or the
// ontology. CI's dogfood vault has no bound source, so a release rehearsal against
// the real vault is where this object is first checked.
function validAgentBriefLiveWitnesses(live) {
  return agentBriefExactKeys(live, [
    'contract', 'status', 'basis', 'sourceRevision', 'sourceFingerprint', 'witnessSummary', 'missingPaths',
  ])
    && live.contract === 'projectSourceLiveWitnesses:v1'
    && AGENT_BRIEF_LIVE_WITNESS_STATUSES.has(live.status)
    && ['receipt', 'current_graph'].includes(live.basis)
    && (live.sourceRevision === null || hasNonEmptyString(live.sourceRevision))
    && hasNonEmptyString(live.sourceFingerprint)
    && agentBriefPlainObject(live.witnessSummary)
    && ['total', 'supported', 'missing'].every(
      (field) => Number.isInteger(live.witnessSummary[field]) && live.witnessSummary[field] >= 0,
    )
    && live.witnessSummary.supported + live.witnessSummary.missing === live.witnessSummary.total
    && Array.isArray(live.missingPaths)
    && live.missingPaths.length <= 5
    && live.missingPaths.every((path) => hasNonEmptyString(path));
}

export function validAgentBriefProjectSource(value, projectSlug) {
  const baseKeys = [
    'contractVersion', 'projectSlug', 'status', 'currentness', 'measuredAt',
    'topGap', 'nextAction', 'bindingCardinality', 'receipt',
  ];
  const hasLive = agentBriefPlainObject(value) && Object.hasOwn(value, 'live');
  if (
    !hasNonEmptyString(projectSlug)
    || !agentBriefExactKeys(value, hasLive ? [...baseKeys, 'live'] : baseKeys)
    || (hasLive && !validAgentBriefLiveWitnesses(value.live))
    || value.contractVersion !== 1
    || value.projectSlug !== projectSlug
    || !AGENT_BRIEF_SOURCE_STATUSES.has(value.status)
    || !AGENT_BRIEF_SOURCE_CURRENTNESS.has(value.currentness)
    || !(value.measuredAt === null || hasNonEmptyString(value.measuredAt))
    || !Number.isInteger(value.bindingCardinality)
    || value.bindingCardinality < 0
    || !(value.topGap === null || (agentBriefPlainObject(value.topGap) && hasNonEmptyString(value.topGap.id)))
    || !agentBriefPlainObject(value.nextAction)
    || !hasNonEmptyString(value.nextAction.id)
  ) return false;
  if (value.receipt === null) return ['not_measured', 'invalid'].includes(value.status);
  const receipt = value.receipt;
  if (
    !agentBriefPlainObject(receipt)
    || receipt.contractVersion !== 1
    || receipt.projectSlug !== projectSlug
    || !['needs_evidence', 'review_required', 'verified_current'].includes(receipt.status)
    || receipt.currentness !== 'current'
    || !hasNonEmptyString(
      receipt.sourceId,
      receipt.sourceKind,
      receipt.sourceRevision,
      receipt.sourceFingerprint,
      receipt.graphHash,
      receipt.measuredAt,
    )
    || !['git', 'folder'].includes(receipt.sourceKind)
    || !agentBriefPlainObject(receipt.witnessSummary)
    || !['total', 'supported', 'missing'].every(
      (field) => Number.isInteger(receipt.witnessSummary[field]) && receipt.witnessSummary[field] >= 0,
    )
    || receipt.witnessSummary.supported + receipt.witnessSummary.missing !== receipt.witnessSummary.total
    || !Array.isArray(receipt.witnesses)
    || receipt.witnesses.length !== receipt.witnessSummary.total
  ) return false;
  return receipt.witnesses.every((witness) => (
    agentBriefPlainObject(witness)
    && hasNonEmptyString(witness.id, witness.nodeSlug, witness.role, witness.path)
    && !/^(?:\/|[A-Za-z]:[\\/]|\.\.\/)/.test(witness.path)
    && typeof witness.supported === 'boolean'
  ));
}

export function validAgentBriefMeaningAssessment(value, projectSlug) {
  if (
    !agentBriefExactKeys(value, [
      'contract', 'projectSlug', 'status', 'dimensions', 'topGap', 'nextAction', 'provenance',
    ])
    || value.contract !== 'meaningAssessment:v1'
    || value.projectSlug !== projectSlug
    || !AGENT_BRIEF_MEANING_STATUSES.has(value.status)
  ) return false;
  const { structure, competency, source } = value.dimensions ?? {};
  if (
    !agentBriefExactKeys(value.dimensions, ['structure', 'competency', 'source'])
    || !agentBriefExactKeys(structure, ['status', 'basis'])
    || !['ready', 'needs_structure', 'invalid'].includes(structure.status)
    || structure.basis !== 'structure_only'
    || !agentBriefExactKeys(competency, ['status', 'questions'])
    || !['answered', 'needs_evidence'].includes(competency.status)
    || !Array.isArray(competency.questions)
    || competency.questions.length !== AGENT_BRIEF_QUESTION_IDS.length
    || !agentBriefExactKeys(source, ['status', 'currentness'])
    || !AGENT_BRIEF_SOURCE_STATUSES.has(source.status)
    || !AGENT_BRIEF_SOURCE_CURRENTNESS.has(source.currentness)
  ) return false;
  for (let index = 0; index < competency.questions.length; index += 1) {
    const question = competency.questions[index];
    if (
      !agentBriefExactKeys(question, ['id', 'status', 'witnessStatus'])
      || question.id !== AGENT_BRIEF_QUESTION_IDS[index]
      || !['answered', 'partial', 'visible-gap', 'unassessed'].includes(question.status)
      || !['resolved', 'missing', 'unavailable'].includes(question.witnessStatus)
    ) return false;
  }
  const allAnswered = competency.questions.every(
    (question) => question.status === 'answered' && question.witnessStatus === 'resolved',
  );
  if ((competency.status === 'answered') !== allAnswered) return false;
  if (value.topGap !== null && (
    !agentBriefPlainObject(value.topGap)
    || !Object.keys(value.topGap).every((key) => ['dimension', 'id', 'questionId'].includes(key))
    || !hasNonEmptyString(value.topGap.dimension, value.topGap.id)
    || (value.topGap.questionId !== undefined && !hasNonEmptyString(value.topGap.questionId))
  )) return false;
  if (
    !agentBriefPlainObject(value.nextAction)
    || !Object.keys(value.nextAction).every((key) => ['id', 'target'].includes(key))
    || !hasNonEmptyString(value.nextAction.id)
    || (value.nextAction.target !== undefined && !hasNonEmptyString(value.nextAction.target))
  ) return false;
  const provenance = value.provenance;
  return agentBriefExactKeys(provenance, AGENT_BRIEF_PROVENANCE_FIELDS)
    && hasNonEmptyString(provenance.evaluator)
    && AGENT_BRIEF_PROVENANCE_FIELDS
      .filter((field) => !['evaluator', 'sourceReceiptContractVersion'].includes(field))
      .every((field) => provenance[field] === null || hasNonEmptyString(provenance[field]))
    && (provenance.sourceReceiptContractVersion === null || provenance.sourceReceiptContractVersion === 1);
}
