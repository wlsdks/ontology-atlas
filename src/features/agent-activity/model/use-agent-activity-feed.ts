'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';

import { useLocalVault } from '@/features/docs-vault-local';
import { useVaultIdentityScope } from '@/features/vault-scope';
import {
  forgetLegacyUnscopedReadAt,
  readReadAt,
  writeReadAt,
} from './read-at-storage';
import { computeVaultHealth } from '@/entities/knowledge-graph/lib/vault-health';
import {
  AGENT_TASK_VISIBLE_WINDOW_MS,
  activeSession,
  deriveAgentWorkSessions,
} from '@/shared/lib/agent-work-session';
import {
  AGENT_NOTIFICATION_KINDS,
  countUnread,
  deriveTaskNotifications,
  filterNotifications,
  mergeNotifications,
  type AgentNotification,
  type AgentNotificationKind,
} from '@/shared/lib/agent-notifications';
import {
  diffVaultShape,
  snapshotVaultShape,
  type VaultShapeNode,
  type VaultShapeSnapshot,
} from '@/shared/lib/vault-shape-events';
import {
  useAgentActivityStatusEnabled,
  useAgentNotificationsEnabled,
  useMutedAgentNotificationKinds,
} from '@/shared/lib/appearance-preferences';
import {
  deriveAgentWorkProjection,
  type AgentLiveWorkInput,
  type AgentWorkProjection,
} from './agent-work-projection';
import type { AcpWorkReceipt } from '@/shared/lib/acp-work-receipt';

/**
 * One place for "what is happening in my folder right now" — the status chip and the notification box
 * read the **same derivation**. Two surfaces deriving separately guarantees a moment where one says
 * "working" and the other is silent.
 *
 * Three sources of truth:
 *  - `activity.jsonl` (inside the vault) → the start and end of work. **Survives a refresh.**
 *  - the manifest snapshot → domains and bridges, so a batch write (`(batch)`) is not missed either.
 *  - `computeVaultHealth` → dangling references and cycles.
 *
 * **The expensive one runs only at work boundaries.** `computeVaultHealth` compiles every document.
 * Running it per poll on the map (the main screen) would be the same class of defect as "building the
 * model of a surface that is not on screen" (`.claude/rules/architecture.md`). It is also wrong by
 * meaning: a vault **mid**-work is unfinished and is no place to say "it got sicker". So it measures
 * only when work ends — measured, work happens once every few minutes.
 *
 * The first piece of work has no baseline to compare against and therefore **raises no problem
 * notification** (it establishes the baseline instead). Compiling every document the moment a vault
 * opens, to build that baseline, is more expensive — and that cost is billed to people for whom
 * nothing happened at all.
 */

/** The clock tick — "N minutes ago" and window expiry are re-decided on this period. */
const TICK_MS = 30_000;

/**
 * A single "seen up to here". A read flag per notification would accumulate state outside the vault,
 * and in this app the vault is the source of truth. The external-store subscription grammar (same
 * family as `appearance-preferences`) is used because reading localStorage during render gives the
 * prerender and the client different values and breaks hydration.
 *
 * **Computing the slot (the per-vault key) is a separate module** — inside the hook, reverting it
 * turns no test red (see the preamble of `./read-at-storage.ts`). Here it is only wired to the
 * subscription grammar.
 */
const READ_AT_EVENT = 'ontology-atlas:agent-activity-read';

