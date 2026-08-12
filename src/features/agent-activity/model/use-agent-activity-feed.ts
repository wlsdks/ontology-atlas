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

/**
 * 「지금 내 폴더에서 뭐가 벌어지고 있나」 한 곳 — 상태 칩과 알림함이 **같은
 * 파생**을 본다. 두 표면이 각자 파생하면 하나는 「작업 중」인데 다른 하나는
 * 조용한 순간이 반드시 생긴다.
 *
 * 세 진실원:
 *  - `activity.jsonl`(볼트 안) → 작업의 시작·끝. **새로고침해도 살아남는다.**
 *  - 매니페스트 스냅숏 → 도메인·브릿지. 배치 쓰기(`(batch)`)도 놓치지 않는다.
 *  - `computeVaultHealth` → 허공 참조·순환.
 *
 * ## 비싼 것은 작업 경계에서만 돈다
 *
 * `computeVaultHealth` 는 전 문서 컴파일이다. 지도(주 화면)에서 폴링마다
 * 돌리면 「화면에 없는 표면의 모델을 미리 만든다」(architecture.md D4)와 같은
 * 부류의 결함이 된다. 의미상으로도 작업 **중간**의 볼트는 아직 안 끝난
 * 상태라 「아파졌다」고 말할 자리가 아니다. 그래서 작업이 끝날 때만 잰다 —
 * 실측상 작업은 몇 분에 한 번이다.
 *
 * 첫 작업은 비교 기준이 없어 **문제 알림을 내지 않는다**(그때 기준을 세운다).
 * 볼트를 여는 순간 전 문서를 컴파일해 기준을 만드는 쪽이 더 비싸고, 그 비용은
 * 아무 일도 안 일어난 사람에게도 청구된다.
 */

/** 시계 눈금 — 「N분 전」과 창 만료를 이 주기로 다시 판정한다. */
const TICK_MS = 30_000;

/**
 * 「여기까지 봤다」 하나. 알림마다 읽음 플래그를 두면 볼트 밖에 상태가 쌓이는데,
 * 이 앱에서 진실원은 볼트다. 외부 저장소 구독 문법(`appearance-preferences` 와
 * 같은 계열)을 쓰는 이유: 렌더 중에 localStorage 를 읽으면 프리렌더와 클라이언트가
 * 다른 값을 내 hydration 이 어긋난다.
 *
 * **자리 산출(볼트별 키)은 별도 모듈이다** — 훅 안에 두면 되돌려도 아무 시험이
 * 빨개지지 않는다(`./read-at-storage.ts` 머리말). 여기서는 그 순수 함수를
 * 구독 문법에 잇기만 한다.
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

/** 프리렌더에서는 0 — 「아직 아무것도 안 읽었다」가 서버가 알 수 있는 전부다. */
const readAtServerSnapshot = () => 0;

export interface AgentActivityFeed {
  /** 상태 칩을 그릴 자격 — 설정이 켜져 있고 24시간 안의 활동이 있다. */
  showStatus: boolean;
  /** 화면이 「N분 전」을 계산할 기준 시각. 렌더 중 `Date.now()` 를 부르지 않기 위해. */
  nowMs: number;
  /** 마지막 쓰기가 「쓰는 중」 창(2분) 안인가. */
  writing: boolean;
  lastAt: number | null;
  /**
   * 마지막 작업에서 이름을 밝힌 에이전트 (하트비트 > MCP 연결 인사 이름 순 —
   * 로그가 이미 그 우선순위로 기록한다). 모르면 null 이고, 화면은 이름 없이
   * 상태만 말한다 — 지어내지 않는다.
   */
  agentName: string | null;
  /** 마지막 대상 — **매니페스트에 실재하는 슬러그일 때만** 채워진다. */
  lastNode: VaultShapeNode | null;
  /** 대상이 배치·문서 흡수라 이름이 없거나, 볼트에서 사라졌다. */
  lastTargetUnnamed: boolean;
  notifications: AgentNotification[];
  unreadCount: number;
  notificationsEnabled: boolean;
  markAllRead: () => void;
}

