/**
 * Data model for the notification inbox — it reports **whole tasks only**.
 *
 * What becomes a notification (owner agreement, 2026-08-01):
 *
 * | Event                      | Why                                                   |
 * |----------------------------|-------------------------------------------------------|
 * | Task started               | Something is happening in my folder right now          |
 * | Task finished              | With a summary — "34 added · 2 edited · 4 deleted"     |
 * | A domain appears/disappears| The map's large-scale skeleton changed                 |
 * | A bridge is inserted       | One more layer — rare and hard to undo                 |
 * | A problem appears          | The vault got sicker: dangling references, cycles      |
 *
 * What does **not** become one:
 *
 * - **A single node or a single relation** — the map already shows it clearly.
 *   Notifications are for when nobody is looking at the screen; when someone is,
 *   the map is the better channel.
 * - **Tool calls** — explicitly rejected by the 2026-08-01 verdict: *"Drawing a tool-call log turns
 *   Atlas into an MCP call viewer competing with the agent's terminal; this
 *   product's moat is the meaning layer above the tool layer."* (drawing a tool-call log turns
 *   Atlas into an MCP call viewer competing with the agent's terminal; this
 *   product's moat is the meaning layer above the tool layer)
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
  /**
   * Re-derived on every poll, so it is built **deterministically from the
   * content** — otherwise the read marker and React keys would jitter.
   */
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
  /**
   * `task-start`/`task-end` — the agent that identified itself for this task
   * (heartbeat or MCP connection greeting; the session already carries it). When
   * unknown the field is absent rather than invented.
   */
  agent?: string;
  /** `task-end` only — the summary. */
  counts?: AgentWriteCounts;
  /** `bridge-inserted` only — how many children it took over. */
  childCount?: number;
  /** `vault-problem` only — how many dangling references / cycles were added. */
  problems?: { unresolvedEdges: number; dependencyCycles: number };
}

/**
 * Sessions → start/end notifications. The log is the source of truth, so this is
 * the only kind that **survives a reload** — skeleton and problem notifications
 * are observed during polling only and are never written to the log.
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

/**
 * Merge lists — newest first, deduplicated by id, capped.
 *
 * Why a cap: the inbox is not a replacement for an audit log. It is only readable
 * at a length a person can scan; everything beyond that lives in `/git` and in
 * the vault's `activity.jsonl`.
 */
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

/** Drop the kinds turned off in settings. */
export function filterNotifications(
  notifications: readonly AgentNotification[],
  enabledKinds: ReadonlySet<AgentNotificationKind>,
): AgentNotification[] {
  return notifications.filter((item) => enabledKinds.has(item.kind));
}

/**
 * Unread count. `readAt` is a single "seen up to here" timestamp — a per-item read
 * flag would accumulate state outside the vault, and the vault is the source of
 * truth here.
 */
export function countUnread(
  notifications: readonly AgentNotification[],
  readAt: number,
): number {
  return notifications.filter((item) => item.at > readAt).length;
}
