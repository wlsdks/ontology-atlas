import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";

/**
 * The canonical count — the single source for every surface that says "N concepts,
 * M relations".
 *
 * Measured 2026-07-21: for one and the same vault, the map said 294, insights 293,
 * projects 288, and the builder 102. Broken down:
 * - Map: `renderProjects.length + insight.nodes.length` — `insight.nodes` already
 *   contains kind:project, so this **double-counted** (+1).
 * - Insights: `insight.nodes.length` — honest (the whole derivation = source nodes
 *   plus reference stubs).
 * - Projects: filtered to meaningful kinds (project/document/vault-readme excluded).
 * - Builder: file-based (vault documents carrying a `kind:`, stubs excluded).
 *
 * Rule: every count that uses the word "concept" goes through this function. A
 * surface counting a different scope (the builder's saved-document count, say) gets
 * an honest label that is not "concepts". Numbers disagreeing across surfaces cuts
 * directly into trust in a graph product, which is why this function exists.
 */
export interface CanonicalCensus {
  conceptCount: number;
  relationCount: number;
}

/**
 * Whether this node is one of the concepts the census counts.
 *
 * Exported because the rule above is about the **word**, not about this one function: a surface
 * that counts a subset of the same nodes and still says "concept" has to start from the same
 * membership. The analysis brief did not, and its card read 124 beside a strip reading 125 on the
 * same screen, one click apart, because it left the project node out (walkthrough, 2026-09-20).
 */
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
