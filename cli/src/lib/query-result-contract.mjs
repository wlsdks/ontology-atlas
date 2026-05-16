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
  return counts.issues > 0 || counts.unresolvedEdges > 0 ? 1 : 0;
}

export function compileBlockingCounts(artifact) {
  const summary = artifact?.summary ?? artifact ?? {};
  return {
    issues: numberValue(summary.issues ?? summary.issueCount ?? artifact?.issueCount),
    unresolvedEdges: numberValue(
      summary.unresolvedEdges ?? summary.unresolvedEdgeCount ?? artifact?.unresolvedEdgeCount,
    ),
  };
}

export function cyclesResultExitCode(result) {
  const cycles = Array.isArray(result?.cycles) ? result.cycles : [];
  const total = numberValue(result?.totalCycles, cycles.length);
  return total === 0 ? 0 : 1;
}

export function pathResultExitCode(result) {
  if (result?.found === false) return 1;
  return Array.isArray(result?.hops) && result.hops.length > 0 ? 0 : 1;
}

export function healthResultExitCode(result) {
  const status = result?.status ?? 'unknown';
  return status === 'healthy' || status === 'pass' ? 0 : 1;
}

export function workspaceBriefExitCode(result) {
  const next = Array.isArray(result?.nextActions) ? result.nextActions : [];
  if (next.some((action) => action?.severity === 'fail')) return 1;
  const checks = Array.isArray(result?.health?.checks) ? result.health.checks : [];
  return checks.some((check) => check?.status === 'fail') ? 1 : 0;
}

function numberValue(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
