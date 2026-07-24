import { describe, expect, it } from "vitest";
import {
  buildTopologyAnalysisSummary,
  buildTopologyHealthActionTarget,
  buildTopologyHealthRepairHref,
  computeTopologyPathHopCount,
  formatTopologyHealthBrief,
  formatTopologyHealthMcpCheck,
  formatTopologyHealthOwnerRelationMcpCheck,
  formatTopologyOverviewBrief,
  formatTopologyPathAgentPacket,
  formatTopologyPathMcpCheck,
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
      relationProvenance: {
        sourceBacked: 0,
        authored: 88,
        needsReview: 0,
      },
      relationQuality: {
        strong: 0,
        supported: 88,
        weak: 0,
        review: 0,
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
          relationProvenance: {
            sourceBacked: 70,
            authored: 18,
            needsReview: 0,
          },
          relationQuality: {
            strong: 62,
            supported: 20,
            weak: 4,
            review: 2,
          },
        },
        labels: {
          title: "Topology overview brief",
          totalNodes: "Total nodes",
          totalRelations: "Total relations",
          relationReading: "Relation reading: treat edges as typed ontology facts, not inferred similarity scores",
          relationProvenance: "Relation provenance",
          relationSourceBacked: "source-backed",
          relationAuthored: "authored",
          relationNeedsReview: "needs review",
          relationQuality: "Relation quality",
          relationQualityStrong: "strong",
          relationQualitySupported: "supported",
          relationQualityWeak: "weak",
          relationQualityReview: "review",
          agentReadiness: "Share readiness",
          agentReadinessReady: "handoff-ready",
          agentReadinessPreflight: "preflight",
          agentReadinessReview: "review",
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
        "- Relation reading: treat edges as typed ontology facts, not inferred similarity scores",
        "- Relation provenance: source-backed 70 · authored 18 · needs review 0",
        "- Relation quality: strong 62 · supported 20 · weak 4 · review 2",
        "- Share readiness: handoff-ready 82 · preflight 4 · review 2",
        "- Health signals: 6",
        "- Stale: 1",
        "- Open questions: 2",
        "- Hub candidates: 3",
        "- URL: http://localhost:3000/en/topology",
        "- Health URL: http://localhost:3000/en/topology?mode=health",
        "- Insights URL: /ontology/insights/",
        "- Agent overview check: ontology-atlas overview [vault] --limit 5",
        '- MCP overview check: query_ontology({"operation":"overview","limit":5})',
        '- MCP query plan: query_ontology({"operation":"query_plan","targetOperation":"overview"})',
        "- Workspace check: ontology-atlas workspace-brief [vault]",
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
          ontologyUrl: "Ontology URL",
          repairUrl: "Repair URL",
          nextAction: "Next action",
          agentCheck: "Agent check",
          mcpCheck: "MCP check",
          relationPreflight: "Owner relation preflight",
          mcpRelationPreflight: "MCP owner relation preflight",
          impactCheck: "Impact check",
          mcpImpactCheck: "MCP impact check",
          syncGate: "Post-repair sync gate",
          actionKindStale: "Stale evidence",
          actionKindOrphan: "Open question",
          actionKindPromotion: "Hub candidate",
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
        "- Inspect first: Hub candidate · Topology Analysis Modes (capability:topology-analysis-modes)",
        "- URL: http://localhost:3000/en/topology?mode=health",
        "- Inspect URL: http://localhost:3000/en/topology?mode=health&p=capability%3Atopology-analysis-modes",
        "- Ontology URL: /ontology/?node=capability%3Atopology-analysis-modes",
        "- Repair URL: /ontology/studio/?node=capability%3Atopology-analysis-modes",
        "- Next action: Review whether this high-signal node should become a domain or capability entrypoint.",
        "- Agent check: ontology-atlas node capability:topology-analysis-modes [vault] --limit 12",
        '- MCP check: query_ontology({"operation":"node_profile","slug":"capability:topology-analysis-modes","depth":2,"limit":12})',
        "- Impact check: ontology-atlas blast-radius capability:topology-analysis-modes [vault] --depth 2 --direction incoming",
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
          ontologyUrl: "Ontology URL",
          repairUrl: "Repair URL",
          nextAction: "Next action",
          agentCheck: "Agent check",
          mcpCheck: "MCP check",
          relationPreflight: "Owner relation preflight",
          mcpRelationPreflight: "MCP owner relation preflight",
          impactCheck: "Impact check",
          mcpImpactCheck: "MCP impact check",
          syncGate: "Post-repair sync gate",
          actionKindStale: "Stale evidence",
          actionKindOrphan: "Open question",
          actionKindPromotion: "Hub candidate",
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
      "- Owner relation preflight: ontology-atlas relation-check <owner-slug> domain:views contains [vault]",
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

  it("maps graph ids to canonical builder repair URLs (H5 발신 문법 통일)", () => {
    expect(buildTopologyHealthRepairHref("domain:views")).toBe(
      "/ontology/studio/?node=domain%3Aviews",
    );
    // 복수-슬래시 레거시 입력도 canonical 로 승격해 발신.
    expect(buildTopologyHealthRepairHref("capabilities/topology-analysis-modes")).toBe(
      "/ontology/studio/?node=capability%3Atopology-analysis-modes",
    );
  });
});

