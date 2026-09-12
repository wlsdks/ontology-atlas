/**
 * The bell panel's three answers, derived once.
 *
 * **Why this module exists.** The panel used to be one log: work receipts stacked over
 * an event feed, every line an event. Measured on the seeded fixture, a person returning
 * after an hour read a receipt's title, its path in parentheses, and then four
 * dot-separated state words — agent, allowed, completed, one change — then the same title
 * again, then "<agent> finished a task" and "<agent> started a task" for one single piece
 * of work, and nothing at all about the request the agent was blocked on. Four dot-separated state words are not a sentence,
 * and a start plus an end are not two events to a person: they are one task.
 *
 * So the panel asks three different questions and this module answers all three from the
 * **same sources the feed already reads** (owner, 2026-09-12: this panel's inside matters
 * very much, and tabs inside it are fine):
 *
 * | Tab | Question | Source |
 * |---|---|---|
 * | `todo` | What waits on me? | a blocked turn (`work.phase === 'blocked'`) · folder problems the last turn added |
 * | `results` | What got done? | finished sessions joined to their `task-end` notification, plus decisions that produced no write |
 * | `history` | What happened, when? | the same notifications, folded per task and grouped by day |
 *
 * **What this module refuses to invent.** It never turns silence into a claim: a session
 * with no end notification is not a result, a receipt is attributed to a task only inside
 * the product's own "same piece of work" window, and a problem stops being a thing to do
 * once it is older than the 24-hour newsworthiness window the activity log already
 * defines. Copy lives in `messages/*.json`; this file returns facts and counts only.
 */
import type { AcpWorkDecision, AcpWorkReceipt, AcpWorkResult } from '@/shared/lib/acp-work-receipt';
import type { AgentNotification, AgentNotificationKind } from '@/shared/lib/agent-notifications';
import {
  AGENT_TASK_IDLE_MS,
  AGENT_TASK_VISIBLE_WINDOW_MS,
  type AgentWriteCounts,
  type AgentWorkSession,
} from '@/shared/lib/agent-work-session';
import type { VaultShapeNode } from '@/shared/lib/vault-shape-events';
import type { AgentWorkProjection } from './agent-work-projection';

export const BELL_TABS = ['todo', 'results', 'history'] as const;
export type BellTab = (typeof BELL_TABS)[number];

/** One thing waiting on a person. */
export type BellTodo =
  | {
      kind: 'permission-ask';
      id: string;
      at: number;
      agent: string | null;
      /** The person's own request for this turn, never the agent's thinking. */
      summary: string | null;
      tool: string | null;
    }
  | {
      kind: 'folder-problem';
      id: string;
      at: number;
      problems: { unresolvedEdges: number; dependencyCycles: number };
    };

/** One finished piece of work. */
export type BellResult =
  | {
      kind: 'task';
      id: string;
      at: number;
      agent: string | null;
      unread: boolean;
      /** Consecutive identical rows folded into one — `1` means it stands alone. */
      repeat: number;
      counts: AgentWriteCounts;
      durationMs: number;
      node: VaultShapeNode | null;
      /** Human decisions made inside this task's window. */
      allowed: number;
      rejected: number;
    }
  | {
      kind: 'decision';
      id: string;
      at: number;
      agent: string | null;
      unread: boolean;
      repeat: number;
      /** The bounded request summary from the receipt — the person's words. */
      request: string;
      tool: string;
      decision: AcpWorkDecision;
      result: AcpWorkResult;
      items: number;
    };

/** One row of the timeline: a whole task, or a single shape/problem event. */
export interface BellHistoryRow {
  id: string;
  at: number;
  kind: AgentNotificationKind;
  agent: string | null;
  node: VaultShapeNode | null;
  label: string | null;
  counts: AgentWriteCounts | null;
  problems: { unresolvedEdges: number; dependencyCycles: number } | null;
  childCount: number | null;
  /** Set only for a folded task that both started and ended. */
  durationMs: number | null;
  /** True when the task is still running — it has a start and no end. */
  running: boolean;
}

export interface BellHistoryGroup {
  /** Stable day key (`YYYY-MM-DD` in the reader's own timezone). */
  key: string;
  /** `today` and `yesterday` are named; anything older prints its date. */
  label: 'today' | 'yesterday' | 'date';
  at: number;
  rows: BellHistoryRow[];
}

export interface BellInbox {
  todos: BellTodo[];
  results: BellResult[];
  history: BellHistoryGroup[];
  /** Results the person has not opened yet — the quiet grade of the bell badge. */
  unreadResults: number;
}

export interface BellInboxInput {
  sessions: readonly AgentWorkSession[];
  /** Already filtered by the muted kinds and already name-resolved by the feed. */
  notifications: readonly AgentNotification[];
  receipts: readonly AcpWorkReceipt[];
  work: AgentWorkProjection;
  readAt: number;
  nowMs: number;
}

