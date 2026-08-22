import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { countConnectedDocuments } from "@/shared/lib/ontology-tree";

export interface ProjectCardFacts {
  domain: number;
  capability: number;
  element: number;
  document: number;
  relations: number;
}

/**
 * Per-project fact strip counts for the /projects full-width card — domain /
 * capability / element / document node counts owned by `projectSlug`, plus
 * the relation count *induced between those owned nodes* (not the whole
 * vault's edge count — see `computeWorkspaceCensus` for the workspace-wide
 * figure).
 *
 * `singleProjectFallback` mirrors the pre-existing single-project vault
 * fallback (dogfood vaults rarely stamp `projectIds` on every node) — when
 * true, every non-project node is treated as owned by the lone project.
 */
export function buildProjectCardFacts(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
  singleProjectFallback: boolean,
): ProjectCardFacts {
  const owns = (node: KnowledgeGraphNode) =>
    singleProjectFallback
      ? node.kind !== "project"
      : node.projectIds.includes(projectSlug);

  const ownedIds = new Set<string>();
  const facts: ProjectCardFacts = {
    domain: 0,
    capability: 0,
    element: 0,
    document: 0,
    relations: 0,
  };

  for (const node of nodes) {
    if (!owns(node)) continue;
    ownedIds.add(node.id);
    if (node.kind === "domain") facts.domain += 1;
    else if (node.kind === "capability") facts.capability += 1;
    else if (node.kind === "element") facts.element += 1;
  }

  // A document sits outside containment stamping (by convention it is only linked through `relates`), so
  // `projectIds` would count it as zero forever. It uses the same shared one-hop rule as the detail page.
  facts.document = countConnectedDocuments(nodes, edges, ownedIds);

  for (const edge of edges) {
    if (ownedIds.has(edge.from) && ownedIds.has(edge.to)) facts.relations += 1;
  }

  return facts;
}
