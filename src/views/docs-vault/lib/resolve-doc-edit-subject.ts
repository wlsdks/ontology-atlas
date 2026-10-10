import type { AgentActivityFocus, AgentActivityStatus } from "@/entities/vault-session";
import { pickLastEditSubject, type LastEditSubjectFact } from "@/shared/lib/last-edit-subject";
import { hasUnaccountedMtimeChange } from "@/shared/lib/mtime-conflict";

/**
 * "Last edited · person/AI" from the only two real sources: a fresh heartbeat whose `focus`
 * names this doc (matched by bare-slug suffix like `resolveAgentFocusNodeId`), or this session's
 * self-writes (`markSelfWrite`). Never inferred from mtime alone, which
 * a checkout or another editor can change. Null when neither has evidence.
 */
export function resolveDocLastEditSubject(params: {
  doc: { slug: string; path: string };
  /** Null on server and sample vaults: the agent candidate is unevidenced, the human one still evaluated. */
  agentActivityStatus: AgentActivityStatus | null;
  selfEditTimestamps: ReadonlyMap<string, number>;
}): LastEditSubjectFact | null {
  const { doc, agentActivityStatus, selfEditTimestamps } = params;
  const heartbeat = agentActivityStatus?.heartbeat ?? null;
  const hasFreshHeartbeat = Boolean(
    heartbeat && agentActivityStatus?.valid && !agentActivityStatus?.stale,
  );
  const agentMatches = hasFreshHeartbeat && heartbeat ? doesHeartbeatFocusMatchDoc(heartbeat.focus, doc) : false;
  const agentAtMs = agentMatches && heartbeat ? Date.parse(heartbeat.updatedAt) : Number.NaN;
  const selfEditAtMs = selfEditTimestamps.get(doc.slug) ?? null;

  return pickLastEditSubject([
    { kind: "agent", atMs: Number.isFinite(agentAtMs) ? agentAtMs : null },
    { kind: "human", atMs: selfEditAtMs },
  ]);
}

function doesHeartbeatFocusMatchDoc(
  focus: AgentActivityFocus,
  doc: { slug: string; path: string },
): boolean {
  const bareSlug = doc.slug.split("/").pop() ?? doc.slug;
  if (focus.ontologySlug) {
    const candidate = focus.ontologySlug;
    if (candidate === doc.slug || candidate === bareSlug) return true;
    if (candidate.endsWith(`/${bareSlug}`)) return true;
  }
  if (focus.files.length > 0) {
    return focus.files.some(
      (file) => file === doc.path || file.endsWith(`/${doc.path}`) || doc.path.endsWith(file),
    );
  }
  return false;
}

/**
 * True only when `doc.mtime` moved from `baselineMtime` and no self-write explains it
 * (`hasUnaccountedMtimeChange`, the topology panel's rule).
 */
export function hasDocMtimeConflict(params: {
  doc: { slug: string; mtime?: number };
  baselineMtime: number | undefined;
  baselineCapturedAtMs: number;
  selfEditTimestamps: ReadonlyMap<string, number>;
}): boolean {
  const { doc, baselineMtime, baselineCapturedAtMs, selfEditTimestamps } = params;
  return hasUnaccountedMtimeChange({
    baseline: baselineMtime,
    current: doc.mtime,
    selfEditAtMs: selfEditTimestamps.get(doc.slug) ?? null,
    baselineCapturedAtMs,
  });
}
