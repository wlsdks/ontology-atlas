import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildOntologySkeleton } from "./topology-ontology-skeleton";
import { computeRevealState } from "./topology-reveal-state";
import { buildSkeletonCardModels } from "./topology-skeleton-cards";

function node(
  id: string,
  kind: KnowledgeGraphNode["kind"],
  title = id,
): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "t",
  } as KnowledgeGraphNode;
}

function contains(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    type: "contains",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "t",
  } as KnowledgeGraphEdge;
}

const NODES = [
  node("project:p", "project", "Atlas"),
  node("domain:d1", "domain", "Views"),
  node("domain:d2", "domain", "Agent"),
  node("capability:c1", "capability", "Topology Render"),
  node("capability:c2", "capability", "Builder Canvas"),
  node("element:e1", "element", "src/views/home/ui/HomePage.tsx"),
];

const EDGES = [
  contains("project:p", "domain:d1"),
  contains("project:p", "domain:d2"),
  contains("domain:d1", "capability:c1"),
  contains("domain:d1", "capability:c2"),
  contains("capability:c1", "element:e1"),
];

const SKELETON = buildOntologySkeleton(NODES, EDGES, { perDomainCap: 1 });

describe("buildSkeletonCardModels — DOM 카드 오버레이 모델", () => {
  it("overview: 가시 골격 노드마다 카드 1개 (kind·tier·title)", () => {
    const reveal = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: null,
    });
    const cards = buildSkeletonCardModels(SKELETON, reveal, NODES);
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(byId.get("project:p")).toMatchObject({
      kind: "project",
      tier: 0,
      title: "Atlas",
    });
    expect(byId.get("domain:d1")).toMatchObject({ kind: "domain", tier: 1 });
    // landmark capability 도 카드.
    expect(byId.get("capability:c1")).toMatchObject({
      kind: "capability",
      tier: 2,
    });
    // 비가시 노드는 카드 없음.
    expect(byId.has("element:e1")).toBe(false);
  });

  it("count = governed subtree weight (요소 수) — 0 이면 undefined", () => {
    const reveal = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: null,
    });
    const cards = buildSkeletonCardModels(SKELETON, reveal, NODES);
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(byId.get("domain:d1")?.count).toBe(1); // e1 하나
    expect(byId.get("domain:d2")?.count).toBeUndefined(); // 요소 0
  });

  it("괄호 부연이 달린 제목은 본 제목만 (카드 폭 보존)", () => {
    const verbose = NODES.map((n) =>
      n.id === "domain:d1"
        ? { ...n, title: "Views (Topology · Browse · Builder)" }
        : n,
    );
    const reveal = computeRevealState({
      skeleton: SKELETON,
      nodes: verbose,
      edges: EDGES,
      selectedSlug: null,
    });
    const cards = buildSkeletonCardModels(SKELETON, reveal, verbose);
    expect(cards.find((c) => c.id === "domain:d1")?.title).toBe("Views");
  });

  it("요소 카드는 파일 경로 대신 basename 라벨", () => {
    const reveal = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: "capability:c1",
    });
    const cards = buildSkeletonCardModels(SKELETON, reveal, NODES);
    const el = cards.find((c) => c.id === "element:e1");
    expect(el).toMatchObject({ kind: "element", tier: 3, title: "HomePage.tsx" });
  });

  it("결정론 — 같은 입력이면 같은 순서·내용", () => {
    const reveal = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: "domain:d1",
    });
    const a = buildSkeletonCardModels(SKELETON, reveal, NODES);
    const b = buildSkeletonCardModels(SKELETON, reveal, NODES);
    expect(a).toEqual(b);
  });
});
