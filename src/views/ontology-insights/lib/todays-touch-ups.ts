import type { DoNextQueue } from "./do-next-queue";
import type { DependencyCycle, DependencyCyclesResult } from "./dependency-cycles";

/**
 * "오늘의 손질" (③) — 할 일 탭 상단 밴드. 새 표면·새 알고리즘을 만들지 않고,
 * 이미 계산된 do-next 큐 + 의존 사이클에서 상위 3건만 절단한다. 우선순위는
 * 기존 랭킹을 그대로 재사용한다:
 *
 *   1. 강제-검토 대기 = 의존 사이클(구조적으로 서로를 기다리는 순환 —
 *      가장 시급, 지금도 warning 아이콘으로 렌더되는 신호).
 *   2. 방치 허브 상위 = do-next 큐의 neglected-hub 행(이미 degree×방치일 순).
 *   3. 승격 후보 = do-next 큐의 promotion 행.
 *
 * 고아(orphan)는 밴드 대상이 아니다("지금 하면 좋은 일"의 절단이라 연결이
 * 시급한 축만 담는다) — 전체 큐에는 그대로 남는다.
 *
 * 콜드스타트 가드(③.3): 소형 vault(첫날) 이거나 3건을 못 채우면 빈 배열을
 * 돌려 밴드를 아예 렌더하지 않는다(첫 화면 빈 밴드 방지).
 */

export type TouchUpReason =
  | { kind: "cycle"; length: number }
  | { kind: "neglected-hub"; degree: number; agoDays: number }
  /** fanIn = 들어오는 참조 수 — 큐 행이 이미 나르는 근거(「여러 곳」이라
   *  뭉뚱그리면 세 행이 같은 문구를 반복한다, 2026-08-13 실측). */
  | { kind: "promotion"; fanIn: number };

export interface TouchUpItem {
  /** 밴드 행 고유 id — 세션 완료 표기의 키로도 쓴다. */
  id: string;
  source: "cycle" | "neglected-hub" | "promotion";
  /** 지도/빌더 딥링크 대상(그래프 노드 id). */
  nodeId: string;
  title: string;
  /** kind glyph 용. 사이클 행은 kind 가 없으므로 "". */
  nodeKind: string;
  reason: TouchUpReason;
  /** 행별 에이전트 핸드오프(복사용) — 큐 행/사이클 핸드오프 재사용. */
  handoffPayload: string;
}

export interface PickTouchUpsOptions {
  /** 전체 노드 수 — 콜드스타트 가드에 쓴다. */
  totalNodes: number;
  /** 밴드에 담을 항목 수. 기본 TOUCH_UP_TARGET(3). */
  limit?: number;
  /** 이 미만이면 소형 vault 로 보고 밴드 미표시. 기본 TOUCH_UP_MIN_VAULT_NODES(12). */
  minVaultNodes?: number;
  /** 사이클 첫 노드 id → 표시 제목. */
  cycleTitle: (nodeId: string) => string;
  /** 사이클별 에이전트 핸드오프 페이로드. */
  cycleHandoff: (cycle: DependencyCycle) => string;
  /**
   * 현재 검토 중인 exact row id. 있으면 1–2건뿐이어도 밴드를 유지하고,
   * 아직 살아 있는 신호라면 첫 행으로 올린다.
   */
  reviewId?: string | null;
}

export const TOUCH_UP_TARGET = 3;
export const TOUCH_UP_MIN_VAULT_NODES = 12;

export function pickTodaysTouchUps(
  queue: DoNextQueue,
  cycles: DependencyCyclesResult,
  options: PickTouchUpsOptions,
): TouchUpItem[] {
  const limit = options.limit ?? TOUCH_UP_TARGET;
  const minVaultNodes = options.minVaultNodes ?? TOUCH_UP_MIN_VAULT_NODES;

  // 콜드스타트 가드 ①: 소형 vault(첫날) 는 밴드 미표시.
  if (options.totalNodes < minVaultNodes) return [];

  const forcedReview: TouchUpItem[] = cycles.cycles.map((cycle) => {
    const firstNodeId = cycle.nodeIds[0];
    return {
      id: `cycle:${cycle.id}`,
      source: "cycle",
      nodeId: firstNodeId,
      title: options.cycleTitle(firstNodeId),
      nodeKind: "",
      reason: { kind: "cycle", length: cycle.length },
      handoffPayload: options.cycleHandoff(cycle),
    };
  });

  const neglectedHub: TouchUpItem[] = queue.rows
    .filter((row) => row.rowKind === "neglected-hub")
    .map((row) => ({
      id: `neglected-hub:${row.nodeId}`,
      source: "neglected-hub" as const,
      nodeId: row.nodeId,
      title: row.title,
      nodeKind: row.nodeKind,
      reason: { kind: "neglected-hub" as const, degree: row.degree ?? 0, agoDays: row.agoDays ?? 0 },
      handoffPayload: row.handoffPayload,
    }));

  const promotion: TouchUpItem[] = queue.rows
    .filter((row) => row.rowKind === "promotion")
    .map((row) => ({
      id: `promotion:${row.nodeId}`,
      source: "promotion" as const,
      nodeId: row.nodeId,
      title: row.title,
      nodeKind: row.nodeKind,
      reason: { kind: "promotion" as const, fanIn: row.degree ?? 0 },
      handoffPayload: row.handoffPayload,
    }));

  const ordered = [...forcedReview, ...neglectedHub, ...promotion];
  const activeReviewIndex = options.reviewId
    ? ordered.findIndex((item) => item.id === options.reviewId)
    : -1;
  if (activeReviewIndex > 0) {
    const [activeReview] = ordered.splice(activeReviewIndex, 1);
    ordered.unshift(activeReview);
  }

  // 검토 왕복 중에는 남은 신호가 1–2건이어도 다음 행동을 잃지 않는다.
  // 평상시에는 기존 콜드스타트 가드(목표 수 미만이면 밴드 미표시)를 유지한다.
  if (!options.reviewId && ordered.length < limit) return [];
  return ordered.slice(0, limit);
}
