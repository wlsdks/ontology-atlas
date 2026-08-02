"use client";

/**
 * P3c — 엣지 호버 마이크로카드. 클릭 팝오버(P3b, TopologyV2EdgePanel)의
 * 가벼운 전신: 커서 근처에 평문 문장 + 타입 + (있으면) 근거 한 줄만.
 * 게이트 해제 근거: 소유자 사용 신호("연결선에 호버하면 의미 표시") —
 * 원래 P3c 는 3b 사용 검증 후로 보류돼 있었다.
 *
 * 계약: 비인터랙티브(pointer-events-none — 클릭을 훔치지 않는다), 뷰포트
 * 클램프, 팝오버와 상호배제(엣지 선택 중엔 렌더하지 않음 — 호출자 책임).
 */
export interface TopologyV2EdgeHoverCardProps {
  /** 평문 문장 — "A 가 B 에 기대요" (P3b 와 같은 어휘 사전 출처). */
  sentence: string;
  /** formal 타입 라벨 — "의존". */
  typeLabel: string;
  /** P6 relation_notes — 있으면 1줄 truncate. */
  why: string | null;
  /** 클릭 안내 힌트 (i18n). */
  clickHint: string;
  /** 커서 뷰포트 좌표 — 카드는 우하단 오프셋 + 뷰포트 클램프. */
  x: number;
  y: number;
}

const OFFSET = 14;
const CARD_MAX_WIDTH = 280;
const EDGE_MARGIN = 8;

export function TopologyV2EdgeHoverCard({ sentence, typeLabel, why, clickHint, x, y }: TopologyV2EdgeHoverCardProps) {
  const left = Math.min(x + OFFSET, (typeof window !== "undefined" ? window.innerWidth : 1920) - CARD_MAX_WIDTH - EDGE_MARGIN);
  const top = Math.min(y + OFFSET, (typeof window !== "undefined" ? window.innerHeight : 1080) - 120 - EDGE_MARGIN);
  return (
    <div
      data-testid="topology-v2-edge-hover-card"
      role="status"
      className="pointer-events-none fixed z-40 flex max-w-[280px] flex-col gap-1 rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-3 py-2 shadow-[var(--topology-v2-panel-shadow)]"
      style={{ left, top }}
    >
      <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--topology-v2-panel-text-tertiary)]">
        {typeLabel}
      </p>
      <p className="text-body font-medium leading-snug text-[color:var(--topology-v2-panel-text-primary)]">
        {sentence}
      </p>
      {why ? (
        <p className="truncate text-label leading-snug text-[color:var(--topology-v2-panel-text-secondary)]">{why}</p>
      ) : null}
      <p className="text-label text-[color:var(--topology-v2-panel-text-quaternary)]">{clickHint}</p>
    </div>
  );
}
