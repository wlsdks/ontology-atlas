import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildMeaningfulOntologyStats } from "@/shared/lib/ontology-tree";

export interface WorkspaceCensus {
  projectCount: number;
  domainCount: number;
  conceptCount: number;
  relationCount: number;
}

/**
 * Single formula for the /projects "census" numbers — the crumbs strip
 * (`{concepts} CONCEPTS · {relations} RELATIONS`) and the page header
 * censusline (`{project} project · {domains} domains · {concepts} concepts`)
 * both call this so the two never drift into two different counting rules.
 *
 * `conceptCount` reuses `buildMeaningfulOntologyStats` (domain/capability/
 * element/unknown — the same "meaningful unit" definition already shipped in
 * `WorkspaceOntologyStrip`). `relationCount` is the raw edge count — the
 * vault's whole relation graph, not scoped to a single project.
 */
export function computeWorkspaceCensus(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectCount: number,
): WorkspaceCensus {
  const stats = buildMeaningfulOntologyStats(nodes);
  return {
    projectCount,
    domainCount: stats.byKind.domain,
    conceptCount: stats.total,
    relationCount: edges.length,
  };
}
