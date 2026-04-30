/**
 * 모션 토큰 — Linear 계열 다크 UI 의 일관된 전환 리듬.
 *
 * 원칙:
 * - 작은 요소는 빠르게 (fast), 큰 서피스는 medium/slow
 * - 모두 easeOut 계열: 들어올 때 빠르고 정착할 때 부드러움
 * - spring 은 드로어/시트처럼 "물리감" 이 필요한 곳에만
 */

export const MOTION = {
  /** 버튼·호버·작은 tooltip 류 */
  instant: { duration: 0.12, ease: [0.33, 1, 0.68, 1] as const },
  /** 패널 fade, 간단한 소형 오버레이 */
  fast: { duration: 0.18, ease: [0.33, 1, 0.68, 1] as const },
  /** 카드·탭 전환·드롭다운 표준 */
  medium: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  /** Hero·장면 전환 등 조금 느긋한 전환 */
  slow: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const },
} as const;

/** 시트/드로어용 spring (iOS 느낌 부드러운 감쇠). */
export const SPRING = {
  sheet: { type: "spring" as const, stiffness: 280, damping: 30 },
  snappy: { type: "spring" as const, stiffness: 420, damping: 36 },
};

/** 리스트 엔트런스 스태거용 — 아이템당 누적 딜레이(초). */
export const STAGGER = 0.035;
