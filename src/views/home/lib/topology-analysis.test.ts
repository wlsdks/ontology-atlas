import { describe, expect, it } from "vitest";
import {
  buildTopologyAnalysisSummary,
  buildTopologyHealthActionTarget,
  buildTopologyHealthRepairHref,
  formatTopologyFocusBrief,
  formatTopologyHealthBrief,
  formatTopologyHealthMcpCheck,
  formatTopologyHealthOwnerRelationMcpCheck,
  formatTopologyOverviewBrief,
  formatTopologyPathAllPathsMcpCheck,
  formatTopologyPathAllPathsPlanMcpCheck,
  formatTopologyPathEvidenceBrief,
  formatTopologyPathExplainRelationMcpCheck,
  formatTopologyPathMcpCheck,
  formatTopologyPathRelationPreflightMcpCheck,
} from "./topology-analysis";

describe("buildTopologyAnalysisSummary", () => {
  it("summarizes overview as total nodes and relations", () => {
    expect(
      buildTopologyAnalysisSummary({
        mode: "overview",
        selectedTitle: null,
        visibleCount: 12,
        totalCount: 36,
        relationCount: 88,
        staleCount: 1,
        orphanCount: 2,
        promotionCount: 3,
      }),
    ).toEqual({
      mode: "overview",
      primaryMetric: 36,
      secondaryMetric: 88,
      needsSelection: false,
      healthBreakdown: {
        stale: 1,
        orphan: 2,
        promotion: 3,
      },
    });
  });

  it("marks focus and path as selection-dependent", () => {
    expect(
      buildTopologyAnalysisSummary({
        mode: "path",
        selectedTitle: null,
        visibleCount: 8,
        totalCount: 36,
        relationCount: 88,
        staleCount: 0,
        orphanCount: 0,
        promotionCount: 0,
      }),
    ).toMatchObject({
      primaryMetric: 8,
      needsSelection: true,
    });
  });

  it("summarizes health by actionable graph issues", () => {
    expect(
      buildTopologyAnalysisSummary({
        mode: "health",
        selectedTitle: "MCP Server",
        visibleCount: 8,
        totalCount: 36,
        relationCount: 88,
        staleCount: 2,
        orphanCount: 1,
        promotionCount: 3,
      }),
    ).toMatchObject({
      primaryMetric: 6,
      secondaryMetric: 88,
      needsSelection: false,
      healthBreakdown: {
        stale: 2,
        orphan: 1,
        promotion: 3,
      },
    });
  });
});

describe("buildTopologyHealthActionTarget", () => {
  it("prioritizes stale, then orphan, then promotion targets", () => {
    expect(
      buildTopologyHealthActionTarget({
        stale: [{ slug: "old", name: "Old" }],
        orphan: [{ slug: "alone", name: "Alone" }],
        promotion: [{ slug: "hub", name: "Hub" }],
      }),
    ).toEqual({ slug: "old", title: "Old", kind: "stale" });

    expect(
      buildTopologyHealthActionTarget({
        stale: [],
        orphan: [{ slug: "alone", name: "Alone" }],
        promotion: [{ slug: "hub", name: "Hub" }],
      }),
    ).toEqual({ slug: "alone", title: "Alone", kind: "orphan" });

    expect(
      buildTopologyHealthActionTarget({
        stale: [],
        orphan: [],
        promotion: [{ slug: "hub", name: "Hub" }],
      }),
    ).toEqual({ slug: "hub", title: "Hub", kind: "promotion" });
  });

  it("returns null when health mode has no actionable project target", () => {
    expect(
      buildTopologyHealthActionTarget({
        stale: [],
        orphan: [],
        promotion: [],
      }),
    ).toBeNull();
  });
});

