import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDegreeCentrality, computeDomainCensusRows } from "@/entities/knowledge-graph";

/** Every capability of the domain, since the row expands in place instead of saying "N more". */
export interface DomainCompositionRow {
  /** Node id such as `domain:views`, used verbatim in a map deep link. */
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
  /** Degree descending, ties by title; `id` makes each name a map deep link. */
  capabilities: { id: string; title: string }[];
}

export interface ProjectDomainComposition {
  domains: DomainCompositionRow[];
  maxTotal: number;
}

/**
 * Counts come from `computeDomainCensusRows`, the BFS the map INDEX, insights and `/projects` use,
 * or the surfaces disagree; this module owns only the degree ranking and row shape.
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

  const rows = computeDomainCensusRows(nodes, edges, ["domain"], { collectCapabilityIds: true });

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
        capabilityCount: row.capabilityCount,
        elementCount: row.elementCount,
        total: row.total,
        capabilities: capabilities.map((cap) => ({ id: cap.id, title: cap.display ?? cap.title })),
      };
    });

  composed.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  const maxTotal = composed.reduce((max, row) => Math.max(max, row.total), 0);

  return { domains: composed, maxTotal };
}
