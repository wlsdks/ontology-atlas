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
        cli: "oh-my-ontology node capabilities/mcp-server --limit 8",
        impactMcp:
          'query_ontology({"operation":"blast_radius","slug":"capabilities/mcp-server","depth":2,"direction":"incoming"})',
        impactCli:
          "oh-my-ontology blast-radius capabilities/mcp-server --depth 2 --direction incoming",
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
    expect(text).toContain("- CLI check: oh-my-ontology node capabilities/mcp-server --limit 8");
    expect(text).toContain(
      '- Impact MCP check: query_ontology({"operation":"blast_radius","slug":"capabilities/mcp-server","depth":2,"direction":"incoming"})',
    );
    expect(text).toContain(
      "- Impact CLI check: oh-my-ontology blast-radius capabilities/mcp-server --depth 2 --direction incoming",
    );
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
        "- 1 outgoing / 1 incoming relations",
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
});
