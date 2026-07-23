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
 *
 * SSR 가드 — `useGuidedTour` 의 `visibleSteps` useMemo 는 (투어가 닫혀
 * 있어도) 매 렌더 이 함수를 호출하고, 그 첫 렌더는 서버에서도 돈다(Next
 * 클라이언트 컴포넌트도 초기 HTML 은 서버가 만든다). `doc` 인자 없이 호출한
 * 서버 쪽에서는 전역 `document` 참조 자체가 `ReferenceError`(2026-07-24
 * 발견 — 모든 페이지 최초 요청마다 서버 콘솔에 스택 트레이스가 찍혔다,
 * 화면엔 안 보이는 이유는 하이드레이션 후 클라이언트 재실행이 정상값으로
 * 덮어써서다). `typeof document` 로 존재 여부만 먼저 확인해 서버에서는
 * 조용히 `null`(= 앵커 미해석 취급)로 떨어뜨린다.
 */
export function resolveAnchorRect(
  testId: string,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): AnchorBox | null {
  if (!doc) return null;
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
