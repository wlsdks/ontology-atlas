import { formatCount } from '../output.mjs';
import {
  VERIFY_TUNED_HEALTH_ARGS,
  VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
} from '../requests/first-contact.mjs';
import { hasNonEmptyString, hasOptionalNonNegativeInteger } from '../value-checks.mjs';

export const DIAGNOSIS_STATUSES = new Set(['healthy', 'needs_attention']);
const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);

export function diagnosisBlockingFailure(label, parsed, expectedOperation) {
  if (parsed?.operation !== expectedOperation) {
    return `${label} returned unexpected operation: ${parsed?.operation}`;
  }
  if (!DIAGNOSIS_STATUSES.has(parsed?.status)) {
    return `${label} response malformed status`;
  }
  if (expectedOperation === 'workspace_brief' && !Array.isArray(parsed?.nextActions)) {
    return `${label} response missing nextActions array`;
  }
  if (expectedOperation === 'workspace_brief') {
    for (const [index, action] of parsed.nextActions.entries()) {
      const actionFailure = diagnosisNextActionFailure(label, action, index);
      if (actionFailure) {
        return actionFailure;
      }
    }
    const growthFailure = workspaceBriefGrowthConsistencyFailure(label, parsed);
    if (growthFailure) return growthFailure;
  }
  const checks = diagnosisChecks(parsed, expectedOperation);
  if (!checks) {
    return `${label} response missing health checks`;
  }
  for (const [index, check] of checks.entries()) {
    const checkFailure = diagnosisHealthCheckFailure(label, check, index);
    if (checkFailure) {
      return checkFailure;
    }
  }
  const failedChecks = checks.filter((check) => check.status === 'fail');
  if (failedChecks.length > 0) {
    return `${label} has failing health checks: ${healthChecksSummary(failedChecks)}. Inspect query_ontology({operation:"health"}) before writing.`;
  }
  const blockingActions = blockingNextActions(parsed?.nextActions);
  if (blockingActions.length > 0) {
    return `${label} has actionable nextActions: ${blockingActions.join(', ')}. Inspect workspace_brief.nextActions before writing.`;
  }
  return null;
}

export function diagnosisNextActionFailure(label, action, index) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return `${label} response malformed nextAction at index ${index}`;
  }
  if (!hasNonEmptyString(action.id, action.kind)) {
    return `${label} response missing nextAction identifier at index ${index}`;
  }
  if (!hasNonEmptyString(action.severity)) {
    return `${label} response missing nextAction severity at index ${index}`;
  }
  if (!NEXT_ACTION_SEVERITIES.has(action.severity)) {
    return `${label} response unknown nextAction severity at index ${index}: ${action.severity}`;
  }
  if (!hasOptionalNonNegativeInteger(action.count)) {
    return `${label} response malformed nextAction count at index ${index}`;
  }
  const sampleFailure = diagnosisNextActionSampleFailure(label, action, index);
  if (sampleFailure) return sampleFailure;
  return null;
}

function diagnosisNextActionSampleFailure(label, action, index) {
  if (action.sample == null) return null;
  if (!Array.isArray(action.sample)) {
    return `${label} response malformed nextAction sample at index ${index}`;
  }
  if (action.count != null && action.sample.length > action.count) {
    return `${label} response nextAction sample exceeds count at index ${index}`;
  }
  for (const [sampleIndex, sample] of action.sample.entries()) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
      return `${label} response malformed nextAction sample row at index ${index}.${sampleIndex}`;
    }
    if (action.kind === 'add_missing_relations') {
      const actionFailure = diagnosisProposedActionSampleFailure(label, action, sample, index, sampleIndex, 'add_relations');
      if (actionFailure) return actionFailure;
      const row = Array.isArray(sample.args.relations) ? sample.args.relations[0] : null;
      if (typeof row?.from !== 'string' || typeof row?.to !== 'string' || typeof row?.type !== 'string') {
        return `${label} response malformed add_missing_relations sample args at index ${index}.${sampleIndex}`;
      }
    }
    if (action.kind === 'materialize_external_elements') {
      const actionFailure = diagnosisProposedActionSampleFailure(label, action, sample, index, sampleIndex, 'add_concepts');
      if (actionFailure) return actionFailure;
      const row = Array.isArray(sample.args.concepts) ? sample.args.concepts[0] : null;
      if (typeof row?.slug !== 'string' || row?.kind !== 'element') {
        return `${label} response malformed materialize_external_elements sample args at index ${index}.${sampleIndex}`;
      }
    }
    if (action.kind === 'resolve_dangling_references') {
      const rowFailure = diagnosisGrowthCandidateSampleFailure(`${label} nextAction resolve_dangling_references sample`, sample, sampleIndex);
      if (rowFailure) return rowFailure;
      if (sample.kind !== 'resolve_dangling_reference') {
        return `${label} response malformed resolve_dangling_references sample kind at index ${index}.${sampleIndex}`;
      }
    }
  }
  return null;
}

