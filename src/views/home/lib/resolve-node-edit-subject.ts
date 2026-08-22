import type { AgentActivityStatus } from "@/features/docs-vault-local";
import { pickLastEditSubject, type LastEditSubjectFact } from "@/shared/lib/last-edit-subject";
import { hasUnaccountedMtimeChange } from "@/shared/lib/mtime-conflict";

/**
 * Resolves the "last edited by human/AI" fact for `TopologyV2DetailPanel` and
 * `FullDetailA1`, the graph-node counterparts of `resolveDocLastEditSubject`
 * (docs-vault). Same two real sources, adapted to the graph's own id shape:
 *
 * - **AI agent**: a fresh heartbeat whose focus resolves (via the existing
 *   `resolveAgentFocusNodeId`) to THIS node id — passed in as a param rather
 *   than re-derived here, so the "agent just now" badge and this fact always
 *   agree on which node the agent is looking at.
 * - **Human**: `selfEditTimestamps` keyed by vault slug (`sourceSlug`) —
 *   the same cross-page self-write record `resolveDocLastEditSubject`
 *   reads, shared via the `LocalVaultProvider` singleton so an edit made on
 *   `/docs` shows up here too.
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
 * The `expected_mtime` conflict badge: true only when this node's source
 * document freshness (ISO, derived from mtime) has moved away from the baseline
 * taken when the panel opened, and the difference is not explained by our own
 * write. Reuses shared `hasUnaccountedMtimeChange` — the same rule as
 * docs-vault's numeric-mtime version.
 */
export function hasNodeMtimeConflict(params: {
  sourceSlug: string | null;
  baselineFreshnessIso: string | null;
  currentFreshnessIso: string | null;
  baselineCapturedAtMs: number;
  selfEditTimestamps: ReadonlyMap<string, number>;
}): boolean {
  const { sourceSlug, baselineFreshnessIso, currentFreshnessIso, baselineCapturedAtMs, selfEditTimestamps } =
    params;
  return hasUnaccountedMtimeChange({
    baseline: baselineFreshnessIso,
    current: currentFreshnessIso,
    selfEditAtMs: sourceSlug ? selfEditTimestamps.get(sourceSlug) ?? null : null,
    baselineCapturedAtMs,
  });
}
