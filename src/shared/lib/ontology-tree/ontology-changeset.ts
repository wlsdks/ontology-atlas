import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * 온톨로지 "변경점" — 세션 baseline 스냅샷 대비 현재 그래프의 added / changed /
 * removed 노드 & 관계.
 *
 * 왜 스냅샷인가: 웹/Tauri(WKWebView) 런타임은 브라우저라 git subprocess 가
 * 없다. 그래서 사람-대면 변경뷰(회의·설계 리뷰)의 baseline 은 "지금"을 찍는
 * 세션 스냅샷이 자연스럽다(기존 runtime recent-pulse 도 같은 결). git HEAD 기반
 * diff 는 Node 를 가진 MCP/CLI(에이전트) 쪽에서 별도 제공한다.
 *
 * 순수 함수 — React/IO 의존 0. 동일 입력 → 동일 출력.
 */

const SEP = "";

export interface OntologySnapshot {
  /** nodeId → 내용 시그니처 (kind/title/summary + 정렬된 outgoing edge). */
  nodeSigs: Map<string, string>;
  /**
   * nodeId → kind. 시그니처는 SEP 로 join 돼 kind 를 되파싱할 수 없으므로 kind 를
   * 별도 보존 — removed 노드(현재 그래프엔 없음)의 kind 를 변경 리뷰 UI 가
   * 표시할 수 있게.
   */
  nodeKinds: Map<string, string>;
  /** "fromtotype" edge key 집합. */
  edgeKeys: Set<string>;
  /** 스냅샷을 찍은 시점(ms). 호출자가 stamp — 라벨/정렬용. */
  takenAt: number;
}

export interface OntologyChangeset {
  addedNodes: string[];
  removedNodes: string[];
  changedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  /** added + removed + changed 노드 + added + removed 엣지 합계. */
  total: number;
  /** 변경(added|changed)된 노드 빠른 조회용 — UI 하이라이트. */
  touchedNodeIds: Set<string>;
  /**
   * removed 노드의 nodeId → kind (baseline 에서 보존). removed 노드는 현재
   * 그래프에 없어 nodeById 로 kind 를 알 수 없으므로 여기서 제공 — 리뷰 패널이
   * "삭제된 게 domain 인지 element 인지" 를 한눈에 보여줄 수 있다. added/changed
   * 의 kind 는 현재 그래프에 있으니 호출자가 nodeById 로 직접 얻는다.
   */
  removedNodeKinds: Map<string, string>;
}

function edgeKey(edge: Pick<KnowledgeGraphEdge, "from" | "to" | "type">): string {
  return `${edge.from}${SEP}${edge.to}${SEP}${edge.type}`;
}

/**
 * 노드 한 개의 "내용" 시그니처. 같으면 변경 없음으로 본다.
 * kind/title/summary 와 그 노드에서 나가는 엣지(정렬)로 구성 — frontmatter 의
 * 실질 변경(이름·요약·관계 추가/삭제)을 포착하되 좌표/타임스탬프 같은 noise 는 무시.
 */
function nodeSignature(
  node: KnowledgeGraphNode,
  outgoingByNode: Map<string, string[]>,
): string {
  const edges = (outgoingByNode.get(node.id) ?? []).slice().sort();
  return [
    node.kind,
    node.title,
    node.summary ?? "",
    edges.join(","),
  ].join(SEP);
}

function buildOutgoingMap(edges: readonly KnowledgeGraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.from);
    const entry = `${edge.to}:${edge.type}`;
    if (list) list.push(entry);
    else map.set(edge.from, [entry]);
  }
  return map;
}

/**
 * 현재 그래프의 baseline 스냅샷을 만든다. takenAt 은 호출자가 전달(런타임
 * Date.now() 는 호출자 책임 — 이 모듈은 순수 유지).
 */
export function snapshotOntology(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  takenAt: number,
): OntologySnapshot {
  const outgoing = buildOutgoingMap(edges);
  const nodeSigs = new Map<string, string>();
  const nodeKinds = new Map<string, string>();
  for (const node of nodes) {
    nodeSigs.set(node.id, nodeSignature(node, outgoing));
    nodeKinds.set(node.id, node.kind);
  }
  const edgeKeys = new Set<string>();
  for (const edge of edges) edgeKeys.add(edgeKey(edge));
  return { nodeSigs, nodeKinds, edgeKeys, takenAt };
}

/**
 * baseline 스냅샷 대비 현재 그래프의 변경점을 계산한다.
 * baseline 이 null 이면 "변경 없음"(빈 changeset) — baseline 미설정 상태.
 */
export function computeOntologyChangeset(
  baseline: OntologySnapshot | null,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): OntologyChangeset {
  const empty: OntologyChangeset = {
    addedNodes: [],
    removedNodes: [],
    changedNodes: [],
    addedEdges: [],
    removedEdges: [],
    total: 0,
    touchedNodeIds: new Set(),
    removedNodeKinds: new Map(),
  };
  if (!baseline) return empty;

  const outgoing = buildOutgoingMap(edges);
  const currentIds = new Set(nodes.map((n) => n.id));

  const addedNodes: string[] = [];
  const changedNodes: string[] = [];
  for (const node of nodes) {
    const prevSig = baseline.nodeSigs.get(node.id);
    if (prevSig === undefined) {
      addedNodes.push(node.id);
    } else if (prevSig !== nodeSignature(node, outgoing)) {
      changedNodes.push(node.id);
    }
  }
  const removedNodes: string[] = [];
  const removedNodeKinds = new Map<string, string>();
  for (const id of baseline.nodeSigs.keys()) {
    if (!currentIds.has(id)) {
      removedNodes.push(id);
      const kind = baseline.nodeKinds.get(id);
      if (kind) removedNodeKinds.set(id, kind);
    }
  }

  const currentEdgeKeys = new Set(edges.map(edgeKey));
  const addedEdges: string[] = [];
  for (const key of currentEdgeKeys) {
    if (!baseline.edgeKeys.has(key)) addedEdges.push(key);
  }
  const removedEdges: string[] = [];
  for (const key of baseline.edgeKeys) {
    if (!currentEdgeKeys.has(key)) removedEdges.push(key);
  }

  const touchedNodeIds = new Set<string>([...addedNodes, ...changedNodes]);
  return {
    addedNodes,
    removedNodes,
    changedNodes,
    addedEdges,
    removedEdges,
    total:
      addedNodes.length +
      removedNodes.length +
      changedNodes.length +
      addedEdges.length +
      removedEdges.length,
    touchedNodeIds,
    removedNodeKinds,
  };
}
