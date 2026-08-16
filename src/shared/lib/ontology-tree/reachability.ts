import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

export type OntologyReachabilityDirection = "incoming" | "outgoing" | "both";

export interface OntologyReachabilityLayer {
  distance: number;
  total: number;
  nodes: KnowledgeGraphNode[];
}

export interface OntologyReachabilitySummary {
  reachableNodes: number;
  traversedEdges: number;
  layers: number;
  terminalNodes: number;
}

export interface OntologyReachability {
  startId: string;
  direction: OntologyReachabilityDirection;
  depth: number;
  limited: boolean;
  summary: OntologyReachabilitySummary;
  byKind: Record<string, number>;
  byRelation: Record<string, number>;
  layers: OntologyReachabilityLayer[];
  terminalNodes: KnowledgeGraphNode[];
}

export interface BuildOntologyReachabilityOptions {
  direction?: OntologyReachabilityDirection;
  depth?: number;
  limit?: number;
  types?: readonly string[];
  /** 관계 타입 제외 목록. 구조 탐색에서 특정 관계를 숨길 때만 사용한다. */
  excludeTypes?: readonly string[];
  /**
   * 미리 만들어 둔 색인 — **같은 그래프로 여러 번 부를 때만** 넘긴다.
   *
   * ## 왜 (2026-08-16 검수, 실측)
   *
   * 이 함수는 부를 때마다 `nodeById` 맵과 인접 목록을 **처음부터 다시** 만든다.
   * 한 번 부를 때는 옳은 설계인데(호출자가 아무것도 안 들고 있어도 된다),
   * 노드마다 한 번씩 부르는 자리가 있다 — 영향도 순위. 거기서는 N개 노드에
   * 대해 색인을 2N번 새로 만들었고, 실측한 비용의 **약 절반**이 그것이었다:
   *
   * | 노드 | 걸린 시간 |
   * |---:|---:|
   * | 500 | 132ms |
   * | 2,000 | 2.37s |
   * | 8,000 | 51.8s |
   *
   * 색인을 밖에서 한 번 만들어 넘기면 그 절반이 사라진다. **판정은 하나도 안
   * 바뀐다** — 같은 재료를 다시 만들지 않을 뿐이다.
   *
   * ⚠️ 색인은 `types`·`excludeTypes` 에 **묶여 있다.** 다른 필터로 만든 것을
   * 넘기면 조용히 다른 답이 나온다. 그래서 `buildReachabilityIndex` 가 그
   * 필터를 인자로 받고, 넘기는 쪽이 같은 값을 쓰게 한다.
   */
  index?: ReachabilityIndex;
}

/** 같은 그래프·같은 필터로 여러 번 훑을 때 재사용하는 색인. */
export interface ReachabilityIndex {
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>;
  adjacency: ReachabilityAdjacency;
}

/**
 * 색인을 한 번 만든다. 필터가 색인의 일부이므로 **쓸 때와 같은 값**을 준다.
 */
export function buildReachabilityIndex(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options: { types?: readonly string[]; excludeTypes?: readonly string[] } = {},
): ReachabilityIndex {
  const typeSet =
    Array.isArray(options.types) && options.types.length > 0 ? new Set(options.types) : null;
  const excludeSet =
    Array.isArray(options.excludeTypes) && options.excludeTypes.length > 0
      ? new Set(options.excludeTypes)
      : null;
  return {
    nodeById: new Map(nodes.map((node) => [node.id, node] as const)),
    adjacency: buildAdjacency(edges, typeSet, excludeSet),
  };
}

interface DiscoveredNode {
  id: string;
  distance: number;
}

interface TraversalCandidate {
  next: string;
  edge: KnowledgeGraphEdge;
}

interface ReachabilityAdjacency {
  incoming: Map<string, TraversalCandidate[]>;
  outgoing: Map<string, TraversalCandidate[]>;
}

const DEFAULT_DEPTH = 3;
const DEFAULT_LIMIT = 20;

export const IMPACT_RELATION_TYPES: readonly string[] = ['depends_on'];

/**
 * blast-radius "dependents" 단일 source — 이 노드를 (직접·간접) 의존으로 가진
 * 노드 수 = incoming `depends_on` 전이 closure. drawer(reach.dependents)
 * 와 변경점 diff(Self-Drawing Diff #2) 가 *이 함수* 를 호출해 **같은 수** 를 보장한다
 * (사람이 보는 수 == 에이전트 brief 의 수 — can't-drift graft).
 *
 * depth=노드 수면 사이클·긴 체인 모두 full closure(discovered set 중복 차단).
 * limit:1 — summary.reachableNodes 는 limit 무관 *전체* 카운트라 가시 layer 만 줄여
 * 할당 최소화.
 */
export function computeOntologyDependents(
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): number {
  return buildOntologyReachability(nodeId, nodes, edges, {
    direction: "incoming",
    depth: Math.max(nodes.length, 1),
    limit: 1,
    types: IMPACT_RELATION_TYPES,
  }).summary.reachableNodes;
}

