import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import {
  buildTopologyOntologyDrawerModel,
  formatTopologyCollaboratorBrief,
  classifyTopologyRelationProvenance,
  formatTopologyNodeCliCheck,
  formatTopologyNodeImpactCliCheck,
  formatTopologyNodeImpactMcpCheck,
  formatTopologyNodeMcpCheck,
  formatTopologyRelationExplainMcpCheck,
  formatTopologyRelationPreflightMcpCheck,
  formatTopologyVocabularyReview,
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
      impactSummary: {
        level: "bidirectional",
        firstIncoming: {
          direction: "incoming",
          other: { id: "domains/ai-agent-partner" },
          edge: { type: "contains" },
        },
        firstOutgoing: {
          direction: "outgoing",
          other: { id: "elements/mcp-sdk" },
          edge: { type: "uses" },
        },
      },
      collaborator: {
        lens: "capability",
        review: "trace_impact",
        chips: ["source", "impact", "vocabulary"],
      },
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
      impactSummary: {
        level: "needs_owner",
        firstIncoming: null,
        firstOutgoing: null,
      },
      collaborator: {
        lens: "capability",
        review: "define_owner",
        chips: ["vocabulary"],
      },
    });
  });

  it("separates usage explanation from dependent confirmation for collaborator review", () => {
    const selected = node("elements/parser", "element");
    const upstreamOnly = buildTopologyOntologyDrawerModel(
      selected,
      [selected, node("capabilities/mcp-server")],
      [edge("selected->cap", selected.id, "capabilities/mcp-server", "depends_on")],
    );
    const downstreamOnly = buildTopologyOntologyDrawerModel(
      selected,
      [selected, node("capabilities/mcp-server")],
      [edge("cap->selected", "capabilities/mcp-server", selected.id, "uses")],
    );

    expect(upstreamOnly.collaborator).toMatchObject({
      lens: "element",
      review: "explain_usage",
      chips: ["source", "impact"],
    });
    expect(upstreamOnly.impactSummary).toMatchObject({
      level: "usage_only",
      firstIncoming: null,
      firstOutgoing: { edge: { type: "depends_on" } },
    });
    expect(downstreamOnly.collaborator).toMatchObject({
      lens: "element",
      review: "confirm_dependents",
      chips: ["source", "impact"],
    });
    expect(downstreamOnly.impactSummary).toMatchObject({
      level: "dependent_only",
      firstIncoming: { edge: { type: "uses" } },
      firstOutgoing: null,
    });
  });

  it("formats a copyable collaborator brief with source and relation context", () => {
    const selected = node("capabilities/mcp-server");
    const model = buildTopologyOntologyDrawerModel(
      selected,
      [selected, node("domains/ai-agent-partner", "domain")],
      [edge("domain->cap", "domains/ai-agent-partner", selected.id, "contains")],
    );
    const result = formatTopologyCollaboratorBrief({
      node: selected,
      model,
      labels: {
        kind: "Kind",
        node: "Node",
        reviewLens: "Review lens",
        source: "Source",
        relations: "Relations",
        reviewPrompt: "Review prompt",
        outgoingCount: "outgoing",
        incomingCount: "incoming",
        relationQualityGate: "Relation quality gate",
        relationQualityInterpretation:
          "Direct links are typed ontology facts, not similarity scores.",
        relationQualityPreflight: "Preflight",
        relationQualityEvidence: "Evidence",
        relationQualityNoAnchor: "No direct relation anchor",
        relationQualityProvenance: "Provenance",
        relationProvenanceLabels: {
          source_backed: "source-backed",
          authored: "authored",
          needs_review: "needs review",
        },
        lens: "User-visible capability or behavior",
        review: "Confirm who relies on this concept.",
        reviewQuestions: "Review questions",
        impactSummary: "Change impact",
        impactSummaryText: "Check incoming dependents first.",
        reachTitle: "Change reach",
        reachDependents: "Affected",
        reachDependencies: "Depends on",
        firstIncoming: "First incoming",
        firstOutgoing: "First outgoing",
        noImpactRelation: "none yet",
        defineOwnerQuestions: [
          "Who owns this concept?",
          "Which container owns it?",
          "What meaning must be true?",
        ],
        explainUsageQuestions: [
          "What does this depend on?",
          "Why does it matter?",
          "Who needs the explanation?",
        ],
        confirmDependentsQuestions: [
          "Who relies on this concept?",
          "What breaks if it changes?",
          "Who should confirm the change?",
        ],
        traceImpactQuestions: [
          "Which incoming references matter?",
          "Which outgoing dependencies explain it?",
          "Which boundary should not move?",
        ],
        sourceFallback: "no source",
        relationTypes: "Relation types",
        previewRelations: "Preview relations",
        noPreviewRelations: "No direct relation evidence",
        handoff: "Handoff",
        topology: "Topology",
        ontology: "Ontology",
        builder: "Builder",
        agentCheck: "Agent check",
        mcpCheck: "MCP check",
        impactCheck: "Impact check",
        mcpImpactCheck: "MCP impact check",
        syncGate: "Post-change sync gate",
        incoming: "Incoming",
        outgoing: "Outgoing",
        relationTypeLabels: {
          contains: "Contains",
        },
      },
      handoff: {
        topology: "/topology/?p=capabilities%2Fmcp-server",
        ontology: "/ontology/?node=capabilities%2Fmcp-server",
        builder: "/ontology/edit/?node=capabilities%2Fmcp-server",
        agentCheck:
          "ontology-atlas node capabilities/mcp-server [vault] --limit 12",
        mcpCheck:
          'query_ontology({"operation":"node_profile","slug":"capabilities/mcp-server","depth":2,"limit":12})',
        impactCheck:
          "ontology-atlas blast-radius capabilities/mcp-server [vault] --depth 2 --direction incoming",
        mcpImpactCheck:
          'query_ontology({"operation":"blast_radius","slug":"capabilities/mcp-server","depth":2,"direction":"incoming"})',
        syncGate:
          "# Post-change ontology sync gate\n\n## MCP\n1. query_ontology",
      },
    });

    expect(result).toBe(
      [
        "# capabilities/mcp-server",
        "",
        "- Kind: capability",
        "- Node: capabilities/mcp-server",
        "- Review lens: User-visible capability or behavior",
        "- Source: capabilities/mcp-server",
        "- Relations: outgoing 0 / incoming 1",
        "- Relation types: Contains 1",
        "- Provenance: authored 1",
        "- Review prompt: Confirm who relies on this concept.",
        "",
        "## Relation quality gate",
        "- Direct links are typed ontology facts, not similarity scores.",
        '- Preflight: query_ontology({"operation":"relation_check","from":"domains/ai-agent-partner","to":"capabilities/mcp-server","type":"contains"})',
        '- Evidence: query_ontology({"operation":"explain_relation","from":"domains/ai-agent-partner","to":"capabilities/mcp-server","direction":"undirected","maxHops":5,"limit":10})',
        "",
        "## Review questions",
        "- Who relies on this concept?",
        "- What breaks if it changes?",
        "- Who should confirm the change?",
        "",
        "## Change impact",
        "- Check incoming dependents first.",
        "- Change reach: Affected 1, Depends on 0",
        "- First incoming: Contains · domains/ai-agent-partner (domains/ai-agent-partner)",
        "- First outgoing: none yet",
        "",
        "## Preview relations",
        "- Incoming Contains <- domains/ai-agent-partner (domains/ai-agent-partner)",
        "",
        "## Handoff",
        "- Topology: /topology/?p=capabilities%2Fmcp-server",
        "- Ontology: /ontology/?node=capabilities%2Fmcp-server",
        "- Builder: /ontology/edit/?node=capabilities%2Fmcp-server",
        "- Agent check: ontology-atlas node capabilities/mcp-server [vault] --limit 12",
        '- MCP check: query_ontology({"operation":"node_profile","slug":"capabilities/mcp-server","depth":2,"limit":12})',
        "- Impact check: ontology-atlas blast-radius capabilities/mcp-server [vault] --depth 2 --direction incoming",
        '- MCP impact check: query_ontology({"operation":"blast_radius","slug":"capabilities/mcp-server","depth":2,"direction":"incoming"})',
        "- Post-change sync gate:",
        "  # Post-change ontology sync gate",
        "",
        "  ## MCP",
        "  1. query_ontology",
      ].join("\n"),
    );
  });

  it("localizes collaborator brief structural labels for non-developer handoff", () => {
    const selected = node("capabilities/mcp-server");
    const model = buildTopologyOntologyDrawerModel(
      selected,
      [selected, node("domains/ai-agent-partner", "domain")],
      [edge("domain->cap", "domains/ai-agent-partner", selected.id, "contains")],
    );
    const result = formatTopologyCollaboratorBrief({
      node: selected,
      model,
      labels: {
        kind: "유형",
        node: "개념",
        reviewLens: "리뷰 관점",
        source: "원천",
        relations: "관계",
        reviewPrompt: "리뷰 프롬프트",
        outgoingCount: "나가는 연결",
        incomingCount: "들어오는 연결",
        relationQualityGate: "관계 품질 점검",
        relationQualityInterpretation:
          "직접 연결은 타입이 있는 온톨로지 사실입니다.",
        relationQualityPreflight: "사전 점검",
        relationQualityEvidence: "근거 확인",
        relationQualityNoAnchor: "직접 관계 없음",
        relationQualityProvenance: "출처 상태",
        relationProvenanceLabels: {
          source_backed: "근거 있음",
          authored: "작성됨",
          needs_review: "검토 필요",
        },
        lens: "사용자가 보는 역량",
        review: "누가 이 개념에 기대는지 확인하세요.",
        reviewQuestions: "리뷰 질문",
        impactSummary: "변경 영향",
        impactSummaryText: "들어오는 영향을 먼저 확인하세요.",
        reachTitle: "변경 범위",
        reachDependents: "영향받음",
        reachDependencies: "기대는 곳",
        firstIncoming: "첫 들어오는 연결",
        firstOutgoing: "첫 나가는 연결",
        noImpactRelation: "아직 없음",
        defineOwnerQuestions: ["누가 소유하나요?"],
        explainUsageQuestions: ["무엇에 기대나요?"],
        confirmDependentsQuestions: ["누가 기대나요?"],
        traceImpactQuestions: ["어떤 관계가 중요하나요?"],
        sourceFallback: "원천 없음",
        relationTypes: "관계 유형",
        previewRelations: "연결 목록",
        noPreviewRelations: "연결 없음",
        handoff: "넘겨줄 항목",
        topology: "지형도",
        ontology: "온톨로지",
        builder: "저장·편집",
        agentCheck: "에이전트 점검",
        mcpCheck: "MCP 점검",
        impactCheck: "영향 점검",
        mcpImpactCheck: "MCP 영향 점검",
        syncGate: "수정 후 동기화 점검",
        incoming: "들어오는 연결",
        outgoing: "나가는 연결",
        relationTypeLabels: {
          contains: "포함",
        },
      } as Parameters<typeof formatTopologyCollaboratorBrief>[0]["labels"],
    });

    expect(result).toContain("- 유형: capability");
    expect(result).toContain("- 개념: capabilities/mcp-server");
    expect(result).toContain("- 리뷰 관점: 사용자가 보는 역량");
    expect(result).toContain("- 원천: capabilities/mcp-server");
    expect(result).toContain("- 관계: 나가는 연결 0 / 들어오는 연결 1");
    expect(result).toContain("- 출처 상태: 작성됨 1");
    expect(result).toContain("## 관계 품질 점검");
    expect(result).toContain("- 직접 연결은 타입이 있는 온톨로지 사실입니다.");
    expect(result).toContain(
      '- 사전 점검: query_ontology({"operation":"relation_check","from":"domains/ai-agent-partner","to":"capabilities/mcp-server","type":"contains"})',
    );
    expect(result).toContain("- 리뷰 프롬프트: 누가 이 개념에 기대는지 확인하세요.");
    expect(result).toContain("- 첫 들어오는 연결: 포함");
    expect(result).toContain("- 들어오는 연결 포함 <- domains/ai-agent-partner");
    expect(result).not.toContain("- Kind:");
    expect(result).not.toContain("- Node:");
    expect(result).not.toContain("outgoing /");
    expect(result).not.toContain("incoming");
  });

  it("formats a selected node MCP profile payload for agent handoff", () => {
    expect(formatTopologyNodeCliCheck("capabilities/mcp-server")).toBe(
      "ontology-atlas node capabilities/mcp-server [vault] --limit 12",
    );
    expect(formatTopologyNodeMcpCheck("capabilities/mcp-server")).toBe(
      'query_ontology({"operation":"node_profile","slug":"capabilities/mcp-server","depth":2,"limit":12})',
    );
    expect(formatTopologyNodeImpactCliCheck("capabilities/mcp-server")).toBe(
      "ontology-atlas blast-radius capabilities/mcp-server [vault] --depth 2 --direction incoming",
    );
    expect(formatTopologyNodeImpactMcpCheck("capabilities/mcp-server")).toBe(
      'query_ontology({"operation":"blast_radius","slug":"capabilities/mcp-server","depth":2,"direction":"incoming"})',
    );
    expect(
      formatTopologyRelationPreflightMcpCheck(
        edge(
          "domain->cap",
          "domains/ai-agent-partner",
          "capabilities/mcp-server",
          "contains",
        ),
      ),
    ).toBe(
      'query_ontology({"operation":"relation_check","from":"domains/ai-agent-partner","to":"capabilities/mcp-server","type":"contains"})',
    );
    expect(
      formatTopologyRelationExplainMcpCheck(
        edge(
          "domain->cap",
          "domains/ai-agent-partner",
          "capabilities/mcp-server",
          "contains",
        ),
      ),
    ).toBe(
      'query_ontology({"operation":"explain_relation","from":"domains/ai-agent-partner","to":"capabilities/mcp-server","direction":"undirected","maxHops":5,"limit":10})',
    );
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

  it("formats a compact vocabulary review packet for secondary collaborators", () => {
    const selected = {
      ...node("capabilities/topology-ontology-inspection"),
      title: "Topology Ontology Inspection",
      summary: "Inspect selected topology concepts with source and relation context.",
    };
    const model = buildTopologyOntologyDrawerModel(
      selected,
      [selected, node("domains/views", "domain")],
      [edge("domain->cap", "domains/views", selected.id, "contains")],
    );

    expect(
      formatTopologyVocabularyReview({
        node: selected,
        model,
        labels: {
          term: "Term",
          slug: "Slug",
          kind: "Kind",
          source: "Source",
          relationSummary: "Relations",
          outgoingCount: "outgoing",
          incomingCount: "incoming",
          title: "Review vocabulary",
          meaningToKeep: "Meaning to keep",
          reuseContext: "Reuse context",
          reviewQuestions: "Review questions",
          relationAnchors: "Relation anchors",
          noPreviewRelations: "No direct relation evidence",
          sourceFallback: "no source",
          defineOwnerQuestions: [
            "Who owns this concept?",
            "Which container owns it?",
            "What meaning must be true?",
          ],
          explainUsageQuestions: [
            "What does this depend on?",
            "Why does it matter?",
            "Who needs the explanation?",
          ],
          confirmDependentsQuestions: [
            "Who relies on this concept?",
            "What breaks if it changes?",
            "Who should confirm the change?",
          ],
          traceImpactQuestions: [
            "Which incoming references matter?",
            "Which outgoing dependencies explain it?",
            "Which boundary should not move?",
          ],
          incoming: "Incoming",
          outgoing: "Outgoing",
          relationTypeLabels: {
            contains: "Contains",
          },
        },
      }),
    ).toBe(
      [
        "# Review vocabulary: Topology Ontology Inspection",
        "",
        "- Term: Topology Ontology Inspection",
        "- Slug: capabilities/topology-ontology-inspection",
        "- Kind: capability",
        "- Source: capabilities/topology-ontology-inspection",
        "",
        "## Meaning to keep",
        "- Inspect selected topology concepts with source and relation context.",
        "",
        "## Reuse context",
        "- Relations: outgoing 0 / incoming 1",
        "- Contains 1",
        "",
        "## Review questions",
        "- Who relies on this concept?",
        "- What breaks if it changes?",
        "- Who should confirm the change?",
        "",
        "## Relation anchors",
        "- Incoming Contains: domains/views (domains/views)",
      ].join("\n"),
    );
  });
});
