import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 프로젝트 상세 히어로 밴드의 음각 메트릭 스트립(도메인·역량·요소·문서·관계)
 * 이 쓰는 실카운트. `KnowledgeGraphNode.projectIds` 는 BFS containment
 * walk (derivationToInsight) 로 이미 채워져 있으므로 여기서는 필터 +
 * 카운트만 한다 — fabrication 없이 vault frontmatter 그대로.
 *
 * `KnowledgeGraphEdge` 는 projectIds 를 채우지 않는다 (derivationToInsight
 * 참고 — edge 는 항상 빈 배열). "관계" 카운트는 그래서 edge 자체가 아니라
 * 양 끝 노드가 모두 이 프로젝트에 속하는지로 판단한다 — 프로젝트 내부
 * containment/behavior 구조만 세므로 다른 프로젝트로 걸치는 relates 는
 * (의도적으로) 제외된다.
 */
export interface ProjectOntologyMetrics {
  domains: number;
  capabilities: number;
  elements: number;
  documents: number;
  relations: number;
}

export function buildProjectOntologyMetrics(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
): ProjectOntologyMetrics {
  const metrics: ProjectOntologyMetrics = {
    domains: 0,
    capabilities: 0,
    elements: 0,
    documents: 0,
    relations: 0,
  };
  const projectNodeIds = new Set<string>();
  const countedDocumentIds = new Set<string>();

  for (const node of nodes) {
    if (!node.projectIds.includes(projectSlug)) continue;
    projectNodeIds.add(node.id);
    switch (node.kind) {
      case "domain":
        metrics.domains += 1;
        break;
      case "capability":
        metrics.capabilities += 1;
        break;
      case "element":
        metrics.elements += 1;
        break;
      case "document":
        metrics.documents += 1;
        countedDocumentIds.add(node.id);
        break;
      default:
        break;
    }
  }

  // document 노드는 containment BFS(derivationToInsight)가 걷는 contains/
  // belongs_to 로는 절대 projectIds 가 안 채워진다 — vault 관례상 document
  // 는 `relates:` (related_to edge) 로만 개념과 이어진다. 그대로 두면 실제
  // 문서가 있어도 "문서" 메트릭이 영원히 0 으로 찍히는 정직하지 못한 결과가
  // 된다. 이미 이 프로젝트 소속으로 확인된 노드와 어떤 edge 로든 이어진
  // document 는 실카운트에 포함 — containment 보다 한 hop 넓힐 뿐 여전히
  // 실 vault 데이터.
  for (const node of nodes) {
    if (node.kind !== "document" || countedDocumentIds.has(node.id)) continue;
    const isConnectedToProject = edges.some(
      (edge) =>
        (edge.from === node.id && projectNodeIds.has(edge.to)) ||
        (edge.to === node.id && projectNodeIds.has(edge.from)),
    );
    if (isConnectedToProject) {
      metrics.documents += 1;
      countedDocumentIds.add(node.id);
    }
  }

  for (const edge of edges) {
    if (projectNodeIds.has(edge.from) && projectNodeIds.has(edge.to)) {
      metrics.relations += 1;
    }
  }

  return metrics;
}
