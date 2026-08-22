import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyEgoNeighbor, OntologyEgoSubgraph } from "./types";

export interface BuildOntologyEgoOptions {
  /**
   * Traversal depth from the center: 1 = direct connections only (the default),
   * 2 = one hop further. 2-hop can explode the node count, so the caller opts in
   * explicitly.
   */
  hops?: 1 | 2;
}

/**
 * The ego subgraph around a center node — 1-hop (default) or 2-hop.
 *
 * - Self-loops (`from === to === centerId`) are excluded: the center is never its
 *   own neighbour.
 * - A bidirectional pair (the same node on both an outgoing and an incoming edge)
 *   yields two entries, because the user most likely wants to see the two
 *   relations as distinct.
 * - When a neighbour is absent from `nodes` (missing data, a stub about to be
 *   cleaned up) the entry keeps `node = null` and preserves `neighborId` so the UI
 *   can render an "ID only" state.
 *
 * 2-hop policy:
 * - A node already present at 1-hop is not added again at 2-hop — nearer hop wins,
 *   which also avoids drawing it twice.
 * - A 2-hop edge pointing back at the center is excluded (cycle).
 * - A 1-hop stub placeholder (`node === null`) is not used as a 2-hop pivot: with
 *   no real node there, from/to matching means nothing.
 *
 * Ordering: hop 1 (outgoing then incoming), then hop 2; within a group, the input
 * edge order.
 */
export function buildOntologyEgoSubgraph(
  centerId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options?: BuildOntologyEgoOptions,
): OntologyEgoSubgraph {
  const hops = options?.hops ?? 1;

  const nodeIndex = new Map<string, KnowledgeGraphNode>();
  for (const n of nodes) {
    nodeIndex.set(n.id, n);
  }

  const hop1Outgoing: OntologyEgoNeighbor[] = [];
  const hop1Incoming: OntologyEgoNeighbor[] = [];
  const hop1NodeIds = new Set<string>();

  for (const edge of edges) {
    const isOutgoing = edge.from === centerId;
    const isIncoming = edge.to === centerId;
    if (!isOutgoing && !isIncoming) continue;
    // Exclude self-loops — outgoing and incoming both true with identical endpoints.
    if (isOutgoing && isIncoming) continue;

    const neighborId = isOutgoing ? edge.to : edge.from;
    const node = nodeIndex.get(neighborId) ?? null;
    const direction: OntologyEgoNeighbor["direction"] = isOutgoing
      ? "outgoing"
      : "incoming";

    (isOutgoing ? hop1Outgoing : hop1Incoming).push({
      node,
      neighborId,
      edge,
      direction,
      hop: 1,
    });
    hop1NodeIds.add(neighborId);
  }

  const neighbors: OntologyEgoNeighbor[] = [...hop1Outgoing, ...hop1Incoming];

  if (hops === 2) {
    // 2-hop: BFS again from each 1-hop neighbour, skipping the center and hop-1 nodes.
    const seen2Hop = new Set<string>();
    for (const hop1 of [...hop1Outgoing, ...hop1Incoming]) {
      // A null (absent) node is never a 2-hop pivot.
      if (!hop1.node) continue;
      const pivotId = hop1.neighborId;
      for (const edge of edges) {
        const isOutFromPivot = edge.from === pivotId;
        const isInToPivot = edge.to === pivotId;
        if (!isOutFromPivot && !isInToPivot) continue;
        // Exclude self-loops.
        if (isOutFromPivot && isInToPivot) continue;
        const farId = isOutFromPivot ? edge.to : edge.from;
        // An edge pointing back at the center is a cycle; exclude it.
        if (farId === centerId) continue;
        // Nearer hop wins: a node already at 1-hop is not added at 2-hop.
        if (hop1NodeIds.has(farId)) continue;
        // Deduplicate the same (pivot, far, edge) combination within 2-hop.
        const dedupKey = `${pivotId}:${edge.id}:${farId}`;
        if (seen2Hop.has(dedupKey)) continue;
        seen2Hop.add(dedupKey);

        const farNode = nodeIndex.get(farId) ?? null;
        const direction: OntologyEgoNeighbor["direction"] = isOutFromPivot
          ? "outgoing"
          : "incoming";
        neighbors.push({
          node: farNode,
          neighborId: farId,
          edge,
          direction,
          hop: 2,
          viaNeighborId: pivotId,
        });
      }
    }
  }

  return {
    centerId,
    neighbors,
  };
}
