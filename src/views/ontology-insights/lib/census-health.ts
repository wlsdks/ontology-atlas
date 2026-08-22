import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildContainmentParents, nearestDomainId } from "@/shared/lib/ontology-tree";

/** The overview tab's hero "health" gauge — all four stats derived from real data. */
export interface CensusHealthSummary {
  /** Relations per concept — `edges / nodes` to two decimal places. Zero when `nodes` is 0. */
  edgesPerConcept: number;
  /** `buildOntologyTree`'s orphans — nodes whose containment chain is broken. */
  orphanCount: number;
  /** Cycle detections among the `warnings` of the same tree build. */
  cycleCount: number;
  /** The share of capability/element nodes with a domain ancestor (0–100, rounded). */
  domainMembershipPct: number;
  /** The share of capability/element/domain nodes with `evidenceIds` (0–100, rounded). */
  evidenceLinkedPct: number;
}

const CONTENT_KINDS = new Set(["domain", "capability", "element"]);

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * Derives the hero "health" segment's four statistics from `insight.nodes`/`insight.edges` plus the
 * already-built `treeResult` (orphans and warnings). It takes the caller's `treeResult` rather than
 * rebuilding the tree — the page already calls `buildOntologyTree` once, so this avoids duplicating
 * that computation.
 */
export function computeCensusHealth(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  tree: { orphans: readonly KnowledgeGraphNode[]; warnings: readonly string[] },
): CensusHealthSummary {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = buildContainmentParents(edges, nodeById);

  const contentNodes = nodes.filter((n) => CONTENT_KINDS.has(n.kind));
  const domainEligible = nodes.filter((n) => n.kind === "capability" || n.kind === "element");
  const withDomainAncestor = domainEligible.filter(
    (n) => nearestDomainId(n, parentOf, nodeById) !== null,
  );
  const withEvidence = contentNodes.filter((n) => n.evidenceIds.length > 0);

  return {
    edgesPerConcept: nodes.length > 0 ? Math.round((edges.length / nodes.length) * 100) / 100 : 0,
    orphanCount: tree.orphans.length,
    cycleCount: tree.warnings.filter((w) => w.startsWith("cycle detected")).length,
    domainMembershipPct: pct(withDomainAncestor.length, domainEligible.length),
    evidenceLinkedPct: pct(withEvidence.length, contentNodes.length),
  };
}
