import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildContainmentParents, computeDegreeCentrality, nearestDomainId } from "@/shared/lib/ontology-tree";

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
 * 프로젝트에 속한 domain 노드들을 총 카운트(역량+요소) 내림차순으로 정렬해
 * 3×2 machined 카드 그리드가 그대로 렌더할 수 있는 형태로 반환한다.
 *
 * 소속 판정은 `nearestDomainId` (containment parent 체인을 domain 조상까지
 * 걷는다) 로 하므로 capability 아래 nested element 도 정확히 그 domain 으로
 * 롤업된다 — 얕은 "직접 자식만" 카운트가 아니다.
 */
export function buildProjectDomainComposition(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
  options: BuildProjectDomainCompositionOptions = {},
): ProjectDomainComposition {
  const topCapabilityLimit = options.topCapabilityLimit ?? 2;
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const parentOf = buildContainmentParents(edges, nodeById);
  const degrees = computeDegreeCentrality(nodes, edges);

  const domainNodes = nodes.filter((node) => node.kind === "domain" && node.projectIds.includes(projectSlug));
  const domainIds = new Set(domainNodes.map((domain) => domain.id));

  const capabilitiesByDomain = new Map<string, KnowledgeGraphNode[]>();
  const elementCountByDomain = new Map<string, number>();
  for (const id of domainIds) {
    capabilitiesByDomain.set(id, []);
    elementCountByDomain.set(id, 0);
  }

  for (const node of nodes) {
    if (node.kind !== "capability" && node.kind !== "element") continue;
    if (!node.projectIds.includes(projectSlug)) continue;
    const domainId = nearestDomainId(node, parentOf, nodeById);
    if (!domainId || !domainIds.has(domainId)) continue;
    if (node.kind === "capability") {
      capabilitiesByDomain.get(domainId)!.push(node);
    } else {
      elementCountByDomain.set(domainId, (elementCountByDomain.get(domainId) ?? 0) + 1);
    }
  }

  const cards: DomainCompositionCard[] = domainNodes.map((domain) => {
    const capabilities = capabilitiesByDomain.get(domain.id) ?? [];
    const sortedCapabilities = [...capabilities].sort((a, b) => {
      const degreeDiff = (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0);
      if (degreeDiff !== 0) return degreeDiff;
      return a.title.localeCompare(b.title);
    });
    const elementCount = elementCountByDomain.get(domain.id) ?? 0;
    return {
      id: domain.id,
      title: domain.title,
      capabilityCount: capabilities.length,
      elementCount,
      total: capabilities.length + elementCount,
      topCapabilities: sortedCapabilities.slice(0, topCapabilityLimit).map((cap) => cap.title),
      moreCapabilityCount: Math.max(0, capabilities.length - topCapabilityLimit),
    };
  });

  cards.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  const maxTotal = cards.reduce((max, card) => Math.max(max, card.total), 0);

  return { domains: cards, maxTotal };
}
