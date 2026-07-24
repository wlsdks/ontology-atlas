import type { AgentActivityFocus, AgentActivityStatus } from "@/features/docs-vault-local";
import { pickLastEditSubject, type LastEditSubjectFact } from "@/shared/lib/last-edit-subject";
import { hasUnaccountedMtimeChange } from "@/shared/lib/mtime-conflict";

/**
 * rank7 (design-council B5) — resolves `DocFrontmatterBlock`'s "마지막
 * 편집 · 사람/AI" fact from the ONLY two real data sources this surface has:
 *
 * - **AI agent**: a fresh (valid, non-stale) activity heartbeat whose
 *   `focus` names THIS doc — `ontologySlug` may be a folder-prefixed vault
 *   path ("capabilities/foo"), a bare slug ("foo"), or already canonical,
 *   matched the same permissive bare-slug-suffix way
 *   `resolveAgentFocusNodeId` (home) matches graph node ids, just against
 *   the doc's own slug/path instead of a graph id.
 * - **Human**: `selfEditTimestamps` — the real record of THIS browser
 *   session actually writing this exact slug through the local vault (see
 *   `markSelfWrite` in `use-local-vault.ts`). Never inferred from mtime
 *   alone — an mtime change could come from a git checkout, another
 *   editor, or a different AI agent session with no heartbeat, none of
 *   which is "me".
 *
 * When neither source has evidence for this doc, returns null — the caller
 * renders nothing rather than guessing a subject.
 */
export function resolveDocLastEditSubject(params: {
  doc: { slug: string; path: string };
  /** null — 호출자가 heartbeat 출처를 아예 못 받은 표면(서버/샘플 볼트).
   *  agent 후보는 자동으로 근거 없음 처리, human 후보는 그대로 평가한다. */
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
 * expected_mtime 충돌 배지 — `doc.mtime`(R11 #15) 이 `baselineMtime`(문서를
 * 연 시점의 값) 과 달라졌고, 그 차이가 이번 세션의 자기 쓰기로 설명되지
 * 않을 때만 true. 판정 자체는 `hasUnaccountedMtimeChange`(shared) 재사용 —
 * 토폴로지 패널의 freshness-ISO 버전과 같은 규칙.
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
