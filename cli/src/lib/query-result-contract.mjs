const DIAGNOSIS_STATUSES = new Set(['healthy', 'needs_attention']);
const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);
const MAINTENANCE_ACTION_SEVERITIES = new Set(['fail', 'warn', 'info']);

export function assertQueryOperation(result, expectedOperation) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`${expectedOperation} query returned a non-object response`);
  }
  if (result.operation !== expectedOperation) {
    throw new Error(`${expectedOperation} query returned unexpected operation: ${result.operation}`);
  }
  return result;
}

export function assertMaintenancePlanShape(result) {
  assertQueryOperation(result, 'maintenance_plan');
  if (!isPlainObject(result.summary)) {
    throw new Error('maintenance_plan summary must be an object');
  }
  for (const field of [
    'totalActions',
    'filteredActions',
    'remainingActions',
    'executableActions',
    'reviewActions',
  ]) {
    if (!validCount(result.summary[field])) {
      throw new Error(`maintenance_plan summary.${field} must be a non-negative integer`);
    }
  }
  if (!isPlainObject(result.cursor)) {
    throw new Error('maintenance_plan cursor must be an object');
  }
  if (typeof result.cursor.found !== 'boolean') {
    throw new Error('maintenance_plan cursor.found must be a boolean');
  }
  if (result.cursor.startIndex != null && !validCount(result.cursor.startIndex)) {
    throw new Error('maintenance_plan cursor.startIndex must be a non-negative integer');
  }
  if (typeof result.cursor.hasMore !== 'boolean') {
    throw new Error('maintenance_plan cursor.hasMore must be a boolean');
  }
  for (const field of ['afterActionId', 'nextAfterActionId', 'reason']) {
    if (!nullableString(result.cursor[field])) {
      throw new Error(`maintenance_plan cursor.${field} must be null or a string`);
    }
  }
  if (!Array.isArray(result.actions)) {
    throw new Error('maintenance_plan actions must be an array');
  }
  for (let index = 0; index < result.actions.length; index += 1) {
    const action = result.actions[index];
    if (!validMaintenanceAction(action)) {
      throw new Error(`maintenance_plan actions[${index}] has an invalid action shape`);
    }
  }
  for (const field of ['byPhase', 'bySeverity', 'byKind']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`maintenance_plan ${field} must be an object of non-negative integer counts`);
    }
  }
  for (const field of ['nextExecutableAction', 'nextReviewAction']) {
    if (result[field] !== null && !validMaintenanceActionPointer(result[field])) {
      throw new Error(`maintenance_plan ${field} must be null or an action pointer with an id`);
    }
  }
  return result;
}

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

export function assertCyclesShape(result) {
  assertQueryOperation(result, 'cycles');
  if (!Array.isArray(result.cycles)) {
    throw new Error('cycles query cycles must be an array');
  }
  const total = result.totalCycles ?? result.cycles.length;
  if (!validCount(total)) {
    throw new Error('cycles query totalCycles must be a non-negative integer when present');
  }
  for (let index = 0; index < result.cycles.length; index += 1) {
    if (!validCycle(result.cycles[index])) {
      throw new Error(`cycles query cycles[${index}] has an invalid cycle shape`);
    }
  }
  return result;
}

export function assertPathShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_path response must be an object');
  }
  if (result.found === false) return result;
  if (!Array.isArray(result.hops) || result.hops.length === 0) {
    throw new Error('find_path response hops must be a non-empty array when found');
  }
  if (result.hops.some((hop) => !hasNonEmptyString(hop))) {
    throw new Error('find_path response hops must contain non-empty strings');
  }
  if (typeof result.hopCount === 'number' && result.hopCount !== result.hops.length - 1) {
    throw new Error('find_path response hopCount must match hops length');
  }
  if (!Array.isArray(result.edges)) {
    throw new Error('find_path response edges must be an array when found');
  }
  if (result.edges.length !== result.hops.length - 1) {
    throw new Error('find_path response edges length must match hops length');
  }
  for (let index = 0; index < result.edges.length; index += 1) {
    if (!validPathEdge(result.edges[index], result.hops[index], result.hops[index + 1])) {
      throw new Error(`find_path response edges[${index}] has an invalid path-edge shape`);
    }
  }
  return result;
}

