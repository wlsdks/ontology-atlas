"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import {
  subscribeKnowledgeApprovedGraph,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  type KnowledgeProjectInsight,
} from "@/entities/knowledge-graph";

/**
 * Track C-2 — knowledgeApprovedNodes/Edges 를 xyflow `Node[]` / `Edge[]` 로
 * 변환. dagre layered layout 으로 자동 위치 (canvasPosition 미정 노드용).
 *
 * canvasPosition (C-5 fire) 는 이 hook 의 다음 iteration 에서 추가 — 현재는
 * dagre 자동 layout 만 사용.
 */
export function useApprovedGraphFlow(accountId: string | null) {
  const [insight, setInsight] = useState<KnowledgeProjectInsight | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setError(null);
    // 비로그인 사용자는 cloud canonical 컬렉션 권한이 없으므로 raw Firestore
    // 'Missing or insufficient permissions' 에러가 사용자에게 노출됐다. 비로그인
    // 은 *예상된 상태* 라 구독 자체를 건너뛰고 빈 그래프 + loaded:true 로
    // 처리해 ephemeral 캔버스만 사용 가능하게.
    if (!accountId) {
      setInsight({ nodes: [], edges: [], meta: null });
      return;
    }
    const unsubscribe = subscribeKnowledgeApprovedGraph(
      accountId,
      (next) => setInsight(next),
      (err) => setError(err),
    );
    return unsubscribe;
  }, [accountId]);

  const flow = useMemo(() => {
    if (!insight) return { nodes: [] as Node[], edges: [] as Edge[] };
    return buildFlowFromInsight(insight);
  }, [insight]);

  return { ...flow, error, loaded: insight !== null };
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;

function buildFlowFromInsight(insight: KnowledgeProjectInsight) {
  // 문서 노드는 ERD 캔버스에서 제외 (read-only tree view 와 동일 — 근거 노드).
  const nodes = insight.nodes.filter((n) => n.kind !== "document");
  const validIds = new Set(nodes.map((n) => n.id));
  const edges = insight.edges.filter(
    (e) => validIds.has(e.from) && validIds.has(e.to),
  );

  const positions = computeDagreLayout(nodes, edges);

  const xyNodes: Node[] = nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      type: "default",
      position: pos,
      data: {
        label: `${kindLabel(n.kind)} · ${n.title}`,
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // C-1 의 read-only 단계에선 drag 비활성. C-5 fire 에서 활성.
      draggable: false,
      connectable: false,
      selectable: true,
    };
  });

  // C-9 — edge type 별 시각 차별화 (헌장 §11 — 인디고 alpha + 무채색 alpha 만)
  const xyEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: "default", // bezier
    label: edgeTypeLabel(e.type),
    labelStyle: edgeLabelStyle,
    labelBgStyle: edgeLabelBgStyle,
    labelBgPadding: [6, 4] as [number, number],
    labelBgBorderRadius: 4,
    style: edgeStrokeStyleByType(e.type),
    animated: false,
  }));

  return { nodes: xyNodes, edges: xyEdges };
}

// 헌장 §11 — 인디고 alpha 단일 + 무채색 alpha. type 별 dash 패턴으로 시각 구분.
const edgeLabelStyle = {
  fontSize: 10,
  fill: "rgba(220, 226, 240, 0.96)",
  fontWeight: 600,
};
const edgeLabelBgStyle = {
  fill: "rgba(14, 16, 22, 0.92)",
  stroke: "rgba(94, 106, 210, 0.32)",
  strokeWidth: 1,
};

function edgeStrokeStyleByType(type: string): CSSProperties {
  // structure (contains / belongs_to) — solid 진함
  if (type === "contains" || type === "belongs_to") {
    return {
      stroke: "rgba(139, 151, 255, 0.66)",
      strokeWidth: 1.5,
    };
  }
  // behavior (depends_on / implements / uses) — solid 인디고 alpha 보통
  if (type === "depends_on" || type === "implements" || type === "uses") {
    return {
      stroke: "rgba(94, 106, 210, 0.46)",
      strokeWidth: 1.25,
    };
  }
  // evidence (describes) — dotted 약함
  if (type === "describes") {
    return {
      stroke: "rgba(180, 188, 220, 0.4)",
      strokeWidth: 1,
      strokeDasharray: "2 3",
    };
  }
  // weak (related_to) — 짧은 dash
  if (type === "related_to") {
    return {
      stroke: "rgba(180, 188, 220, 0.32)",
      strokeWidth: 1,
      strokeDasharray: "4 4",
    };
  }
  return { stroke: "rgba(94, 106, 210, 0.46)", strokeWidth: 1 };
}

function computeDagreLayout(
  nodes: KnowledgeGraphNode[],
  edges: KnowledgeGraphEdge[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  const map = new Map<string, { x: number; y: number }>();
  for (const id of g.nodes()) {
    const node = g.node(id);
    if (node) {
      map.set(id, {
        x: node.x - NODE_WIDTH / 2,
        y: node.y - NODE_HEIGHT / 2,
      });
    }
  }
  return map;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "project":
      return "프로젝트";
    case "domain":
      return "도메인";
    case "capability":
      return "역량";
    case "element":
      return "요소";
    default:
      return kind;
  }
}

function edgeTypeLabel(type: string): string {
  switch (type) {
    case "contains":
      return "포함";
    case "belongs_to":
      return "속함";
    case "depends_on":
      return "의존";
    case "implements":
      return "구현";
    case "uses":
      return "사용";
    case "describes":
      return "설명";
    case "related_to":
      return "관련";
    default:
      return type;
  }
}
