'use client';

import { useMemo, useState } from 'react';
import {
  computeAdaptiveRecentChanges,
  computeRecentChanges,
  RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
  type AdaptiveRecentChangesResult,
} from '@/shared/lib/ontology-tree';
import { useOntologyInsight } from './use-ontology-insight';
import { useVaultDocFreshnessIndex } from './use-vault-doc-freshness';

/**
 * P4a — "최근 변경" 렌즈의 mode-aware 어댑터. `useVaultDocFreshnessIndex()`
 * (slug → 실제 updatedAt) 와 `useOntologyInsight()` (현재 그래프 노드) 를
 * `computeAdaptiveRecentChanges` 순수 함수(`@/shared/lib/ontology-tree`)에 그대로
 * 넘긴다 — mode 분기·시간 산수는 그 두 의존 hook/순수 함수가 이미 소유하므로
 * 여기서 새로 만들지 않는다(`use-ontology-insight.ts`/`use-vault-doc-freshness.ts`
 * 와 같은 얇은 조합 패턴).
 *
 * 기준 시각은 훅이 처음 호출된 순간의 스냅샷(`useState(() => Date.now())`) —
 * 렌더 중 `Date.now()` 를 직접 읽지 않는다(렌더 purity, 이 저장소의 기존
 * 관례 — `LiveActivityBadge`/`agentConnectNowMs` 등과 동일).
 */
const EMPTY_ADAPTIVE: AdaptiveRecentChangesResult = {
  recentNodeIds: new Set(),
  rows: [],
  windowDays: RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
};

/**
 * M-8 — 창 적응형 변형. 대량 커밋 날 7일 창이 전체의 80%를 통과시키면
 * 렌즈가 필터 구실을 못 하므로 7d→3d→1d 사다리로 좁힌다
 * (`computeAdaptiveRecentChanges` 계약). INDEX 렌즈가 이걸 쓴다.
 *
 * 스포트라이트 (협의회 설계 2026-07-23) — `overrideWindowDays` 가 숫자면
 * 적응 사다리 대신 그 창으로 **고정**한다(`computeRecentChanges` 직행,
 * `windowDays` 는 그 값 그대로 에코). `?recent=1|7|30` 프리셋 칩이 이 인자로
 * 들어온다; 생략/undefined = 기존 적응 동작 그대로(하위호환). 지도 침강과
 * INDEX 렌즈가 이 훅 하나를 공유해 두 표면의 창이 갈라질 수 없다.
 */
export function useAdaptiveRecentChanges(
  overrideWindowDays?: number,
): AdaptiveRecentChangesResult {
  const freshnessIndex = useVaultDocFreshnessIndex();
  const { insight } = useOntologyInsight();
  const [nowMs] = useState(() => Date.now());

  return useMemo(() => {
    if (!insight) return EMPTY_ADAPTIVE;
    if (overrideWindowDays !== undefined) {
      const fixed = computeRecentChanges(insight.nodes, freshnessIndex, nowMs, overrideWindowDays);
      return { ...fixed, windowDays: overrideWindowDays };
    }
    return computeAdaptiveRecentChanges(insight.nodes, freshnessIndex, nowMs);
  }, [insight, freshnessIndex, nowMs, overrideWindowDays]);
}
