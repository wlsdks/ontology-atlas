/**
 * Ontology surface 공용 톤 token.
 *
 * stub / unknown 노드 amber 톤을 한 곳에서 정의해, 트리 chip · ego 시각화 ·
 * 검수 안내 카드가 같은 hue 를 쓰도록. surface 별 alpha 차이는 의도적
 * (chip = 작은 면적이라 약한 alpha, 큰 도형 = 강한 alpha) — 같은 hue 안에서
 * 강도만 다른 식.
 */
export const UNKNOWN_TONE = {
  /** chip 배경 — 작은 면적, 약한 alpha. */
  chipBg: "rgba(255,179,71,0.10)",
  /** chip / 라벨 텍스트 — softer amber. */
  chipText: "rgba(238,198,128,0.95)",
  /** chip / orphan 카드 border. */
  chipBorder: "rgba(255,179,71,0.32)",
  /** SVG 큰 도형 (ego graph circle) fill — chip 보다 진한 alpha. */
  fillStrong: "rgba(255,179,71,0.18)",
  /** SVG 큰 도형 stroke — 신호 강함. */
  strokeStrong: "rgba(255,179,71,0.60)",
} as const;
