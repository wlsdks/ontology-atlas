import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildContainmentParents, nearestDomainId } from "@/shared/lib/ontology-tree";

/** 탭1 히어로 "건강" 게이지 — insights-final.html 의 4 stats 전부 real 유도. */
export interface CensusHealthSummary {
  /** 개념당 관계 수 — `edges / nodes`, 소수 둘째 자리. `nodes` 가 0 이면 0. */
  edgesPerConcept: number;
  /** `buildOntologyTree` 의 orphans — containment 체인이 끊긴 노드 수. */
  orphanCount: number;
  /** 같은 트리 빌드의 `warnings` 중 cycle 감지 건수. */
  cycleCount: number;
  /** capability/element 중 domain 조상이 있는 비율 (0-100, 반올림). */
  domainMembershipPct: number;
  /** capability/element/domain 중 evidenceIds 가 있는 비율 (0-100, 반올림). */
  evidenceLinkedPct: number;
}

const CONTENT_KINDS = new Set(["domain", "capability", "element"]);

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * `insight.nodes`/`insight.edges` + 이미 만든 `treeResult` (orphans/warnings)
 * 로부터 히어로 "건강" 세그먼트 4 통계를 유도한다. 트리를 다시 빌드하지
 * 않도록 호출자가 만든 `treeResult` 를 그대로 받는다 — 페이지에서 이미
 * `buildOntologyTree` 를 한 번 호출하므로 중복 계산 회피.
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
