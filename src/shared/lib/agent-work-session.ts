/**
 * Groups activity-log lines into **work sessions**.
 *
 * **Why sessions and not lines.** In the 2026-08-01 experiment an agent wrote
 * **53 times in 11 minutes 40 seconds**. Per line that is 53 notifications —
 * nobody reads them, and a bell badge that is always red means nothing. Grouped
 * into sessions the same log produces two.
 *
 * **How "the work finished" is known: it went quiet.** Atlas does not connect to
 * the agent (it only watches a folder), so there is no "done" callback and the
 * only observable signal is **how long writing has stopped**. The threshold came
 * from the distribution of two measured logs (98 lines, 96 inter-write gaps):
 *
 * ```
 * p50 1.9s · p90 23.2s · p95 48.5s · p98 133.9s · p99 329.5s · max 1733.3s
 * 80.2% of gaps are 4s or less
 * ```
 *
 * The tail mixes two things: **silence inside a session** (the agent reading,
 * thinking and editing code — only successful writes reach the log, so that
 * stretch produces no lines) and **silence between sessions**. The largest
 * observed in-session silence was 133.9s; the next values are 329.5s and 1733.3s
 * (28.9 min — where a session actually ended).
 *
 * How each threshold splits the logs, measured:
 *
 * | Threshold | Gaps split on | Result |
 * |---|---|---|
 * | 60s | 5 | 7 sessions across two logs — a 40s pause read as an ending |
 * | 120s | 4 | 6 sessions — still reads the 133.9s silence as an ending |
 * | **300s** | **2** | **2 sessions per log** — the "one or two" the owner asked for |
 * | 600s | 1 | one session across a 29-minute silence — the "done" notice arrives 10 min late |
 *
 * **Three reasons for 5 minutes (300s):**
 * 1. It is **2.24×** the largest observed in-session silence (133.9s), so an
 *    agent thinking twice as long as anything measured still stays one session.
 * 2. It is the **same value** as `AGENT_ACTIVITY_STALE_AFTER_MS` (when a
 *    heartbeat is considered stale). "This agent is gone" must not have two
 *    different numbers inside one product.
 * 3. The cost of being wrong is asymmetric and bounded — too long delays the
 *    "done" notice by at most 5 minutes, too short splits one session into
 *    several notifications, which is exactly the failure this grouping exists to
 *    prevent.
 */
import { toSlugTarget, type AgentActivityEntry } from "./agent-activity-log";

/** Writing quiet for this long counts as the session having ended; rationale in the file header. */
export const AGENT_TASK_IDLE_MS = 5 * 60 * 1000;

/**
 * How long "last worked N minutes ago" stays on screen.
 *
 * The sentence is **true** whenever it is shown — unlike "connected" it cannot
 * go stale, because there is no connection. The cap exists for a different
 * reason: not truth but **newsworthiness**. A three-day-old record belongs in the
 * notification list, not in the chrome over the map. The value reuses the "today"
 * boundary this log already uses (the 24 hours in `countRecentEntries`) so that
 * one log does not end up with two definitions of "recent".
 */
export const AGENT_TASK_VISIBLE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The three things a session can do to the vault. Owner-agreed wording: 「추가 · 편집 · 삭제」 (added · edited · removed). */
export type AgentWriteKind = "added" | "edited" | "removed";

export type AgentWriteCounts = Record<AgentWriteKind, number>;

/**
 * Tool → kind. **The tool name is the intent** — unlike a manifest diff, it never
 * misreads a rename as "removed + added" (`VaultDiffToaster` uses tool names for
 * the same reason).
 */
const WRITE_KIND_BY_TOOL: Readonly<Record<string, AgentWriteKind>> = {
  add_concept: "added",
  add_concepts: "added",
  add_relation: "added",
  add_relations: "added",
  absorb_document: "added",
  patch_concept: "edited",
  rename_concept: "edited",
  reclassify_concept: "edited",
  merge_concepts: "edited",
  replace_relation: "edited",
  delete_concept: "removed",
  remove_relation: "removed",
};

