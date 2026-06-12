import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildOntologyReviewBrief,
  formatOntologyReviewBrief,
  formatOntologyVocabularyReview,
  ontologyReviewQuestionsForPrompt,
} from "./review-brief";

function node(overrides: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
  return {
    id: "capability:mcp-server",
    title: "MCP Server",
    kind: "capability",
    projectIds: [],
    evidenceIds: ["capabilities/mcp-server"],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
    ...overrides,
  };
}

describe("buildOntologyReviewBrief", () => {
  it("uses capability vocabulary and trace-impact prompt for bidirectional relations", () => {
    expect(
      buildOntologyReviewBrief({
        node: node({ kind: "capability" }),
        incomingCount: 2,
        outgoingCount: 3,
        relationTypes: [
          { type: "contains", count: 1 },
          { type: "depends_on", count: 3 },
        ],
        relationPreview: [
          {
            direction: "incoming",
            type: "capabilities",
            title: "AI Agent Partner",
            kind: "domain",
            nodeId: "domains/ai-agent-partner",
          },
          {
            direction: "outgoing",
            type: "elements",
            title: "MCP Server",
            kind: "element",
            nodeId: "elements/mcp-server",
          },
        ],
        agentCheckSlug: "capabilities/mcp-server",
      }),
    ).toEqual({
      lens: "capability",
      prompt: "trace_impact",
      sourceSlug: "capabilities/mcp-server",
      relationSummary: {
        incoming: 2,
        outgoing: 3,
      },
      impactSummary: {
        level: "bidirectional",
        incomingCount: 2,
        outgoingCount: 3,
        firstIncoming: {
          direction: "incoming",
          type: "capabilities",
          title: "AI Agent Partner",
          kind: "domain",
          nodeId: "domains/ai-agent-partner",
        },
        firstOutgoing: {
          direction: "outgoing",
          type: "elements",
          title: "MCP Server",
          kind: "element",
          nodeId: "elements/mcp-server",
        },
      },
      relationTypes: [
        { type: "depends_on", count: 3 },
        { type: "contains", count: 1 },
      ],
      relationPreview: [
        {
          direction: "incoming",
          type: "capabilities",
          title: "AI Agent Partner",
          kind: "domain",
          nodeId: "domains/ai-agent-partner",
        },
        {
          direction: "outgoing",
          type: "elements",
          title: "MCP Server",
          kind: "element",
          nodeId: "elements/mcp-server",
        },
      ],
      handoffLinks: {
        topology: "/topology/?mode=focus&p=capability%3Amcp-server",
        builder: null,
        query: "/ontology/insights/",
      },
      agentChecks: {
        mcp: 'query_ontology({"operation":"node_profile","slug":"capabilities/mcp-server","limit":8})',
        cli: "ontology-atlas node capabilities/mcp-server --limit 8",
        impactMcp:
          'query_ontology({"operation":"blast_radius","slug":"capabilities/mcp-server","depth":2,"direction":"incoming"})',
        impactCli:
          "ontology-atlas blast-radius capabilities/mcp-server --depth 2 --direction incoming",
      },
    });
  });

  it("separates owner, usage, and dependent review prompts", () => {
    const selected = node({ kind: "element", evidenceIds: [] });

    expect(
      buildOntologyReviewBrief({
        node: selected,
        incomingCount: 0,
        outgoingCount: 0,
      }).prompt,
    ).toBe("define_owner");
    expect(
      buildOntologyReviewBrief({
        node: selected,
        incomingCount: 0,
        outgoingCount: 1,
      }).prompt,
    ).toBe("explain_usage");
    expect(
      buildOntologyReviewBrief({
        node: selected,
        incomingCount: 1,
        outgoingCount: 0,
      }).prompt,
    ).toBe("confirm_dependents");
  });

  it("keeps a focused query handoff when provided", () => {
    expect(
      buildOntologyReviewBrief({
        node: node({ kind: "capability" }),
        incomingCount: 1,
        outgoingCount: 0,
        queryHref: "/ontology/insights/?node=capabilities%2Fmcp-server",
      }).handoffLinks.query,
    ).toBe("/ontology/insights/?node=capabilities%2Fmcp-server");
  });
});

