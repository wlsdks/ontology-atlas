import type { AgentActivityStatus } from "@/entities/vault-session";
import { pickLastEditSubject, type LastEditSubjectFact } from "@/shared/lib/last-edit-subject";
import { hasUnaccountedMtimeChange } from "@/shared/lib/mtime-conflict";

/**
 * The graph-node twin of `resolveDocLastEditSubject`: the same two sources keyed by graph id.
 * The agent side takes the resolved focus id as a param so the "agent just now" badge agrees on
 * the node;
 * the human side reads `selfEditTimestamps` by vault slug, shared through `LocalVaultProvider`
 * with `/docs`.
 */
export function resolveNodeLastEditSubject(params: {
  nodeId: string;
  sourceSlug: string | null;
  agentActivityStatus: AgentActivityStatus;
  agentFocusNodeId: string | null;
  selfEditTimestamps: ReadonlyMap<string, number>;
}): LastEditSubjectFact | null {
  const { nodeId, sourceSlug, agentActivityStatus, agentFocusNodeId, selfEditTimestamps } = params;
  const heartbeat = agentActivityStatus.heartbeat;
  const hasFreshHeartbeat = Boolean(
    heartbeat && agentActivityStatus.valid && !agentActivityStatus.stale,
  );
  const agentMatches = hasFreshHeartbeat && agentFocusNodeId === nodeId;
  const agentAtMs = agentMatches && heartbeat ? Date.parse(heartbeat.updatedAt) : Number.NaN;
  const selfEditAtMs = sourceSlug ? selfEditTimestamps.get(sourceSlug) ?? null : null;

  return pickLastEditSubject([
    { kind: "agent", atMs: Number.isFinite(agentAtMs) ? agentAtMs : null },
    { kind: "human", atMs: selfEditAtMs },
  ]);
}

/**
 * True only when the document's freshness moved from the panel-open baseline and our own write
 * does not explain it.
 * Same rule as docs-vault (`hasUnaccountedMtimeChange`).
 */
export function hasNodeMtimeConflict(params: {
  sourceSlug: string | null;
  baselineFreshnessIso: string | null;
  currentFreshnessIso: string | null;
  baselineSelfEditAtMs: number | null;
  selfEditTimestamps: ReadonlyMap<string, number>;
}): boolean {
  const { sourceSlug, baselineFreshnessIso, currentFreshnessIso, baselineSelfEditAtMs, selfEditTimestamps } =
    params;
  return hasUnaccountedMtimeChange({
    baseline: baselineFreshnessIso,
    current: currentFreshnessIso,
    selfEditAtMs: sourceSlug ? selfEditTimestamps.get(sourceSlug) ?? null : null,
    baselineSelfEditAtMs,
  });
}
