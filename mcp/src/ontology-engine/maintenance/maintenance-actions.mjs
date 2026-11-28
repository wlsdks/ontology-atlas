import { compareText } from '../../compare-text.mjs';

export function compareMaintenanceActions(left, right) {
  const severityRank = { fail: 0, warn: 1, info: 2 };
  const phaseRank = { validate: 0, repair: 1, link: 2, materialize: 3, review: 4 };
  const severityDelta = (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9);
  if (severityDelta !== 0) return severityDelta;
  const phaseDelta = (phaseRank[left.phase] ?? 9) - (phaseRank[right.phase] ?? 9);
  if (phaseDelta !== 0) return phaseDelta;
  if ((right.score || 0) !== (left.score || 0)) return (right.score || 0) - (left.score || 0);
  return compareText(`${left.kind}:${left.reason}`, `${right.kind}:${right.reason}`);
}

/** Every node a step is about: its own node, the two ends of a link, a cycle's members, a compile issue's node. */
export function maintenanceActionSlugs(action) {
  const nodes = Array.isArray(action.nodes) ? action.nodes : Object.values(action.nodes ?? {});
  const cycle = action.cycle?.nodes ?? [];
  return [action.node?.slug, ...nodes.map((node) => node?.slug), ...cycle, action.issue?.slug]
    .filter((slug) => typeof slug === 'string');
}

export function annotateMaintenanceAction(action) {
  return {
    id: maintenanceActionId(action),
    executable: Boolean(action.proposedAction?.tool),
    ...action,
  };
}

function maintenanceActionId(action) {
  const payload = {
    phase: action.phase,
    kind: action.kind,
    severity: action.severity,
    proposedAction: action.proposedAction ?? null,
    node: action.node?.slug ?? null,
    nodes: normalizeMaintenanceActionNodes(action.nodes),
    issue: action.issue
      ? {
          code: action.issue.code,
          slug: action.issue.slug,
          ref: action.issue.ref,
        }
      : null,
    cycle: Array.isArray(action.cycle) ? action.cycle : null,
    reason: action.reason,
  };
  return `maint_${hashString(JSON.stringify(payload))}`;
}

function normalizeMaintenanceActionNodes(nodesValue) {
  if (!nodesValue) return null;
  if (Array.isArray(nodesValue)) return nodesValue.map((node) => node?.slug ?? node).sort();
  if (typeof nodesValue === 'object') {
    return Object.fromEntries(
      Object.entries(nodesValue)
        .map(([key, node]) => [key, node?.slug ?? node])
        .sort(([left], [right]) => compareText(left, right)),
    );
  }
  return nodesValue;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
