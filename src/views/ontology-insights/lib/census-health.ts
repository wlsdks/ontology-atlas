import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildContainmentParents,
  computeKindDistribution,
  nearestDomainId,
  computeCanonicalCensus,
  type CanonicalCensus,
} from "@/entities/knowledge-graph";

/** The overview tab's health gauge, all four stats from real data. */
export interface CensusHealthSummary {
  /** The ratio `edges / nodes` to two decimals; zero when `nodes` is 0. */
  edgesPerConcept: number;
  /** Orphans from `buildOntologyTree`: nodes whose containment chain is broken. */
  orphanCount: number;
  /** Cycle detections among the `warnings` of the same tree build. */
  cycleCount: number;
  /** The share of capability/element nodes with a domain ancestor (0–100, rounded). */
  domainMembershipPct: number;
  /** The share of capability/element/domain nodes with `evidenceIds` (0–100, rounded). */
  evidenceLinkedPct: number;
}

const CONTENT_KINDS = new Set(["domain", "capability", "element"]);

export interface InsightsCensus extends CanonicalCensus {
  /** Concept-only kind rows; the reserved reader guide stays in Docs and never appears as a concept category. */
  kindDistribution: ReadonlyMap<string, number>;
}

/**
 * One derivation for the headline total and its kind rows, so the rows never sum above the total. Decision 93
 * keeps `vault-readme` as a Docs reader guide outside the concept census.
 */
export function computeInsightsCensus(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): InsightsCensus {
  const canonical = computeCanonicalCensus(nodes, edges);
  const kindDistribution = computeKindDistribution(nodes);
  kindDistribution.delete("vault-readme");
  return { ...canonical, kindDistribution };
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * The health gauge's four statistics from the nodes, edges and the caller's `treeResult`, so the tree is not
 * rebuilt.
 */
export function computeCensusHealth(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  tree: { orphans: readonly KnowledgeGraphNode[]; warnings: readonly string[] },
): CensusHealthSummary {
  const { conceptCount, relationCount } = computeCanonicalCensus(nodes, edges);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = buildContainmentParents(edges, nodeById);

  const contentNodes = nodes.filter((n) => CONTENT_KINDS.has(n.kind));
  const domainEligible = nodes.filter((n) => n.kind === "capability" || n.kind === "element");
  const withDomainAncestor = domainEligible.filter(
    (n) => nearestDomainId(n, parentOf, nodeById) !== null,
  );
  const withEvidence = contentNodes.filter((n) => n.evidenceIds.length > 0);

  return {
    edgesPerConcept:
      conceptCount > 0 ? Math.round((relationCount / conceptCount) * 100) / 100 : 0,
    orphanCount: tree.orphans.length,
    cycleCount: tree.warnings.filter((w) => w.startsWith("cycle detected")).length,
    domainMembershipPct: pct(withDomainAncestor.length, domainEligible.length),
    evidenceLinkedPct: pct(withEvidence.length, contentNodes.length),
  };
}
