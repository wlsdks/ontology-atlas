'use client';

import { useMemo, useState } from 'react';
import {
  computeRecentChanges,
  RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
  type RecentChangesResult,
} from '@/shared/lib/ontology-tree';
import { useOntologyInsight } from './use-ontology-insight';
import { useVaultDocFreshnessIndex } from './use-vault-doc-freshness';

const EMPTY_RESULT: RecentChangesResult = { recentNodeIds: new Set(), rows: [] };

/**
 * P4a — "최근 변경" 렌즈의 mode-aware 어댑터. `useVaultDocFreshnessIndex()`
 * (slug → 실제 updatedAt) 와 `useOntologyInsight()` (현재 그래프 노드) 를
 * `computeRecentChanges` 순수 함수(`@/shared/lib/ontology-tree`)에 그대로
 * 넘긴다 — mode 분기·시간 산수는 그 두 의존 hook/순수 함수가 이미 소유하므로
 * 여기서 새로 만들지 않는다(`use-ontology-insight.ts`/`use-vault-doc-freshness.ts`
 * 와 같은 얇은 조합 패턴).
 *
 * 기준 시각은 훅이 처음 호출된 순간의 스냅샷(`useState(() => Date.now())`) —
 * 렌더 중 `Date.now()` 를 직접 읽지 않는다(렌더 purity, 이 저장소의 기존
 * 관례 — `LiveActivityBadge`/`agentConnectNowMs` 등과 동일).
 */
export function useRecentChanges(
  windowDays: number = RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
): RecentChangesResult {
  const freshnessIndex = useVaultDocFreshnessIndex();
  const { insight } = useOntologyInsight();
  const [nowMs] = useState(() => Date.now());

  return useMemo(() => {
    if (!insight) return EMPTY_RESULT;
    return computeRecentChanges(insight.nodes, freshnessIndex, nowMs, windowDays);
  }, [insight, freshnessIndex, nowMs, windowDays]);
}
