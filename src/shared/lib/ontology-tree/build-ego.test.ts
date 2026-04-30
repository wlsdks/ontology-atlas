import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildOntologyEgoSubgraph } from "./build-ego";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");

function node(id: string, title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: APPROVED_AT,
    lastApprovedBy: "test",
  };
}

function edge(id: string, from: string, to: string, type = "depends_on"): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: APPROVED_AT,
    lastApprovedBy: "test",
  };
}

describe("buildOntologyEgoSubgraph", () => {
  it("outgoing 먼저, 그 다음 incoming — 같은 그룹 안은 입력 순서 유지", () => {
    const center = node("auth-login");
    const a = node("iam");
    const b = node("session");
    const c = node("public-api");
    const nodes = [center, a, b, c];
    const edges = [
      edge("e1", "auth-login", "iam"), // outgoing
      edge("e2", "session", "auth-login"), // incoming
      edge("e3", "auth-login", "public-api"), // outgoing
    ];
    const result = buildOntologyEgoSubgraph("auth-login", nodes, edges);
    expect(result.centerId).toBe("auth-login");
    expect(result.neighbors).toHaveLength(3);
    expect(result.neighbors[0]?.direction).toBe("outgoing");
    expect(result.neighbors[0]?.neighborId).toBe("iam");
    expect(result.neighbors[1]?.direction).toBe("outgoing");
    expect(result.neighbors[1]?.neighborId).toBe("public-api");
    expect(result.neighbors[2]?.direction).toBe("incoming");
    expect(result.neighbors[2]?.neighborId).toBe("session");
  });

  it("self-loop (from === to === centerId) 제외", () => {
    const center = node("self");
    const result = buildOntologyEgoSubgraph(
      "self",
      [center],
      [edge("loop", "self", "self")],
    );
    expect(result.neighbors).toHaveLength(0);
  });

  it("같은 노드가 양방향이면 두 entry — 두 관계는 다른 사실", () => {
    const center = node("a");
    const b = node("b");
    const nodes = [center, b];
    const edges = [edge("e1", "a", "b", "uses"), edge("e2", "b", "a", "describes")];
    const result = buildOntologyEgoSubgraph("a", nodes, edges);
    expect(result.neighbors).toHaveLength(2);
    expect(result.neighbors[0]?.direction).toBe("outgoing");
    expect(result.neighbors[0]?.edge.type).toBe("uses");
    expect(result.neighbors[1]?.direction).toBe("incoming");
    expect(result.neighbors[1]?.edge.type).toBe("describes");
  });

  it("이웃 노드가 nodes 인덱스에 없으면 node=null, neighborId 보존 (stub / 데이터 갭 방어)", () => {
    const center = node("a");
    const result = buildOntologyEgoSubgraph(
      "a",
      [center],
      [edge("orphan-edge", "a", "ghost")],
    );
    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]?.node).toBeNull();
    expect(result.neighbors[0]?.neighborId).toBe("ghost");
  });

  it("미존재 centerId — 빈 neighbors", () => {
    const result = buildOntologyEgoSubgraph("nope", [node("a")], [edge("e", "a", "a")]);
    expect(result.neighbors).toHaveLength(0);
  });

  it("기본 hops=1 — 1-hop 결과만 (회귀 호환)", () => {
    const center = node("c");
    const a = node("a");
    const b = node("b");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a, b],
      [edge("e1", "c", "a"), edge("e2", "a", "b")],
    );
    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]?.hop).toBe(1);
    expect(result.neighbors[0]?.neighborId).toBe("a");
  });
});

describe("buildOntologyEgoSubgraph — hops=2", () => {
  it("1-hop + 2-hop 모두 포함, hop 필드 표시", () => {
    const center = node("c");
    const a = node("a");
    const b = node("b");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a, b],
      [edge("e1", "c", "a"), edge("e2", "a", "b")],
      { hops: 2 },
    );
    expect(result.neighbors).toHaveLength(2);
    expect(result.neighbors[0]?.hop).toBe(1);
    expect(result.neighbors[0]?.neighborId).toBe("a");
    expect(result.neighbors[1]?.hop).toBe(2);
    expect(result.neighbors[1]?.neighborId).toBe("b");
    expect(result.neighbors[1]?.viaNeighborId).toBe("a");
  });

  it("center 자신을 가리키는 2-hop edge 는 cycle, 제외", () => {
    const center = node("c");
    const a = node("a");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a],
      [edge("e1", "c", "a"), edge("e2", "a", "c")],
      { hops: 2 },
    );
    // hop1 outgoing (c→a) + hop1 incoming (a→c). 2-hop 추가 없음 (a→c 는 center).
    expect(result.neighbors).toHaveLength(2);
    expect(result.neighbors.every((n) => n.hop === 1)).toBe(true);
  });

  it("1-hop 에 이미 등장한 노드는 2-hop 으로 다시 추가 안 함", () => {
    const center = node("c");
    const a = node("a");
    const b = node("b");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a, b],
      [
        edge("e1", "c", "a"),
        edge("e2", "c", "b"), // b 는 1-hop
        edge("e3", "a", "b"), // a→b 가 2-hop 후보지만 b 는 1-hop 이라 skip
      ],
      { hops: 2 },
    );
    expect(result.neighbors).toHaveLength(2);
    expect(result.neighbors.every((n) => n.hop === 1)).toBe(true);
  });

  it("incoming edge 도 2-hop 탐색 — 양방향 BFS", () => {
    const center = node("c");
    const a = node("a");
    const b = node("b");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a, b],
      [edge("e1", "c", "a"), edge("e2", "b", "a")], // b→a, a 가 1-hop, b 가 2-hop incoming
      { hops: 2 },
    );
    const hop2 = result.neighbors.filter((n) => n.hop === 2);
    expect(hop2).toHaveLength(1);
    expect(hop2[0]?.neighborId).toBe("b");
    expect(hop2[0]?.direction).toBe("incoming");
    expect(hop2[0]?.viaNeighborId).toBe("a");
  });

  it("2-hop 의 미존재 노드 (데이터 갭) — node=null, neighborId 보존", () => {
    const center = node("c");
    const a = node("a");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a],
      [edge("e1", "c", "a"), edge("e2", "a", "ghost")],
      { hops: 2 },
    );
    const hop2 = result.neighbors.filter((n) => n.hop === 2);
    expect(hop2).toHaveLength(1);
    expect(hop2[0]?.node).toBeNull();
    expect(hop2[0]?.neighborId).toBe("ghost");
  });

  it("1-hop 의 stub (node=null) 는 2-hop pivot 으로 쓰지 않음", () => {
    const center = node("c");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center],
      [edge("e1", "c", "ghost"), edge("e2", "ghost", "far")],
      { hops: 2 },
    );
    // hop1 으로 ghost 1 entry, 2-hop 은 ghost 가 미존재라 탐색 안 함.
    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]?.hop).toBe(1);
    expect(result.neighbors[0]?.neighborId).toBe("ghost");
  });
});
