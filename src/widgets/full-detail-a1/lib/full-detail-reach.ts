/**
 * Outward reach at a selectable step (1-3) with a per-domain breakdown. One BFS to the max depth
 * through `buildOntologyReachability`, per-depth counts from its layers; domain ownership via
 * `nearestDomainId` and `buildContainmentParents`, shared with `computeDomainCouplingMatrix`.
 */
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildContainmentParents,
  buildOntologyReachability,
  nearestDomainId,
} from "@/entities/knowledge-graph";

export type FullDetailReachDepth = 1 | 2 | 3;

export interface FullDetailReachDomainRow {
  /** Domain node id, or `null` when no domain ancestor resolves (e.g. a
   * project/document node with no containing domain). */
  domainId: string | null;
  /** Domain node title, or `null` matching `domainId === null`. */
  domainTitle: string | null;
  count: number;
  /** Matches the start node's OWN domain — rendered as "inside domain". */
  isSelf: boolean;
}

export interface FullDetailReachAtDepth {
  depth: FullDetailReachDepth;
  reachableCount: number;
  /** Sorted desc by count; ties broken by domainTitle. */
  domainRows: FullDetailReachDomainRow[];
}

export interface FullDetailReachModel {
  /** Whole-graph node count — the sentence's "N / total" denominator. */
  totalNodes: number;
  byDepth: Record<FullDetailReachDepth, FullDetailReachAtDepth>;
}

const ALL_DEPTHS: readonly FullDetailReachDepth[] = [1, 2, 3];

export function buildFullDetailReachModel(
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): FullDetailReachModel {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const parentOf = buildContainmentParents(edges, nodeById);
  const startNode = nodeById.get(nodeId);
  const selfDomainId = startNode ? nearestDomainId(startNode, parentOf, nodeById) : null;

  // One BFS to depth 3 with no layer cap; per-depth counts and domain breakdowns derive from its
  // layers.
  const reachability = buildOntologyReachability(nodeId, nodes, edges, {
    direction: "outgoing",
    depth: 3,
    limit: Math.max(nodes.length, 1),
  });

  const domainCache = new Map<string, string | null>();
  const resolveDomain = (id: string): string | null => {
    if (domainCache.has(id)) return domainCache.get(id) ?? null;
    const n = nodeById.get(id);
    const domainId = n ? nearestDomainId(n, parentOf, nodeById) : null;
    domainCache.set(id, domainId);
    return domainId;
  };

  const byDepth = {} as Record<FullDetailReachDepth, FullDetailReachAtDepth>;
  for (const depth of ALL_DEPTHS) {
    const layerNodes = reachability.layers
      .filter((layer) => layer.distance <= depth)
      .flatMap((layer) => layer.nodes);

    const counts = new Map<string | null, number>();
    for (const n of layerNodes) {
      const domainId = resolveDomain(n.id);
      counts.set(domainId, (counts.get(domainId) ?? 0) + 1);
    }

    const domainRows: FullDetailReachDomainRow[] = Array.from(counts.entries())
      .map(([domainId, count]) => ({
        domainId,
        domainTitle: domainId
          ? (nodeById.get(domainId)?.display ?? nodeById.get(domainId)?.title ?? null)
          : null,
        count,
        isSelf: domainId !== null && domainId === selfDomainId,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return (a.domainTitle ?? "").localeCompare(b.domainTitle ?? "");
      });

    byDepth[depth] = { depth, reachableCount: layerNodes.length, domainRows };
  }

  return { totalNodes: nodes.length, byDepth };
}