describe("formatTopologyOverviewBrief", () => {
  it("formats a portable overview with graph, health, CLI, and MCP checks", () => {
    expect(
      formatTopologyOverviewBrief({
        summary: {
          primaryMetric: 36,
          secondaryMetric: 88,
          healthBreakdown: {
            stale: 1,
            orphan: 2,
            promotion: 3,
          },
        },
        labels: {
          title: "Topology overview brief",
          totalNodes: "Total nodes",
          totalRelations: "Total relations",
          healthSignals: "Health signals",
          stale: "Stale",
          orphan: "Open questions",
          promotion: "Hub candidates",
          url: "URL",
          healthUrl: "Health URL",
          insightsUrl: "Insights URL",
          agentCheck: "Agent overview check",
          mcpCheck: "MCP overview check",
          mcpQueryPlan: "MCP query plan",
          workspaceCheck: "Workspace check",
          mcpWorkspaceCheck: "MCP workspace check",
        },
        url: "http://localhost:3000/en/topology",
        healthUrl: "http://localhost:3000/en/topology?mode=health",
        insightsUrl: "/ontology/insights/",
      }),
    ).toBe(
      [
        "# Topology overview brief",
        "- Total nodes: 36",
        "- Total relations: 88",
        "- Health signals: 6",
        "- Stale: 1",
        "- Open questions: 2",
        "- Hub candidates: 3",
        "- URL: http://localhost:3000/en/topology",
        "- Health URL: http://localhost:3000/en/topology?mode=health",
        "- Insights URL: /ontology/insights/",
        "- Agent overview check: oh-my-ontology overview [vault] --limit 5",
        '- MCP overview check: query_ontology({"operation":"overview","limit":5})',
        '- MCP query plan: query_ontology({"operation":"query_plan","targetOperation":"overview"})',
        "- Workspace check: oh-my-ontology workspace-brief [vault]",
        '- MCP workspace check: query_ontology({"operation":"workspace_brief"})',
      ].join("\n"),
    );
  });
});

describe("formatTopologyHealthBrief", () => {
  it("formats a copyable health review brief with counts and inspect target", () => {
    expect(
      formatTopologyHealthBrief({
        summary: {
          primaryMetric: 4,
          healthBreakdown: {
            stale: 1,
            orphan: 2,
            promotion: 1,
          },
        },
        actionTarget: {
          slug: "capability:topology-analysis-modes",
          title: "Topology Analysis Modes",
          kind: "promotion",
        },
        labels: {
          title: "Topology health evidence",
          total: "Issues",
          stale: "Stale",
          orphan: "Open questions",
          promotion: "Hub candidates",
          inspect: "Inspect first",
          inspectUrl: "Inspect URL",
          repairUrl: "Repair URL",
          nextAction: "Next action",
          agentCheck: "Agent check",
          mcpCheck: "MCP check",
          relationPreflight: "Owner relation preflight",
          mcpRelationPreflight: "MCP owner relation preflight",
          impactCheck: "Impact check",
          mcpImpactCheck: "MCP impact check",
          syncGate: "Post-repair sync gate",
          actionStale: "Refresh source evidence or confirm this concept is still active.",
          actionOrphan:
            "Connect this node to its owner/domain or document why it should stay standalone.",
          actionPromotion:
            "Review whether this high-signal node should become a domain or capability entrypoint.",
          none: "No actionable target",
          url: "URL",
        },
        url: "http://localhost:3000/en/topology?mode=health",
        inspectUrl:
          "http://localhost:3000/en/topology?mode=health&p=capability%3Atopology-analysis-modes",
        syncGatePacket: "# Post-change ontology sync gate\n\n## MCP\n1. query_ontology",
      }),
    ).toBe(
      [
        "# Topology health evidence",
        "- Issues: 4",
        "- Stale: 1",
        "- Open questions: 2",
        "- Hub candidates: 1",
        "- Inspect first: promotion · Topology Analysis Modes (capability:topology-analysis-modes)",
        "- URL: http://localhost:3000/en/topology?mode=health",
        "- Inspect URL: http://localhost:3000/en/topology?mode=health&p=capability%3Atopology-analysis-modes",
        "- Repair URL: /ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
        "- Next action: Review whether this high-signal node should become a domain or capability entrypoint.",
        "- Agent check: oh-my-ontology node capability:topology-analysis-modes [vault] --limit 12",
        '- MCP check: query_ontology({"operation":"node_profile","slug":"capability:topology-analysis-modes","depth":2,"limit":12})',
        "- Impact check: oh-my-ontology blast-radius capability:topology-analysis-modes [vault] --depth 2 --direction incoming",
        '- MCP impact check: query_ontology({"operation":"blast_radius","slug":"capability:topology-analysis-modes","depth":2,"direction":"incoming"})',
        "- Post-repair sync gate:",
        "  # Post-change ontology sync gate",
        "",
        "  ## MCP",
        "  1. query_ontology",
      ].join("\n"),
    );
  });

  it("adds owner relation preflight when the health target is an orphan", () => {
    expect(
      formatTopologyHealthBrief({
        summary: {
          primaryMetric: 1,
          healthBreakdown: {
            stale: 0,
            orphan: 1,
            promotion: 0,
          },
        },
        actionTarget: {
          slug: "domain:views",
          title: "Views",
          kind: "orphan",
        },
        labels: {
          title: "Topology health evidence",
          total: "Issues",
          stale: "Stale",
          orphan: "Open questions",
          promotion: "Hub candidates",
          inspect: "Inspect first",
          inspectUrl: "Inspect URL",
          repairUrl: "Repair URL",
          nextAction: "Next action",
          agentCheck: "Agent check",
          mcpCheck: "MCP check",
          relationPreflight: "Owner relation preflight",
          mcpRelationPreflight: "MCP owner relation preflight",
          impactCheck: "Impact check",
          mcpImpactCheck: "MCP impact check",
          syncGate: "Post-repair sync gate",
          actionStale: "Refresh source evidence or confirm this concept is still active.",
          actionOrphan:
            "Connect this node to its owner/domain or document why it should stay standalone.",
          actionPromotion:
            "Review whether this high-signal node should become a domain or capability entrypoint.",
          none: "No actionable target",
          url: "URL",
        },
      }),
    ).toContain(
      "- Owner relation preflight: oh-my-ontology relation-check <owner-slug> domain:views contains [vault]",
    );
  });

  it("formats the MCP node_profile payload for the health target", () => {
    expect(formatTopologyHealthMcpCheck("domain:views")).toBe(
      'query_ontology({"operation":"node_profile","slug":"domain:views","depth":2,"limit":12})',
    );
  });

  it("formats the MCP relation_check payload for an orphan ownership target", () => {
    expect(formatTopologyHealthOwnerRelationMcpCheck("domain:views")).toBe(
      'query_ontology({"operation":"relation_check","from":"<owner-slug>","to":"domain:views","type":"contains"})',
    );
  });

  it("maps graph ids to builder repair URLs", () => {
    expect(buildTopologyHealthRepairHref("domain:views")).toBe(
      "/ontology/edit/?node=domains%2Fviews",
    );
    expect(buildTopologyHealthRepairHref("capabilities/topology-analysis-modes")).toBe(
      "/ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
    );
  });
});