function diagnosisGrowthCandidateSampleFailure(label, row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (typeof row.kind !== 'string' || row.kind.length === 0) {
    return `${label} row missing kind at index ${index}`;
  }
  if (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0) {
    return `${label} row missing score: ${row.kind}`;
  }
  if (typeof row.reason !== 'string' || row.reason.length === 0) {
    return `${label} row missing reason: ${row.kind}`;
  }
  return null;
}

function diagnosisProposedActionSampleFailure(label, action, sample, index, sampleIndex, expectedTool) {
  if (sample.tool !== expectedTool) {
    return `${label} response nextAction ${action.kind} sample tool mismatch at index ${index}.${sampleIndex}`;
  }
  if (!sample.args || typeof sample.args !== 'object' || Array.isArray(sample.args)) {
    return `${label} response nextAction ${action.kind} sample missing args at index ${index}.${sampleIndex}`;
  }
  return null;
}

export function diagnosisHealthCheckFailure(label, check, index) {
  if (!check || typeof check !== 'object' || Array.isArray(check)) {
    return `${label} response malformed health check at index ${index}`;
  }
  if (!hasNonEmptyString(check.id)) {
    return `${label} response missing health check id at index ${index}`;
  }
  if (!hasNonEmptyString(check.status)) {
    return `${label} response missing health check status at index ${index}`;
  }
  if (!HEALTH_CHECK_STATUSES.has(check.status)) {
    return `${label} response unknown health check status at index ${index}: ${check.status}`;
  }
  if (!hasOptionalNonNegativeInteger(check.count)) {
    return `${label} response malformed health check count at index ${index}`;
  }
  return null;
}

function workspaceBriefGrowthConsistencyFailure(label, parsed) {
  if (parsed.growth == null) return null;
  if (!parsed.growth || typeof parsed.growth !== 'object' || Array.isArray(parsed.growth)) {
    return `${label} response malformed growth summary`;
  }
  const requiredGrowthCounts = [
    'relationRecommendations',
    'externalElementRefs',
    'danglingReferences',
    'totalActions',
  ];
  if (requiredGrowthCounts.some((key) => !hasOptionalNonNegativeInteger(parsed.growth[key]) || parsed.growth[key] == null)) {
    return `${label} response malformed growth summary`;
  }
  if (parsed.summary?.growthActions != null && parsed.summary.growthActions !== parsed.growth.totalActions) {
    return `${label} growthActions mismatch`;
  }
  for (const action of parsed.nextActions) {
    if (action.kind === 'add_missing_relations' && action.count !== parsed.growth.relationRecommendations) {
      return `${label} add_missing_relations count mismatch`;
    }
    if (action.kind === 'materialize_external_elements' && action.count !== parsed.growth.externalElementRefs) {
      return `${label} materialize_external_elements count mismatch`;
    }
    if (action.kind === 'resolve_dangling_references' && action.count !== parsed.growth.danglingReferences) {
      return `${label} resolve_dangling_references count mismatch`;
    }
  }
  return null;
}

function diagnosisChecks(parsed, expectedOperation) {
  if (expectedOperation === 'workspace_brief') {
    return Array.isArray(parsed?.health?.checks) ? parsed.health.checks : null;
  }
  if (expectedOperation === 'health') {
    return Array.isArray(parsed?.checks) ? parsed.checks : null;
  }
  return Array.isArray(parsed?.checks) ? parsed.checks : [];
}

export function blockingNextActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => action?.severity === 'fail')
    .map(nextActionDiagnosticLabel);
}