describe("formatTopologyPathMcpCheck", () => {
  it("formats the single agent-facing path MCP check the path chip copies", () => {
    expect(
      formatTopologyPathMcpCheck("domains/views", "capability:topology-analysis-modes"),
    ).toBe(
      'query_ontology({"operation":"path","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5})',
    );
  });
});

describe("computeTopologyPathHopCount", () => {
  const nodes = [
    { id: "a", title: "A", kind: "domain" },
    { id: "b", title: "B", kind: "capability" },
    { id: "c", title: "C", kind: "element" },
    { id: "isolated", title: "Isolated", kind: "element" },
  ] as unknown as Parameters<typeof computeTopologyPathHopCount>[2];
  const edges = [
    { id: "e1", from: "a", to: "b", type: "contains" },
    { id: "e2", from: "b", to: "c", type: "depends_on" },
  ] as unknown as Parameters<typeof computeTopologyPathHopCount>[3];

  it("returns 0 for the same node", () => {
    expect(computeTopologyPathHopCount("a", "a", nodes, edges)).toBe(0);
  });

  it("counts the shortest undirected hop distance", () => {
    expect(computeTopologyPathHopCount("a", "b", nodes, edges)).toBe(1);
    expect(computeTopologyPathHopCount("a", "c", nodes, edges)).toBe(2);
    // undirected — reachable against the edge's own direction too.
    expect(computeTopologyPathHopCount("c", "a", nodes, edges)).toBe(2);
  });

  it("returns null when no path connects the two nodes", () => {
    expect(computeTopologyPathHopCount("a", "isolated", nodes, edges)).toBeNull();
  });
});

describe("formatTopologyPathAgentPacket", () => {
  it("formats a single agent-facing path packet — one MCP check, no CLI/proof-checklist ceremony", () => {
    expect(
      formatTopologyPathAgentPacket({
        sourceSlug: "domains/views",
        targetSlug: "capability:topology-analysis-modes",
        sourceTitle: "Views",
        targetTitle: "Topology Analysis Modes",
        hopCount: 2,
        labels: {
          title: "Topology path",
          source: "Source",
          target: "Target",
          hops: "Hops",
          hopsUnknown: "no path found",
          sourceOntologyUrl: "Source ontology URL",
          targetOntologyUrl: "Target ontology URL",
          sourceBuilderUrl: "Source builder URL",
          targetBuilderUrl: "Target builder URL",
          mcpCheck: "MCP check",
        },
      }),
    ).toBe(
      [
        "# Topology path",
        "- Source: Views (domains/views)",
        "- Target: Topology Analysis Modes (capability:topology-analysis-modes)",
        "- Hops: 2",
        "- Source ontology URL: /ontology/?node=domains%2Fviews",
        "- Target ontology URL: /ontology/?node=capability%3Atopology-analysis-modes",
        "- Source builder URL: /ontology/studio/?node=domain%3Aviews",
        "- Target builder URL: /ontology/studio/?node=capability%3Atopology-analysis-modes",
        '- MCP check: query_ontology({"operation":"path","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5})',
      ].join("\n"),
    );
  });

  it("falls back to the hopsUnknown label when no path was found", () => {
    const packet = formatTopologyPathAgentPacket({
      sourceSlug: "a",
      targetSlug: "isolated",
      sourceTitle: "A",
      targetTitle: "Isolated",
      hopCount: null,
      labels: {
        title: "Topology path",
        source: "Source",
        target: "Target",
        hops: "Hops",
        hopsUnknown: "no path found",
        sourceOntologyUrl: "Source ontology URL",
        targetOntologyUrl: "Target ontology URL",
        sourceBuilderUrl: "Source builder URL",
        targetBuilderUrl: "Target builder URL",
        mcpCheck: "MCP check",
      },
    });
    expect(packet).toContain("- Hops: no path found");
  });
});
