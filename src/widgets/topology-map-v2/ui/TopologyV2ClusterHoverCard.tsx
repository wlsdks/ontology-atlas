"use client";
import { transientSurface } from "@/shared/ui/transient-surface";

/**
 * S2 파트 5C — 클러스터 칩 호버 마이크로카드. 소유자 실보고 "칩에 마우스
 * 올리면 툴팁으로 의미를 알려달라". 엣지 호버 카드(`TopologyV2EdgeHoverCard`)와
 * 같은 계약: 비인터랙티브(pointer-events-none — 클릭을 훔치지 않는다), 뷰포트
 * 클램프, 적당한 사이즈. 접힘/펼침에 따라 다른 평문 한 줄만.
 *
 * 문구는 i18n(`topology.cluster.tooltipCollapsed/Expanded`) — HomePage 가 부모
 * 노드 제목/카운트를 넣어 완성한 문장을 주입한다(이 카드는 표시만).
 */
export interface TopologyV2ClusterHoverCardProps {
  /** 평문 문장 (i18n 완성본) — "「Onboarding & UX」의 요소 63개가 접혀 있어요…". */
  sentence: string;
  /** 커서 뷰포트 좌표 — 카드는 우하단 오프셋 + 뷰포트 클램프. */
  x: number;
  y: number;
}

const OFFSET = 14;
const CARD_MAX_WIDTH = 260;
const EDGE_MARGIN = 8;

export function TopologyV2ClusterHoverCard({ sentence, x, y }: TopologyV2ClusterHoverCardProps) {
  const left = Math.min(x + OFFSET, (typeof window !== "undefined" ? window.innerWidth : 1920) - CARD_MAX_WIDTH - EDGE_MARGIN);
  const top = Math.min(y + OFFSET, (typeof window !== "undefined" ? window.innerHeight : 1080) - 72 - EDGE_MARGIN);
  return (
    <div
      {...transientSurface("hint")}
      data-testid="topology-v2-cluster-hover-card"
      role="status"
      className="pointer-events-none fixed z-40 max-w-[260px] rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-3 py-2 shadow-[var(--topology-v2-panel-shadow)]"
      style={{ left, top }}
    >
      <p className="text-body font-[var(--font-weight-signature)] leading-label text-[color:var(--topology-v2-panel-text-primary)]">
        {sentence}
      </p>
    </div>
  );
}
