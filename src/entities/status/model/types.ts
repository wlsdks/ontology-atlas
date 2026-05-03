/**
 * 프로젝트 상태 도메인 모델.
 *
 * 카테고리와 달리 레이아웃에 영향이 없고, 노드 우상단 dot 의 색과 드로어/
 * 폼의 라벨만 변경한다. dot 색은 design system preset 4개 중 하나.
 */

/** Preset dot 색 — status-success / status-warning / status-paused / 무채색. */
export type StatusDotColor = 'success' | 'warning' | 'paused' | 'neutral';

export interface Status {
  /** Stable ID. 소문자·숫자·하이픈. 예: 'live'. */
  id: string;
  /** UI 라벨 (한국어 OK). */
  label: string;
  /** preset dot 색. */
  dotColor: StatusDotColor;
}
