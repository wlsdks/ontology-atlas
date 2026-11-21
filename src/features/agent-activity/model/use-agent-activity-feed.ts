'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';

import { useLocalVault, useVaultIdentityScope } from '@/entities/vault-session';
import {
  forgetLegacyUnscopedReadAt,
  readReadAt,
  writeReadAt,
} from './read-at-storage';
import { computeVaultHealth } from '@/entities/knowledge-graph';
import {
  AGENT_TASK_VISIBLE_WINDOW_MS,
  activeSession,
  deriveAgentWorkSessions,
  type AgentWorkSession,
} from '@/shared/lib/agent-activity/agent-work-session';
import {
  AGENT_NOTIFICATION_KINDS,
  countUnread,
  deriveTaskNotifications,
  filterNotifications,
  mergeNotifications,
  risenVaultProblems,
  type AgentNotification,
  type AgentNotificationKind,
  type VaultProblemCounts,
} from '@/shared/lib/agent-activity/agent-notifications';
import {
  diffVaultShape,
  snapshotVaultShape,
  type VaultShapeNode,
  type VaultShapeSnapshot,
} from '@/shared/lib/agent-activity/vault-shape-events';
import {
  useAgentActivityStatusEnabled,
  useAgentNotificationsEnabled,
  useMutedAgentNotificationKinds,
} from '@/shared/lib/preferences/agent-activity-preferences';
import {
  deriveAgentWorkProjection,
  type AgentLiveWorkInput,
  type AgentWorkProjection,
} from './agent-work-projection';
import type { AcpWorkReceipt } from '@/shared/lib/meaning-transition/acp-work-receipt';

/**
 * One derivation for "what is happening in my folder": the status chip and the bell read the same one, or one says "working" while the other is silent.
 * Sources: `activity.jsonl` (start and end of work, survives a refresh), the manifest snapshot (domains and bridges, so a `(batch)` write is not missed) and `computeVaultHealth` (dangling references and cycles).
 * Health compiles every document, so it runs only at work boundaries (once every few minutes), never per poll; the first piece of work only establishes the baseline and raises no problem notification.
 */

const TICK_MS = 30_000;

/**
 * A single "seen up to here": a read flag per notification would accumulate state outside the vault. The external-store grammar is used
 * because reading localStorage during render gives prerender and client different values. The per-vault key lives in `read-at-storage.ts`.
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

const readAtServerSnapshot = () => 0;

export interface AgentActivityFeed {
  showStatus: boolean;
  /** The reference time the screen computes "N minutes ago" from, so render never calls `Date.now()`. */
  nowMs: number;
  writing: boolean;
  work: AgentWorkProjection;
  lastAt: number | null;
  /** The product name of the agent that identified itself in the last work; the raw id stays in `work.rawAgentName`. Null when unknown. */
  agentName: string | null;
  /** The last target — filled **only when the slug really exists in the manifest.** */
  lastNode: VaultShapeNode | null;
  lastTargetUnnamed: boolean;
  notifications: AgentNotification[];
  sessions: AgentWorkSession[];
  workReceipts: AcpWorkReceipt[];
  unreadCount: number;
  readAt: number;
  notificationsEnabled: boolean;
  markAllRead: () => void;
  /** Moves the boundary to one row's own time: opening a row in a newest-first list means everything under it was seen. Never moves backwards. */
  markReadUpTo: (at: number) => void;
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
  // Clears the pre-scoping global key once; nobody reads it, but leaving it invites "what is this".
  useEffect(forgetLegacyUnscopedReadAt, []);
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
  const snapshot = useMemo(
    () => (docs ? snapshotVaultShape(docs, locale) : null),
    [docs, locale],
  );

  const idleSnapshotRef = useRef<VaultShapeSnapshot | null>(null);
  const taskStartSnapshotRef = useRef<VaultShapeSnapshot | null>(null);
  const healthBaselineRef = useRef<VaultProblemCounts | null>(null);
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
    healthBaselineRef.current = health;

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
    const problems = baseline ? risenVaultProblems(baseline, health) : null;
    if (problems) {
      produced.push({ id: `${settledId}:problem`, kind: 'vault-problem', at: settledEndAt, node: null, problems });
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
  const lastNode = lastSlug ? (snapshot?.nodes.get(lastSlug) ?? null) : null;

  const notifications = useMemo(() => {
    const enabled = new Set(
      AGENT_NOTIFICATION_KINDS.filter((kind) => !mutedKinds.has(kind)),
    ) as ReadonlySet<AgentNotificationKind>;
    const merged = mergeNotifications(deriveTaskNotifications(sessions), liveEvents);
    return filterNotifications(merged, enabled).map((item) => {
      if (!item.node) return item;
      const resolved = snapshot?.nodes.get(item.node.slug) ?? null;
      return resolved ? { ...item, node: resolved } : { ...item, node: null, label: item.label };
    });
  }, [sessions, liveEvents, mutedKinds, snapshot]);

  const markReadUpTo = useCallback((at: number) => {
    if (!Number.isFinite(at)) return;
    const current = readReadAt(vaultScope);
    if (at <= current) return;
    writeReadAt(vaultScope, at);
    window.dispatchEvent(new CustomEvent(READ_AT_EVENT));
  }, [vaultScope]);

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
    sessions,
    workReceipts: acpWorkReceipts ?? [],
    unreadCount: notificationsEnabled ? countUnread(notifications, readAt) : 0,
    readAt,
    notificationsEnabled,
    markAllRead,
    markReadUpTo,
  };
}
