/**
 * 골격 카드 데이터 모델 — 지도(Relief) 렌더러가 노드를 "카드"로 표현할 때
 * 쓰는 공유 타입. 원래 `SigmaSkeletonCards.tsx` (구 Sigma DOM 카드 오버레이)
 * 안에 정의돼 있었으나, 그 렌더러는 도달 불가능한 코드로 삭제됐다
 * (docs/TOPOLOGY-V2-PHASE0.md §0 — codegraph callers 0, 두 호출부 모두
 * skeletonMode 게이트를 항상 끈 상태로 마운트, 5개 CPU 프로파일 전체에서
 * 관련 함수명 미등장).
 *
 * 이 타입 자체는 살아있다 — `TopologyMapCanvas`(단일 컨테이너 변환 엔진,
 * 2026-07 지도 뷰 재구성)와 `src/views/home/lib/topology-skeleton-cards.ts`
 * 의 `buildSkeletonCardModels` 가 지금도 이 shape 로 카드를 만들어 지도에
 * 그린다. 렌더러만 교체됐고, 데이터 계약은 그대로 재사용된다.
 */
export interface SkeletonCardModel {
  /** 그래프 노드 id (prefixed slug). */
  id: string;
  /** 카드 제목 — element 는 파일 경로 대신 basename. */
  title: string;
  kind: 'project' | 'domain' | 'capability' | 'element' | 'unknown';
  /** 0=project(중앙) 1=domain 2=capability 3=element — 크기/타이포 위계. */
  tier: 0 | 1 | 2 | 3;
  /** governed subtree weight(전이 요소 수). 미표기면 undefined. */
  count?: number;
  /** hover 간단 팝업용 한 줄 설명 (compact). */
  summary?: string;
  /**
   * 앵커 정렬 — 'left' 는 노드 좌표가 카드의 *왼쪽* 모서리(카드가 오른쪽으로
   * 자람), 'right' 는 오른쪽 모서리. 펼친 자식 열은 부모를 향한 모서리를
   * 플러시 정렬해야 폭이 제각각인 카드들이 지그재그로 보이지 않는다
   * (MindNode 문법). 기본 'center' = 골격 anchor 용.
   */
  anchor?: 'center' | 'left' | 'right';
  /**
   * px 공간 도킹 — 펼친 자식 카드는 그래프 좌표가 아니라 *부모 카드 rect*
   * 기준 고정 px(열 간격 56px · 행 pitch = 카드 높이 + 10px)로 배치한다.
   * 그래프 좌표 배치는 줌 배율에 따라 간격이 늘어나 "공백 과다"가 된다
   * (MindNode 의 고정 밀도 문법). side 는 부모 기준 열 방향.
   */
  dock?: {
    parentId: string;
    index: number;
    total: number;
    side: 'left' | 'right';
  };
}
