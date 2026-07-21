import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import {
  buildTopologyOntologyDrawerModel,
  classifyTopologyRelationProvenance,
} from "./topology-ontology-drawer";

const stamp = new Date(0);

function node(
  id: string,
  kind = "capability",
  evidenceIds: string[] = [id],
): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds,
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  type = "depends_on",
  extra: Partial<KnowledgeGraphEdge> = {},
): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...extra,
  };
}

describe("buildTopologyOntologyDrawerModel", () => {
  it("summarizes incoming and outgoing relations for a selected ontology node", () => {
    const selected = node("capabilities/mcp-server");
    const nodes = [
      selected,
      node("domains/ai-agent-partner", "domain"),
      node("elements/mcp-sdk", "element"),
    ];
    const edges = [
      edge("domain->cap", "domains/ai-agent-partner", selected.id, "contains", {
        evidenceIds: ["domains/ai-agent-partner"],
      }),
      edge("cap->sdk", selected.id, "elements/mcp-sdk", "uses"),
      edge("cap->domain", selected.id, "domains/ai-agent-partner", "related_to"),
    ];

    expect(buildTopologyOntologyDrawerModel(selected, nodes, edges)).toMatchObject({
      sourceSlug: "capabilities/mcp-server",
      incomingCount: 1,
      outgoingCount: 2,
      relationCounts: [
        { type: "contains", count: 1 },
        { type: "related_to", count: 1 },
        { type: "uses", count: 1 },
      ],
      provenanceCounts: [
        { provenance: "source_backed", count: 1 },
        { provenance: "authored", count: 2 },
      ],
      relationQuality: {
        strong: 1,
        supported: 1,
        weak: 1,
        review: 0,
      },
      previewRelations: [
        {
          direction: "outgoing",
          other: { id: "elements/mcp-sdk" },
          edge: { type: "uses" },
          provenance: "authored",
        },
        {
          direction: "outgoing",
          other: { id: "domains/ai-agent-partner" },
          edge: { type: "related_to" },
          provenance: "authored",
        },
        {
          direction: "incoming",
          other: { id: "domains/ai-agent-partner" },
          edge: { type: "contains" },
          provenance: "source_backed",
        },
      ],
    });
  });

  it("counts transitive blast radius (dependents) and dependencies, not just direct degree", () => {
    // a depends_on core, b depends_on a → core 의 *전이* dependents = {a, b} (2)
    // 인데 직접 incoming 은 a 하나(1). core depends_on util → 전이 dependencies = 1.
    // 즉 "변경 영향 범위" 는 1-hop degree 가 *과소평가* 한다 — 전이 reach 가 진짜 값.
    const core = node("capabilities/core");
    const nodes = [
      core,
      node("capabilities/a"),
      node("capabilities/b"),
      node("elements/util", "element"),
    ];
    const edges = [
      edge("a->core", "capabilities/a", "capabilities/core"),
      edge("b->a", "capabilities/b", "capabilities/a"),
      edge("core->util", "capabilities/core", "elements/util"),
    ];

    const model = buildTopologyOntologyDrawerModel(core, nodes, edges);
    expect(model.incomingCount).toBe(1); // 직접 incoming 만
    expect(model.outgoingCount).toBe(1); // 직접 outgoing 만
    expect(model.reach).toEqual({ dependents: 2, dependencies: 1 });
  });

  it("resolves the owning domain from an incoming domain-kind edge", () => {
    const cap = node("capabilities/login", "capability");
    const dom = node("domains/auth", "domain");
    const elem = node("elements/jwt", "element");
    const model = buildTopologyOntologyDrawerModel(cap, [cap, dom, elem], [
      edge("dom->cap", "domains/auth", "capabilities/login", "contains"),
      edge("cap->elem", "capabilities/login", "elements/jwt", "elements"),
    ]);
    expect(model.ownerDomain).toEqual({ id: "domains/auth", title: "domains/auth" });
  });

  it("ownerDomain null for a domain node (no owning domain)", () => {
    const dom = node("domains/auth", "domain");
    const cap = node("capabilities/login", "capability");
    // domain contains capability — domain 자신은 owning domain 없음.
    const model = buildTopologyOntologyDrawerModel(dom, [dom, cap], [
      edge("dom->cap", "domains/auth", "capabilities/login", "contains"),
    ]);
    expect(model.ownerDomain).toBeNull();
  });

  it("P1-③ — domain node with an INCOMING domain edge still has no owner domain (no cross-domain misattribution)", () => {
    // Vault — Local-First 도메인이 AI Agent Partner 도메인의 incoming
    // relation 을 가진다(도메인 간 cross-relation). 이걸 소속으로 집으면
    // "도메인 · AI Agent Partner" 오귀속(데이터시트 헤더 + 인계 domain: 필드).
    const vault = node("domains/vault-local-first", "domain");
    const agent = node("domains/ai-agent-partner", "domain");
    const model = buildTopologyOntologyDrawerModel(vault, [vault, agent], [
      edge("agent->vault", "domains/ai-agent-partner", "domains/vault-local-first", "relates"),
    ]);
    expect(model.ownerDomain).toBeNull();
  });

  it("P1-③ — project node is never attributed to a domain owner", () => {
    const project = node("project", "project");
    const dom = node("domains/auth", "domain");
    // 데이터 상 domain → project 로 잘못된 contains 가 있어도 소속 표기 금지.
    const model = buildTopologyOntologyDrawerModel(project, [project, dom], [
      edge("dom->project", "domains/auth", "project", "contains"),
    ]);
    expect(model.ownerDomain).toBeNull();
  });

  it("keeps transitive reach finite on cycles", () => {
    // a → b → a 사이클. a 의 dependents 는 b 한 번만(무한 루프 X).
    const a = node("capabilities/a");
    const b = node("capabilities/b");
    const edges = [
      edge("a->b", "capabilities/a", "capabilities/b"),
      edge("b->a", "capabilities/b", "capabilities/a"),
    ];
    const model = buildTopologyOntologyDrawerModel(a, [a, b], edges);
    expect(model.reach).toEqual({ dependents: 1, dependencies: 1 });
  });

  it("keeps sourceSlug null for synthetic nodes without evidence", () => {
    const selected = node("capabilities/derived", "capability", []);

    expect(buildTopologyOntologyDrawerModel(selected, [selected], [])).toMatchObject({
      sourceSlug: null,
      incomingCount: 0,
      outgoingCount: 0,
      relationQuality: {
        strong: 0,
        supported: 0,
        weak: 0,
        review: 0,
      },
      previewRelations: [],
    });
  });

  it("classifies relation provenance by evidence / authorship (used by HomePage's relation-provenance breakdown)", () => {
    expect(
      classifyTopologyRelationProvenance(
        edge("source", "domains/ai", "capabilities/mcp", "contains", {
          evidenceIds: ["domains/ai"],
        }),
      ),
    ).toBe("source_backed");
    expect(
      classifyTopologyRelationProvenance(
        edge("authored", "domains/ai", "capabilities/mcp", "contains"),
      ),
    ).toBe("authored");
    expect(
      classifyTopologyRelationProvenance(
        edge("review", "domains/ai", "capabilities/mcp", "contains", {
          lastApprovedBy: "",
        }),
      ),
    ).toBe("needs_review");
  });
});
