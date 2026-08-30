import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDegreeCentrality, computeDomainCensusRows } from "@/entities/knowledge-graph";

/**
 * One **row** of data for the project detail's "domain composition".
 *
 * `capabilities` holds **every** capability belonging to this domain (directly or nested), ordered by
 * degree descending — so the order means "what the graph references and connects most comes first"
 * rather than insertion order.
 *
 * **Why all of them rather than the top 2 plus "N more"** (2026-08-12, option B). The old card drew the
 * top 2 and counted the rest in a footer line reading "N more capabilities". That line was **a number
 * with nowhere to go** — it could be neither pressed nor expanded, so seeing those N meant leaving for
 * the map. A row that expands in place shows the whole list, so the footer line disappears and there is
 * no longer any need to explain the "top 2" criterion (most connected — which was never written on
 * screen anyway).
 */
export interface DomainCompositionRow {
  /** The ontology node id (e.g. `domain:views`) — used verbatim in a topology focus deep-link. */
  id: string;
  title: string;
  capabilityCount: number;
  elementCount: number;
  total: number;
  /**
   * Degree descending, ties by title ascending. The short display title (`display`) wins.
   * `id` is the graph node id (e.g. `capability:pay`) — used to make the name a map deeplink
   * (2026-08-13: while only titles were carried, the expanded list was dead-end text — the same
   * "number with nowhere to go" defect option B removed, surviving in the names).
   */
  capabilities: { id: string; title: string }[];
}

export interface ProjectDomainComposition {
  domains: DomainCompositionRow[];
  maxTotal: number;
}

/**
 * Composition rows for the domain nodes belonging to a project. The counts used to come from
 * `nearestDomainId` (a one-domain-per-node rollup) and disagreed with the single-source BFS
 * (`computeDomainCensusRows`) used by the map INDEX, insights, and `/projects` on four surfaces — it now
 * uses the same BFS, and this module owns only the capability ranking (degree) and the row shape.
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
        // The capability name uses the short display title too.
        capabilities: capabilities.map((cap) => ({ id: cap.id, title: cap.display ?? cap.title })),
      };
    });

  composed.sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  const maxTotal = composed.reduce((max, row) => Math.max(max, row.total), 0);

  return { domains: composed, maxTotal };
}
