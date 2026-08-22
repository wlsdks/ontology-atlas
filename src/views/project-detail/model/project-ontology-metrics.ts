import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { countConnectedDocuments } from "@/shared/lib/ontology-tree";

/**
 * The real counts behind the engraved metric strip in the project detail's hero band (domains,
 * capabilities, elements, documents, relations). `KnowledgeGraphNode.projectIds` is already filled by the
 * BFS containment walk (`derivationToInsight`), so this only filters and counts — no fabrication, just
 * the vault frontmatter.
 *
 * `KnowledgeGraphEdge` does not carry projectIds (see `derivationToInsight` — an edge always has an
 * empty array). The "relations" count is therefore decided not by the edge itself but by whether both
 * endpoints belong to this project — so it counts only the project's internal containment and behaviour
 * structure, and `relates` edges spanning to another project are (deliberately) excluded.
 */
export interface ProjectOntologyMetrics {
  domains: number;
  capabilities: number;
  elements: number;
  documents: number;
  relations: number;
}

export function buildProjectOntologyMetrics(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
): ProjectOntologyMetrics {
  const metrics: ProjectOntologyMetrics = {
    domains: 0,
    capabilities: 0,
    elements: 0,
    documents: 0,
    relations: 0,
  };
  const projectNodeIds = new Set<string>();

  for (const node of nodes) {
    if (!node.projectIds.includes(projectSlug)) continue;
    projectNodeIds.add(node.id);
    switch (node.kind) {
      case "domain":
        metrics.domains += 1;
        break;
      case "capability":
        metrics.capabilities += 1;
        break;
      case "element":
        metrics.elements += 1;
        break;
      case "document":
        // `countConnectedDocuments` below counts membership inclusion in one pass.
        break;
      default:
        break;
    }
  }

  // The document count uses the same shared one-hop connection rule (`countConnectedDocuments`) as the
  // `/projects` cards. Two copies of the rule reproduce adjacent-surface contradictions like
  // "0 documents vs 3".
  metrics.documents = countConnectedDocuments(nodes, edges, projectNodeIds);

  for (const edge of edges) {
    if (projectNodeIds.has(edge.from) && projectNodeIds.has(edge.to)) {
      metrics.relations += 1;
    }
  }

  return metrics;
}