export function compileResultExitCode(artifact) {
  const counts = compileBlockingCounts(artifact);
  if (!validCount(counts.issues) || !validCount(counts.unresolvedEdges)) return 1;
  return counts.issues > 0 || counts.unresolvedEdges > 0 ? 1 : 0;
}

export function compileBlockingCounts(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { issues: Number.NaN, unresolvedEdges: Number.NaN };
  }
  const summary = artifact.summary && typeof artifact.summary === 'object' && !Array.isArray(artifact.summary)
    ? artifact.summary
    : artifact;
  return {
    issues: countValue(summary.issues ?? summary.issueCount ?? artifact.issueCount),
    unresolvedEdges: countValue(summary.unresolvedEdges ?? summary.unresolvedEdgeCount ?? artifact.unresolvedEdgeCount),
  };
}

export function cyclesResultExitCode(result) {
  if (!Array.isArray(result?.cycles)) return 1;
  const cycles = result.cycles;
  const total = numberValue(result?.totalCycles, cycles.length);
  if (!Number.isInteger(total) || total < 0) return 1;
  if (cycles.some((cycle) => !validCycle(cycle))) return 1;
  return total === 0 ? 0 : 1;
}

export function pathResultExitCode(result) {
  if (result?.found === false) return 1;
  if (!Array.isArray(result?.hops) || result.hops.length === 0) return 1;
  if (result.hops.some((hop) => !hasNonEmptyString(hop))) return 1;
  if (typeof result.hopCount === 'number' && result.hopCount !== result.hops.length - 1) return 1;
  if (!Array.isArray(result.edges) || result.edges.length !== result.hops.length - 1) return 1;
  if (result.edges.some((edge, index) => !validPathEdge(edge, result.hops[index], result.hops[index + 1]))) {
    return 1;
  }
  return 0;
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

function validNextAction(action) {
  return Boolean(
    action
    && typeof action === 'object'
    && !Array.isArray(action)
    && hasNonEmptyString(action.id, action.kind)
    && NEXT_ACTION_SEVERITIES.has(action.severity)
  );
}

function validHealthCheck(check) {
  return Boolean(
    check
    && typeof check === 'object'
    && !Array.isArray(check)
    && hasNonEmptyString(check.id)
    && HEALTH_CHECK_STATUSES.has(check.status)
    && validCount(check.count)
  );
}

function validMaintenanceAction(action) {
  return Boolean(
    isPlainObject(action)
    && hasNonEmptyString(action.id)
    && hasNonEmptyString(action.phase)
    && hasNonEmptyString(action.kind)
    && MAINTENANCE_ACTION_SEVERITIES.has(action.severity)
    && typeof action.executable === 'boolean'
    && Number.isFinite(action.score)
  );
}

function validMaintenanceActionPointer(action) {
  return Boolean(isPlainObject(action) && hasNonEmptyString(action.id));
}

function validCountBucket(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((count) => validCount(count));
}

function validCycle(cycle) {
  if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) return false;
  const nodes = Array.isArray(cycle.nodes) ? cycle.nodes : cycle.slugs;
  if (!Array.isArray(nodes) || nodes.length < 2) return false;
  if (!nodes.every((slug) => hasNonEmptyString(slug))) return false;
  if (cycle.edges === undefined) return true;
  return Array.isArray(cycle.edges) && cycle.edges.length === nodes.length - 1;
}

function validPathEdge(edge, from, to) {
  return Boolean(
    edge
    && typeof edge === 'object'
    && !Array.isArray(edge)
    && edge.from === from
    && edge.to === to
    && hasNonEmptyString(edge.via)
  );
}

function hasNonEmptyString(...values) {
  return values.some((value) => typeof value === 'string' && value.trim().length > 0);
}

function nullableString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberValue(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function countValue(value) {
  return validCount(value) ? value : Number.NaN;
}

function validCount(value) {
  return Number.isInteger(value) && value >= 0;
}
