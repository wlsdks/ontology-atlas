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

/**
 * DOM 오버레이 3종(GlobalSearch·SearchPalette·NewDocKindDialog, 설계협의회
 * batch B1 rank2) 전용 임계감쇠 스프링 — 오버슈트/바운스 0. `app/globals.css`
 * 의 `--overlay-spring-response`(0.30)/`--overlay-spring-damping`(1.0) 토큰과
 * 값을 맞춘 JS 복사본이다 — framer 는 CSS `var()` 를 숫자 트랜지션 필드에서
 * 읽지 못해 값을 복사한다(캔버스 2-param 물리 모델과는 별도 튜닝, "동일
 * 스프링 상속" 아님 — globals.css 쪽 주석의 변환식 참조). `duration` =
 * response(초), `bounce: 0` 이 damping 1.0(오버슈트 0)의 framer 표현.
 */
export const OVERLAY_SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

/**
 * reduced-motion 사용자용 오버레이 트랜지션 — translate/scale 없이 opacity
 * 크로스페이드만, 120ms. globals.css 의 `.overlay-fade-only` 및
 * `--topology-v2-tip-fade-ms`(120) 값 복사와 동일 duration(그 토큰은
 * topology-v2 스코프라 여기서 var() 직접 참조 금지 — 값만 맞춘다).
 */
export const OVERLAY_SPRING_REDUCED = { duration: 0.12, ease: "linear" } as const;
