import type { KnowledgeGraphEdge } from "../model";

export interface RelationQualityBreakdown {
  strong: number;
  supported: number;
  weak: number;
  review: number;
}

export type RelationQuality = keyof RelationQualityBreakdown;

/** `strong`, `supported`, `weak` (`related_to`) or `review`; shared by the map and the insights relations tab. */
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
 * `blocked` adds documents failing validation to unevidenced relations: both are unusable by an
 * agent. The units differ, so screens show the breakdown beside the total.
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
