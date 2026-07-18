import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildFullDetailReachModel } from "./full-detail-reach";

function node(id: string, kind: string, title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "",
  };
}

function edge(id: string, from: string, to: string, type: string): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "",
  };
}

describe("buildFullDetailReachModel", () => {
  // domain:a --contains--> capability:a1 --contains--> capability:a2
  // domain:b --contains--> capability:b1
  // capability:a1 --depends_on--> capability:b1 (cross-domain, distance 2)
  const nodes = [
    node("domain:a", "domain", "Domain A"),
    node("domain:b", "domain", "Domain B"),
    node("capability:a1", "capability", "A1"),
    node("capability:a2", "capability", "A2"),
    node("capability:b1", "capability", "B1"),
  ];
  const edges = [
    edge("e1", "domain:a", "capability:a1", "contains"),
    edge("e2", "domain:b", "capability:b1", "contains"),
    // a1 contains a2 (so a2's nearest domain ancestor walks a1 → domain:a) —
    // both edges are containment, keeping BFS distances predictable.
    edge("e3", "capability:a1", "capability:a2", "contains"),
    edge("e4", "capability:a1", "capability:b1", "depends_on"),
  ];

  it("depth 1 은 직접 outgoing 만 — domain:a 에서 capability:a1", () => {
    const model = buildFullDetailReachModel("domain:a", nodes, edges);
    expect(model.byDepth[1].reachableCount).toBe(1);
  });

  it("depth 2 는 a1 의 outgoing 까지 포함 — b1, a2", () => {
    const model = buildFullDetailReachModel("domain:a", nodes, edges);
    expect(model.byDepth[2].reachableCount).toBe(3);
  });

  it("depth 3 은 더 늘어나지 않음(그래프가 다 소진)", () => {
    const model = buildFullDetailReachModel("domain:a", nodes, edges);
    expect(model.byDepth[3].reachableCount).toBe(3);
  });

  it("도메인별 분해 — self(domain:a 내부) vs domain:b, isSelf 플래그", () => {
    const model = buildFullDetailReachModel("domain:a", nodes, edges);
    const rows = model.byDepth[2].domainRows;
    const self = rows.find((r) => r.isSelf);
    const other = rows.find((r) => !r.isSelf);
    expect(self?.domainId).toBe("domain:a");
    expect(self?.count).toBe(2); // a1, a2
    expect(other?.domainId).toBe("domain:b");
    expect(other?.count).toBe(1); // b1
  });

  it("totalNodes 는 전체 그래프 노드 수", () => {
    const model = buildFullDetailReachModel("domain:a", nodes, edges);
    expect(model.totalNodes).toBe(nodes.length);
  });

  it("리프 노드 — 도달 0, domainRows 빈 배열", () => {
    const model = buildFullDetailReachModel("capability:a2", nodes, edges);
    expect(model.byDepth[3].reachableCount).toBe(0);
    expect(model.byDepth[3].domainRows).toEqual([]);
  });

  it("도메인 조상이 없는 노드(project) 는 domainId null 버킷", () => {
    const withProject = [...nodes, node("project:root", "project", "Root")];
    const withEdge = [...edges, edge("e5", "domain:a", "project:root", "depends_on")];
    const model = buildFullDetailReachModel("domain:a", withProject, withEdge);
    const rows = model.byDepth[1].domainRows;
    const noDomainRow = rows.find((r) => r.domainId === null);
    expect(noDomainRow?.count).toBe(1);
    expect(noDomainRow?.domainTitle).toBeNull();
  });
});
