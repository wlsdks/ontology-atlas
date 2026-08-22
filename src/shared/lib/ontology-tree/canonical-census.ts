import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

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

export function computeCanonicalCensus(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): CanonicalCensus {
  return {
    conceptCount: nodes.filter((node) => node.kind !== 'vault-readme').length,
    relationCount: edges.length,
  };
}
