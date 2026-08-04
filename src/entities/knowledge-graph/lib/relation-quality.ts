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

/**
 * ready = handoff-ready without extra review (strong ∪ supported).
 *
 * `blockedDocuments` 는 **관계가 아니라 문서**의 수다 — frontmatter 검사에서
 * 오류가 난 문서. 이 인자가 있는 이유(2026-08-04 실측): 오류 5개짜리 폴더에서
 * 준비도 미터가 **100% 인디고**였다. 세 수치가 전부 엣지만 세고 있었기 때문인데,
 * 검사 오류가 난 문서는 애초에 노드가 되지 못하거나 정체성이 겹쳐서 **에이전트가
 * 쓸 수 없다**. 준비도라고 부르면서 그것을 빼면 화면에서 가장 강한 요소가
 * 반대로 말한다.
 *
 * 그래서 `blocked` 는 «지금 에이전트가 못 쓰는 것» 하나로 합친다 — 근거 없는
 * 관계(`review`)와 검사 오류(`blockedDocuments`). 두 단위가 섞이므로 화면은
 * 합계 옆에 반드시 내역을 함께 말해야 한다(`DoNextTab` 의 aria-label · 힌트).
 * 기존 `review` 필드는 그대로 남는다 — 지도(`topology-analysis`)는 관계만
 * 다루는 자리라 합치면 그쪽이 거짓이 된다.
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
