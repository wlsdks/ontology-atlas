/**
 * Knowledge extraction confidence — 보류 스펙 §6.3 신뢰도 정책 구현.
 *
 *   ≥ 0.85   high    — 규격 문서 + 명시적 관계. 자동 승인 후보.
 *   0.60~0.84 medium  — 문맥상 유력. 검수 큐로.
 *   < 0.60   low     — 자동 반영 금지. 사용자 명시 승인 필요.
 *
 * 임계값은 결정 §3.3 cutover 기준에 영향을 미치는 핵심 숫자.
 * 변경 시 보류 스펙 §6.3 + 본 파일 + 검수 UI / 추출 워커 prompt 동시 갱신.
 */

export const CONFIDENCE_HIGH_THRESHOLD = 0.85;
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.6;

export type ConfidenceTier = 'high' | 'medium' | 'low';

/**
 * 신뢰도 값을 [0, 1] 로 클램프 + 비숫자 fallback.
 * mapper / 추출 워커 / 검수 UI 어디서나 안전하게 사용 가능.
 */
export function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 신뢰도 → tier 분류. */
export function getConfidenceTier(value: number): ConfidenceTier {
  const clamped = clampConfidence(value);
  if (clamped >= CONFIDENCE_HIGH_THRESHOLD) return 'high';
  if (clamped >= CONFIDENCE_MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

/** 자동 승인 후보 여부 (≥ 0.85). */
export function isAutoApprovable(value: number): boolean {
  return clampConfidence(value) >= CONFIDENCE_HIGH_THRESHOLD;
}

/** 자동 반영 금지 여부 (< 0.60). 검수 강제. */
export function requiresExplicitReview(value: number): boolean {
  return clampConfidence(value) < CONFIDENCE_MEDIUM_THRESHOLD;
}
