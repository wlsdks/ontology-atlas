/**
 * ego graph 라벨 가시성 정책 — 노드 수가 많아 라벨이 겹칠 때 어떤 라벨을
 * 그릴지 결정하는 순수 함수.
 *
 * 동심 radial layout 은 한 ring 안에 N 개 노드를 균등 배치하므로 ring
 * 라벨이 N 이 커질수록 인접 라벨끼리 겹친다. SVG 320×200 폭에서
 * `LABEL_MAX_CHARS=12` 라벨이 겹치지 않으려면 ring 당 약 8~10 개가
 * 한계. 안전하게 12 를 임계값으로 잡고, 그 이상은 hover/focus 한 노드만
 * 라벨 노출. 다른 노드는 native `<title>` 툴팁으로 폴백.
 */
export const EGO_LABEL_DENSE_THRESHOLD = 12;

export interface RingNeighbor {
  hop: 1 | 2;
}

export interface EgoLabelDensity {
  hop1: boolean;
  hop2: boolean;
}

/**
 * ring 별 dense 여부 계산. 한 ring 의 노드 수가 임계값보다 크면 그
 * ring 의 라벨은 hover-only.
 */
export function computeEgoLabelDensity(neighbors: RingNeighbor[]): EgoLabelDensity {
  let hop1Count = 0;
  let hop2Count = 0;
  for (const n of neighbors) {
    if (n.hop === 1) hop1Count += 1;
    else if (n.hop === 2) hop2Count += 1;
  }
  return {
    hop1: hop1Count > EGO_LABEL_DENSE_THRESHOLD,
    hop2: hop2Count > EGO_LABEL_DENSE_THRESHOLD,
  };
}

/**
 * 특정 neighbor 의 라벨을 그려야 하는지. 정책:
 * - dense 가 아닌 ring: 항상 렌더 (기존 동작 보존).
 * - dense ring: hover/focus 된 noeud 만 렌더. 다른 노드 라벨은
 *   `<title>` 툴팁으로 폴백 (호출자가 SVG `<title>` 추가 책임).
 */
export function shouldShowEgoLabel(
  neighborHop: 1 | 2,
  neighborIndex: number,
  density: EgoLabelDensity,
  hoveredIndex: number | null,
): boolean {
  const dense = neighborHop === 1 ? density.hop1 : density.hop2;
  if (!dense) return true;
  return neighborIndex === hoveredIndex;
}
