import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildDomainCouplingSummary } from "./domain-coupling-rows";

function node(id: string, kind = "capability", title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
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
    lastApprovedBy: "vault-frontmatter",
  };
}

describe("buildDomainCouplingSummary", () => {
  it("도메인 2개 이상 + 교차 edge 가 있으면 pair/boundary row 를 채운다", () => {
    const nodes = [
      node("domain:auth", "domain", "Auth"),
      node("domain:billing", "domain", "Billing"),
      node("capability:login", "capability", "Login"),
      node("capability:invoice", "capability", "Invoice"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      edge("c1", "domain:auth", "capability:login", "contains"),
      edge("c2", "domain:billing", "capability:invoice", "contains"),
      edge("e1", "capability:login", "capability:invoice", "depends_on"),
      edge("e2", "capability:invoice", "capability:login", "related_to"),
    ];

    const summary = buildDomainCouplingSummary(nodes, edges);

    expect(summary.isColdStart).toBe(false);
    expect(summary.domainCount).toBe(2);
    expect(summary.crossDomainEdgeCount).toBe(2);
    // auth→billing (depends_on) 과 billing→auth (related_to) 는 방향이 달라
    // 별개 pair — 둘 다 count 1 이라 from 도메인 title asc(Auth < Billing).
    expect(summary.pairs).toHaveLength(2);
    expect(summary.pairs[0]).toMatchObject({
      fromId: "domain:auth",
      fromTitle: "Auth",
      toId: "domain:billing",
      toTitle: "Billing",
      count: 1,
    });
    expect(summary.pairs[0]?.examples[0]).toMatchObject({
      fromId: "capability:login",
      fromTitle: "Login",
      toId: "capability:invoice",
      toTitle: "Invoice",
      type: "depends_on",
    });
    expect(summary.totalPairCount).toBe(2);

    const authBoundary = summary.boundaries.find((b) => b.id === "domain:auth");
    expect(authBoundary).toMatchObject({ title: "Auth", selfEdges: 0 });
    expect(authBoundary?.crossRatio).toBe(1);
  });

  it("콜드스타트 — 도메인 1개면 pair/boundary 없이 isColdStart true", () => {
    const nodes = [node("domain:auth", "domain", "Auth"), node("capability:login", "capability", "Login")];
    const edges: KnowledgeGraphEdge[] = [edge("c1", "domain:auth", "capability:login", "contains")];

    const summary = buildDomainCouplingSummary(nodes, edges);

    expect(summary.isColdStart).toBe(true);
    expect(summary.domainCount).toBe(1);
    expect(summary.pairs).toHaveLength(0);
  });

  it("콜드스타트 — 도메인 2개 이상이어도 교차 edge 가 0건이면 isColdStart true", () => {
    const nodes = [
      node("domain:auth", "domain", "Auth"),
      node("domain:billing", "domain", "Billing"),
      node("capability:login", "capability", "Login"),
      node("capability:invoice", "capability", "Invoice"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      edge("c1", "domain:auth", "capability:login", "contains"),
      edge("c2", "domain:billing", "capability:invoice", "contains"),
      // 같은 도메인 안쪽 edge 만 — cross 없음.
      edge("e1", "capability:login", "capability:login", "depends_on"),
    ];

    const summary = buildDomainCouplingSummary(nodes, edges);

    expect(summary.isColdStart).toBe(true);
    expect(summary.crossDomainEdgeCount).toBe(0);
    expect(summary.pairs).toHaveLength(0);
  });

  it("격자는 대각선에 안쪽 연결, 나머지에 방향별 교차 수를 담는다", () => {
    const nodes = [
      node("domain:auth", "domain", "Auth"),
      node("domain:billing", "domain", "Billing"),
      node("capability:login", "capability", "Login"),
      node("capability:session", "capability", "Session"),
      node("capability:invoice", "capability", "Invoice"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      edge("c1", "domain:auth", "capability:login", "contains"),
      edge("c2", "domain:auth", "capability:session", "contains"),
      edge("c3", "domain:billing", "capability:invoice", "contains"),
      edge("s1", "capability:login", "capability:session", "depends_on"),
      edge("x1", "capability:login", "capability:invoice", "depends_on"),
      edge("x2", "capability:session", "capability:invoice", "depends_on"),
    ];

    const { grid } = buildDomainCouplingSummary(nodes, edges);

    const authIndex = grid.domains.findIndex((d) => d.id === "domain:auth");
    const billingIndex = grid.domains.findIndex((d) => d.id === "domain:billing");
    expect(grid.domains).toHaveLength(2);
    // 대각선 = 같은 도메인 안 연결.
    expect(grid.cells[authIndex][authIndex]).toBe(1);
    expect(grid.cells[billingIndex][billingIndex]).toBe(0);
    // 교차는 방향이 있다 — auth → billing 2건, 반대 방향은 0건.
    expect(grid.cells[authIndex][billingIndex]).toBe(2);
    expect(grid.cells[billingIndex][authIndex]).toBe(0);
    expect(grid.maxCross).toBe(2);
    expect(grid.hiddenCrossEdgeCount).toBe(0);
    expect(grid.totalDomainCount).toBe(2);
  });

  it("도메인이 상한을 넘으면 앞에서 자르고, 잘린 쪽 교차 수를 따로 센다", () => {
    const nodes = [
      node("domain:a", "domain", "A"),
      node("domain:b", "domain", "B"),
      node("domain:c", "domain", "C"),
      node("capability:a1", "capability", "A1"),
      node("capability:b1", "capability", "B1"),
      node("capability:c1", "capability", "C1"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      edge("c1", "domain:a", "capability:a1", "contains"),
      edge("c2", "domain:b", "capability:b1", "contains"),
      edge("c3", "domain:c", "capability:c1", "contains"),
      // A↔B 는 두 건, C 는 한 건만 걸린다 — 상한 2면 C 가 잘린다.
      edge("x1", "capability:a1", "capability:b1", "depends_on"),
      edge("x2", "capability:b1", "capability:a1", "depends_on"),
      edge("x3", "capability:a1", "capability:c1", "depends_on"),
    ];

    const { grid } = buildDomainCouplingSummary(nodes, edges, 6, 2);

    expect(grid.domains.map((d) => d.id)).toEqual(["domain:a", "domain:b"]);
    expect(grid.totalDomainCount).toBe(3);
    // 조용히 줄이지 않는다 — 격자 밖으로 밀린 교차는 수로 남는다.
    expect(grid.hiddenCrossEdgeCount).toBe(1);
  });

  it("pairs 는 자르지 않는다 — 어느 칸을 눌러도 펼칠 상세가 있어야 한다", () => {
    const nodes = [
      node("domain:a", "domain", "A"),
      node("domain:b", "domain", "B"),
      node("domain:c", "domain", "C"),
      node("capability:a1", "capability", "A1"),
      node("capability:b1", "capability", "B1"),
      node("capability:c1", "capability", "C1"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      edge("c1", "domain:a", "capability:a1", "contains"),
      edge("c2", "domain:b", "capability:b1", "contains"),
      edge("c3", "domain:c", "capability:c1", "contains"),
      edge("x1", "capability:a1", "capability:b1", "depends_on"),
      edge("x2", "capability:b1", "capability:c1", "depends_on"),
      edge("x3", "capability:c1", "capability:a1", "depends_on"),
    ];

    const summary = buildDomainCouplingSummary(nodes, edges);

    expect(summary.pairs).toHaveLength(3);
    expect(summary.totalPairCount).toBe(3);
  });

  it("boundary row 는 edge 가 전혀 없는 도메인을 제외한다", () => {
    const nodes = [
      node("domain:auth", "domain", "Auth"),
      node("domain:billing", "domain", "Billing"),
      node("domain:empty", "domain", "Empty"),
      node("capability:login", "capability", "Login"),
      node("capability:invoice", "capability", "Invoice"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      edge("c1", "domain:auth", "capability:login", "contains"),
      edge("c2", "domain:billing", "capability:invoice", "contains"),
      edge("e1", "capability:login", "capability:invoice", "depends_on"),
    ];

    const summary = buildDomainCouplingSummary(nodes, edges);

    expect(summary.boundaries.some((b) => b.id === "domain:empty")).toBe(false);
  });
});
