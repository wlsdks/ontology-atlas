import {
  SOURCE_HIDDEN_STATUSES,
  ACCEPTANCE_DECISIONS,
  REGRESSION_STATUSES,
} from './vocabulary.mjs';
import {
  addFinding,
  digest,
  isRecord,
  nonBlank,
  uniqueStrings,
  validTimestamp,
} from './field-rules.mjs';

export function validateSourceHiddenTask(packet, claims, findings) {
  const task = packet.sourceHiddenTask;
  if (
    !isRecord(task)
    || !SOURCE_HIDDEN_STATUSES.has(task.status)
    || !nonBlank(task.evaluatorId)
    || !uniqueStrings(task.claimIds)
    || task.evaluatorId !== packet.actors?.evaluator?.id
  ) {
    addFinding(
      findings,
      'invalid-source-hidden-task',
      'sourceHiddenTask',
      'Source-hidden task must use the named evaluator and a categorical status.',
    );
    return { status: 'not_measured', claimIds: [] };
  }
  for (const id of task.claimIds) {
    if (!claims.has(id)) {
      addFinding(findings, 'unknown-claim-ref', 'sourceHiddenTask.claimIds', `Unknown claim: ${id}`);
    }
  }
  if (task.status === 'passed' && task.claimIds.length === 0) {
    addFinding(
      findings,
      'empty-source-hidden-task',
      'sourceHiddenTask.claimIds',
      'A passing source-hidden task must evaluate at least one claim.',
    );
  }
  const missingClaimIds = [...claims.keys()].filter((id) => !task.claimIds.includes(id));
  if (task.status === 'passed' && missingClaimIds.length > 0) {
    addFinding(
      findings,
      'incomplete-source-hidden-claim-coverage',
      'sourceHiddenTask.claimIds',
      'A passing source-hidden task must evaluate every qualification claim.',
      { severity: 'failure', category: 'evidence' },
    );
    return { ...task, status: 'failed', missingClaimIds };
  }
  return { ...task, missingClaimIds };
}

export function validateResourceUse(packet, findings) {
  const resourceUse = packet.resourceUse;
  const integerKeys = ['durationMs', 'toolCalls', 'inputTokens', 'outputTokens'];
  if (
    !isRecord(resourceUse)
    || integerKeys.some((key) => !Number.isInteger(resourceUse[key]) || resourceUse[key] < 0)
    || !(
      resourceUse.estimatedCostUsd === null
      || (Number.isFinite(resourceUse.estimatedCostUsd) && resourceUse.estimatedCostUsd >= 0)
    )
  ) {
    addFinding(
      findings,
      'invalid-resource-use',
      'resourceUse',
      'Time, calls, tokens, and optional cost must be explicit non-negative measurements.',
    );
    return null;
  }
  return { ...resourceUse };
}

export function validateAcceptance(packet, findings) {
  const acceptance = packet.acceptance;
  if (
    !isRecord(acceptance)
    || !ACCEPTANCE_DECISIONS.has(acceptance.decision)
    || !nonBlank(acceptance.decidedBy)
    || acceptance.authority !== 'human'
    || !validTimestamp(acceptance.decidedAt)
    || !digest(acceptance.planDigest)
    || !Number.isInteger(acceptance.planRevision)
    || acceptance.planRevision < 1
    || !uniqueStrings(acceptance.acceptedGapIds)
  ) {
    addFinding(
      findings,
      'invalid-human-acceptance',
      'acceptance',
      'Acceptance needs declared human provenance, a timestamp, an exact plan digest/revision, and explicit accepted gap ids.',
    );
    return null;
  }
  if (acceptance.decidedBy === packet.actors?.builder?.id) {
    addFinding(
      findings,
      'maker-self-approval',
      'acceptance.decidedBy',
      'The builder cannot accept its own qualification.',
    );
  }
  return { ...acceptance };
}

export function validateRegression(packet, questions, witnesses, axisRows, findings) {
  const regression = packet.regression;
  if (
    !isRecord(regression)
    || !(regression.baselineQualificationId === null || nonBlank(regression.baselineQualificationId))
    || !REGRESSION_STATUSES.has(regression.status)
    || !uniqueStrings(regression.priorCqIds)
    || !uniqueStrings(regression.rerunCqIds)
    || !uniqueStrings(regression.evidenceRefs)
    || regression.evidenceRefs.length === 0
  ) {
    addFinding(
      findings,
      'invalid-prior-cq-regression',
      'regression',
      'Regression needs a baseline or explicit cold start, a categorical result, CQ sets, and current regression evidence.',
    );
    return null;
  }

  const evidenceValid = regression.evidenceRefs.every((ref) => {
    const witness = witnesses.get(ref);
    return witness?.kind === 'regression' && witness.current === true;
  });
  if (!evidenceValid) {
    addFinding(
      findings,
      'invalid-prior-cq-regression-evidence',
      'regression.evidenceRefs',
      'Regression evidence must reference current witnesses whose kind is regression.',
    );
  }

  if (regression.baselineQualificationId === null) {
    if (
      regression.status !== 'not_applicable'
      || regression.priorCqIds.length > 0
      || regression.rerunCqIds.length > 0
    ) {
      addFinding(
        findings,
        'invalid-cold-start-regression',
        'regression',
        'A cold start uses not_applicable with empty prior and rerun CQ sets.',
      );
    }
  } else {
    const prior = new Set(regression.priorCqIds);
    const rerun = new Set(regression.rerunCqIds);
    if (
      regression.status === 'not_applicable'
      || prior.size === 0
      || [...prior].some((id) => !questions.has(id) || !rerun.has(id))
      || [...rerun].some((id) => !prior.has(id))
    ) {
      addFinding(
        findings,
        'incomplete-prior-cq-regression',
        'regression',
        'Every prior CQ must still exist in the approved CQ set and be rerun exactly once.',
      );
    }
  }

  if (regression.status === 'failed' && axisRows.get('maintainability')?.status === 'passed') {
    addFinding(
      findings,
      'regression-axis-conflict',
      'axisResults.maintainability',
      'Maintainability cannot pass while the prior-CQ regression failed.',
    );
  }
  return structuredClone(regression);
}