function subscribeReadAt(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(READ_AT_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(READ_AT_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** Zero in the prerender — "nothing has been read yet" is all the server can know. */
const readAtServerSnapshot = () => 0;

export interface AgentActivityFeed {
  /** Eligibility to draw the status chip: the setting is on and there is activity within 24 hours. */
  showStatus: boolean;
  /** The reference time the screen computes "N minutes ago" from, so render never calls `Date.now()`. */
  nowMs: number;
  /** Does a fresh heartbeat declare work actually in progress? */
  writing: boolean;
  /** The current work readout, combining heartbeat and the write log with no false progress. */
  work: AgentWorkProjection;
  lastAt: number | null;
  /**
   * The human-facing product name of the agent that identified itself in the last piece of work. The
   * raw client/runtime id stays in `work.rawAgentName`, and it is null when unknown.
   */
  agentName: string | null;
  /** The last target — filled **only when the slug really exists in the manifest.** */
  lastNode: VaultShapeNode | null;
  /** The target is a batch or a document absorb and so has no name, or it vanished from the vault. */
  lastTargetUnnamed: boolean;
  notifications: AgentNotification[];
  /** Human allow/reject decisions made in the in-app ACP workbench. */
  workReceipts: AcpWorkReceipt[];
  unreadCount: number;
  notificationsEnabled: boolean;
  markAllRead: () => void;
}

export function useAgentActivityFeed(liveWork: AgentLiveWorkInput | null = null): AgentActivityFeed {
  const { agentActivityLog, agentActivityStatus, acpWorkReceipts, manifest, status } = useLocalVault();
  const locale = useLocale();
  const statusEnabled = useAgentActivityStatusEnabled();
  const notificationsEnabled = useAgentNotificationsEnabled();
  const mutedKinds = useMutedAgentNotificationKinds();

  const vaultScope = useVaultIdentityScope();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const readReadAtForVault = useCallback(() => readReadAt(vaultScope), [vaultScope]);
  const readAt = useSyncExternalStore(
    subscribeReadAt,
    readReadAtForVault,
    readAtServerSnapshot,
  );
  // Clears the global key from before vaults were scoped, once. Nobody reads it so it is harmless, but
  // leaving it makes the next person investigate "what is this" all over again.
  useEffect(forgetLegacyUnscopedReadAt, []);
  /** Events observed only while polling — not in the log, so this is session memory. */
  const [liveEvents, setLiveEvents] = useState<readonly AgentNotification[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const sessions = useMemo(
    () => deriveAgentWorkSessions(agentActivityLog ?? [], nowMs),
    [agentActivityLog, nowMs],
  );
  const work = useMemo(
    () => deriveAgentWorkProjection(agentActivityStatus, sessions, nowMs, liveWork),
    [agentActivityStatus, liveWork, sessions, nowMs],
  );
  const last = sessions[sessions.length - 1] ?? null;
  const busy = Boolean(activeSession(sessions));
  /** The id of the work that just **finished** — the moment this value changes is where shape and health are measured. */
  const settledId = last && last.done ? last.id : null;
  const settledEndAt = last && last.done ? last.endAt : null;

  const docs = status === 'loaded' ? manifest?.docs : undefined;
  /** One pass over the manifest, so the name gate (link check) and the shape comparison share one snapshot. */
  const snapshot = useMemo(
    () => (docs ? snapshotVaultShape(docs, locale) : null),
    [docs, locale],
  );

  const idleSnapshotRef = useRef<VaultShapeSnapshot | null>(null);
  const taskStartSnapshotRef = useRef<VaultShapeSnapshot | null>(null);
  const healthBaselineRef = useRef<{ unresolvedEdges: number; dependencyCycles: number } | null>(null);
  const reportedSessionRef = useRef<string | null>(null);

  // While work is running it **freezes the snapshot from just before** — the current manifest already
  // holds part of that work's result and cannot serve as the comparison basis.
  useEffect(() => {
    if (!snapshot) return;
    if (busy) {
      taskStartSnapshotRef.current ??= idleSnapshotRef.current;
      return;
    }
    idleSnapshotRef.current = snapshot;
  }, [snapshot, busy]);

  useEffect(() => {
    const before = taskStartSnapshotRef.current;
    if (!settledId || settledEndAt === null || !snapshot || !docs) return;
    if (reportedSessionRef.current === settledId) return;
    reportedSessionRef.current = settledId;
    taskStartSnapshotRef.current = null;

    const health = computeVaultHealth(docs).summary;
    const baseline = healthBaselineRef.current;
    healthBaselineRef.current = {
      unresolvedEdges: health.unresolvedEdges,
      dependencyCycles: health.dependencyCycles,
    };

    const produced: AgentNotification[] = [];
    if (before) {
      const shape = diffVaultShape(before, snapshot);
      for (const node of shape.domainsAdded) {
        produced.push({ id: `${settledId}:domain-added:${node.slug}`, kind: 'domain-added', at: settledEndAt, node });
      }
      for (const node of shape.domainsRemoved) {
        // You cannot fly to a node that is gone — state the name only, with no link.
        produced.push({
          id: `${settledId}:domain-removed:${node.slug}`,
          kind: 'domain-removed',
          at: settledEndAt,
          node: null,
          label: node.name,
        });
      }
      for (const node of shape.bridges) {
        produced.push({
          id: `${settledId}:bridge:${node.slug}`,
          kind: 'bridge-inserted',
          at: settledEndAt,
          node,
          childCount: node.childCount,
        });
      }
    }
    // "It got sicker" is stated **only when the count rose.** Scolding an already-unhealthy vault at
    // the end of every piece of work is nagging, not notification.
    if (baseline) {
      const unresolvedEdges = health.unresolvedEdges - baseline.unresolvedEdges;
      const dependencyCycles = health.dependencyCycles - baseline.dependencyCycles;
      if (unresolvedEdges > 0 || dependencyCycles > 0) {
        produced.push({
          id: `${settledId}:problem`,
          kind: 'vault-problem',
          at: settledEndAt,
          node: null,
          problems: {
            unresolvedEdges: Math.max(0, unresolvedEdges),
            dependencyCycles: Math.max(0, dependencyCycles),
          },
        });
      }
    }
    if (produced.length > 0) {
      // This effect is precisely "external system (the vault on disk) → React state" synchronization.
      // The observation point is a poll, so the render path cannot know it, and it is not a derived
      // value either (it needs the previous snapshot as state). The cascading render happens once, when
      // work ends — measured, once every few minutes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveEvents((current) => mergeNotifications(produced, current));
    }
  }, [settledId, settledEndAt, snapshot, docs]);

  const lastAt = work.updatedAt;
  const fresh = lastAt !== null && nowMs - lastAt <= AGENT_TASK_VISIBLE_WINDOW_MS;
  const lastSlug = work.targetSlug;
  // The last gate against dead links — not in the manifest means not a link.
  const lastNode = lastSlug ? (snapshot?.nodes.get(lastSlug) ?? null) : null;

  const notifications = useMemo(() => {
    const enabled = new Set(
      AGENT_NOTIFICATION_KINDS.filter((kind) => !mutedKinds.has(kind)),
    ) as ReadonlySet<AgentNotificationKind>;
    const merged = mergeNotifications(deriveTaskNotifications(sessions), liveEvents);
    return filterNotifications(merged, enabled).map((item) => {
      if (!item.node) return item;
      const resolved = snapshot?.nodes.get(item.node.slug) ?? null;
      // The notification box's target passes the **same gate** as the status chip.
      return resolved ? { ...item, node: resolved } : { ...item, node: null, label: item.label };
    });
  }, [sessions, liveEvents, mutedKinds, snapshot]);

  const markAllRead = useCallback(() => {
    try {
      writeReadAt(vaultScope, Date.now());
    } catch {
      // Even if storing is blocked, the event marks it read for the current session.
    }
    window.dispatchEvent(new CustomEvent(READ_AT_EVENT));
  }, [vaultScope]);

  return {
    showStatus: statusEnabled && work.mode !== 'idle' && fresh,
    nowMs,
    writing: work.mode === 'live',
    work,
    lastAt,
    agentName: work.agentName,
    lastNode,
    lastTargetUnnamed: lastAt !== null && lastNode === null,
    notifications: notificationsEnabled ? notifications : [],
    workReceipts: acpWorkReceipts ?? [],
    unreadCount: notificationsEnabled ? countUnread(notifications, readAt) : 0,
    notificationsEnabled,
    markAllRead,
  };
}
