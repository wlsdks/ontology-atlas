import type { AgentActivityStatus } from "@/features/docs-vault-local";
import { pickLastEditSubject, type LastEditSubjectFact } from "@/shared/lib/last-edit-subject";
import { hasUnaccountedMtimeChange } from "@/shared/lib/mtime-conflict";

/**
 * rank7 (design-council B5) — resolves the "마지막 편집 · 사람/AI" fact for
 * `TopologyV2DetailPanel`/`FullDetailA1`, the graph-node counterparts of
 * `resolveDocLastEditSubject` (docs-vault). Same two real sources, adapted
 * to the graph's own id shape:
 *
 * - **AI agent**: a fresh heartbeat whose focus resolves (via the existing
 *   `resolveAgentFocusNodeId`, W6) to THIS node id — reused as a param
 *   rather than re-derived here, so both P4b's "에이전트가 방금" badge and
 *   this fact always agree on which node the agent is looking at.
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
 * expected_mtime 충돌 배지 — 이 노드의 근거 문서 freshness(ISO, mtime 파생)
 * 가 패널을 연 시점의 baseline 과 달라졌고, 그 차이가 자기 쓰기로 설명되지
 * 않을 때만 true. `hasUnaccountedMtimeChange`(shared) 재사용 — docs-vault
 * 쪽의 numeric-mtime 버전과 같은 규칙.
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