/** `task:1234:end` → `task:1234`. The notification id carries its session. */
function taskIdOf(notificationId: string): string {
  return notificationId.replace(/:(start|end)$/, '');
}

function dayKey(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayLabel(at: number, nowMs: number): BellHistoryGroup['label'] {
  const key = dayKey(at);
  if (key === dayKey(nowMs)) return 'today';
  if (key === dayKey(nowMs - 86_400_000)) return 'yesterday';
  return 'date';
}

/**
 * Whose agent it was, coarse enough to survive two names for one program.
 *
 * The same agent reaches the two records under two ids — a decision receipt carries the
 * ACP runtime (`claude-acp`, `codex-acp`) while a write row carries the MCP client that
 * wrote it (`claude-code`, `codex-mcp-client`) — so comparing the ids, or even their
 * product names, would reject the true attribution. The leading token is what both spell
 * the same way.
 */
function agentFamily(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.split(/[-_ ]/)[0] || null;
}

/**
 * Which task a human decision belongs to.
 *
 * A decision is made **before** the write it permits, so a receipt's time sits just
 * outside the session's first and last write. The product already owns one definition of
 * "still the same piece of work" — `AGENT_TASK_IDLE_MS`, five minutes of quiet — so the
 * same number is used here rather than a second, invented tolerance. A receipt counts for
 * at most one task; one that matches nothing stands on its own row, which is the only way
 * a **rejected** write is ever seen (it produces no log line at all).
 *
 * ⚠️ **Time alone is not enough** (po-evidence, 2026-09-12): two agents can work minutes
 * apart in one folder, and a decision credited to the wrong turn makes a task row say
 * 허용 1 for permission the person never gave it. When both records name an agent, they
 * have to be the same one; when either is silent, time decides alone rather than the row
 * being dropped.
 */
function sessionForReceipt(
  receipt: AcpWorkReceipt,
  at: number,
  sessions: readonly AgentWorkSession[],
): AgentWorkSession | null {
  const decidedBy = agentFamily(receipt.agent);
  let best: AgentWorkSession | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const session of sessions) {
    const wroteBy = agentFamily(session.agent);
    if (decidedBy && wroteBy && decidedBy !== wroteBy) continue;
    const distance =
      at < session.startAt
        ? session.startAt - at
        : at > session.endAt
          ? at - session.endAt
          : 0;
    if (distance > AGENT_TASK_IDLE_MS) continue;
    if (distance <= bestDistance) {
      best = session;
      bestDistance = distance;
    }
  }
  return best;
}

function emptyCounts(): AgentWriteCounts {
  return { added: 0, edited: 0, removed: 0 };
}

/** Which write kind leads a task row's sentence — the same rule the panel's copy uses. */
function leadingWrite(counts: AgentWriteCounts): string {
  const ordered = [
    ['added', counts.added],
    ['edited', counts.edited],
    ['removed', counts.removed],
  ] as const;
  const top = [...ordered].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? `${top[0]}:${top[1]}` : 'none';
}

/**
 * What a result row **says**, which is what may be folded.
 *
 * ⚠️ Keyed on the subject alone, the fold could invert a person's own decision
 * (po-steward, 2026-09-12): reject-then-retry-then-allow on the same request by the same
 * agent — the ordinary shape of a correction — folded into one row, the newer row won, and
 * the panel printed `허용했어요 ×2` over a rejection that had happened. Receipts never
 * reach the timeline, so that row is the only rendering the decision gets. Two rows fold
 * only when they would print the same sentence.
 */
function resultSubject(row: BellResult): string {
  return row.kind === 'task'
    ? `task|${leadingWrite(row.counts)}|${row.node?.slug ?? ''}|${row.agent ?? ''}`
    : `decision|${row.decision}|${row.request}|${row.agent ?? ''}`;
}

/**
 * Consecutive rows naming the same thing become one row with `repeat`.
 *
 * Two identical titles in a row is the defect this fixes; folding non-adjacent duplicates
 * instead would hide the order in which work actually happened.
 */
function foldRepeats(rows: readonly BellResult[]): BellResult[] {
  const out: BellResult[] = [];
  for (const row of rows) {
    const previous = out[out.length - 1];
    if (previous && resultSubject(previous) === resultSubject(row)) {
      out[out.length - 1] = {
        ...previous,
        repeat: previous.repeat + 1,
        // The fold keeps the newest row's time and stays unread if any folded row is.
        unread: previous.unread || row.unread,
      };
      continue;
    }
    out.push({ ...row });
  }
  return out;
}