export function useAgentActivityFeed(): AgentActivityFeed {
  const { agentActivityLog, manifest, status } = useLocalVault();
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
  // 볼트를 모르던 시절의 전역 키를 한 번 치운다 — 아무도 안 읽으므로 무해하지만,
  // 남겨 두면 다음 사람이 "이건 뭐지" 를 다시 조사하게 된다.
  useEffect(forgetLegacyUnscopedReadAt, []);
  /** 폴링 중에만 관측되는 사건 — 로그에 안 남으므로 세션 메모리다. */
  const [liveEvents, setLiveEvents] = useState<readonly AgentNotification[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const sessions = useMemo(
    () => deriveAgentWorkSessions(agentActivityLog ?? [], nowMs),
    [agentActivityLog, nowMs],
  );
  const last = sessions[sessions.length - 1] ?? null;
  const busy = Boolean(activeSession(sessions));
  /** 방금 **끝난** 작업의 id — 이 값이 바뀌는 순간이 뼈대·건강을 잴 자리다. */
  const settledId = last && last.done ? last.id : null;
  const settledEndAt = last && last.done ? last.endAt : null;

  const docs = status === 'loaded' ? manifest?.docs : undefined;
  /** 매니페스트 한 번 순회 — 이름표(링크 관문)와 뼈대 비교가 같은 스냅숏을 쓴다. */
  const snapshot = useMemo(
    () => (docs ? snapshotVaultShape(docs, locale) : null),
    [docs, locale],
  );

  const idleSnapshotRef = useRef<VaultShapeSnapshot | null>(null);
  const taskStartSnapshotRef = useRef<VaultShapeSnapshot | null>(null);
  const healthBaselineRef = useRef<{ unresolvedEdges: number; dependencyCycles: number } | null>(null);
  const reportedSessionRef = useRef<string | null>(null);

  // 작업이 도는 동안은 **작업 직전 스냅숏을 얼린다** — 지금 매니페스트는 이미
  // 그 작업의 결과를 일부 담고 있어 비교 기준이 못 된다.
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
        // 사라진 노드로는 날아갈 수 없다 — 이름만 말하고 링크는 걸지 않는다.
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
    // 「아파졌다」는 **늘었을 때만** 말한다. 원래 아팠던 볼트를 작업이 끝날
    // 때마다 다시 나무라면 그건 알림이 아니라 잔소리다.
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
      // 이 이펙트는 정확히 「외부 시스템(디스크의 볼트) → React 상태」 동기화다.
      // 관측 시점이 폴링이라 렌더 경로에서는 알 수 없고, 파생 값도 아니다
      // (직전 스냅숏이라는 상태가 필요하다). 연쇄 렌더는 작업이 끝나는 순간
      // 한 번뿐이다 — 실측상 몇 분에 한 번.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveEvents((current) => mergeNotifications(produced, current));
    }
  }, [settledId, settledEndAt, snapshot, docs]);

  const lastAt = last?.endAt ?? null;
  const fresh = lastAt !== null && nowMs - lastAt <= AGENT_TASK_VISIBLE_WINDOW_MS;
  const lastSlug = last?.lastTarget ?? null;
  // 죽은 링크를 만들지 않는 마지막 관문 — 매니페스트에 없으면 링크가 아니다.
  const lastNode = lastSlug ? (snapshot?.nodes.get(lastSlug) ?? null) : null;

  const notifications = useMemo(() => {
    const enabled = new Set(
      AGENT_NOTIFICATION_KINDS.filter((kind) => !mutedKinds.has(kind)),
    ) as ReadonlySet<AgentNotificationKind>;
    const merged = mergeNotifications(deriveTaskNotifications(sessions), liveEvents);
    return filterNotifications(merged, enabled).map((item) => {
      if (!item.node) return item;
      const resolved = snapshot?.nodes.get(item.node.slug) ?? null;
      // 알림함의 대상도 상태 칩과 **같은 관문**을 지난다.
      return resolved ? { ...item, node: resolved } : { ...item, node: null, label: item.label };
    });
  }, [sessions, liveEvents, mutedKinds, snapshot]);

  const markAllRead = useCallback(() => {
    try {
      writeReadAt(vaultScope, Date.now());
    } catch {
      // 저장이 막혀도 이벤트로 현재 세션은 읽음이 된다.
    }
    window.dispatchEvent(new CustomEvent(READ_AT_EVENT));
  }, [vaultScope]);

  return {
    showStatus: statusEnabled && fresh,
    nowMs,
    writing: busy,
    lastAt,
    agentName: last?.agent ?? null,
    lastNode,
    lastTargetUnnamed: lastAt !== null && lastNode === null,
    notifications: notificationsEnabled ? notifications : [],
    unreadCount: notificationsEnabled ? countUnread(notifications, readAt) : 0,
    notificationsEnabled,
    markAllRead,
  };
}
