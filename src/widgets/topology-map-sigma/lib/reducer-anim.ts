/**
 * SigmaTopology nodeReducer 안에서 매 프레임 호출되는 애니메이션 phase
 * 계산. 선택 노드의 탄성 bounce 만 유지 — container hover 같은 데모 시절
 * 헬퍼는 mission v2 에서 invisible 이라 제거됨.
 */

export const BOUNCE_DURATION_MS = 280;
export const BOUNCE_AMPLITUDE = 0.2;

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
