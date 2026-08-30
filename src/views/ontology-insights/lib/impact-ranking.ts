import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isEvidenceOnlyConcept } from "@/entities/knowledge-graph";
import {
  IMPACT_RELATION_TYPES,
  buildOntologyReachability,
  buildReachabilityIndex,
} from "@/entities/knowledge-graph/lib/ontology-tree";

export interface ImpactRankingRow {
  id: string;
  title: string;
  kind: string;
  /** Directly connected — the number of concepts pointing straight at this one (1 hop). */
  direct: number;
  /** Direct plus indirect — the number of concepts to re-check if this one changes. */
  total: number;
  /** Is this a name written only as evidence (no document of its own)? Decides the layer. */
  evidenceOnly: boolean;
  /**
   * The reference string as written in the vault (`src/…/foo.test.ts`). Used only on evidence-layer
   * rows — it separates different files that collapse to the same human name
   * (`cli/src/integration.test.mjs` and `mcp/src/integration.test.mjs` are both "Integration Test").
   */
  ref?: string;
}

export interface ImpactRanking {
  /** The number of depends_on edges a person approved in the frontmatter. */
  declaredDependencyEdges: number;
  /** How many of those also carry a `relation_notes` rationale. */
  declaredWithRationaleEdges: number;
  /**
   * **The concept layer** — only concepts with their own `.md`. These are first-class citizens of
   * a decision screen, and the only layer where the risk question "what spreads furthest when
   * changed?" holds.
   */
  rows: ImpactRankingRow[];
  /** How many in the concept layer have a blast radius of at least 1 — the M in the "top N / M total" copy. */
  rankedCount: number;
  /**
   * **The evidence layer** — derived concepts whose names another document merely wrote into
   * `elements:` and the like. Pushed down rather than deleted: dense traceability is valuable to a
   * developer, and the "create a document" promotion path is visible only here.
   */
  evidenceRows: ImpactRankingRow[];
  /** How many in the evidence layer have at least one citation. */
  evidenceRankedCount: number;
}

/**
 * The "what breaks if I change this?" ranking — concepts ordered by how many concepts point at
 * them, directly and indirectly, descending.
 *
 * Rather than writing a new computation it calls `buildOntologyReachability` directly. Those
 * functions are the single source of truth for the semantics of MCP
 * `query_ontology({operation:"blast_radius", direction:"incoming"})` (reverse transitive
 * reachability, excluding soft associations), so the number the screen states and the number the
 * agent answers with cannot diverge — and if they do,
 * `tests/contract/impact-ranking.contract.test.ts` catches it.
 *
 * Only `depends_on` is included. Containment is valid for structural traversal but is not causal
 * evidence of change, so it does not enter the impact count.
 *
 * ## The layers split *after* the computation (2026-07-26)
 *
 * The blast radius is measured over **the whole graph**. Removing derived concepts from the graph
 * before measuring would give one concept different numbers on screen and from the agent, and at
 * that moment this card becomes noise rather than decision material. So the numbers are untouched
 * and **only the rows are split into two layers** — measured, the top 12 concept-layer numbers
 * were identical before and after the split.
 *
 * Why the same number needs two layers was this card's core defect. In the evidence layer, 15 does
 * not mean "risky to change" but "15 concepts cited this file as evidence", and if that is a test
 * file it is a signal of protection instead. The computation was right and the words were wrong,
 * so the per-layer copy was fixed rather than the computation (see the card's caption).
 */
export function buildImpactRanking(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  limit: number,
  /**
   * How many rows the evidence layer expands to.
   *
   * Four is measured (1512×950, dogfood vault, 289 concepts): at six rows the expanded
   * "connections" tab reached 1,151px (ko) and 1,200px (en), exceeding the scroll contract
   * (1,120px). Four rows fit as two lines in the two-column grid. The scale is stated verbatim by
   * the toggle label and the truncation copy, and the full list is answered by the map and the
   * CLI, so what is needed here is a sample of *what got demoted* — a demoted layer longer than
   * the original layer (12 rows) is not a demotion.
   */
  evidenceLimit = 4,
): ImpactRanking {
  const dependencyEdges = edges.filter((edge) => IMPACT_RELATION_TYPES.includes(edge.type));
  /*
   * Build the index **once** (reviewed and measured 2026-08-16).
   *
   * It used to walk the nodes twice, and each of those walks rebuilt the `nodeById` map and the
   * adjacency list from scratch — 2N index builds for N nodes. Measured: 500 nodes 132ms, 2,000
   * nodes **2.37s**, 8,000 nodes **51.8s**. The insights screen is one click away from the shell.
   *
   * The index is built with **the same filter** the two calls below use
   * (`IMPACT_RELATION_TYPES`, no exclusions) — a different filter would make it a different index.
   */
  const index = buildReachabilityIndex(nodes, edges, { types: IMPACT_RELATION_TYPES });
  const scored: ImpactRankingRow[] = [];
  for (const node of nodes) {
    const total = buildOntologyReachability(node.id, nodes, edges, {
      direction: "incoming",
      depth: Math.max(nodes.length, 1),
      limit: 1,
      types: IMPACT_RELATION_TYPES,
      index,
    }).summary.reachableNodes;
    if (total === 0) continue;
    // Same filter, same direction, with depth cut to 1 to get "directly connected" — counting the
    // adjacency list separately would let the two numbers follow different rules.
    const direct = buildOntologyReachability(node.id, nodes, edges, {
      direction: "incoming",
      depth: 1,
      limit: 1,
      types: IMPACT_RELATION_TYPES,
      index,
    }).summary.reachableNodes;
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
