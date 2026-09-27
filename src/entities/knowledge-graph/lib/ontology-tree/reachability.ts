import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";

type OntologyReachabilityDirection = "incoming" | "outgoing" | "both";

interface OntologyReachabilityLayer {
  distance: number;
  total: number;
  nodes: KnowledgeGraphNode[];
}

interface OntologyReachabilitySummary {
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
  /** Relation types hidden from the walk. */
  excludeTypes?: readonly string[];
  /** A prebuilt index for repeated walks of one graph; it must match `types` and `excludeTypes`. */
  index?: ReachabilityIndex;
}

export interface ReachabilityIndex {
  nodeById: ReadonlyMap<string, KnowledgeGraphNode>;
  adjacency: ReachabilityAdjacency;
}

/** The filters are part of the index, so walk with the same values. */
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
 * Transitive incoming `depends_on` closure, shared by the drawer and changeset diff. `depth` = node
 * count reaches the full closure; `limit: 1` because the total ignores limit.
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
  const depth = nonNegativeIntegerOr(options.depth, DEFAULT_DEPTH);
  const limit = positiveIntegerOr(options.limit, DEFAULT_LIMIT);
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
  // BFS over adjacency lists, O(V + E); a head pointer keeps dequeue O(1) where `shift()` is O(n).
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

function nonNegativeIntegerOr(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function positiveIntegerOr(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
