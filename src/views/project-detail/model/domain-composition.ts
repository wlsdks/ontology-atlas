import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDegreeCentrality, computeDomainCensusRows } from "@/shared/lib/ontology-tree";

/**
 * 프로젝트 상세 "도메인 구성" 존(zone 2)의 machined 카드 하나 분량 데이터.
 *
 * `topCapabilities` 는 이 도메인에 (직접이든 nested 든) 속한 capability 중
 * degree(연결도) 내림차순 상위 N — "상위 역량" 이 단순 삽입 순서가 아니라
 * 그래프에서 가장 많이 참조/연결된 역량이라는 뜻이 되도록.
 */
export interface DomainCompositionCard {
  /** ontology 노드 id (예: `domain:views`) — topology focus deep-link 에 그대로 사용. */
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
  topCapabilities: string[];
  /** topCapabilities 로 보여준 것 이후 남은 capability 개수. */
  moreCapabilityCount: number;
}

export interface ProjectDomainComposition {
  domains: DomainCompositionCard[];
  maxTotal: number;
}

export interface BuildProjectDomainCompositionOptions {
  /** 카드당 노출할 상위 capability 이름 개수. 기본 2 (mockup 과 동일). */
  topCapabilityLimit?: number;
}

/**
 * 프로젝트에 속한 domain 노드들의 구성 카드. P-1 (UX 라운드): 카운트가
 * `nearestDomainId`(노드당 도메인 1개 배정 롤업)라 지도 INDEX·인사이트·
 * /projects 의 단일 진실원 BFS(`computeDomainCensusRows`)와 4면 불일치했다
 * — 이제 같은 BFS 를 쓰고, 이 모듈은 상위 역량 랭킹(degree)과 카드 shape 만
 * 소유한다.
 */
export function buildProjectDomainComposition(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
  options: BuildProjectDomainCompositionOptions = {},
): ProjectDomainComposition {
  const topCapabilityLimit = options.topCapabilityLimit ?? 2;
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const degrees = computeDegreeCentrality(nodes, edges);

  const projectDomainIds = new Set(
    nodes
      .filter((node) => node.kind === "domain" && node.projectIds.includes(projectSlug))
      .map((domain) => domain.id),
  );

  const rows = computeDomainCensusRows(nodes, edges, ["domain"], { collectCapabilityIds: true });

  const cards: DomainCompositionCard[] = rows
    .filter((row) => projectDomainIds.has(row.id))
    .map((row) => {
      const capabilities = (row.capabilityIds ?? [])
        .map((id) => nodeById.get(id))
        .filter((node): node is KnowledgeGraphNode => node !== undefined)
        .sort((a, b) => {
          const degreeDiff = (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0);
          if (degreeDiff !== 0) return degreeDiff;
          return a.title.localeCompare(b.title);
        });
      return {
        id: row.id,
        title: row.title,
        capabilityCount: row.capabilityCount,
        elementCount: row.elementCount,
        total: row.total,
        // 과제 ⑩ — top capability 이름도 표시용 짧은 제목.
        topCapabilities: capabilities
          .slice(0, topCapabilityLimit)
          .map((cap) => cap.display ?? cap.title),
        moreCapabilityCount: Math.max(0, row.capabilityCount - topCapabilityLimit),
      };
    });

  cards.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  const maxTotal = cards.reduce((max, card) => Math.max(max, card.total), 0);

  return { domains: cards, maxTotal };
}
