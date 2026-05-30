import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isContainmentRelation } from "./relations";

/**
 * 노드의 kind 별 카운트 — UI 차트 / chip 에 사용. document / project 도 모두
 * 포함 (호출자가 필요시 필터). Map 의 입력 순서는 입력 nodes 순서.
 */
export function computeKindDistribution(
  nodes: readonly KnowledgeGraphNode[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of nodes) {
    map.set(n.kind, (map.get(n.kind) ?? 0) + 1);
  }
  return map;
}

/**
 * 노드별 degree — outgoing + incoming edge 의 합. self-loop 는 1 만 카운트.
 *
 * 입력 edges 가 미존재 노드 를 가리키더라도 노드 인덱스에 없으면 무시 (orphan
 * edge). 결과 Map 은 모든 입력 nodes 가 키로 들어감 (degree 0 도 포함) —
 * UI 가 zero-degree 도 표시할지 결정.
 */
export function computeDegreeCentrality(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const n of nodes) degrees.set(n.id, 0);
  for (const edge of edges) {
    const fromExists = degrees.has(edge.from);
    const toExists = degrees.has(edge.to);
    if (edge.from === edge.to) {
      if (fromExists) degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
      continue;
    }
    if (fromExists) degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    if (toExists) degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

export interface OntologyDegreeRow {
  node: KnowledgeGraphNode;
  degree: number;
}

export interface DomainCouplingDomainRow {
  domain: KnowledgeGraphNode;
  nodeCount: number;
  outgoing: number;
  incoming: number;
  selfEdges: number;
}

export interface DomainCouplingConnectionRow {
  from: KnowledgeGraphNode;
  to: KnowledgeGraphNode;
  count: number;
  relationCounts: Array<{ type: string; count: number }>;
  examples: KnowledgeGraphEdge[];
}

export interface DomainCouplingMatrix {
  domainCount: number;
  nodeCount: number;
  assignedNodeCount: number;
  unassignedNodeCount: number;
  crossDomainEdgeCount: number;
  selfDomainEdgeCount: number;
  domains: DomainCouplingDomainRow[];
  connections: DomainCouplingConnectionRow[];
}

export interface ComputeDomainCouplingMatrixOptions {
  types?: readonly string[];
}

/**
 * degree 내림차순으로 정렬된 **전체** 허브 후보 (degree > 0, document / project
 * 기본 제외). slice 없이 모두 반환하므로 호출자가 "상위 N / 전체 M" 처럼
 * truncation 을 사용자에게 알릴 수 있다 (silent cap 회피).
 */
export function rankAllByDegree(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options?: { includeKinds?: ReadonlyArray<string>; excludeKinds?: ReadonlyArray<string> },
): OntologyDegreeRow[] {
  const exclude = new Set(options?.excludeKinds ?? ["document", "project"]);
  const include = options?.includeKinds ? new Set(options.includeKinds) : null;
  const degrees = computeDegreeCentrality(nodes, edges);

  const rows: OntologyDegreeRow[] = [];
  for (const node of nodes) {
    if (include && !include.has(node.kind)) continue;
    if (exclude.has(node.kind)) continue;
    const degree = degrees.get(node.id) ?? 0;
    if (degree === 0) continue;
    rows.push({ node, degree });
  }
  rows.sort((a, b) => {
    if (b.degree !== a.degree) return b.degree - a.degree;
    return a.node.title.localeCompare(b.node.title);
  });
  return rows;
}

/**
 * 도메인 간 결합 행렬 — MCP `query_ontology(domain_matrix)` 의 브라우저
 * local-first 대응. 서버/MCP 없이 현재 derive 된 frontmatter graph 만으로
 * "어느 도메인이 어느 도메인에 의존/연결되는지"를 계산한다.
 *
 * 도메인 배정은 containment tree 를 따라 가장 가까운 domain 조상을 찾는다.
 * domain 노드 자신은 자기 domain 으로 배정된다. document/project 처럼 domain
 * 조상이 없는 메타 노드는 unassigned 로 남겨 결합 edge 계산에서 제외한다.
 * `contains` / `belongs_to` 는 domain 배정을 위한 구조 edge 라서 coupling
 * count 에서는 제외한다. 사람용 UI 에서는 계층 구조가 아니라 경계 압력을
 * 보여주는 쪽이 더 해석 가능하다.
 */
export function computeDomainCouplingMatrix(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit = 8,
  options: ComputeDomainCouplingMatrixOptions = {},
): DomainCouplingMatrix {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const parentOf = buildContainmentParents(edges, nodeById);
  const typeSet = options.types ? new Set(options.types) : null;
  const domainByNode = new Map<string, string>();
  const domainRows = new Map<string, DomainCouplingDomainRow>();

  for (const node of nodes) {
    if (node.kind === "domain") {
      domainRows.set(node.id, {
        domain: node,
        nodeCount: 0,
        outgoing: 0,
        incoming: 0,
        selfEdges: 0,
      });
    }
  }

  for (const node of nodes) {
    const domainId = nearestDomainId(node, parentOf, nodeById);
    if (!domainId) continue;
    domainByNode.set(node.id, domainId);
    const row = domainRows.get(domainId);
    if (row) row.nodeCount += 1;
  }

  const connectionRows = new Map<
    string,
    {
      from: string;
      to: string;
      count: number;
      relationCounts: Map<string, number>;
      examples: KnowledgeGraphEdge[];
    }
  >();
  let selfDomainEdgeCount = 0;
  let crossDomainEdgeCount = 0;

  for (const edge of edges) {
    if (isContainmentRelation(edge.type)) continue;
    if (typeSet && !typeSet.has(edge.type)) continue;
    const fromDomain = domainByNode.get(edge.from);
    const toDomain = domainByNode.get(edge.to);
    if (!fromDomain || !toDomain) continue;
    if (fromDomain === toDomain) {
      selfDomainEdgeCount += 1;
      const row = domainRows.get(fromDomain);
      if (row) row.selfEdges += 1;
      continue;
    }

    crossDomainEdgeCount += 1;
    const fromRow = domainRows.get(fromDomain);
    const toRow = domainRows.get(toDomain);
    if (fromRow) fromRow.outgoing += 1;
    if (toRow) toRow.incoming += 1;

    const key = `${fromDomain}\0${toDomain}`;
    if (!connectionRows.has(key)) {
      connectionRows.set(key, {
        from: fromDomain,
        to: toDomain,
        count: 0,
        relationCounts: new Map(),
        examples: [],
      });
    }
    const row = connectionRows.get(key)!;
    row.count += 1;
    row.relationCounts.set(edge.type, (row.relationCounts.get(edge.type) ?? 0) + 1);
    if (row.examples.length < 3) row.examples.push(edge);
  }

  const assignedNodeCount = domainByNode.size;
  return {
    domainCount: domainRows.size,
    nodeCount: nodes.length,
    assignedNodeCount,
    unassignedNodeCount: nodes.length - assignedNodeCount,
    crossDomainEdgeCount,
    selfDomainEdgeCount,
    domains: [...domainRows.values()].sort(
      (a, b) =>
        b.outgoing + b.incoming - (a.outgoing + a.incoming) ||
        b.nodeCount - a.nodeCount ||
        a.domain.title.localeCompare(b.domain.title),
    ),
    connections: [...connectionRows.values()]
      .map((row) => ({
        from: nodeById.get(row.from)!,
        to: nodeById.get(row.to)!,
        count: row.count,
        relationCounts: [...row.relationCounts.entries()]
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
        examples: row.examples,
      }))
      .sort((a, b) => b.count - a.count || a.from.title.localeCompare(b.from.title))
      .slice(0, limit),
  };
}

function buildContainmentParents(
  edges: readonly KnowledgeGraphEdge[],
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const edge of edges) {
    let parentId: string | undefined;
    let childId: string | undefined;
    if (edge.type === "contains") {
      parentId = edge.from;
      childId = edge.to;
    } else if (edge.type === "belongs_to") {
      parentId = edge.to;
      childId = edge.from;
    }
    if (!parentId || !childId) continue;
    if (!nodeById.has(parentId) || !nodeById.has(childId) || parentId === childId) continue;
    if (parentOf.has(childId)) continue;
    parentOf.set(childId, parentId);
  }
  return parentOf;
}

