/**
 * 앵커 해석 + 카드 배치. testid → DOMRect 는 DOM 의존(jsdom/브라우저에서만
 * 의미 있음), 카드 배치/클램프는 순수 함수 — `resolve-anchor-rect.test.ts` 가
 * 후자만 단위 테스트한다(전자는 통합 성격).
 */

export interface AnchorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * `[data-testid="<testId>"]` 를 찾아 뷰포트 기준 박스를 반환한다. 요소가
 * 없거나, 크기가 0(예: `display:none`)이거나, 뷰포트 밖(완전히 가려짐)이면
 * `null` — 호출부(`computeVisibleSteps`)가 그 단계를 자동 스킵하는 신호.
 */
export function resolveAnchorRect(
  testId: string,
  doc: Document = document,
): AnchorBox | null {
  const el = doc.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const view = doc.defaultView;
  const vw = view?.innerWidth ?? Number.POSITIVE_INFINITY;
  const vh = view?.innerHeight ?? Number.POSITIVE_INFINITY;
  if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= vw || rect.top >= vh) {
    return null;
  }
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export type CardPlacementSide = "center" | "below" | "above" | "right" | "left";

export interface CardPlacementInput {
  /** 대상 rect — `null` 이면 컷아웃 없는 중앙 카드(1단계 welcome). */
  targetRect: AnchorBox | null;
  cardWidth: number;
  cardHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** 카드-대상 간 여백. 기본 12px. */
  gap?: number;
  /** 뷰포트 가장자리 최소 여백. 기본 16px. */
  edgeMargin?: number;
}

export interface CardPlacement {
  top: number;
  left: number;
  side: CardPlacementSide;
}

/**
 * 컷아웃 인접 배치 — 아래→위→우→좌 우선순위로 뷰포트에 맞는 첫 후보를
 * 고르고, 어느 것도 완전히 맞지 않으면 첫 후보(아래)를 뷰포트 안으로
 * 클램프한다(spec §3-D).
 */
export function computeCardPlacement(input: CardPlacementInput): CardPlacement {
  const gap = input.gap ?? 12;
  const edgeMargin = input.edgeMargin ?? 16;
  const { targetRect, cardWidth, cardHeight, viewportWidth, viewportHeight } = input;

  if (!targetRect) {
    return {
      top: clamp((viewportHeight - cardHeight) / 2, edgeMargin, viewportHeight - cardHeight - edgeMargin),
      left: clamp((viewportWidth - cardWidth) / 2, edgeMargin, viewportWidth - cardWidth - edgeMargin),
      side: "center",
    };
  }

  const centerX = targetRect.left + targetRect.width / 2 - cardWidth / 2;
  const centerY = targetRect.top + targetRect.height / 2 - cardHeight / 2;

  const candidates: Array<{ side: CardPlacementSide; top: number; left: number; fits: boolean }> = [
    {
      side: "below",
      top: targetRect.top + targetRect.height + gap,
      left: centerX,
      fits:
        targetRect.top + targetRect.height + gap + cardHeight <= viewportHeight - edgeMargin,
    },
    {
      side: "above",
      top: targetRect.top - gap - cardHeight,
      left: centerX,
      fits: targetRect.top - gap - cardHeight >= edgeMargin,
    },
    {
      side: "right",
      top: centerY,
      left: targetRect.left + targetRect.width + gap,
      fits:
        targetRect.left + targetRect.width + gap + cardWidth <= viewportWidth - edgeMargin,
    },
    {
      side: "left",
      top: centerY,
      left: targetRect.left - gap - cardWidth,
      fits: targetRect.left - gap - cardWidth >= edgeMargin,
    },
  ];

  const chosen = candidates.find((c) => c.fits) ?? candidates[0];

  return {
    top: clamp(chosen.top, edgeMargin, Math.max(edgeMargin, viewportHeight - cardHeight - edgeMargin)),
    left: clamp(chosen.left, edgeMargin, Math.max(edgeMargin, viewportWidth - cardWidth - edgeMargin)),
    side: chosen.side,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
