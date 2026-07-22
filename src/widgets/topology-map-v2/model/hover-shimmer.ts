/**
 * Design Guardian 승인 처방 L — 호버 circuit-trace shimmer 의 순수 위상 모델.
 * 정지 호버 링(1px, r+3) 위에 저속 순회하는 밝은 아크 1개를
 * `ctx.setLineDash`/`ctx.lineDashOffset` 로 얹는다(글로우/그림자 0 — 같은
 * `strokeKindOutline` 형상 패스를 재사용하는 게 렌더 쪽 계약).
 *
 * 이 모듈은 **시간→위상**만 안다: 둘레(perimeter)는 kind/farT 에 따라
 * hex/사각/원으로 달라지는 지오메트리라 호출부(`render/node-shapes.ts`)가
 * 이미 갖고 있는 `bodyPoints`/`FULL_CIRCLE_FAR_T` 분기로 계산해 인자로 넘긴다
 * — 여기선 순수 산수만(캔버스/DOM 모름), vitest 로 결정론·클램프·등속 순환을
 * 핀한다. reduced-motion 게이트는 호출부 책임(이 모듈에 새 분기 없음).
 */

/** seg 비율 클램프 [0,1] — 토큰 drift(음수/1 초과)가 들어와도 안전. */
export function clampSegRatio(segRatio: number): number {
  if (segRatio < 0) return 0;
  if (segRatio > 1) return 1;
  return segRatio;
}

export interface ShimmerDash {
  /** `ctx.setLineDash` 인자 — [세그먼트 길이, 나머지(간격) 길이]. */
  dash: readonly [number, number];
  /** `ctx.lineDashOffset`. */
  offset: number;
}

/**
 * `now`(ms) 시점의 shimmer dash/offset — 등속(linear) 순환, 1회전
 * `periodMs`, 시계 방향 1개 아크(`strokeKindOutline`이 그리는 패스 자체가
 * 이미 각도 증가 = 시계 방향이라 offset 은 그 방향으로만 전진). `perimeter`
 * 또는 `periodMs` 가 0 이하면(아직 지오메트리를 못 구했거나 토큰 drift) 그릴
 * 게 없어 dash `[0,0]`/offset 0 을 낸다 — 호출부는 `dash[0] <= 0` 이면
 * stroke 를 건너뛰면 된다.
 */
export function computeHoverShimmer(
  now: number,
  periodMs: number,
  perimeter: number,
  segRatio: number,
): ShimmerDash {
  if (perimeter <= 0 || periodMs <= 0) {
    return { dash: [0, 0], offset: 0 };
  }
  const seg = clampSegRatio(segRatio);
  const segLen = perimeter * seg;
  const gapLen = perimeter - segLen;
  // now 가 음수로 들어와도(이론상 없지만 방어) phase 는 항상 [0,1).
  const phase = (((now % periodMs) + periodMs) % periodMs) / periodMs;
  const offset = -phase * perimeter;
  return { dash: [segLen, gapLen], offset };
}
