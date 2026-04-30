/**
 * SigmaControls 상태 타입 + 기본값. HomePage가 SSR/RSC 경로에서 import해도
 * Sigma(WebGL) 모듈이 딸려오지 않도록 UI 파일과 분리한다.
 */
export interface SigmaForces {
  repel?: number;
  linkDistance?: number;
  collideMultiplier?: number;
}

/**
 * 지도 위에 겹쳐 정보를 드러내는 overlay 토글.
 * - recentPulse: 최근 업데이트 노드의 size sine 변조 (기본 on — 상시 "살아있는" 신호)
 * - ownerTint: owner 해시 기반 무채색 계열 미세 색 변주로 책임 클러스터 시각화
 * - backrefHighlight: 선택된 노드를 dependency 로 가진 프로젝트(들어오는 참조)를 별도 색으로 강조
 * - auditHighlight: 운영 점검 결과 (stale/orphan/promotion) 를 지도 위에서 색으로 구분.
 *   /diagnostics/insights 의 리스트 뷰와 직교하는 "맵 위의 같은 정보" 로,
 *   문제가 지도상 어디에 몰려 있는지 파악용.
 */
export interface SigmaOverlays {
  recentPulse: boolean;
  ownerTint: boolean;
  backrefHighlight: boolean;
  auditHighlight: boolean;
}

export interface SigmaControlsState {
  depthLimit: number | null;
  searchQuery: string;
  forces: SigmaForces;
  /** true면 비허브 노드·엣지 모두 hidden. 허브 11개만 노출해 "정거장 지도" 역할. */
  hubsOnly: boolean;
  overlays: SigmaOverlays;
}

export const DEFAULT_SIGMA_CONTROLS: SigmaControlsState = {
  depthLimit: null,
  searchQuery: '',
  forces: {
    repel: -320,
    linkDistance: 70,
    collideMultiplier: 1,
  },
  hubsOnly: false,
  overlays: {
    recentPulse: true,
    ownerTint: false,
    backrefHighlight: false,
    auditHighlight: false,
  },
};