describe("formatTopologyFocusBrief", () => {
  it("formats a selected node review brief with topology, ontology, builder, and agent checks", () => {
    expect(
      formatTopologyFocusBrief({
        slug: "capability:topology-analysis-modes",
        title: "Topology Analysis Modes",
        labels: {
          title: "Topology focus review",
          node: "Node",
          url: "URL",
          ontologyUrl: "Ontology URL",
          builderUrl: "Builder URL",
          reviewFocus: "Review URL",
          agentCheck: "Agent check",
          mcpCheck: "MCP check",
          impactCheck: "Impact check",
          mcpImpactCheck: "MCP impact check",
          syncGate: "Post-change sync gate",
        },
        url: "http://localhost:3000/en/topology?mode=focus",
        focusUrl:
          "http://localhost:3000/en/topology?mode=focus&p=capability%3Atopology-analysis-modes",
        ontologyUrl: "/ontology/?node=capability%3Atopology-analysis-modes",
        builderUrl: "/ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
        syncGatePacket: "# Post-change ontology sync gate\n\n## MCP\n1. query_ontology",
      }),
    ).toBe(
      [
        "# Topology focus review",
        "- Node: Topology Analysis Modes (capability:topology-analysis-modes)",
        "- URL: http://localhost:3000/en/topology?mode=focus",
        "- Review URL: http://localhost:3000/en/topology?mode=focus&p=capability%3Atopology-analysis-modes",
        "- Ontology URL: /ontology/?node=capability%3Atopology-analysis-modes",
        "- Builder URL: /ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
        "- Agent check: oh-my-ontology node capability:topology-analysis-modes [vault] --limit 12",
        '- MCP check: query_ontology({"operation":"node_profile","slug":"capability:topology-analysis-modes","depth":2,"limit":12})',
        "- Impact check: oh-my-ontology blast-radius capability:topology-analysis-modes [vault] --depth 2 --direction incoming",
        '- MCP impact check: query_ontology({"operation":"blast_radius","slug":"capability:topology-analysis-modes","depth":2,"direction":"incoming"})',
        "- Post-change sync gate:",
        "  # Post-change ontology sync gate",
        "",
        "  ## MCP",
        "  1. query_ontology",
      ].join("\n"),
    );
  });
});