function nextActionDiagnosticLabel(action) {
  const label = nextActionLabel(action);
  const severity = action?.severity || 'unknown';
  const count = Number.isInteger(action?.count) ? `:${action.count}` : '';
  return `${label}:${severity}${count}`;
}

function nextActionLabel(action) {
  const id = typeof action?.id === 'string' && action.id.trim().length > 0 ? action.id : null;
  const kind = typeof action?.kind === 'string' && action.kind.trim().length > 0 ? action.kind : null;
  if (id && kind && id !== kind) return `${id}/${kind}`;
  return id || kind || 'unknown';
}

export function diagnosisIssueCount(parsed) {
  return parsed?.summary?.issues ?? parsed?.summary?.compileIssues ?? 0;
}

export function healthSummary(parsed) {
  return [
    `issues:${diagnosisIssueCount(parsed)}`,
    `unresolved:${parsed?.summary?.unresolvedEdges ?? 0}`,
    `cycles:${parsed?.summary?.dependencyCycles ?? 0}`,
    `${formatCount((parsed?.checks || []).length, 'check')}`,
  ].join(', ');
}

export function healthChecksSummary(checks, limit = 5) {
  if (!Array.isArray(checks)) return null;
  const entries = checks
    .filter((check) => check && typeof check === 'object')
    .map((check) => {
      const count = Number.isInteger(check.count) ? `:${check.count}` : '';
      return `${check.id || 'unknown'}:${check.status || 'unknown'}${count}`;
    });
  if (entries.length === 0) return null;
  const shown = entries.slice(0, limit);
  const suffix = entries.length > shown.length ? `, +${entries.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

export function advisoryHealthChecksSummary(checks, limit = 3) {
  if (!Array.isArray(checks)) return null;
  const advisory = checks
    .filter((check) => check?.status !== 'pass' && check?.status !== 'fail')
    .map((check) => {
      const count = Number.isInteger(check.count) ? `:${check.count}` : '';
      const message = typeof check.message === 'string' && check.message.length > 0 ? ` - ${check.message}` : '';
      return `${check.id || 'unknown'}:${check.status || 'unknown'}${count}${message}`;
    });
  if (advisory.length === 0) return null;
  const shown = advisory.slice(0, limit);
  const suffix = advisory.length > shown.length ? `, +${advisory.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

export function tunedHealthScopeOutputSummary(args = VERIFY_TUNED_HEALTH_ARGS) {
  const dependencyTypes = Array.isArray(args.dependencyTypes) && args.dependencyTypes.length > 0
    ? args.dependencyTypes.join('/')
    : 'all';
  const componentTypes = Array.isArray(args.componentTypes) && args.componentTypes.length > 0
    ? args.componentTypes.join('/')
    : 'all';
  return `dependencyTypes=${dependencyTypes}; componentTypes=${componentTypes}`;
}

export function tunedWorkspaceBriefScopeOutputSummary(
  args = VERIFY_TUNED_HEALTH_ARGS,
  nodeLimit = VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
) {
  return `${tunedHealthScopeOutputSummary(args)}; nodeLimit=${nodeLimit}`;
}

export function advisoryNextActionsSummary(actions, limit = 3) {
  if (!Array.isArray(actions)) return null;
  const advisory = actions
    .filter((action) => action?.severity !== 'fail')
    .map((action) => {
      const label = nextActionLabel(action);
      const severity = action.severity || 'unknown';
      const count = Number.isInteger(action.count) ? `:${action.count}` : '';
      const message = typeof action.message === 'string' && action.message.length > 0 ? ` - ${action.message}` : '';
      return `${label}:${severity}${count}${message}`;
    });
  if (advisory.length === 0) return null;
  const shown = advisory.slice(0, limit);
  const suffix = advisory.length > shown.length ? `, +${advisory.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

export function workspaceBriefSummary(parsed) {
  const growth = parsed?.growth;
  const growthText = growth && typeof growth === 'object' && !Array.isArray(growth)
    ? `, growth actions:${growth.totalActions ?? 0} external:${growth.externalElementRefs ?? 0} ignoredExternal:${growth.externalElementRefsIgnored ?? 0}`
    : '';
  return `${formatCount(parsed?.summary?.nodes ?? 0, 'node')}, ${formatCount(
    (parsed?.nextActions || []).length,
    'next action',
  )}, ${formatCount((parsed?.health?.checks || []).length, 'health check')}${growthText}`;
}
