import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";

/** The single count behind every "N concepts, M relations"; a different scope needs a different word. */
export interface CanonicalCensus {
  conceptCount: number;
  relationCount: number;
}

/** Exported so any surface counting a subset of concepts starts from the same membership. */
export function isCanonicalConcept(node: Pick<KnowledgeGraphNode, 'kind'>): boolean {
  return node.kind !== 'vault-readme';
}

export function computeCanonicalCensus(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): CanonicalCensus {
  return {
    conceptCount: nodes.filter(isCanonicalConcept).length,
    relationCount: edges.length,
  };
}
