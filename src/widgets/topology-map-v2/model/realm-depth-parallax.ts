/**
 * "영역 전개" 깊이 시차 (S5, fable 설계) — 순수 모듈, DOM/카메라 지식 없음.
 *
 * WHAT: 영역이 active 인 동안 사용자가 카메라를 팬/줌하면 깊은 링(depth2+)의
 * **렌더 좌표**만 카메라 이동 델타에 비례해 살짝 뒤처지게 한다. 월드 좌표는
 * 불변 — 그리기 직전(그리고 히트테스트 직전)에만 오프셋을 더한다. 카메라가
 * 멈추면 오프셋이 0 으로 스프링 감쇠해 노드가 제자리로 수렴한다.
 *
 * 왜 순수 감쇠인가: 지속 애니메이션이 아니라 **입력 반응**이다. 카메라
 * 움직임이 있는 프레임에만 오프셋이 충전되고, 정지하면 tau 안에 사라진다.
 * 유휴 게이트 계약(움직임 없으면 grace 후 재드로 중단)을 깨지 않으려면 감쇠가
 * grace(1200ms) 안에 사실상 0 이 되어야 한다 — tau 0.18s 면 grace 시점에
 * exp(-1.2/0.18)≈0.001 로 무시 가능(호출부 주석 참조).
 *
 * 결정론: 같은 (prev, cameraDelta, factor, dt, tau) 는 항상 같은 오프셋을 낸다.
 * `realm-depth-parallax.test.ts` 계약.
 */

export interface DepthParallaxOffset {
  x: number;
  y: number;
}

export const ZERO_PARALLAX: DepthParallaxOffset = { x: 0, y: 0 };

/** 감쇠 시상수(초) — 카메라 정지 후 오프셋이 사라지는 속도. */
export const REALM_PARALLAX_TAU_S = 0.18;
/** depth2(capability 링) 시차 계수 — 카메라 델타의 3%. */
export const REALM_PARALLAX_FACTOR_DEPTH2 = 0.03;
/** depth3+(element 링) 시차 계수 — 카메라 델타의 6%. 더 깊을수록 더 뒤처진다. */
export const REALM_PARALLAX_FACTOR_DEPTH3 = 0.06;
/** 오프셋이 이 월드 단위(절대값) 아래면 "수렴"으로 보고 비활성 처리. */
export const REALM_PARALLAX_EPSILON = 0.02;

/**
 * 멤버 깊이 → 시차 계수. depth≤1(루트·도메인 링)은 0(시차 없음), depth2 는
 * 3%, depth3+ 는 6%. 순수·결정론.
 */
export function depthParallaxFactorForDepth(depth: number): number {
  if (depth <= 1) return 0;
  if (depth === 2) return REALM_PARALLAX_FACTOR_DEPTH2;
  return REALM_PARALLAX_FACTOR_DEPTH3;
}

/**
 * 한 깊이 밴드의 시차 오프셋 한 스텝(순수). 이전 오프셋을 0 으로 지수 감쇠시킨
 * 뒤, 이번 프레임의 카메라 델타(월드 단위) × 계수를 더한다.
 *
 * - 카메라 정지(cameraDelta 0): 오프셋이 exp(-dt/tau) 로 0 에 수렴.
 * - 등속 팬: 오프셋이 factor·v·tau 근처의 작은 "지연 랙" 으로 수렴 — 깊은 링이
 *   카메라를 (1-factor) 속도로 따라가 뒤처져 보인다.
 * - factor 0: 항상 0(depth≤1).
 *
 * `tau≤0` 이면 감쇠를 즉시(잔여 0)로 처리한다(reduced-motion 안전).
 */
export function stepDepthParallax(
  prev: DepthParallaxOffset,
  cameraDelta: DepthParallaxOffset,
  factor: number,
  dtSeconds: number,
  tauSeconds: number = REALM_PARALLAX_TAU_S,
): DepthParallaxOffset {
  const decay = tauSeconds > 0 ? Math.exp(-dtSeconds / tauSeconds) : 0;
  return {
    x: prev.x * decay + factor * cameraDelta.x,
    y: prev.y * decay + factor * cameraDelta.y,
  };
}

/** 오프셋이 유의미하게 남아 있는가(수렴 판정). 둘 다 epsilon 이하면 false. */
export function isDepthParallaxActive(
  offset: DepthParallaxOffset,
  epsilon: number = REALM_PARALLAX_EPSILON,
): boolean {
  return Math.abs(offset.x) > epsilon || Math.abs(offset.y) > epsilon;
}

/**
 * 노드 하나의 렌더 오프셋(월드 단위) — 깊이 밴드로 두 오프셋 중 하나를 고른다.
 * depth 미상/≤1 이면 0. 드로우와 히트테스트가 **같은** 함수를 써 클릭 어긋남을
 * 원천 차단한다.
 */
export function depthParallaxOffsetFor(
  depth: number | undefined,
  depth2: DepthParallaxOffset,
  depth3: DepthParallaxOffset,
): DepthParallaxOffset {
  if (depth === undefined || depth <= 1) return ZERO_PARALLAX;
  return depth === 2 ? depth2 : depth3;
}