function nearestDomainId(
  node: KnowledgeGraphNode,
  parentOf: ReadonlyMap<string, string>,
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): string | null {
  if (node.kind === "domain") return node.id;
  const visited = new Set<string>([node.id]);
  let current = parentOf.get(node.id);
  while (current) {
    if (visited.has(current)) return null;
    visited.add(current);
    const parent = nodeById.get(current);
    if (!parent) return null;
    if (parent.kind === "domain") return parent.id;
    current = parentOf.get(current);
  }
  return null;
}

/**
 * 가장 최근 갱신된 N 노드 — `lastApprovedAt` 내림차순. 활동 feed 에 사용.
 * 같은 시각이면 title asc. document / project 도 포함 (활동의 한 면).
 *
 * 필드 이름은 v1 cloud LLM 워커 시점의 명명이지만, mission v2 에서는 단순
 * "마지막 쓰기 / 갱신 시각" — vault 모드는 sentinel 값이라 vault 노드끼리는 동률.
 */
export function selectRecentNodes(
  nodes: readonly KnowledgeGraphNode[],
  limit = 8,
): KnowledgeGraphNode[] {
  return [...nodes]
    .sort((a, b) => {
      const ta = a.lastApprovedAt.getTime();
      const tb = b.lastApprovedAt.getTime();
      if (tb !== ta) return tb - ta;
      return a.title.localeCompare(b.title);
    })
    .slice(0, limit);
}