export function deriveBellInbox({
  sessions,
  notifications,
  receipts,
  work,
  readAt,
  nowMs,
}: BellInboxInput): BellInbox {
  const todos: BellTodo[] = [];
  /*
   * A blocked turn is the one thing that is unambiguously waiting on a person. The ask's
   * own allow/reject doors live on the conversation's permission card, beside the change
   * it would make — this row states the fact and points at that card.
   */
  if (work.mode === 'live' && work.phase === 'blocked' && work.updatedAt !== null) {
    todos.push({
      kind: 'permission-ask',
      id: `ask:${work.updatedAt}`,
      at: work.updatedAt,
      agent: work.agentName,
      summary: work.summary,
      tool: work.lastTool,
    });
  }
  for (const item of notifications) {
    if (item.kind !== 'vault-problem' || !item.problems) continue;
    // Older than the log's own newsworthiness window it is history, not a thing to do.
    if (nowMs - item.at > AGENT_TASK_VISIBLE_WINDOW_MS) continue;
    todos.push({
      kind: 'folder-problem',
      id: item.id,
      at: item.at,
      problems: item.problems,
    });
  }
  todos.sort((a, b) => b.at - a.at);

  const ended = new Map<string, AgentNotification>();
  const started = new Map<string, AgentNotification>();
  for (const item of notifications) {
    if (item.kind === 'task-end') ended.set(taskIdOf(item.id), item);
    if (item.kind === 'task-start') started.set(taskIdOf(item.id), item);
  }

  const receiptsByTask = new Map<string, AcpWorkReceipt[]>();
  const orphanReceipts: AcpWorkReceipt[] = [];
  for (const receipt of receipts) {
    const at = Date.parse(receipt.updatedAt);
    if (!Number.isFinite(at)) continue;
    const session = sessionForReceipt(receipt, at, sessions);
    if (!session) {
      orphanReceipts.push(receipt);
      continue;
    }
    const list = receiptsByTask.get(session.id);
    if (list) list.push(receipt);
    else receiptsByTask.set(session.id, [receipt]);
  }

  const taskResults: BellResult[] = [];
  for (const session of sessions) {
    const end = ended.get(session.id);
    // No end notification means the work is unfinished or wrote nothing — not a result.
    if (!end) continue;
    const decided = receiptsByTask.get(session.id) ?? [];
    taskResults.push({
      kind: 'task',
      id: session.id,
      at: end.at,
      agent: end.agent ?? session.agent ?? null,
      unread: end.at > readAt,
      repeat: 1,
      counts: end.counts ?? session.counts ?? emptyCounts(),
      durationMs: Math.max(0, session.endAt - session.startAt),
      node: end.node,
      allowed: decided.filter((receipt) => receipt.decision === 'allowed').length,
      rejected: decided.filter((receipt) => receipt.decision === 'rejected').length,
    });
  }

  const decisionResults: BellResult[] = orphanReceipts.map((receipt) => {
    const at = Date.parse(receipt.updatedAt);
    return {
      kind: 'decision',
      id: receipt.id,
      at,
      agent: receipt.agent,
      unread: at > readAt,
      repeat: 1,
      request: receipt.request,
      tool: receipt.tool,
      decision: receipt.decision,
      result: receipt.result,
      items: receipt.items.length,
    };
  });

  const results = foldRepeats(
    [...taskResults, ...decisionResults].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)),
  );

  const historyRows: BellHistoryRow[] = [];
  const foldedTasks = new Set<string>();
  for (const item of notifications) {
    if (item.kind === 'task-start' || item.kind === 'task-end') {
      const taskId = taskIdOf(item.id);
      if (foldedTasks.has(taskId)) continue;
      foldedTasks.add(taskId);
      const start = started.get(taskId);
      const end = ended.get(taskId);
      const anchor = end ?? start;
      if (!anchor) continue;
      historyRows.push({
        id: taskId,
        at: anchor.at,
        // One task reads as one row: it finished, or it is still running.
        kind: end ? 'task-end' : 'task-start',
        agent: anchor.agent ?? null,
        node: anchor.node,
        label: anchor.label ?? null,
        counts: end?.counts ?? null,
        problems: null,
        childCount: null,
        durationMs: start && end ? Math.max(0, end.at - start.at) : null,
        running: !end,
      });
      continue;
    }
    historyRows.push({
      id: item.id,
      at: item.at,
      kind: item.kind,
      agent: item.agent ?? null,
      node: item.node,
      label: item.label ?? null,
      counts: item.counts ?? null,
      problems: item.problems ?? null,
      childCount: item.childCount ?? null,
      durationMs: null,
      running: false,
    });
  }
  historyRows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));

  const history: BellHistoryGroup[] = [];
  for (const row of historyRows) {
    const key = dayKey(row.at);
    const group = history[history.length - 1];
    if (group && group.key === key) {
      group.rows.push(row);
      continue;
    }
    history.push({ key, label: dayLabel(row.at, nowMs), at: row.at, rows: [row] });
  }

  return {
    todos,
    results,
    history,
    unreadResults: results.filter((row) => row.unread).length,
  };
}
