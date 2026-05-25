import { describe, expect, it } from "vitest";
import {
  buildInsightsCollaboratorBrief,
  formatInsightsCollaboratorBrief,
  formatInsightsVocabularyReview,
} from "./collaborator-insights-brief";

const LABELS = {
  title: "Ontology collaborator brief",
  summary: "Use this brief for planning and vocabulary review.",
  nodes: "Nodes",
  relations: "Relations",
  domains: "Domains",
  crossDomain: "Cross-domain impact",
  orphans: "Open ownership questions",
  topHubs: "Shared vocabulary hubs",
  reviewVocabulary: "Review vocabulary",
  vocabularyTerm: "Term",
  vocabularyWhy: "Why it matters",
  vocabularyReuse: "Reuse review",
  vocabularyReuseAction: "align naming, owner, and reuse context before external handoff",
  reviewFocus: "Review focus",
  focusAlignVocabulary: "Align naming around the top hubs before teams reuse this vocabulary.",
  focusTraceImpact: "Trace cross-domain impact before changing scope or ownership.",
  focusResolveOrphans: "Resolve open ownership questions first.",
  decisionLane: "Decision lane",
  decisionOwner: "Decision owner",
  decisionExpected: "Expected decision",
  decisionNextStep: "Next graph step",
  decisionGraphHandoff: "Graph handoff",
  decisionAlignOwner: "Planning, marketing, and domain leads",
  decisionAlignExpected: "Approve reused terms and confirm vocabulary owners.",
  decisionAlignNextStep: "Open hub handoffs before copying terms into plans.",
  decisionImpactOwner: "Product and domain owners",
  decisionImpactExpected: "Confirm affected domains and scope boundaries.",
  decisionImpactNextStep: "Open the Topology Path handoff and replay domain-matrix checks.",
  decisionOrphanOwner: "Domain owner for each open concept",
  decisionOrphanExpected: "Assign a container, merge, rename, or delete the orphan.",
  decisionOrphanNextStep: "Open Builder or Topology health before writing.",
  decisionRecord: "Decision record",
  decisionRecordDecision: "Decision",
  decisionRecordOwner: "Owner",
  decisionRecordEvidence: "Evidence",
  decisionRecordFollowUp: "Follow-up",
  reviewQuestions: "Review questions",
  alignVocabularyQuestions: [
    "Which terms should be reused in planning docs?",
    "Which term should be renamed before handoff?",
    "Which hub needs a clearer owner?",
  ],
  traceImpactQuestions: [
    "Which domains are affected by the change?",
    "Which message or scope changes require owner review?",
    "Which implementation boundary should not move?",
  ],
  resolveOrphansQuestions: [
    "Who owns the unconnected concept?",
    "Which domain or capability should contain it?",
    "Should the concept be merged, deleted, or linked?",
  ],
  noHubs: "No connected hubs yet",
  hubHandoff: "Hub handoff",
  impactHandoff: "Impact handoff",
  impactHandoffExample: "example",
  impactHandoffPath: "Path",
  openQuestionHandoff: "Open question handoff",
  ontology: "Ontology",
  builder: "Builder",
  handoff: "Handoff",
  insights: "Insights",
  topology: "Topology health",
  topologyFocus: "Topology focus",
  topologyHealth: "Topology health",
  agentCheck: "Agent check",
  agentCliCheck: "CLI check",
  agentMcpCheck: "MCP check",
  impactCliCheck: "Impact CLI check",
  impactMcpCheck: "Impact MCP check",
};

