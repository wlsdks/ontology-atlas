import {
  buildOntologyReachability,
  computeOntologyDependents,
  IMPACT_RELATION_TYPES,
} from "@/shared/lib/ontology-tree";
import {
  classifyTopologyRelationQuality,
  type TopologyRelationQualityBreakdown,
} from "./topology-analysis";
import {
  resolveNodeDocument,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

/**
 * The shared "node facts" model behind the compact canvas popover
 * (`topology-node-focus.ts`) and the plain-language significance line
 * (`topology-node-significance.ts`) — direct relations, transitive reach,
 * owning domain. `buildTopologyNodeFocus`/`buildNodeSignificance` are
 * PROJECTIONS of this model (zero recompute, so counts can't drift).
 *
 * R+ full-detail A1: this module used to ALSO back `TopologyOntologyDrawer`
 * (the rejected badge-soup full-detail surface — rich "collaborator brief"
 * markdown export, vocabulary review, MCP/CLI check-string formatters, an
 * `impactSummary`/`collaborator` field pair feeding a Meaning/Connections/
 * checks tab sidebar). That surface + its format* functions were deleted
 * (`full-detail-a1` widget replaces it); this file kept only what the
 * SURVIVING consumers (focus popover + significance line + HomePage's
 * relation-provenance classification) still read.
 */

export interface TopologyOntologyDrawerRelation {
  edge: KnowledgeGraphEdge;
  other: KnowledgeGraphNode | null;
  direction: "incoming" | "outgoing";
  provenance: TopologyRelationProvenance;
}

export type TopologyRelationProvenance =
  | "source_backed"
  | "authored"
  | "needs_review";

export interface TopologyOntologyDrawerReach {
  /**
   * 전이 incoming closure — 이 노드를 (직접·간접) 의존으로 가진 노드 수.
   * = "이 노드를 바꾸면 영향받는 노드" = 변경 영향 범위(blast radius).
   * CLI `blast-radius --direction incoming` 와 같은 방향 semantics.
   */
  dependents: number;
  /**
   * 전이 outgoing closure — 이 노드가 (직접·간접) 의존하는 노드 수.
   */
  dependencies: number;
}

export interface TopologyOntologyDrawerModel {
  sourceSlug: string | null;
  /**
   * `sourceSlug` 가 **이 노드 자신의 `.md`** 일 때만 채워진다. 관계에서만
   * 이름이 불린 파생 노드는 null — 그 노드의 `sourceSlug` 는 자기를 인용한
   * 남의 문서라 "이 노드의 문서" 로 열면 거짓말이 된다.
   */
  ownDocumentSlug: string | null;
  /**
   * 자기 문서가 없는 노드를 **적어 둔 다른 문서**. 자기 문서가 있으면 null.
   * 정보를 없애지 않으면서 라벨만 정직하게 만들기 위한 짝 필드.
   */
  mentionedInSlug: string | null;
  /**
   * 이 노드를 소유한 domain 노드(있으면). 비즈니스 영역 context 를 read-only
   * 로 노출. incoming 엣지 중 source 가 kind:domain 인 첫 노드(보통 contains
   * 관계).
   */
  ownerDomain: { id: string; title: string } | null;
  incomingCount: number;
  outgoingCount: number;
  relationCounts: Array<{ type: string; count: number }>;
  provenanceCounts: Array<{ provenance: TopologyRelationProvenance; count: number }>;
  relationQuality: TopologyRelationQualityBreakdown;
  previewRelations: TopologyOntologyDrawerRelation[];
  /**
   * 1-hop degree(`incomingCount`/`outgoingCount`)가 과소평가하는 *전이* 영향
   * 범위. graph-DB 의 reachability 질의를 노드 detail 에 바로 노출 — 사람은
   * "이거 바꾸면 N개 영향" 을 한눈에, 에이전트는 brief 로 같은 값을 받는다.
   */
  reach: TopologyOntologyDrawerReach;
}

export function buildTopologyOntologyDrawerModel(
  node: KnowledgeGraphNode,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  previewLimit = 5,
): TopologyOntologyDrawerModel {
  const nodeById = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const incoming = edges.filter((edge) => edge.to === node.id);
  const outgoing = edges.filter((edge) => edge.from === node.id);
  const relationTypeCounts = new Map<string, number>();
  const provenanceCounts = new Map<TopologyRelationProvenance, number>();
  const relationQuality: TopologyRelationQualityBreakdown = {
    strong: 0,
    supported: 0,
    weak: 0,
    review: 0,
  };

  for (const edge of [...incoming, ...outgoing]) {
    relationTypeCounts.set(edge.type, (relationTypeCounts.get(edge.type) ?? 0) + 1);
    const provenance = classifyTopologyRelationProvenance(edge);
    provenanceCounts.set(provenance, (provenanceCounts.get(provenance) ?? 0) + 1);
    relationQuality[classifyTopologyRelationQuality(edge)] += 1;
  }

  const previewRelations: TopologyOntologyDrawerRelation[] = [
    ...outgoing.map((edge) => ({
      edge,
      other: nodeById.get(edge.to) ?? null,
      direction: "outgoing" as const,
      provenance: classifyTopologyRelationProvenance(edge),
    })),
    ...incoming.map((edge) => ({
      edge,
      other: nodeById.get(edge.from) ?? null,
      direction: "incoming" as const,
      provenance: classifyTopologyRelationProvenance(edge),
    })),
  ].slice(0, Math.max(0, previewLimit));

  // 전이 reach — 기존 reachability 엔진 재사용(새 BFS 0). depth = 노드 수면
  // 사이클·긴 체인 모두 full closure 보장(discovered set 이 중복 차단).
  // limit:1 — summary.reachableNodes 는 limit 과 무관하게 *전체* 카운트라
  // 가시 layer 만 1개로 줄여 할당 최소화.
  // depends_on만 인과 영향이다. containment/domain/element는 구조 탐색에서만
  // 사용하고 Affected/Dependencies 숫자에는 섞지 않는다.
  const fullDepth = Math.max(nodes.length, 1);
  const reach: TopologyOntologyDrawerReach = {
    // dependents 는 shared computeOntologyDependents 단일 source — 변경점 diff
    // (Self-Drawing Diff #2)가 같은 함수를 호출해 같은 수를 보장(can't drift).
    dependents: computeOntologyDependents(node.id, nodes, edges),
    dependencies: buildOntologyReachability(node.id, nodes, edges, {
      direction: "outgoing",
      depth: fullDepth,
      limit: 1,
      types: IMPACT_RELATION_TYPES,
    }).summary.reachableNodes,
  };

  // 소유 domain — incoming 엣지의 source 중 kind:domain 첫 노드. domain 은
  // 보통 자식을 contains 하므로 (domain → node) incoming 에서 찾는다.
  //
  // P1-③ (retention-round-2026-07-21) — domain / project 노드 자신은 다른
  // 도메인에 "소속" 되지 않는다. 도메인의 부모는 프로젝트지 다른 도메인이
  // 아니다. 그런데 도메인 간 cross-relation(relates 등)의 incoming 을 그대로
  // 집으면 "도메인 · <다른 도메인>" 같은 오귀속이 나온다(데이터시트 헤더 +
  // 인계 패킷 `domain:` 필드까지 오염). 정직하게 domain/project 는 도메인
  // 소속을 표기하지 않는다(null → UI 가 해당 줄 생략).
  let ownerDomain: { id: string; title: string } | null = null;
  const canBelongToDomain = node.kind !== "domain" && node.kind !== "project";
  if (canBelongToDomain) {
    for (const e of incoming) {
      const src = nodeById.get(e.from);
      if (src && src.kind === "domain") {
        ownerDomain = { id: src.id, title: src.display ?? src.title };
        break;
      }
    }
  }

  const document = resolveNodeDocument(node);

  return {
    sourceSlug: node.evidenceIds[0] ?? null,
    ownDocumentSlug: document.ownSlug,
    mentionedInSlug: document.mentionedInSlug,
    ownerDomain,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    relationCounts: Array.from(relationTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    provenanceCounts: Array.from(provenanceCounts.entries())
      .map(([provenance, count]) => ({ provenance, count }))
      .sort(
        (a, b) =>
          provenanceRank(a.provenance) - provenanceRank(b.provenance) ||
          b.count - a.count,
      ),
    relationQuality,
    previewRelations,
    reach,
  };
}

export function classifyTopologyRelationProvenance(
  edge: Pick<KnowledgeGraphEdge, "evidenceIds" | "lastApprovedBy">,
): TopologyRelationProvenance {
  if (edge.evidenceIds.length > 0) return "source_backed";
  if (edge.lastApprovedBy.trim().length > 0) return "authored";
  return "needs_review";
}

function provenanceRank(provenance: TopologyRelationProvenance): number {
  if (provenance === "source_backed") return 0;
  if (provenance === "authored") return 1;
  return 2;
}
