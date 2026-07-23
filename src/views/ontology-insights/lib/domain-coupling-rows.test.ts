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
