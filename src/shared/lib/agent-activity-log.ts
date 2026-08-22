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
 * Passes through only targets usable as a slug. The log's `target` is mostly a
 * slug but not always — batch tools write `(batch)` and `absorb_document` writes
 * a file path (`summarizeWrite` in `mcp/src/index.js`). The UI navigates to a
 * node using this value, so passing a non-slug off as a slug makes a dead link.
 *
 * ⚠️ **A `/` is not a signal that it is not a slug** (corrected 2026-08-01). The
 * first version of this rule said "a path separator means it is not a slug", but
 * the spec's slug is exactly `folderForKind(kind)` plus a flat name — i.e. it
 * **contains one `/`, as in `capabilities/checkout`** (`flatSlugIssue` in
 * `mcp/src/schema.mjs`). Across 98 measured log lines, **every** non-batch target
 * had that shape, so under the old rule `lastTarget` was effectively always null:
 * instead of blocking dead links it was blocking **all the live ones**. What the
 * ledger forbids is a **path-shaped** slug like `elements/src/views/home`, not a
 * kind folder.
 *
 * So only three "cannot possibly be a slug" shapes are filtered here: the batch
 * marker (`(batch)`), whitespace or a backslash, and **a file path ending in an
 * extension** (`absorb_document`). The remaining layer belongs to the UI, which
 * checks that **the slug actually exists in the manifest** before linking — a
 * regex knows shape, not existence.
 */
const NON_SLUG_TARGET = /[\s\\]|^\(|\.[A-Za-z0-9]{1,8}$/;

/**
 * Turns a log `target` into a slug the UI may link to, or `null`.
 *
 * The "working on" row and the notification tray must use **the same verdict**:
 * if only one of them filters `(batch)`, the other grows dead links. Hence one
 * decision point here.
 */
export function toSlugTarget(target: string | null | undefined): string | null {
  const trimmed = (target ?? "").trim();
  if (!trimmed) return null;
  return NON_SLUG_TARGET.test(trimmed) ? null : trimmed;
}
