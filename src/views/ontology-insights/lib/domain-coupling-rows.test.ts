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
    // auth→billing (depends_on) and billing→auth (related_to) run in different directions and are
    // separate pairs — both have count 1, so they sort by the `from` domain title (Auth < Billing).
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
    // Only edges inside one domain — no crossings.
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
    // The diagonal is a connection inside one domain.
    expect(grid.cells[authIndex][authIndex]).toBe(1);
    expect(grid.cells[billingIndex][billingIndex]).toBe(0);
    // A crossing has direction — two from auth → billing, zero the other way.
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
    // A↔B accounts for two, C for only one — with a limit of 2, C is truncated.
      edge("x1", "capability:a1", "capability:b1", "depends_on"),
      edge("x2", "capability:b1", "capability:a1", "depends_on"),
      edge("x3", "capability:a1", "capability:c1", "depends_on"),
    ];

    const { grid } = buildDomainCouplingSummary(nodes, edges, 6, 2);

    expect(grid.domains.map((d) => d.id)).toEqual(["domain:a", "domain:b"]);
    expect(grid.totalDomainCount).toBe(3);
    // Nothing is quietly reduced — crossings pushed outside the grid remain as a count.
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

  it("boundary row 는 교차 비중 내림차순이다 — 카드 캡션이 읽으라고 하는 순서", () => {
    // leaky: 0 inside, 2 crossing → 100% share, total 2 (small)
    // busy:  3 inside, 3 crossing → 50% share,  total 6 (large)
    // Ordered by total, busy comes first — the opposite of what the caption says.
    const nodes = [
      node("domain:leaky", "domain", "Leaky"),
      node("domain:busy", "domain", "Busy"),
      node("capability:l1", "capability", "L1"),
      node("capability:b1", "capability", "B1"),
      node("capability:b2", "capability", "B2"),
      node("capability:b3", "capability", "B3"),
      node("capability:b4", "capability", "B4"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      edge("c1", "domain:leaky", "capability:l1", "contains"),
      edge("c2", "domain:busy", "capability:b1", "contains"),
      edge("c3", "domain:busy", "capability:b2", "contains"),
      edge("c4", "domain:busy", "capability:b3", "contains"),
      edge("c5", "domain:busy", "capability:b4", "contains"),
    // Three edges inside busy.
      edge("s1", "capability:b1", "capability:b2", "depends_on"),
      edge("s2", "capability:b2", "capability:b3", "depends_on"),
      edge("s3", "capability:b3", "capability:b4", "depends_on"),
    // Two crossings (both are counted as crossings from either side).
      edge("x1", "capability:l1", "capability:b1", "depends_on"),
      edge("x2", "capability:b2", "capability:l1", "depends_on"),
    ];

    const { boundaries } = buildDomainCouplingSummary(nodes, edges);

    expect(boundaries.map((b) => b.id)).toEqual(["domain:leaky", "domain:busy"]);
    expect(boundaries[0]).toMatchObject({ selfEdges: 0, crossEdges: 2, crossRatio: 1 });
    expect(boundaries[1]?.crossRatio).toBeCloseTo(0.4, 5);
  });

  it("boundary 목록이 상한에서 잘리면 전체 수를 따로 세어 각주가 가능하게 한다", () => {
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
    ];

    const summary = buildDomainCouplingSummary(nodes, edges, 2);

    expect(summary.boundaries).toHaveLength(2);
    expect(summary.boundaryTotalCount).toBe(3);
  });

  it("격자는 대각선 최대값을 따로 센다 — 대각선이 교차와 같은 척도를 쓰면 안 된다", () => {
    const nodes = [
      node("domain:auth", "domain", "Auth"),
      node("domain:billing", "domain", "Billing"),
      node("capability:login", "capability", "Login"),
      node("capability:session", "capability", "Session"),
      node("capability:token", "capability", "Token"),
      node("capability:invoice", "capability", "Invoice"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      edge("c1", "domain:auth", "capability:login", "contains"),
      edge("c2", "domain:auth", "capability:session", "contains"),
      edge("c3", "domain:auth", "capability:token", "contains"),
      edge("c4", "domain:billing", "capability:invoice", "contains"),
    // Three edges inside auth — far more than the single crossing.
      edge("s1", "capability:login", "capability:session", "depends_on"),
      edge("s2", "capability:session", "capability:token", "depends_on"),
      edge("s3", "capability:token", "capability:login", "depends_on"),
      edge("x1", "capability:login", "capability:invoice", "depends_on"),
    ];

    const { grid } = buildDomainCouplingSummary(nodes, edges);

    expect(grid.maxSelf).toBe(3);
    expect(grid.maxCross).toBe(1);
  });
});