/** Batch tools — one line stands for several rows, and the row count exists only in the summary text. */
const BATCH_TOOLS = new Set(["add_concepts", "add_relations"]);

/**
 * How many rows a batch line really covered. The summary text
 * (`add_concepts 46행 성공`) is **owned by MCP**, so it is parsed here. If that
 * wording changes the count simply falls back to 1 rather than breaking the
 * screen — an undercount is preferable to a notification that never appears.
 */
export function entryWeight(entry: AgentActivityEntry): number {
  if (!BATCH_TOOLS.has(entry.tool)) return 1;
  const matched = /(\d+)\s*행/.exec(entry.summary);
  if (!matched) return 1;
  const parsed = Number.parseInt(matched[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export interface AgentWorkSession {
  /**
   * Keyed by **start time**, because the list is re-derived on every poll. Keying
   * by array index would turn every notification into a new one the moment a
   * single line arrives at the front.
   */
  id: string;
  startAt: number;
  endAt: number;
  /** Log lines (a batch counts as 1) — how many times it wrote. */
  entryCount: number;
  /** Rows per kind (a batch counts as N) — what it did and how much. */
  counts: AgentWriteCounts;
  /** Candidate slug of the last thing touched; null for batches and document absorption. */
  lastTarget: string | null;
  lastTool: string | null;
  /**
   * The last agent to identify itself in this session (from the heartbeat or the
   * MCP handshake's clientInfo.name — `resolveAgentName` in
   * `mcp/src/activity-log.mjs`). An anonymous line does not erase the previous
   * name, for the same reason as `lastTarget`: one batch line must not cost the
   * screen something it could have said. Null if never heard.
   */
  agent: string | null;
  /** Has it been quiet for `idleMs` — true only for finished sessions. */
  done: boolean;
}

function emptyCounts(): AgentWriteCounts {
  return { added: 0, edited: 0, removed: 0 };
}

/** Is any kind non-zero — "added 0 · edited 0 · removed 0" is not information. */
export function hasWrites(counts: AgentWriteCounts): boolean {
  return counts.added > 0 || counts.edited > 0 || counts.removed > 0;
}

/**
 * Activity log → sessions, oldest first. Pure: reads neither files nor the clock.
 *
 * @param entries Parsed log tail, in any order — sorted by time here.
 * @param nowMs   Reference time, used only to decide whether the last session ended.
 */
export function deriveAgentWorkSessions(
  entries: readonly AgentActivityEntry[],
  nowMs: number,
  { idleMs = AGENT_TASK_IDLE_MS }: { idleMs?: number } = {},
): AgentWorkSession[] {
  const timed = entries
    .map((entry) => ({ entry, at: Date.parse(entry.at) }))
    .filter((row) => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at);

  const sessions: AgentWorkSession[] = [];
  let current: AgentWorkSession | null = null;

  for (const { entry, at } of timed) {
    if (current && at - current.endAt > idleMs) current = null;
    if (!current) {
      current = {
        id: `task:${at}`,
        startAt: at,
        endAt: at,
        entryCount: 0,
        counts: emptyCounts(),
        lastTarget: null,
        lastTool: null,
        agent: null,
        done: false,
      };
      sessions.push(current);
    }
    current.endAt = at;
    current.entryCount += 1;
    const kind = WRITE_KIND_BY_TOOL[entry.tool];
    if (kind) current.counts[kind] += entryWeight(entry);
    current.lastTool = entry.tool.trim() || current.lastTool;
    // Only update the last target **when it is a slug**. A trailing batch line
    // must not erase the target already known, or the screen loses what it could
    // have said.
    current.lastTarget = toSlugTarget(entry.target) ?? current.lastTarget;
    current.agent = entry.agent?.trim() || current.agent;
  }

  for (const session of sessions) {
    session.done = nowMs - session.endAt > idleMs;
  }
  return sessions;
}

/** The session being written right now (the last one not yet finished), or null. */
export function activeSession(sessions: readonly AgentWorkSession[]): AgentWorkSession | null {
  const last = sessions[sessions.length - 1];
  return last && !last.done ? last : null;
}
