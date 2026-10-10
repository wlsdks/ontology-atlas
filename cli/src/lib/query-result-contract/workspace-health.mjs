import { assertQueryOperation } from './query-operation.mjs';
import { hasNonEmptyString, isPlainObject, validCount } from './value-checks.mjs';

export const DIAGNOSIS_STATUSES = new Set(['healthy', 'needs_attention']);
const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);

export function assertHealthShape(result) {
  assertQueryOperation(result, 'health');
  if (!DIAGNOSIS_STATUSES.has(result.status)) {
    throw new Error(`health status must be one of: ${[...DIAGNOSIS_STATUSES].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('health summary must be an object');
  }
  if (!Array.isArray(result.checks) || result.checks.length === 0) {
    throw new Error('health checks must be a non-empty array');
  }
  for (let index = 0; index < result.checks.length; index += 1) {
    if (!validHealthCheck(result.checks[index])) {
      throw new Error(`health checks[${index}] has an invalid health-check shape`);
    }
  }
  return result;
}

export function assertWorkspaceBriefShape(result) {
  assertQueryOperation(result, 'workspace_brief');
  if (!DIAGNOSIS_STATUSES.has(result.status)) {
    throw new Error(`workspace_brief status must be one of: ${[...DIAGNOSIS_STATUSES].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('workspace_brief summary must be an object');
  }
  if (!Array.isArray(result.nextActions)) {
    throw new Error('workspace_brief nextActions must be an array');
  }
  for (let index = 0; index < result.nextActions.length; index += 1) {
    if (!validNextAction(result.nextActions[index])) {
      throw new Error(`workspace_brief nextActions[${index}] has an invalid next-action shape`);
    }
  }
  if (!isPlainObject(result.health) || !Array.isArray(result.health.checks) || result.health.checks.length === 0) {
    throw new Error('workspace_brief health.checks must be a non-empty array');
  }
  for (let index = 0; index < result.health.checks.length; index += 1) {
    if (!validHealthCheck(result.health.checks[index])) {
      throw new Error(`workspace_brief health.checks[${index}] has an invalid health-check shape`);
    }
  }
  if (result.growth !== undefined && !isPlainObject(result.growth)) {
    throw new Error('workspace_brief growth must be an object when present');
  }
  return result;
}

export function healthResultExitCode(result) {
  const status = result?.status ?? 'unknown';
  if (!DIAGNOSIS_STATUSES.has(status)) return 1;
  if (!Array.isArray(result?.checks)) return 1;
  const checks = result.checks;
  if (checks.length === 0) return 1;
  if (checks.some((check) => !validHealthCheck(check))) return 1;
  if (checks.some((check) => check?.status === 'fail')) return 1;
  return status === 'healthy' ? 0 : 1;
}

export function workspaceBriefExitCode(result) {
  if (!DIAGNOSIS_STATUSES.has(result?.status)) return 1;
  if (!Array.isArray(result?.nextActions)) return 1;
  if (!Array.isArray(result?.health?.checks)) return 1;
  const next = result.nextActions;
  const checks = result.health.checks;
  if (checks.length === 0) return 1;
  if (next.some((action) => !validNextAction(action))) return 1;
  if (checks.some((check) => !validHealthCheck(check))) return 1;
  if (next.some((action) => action?.severity === 'fail')) return 1;
  return checks.some((check) => check?.status === 'fail') ? 1 : 0;
}

export function validNextAction(action) {
  return Boolean(
    action
    && typeof action === 'object'
    && !Array.isArray(action)
    && hasNonEmptyString(action.id, action.kind)
    && NEXT_ACTION_SEVERITIES.has(action.severity)
  );
}

export function validHealthCheck(check) {
  return Boolean(
    check
    && typeof check === 'object'
    && !Array.isArray(check)
    && hasNonEmptyString(check.id)
    && HEALTH_CHECK_STATUSES.has(check.status)
    && validCount(check.count)
  );
}