export function buildOntologyReachability(
  startId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options: BuildOntologyReachabilityOptions = {},
): OntologyReachability {
  const direction = options.direction ?? "outgoing";
  const depth = clampNonNegativeInteger(options.depth, DEFAULT_DEPTH);
  const limit = clampPositiveInteger(options.limit, DEFAULT_LIMIT);
  const typeSet = Array.isArray(options.types) && options.types.length > 0
    ? new Set(options.types)
    : null;
  const excludeSet = Array.isArray(options.excludeTypes) && options.excludeTypes.length > 0
    ? new Set(options.excludeTypes)
    : null;
  const nodeById = options.index?.nodeById ?? new Map(nodes.map((node) => [node.id, node] as const));
  const adjacency = options.index?.adjacency ?? buildAdjacency(edges, typeSet, excludeSet);
  const discovered = new Map<string, DiscoveredNode>([
    [startId, { id: startId, distance: 0 }],
  ]);
  const queue: DiscoveredNode[] = [{ id: startId, distance: 0 }];
  // head pointer 로 dequeue O(1) — `Array.shift()` 는 O(n) 이라 큰 그래프에서
  // O(n²) 회귀 (depth.ts 와 동일 패턴).
  let head = 0;
  const traversedEdges = new Map<string, KnowledgeGraphEdge>();

  while (head < queue.length) {
    const current = queue[head++];
    if (current.distance >= depth) continue;
    for (const candidate of traversalCandidates(current.id, adjacency, direction)) {
      traversedEdges.set(candidate.edge.id, candidate.edge);
      if (discovered.has(candidate.next)) continue;
      const next = { id: candidate.next, distance: current.distance + 1 };
      discovered.set(candidate.next, next);
      queue.push(next);
    }
  }

  const allReachable = [...discovered.values()]
    .filter((row) => row.id !== startId && nodeById.has(row.id))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  const visibleReachable = allReachable.slice(0, limit);
  const visibleIds = new Set([startId, ...visibleReachable.map((row) => row.id)]);
  const visibleEdges = [...traversedEdges.values()]
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  const layers = groupLayers(visibleReachable, nodeById);
  const terminalNodes = visibleReachable
    .filter((row) => traversalCandidates(row.id, adjacency, direction).length === 0)
    .map((row) => nodeById.get(row.id))
    .filter((node): node is KnowledgeGraphNode => Boolean(node));

  return {
    startId,
    direction,
    depth,
    limited: allReachable.length > visibleReachable.length,
    summary: {
      reachableNodes: allReachable.length,
      traversedEdges: visibleEdges.length,
      layers: layers.length,
      terminalNodes: terminalNodes.length,
    },
    byKind: countBy(visibleReachable.map((row) => nodeById.get(row.id)?.kind).filter(isString)),
    byRelation: countBy(visibleEdges.map((edge) => edge.label ?? edge.type).filter(isString)),
    layers,
    terminalNodes,
  };
}

function buildAdjacency(
  edges: readonly KnowledgeGraphEdge[],
  typeSet: Set<string> | null,
  excludeSet: Set<string> | null,
): ReachabilityAdjacency {
  const adjacency: ReachabilityAdjacency = {
    incoming: new Map(),
    outgoing: new Map(),
  };
  for (const edge of edges) {
    if (typeSet && !typeSet.has(edge.type) && (!edge.label || !typeSet.has(edge.label))) continue;
    if (excludeSet && (excludeSet.has(edge.type) || (edge.label && excludeSet.has(edge.label)))) continue;
    if (edge.from !== edge.to) {
      addCandidate(adjacency.outgoing, edge.from, { next: edge.to, edge });
      addCandidate(adjacency.incoming, edge.to, { next: edge.from, edge });
    }
  }
  return adjacency;
}

function traversalCandidates(
  id: string,
  adjacency: ReachabilityAdjacency,
  direction: OntologyReachabilityDirection,
): TraversalCandidate[] {
  const candidates: TraversalCandidate[] = [];
  if (direction === "outgoing" || direction === "both") candidates.push(...(adjacency.outgoing.get(id) ?? []));
  if (direction === "incoming" || direction === "both") candidates.push(...(adjacency.incoming.get(id) ?? []));
  return candidates;
}

function addCandidate(
  adjacency: Map<string, TraversalCandidate[]>,
  id: string,
  candidate: TraversalCandidate,
): void {
  const list = adjacency.get(id) ?? [];
  list.push(candidate);
  adjacency.set(id, list);
}

function groupLayers(
  rows: readonly DiscoveredNode[],
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>,
): OntologyReachabilityLayer[] {
  const byDistance = new Map<number, KnowledgeGraphNode[]>();
  for (const row of rows) {
    const node = nodeById.get(row.id);
    if (!node) continue;
    const list = byDistance.get(row.distance) ?? [];
    list.push(node);
    byDistance.set(row.distance, list);
  }
  return [...byDistance.entries()]
    .sort(([left], [right]) => left - right)
    .map(([distance, layerNodes]) => ({
      distance,
      total: layerNodes.length,
      nodes: layerNodes.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

function countBy(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([, a], [, b]) => b - a));
}

function clampNonNegativeInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function clampPositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
