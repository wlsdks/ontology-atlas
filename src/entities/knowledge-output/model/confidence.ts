/**
 * Knowledge extraction confidence — v1 cloud LLM 추출 워커의 신뢰도 정책.
 * mission v2 에서 추출 워커 자체가 폐기되어 신규 사용처 0 — Firestore
 * legacy 데이터 의 신뢰도 값을 호환 해석할 때만 사용.
 *
 *   ≥ 0.85   high    — 규격 문서 + 명시적 관계
 *   0.60~0.84 medium  — 문맥상 유력
 *   < 0.60   low     — 자동 반영 금지
 *
 * 임계값은 cloud-mode legacy fact 의 tier 분류용. 새 흐름은 vault
 * frontmatter 직접 작성이라 confidence 자체가 적용되지 않음.
 */

export const CONFIDENCE_HIGH_THRESHOLD = 0.85;
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.6;

export type ConfidenceTier = 'high' | 'medium' | 'low';

/**
 * 신뢰도 값을 [0, 1] 로 클램프 + 비숫자 fallback. 어디서든 안전하게 사용 가능.
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
