import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 검수 후보 (candidate) 와 기존 ontology approved 노드의 비슷도 매칭.
 *
 * 검수자가 후보를 promote 할지 결정하기 전에 "이미 비슷한 노드가 있는가?"
 * 를 답하는 데 사용. dedup 회피 + 같은 개념의 중복 분기 방지.
 *
 * 점수 규칙 (높을수록 강한 매치):
 *   100 — title 정확 일치 (lower-case 비교) + 같은 kind
 *    80 — title 정확 일치 (kind 다름)
 *    60 — title prefix 일치 + 같은 kind
 *    50 — title prefix 일치 (kind 다름)
 *    40 — title substring 일치 + 같은 kind
 *    30 — title substring 일치 (kind 다름)
 *    20 — id substring 일치 (kebab-case slug 매칭)
 *
 * 0 점은 결과에서 제외. 정렬: score desc, 같은 점수면 title asc.
 */
export interface SimilarityCandidate {
  /** 후보 노드의 표시 title. 한글/영문 혼합 OK. */
  title: string;
  /** 후보 노드의 kind (project / domain / capability / element / unknown 등). */
  kind: string;
  /** 옵션 — 후보 노드의 ID/slug. id substring 매치에 사용. */
  id?: string;
}

export interface SimilarityMatch {
  node: KnowledgeGraphNode;
  score: number;
}

export function findSimilarOntologyNodes(
  candidate: SimilarityCandidate,
  existingNodes: readonly KnowledgeGraphNode[],
  limit = 5,
): SimilarityMatch[] {
  const candTitle = candidate.title.trim().toLowerCase();
  const candId = candidate.id?.trim().toLowerCase() ?? "";
  if (candTitle === "" && candId === "") return [];

  const matches: SimilarityMatch[] = [];

  for (const node of existingNodes) {
    const nodeTitle = node.title.toLowerCase();
    const nodeId = node.id.toLowerCase();
    const sameKind = node.kind === candidate.kind;

    let score = 0;
    if (candTitle !== "" && nodeTitle === candTitle) {
      score = sameKind ? 100 : 80;
    } else if (candTitle !== "" && nodeTitle.startsWith(candTitle)) {
      score = sameKind ? 60 : 50;
    } else if (candTitle !== "" && nodeTitle.includes(candTitle)) {
      score = sameKind ? 40 : 30;
    } else if (candId !== "" && nodeId.includes(candId)) {
      score = 20;
    }

    if (score > 0) matches.push({ node, score });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.node.title.localeCompare(b.node.title);
  });

  return matches.slice(0, limit);
}
