import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildOntologySkeleton } from "./topology-ontology-skeleton";
import { computeRevealState } from "./topology-reveal-state";

function node(
  id: string,
  kind: KnowledgeGraphNode["kind"],
): KnowledgeGraphNode {
  return {
    id,
    title: id,
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

/**
 * 픽스처: project p → 도메인 d1(역량 c1·c2) · d2(역량 c3).
 * c1 은 요소 2개(e1·e2), c2 는 1개(e3) — perDomainCap 1 이면 d1 랜드마크는 c1.
 */
const NODES = [
  node("project:p", "project"),
  node("domain:d1", "domain"),
  node("domain:d2", "domain"),
  node("capability:c1", "capability"),
  node("capability:c2", "capability"),
  node("capability:c3", "capability"),
  node("element:e1", "element"),
  node("element:e2", "element"),
  node("element:e3", "element"),
];

const EDGES = [
  contains("project:p", "domain:d1"),
  contains("project:p", "domain:d2"),
  contains("domain:d1", "capability:c1"),
  contains("domain:d1", "capability:c2"),
  contains("domain:d2", "capability:c3"),
  contains("capability:c1", "element:e1"),
  contains("capability:c1", "element:e2"),
  contains("capability:c2", "element:e3"),
];

const SKELETON = buildOntologySkeleton(NODES, EDGES, { perDomainCap: 1 });

describe("computeRevealState — 클릭-레벨 확장(점진 드릴다운)", () => {
  it("선택 없음 → overview: 골격(anchor+landmark)만 보인다", () => {
    const state = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: null,
    });
    expect(state.scopeDomainSlug).toBeNull();
    expect(state.scopeCapabilitySlug).toBeNull();
    expect(state.revealedSlugs.size).toBe(0);
    expect([...state.visibleSlugs].sort()).toEqual(
      [...SKELETON.skeletonSlugs].sort(),
    );
  });

  it("project 클릭도 overview 유지", () => {
    const state = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: "project:p",
    });
    expect(state.scopeDomainSlug).toBeNull();
    expect(state.revealedSlugs.size).toBe(0);
  });

  it("도메인 클릭 → 그 도메인의 모든 역량이 추가로 보인다(다른 골격 유지)", () => {
    const state = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: "domain:d1",
    });
    expect(state.scopeDomainSlug).toBe("domain:d1");
    expect(state.scopeCapabilitySlug).toBeNull();
    // c1 은 landmark 라 이미 골격 — 새로 드러나는 건 c2.
    expect([...state.revealedSlugs]).toEqual(["capability:c2"]);
    expect(state.visibleSlugs.has("capability:c2")).toBe(true);
    // 다른 도메인 골격은 그대로 보인다.
    expect(state.visibleSlugs.has("domain:d2")).toBe(true);
    expect(state.visibleSlugs.has("capability:c3")).toBe(true);
    // 요소는 아직 안 보인다.
    expect(state.visibleSlugs.has("element:e1")).toBe(false);
    // 역량 순서: subtree weight desc → slug asc (결정론).
    expect(state.domainCapabilitySlugs).toEqual([
      "capability:c1",
      "capability:c2",
    ]);
    expect(state.crumbSlugs).toEqual(["project:p", "domain:d1"]);
  });

  it("도메인 클릭 확장은 읽을 수 있는 카드 밀도를 위해 상위 4개 역량까지만 펼친다", () => {
    const manyCapabilities = Array.from({ length: 7 }, (_, index) =>
      node(`capability:c${index + 10}`, "capability"),
    );
    const manyEdges = manyCapabilities.map((capability) =>
      contains("domain:d1", capability.id),
    );
    const nodes = [...NODES, ...manyCapabilities];
    const edges = [...EDGES, ...manyEdges];
    const skeleton = buildOntologySkeleton(nodes, edges, { perDomainCap: 1 });

    const state = computeRevealState({
      skeleton,
      nodes,
      edges,
      selectedSlug: "domain:d1",
    });

    expect(state.domainCapabilitySlugs).toHaveLength(4);
    expect(
      state.domainCapabilitySlugs.every((slug) => state.visibleSlugs.has(slug)),
    ).toBe(true);
  });

  it("역량 클릭 → 소속 도메인의 역량 전개 유지 + 그 역량의 요소 추가", () => {
    const state = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: "capability:c2",
    });
    expect(state.scopeDomainSlug).toBe("domain:d1");
    expect(state.scopeCapabilitySlug).toBe("capability:c2");
    // d1 의 역량 레이어 유지(c2 비랜드마크 → revealed) + c2 의 요소.
    expect(state.visibleSlugs.has("capability:c1")).toBe(true);
    expect(state.visibleSlugs.has("capability:c2")).toBe(true);
    expect(state.visibleSlugs.has("element:e3")).toBe(true);
    // 다른 역량의 요소는 안 보인다.
    expect(state.visibleSlugs.has("element:e1")).toBe(false);
    expect(state.capabilityElementSlugs).toEqual(["element:e3"]);
    expect(state.crumbSlugs).toEqual([
      "project:p",
      "domain:d1",
      "capability:c2",
    ]);
  });

  it("요소 클릭 → 부모 역량 scope 로 동작(현재 펼침 유지, 시야 붕괴 없음)", () => {
    const state = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: "element:e3",
    });
    expect(state.scopeDomainSlug).toBe("domain:d1");
    expect(state.scopeCapabilitySlug).toBe("capability:c2");
    expect(state.visibleSlugs.has("element:e3")).toBe(true);
    expect(state.crumbSlugs).toEqual([
      "project:p",
      "domain:d1",
      "capability:c2",
      "element:e3",
    ]);
  });

  it("모르는 slug → overview 로 안전 폴백", () => {
    const state = computeRevealState({
      skeleton: SKELETON,
      nodes: NODES,
      edges: EDGES,
      selectedSlug: "nope:nothing",
    });
    expect(state.scopeDomainSlug).toBeNull();
    expect(state.revealedSlugs.size).toBe(0);
  });
});
