import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { TopologyOntologyDrawerModel } from "./topology-ontology-drawer";

/**
 * 컴팩트 노드 포커스(팝오버)용 단일 연결 행. ego(직접 이웃) 한 개.
 */
export interface TopologyNodeFocusConnection {
  id: string;
  title: string;
  kind: string;
  direction: "incoming" | "outgoing";
  relationType: string;
}

/**
 * 토폴로지 노드 클릭 시 노드 옆에 뜨는 *컴팩트* 팝오버의 view-model.
 *
 * 풀스크린 드로어(`TopologyOntologyDrawerModel`)의 *투영*이다 — 재계산 0,
 * 따라서 카운트/연결이 드로어와 drift 하지 않는다. 팝오버는 "그 노드 +
 * 연결된 것만" 을 보여주고, 전체 상세는 `전체 상세 →` opt-in 으로 둔다.
 * 설계 근거: `docs/TOPOLOGY-FOCUS-AND-SCALE.md`.
 */
export interface TopologyNodeFocusModel {
  id: string;
  title: string;
  kind: string;
  summary: string | null;
  sourceSlug: string | null;
  /** 직접 incoming — 평문 "이 노드를 쓰는 곳". */
  usedByCount: number;
  /** 직접 outgoing — 평문 "이 노드가 기대는 곳". */
  dependsOnCount: number;
  /** ego 직접 이웃(드로어 previewLimit 까지). */
  connections: TopologyNodeFocusConnection[];
  /** 표시 못 한 나머지 직접 연결 수 — "… +N". */
  hiddenConnectionCount: number;
}

export function buildTopologyNodeFocus(
  node: KnowledgeGraphNode,
  model: TopologyOntologyDrawerModel,
): TopologyNodeFocusModel {
  const totalDirect = model.incomingCount + model.outgoingCount;
  const connections: TopologyNodeFocusConnection[] = model.previewRelations.map(
    (relation) => ({
      id: relation.other?.id ?? relation.edge.id,
      title: relation.other?.title ?? relation.edge.id,
      kind: relation.other?.kind ?? "unknown",
      direction: relation.direction,
      relationType: relation.edge.type,
    }),
  );

  return {
    id: node.id,
    title: node.title,
    kind: node.kind,
    summary: node.summary ?? null,
    sourceSlug: model.sourceSlug,
    usedByCount: model.incomingCount,
    dependsOnCount: model.outgoingCount,
    connections,
    hiddenConnectionCount: Math.max(0, totalDirect - connections.length),
  };
}
