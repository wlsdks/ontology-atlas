import type { KnowledgeGraphEdge } from "../model";

export interface RelationQualityBreakdown {
  strong: number;
  supported: number;
  weak: number;
  review: number;
}

export type RelationQuality = keyof RelationQualityBreakdown;

/**
 * Classifies one relation's evidence quality — `strong` (evidenced +
 * structural type) / `supported` (evidenced, any type) / `weak`
 * (`related_to`, the loosest relation type) / `review` (no evidence and no
 * human approval yet). Single source of truth for both the topology map's
 * agent-readiness read (`views/home/lib/topology-analysis.ts`) and the
 * insights relations tab (`views/ontology-insights`) — moved down to
 * `entities/knowledge-graph` (W3 분석 보기 은퇴) so neither view has to
 * cross-import the other's lib (FSD forbids views↔views).
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

/** ready = handoff-ready without extra review (strong ∪ supported). */
export function summarizeAgentReadiness(counts: RelationQualityBreakdown): {
  ready: number;
  preflight: number;
  review: number;
} {
  return {
    ready: counts.strong + counts.supported,
    preflight: counts.weak,
    review: counts.review,
  };
}
