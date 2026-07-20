import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { countConnectedDocuments } from "@/shared/lib/ontology-tree";

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
        // P-2 — 아래 countConnectedDocuments 가 멤버 포함까지 한 번에 센다.
        break;
      default:
        break;
    }
  }

  // P-2 — 문서 수는 /projects 카드와 같은 shared 1-hop 연결 규칙
  // (`countConnectedDocuments`)로 센다. 규칙이 두 벌이면 "문서 0 vs 3"
  // 같은 인접 표면 모순이 재발한다.
  metrics.documents = countConnectedDocuments(nodes, edges, projectNodeIds);

  for (const edge of edges) {
    if (projectNodeIds.has(edge.from) && projectNodeIds.has(edge.to)) {
      metrics.relations += 1;
    }
  }

  return metrics;
}
