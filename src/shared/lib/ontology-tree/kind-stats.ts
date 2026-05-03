import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * "사용자 관심 단위" 의 ontology 노드 kind — Strip / Dashboard / Project
 * overview 등 stat surface 에서 공통으로 카운트하는 kind 집합.
 *
 * 제외:
 *  - `project` — 메타 라벨. 트리의 최상위지만 사용자가 "내 ontology 가 N 개"
 *    라고 셀 때 카운트하지 않는다.
 *  - `document` — 근거 노드. describes 관계로 개념과 연결되며 사용자가
 *    개념·역량·요소 단위로 인식하는 통계에는 들어가지 않는다.
 *
 * 포함:
 *  - `domain` / `capability` / `element` — 진짜 의미 단위.
 *  - `unknown` — stub placeholder. 사용자가 "검수 대기" 상태로 인식해야 하므로
 *    분포에 표시하되 amber 톤으로 강조 (UI 측 책임).
 */
export const MEANINGFUL_ONTOLOGY_KINDS = [
  "domain",
  "capability",
  "element",
  "unknown",
] as const;

export type MeaningfulOntologyKind = (typeof MEANINGFUL_ONTOLOGY_KINDS)[number];

export function isMeaningfulOntologyKind(
  kind: string | undefined | null,
): kind is MeaningfulOntologyKind {
  if (!kind) return false;
  return (MEANINGFUL_ONTOLOGY_KINDS as readonly string[]).includes(kind);
}

export interface OntologyKindStats {
  total: number;
  byKind: Record<MeaningfulOntologyKind, number>;
}

/**
 * stat surface 들이 공통으로 쓰는 kind 분포. 입력 순서와 무관하게 결과의
 * `byKind` 는 `MEANINGFUL_ONTOLOGY_KINDS` 순서로 0 포함 dense map.
 */
export function buildMeaningfulOntologyStats(
  nodes: readonly KnowledgeGraphNode[],
): OntologyKindStats {
  const byKind = {
    domain: 0,
    capability: 0,
    element: 0,
    unknown: 0,
  } satisfies Record<MeaningfulOntologyKind, number>;
  let total = 0;
  for (const n of nodes) {
    if (!isMeaningfulOntologyKind(n.kind)) continue;
    byKind[n.kind] += 1;
    total += 1;
  }
  return { total, byKind };
}
