/**
 * 토폴로지 라벨 LOD(level-of-detail) 정책 — 순수 함수.
 *
 * 줌아웃하면 라벨이 화면을 덮으므로 카메라 ratio 에 따라 솎아낸다(Sigma 의
 * ratio 는 클수록 줌아웃). 단 "앵커"(navigation/fingerprint 기준점)는 더 오래
 * 유지해 사용자가 큰 그래프에서도 구조를 읽게 한다.
 *
 * 앵커 = 프로젝트 허브(`isHub`) **또는** graph-build 가 forceLabel 로 승격한
 * ontology 랜드마크(도메인 + 고차수 노드). 이전엔 reducer 가 `isHub` 만 보고
 * ontology 랜드마크를 일반 노드 ratio 로 일찍 솎아 graph-build 의 "fingerprint
 * 한 눈에" 의도를 무력화했다 — 이 helper 가 두 정책을 일치시킨다.
 */

/** 앵커(허브·랜드마크) 라벨을 유지하는 최대 줌아웃 ratio. 초과하면 솎는다. */
export const HUB_LABEL_RATIO = 0.55;
/** 일반 노드 라벨을 유지하는 최대 줌아웃 ratio. 앵커보다 먼저 솎인다. */
export const NODE_LABEL_RATIO = 0.28;

/**
 * 이 노드가 라벨 앵커인가 — 프로젝트 허브(isHub) 또는 graph-build 가 forceLabel
 * 로 flag 한 ontology 랜드마크(도메인/고차수). 앵커는 줌아웃 시 더 오래 라벨 유지.
 */
export function isTopologyLabelAnchor(attrs: {
  isHub?: boolean;
  forceLabel?: boolean;
}): boolean {
  return attrs.isHub === true || attrs.forceLabel === true;
}

/**
 * 주어진 카메라 ratio 에서 이 노드 라벨을 솎아낼지. 앵커는 HUB_LABEL_RATIO,
 * 일반 노드는 NODE_LABEL_RATIO 까지 라벨을 유지한다.
 */
export function shouldCullLabelAtZoom(isAnchor: boolean, ratio: number): boolean {
  return ratio > (isAnchor ? HUB_LABEL_RATIO : NODE_LABEL_RATIO);
}
