/**
 * Full-detail A1 "reach = sentence instrument" — replaces the rejected
 * query-builder reach explorer (from/to/both direction × 1/2/3-step
 * segments) with ONE outward-only reach reading at a selectable step (1/2/3)
 * plus a per-domain breakdown ("대부분 X(a)와 Y(b)에 있다").
 *
 * Reuses the EXISTING reachability engine (`buildOntologyReachability`) —
 * ONE BFS to the max depth, then per-depth counts are derived from its
 * `layers` (cumulative sum of `distance <= depth`), not re-run per step.
 * Domain ownership per reachable node reuses `nearestDomainId` +
 * `buildContainmentParents` (shared/lib/ontology-tree/insights.ts) — the
 * same containment-tree walk `computeDomainCouplingMatrix` already uses, so
 * a node's "owning domain" can't drift between the two features.
 */
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildContainmentParents,
  buildOntologyReachability,
  nearestDomainId,
} from "@/shared/lib/ontology-tree";

export type FullDetailReachDepth = 1 | 2 | 3;

export interface FullDetailReachDomainRow {
  /** Domain node id, or `null` when no domain ancestor resolves (e.g. a
   * project/document node with no containing domain). */
  domainId: string | null;
  /** Domain node title, or `null` matching `domainId === null`. */
  domainTitle: string | null;
  count: number;
  /** Matches the start node's OWN domain — rendered as "도메인 내부". */
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

  // ONE BFS to depth 3 with an unlimited visible-layer cap — per-depth counts
  // and per-domain breakdowns both derive from these layers, no re-BFS.
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
