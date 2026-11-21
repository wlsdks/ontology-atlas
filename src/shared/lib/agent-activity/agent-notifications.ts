/**
 * Notification inbox model; it reports whole tasks only. A single node or relation and tool calls do
 * not become notifications.
 */
import type { AgentWriteCounts, AgentWorkSession } from "./agent-work-session";
import { hasWrites } from "./agent-work-session";
import type { VaultShapeNode } from "./vault-shape-events";

export type AgentNotificationKind =
  | "task-start"
  | "task-end"
  | "domain-added"
  | "domain-removed"
  | "bridge-inserted"
  | "vault-problem";

/** The list and order shown in settings — single source for both the UI and the stored value. */
export const AGENT_NOTIFICATION_KINDS: readonly AgentNotificationKind[] = [
  "task-start",
  "task-end",
  "domain-added",
  "domain-removed",
  "bridge-inserted",
  "vault-problem",
];

export interface AgentNotification {
  /** Built from the content: it is re-derived every poll, and the read marker and keys must hold. */
  id: string;
  kind: AgentNotificationKind;
  at: number;
  /** The node to fly to on the map, or null — **then it reports state without a target.** */
  node: VaultShapeNode | null;
  /**
   * For the case where the name is known but no link can be made (a domain that
   * disappeared) — keeps the "what" without offering a link to a node that is gone.
   */
  label?: string;
  /** `task-start`/`task-end` only; absent when unknown, never invented. */
  agent?: string;
  /** `task-end` only — the summary. */
  counts?: AgentWriteCounts;
  /** `bridge-inserted` only — how many children it took over. */
  childCount?: number;
  /** `vault-problem` only — how many dangling references / cycles were added. */
  problems?: VaultProblemCounts;
}

export interface VaultProblemCounts {
  unresolvedEdges: number;
  dependencyCycles: number;
  dependencyCyclesPartial?: boolean;
}

/** What rose between two readings. A partial cycle count is a floor: a rise to one is a floor, and none is read from one. */
export function risenVaultProblems(
  before: VaultProblemCounts,
  after: VaultProblemCounts,
): VaultProblemCounts | null {
  const unresolvedEdges = Math.max(0, after.unresolvedEdges - before.unresolvedEdges);
  const dependencyCycles = before.dependencyCyclesPartial
    ? 0
    : Math.max(0, after.dependencyCycles - before.dependencyCycles);
  if (unresolvedEdges === 0 && dependencyCycles === 0) return null;
  return after.dependencyCyclesPartial && dependencyCycles > 0
    ? { unresolvedEdges, dependencyCycles, dependencyCyclesPartial: true }
    : { unresolvedEdges, dependencyCycles };
}

/**
 * The only kind that survives a reload, since the log is the source of truth; skeleton and problem
 * notifications are observed while polling and never logged.
 */
export function deriveTaskNotifications(
  sessions: readonly AgentWorkSession[],
): AgentNotification[] {
  const out: AgentNotification[] = [];
  for (const session of sessions) {
    out.push({
      id: `${session.id}:start`,
      kind: "task-start",
      at: session.startAt,
      node: null,
      ...(session.agent ? { agent: session.agent } : {}),
    });
    // An unfinished task has no end notification, and an all-zero summary is not
    // emitted either: "0 added · 0 edited · 0 deleted" is noise, not information.
    if (session.done && hasWrites(session.counts)) {
      out.push({
        id: `${session.id}:end`,
        kind: "task-end",
        at: session.endAt,
        node: session.lastTarget ? { slug: session.lastTarget, name: session.lastTarget } : null,
        counts: session.counts,
        ...(session.agent ? { agent: session.agent } : {}),
      });
    }
  }
  return out;
}

/** The inbox is not an audit log: past a scannable length, history lives in `/git` and `activity.jsonl`. */
export const AGENT_NOTIFICATION_LIMIT = 60;

export function mergeNotifications(
  ...groups: readonly (readonly AgentNotification[])[]
): AgentNotification[] {
  const seen = new Map<string, AgentNotification>();
  for (const group of groups) {
    for (const item of group) if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()]
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, AGENT_NOTIFICATION_LIMIT);
}

export function filterNotifications(
  notifications: readonly AgentNotification[],
  enabledKinds: ReadonlySet<AgentNotificationKind>,
): AgentNotification[] {
  return notifications.filter((item) => enabledKinds.has(item.kind));
}

/** `readAt` is one "seen up to here" timestamp: per-item flags would keep state outside the vault. */
export function countUnread(
  notifications: readonly AgentNotification[],
  readAt: number,
): number {
  return notifications.filter((item) => item.at > readAt).length;
}
