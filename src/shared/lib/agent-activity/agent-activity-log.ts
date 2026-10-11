/**
 * Parser for the agent activity log (`.ontology-atlas/activity.jsonl`).
 * Writing is owned by MCP (`mcp/src/activity-log.mjs`); the web only reads.
 * Line schema v1: {"v":1,"at":ISO,"tool","target","summary","agent","why"}
 * Broken lines are skipped — a parser dying and showing nothing is worse.
 * Drift against the MCP reader is caught by a cross-package contract test.
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

/** Entries within the last 24h of `nowMs`, for the digest header. */
export function countRecentEntries(entries: readonly AgentActivityEntry[], nowMs: number, windowMs = 24 * 3600 * 1000): number {
  return entries.filter((entry) => {
    const t = Date.parse(entry.at);
    return Number.isFinite(t) && nowMs - t <= windowMs && t - nowMs <= 60 * 60 * 1000;
  }).length;
}

/**
 * Passes only targets usable as a slug. A slug contains one `/` (`capabilities/checkout`), so a `/`
 * is no signal. Filtered: the `(batch)` marker, whitespace or a backslash, and a file path ending in
 * an extension.
 */
const NON_SLUG_TARGET = /[\s\\]|^\(|\.[A-Za-z0-9]{1,8}$/;

/**
 * The working-on row and the notification tray share this one filter, or one of them grows dead
 * links.
 */
export function toSlugTarget(target: string | null | undefined): string | null {
  const trimmed = (target ?? "").trim();
  if (!trimmed) return null;
  return NON_SLUG_TARGET.test(trimmed) ? null : trimmed;
}
