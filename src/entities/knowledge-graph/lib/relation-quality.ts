import type { KnowledgeGraphEdge } from "../model";

export interface RelationQualityBreakdown {
  strong: number;
  supported: number;
  weak: number;
  review: number;
}

export type RelationQuality = keyof RelationQualityBreakdown;

/**
 * Classifies one relation's evidence quality — `strong` (evidenced + structural
 * type) / `supported` (evidenced, any type) / `weak` (`related_to`, the loosest
 * relation type) / `review` (no evidence and no human approval yet). Single source
 * of truth for both the topology map's agent-readiness read
 * (`views/home/lib/topology-analysis.ts`) and the insights relations tab
 * (`views/ontology-insights`) — it lives in `entities/knowledge-graph` so neither
 * view has to cross-import the other's lib (FSD forbids views↔views).
 */
export function classifyRelationQuality(
  edge: Pick<KnowledgeGraphEdge, "type" | "evidenceIds" | "lastApprovedBy">,
): RelationQuality {
  if (edge.evidenceIds.length === 0 && edge.lastApprovedBy.trim().length === 0) {
    return "review";
  }
  if (edge.type === "related_to") return "weak";
  if (
    edge.evidenceIds.length > 0 &&
    ["contains", "belongs_to", "depends_on", "implements", "uses"].includes(edge.type)
  ) {
    return "strong";
  }
  return "supported";
}

/**
 * ready = handoff-ready without extra review (strong ∪ supported).
 *
 * `blockedDocuments` counts **documents, not relations** — documents whose
 * frontmatter failed validation. Measured 2026-08-04, a folder with five such errors
 * showed a readiness meter that was **100% indigo**: all three numbers counted only
 * edges, while a document that fails validation either never becomes a node or
 * collides on identity, so **an agent cannot use it**. Calling that readiness while
 * excluding it makes the loudest element on the screen say the opposite of the truth.
 *
 * So `blocked` folds into one thing — «what an agent cannot use right now»:
 * unevidenced relations (`review`) plus validation errors (`blockedDocuments`). Two
 * units are mixed, so the screen must always state the breakdown next to the total
 * (`DoNextTab`'s aria-label and hint). The existing `review` field stays: the map
 * (`topology-analysis`) deals only in relations, and folding them there would make
 * that surface false.
 */
export function summarizeAgentReadiness(
  counts: RelationQualityBreakdown,
  blockedDocuments = 0,
): {
  ready: number;
  preflight: number;
  review: number;
  blocked: number;
  blockedDocuments: number;
} {
  const documents = Math.max(0, blockedDocuments);
  return {
    ready: counts.strong + counts.supported,
    preflight: counts.weak,
    review: counts.review,
    blocked: counts.review + documents,
    blockedDocuments: documents,
  };
}
