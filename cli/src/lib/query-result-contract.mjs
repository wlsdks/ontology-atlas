const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);

export function assertQueryOperation(result, expectedOperation) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`${expectedOperation} query returned a non-object response`);
  }
  if (result.operation !== expectedOperation) {
    throw new Error(`${expectedOperation} query returned unexpected operation: ${result.operation}`);
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
  if (!Array.isArray(result?.checks)) return 1;
  const checks = result.checks;
  if (checks.some((check) => !validHealthCheck(check))) return 1;
  if (checks.some((check) => check?.status === 'fail')) return 1;
  return status === 'healthy' || status === 'pass' ? 0 : 1;
}

export function workspaceBriefExitCode(result) {
  if (!Array.isArray(result?.nextActions)) return 1;
  if (!Array.isArray(result?.health?.checks)) return 1;
  const next = result.nextActions;
  if (next.some((action) => !validNextAction(action))) return 1;
  if (result.health.checks.some((check) => !validHealthCheck(check))) return 1;
  if (next.some((action) => action?.severity === 'fail')) return 1;
  return result.health.checks.some((check) => check?.status === 'fail') ? 1 : 0;
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
  );
}

function validCycle(cycle) {
  if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) return false;
  if (!Array.isArray(cycle.slugs) || cycle.slugs.length < 2) return false;
  return cycle.slugs.every((slug) => hasNonEmptyString(slug));
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
  return values.some((value) => typeof value === 'string' && value.length > 0);
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
