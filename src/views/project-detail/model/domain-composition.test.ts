import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildProjectDomainComposition } from "./domain-composition";

function n(id: string, kind: string, projectIds: string[] = [], title?: string): KnowledgeGraphNode {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

function contains(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}--contains-->${to}`,
    from,
    to,
    type: "contains",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

const SLUG = "ontology-atlas";

describe("buildProjectDomainComposition", () => {
  it("returns an empty composition when the project has no domain nodes", () => {
    const result = buildProjectDomainComposition([], [], SLUG);
    expect(result).toEqual({ domains: [], maxTotal: 0 });
  });

  it("counts capabilities and elements assigned (transitively) to a domain", () => {
    const nodes = [
      n("domain:views", "domain", [SLUG], "Views"),
      n("capability:a", "capability", [SLUG], "Capability A"),
      n("capability:b", "capability", [SLUG], "Capability B"),
      n("element:x", "element", [SLUG], "Element X"),
      n("element:y", "element", [SLUG], "Element Y"),
      n("element:z", "element", [SLUG], "Element Z"),
    ];
    const edges = [
      contains("domain:views", "capability:a"),
      contains("domain:views", "capability:b"),
      contains("domain:views", "element:x"),
      // element:y / element:z nested under capability:a — should still roll up to the domain.
      contains("capability:a", "element:y"),
      contains("capability:a", "element:z"),
    ];
    const result = buildProjectDomainComposition(nodes, edges, SLUG);
    expect(result.domains).toHaveLength(1);
    const [views] = result.domains;
    expect(views.title).toBe("Views");
    expect(views.capabilityCount).toBe(2);
    expect(views.elementCount).toBe(3);
    expect(views.total).toBe(5);
    expect(result.maxTotal).toBe(5);
  });

  it("orders top capabilities by degree (connectivity) desc, then title asc", () => {
    const nodes = [
      n("domain:views", "domain", [SLUG], "Views"),
      n("capability:a", "capability", [SLUG], "Alpha"),
      n("capability:b", "capability", [SLUG], "Bravo"),
      n("capability:c", "capability", [SLUG], "Charlie"),
      n("element:e1", "element", [SLUG]),
    ];
    const edges = [
      contains("domain:views", "capability:a"),
      contains("domain:views", "capability:b"),
      contains("domain:views", "capability:c"),
      contains("capability:b", "element:e1"),
      // capability:b gets an extra edge to bump its degree above a/c.
      contains("capability:a", "capability:b"),
    ];
    const result = buildProjectDomainComposition(nodes, edges, SLUG, { topCapabilityLimit: 2 });
    const [views] = result.domains;
    expect(views.topCapabilities).toEqual(["Bravo", "Alpha"]);
    expect(views.moreCapabilityCount).toBe(1);
  });

  it("sorts domains by total count desc, tie-broken by title asc", () => {
    const nodes = [
      n("domain:small", "domain", [SLUG], "Small"),
      n("domain:big", "domain", [SLUG], "Big"),
      n("capability:big1", "capability", [SLUG]),
      n("capability:big2", "capability", [SLUG]),
    ];
    const edges = [contains("domain:big", "capability:big1"), contains("domain:big", "capability:big2")];
    const result = buildProjectDomainComposition(nodes, edges, SLUG);
    expect(result.domains.map((d) => d.title)).toEqual(["Big", "Small"]);
    expect(result.maxTotal).toBe(2);
  });

  it("P-1 — containment 도달 멤버는 projectIds 와 무관하게 센다 (4면 census 정합)", () => {
    // 구 계약(projectIds 필터)은 지도 INDEX·인사이트·/projects 의 단일
    // 진실원 BFS 와 숫자가 갈라지는 원인이었다. 도메인이 담고 있으면
    // 어느 프로젝트 스탬프든 그 도메인의 크기에 포함된다 — 표면 간 같은
    // 숫자가 개별 필터보다 우선한다는 것이 이번 라운드의 계약.
    const nodes = [
      n("domain:views", "domain", [SLUG], "Views"),
      n("capability:foreign", "capability", ["other-project"]),
    ];
    const edges = [contains("domain:views", "capability:foreign")];
    const result = buildProjectDomainComposition(nodes, edges, SLUG);
    expect(result.domains[0].capabilityCount).toBe(1);
  });
});
