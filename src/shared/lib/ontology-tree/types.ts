import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/** ego subgraph 의 한 이웃 — center 로부터의 거리 (hop) 까지 표시. */
export interface OntologyEgoNeighbor {
  /** 이웃 노드. 데이터 누락 (edge 가 미존재 노드 가리킴) 시 `null`. */
  node: KnowledgeGraphNode | null;
  /** 이웃 노드 ID — node 가 null 일 때도 edge 의 반대편 ID 보존. */
  neighborId: string;
  edge: KnowledgeGraphEdge;
  /** outgoing = center → neighbor (center 가 edge.from). incoming = 반대.
   *  2-hop 이웃의 경우 1-hop 중간 노드와 2-hop 사이의 edge 의 방향. */
  direction: "outgoing" | "incoming";
  /** center 로부터의 거리. 1 = 직접 연결, 2 = 한 다리 건넌 이웃. */
  hop: 1 | 2;
  /** hop=2 일 때 거쳐 온 1-hop 노드 ID. hop=1 은 undefined. */
  viaNeighborId?: string;
}

export interface OntologyEgoSubgraph {
  centerId: string;
  /**
   * 자연 정렬 — hop=1 먼저 (outgoing → incoming), 그 다음 hop=2.
   * 같은 그룹 안은 입력 edges 순서.
   */
  neighbors: OntologyEgoNeighbor[];
}

export interface OntologyTreeNode {
  node: KnowledgeGraphNode;
  /** 0 = root. children depth = parent depth + 1. */
  depth: number;
  children: OntologyTreeNode[];
  /**
   * 같은 노드가 contains 체인에 두 번 등장하면 (data error) 두 번째 이후는
   * skip 되고 warnings 에 기록.
   */
}

export interface OntologyTreeBuildResult {
  /** 트리 root (typically `kind=project`). 보통 1~수십 개. */
  roots: OntologyTreeNode[];
  /**
   * 트리에 포함되지 않은 노드들 (orphan). typically `kind=document` 거나
   * contains/belongs_to 체인이 끊긴 경우. UI 가 별도 섹션으로 표시 가능.
   */
  orphans: KnowledgeGraphNode[];
  /** 빌드 중 발견한 데이터 이슈 — cycle / 다중 부모 / 미연결. */
  warnings: string[];
}
