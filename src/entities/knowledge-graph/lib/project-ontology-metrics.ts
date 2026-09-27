import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../model/types";
import { countConnectedDocuments } from "./ontology-tree/domain-census";

/**
 * Counts for the project hero band from `projectIds`. Edges carry no projectIds, so a relation counts
 * when both endpoints are in the project; cross-project `relates` are excluded.
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
        break;
      default:
        break;
    }
  }

  // Documents use the shared one-hop rule, as the `/projects` cards do.
  metrics.documents = countConnectedDocuments(nodes, edges, projectNodeIds);

  for (const edge of edges) {
    if (projectNodeIds.has(edge.from) && projectNodeIds.has(edge.to)) {
      metrics.relations += 1;
    }
  }

  return metrics;
}
