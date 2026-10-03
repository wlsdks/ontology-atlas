import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  isEvidenceOnlyConcept,
  IMPACT_RELATION_TYPES,
  buildReachabilityIndex,
} from "@/entities/knowledge-graph";

export interface ImpactRankingRow {
  id: string;
  title: string;
  kind: string;
  /** Concepts pointing straight at this one (1 hop). */
  direct: number;
  /** Direct plus indirect: the concepts to re-check if this one changes. */
  total: number;
  /** A name written only as evidence (no document of its own); decides the layer. */
  evidenceOnly: boolean;
  /**
   * The reference as written in the vault, on evidence rows only, to tell apart files with the same human name
   * (`cli/src/integration.test.mjs` and `mcp/src/integration.test.mjs`).
   */
  ref?: string;
}

export interface ImpactRanking {
  /** Approved depends_on edges in the frontmatter. */
  declaredDependencyEdges: number;
  /** Of those, how many carry a `relation_notes` rationale. */
  declaredWithRationaleEdges: number;
  /** The concept layer: only concepts with their own `.md`, where the risk question holds. */
  rows: ImpactRankingRow[];
  /** Concept-layer entries with a blast radius of at least 1, the M in "top N / M total". */
  rankedCount: number;
  /**
   * The evidence layer: derived names another document wrote into `elements:` and the like. Kept below for
   * traceability and because the "create a document" promotion path shows only here.
   */
  evidenceRows: ImpactRankingRow[];
  /** Evidence-layer entries with at least one citation. */
  evidenceRankedCount: number;
}

/**
 * Incoming `depends_on` counts match MCP `blast_radius` (`tests/contract/impact-ranking.contract.test.ts`).
 * One bounded BFS per node over a shared index: O(N x (N + E)). Evidence splits only after counting.
 */
export function buildImpactRanking(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit: number,
  /**
   * Rows the evidence layer expands to. Measured at 1512x950 (dogfood, 289 concepts): six rows pushed the connections
   * tab past the scroll contract; four fit as two lines in the two-column grid.
   */
  evidenceLimit = 4,
): ImpactRanking {
  const dependencyEdges = edges.filter((edge) => IMPACT_RELATION_TYPES.includes(edge.type));
  const index = buildReachabilityIndex(nodes, edges, { types: IMPACT_RELATION_TYPES });
  const scored: ImpactRankingRow[] = [];
  for (const node of nodes) {
    const { total, direct } = countDependents(node.id, index, Math.max(nodes.length, 1));
    if (total === 0) continue;
    scored.push({
      id: node.id,
      title: node.display ?? node.title,
      kind: node.kind,
      direct,
      total,
      evidenceOnly: isEvidenceOnlyConcept(node),
      ref: node.ref,
    });
  }

  scored.sort(
    (a, b) => b.total - a.total || b.direct - a.direct || a.title.localeCompare(b.title),
  );

  const concepts = scored.filter((row) => !row.evidenceOnly);
  const evidence = scored.filter((row) => row.evidenceOnly);

  return {
    declaredDependencyEdges: dependencyEdges.length,
    declaredWithRationaleEdges: dependencyEdges.filter(
      (edge) => typeof edge.label === "string" && edge.label.trim().length > 0,
    ).length,
    rows: concepts.slice(0, Math.max(0, limit)),
    rankedCount: concepts.length,
    evidenceRows: evidence.slice(0, Math.max(0, evidenceLimit)),
    evidenceRankedCount: evidence.length,
  };
}

// Preserve the bounded incoming walk, including unresolved intermediates, without constructing display layers.
function countDependents(startId: string, index: ReturnType<typeof buildReachabilityIndex>, maxDepth: number) {
  const seen = new Set([startId]);
  const queue = [startId];
  let head = 0;
  let total = 0;
  let direct = 0;
  for (let depth = 0; depth < maxDepth && head < queue.length; depth += 1) {
    const end = queue.length;
    while (head < end) {
      for (const { next } of index.adjacency.incoming.get(queue[head++]) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
        if (index.nodeById.has(next)) {
          total += 1;
          if (depth === 0) direct += 1;
        }
      }
    }
  }
  return { total, direct };
}
