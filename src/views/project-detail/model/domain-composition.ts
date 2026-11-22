import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDegreeCentrality, computeDomainCensusRows } from "@/entities/knowledge-graph";
import { compactOntologyDescription } from "@/shared/lib/concept-display/ontology-description";

const DOMAIN_DEFINITION_MAX_CHARS = 240;

interface DomainCapability {
  id: string;
  title: string;
  elementCount: number;
}

export interface DomainCompositionRow {
  id: string;
  title: string;
  definition: string | null;
  capabilityCount: number;
  elementCount: number;
  total: number;
  /** Degree descending, ties by title; `id` makes each name a map deep link. */
  capabilities: DomainCapability[];
}

export interface ProjectDomainComposition {
  domains: DomainCompositionRow[];
  maxTotal: number;
}

/**
 * Counts come from `computeDomainCensusRows`, the census the map INDEX, insights and `/projects`
 * use, or the surfaces disagree; this module owns only the ranking and the row shape.
 */
export function buildProjectDomainComposition(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  projectSlug: string,
): ProjectDomainComposition {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const degrees = computeDegreeCentrality(nodes, edges);

  const projectDomainIds = new Set(
    nodes
      .filter((node) => node.kind === "domain" && node.projectIds.includes(projectSlug))
      .map((domain) => domain.id),
  );
  if (projectDomainIds.size === 0) return { domains: [], maxTotal: 0 };

  const rows = computeDomainCensusRows(nodes, edges, ["domain"], { collectCapabilityIds: true });
  const elementsByCapability = new Map(
    computeDomainCensusRows(nodes, edges, ["capability"]).map((row) => [row.id, row.elementCount] as const),
  );

  const composed: DomainCompositionRow[] = rows
    .filter((row) => projectDomainIds.has(row.id))
    .map((row) => {
      const capabilities = (row.capabilityIds ?? [])
        .map((id) => nodeById.get(id))
        .filter((node): node is KnowledgeGraphNode => node !== undefined)
        .sort((a, b) => {
          const degreeDiff = (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0);
          if (degreeDiff !== 0) return degreeDiff;
          return a.title.localeCompare(b.title);
        });
      return {
        id: row.id,
        title: row.title,
        definition: compactOntologyDescription(nodeById.get(row.id)?.summary, DOMAIN_DEFINITION_MAX_CHARS) ?? null,
        capabilityCount: row.capabilityCount,
        elementCount: row.elementCount,
        total: row.total,
        capabilities: capabilities.map((cap) => ({
          id: cap.id,
          title: cap.display ?? cap.title,
          elementCount: elementsByCapability.get(cap.id) ?? 0,
        })),
      };
    });

  composed.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  const maxTotal = composed.reduce((max, row) => Math.max(max, row.total), 0);

  return { domains: composed, maxTotal };
}
