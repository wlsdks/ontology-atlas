/**
 * B3 — 에이전트 활동 로그(`.ontology-atlas/activity.jsonl`) 파서.
 * 쓰기는 MCP(`mcp/src/activity-log.mjs`)가 소유하고, 웹은 읽기만 한다.
 * 한 줄 스키마 v1: {"v":1,"at":ISO,"tool","target","summary","agent","why"}
 * 깨진 줄은 건너뛴다 — 파서가 죽어 전체를 못 보여주는 것이 더 나쁘다.
 * (mcp 리더와의 drift 는 cross-package 계약 테스트가 잡는다.)
 */
export interface AgentActivityEntry {
  v: 1;
  at: string;
  tool: string;
  target: string;
  summary: string;
  agent: string | null;
  why: string | null;
}

export function parseAgentActivityLog(raw: string, { limit = 100 }: { limit?: number } = {}): AgentActivityEntry[] {
  const entries: AgentActivityEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Partial<AgentActivityEntry>;
      if (parsed?.v !== 1 || typeof parsed.at !== "string" || typeof parsed.summary !== "string") continue;
      entries.push({
        v: 1,
        at: parsed.at,
        tool: typeof parsed.tool === "string" ? parsed.tool : "",
        target: typeof parsed.target === "string" ? parsed.target : "",
        summary: parsed.summary,
        agent: typeof parsed.agent === "string" ? parsed.agent : null,
        why: typeof parsed.why === "string" ? parsed.why : null,
      });
    } catch {
      /* skip broken line */
    }
  }
  return entries.slice(-limit);
}

/** nowMs 기준 오늘(24h) 항목 수 — 다이제스트 헤더용. */
export function countRecentEntries(entries: readonly AgentActivityEntry[], nowMs: number, windowMs = 24 * 3600 * 1000): number {
  return entries.filter((entry) => {
    const t = Date.parse(entry.at);
    return Number.isFinite(t) && nowMs - t <= windowMs && t - nowMs <= 60 * 60 * 1000;
  }).length;
}
