/**
 * SigmaTopology nodeReducer 안에서 매 프레임 호출되는 애니메이션 phase
 * 계산 — 추출 이전엔 reducer body 안에 인라인되어 1700+ 줄 컴포넌트가
 * 더 비대했음. 두 함수 모두 순수 — 시간 (start, now) + 상수 입력으로
 * 결정되어 unit 테스트 가능.
 *
 * - `computeBounceFactor` — 노드 선택 직후 280ms 동안 1.0 → 1.2 → 1.0
 *   탄성 (sin(π·phase)). bounceStart 가 null 이거나 duration 경과면 1.0.
 * - `computeContainerHoverProgress` — 컨테이너 hover 시 0 → 1 progress
 *   (easeOutCubic). hoverStart null 이면 0, revealMs 경과면 1.
 */

export const BOUNCE_DURATION_MS = 280;
export const BOUNCE_AMPLITUDE = 0.2;

export const CONTAINER_HOVER_REVEAL_MS = 250;
export const CONTAINER_HOVER_TARGET_SCALE = 2.6;

/**
 * 선택 직후 bounce 의 phase factor. 1.0 = 변화 없음, 최대 1.2.
 *
 * @param bounceStart 선택 시점 timestamp (performance.now()). null 이면
 *   bounce 비활성 → 1.0 반환.
 * @param now 현재 시점 timestamp.
 * @param durationMs 한 사이클 길이.
 * @param amplitude 최대 변동 폭.
 */
export function computeBounceFactor(
  bounceStart: number | null,
  now: number,
  durationMs: number = BOUNCE_DURATION_MS,
  amplitude: number = BOUNCE_AMPLITUDE,
): number {
  if (bounceStart === null) return 1;
  const elapsed = now - bounceStart;
  if (elapsed < 0 || elapsed >= durationMs) return 1;
  const phase = elapsed / durationMs;
  return 1 + amplitude * Math.sin(Math.PI * phase);
}

/**
 * 컨테이너 hover 시 reveal progress (0~1, easeOutCubic). hoverStart null
 * 이면 0, revealMs 경과면 1.
 *
 * @param hoverStart hover 시작 timestamp. null 이면 0.
 * @param now 현재 시점.
 * @param revealMs 0 → 1 까지 걸리는 시간.
 */
export function computeContainerHoverProgress(
  hoverStart: number | null,
  now: number,
  revealMs: number = CONTAINER_HOVER_REVEAL_MS,
): number {
  if (hoverStart === null) return 0;
  const elapsed = now - hoverStart;
  if (elapsed <= 0) return 0;
  if (elapsed >= revealMs) return 1;
  const raw = elapsed / revealMs;
  return 1 - Math.pow(1 - raw, 3); // easeOutCubic
}

/**
 * 단일 lerp 헬퍼 — alpha lerp 등에서 사용. progress 0 → 1 사이.
 */
export function lerp(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}
