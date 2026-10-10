import { validCount } from './value-checks.mjs';

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

function countValue(value) {
  return validCount(value) ? value : Number.NaN;
}
