import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import type { OntologyEgoNeighbor, OntologyEgoSubgraph } from "./types";

export interface BuildOntologyEgoOptions {
  /** 1 by default; 2 is opt-in because it can explode the node count. */
  hops?: 1 | 2;
}

/**
 * Ego subgraph: self-loops excluded, a two-way neighbor kept twice, a missing neighbor kept as
 * `node = null`. At 2 hops the nearer hop wins, edges back to center and stub pivots are skipped.
 * Rescans every edge per hop-1 neighbour: O(h·E) for h neighbours.
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
    // Self-loop.
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
    // 2-hop: from each real 1-hop neighbor.
    const seen2Hop = new Set<string>();
    for (const hop1 of [...hop1Outgoing, ...hop1Incoming]) {
      if (!hop1.node) continue;
      const pivotId = hop1.neighborId;
      for (const edge of edges) {
        const isOutFromPivot = edge.from === pivotId;
        const isInToPivot = edge.to === pivotId;
        if (!isOutFromPivot && !isInToPivot) continue;
        // Self-loop.
        if (isOutFromPivot && isInToPivot) continue;
        const farId = isOutFromPivot ? edge.to : edge.from;
        // Back to center.
        if (farId === centerId) continue;
        // Nearer hop wins.
        if (hop1NodeIds.has(farId)) continue;
        // Dedupe (pivot, far, edge).
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