describe("buildInsightsCollaboratorBrief", () => {
  it("prioritizes orphan review before cross-domain impact", () => {
    const brief = buildInsightsCollaboratorBrief({
      nodeCount: 12,
      relationCount: 18,
      domainCount: 3,
      crossDomainEdgeCount: 2,
      orphanCount: 1,
      openQuestions: [
        {
          id: "capabilities/approval-flow",
          title: "Approval flow",
          kind: "capability",
          ontologyHref: "/ontology/?node=capabilities%2Fapproval-flow",
          topologyHref: "/topology/?mode=health&p=capabilities%2Fapproval-flow",
          builderHref: "/ontology/edit/?node=capabilities%2Fapproval-flow",
        },
      ],
      topHubs: [
        {
          id: "capabilities/checkout",
          title: "Checkout",
          kind: "capability",
          degree: 7,
        },
      ],
    });

    expect(brief.reviewFocus).toBe("resolve_orphans");
    expect(brief.decisionLane).toEqual({
      owner: "domain_owner",
      expected: "assign_container_or_merge",
      nextStep: "open_builder_or_health_handoff",
    });
    expect(brief.decisionHandoff).toEqual({
      href: "/ontology/edit/?node=capabilities%2Fapproval-flow",
      surface: "builder",
      title: "Approval flow",
    });
    expect(brief.openQuestions).toEqual([
      {
        id: "capabilities/approval-flow",
        title: "Approval flow",
        kind: "capability",
        ontologyHref: "/ontology/?node=capabilities%2Fapproval-flow",
        topologyHref: "/topology/?mode=health&p=capabilities%2Fapproval-flow",
        builderHref: "/ontology/edit/?node=capabilities%2Fapproval-flow",
      },
    ]);
    expect(brief.topHubTitles).toEqual(["Checkout"]);
    expect(brief.topHubs[0]).toMatchObject({
      id: "capabilities/checkout",
      kind: "capability",
      degree: 7,
    });
    expect(brief.summaryMetrics).toContainEqual({
      key: "crossDomain",
      value: 2,
    });
  });

  it("uses cross-domain impact as the focus when all nodes are connected", () => {
    const brief = buildInsightsCollaboratorBrief({
      nodeCount: 12,
      relationCount: 18,
      domainCount: 3,
      crossDomainEdgeCount: 2,
      orphanCount: 0,
      topHubs: [],
    });

    expect(brief.reviewFocus).toBe("trace_impact");
  });

  it("formats a compact markdown brief for export or sharing", () => {
    const brief = buildInsightsCollaboratorBrief({
      nodeCount: 12,
      relationCount: 18,
      domainCount: 3,
      crossDomainEdgeCount: 0,
      orphanCount: 0,
      topHubs: [
        {
          title: "Agent Graph Readiness",
          kind: "capability",
          degree: 10,
          topologyHref:
            "/topology/?mode=focus&p=capabilities%2Fagent-graph-readiness",
        },
        { title: "Views", kind: "domain", degree: 8 },
      ],
    });

    expect(formatInsightsCollaboratorBrief({ brief, labels: LABELS })).toContain(
      "- Agent Graph Readiness (capability, degree 10)",
    );
    expect(formatInsightsCollaboratorBrief({ brief, labels: LABELS })).toContain(
      "## Metrics",
    );
    expect(formatInsightsCollaboratorBrief({ brief, labels: LABELS })).toContain(
      [
        "## Review vocabulary",
        "- Term: Agent Graph Readiness (capability) | Why it matters: degree 10 | Reuse review: align naming, owner, and reuse context before external handoff",
        "- Term: Views (domain) | Why it matters: degree 8 | Reuse review: align naming, owner, and reuse context before external handoff",
      ].join("\n"),
    );
    expect(formatInsightsCollaboratorBrief({ brief, labels: LABELS })).toContain(
      "Align naming around the top hubs before teams reuse this vocabulary.",
    );
    expect(formatInsightsCollaboratorBrief({ brief, labels: LABELS })).toContain(
      [
        "## Decision lane",
        "- Decision owner: Planning, marketing, and domain leads",
        "- Expected decision: Approve reused terms and confirm vocabulary owners.",
        "- Next graph step: Open hub handoffs before copying terms into plans.",
        "- Graph handoff: Agent Graph Readiness (Topology focus): /topology/?mode=focus&p=capabilities%2Fagent-graph-readiness",
      ].join("\n"),
    );
    expect(formatInsightsCollaboratorBrief({ brief, labels: LABELS })).toContain(
      [
        "## Decision record",
        "- Decision: Approve reused terms and confirm vocabulary owners.",
        "- Owner: Planning, marketing, and domain leads",
        "- Evidence: Agent Graph Readiness (Topology focus)",
        "- Follow-up: Open hub handoffs before copying terms into plans.",
      ].join("\n"),
    );
    expect(formatInsightsCollaboratorBrief({ brief, labels: LABELS })).toContain(
      [
        "## Review questions",
        "- Which terms should be reused in planning docs?",
        "- Which term should be renamed before handoff?",
        "- Which hub needs a clearer owner?",
      ].join("\n"),
    );
  });

  it("adds handoff links and agent check when provided", () => {
    const brief = buildInsightsCollaboratorBrief({
      nodeCount: 12,
      relationCount: 18,
      domainCount: 3,
      crossDomainEdgeCount: 1,
      orphanCount: 0,
      topHubs: [
        {
          id: "domains/views",
          title: "Views",
          kind: "domain",
          degree: 8,
          ontologyHref: "/ontology/?node=domains%2Fviews",
          topologyHref: "/topology/?mode=focus&p=domains%2Fviews",
          builderHref: "/ontology/edit/?node=domains%2Fviews",
        },
      ],
    });

    const formatted = formatInsightsCollaboratorBrief({
      brief,
      labels: LABELS,
      handoff: {
        insightsUrl: "/ontology/insights/",
        topologyUrl: "/topology/?mode=health",
        agentCheckCommand: "oh-my-ontology workspace-brief [vault] --limit 5",
        agentMcpCheckPayload:
          'query_ontology({"operation":"workspace_brief","limit":5})',
      },
    });

    expect(formatted).toContain(
      [
        "## Review vocabulary",
        "- Term: Views (domain, domains/views) | Why it matters: degree 8 | Reuse review: align naming, owner, and reuse context before external handoff",
      ].join("\n"),
    );
    expect(formatted).toContain(
      [
        "## Hub handoff",
        "- Views: Ontology: /ontology/?node=domains%2Fviews | Topology focus: /topology/?mode=focus&p=domains%2Fviews | Builder: /ontology/edit/?node=domains%2Fviews",
        "",
        "## Handoff",
        "- Insights: /ontology/insights/",
        "- Topology health: /topology/?mode=health",
        "- Agent check: oh-my-ontology workspace-brief [vault] --limit 5",
        "- CLI check: oh-my-ontology workspace-brief [vault] --limit 5",
        '- MCP check: query_ontology({"operation":"workspace_brief","limit":5})',
      ].join("\n"),
    );
    expect(formatted).toContain(
      [
        "## Decision record",
        "- Decision: Confirm affected domains and scope boundaries.",
        "- Owner: Product and domain owners",
        "- Evidence: Trace cross-domain impact before changing scope or ownership.",
        "- Follow-up: Open the Topology Path handoff and replay domain-matrix checks.",
        "- CLI check: oh-my-ontology workspace-brief [vault] --limit 5",
        '- MCP check: query_ontology({"operation":"workspace_brief","limit":5})',
      ].join("\n"),
    );
  });

  it("formats a compact vocabulary review packet without agent handoff noise", () => {
    const brief = buildInsightsCollaboratorBrief({
      nodeCount: 12,
      relationCount: 18,
      domainCount: 3,
      crossDomainEdgeCount: 0,
      orphanCount: 0,
      topHubs: [
        {
          id: "domains/views",
          title: "Views",
          kind: "domain",
          degree: 8,
          ontologyHref: "/ontology/?node=domains%2Fviews",
          topologyHref: "/topology/?mode=focus&p=domains%2Fviews",
          builderHref: "/ontology/edit/?node=domains%2Fviews",
        },
      ],
    });

    const formatted = formatInsightsVocabularyReview({ brief, labels: LABELS });

    expect(formatted).toContain("# Review vocabulary");
    expect(formatted).toContain("## Decision lane");
    expect(formatted).toContain(
      "- Expected decision: Approve reused terms and confirm vocabulary owners.",
    );
    expect(formatted).toContain("## Decision record");
    expect(formatted).toContain("- Decision: Approve reused terms and confirm vocabulary owners.");
    expect(formatted).toContain("- Evidence: Views (Topology focus)");
    expect(formatted).toContain("## Review questions");
    expect(formatted).toContain("- Which terms should be reused in planning docs?");
    expect(formatted).toContain(
      "- Term: Views (domain, domains/views) | Why it matters: degree 8 | Reuse review: align naming, owner, and reuse context before external handoff",
    );
    expect(formatted).toContain(
      "- Views: Ontology: /ontology/?node=domains%2Fviews | Topology focus: /topology/?mode=focus&p=domains%2Fviews | Builder: /ontology/edit/?node=domains%2Fviews",
    );
    expect(formatted).not.toContain("## Handoff");
    expect(formatted).not.toContain("MCP check");
    expect(formatted).not.toContain("CLI check:");
  });

  it("exports open question handoffs with exact node links", () => {
    const brief = buildInsightsCollaboratorBrief({
      nodeCount: 12,
      relationCount: 18,
      domainCount: 3,
      crossDomainEdgeCount: 0,
      orphanCount: 1,
      openQuestions: [
        {
          id: "capabilities/approval-flow",
          title: "Approval flow",
          kind: "capability",
          ontologyHref: "/ontology/?node=capabilities%2Fapproval-flow",
          topologyHref: "/topology/?mode=health&p=capabilities%2Fapproval-flow",
          builderHref: "/ontology/edit/?node=capabilities%2Fapproval-flow",
        },
      ],
      topHubs: [],
    });

    expect(formatInsightsCollaboratorBrief({ brief, labels: LABELS })).toContain(
      [
        "## Open question handoff",
        "- Approval flow (capability, capabilities/approval-flow): Ontology: /ontology/?node=capabilities%2Fapproval-flow | Topology health: /topology/?mode=health&p=capabilities%2Fapproval-flow | Builder: /ontology/edit/?node=capabilities%2Fapproval-flow",
      ].join("\n"),
    );
  });

  it("exports concrete impact handoffs with matrix replay checks", () => {
    const brief = buildInsightsCollaboratorBrief({
      nodeCount: 12,
      relationCount: 18,
      domainCount: 3,
      crossDomainEdgeCount: 4,
      orphanCount: 0,
      impactHandoffs: [
        {
          fromDomain: "Views",
          toDomain: "AI agent partner",
          count: 4,
          topologyPathHref:
            "/topology/?mode=path&pathFrom=views%2Fontology-insights&pathTo=capabilities%2Fagent-graph-readiness",
          example: {
            from: "views/ontology-insights",
            type: "describes",
            to: "capabilities/agent-graph-readiness",
          },
        },
      ],
      topHubs: [],
    });

    expect(brief.impactHandoffs).toEqual([
      {
        fromDomain: "Views",
        toDomain: "AI agent partner",
        count: 4,
        topologyPathHref:
          "/topology/?mode=path&pathFrom=views%2Fontology-insights&pathTo=capabilities%2Fagent-graph-readiness",
        example: {
          from: "views/ontology-insights",
          type: "describes",
          to: "capabilities/agent-graph-readiness",
        },
      },
    ]);
    expect(brief.decisionHandoff).toEqual({
      href: "/topology/?mode=path&pathFrom=views%2Fontology-insights&pathTo=capabilities%2Fagent-graph-readiness",
      surface: "path",
      title: "Views -> AI agent partner",
    });
    const formatted = formatInsightsCollaboratorBrief({
      brief,
      labels: LABELS,
      handoff: {
        insightsUrl: "/ontology/insights/",
        topologyUrl: "/topology/?mode=health",
        agentCheckCommand: "oh-my-ontology workspace-brief [vault] --limit 5",
        impactCliCheckCommand:
          "oh-my-ontology domain-matrix [vault] --limit 6 --types depends_on,relates,describes",
        impactMcpCheckPayload:
          'query_ontology({"operation":"domain_matrix","limit":6})',
      },
    });

    expect(formatted).toContain(
      [
        "## Impact handoff",
        "- Views -> AI agent partner: 4 Cross-domain impact. example: views/ontology-insights --describes--> capabilities/agent-graph-readiness Path: /topology/?mode=path&pathFrom=views%2Fontology-insights&pathTo=capabilities%2Fagent-graph-readiness",
        "",
        "## Handoff",
        "- Insights: /ontology/insights/",
        "- Topology health: /topology/?mode=health",
        "- Agent check: oh-my-ontology workspace-brief [vault] --limit 5",
        "- CLI check: oh-my-ontology workspace-brief [vault] --limit 5",
        "- Impact CLI check: oh-my-ontology domain-matrix [vault] --limit 6 --types depends_on,relates,describes",
        '- Impact MCP check: query_ontology({"operation":"domain_matrix","limit":6})',
      ].join("\n"),
    );
    expect(formatted).toContain(
      [
        "## Decision record",
        "- Decision: Confirm affected domains and scope boundaries.",
        "- Owner: Product and domain owners",
        "- Evidence: Views -> AI agent partner (Path)",
        "- Follow-up: Open the Topology Path handoff and replay domain-matrix checks.",
        "- CLI check: oh-my-ontology workspace-brief [vault] --limit 5",
        "- Impact CLI check: oh-my-ontology domain-matrix [vault] --limit 6 --types depends_on,relates,describes",
        '- Impact MCP check: query_ontology({"operation":"domain_matrix","limit":6})',
      ].join("\n"),
    );
  });
});
