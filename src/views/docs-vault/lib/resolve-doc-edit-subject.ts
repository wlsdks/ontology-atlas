import type { AgentActivityFocus, AgentActivityStatus } from "@/entities/vault-session";
import { pickLastEditSubject, type LastEditSubjectFact } from "@/shared/lib/last-edit-subject";
import { hasUnaccountedMtimeChange } from "@/shared/lib/mtime-conflict";

/**
 * Resolves `DocFrontmatterBlock`'s "last edited · person/AI" fact from the ONLY two real data
 * sources this surface has:
 *
 * - **AI agent**: a fresh (valid, non-stale) activity heartbeat whose `focus` names THIS doc.
 *   `ontologySlug` may be a folder-prefixed vault path ("capabilities/foo"), a bare slug ("foo"),
 *   or already canonical, matched the same permissive bare-slug-suffix way
 *   `resolveAgentFocusNodeId` (home) matches graph node ids, just against the doc's own slug or
 *   path instead of a graph id.
 * - **Human**: `selfEditTimestamps` — the real record of THIS browser session actually writing
 *   this exact slug through the local vault (see `markSelfWrite` in `use-local-vault.ts`). Never
 *   inferred from mtime alone — an mtime change could come from a git checkout, another editor, or
 *   a different AI agent session with no heartbeat, none of which is "me".
 *
 * When neither source has evidence for this doc, it returns null and the caller renders nothing
 * rather than guessing a subject.
 */
export function resolveDocLastEditSubject(params: {
  doc: { slug: string; path: string };
  /** null — a surface where the caller receives no heartbeat source at all (a server or sample
   *  vault). The agent candidate is automatically treated as unevidenced; the human candidate is
   *  still evaluated. */
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
 * The expected_mtime conflict badge — true only when `doc.mtime` differs from `baselineMtime` (its
 * value when the document was opened) AND that difference is not explained by a self-write this
 * session. The verdict itself reuses the shared `hasUnaccountedMtimeChange` — the same rule as the
 * topology panel's freshness-ISO version.
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