describe("formatTopologyPathEvidenceBrief", () => {
  it("formats restored Path mode endpoints with agent path and all_paths checks", () => {
    expect(
      formatTopologyPathEvidenceBrief({
        sourceSlug: "domains/views",
        targetSlug: "capability:topology-analysis-modes",
        sourceTitle: "Views",
        targetTitle: "Topology Analysis Modes",
        labels: {
          title: "Topology path evidence",
          source: "Source",
          target: "Target",
          url: "URL",
          sourceOntologyUrl: "Source ontology URL",
          targetOntologyUrl: "Target ontology URL",
          sourceBuilderUrl: "Source builder URL",
          targetBuilderUrl: "Target builder URL",
          cliCheck: "CLI check",
          mcpCheck: "MCP check",
          relationPreflightReason: "Relation preflight reason",
          relationPreflightMcpCheck: "Relation preflight MCP check",
          explainRelationMcpCheck: "explain_relation MCP check",
          allPathsPlanMcpCheck: "all_paths query plan MCP check",
          allPathsMcpCheck: "all_paths MCP check",
          allPathsEvidenceContract: "all_paths evidence contract",
          proofChecklist: "Proof checklist",
          proofVisiblePath: "Visible path clue",
          proofRelationPreflight: "relation_check preflight",
          proofExplainRelation: "explain_relation context",
          proofBoundedTraversal: "bounded all_paths plan",
          proofPostWriteSync: "post-write sync gate",
          proofStatusReady: "ready",
          proofStatusRequired: "required",
          proofStatusAfterWrite: "after write",
          syncGate: "Post-write sync gate",
        },
        url: "http://localhost:3000/en/topology?mode=path",
        syncGatePacket: "# Post-change ontology sync gate\n\n## MCP\n1. query_ontology",
      }),
    ).toBe(
      [
        "# Topology path evidence",
        "- Source: Views (domains/views)",
        "- Target: Topology Analysis Modes (capability:topology-analysis-modes)",
        "- URL: http://localhost:3000/en/topology?mode=path",
        "- Source ontology URL: /ontology/?node=domains%2Fviews",
        "- Target ontology URL: /ontology/?node=capability%3Atopology-analysis-modes",
        "- Source builder URL: /ontology/edit/?node=domains%2Fviews",
        "- Target builder URL: /ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
        "- CLI check: oh-my-ontology path domains/views capability:topology-analysis-modes [vault] --max-hops 5",
        '- MCP check: query_ontology({"operation":"path","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5})',
        "- Relation preflight reason: domain -> capability maps to capabilities because domains own capabilities.",
        '- Relation preflight MCP check: query_ontology({"operation":"relation_check","from":"domains/views","to":"capability:topology-analysis-modes","type":"capabilities"})',
        '- explain_relation MCP check: query_ontology({"operation":"explain_relation","from":"domains/views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
        '- all_paths query plan MCP check: query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
        '- all_paths MCP check: query_ontology({"operation":"all_paths","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
        "- all_paths evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence",
        "- Proof checklist:",
        "  - Visible path clue: ready",
        "  - relation_check preflight: required",
        "  - explain_relation context: required",
        "  - bounded all_paths plan: required",
        "  - post-write sync gate: after write",
        "- Post-write sync gate:",
        "  # Post-change ontology sync gate",
        "",
        "  ## MCP",
        "  1. query_ontology",
      ].join("\n"),
    );
  });

  it("formats Path mode MCP checks for direct copy actions", () => {
    expect(
      formatTopologyPathMcpCheck("domains/views", "capability:topology-analysis-modes"),
    ).toBe(
      'query_ontology({"operation":"path","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5})',
    );
    expect(
      formatTopologyPathRelationPreflightMcpCheck(
        "domains/views",
        "capability:topology-analysis-modes",
      ),
    ).toBe(
      'query_ontology({"operation":"relation_check","from":"domains/views","to":"capability:topology-analysis-modes","type":"capabilities"})',
    );
    expect(
      formatTopologyPathExplainRelationMcpCheck(
        "domains/views",
        "capability:topology-analysis-modes",
      ),
    ).toBe(
      'query_ontology({"operation":"explain_relation","from":"domains/views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
    );
    expect(
      formatTopologyPathAllPathsPlanMcpCheck(
        "domains/views",
        "capability:topology-analysis-modes",
      ),
    ).toBe(
      'query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
    );
    expect(
      formatTopologyPathAllPathsMcpCheck(
        "domains/views",
        "capability:topology-analysis-modes",
      ),
    ).toBe(
      'query_ontology({"operation":"all_paths","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
    );
  });
});