describe("formatOntologyReviewBrief", () => {
  it("formats a compact shareable review brief", () => {
    const selected = node({});
    const relationPreview = [
      {
        direction: "incoming" as const,
        type: "capabilities",
        title: "AI Agent Partner",
        kind: "domain",
        nodeId: "domains/ai-agent-partner",
      },
      {
        direction: "outgoing" as const,
        type: "elements",
        title: "Sigma",
        kind: "element",
        nodeId: "elements/sigma",
      },
    ];
    const brief = buildOntologyReviewBrief({
      node: selected,
      incomingCount: 1,
      outgoingCount: 2,
      relationTypes: [{ type: "depends_on", count: 2 }],
      relationPreview,
      topologyHref: "/topology/?mode=focus&p=capability%3Amcp-server",
      builderHref: "/ontology/edit/?node=capabilities%2Fmcp-server",
      queryHref: "/ontology/insights/?node=capabilities%2Fmcp-server",
      agentCheckSlug: "capabilities/mcp-server",
    });
    const text = formatOntologyReviewBrief({
      node: selected,
      brief,
      lensLabel: "User-visible capability",
      promptLabel: "Trace impact before changing vocabulary.",
      reviewQuestionsLabel: "Review questions",
      reviewQuestions: [
        "Which incoming references matter?",
        "Which outgoing dependencies explain it?",
      ],
      impactSummaryLabel: "Change impact",
      impactSummaryText: "Trace both directions first.",
      impactIncomingLabel: "First incoming",
      impactOutgoingLabel: "First outgoing",
      impactNoneLabel: "none yet",
      relationPreviewLabel: "Direct relation preview",
      relationPreview,
      noRelationPreviewLabel: "No direct relation evidence",
    });

    expect(text).toContain("- Relations: 2 outgoing / 1 incoming");
    expect(text).toContain("- Source: capabilities/mcp-server");
    expect(text).toContain("- Relation types: depends_on 2");
    expect(text).toContain("## Review questions\n- Which incoming references matter?");
    expect(text).toContain("## Change impact\n- Trace both directions first.");
    expect(text).toContain(
      "- First incoming: capabilities · AI Agent Partner (domain, domains/ai-agent-partner)",
    );
    expect(text).toContain(
      "- First outgoing: elements · Sigma (element, elements/sigma)",
    );
    expect(text).toContain(
      "## Direct relation preview\n- in · capabilities · AI Agent Partner (domain, domains/ai-agent-partner)",
    );
    expect(text).toContain("- out · elements · Sigma (element, elements/sigma)");
    expect(text).toContain("- Topology focus: /topology/?mode=focus&p=capability%3Amcp-server");
    expect(text).toContain("- Builder: /ontology/edit/?node=capabilities%2Fmcp-server");
    expect(text).toContain(
      "- Query cockpit: /ontology/insights/?node=capabilities%2Fmcp-server",
    );
    expect(text).toContain(
      '- MCP check: query_ontology({"operation":"node_profile","slug":"capabilities/mcp-server","limit":8})',
    );
    expect(text).toContain("- CLI check: ontology-atlas node capabilities/mcp-server --limit 8");
    expect(text).toContain(
      '- Impact MCP check: query_ontology({"operation":"blast_radius","slug":"capabilities/mcp-server","depth":2,"direction":"incoming"})',
    );
    expect(text).toContain(
      "- Impact CLI check: ontology-atlas blast-radius capabilities/mcp-server --depth 2 --direction incoming",
    );
  });

  it("localizes review brief structural labels for collaborator handoff", () => {
    const selected = node({});
    const relationPreview = [
      {
        direction: "incoming" as const,
        type: "capabilities",
        title: "AI Agent Partner",
        kind: "domain",
        nodeId: "domains/ai-agent-partner",
      },
      {
        direction: "outgoing" as const,
        type: "elements",
        title: "Sigma",
        kind: "element",
        nodeId: "elements/sigma",
      },
    ];
    const brief = buildOntologyReviewBrief({
      node: selected,
      incomingCount: 1,
      outgoingCount: 2,
      relationTypes: [{ type: "depends_on", count: 2 }],
      relationPreview,
      topologyHref: "/topology/?mode=focus&p=capability%3Amcp-server",
      builderHref: "/ontology/edit/?node=capabilities%2Fmcp-server",
      queryHref: "/ontology/insights/?node=capabilities%2Fmcp-server",
      agentCheckSlug: "capabilities/mcp-server",
    });

    const text = formatOntologyReviewBrief({
      node: selected,
      brief,
      labels: {
        kind: "유형",
        reviewLens: "리뷰 관점",
        source: "원천",
        sourceFallback: "원천 없음",
        relations: "관계",
        outgoingCount: "나가는 연결",
        incomingCount: "들어오는 연결",
        relationTypes: "관계 유형",
        relationTypeLabels: {
          capabilities: "역량",
          depends_on: "의존",
          elements: "요소",
        },
        reviewPrompt: "리뷰 프롬프트",
        topology: "지형도 포커스",
        builder: "저장·편집",
        query: "그래프 검증",
        mcpCheck: "MCP 점검",
        cliCheck: "터미널 점검",
        impactMcpCheck: "MCP 영향 점검",
        impactCliCheck: "터미널 영향 점검",
        incoming: "들어오는 연결",
        outgoing: "나가는 연결",
      },
      lensLabel: "사용자에게 보이는 역량",
      promptLabel: "개념을 바꾸기 전에 영향을 추적하세요.",
      reviewQuestionsLabel: "확인 질문",
      reviewQuestions: ["어떤 들어오는 연결을 먼저 확인해야 하나요?"],
      impactSummaryLabel: "변경 영향",
      impactSummaryText: "양방향을 함께 추적하세요.",
      impactIncomingLabel: "처음 들어오는 연결",
      impactOutgoingLabel: "처음 나가는 연결",
      impactNoneLabel: "아직 없음",
      relationPreviewLabel: "연결된 개념",
      relationPreview,
      noRelationPreviewLabel: "직접 관계 근거 없음",
    });

    expect(text).toContain("- 유형: capability");
    expect(text).toContain("- 리뷰 관점: 사용자에게 보이는 역량");
    expect(text).toContain("- 원천: capabilities/mcp-server");
    expect(text).toContain("- 관계: 나가는 연결 2 / 들어오는 연결 1");
    expect(text).toContain("- 관계 유형: 의존 2");
    expect(text).toContain("- 리뷰 프롬프트: 개념을 바꾸기 전에 영향을 추적하세요.");
    expect(text).toContain(
      "- 처음 들어오는 연결: 역량 · AI Agent Partner (domain, domains/ai-agent-partner)",
    );
    expect(text).toContain(
      "- 처음 나가는 연결: 요소 · Sigma (element, elements/sigma)",
    );
    expect(text).toContain(
      "## 연결된 개념\n- 들어오는 연결 · 역량 · AI Agent Partner (domain, domains/ai-agent-partner)",
    );
    expect(text).toContain(
      "- 나가는 연결 · 요소 · Sigma (element, elements/sigma)",
    );
    expect(text).toContain("- 지형도 포커스: /topology/?mode=focus&p=capability%3Amcp-server");
    expect(text).toContain("- 저장·편집: /ontology/edit/?node=capabilities%2Fmcp-server");
    expect(text).toContain("- 그래프 검증: /ontology/insights/?node=capabilities%2Fmcp-server");
    expect(text).toContain(
      '- MCP 점검: query_ontology({"operation":"node_profile","slug":"capabilities/mcp-server","limit":8})',
    );
    expect(text).not.toContain("- Kind:");
    expect(text).not.toContain("outgoing /");
    expect(text).not.toContain("- Relation types:");
    expect(text).not.toContain("depends_on 2");
    expect(text).not.toContain("- in ·");
    expect(text).not.toContain("- out ·");
    expect(text).not.toContain("capabilities · AI Agent Partner");
  });

  it("selects review questions for the active prompt", () => {
    expect(
      ontologyReviewQuestionsForPrompt("confirm_dependents", {
        define_owner: ["define"],
        explain_usage: ["usage"],
        confirm_dependents: ["dependent"],
        trace_impact: ["impact"],
      }),
    ).toEqual(["dependent"]);
  });

  it("formats a lightweight vocabulary packet for planning review", () => {
    const selected = node({
      title: "MCP Server",
      summary: "Agent-facing ontology tools over the local vault.",
    });
    const brief = buildOntologyReviewBrief({
      node: selected,
      incomingCount: 1,
      outgoingCount: 1,
      topologyHref: "/topology/?mode=focus&p=capability%3Amcp-server",
      builderHref: "/ontology/edit/?node=capabilities%2Fmcp-server",
      relationTypes: [
        { type: "contains", count: 1 },
        { type: "depends_on", count: 1 },
      ],
      relationPreview: [
        {
          direction: "incoming",
          type: "capabilities",
          title: "AI Agent Partner",
          kind: "domain",
          nodeId: "domains/ai-agent-partner",
        },
      ],
    });

    expect(
      formatOntologyVocabularyReview({
        node: selected,
        brief,
        reviewQuestions: ["Which incoming references should be checked first?"],
        labels: {
          term: "Term",
          node: "Node",
          kind: "Kind",
          source: "Source",
          relationSummary: "Relations",
          outgoingCount: "outgoing",
          incomingCount: "incoming",
          relationTypeLabels: {},
          title: "Review vocabulary",
          meaningToKeep: "Meaning to keep",
          reuseContext: "Reuse context",
          reviewQuestions: "Review questions",
          relationAnchors: "Relation anchors",
          handoff: "Handoff",
          topology: "Topology focus",
          builder: "Builder",
          query: "Query cockpit",
          sourceFallback: "no source",
          noRelationPreview: "No direct relation evidence",
          incoming: "Incoming",
          outgoing: "Outgoing",
        },
      }),
    ).toBe(
      [
        "# Review vocabulary: MCP Server",
        "",
        "- Term: MCP Server",
        "- Node: capability:mcp-server",
        "- Kind: capability",
        "- Source: capabilities/mcp-server",
        "",
        "## Meaning to keep",
        "- Agent-facing ontology tools over the local vault.",
        "",
        "## Reuse context",
        "- Relations: outgoing 1 / incoming 1",
        "- contains 1, depends_on 1",
        "",
        "## Review questions",
        "- Which incoming references should be checked first?",
        "",
        "## Relation anchors",
        "- Incoming capabilities: AI Agent Partner (domain, domains/ai-agent-partner)",
        "",
        "## Handoff",
        "- Topology focus: /topology/?mode=focus&p=capability%3Amcp-server",
        "- Builder: /ontology/edit/?node=capabilities%2Fmcp-server",
        "- Query cockpit: /ontology/insights/",
      ].join("\n"),
    );
  });

  it("localizes vocabulary packet structural labels for collaborator handoff", () => {
    const selected = node({
      title: "MCP Server",
      summary: "Agent-facing ontology tools over the local vault.",
    });
    const brief = buildOntologyReviewBrief({
      node: selected,
      incomingCount: 1,
      outgoingCount: 1,
      relationTypes: [
        { type: "contains", count: 1 },
        { type: "depends_on", count: 1 },
      ],
      relationPreview: [
        {
          direction: "incoming",
          type: "contains",
          title: "AI Agent Partner",
          kind: "domain",
          nodeId: "domains/ai-agent-partner",
        },
      ],
    });

    const text = formatOntologyVocabularyReview({
      node: selected,
      brief,
      reviewQuestions: ["어떤 들어오는 연결을 먼저 확인해야 하나요?"],
      labels: {
        term: "용어",
        node: "개념",
        kind: "유형",
        source: "원천",
        relationSummary: "관계",
        outgoingCount: "나가는 연결",
        incomingCount: "들어오는 연결",
        relationTypeLabels: {
          contains: "포함",
          depends_on: "의존",
        },
        title: "리뷰 어휘",
        meaningToKeep: "유지해야 할 의미",
        reuseContext: "재사용 맥락",
        reviewQuestions: "리뷰 질문",
        relationAnchors: "관계 기준점",
        handoff: "넘겨줄 항목",
        topology: "지형도 포커스",
        builder: "저장·편집",
        query: "그래프 검증",
        sourceFallback: "원천 없음",
        noRelationPreview: "직접 연결 근거 없음",
        incoming: "들어오는 연결",
        outgoing: "나가는 연결",
      } as Parameters<typeof formatOntologyVocabularyReview>[0]["labels"],
    });

    expect(text).toContain("- 용어: MCP Server");
    expect(text).toContain("- 개념: capability:mcp-server");
    expect(text).toContain("- 유형: capability");
    expect(text).toContain("- 원천: capabilities/mcp-server");
    expect(text).toContain("- 관계: 나가는 연결 1 / 들어오는 연결 1");
    expect(text).toContain("- 포함 1, 의존 1");
    expect(text).toContain(
      "- 들어오는 연결 포함: AI Agent Partner (domain, domains/ai-agent-partner)",
    );
    expect(text).not.toContain("- Term:");
    expect(text).not.toContain("- Node:");
    expect(text).not.toContain("- Kind:");
    expect(text).not.toContain("outgoing /");
    expect(text).not.toContain("incoming relations");
    expect(text).not.toContain("contains 1");
  });
});
