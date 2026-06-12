import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { TopologyAnalysisBar } from "./TopologyAnalysisBar";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels = {
  title: "Topology analysis mode",
  overview: "Overview",
  focus: "Focus",
  path: "Path",
  health: "Health",
  metricNodes: "nodes",
  metricRelations: "relations",
  metricIssues: "issues",
  healthStale: "stale evidence",
  healthOrphan: "open question",
  healthPromotion: "hub candidate",
  healthInspect: "Inspect",
  healthCopy: "Copy health",
  healthOpenOntology: "Open ontology",
  healthRepair: "Repair in builder",
  healthCopied: "Copied",
  actions: "Actions",
  healthCopyTools: "Copy tools",
  healthMcpCopy: "Copy health check",
  healthMcpCopied: "MCP check copied",
  healthMcpImpactCopy: "Copy health impact",
  healthMcpImpactCopied: "MCP impact copied",
  healthSyncGateCopy: "Copy health sync",
  healthSyncGateCopied: "Sync gate copied",
  healthHandoffSummary: "Repair proof",
  healthRepairOrderTitle: "Repair order",
  healthRepairOrderInspect: "Inspect target",
  healthRepairOrderRepair: "Repair ownership or evidence",
  healthRepairOrderSync: "Run sync gate",
  healthRepairTargetLabel: "Current repair target",
  overviewBriefCopy: "Copy graph brief",
  overviewBriefCopied: "Graph brief copied",
  overviewReanalyzeCopy: "Copy reanalysis command",
  overviewReanalyzeCopied: "Reanalysis command copied",
  overviewSyncCopy: "Copy update check",
  overviewSyncCopied: "Update check copied",
  overviewHandoffSummary: "Agent handoff",
  overviewWorkOrderTitle: "Analysis order",
  overviewWorkOrderRead: "Read ontology map",
  overviewWorkOrderFocus: "Focus concept",
  overviewWorkOrderPath: "Prove path",
  overviewWorkOrderHealth: "Repair health",
  overviewBriefCopyAriaLabel: "Copy topology overview brief",
  overviewBriefCopiedAriaLabel: "Topology overview brief copied",
  overviewReanalyzeCopyAriaLabel: "Copy ontology reanalysis command",
  overviewReanalyzeCopiedAriaLabel: "Ontology reanalysis command copied",
  overviewSyncCopyAriaLabel: "Copy ontology update check",
  overviewSyncCopiedAriaLabel: "Ontology update check copied",
  overviewBriefTitle: "Topology overview brief",
  overviewBriefTotalNodes: "Total nodes",
  overviewBriefTotalRelations: "Total relations",
  overviewBriefHealthSignals: "Health signals",
  overviewBriefHealthUrl: "Health URL",
  overviewBriefInsightsUrl: "Insights URL",
  overviewBriefAgentCheck: "Agent overview check",
  overviewBriefMcpCheck: "MCP overview check",
  overviewBriefMcpQueryPlan: "MCP query plan",
  overviewBriefWorkspaceCheck: "Workspace check",
  overviewBriefMcpWorkspaceCheck: "MCP workspace check",
  overviewRelationVisibleCountSuffix: "shown",
  overviewSkeletonCardCountSuffix: "concept cards",
  overviewRelationLodNotice:
    "Showing key links only. Zoom in or use Focus/Path to inspect relations.",
  overviewRelationPreparingNotice:
    "Arranging links before showing the readable skeleton.",
  overviewSkeletonNotice:
    "Showing the readable card skeleton. Use Focus or Path to inspect exact relations.",
  focusBriefCopy: "Copy focus brief",
  focusBriefCopied: "Focus brief copied",
  focusMcpCopy: "Copy MCP profile",
  focusMcpCopied: "MCP profile copied",
  focusMcpImpactCopy: "Copy MCP impact",
  focusMcpImpactCopied: "MCP impact copied",
  focusSyncGateCopy: "Copy sync gate",
  focusSyncGateCopied: "Sync gate copied",
  focusEnhanceCopy: "Copy strengthen command",
  focusEnhanceCopied: "Strengthen command copied",
  focusOpenOntology: "Open ontology",
  focusOpenBuilder: "Open builder",
  focusHandoffSummary: "Focus proof",
  focusReviewOrderTitle: "Focus review order",
  focusReviewOrderProfile: "Read node profile",
  focusReviewOrderImpact: "Trace incoming impact",
  focusReviewOrderRepair: "Edit or confirm meaning",
  focusReviewOrderSync: "Run sync gate",
  focusBriefCopyAriaLabel: "Copy focus review brief",
  focusBriefCopiedAriaLabel: "Focus review brief copied",
  focusMcpCopyAriaLabel: "Copy focus MCP profile",
  focusMcpCopiedAriaLabel: "Focus MCP profile copied",
  focusMcpImpactCopyAriaLabel: "Copy focus MCP impact",
  focusMcpImpactCopiedAriaLabel: "Focus MCP impact copied",
  focusSyncGateCopyAriaLabel: "Copy focus post-change sync gate",
  focusSyncGateCopiedAriaLabel: "Focus post-change sync gate copied",
  focusEnhanceCopyAriaLabel: "Copy selected concept strengthening command",
  focusEnhanceCopiedAriaLabel: "Selected concept strengthening command copied",
  focusBriefTitle: "Topology focus review",
  focusBriefNode: "Node",
  focusBriefUrl: "URL",
  focusBriefOntologyUrl: "Ontology URL",
  focusBriefBuilderUrl: "Builder URL",
  focusBriefReviewFocus: "Review URL",
  focusBriefAgentCheck: "Agent check",
  focusBriefMcpCheck: "MCP check",
  focusBriefImpactCheck: "Impact check",
  focusBriefMcpImpactCheck: "MCP impact check",
  focusBriefSyncGate: "Post-change sync gate",
  healthMcpCopyAriaLabel: "Copy health MCP check",
  healthMcpCopiedAriaLabel: "Health MCP check copied",
  healthMcpImpactCopyAriaLabel: "Copy health impact MCP check",
  healthMcpImpactCopiedAriaLabel: "Health impact MCP check copied",
  healthSyncGateCopyAriaLabel: "Copy health post-repair sync gate",
  healthSyncGateCopiedAriaLabel: "Health post-repair sync gate copied",
  healthCopyAriaLabel: "Copy health evidence",
  healthCopiedAriaLabel: "Health evidence copied",
  healthEvidenceTitle: "Topology health evidence",
  healthEvidenceTotal: "Issues",
  healthEvidenceInspectUrl: "Inspect URL",
  healthEvidenceOntologyUrl: "Ontology URL",
  healthEvidenceRepairUrl: "Repair URL",
  healthEvidenceNextAction: "Next action",
  healthEvidenceAgentCheck: "Agent check",
  healthEvidenceMcpCheck: "MCP check",
  healthEvidenceRelationPreflight: "Owner relation preflight",
  healthEvidenceMcpRelationPreflight: "MCP owner relation preflight",
  healthEvidenceImpactCheck: "Impact check",
  healthEvidenceMcpImpactCheck: "MCP impact check",
  healthEvidenceSyncGate: "Post-repair sync gate",
  healthEvidenceActionKindStale: "Stale evidence",
  healthEvidenceActionKindOrphan: "Open question",
  healthEvidenceActionKindPromotion: "Hub candidate",
  healthEvidenceActionStale: "Refresh source evidence or confirm this concept is still active.",
  healthEvidenceActionOrphan:
    "Connect this node to its owner/domain or document why it should stay standalone.",
  healthEvidenceActionPromotion:
    "Review whether this high-signal node should become a domain or capability entrypoint.",
  healthEvidenceNone: "No actionable target",
  healthEvidenceUrl: "URL",
  focusPrompt: "Select a node.",
  focusSelected: "Focused on {title}.",
  pathPrompt: "Click a source node, then click a target.",
  pathSelected: "Path source is {title}. Click a target node.",
  pathResolved: "Path selected: {source} to {target}.",
  pathEvidenceCopy: "Copy path evidence",
  pathEvidenceCopied: "Path evidence copied",
  pathEvidenceCopyAriaLabel: "Copy topology path evidence",
  pathEvidenceCopiedAriaLabel: "Topology path evidence copied",
  pathMcpCopy: "Copy MCP path",
  pathMcpCopied: "MCP path copied",
  pathMcpCopyAriaLabel: "Copy topology path MCP check",
  pathMcpCopiedAriaLabel: "Topology path MCP check copied",
  pathRelationPreflightCopy: "Copy relation preflight",
  pathRelationPreflightCopied: "Relation preflight copied",
  pathRelationPreflightCopyAriaLabel: "Copy topology path relation preflight MCP check",
  pathRelationPreflightCopiedAriaLabel:
    "Topology path relation preflight MCP check copied",
  pathExplainRelationCopy: "Copy explain relation",
  pathExplainRelationCopied: "Explain relation copied",
  pathExplainRelationCopyAriaLabel: "Copy topology path explain_relation MCP check",
  pathExplainRelationCopiedAriaLabel:
    "Topology path explain_relation MCP check copied",
  pathAllPathsPlanCopy: "Copy all_paths plan",
  pathAllPathsPlanCopied: "all_paths plan copied",
  pathAllPathsPlanCopyAriaLabel: "Copy topology path all_paths query plan MCP check",
  pathAllPathsPlanCopiedAriaLabel:
    "Topology path all_paths query plan MCP check copied",
  pathAllPathsCopy: "Copy all_paths run",
  pathAllPathsCopied: "all_paths run copied",
  pathAllPathsCopyAriaLabel: "Copy topology path all_paths MCP execution check",
  pathAllPathsCopiedAriaLabel: "Topology path all_paths MCP execution check copied",
  pathHandoffSummary: "Path proof",
  pathCopyTools: "Path checks",
  pathProofOrderTitle: "Proof order",
  pathProofOrderDesc:
    "Use the visible path as a clue, then run relation_check, explain_relation, and a bounded all_paths plan before treating it as write evidence.",
  pathProofChecklist: "Proof checklist",
  pathProofVisiblePath: "Visible path clue",
  pathProofRelationPreflight: "relation_check preflight",
  pathProofExplainRelation: "explain_relation context",
  pathProofBoundedTraversal: "bounded all_paths plan",
  pathProofPostWriteSync: "post-write sync gate",
  pathProofStatusReady: "ready",
  pathProofStatusRequired: "required",
  pathProofStatusAfterWrite: "after write",
  pathEvidenceTitle: "Topology path evidence",
  pathEvidenceSource: "Source",
  pathEvidenceTarget: "Target",
  pathEvidenceUrl: "URL",
  pathEvidenceSourceOntologyUrl: "Source ontology URL",
  pathEvidenceTargetOntologyUrl: "Target ontology URL",
  pathEvidenceSourceBuilderUrl: "Source builder URL",
  pathEvidenceTargetBuilderUrl: "Target builder URL",
  pathEvidenceCliCheck: "CLI check",
  pathEvidenceMcpCheck: "MCP check",
  pathEvidenceRelationPreflightReason: "Relation preflight reason",
  pathEvidenceRelationPreflightMcpCheck: "Relation preflight MCP check",
  pathEvidenceExplainRelationMcpCheck: "explain_relation MCP check",
  pathEvidenceAllPathsPlanMcpCheck: "all_paths query plan MCP check",
  pathEvidenceAllPathsMcpCheck: "all_paths MCP check",
  pathEvidenceAllPathsCopyInstruction: "all_paths evidence contract",
  pathEvidencePostWriteSyncGate: "Post-write sync gate",
  pathSourceOntology: "Source in ontology",
  pathTargetOntology: "Target in ontology",
  pathSourceBuilder: "Source in builder",
  pathTargetBuilder: "Target in builder",
  healthPrompt: "Showing health issues.",
  overviewPrompt: "Read the map.",
};

describe("TopologyAnalysisBar", () => {
  it("keeps analysis modes reachable on mobile while preserving the desktop breakpoint", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const bar = screen.getByRole("region", {
      name: "Topology analysis mode",
    });
    expect(bar.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(bar.className).toContain("md:hidden");
    expect(bar.className).toContain("lg:block");
    expect(bar.className).toContain("top-[5.5rem]");
    expect(bar.className).toContain("max-h-[calc(100dvh-7.5rem)]");
    expect(bar.className).toContain("topology-ui-scale");
    expect(screen.getByRole("button", { name: "Overview" }).className).toContain("h-8");
    expect(screen.getByRole("button", { name: "Focus" }).className).toContain("h-8");
    expect(screen.getByRole("button", { name: "Path" }).className).toContain("h-8");
    expect(screen.getByRole("button", { name: "Health" }).className).toContain("h-8");
  });

  it("renders mode tabs icon-only (text via aria-label/tooltip) to keep the panel compact", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    for (const name of ["Overview", "Focus", "Path", "Health"] as const) {
      const tab = screen.getByRole("button", { name });
      // 아이콘만 — 라벨은 aria-label + hover Tooltip 컴포넌트가 담당.
      expect(tab.textContent).toBe("");
      expect(tab).toHaveAttribute("aria-label", name);
    }
  });

  it("keeps the overview guidance readable instead of truncating first-screen relief instructions", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 292,
          secondaryMetric: 498,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={{
          ...labels,
          overviewPrompt:
            "Read the source-backed ontology map first, then copy an agent handoff.",
        }}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const prompt = screen.getByText(
      "Read the source-backed ontology map first, then copy an agent handoff.",
    );
    expect(prompt.className).toContain("line-clamp-2");
    expect(prompt.className).not.toContain("truncate");
    expect(screen.getByText("nodes").closest("div")?.className).toContain("flex-wrap");
  });

  it("keeps overview agent-copy commands visible above the proof disclosure", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 260,
          secondaryMetric: 428,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        overviewRelationVisibility={{ visible: 36, total: 428 }}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const reanalyze = screen.getByRole("button", {
      name: "Copy ontology reanalysis command",
    });
    const details = reanalyze.closest("details");
    expect(details).toBeNull();
    const actions = screen.getByTestId("topology-overview-handoff-actions");
    expect(actions).toBeVisible();
    expect(actions.className).toContain("grid-cols-1");
    const sync = screen.getByRole("button", {
      name: "Copy ontology update check",
    });
    expect(sync.closest("details")).toBeNull();
  });

  it("keeps overview agent copy actions visible while proof order stays collapsed", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 252,
          secondaryMetric: 397,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const actionsSummary = screen.getByText("Agent handoff");
    expect(actionsSummary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Copy graph brief")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy ontology reanalysis command" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy ontology update check" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Showing key links only. Zoom in or use Focus/Path to inspect relations.",
      ),
    ).toBeVisible();
  });

  it("names the overview disclosure as an agent handoff, not a generic actions bucket", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 252,
          secondaryMetric: 397,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Agent handoff").closest("details")).not.toHaveAttribute(
      "open",
    );
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("shows a disclosure chevron on the overview agent handoff", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 252,
          secondaryMetric: 397,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const summary = screen.getByTestId("topology-overview-handoff-summary");
    expect(summary).toHaveTextContent("Agent handoff");
    expect(summary.className).toContain("gap-1.5");
    expect(
      screen.getByTestId("topology-overview-handoff-chevron").getAttribute("class"),
    ).toContain("group-open:rotate-180");
  });

  it("shows how many overview relations are currently drawn after edge simplification", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 260,
          secondaryMetric: 428,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        overviewRelationVisibility={{ visible: 36, total: 428 }}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByText(/36\/428/)).toHaveTextContent("36/428 shown");
    expect(screen.getByText(/Showing key links only/)).toBeInTheDocument();
  });

  it("separates overview relation progress from the LOD notice to avoid dense wrapping", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 260,
          secondaryMetric: 428,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        overviewRelationVisibility={{ visible: 36, total: 428 }}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const progress = screen.getByTestId("topology-overview-relation-progress");
    expect(progress).toHaveTextContent("36/428 shown");
    expect(progress.className).toContain("rounded");
    expect(progress.className).toContain("whitespace-nowrap");

    const notice = screen.getByText(
      "Showing key links only. Zoom in or use Focus/Path to inspect relations.",
    );
    expect(notice.closest("p")?.className).toContain("leading-4");
    expect(notice.closest("p")?.className).not.toContain("line-clamp-2");
  });

  it("offers an agent reanalysis command from overview actions", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 260,
          secondaryMetric: 428,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        overviewRelationVisibility={{ visible: 36, total: 428 }}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Copy reanalysis command")).toBeInTheDocument();
  });

  it("explains that dense overview links are still being arranged", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 260,
          secondaryMetric: 428,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        overviewRelationVisibility={{ visible: 0, total: 428 }}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByText(/0\/428/)).toHaveTextContent("0/428 shown");
    expect(
      screen.getByText("Arranging links before showing the readable skeleton."),
    ).toBeInTheDocument();
  });

  it("describes skeleton card mode without reporting hidden edges as zero shown", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 292,
          secondaryMetric: 498,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        overviewRelationVisibility={{ visible: 21, total: 292, mode: "skeleton" }}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByTestId("topology-overview-relation-progress")).toHaveTextContent(
      "21 concept cards",
    );
    expect(screen.queryByText(/0\/498/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Showing the readable card skeleton. Use Focus or Path to inspect exact relations.",
      ),
    ).toBeInTheDocument();
  });

  it("reserves space for the selected-node drawer on desktop", () => {
    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="capability:topology-analysis-modes"
        selectedTitle="Topology Analysis Modes"
        rightPanelReserved
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const bar = screen.getByRole("region", {
      name: "Topology analysis mode",
    });
    // shares the same responsive left gutter as the topology header pill +
    // legend (lg:left-6 → xl:left-8) so all left-anchored overlays align.
    expect(bar.className).toContain("lg:left-6");
    expect(bar.className).toContain("xl:left-8");
    expect(bar.className).toContain("lg:w-[min(264px,calc(100vw_-_460px))]");
  });

  it("offers a selected-node strengthening command in focus actions", () => {
    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 5,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="capabilities/topology-sigma-render"
        selectedTitle="Topology Sigma Render"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Copy strengthen command")).toBeInTheDocument();
  });

  it("keeps the focus strengthening copy label stable after copy feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 5,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="capabilities/topology-sigma-render"
        selectedTitle="Topology Sigma Render"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy selected concept strengthening command",
      }),
    );

    const copiedButton = await screen.findByRole("button", {
      name: "Selected concept strengthening command copied",
    });
    expect(copiedButton).toHaveTextContent("Copy strengthen command");
    expect(copiedButton).not.toHaveTextContent("Strengthen command copied");
  });

  it("keeps the focus brief copy label stable after copy feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 5,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="capabilities/topology-sigma-render"
        selectedTitle="Topology Sigma Render"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy focus review brief",
      }),
    );

    const copiedButton = await screen.findByRole("button", {
      name: "Focus review brief copied",
    });
    expect(copiedButton).toHaveTextContent("Copy focus brief");
    expect(copiedButton).not.toHaveTextContent("Focus brief copied");
    expect(copiedButton.className).toContain("active:translate-y-[1px]");
    expect(copiedButton.className).toContain("motion-reduce:transition-none");
    expect(copiedButton.className).toContain("motion-reduce:transform-none");
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# Topology focus review"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Node: Topology Sigma Render (capabilities/topology-sigma-render)",
      ),
    );
  });

  it("moves below the expanded left panel on desktop", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        leftPanelExpanded
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const bar = screen.getByRole("region", {
      name: "Topology analysis mode",
    });
    expect(bar.className).toContain("lg:top-[24rem]");
  });

  it("moves below the concept creation panel when that panel is open", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        createPanelReserved
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const bar = screen.getByRole("region", {
      name: "Topology analysis mode",
    });
    expect(bar.className).toContain("top-[31.5rem]");
    expect(bar.className).toContain("max-h-[calc(100dvh-33.5rem)]");
  });

  it("describes Path mode as a click source then click target workflow", () => {
    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: true,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Click a source node, then click a target."),
    ).toBeInTheDocument();
  });

  it("copies an overview brief for first-contact agent and collaborator review", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 36,
          secondaryMetric: 88,
          needsSelection: false,
          healthBreakdown: {
            stale: 1,
            orphan: 2,
            promotion: 3,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const handoffSummary = screen.getByTestId("topology-overview-handoff-summary");
    expect(handoffSummary.className).toContain("min-h-7");
    fireEvent.click(handoffSummary);
    expect(screen.getByTestId("topology-overview-work-order")).toBeVisible();
    expect(screen.getByText("Copy graph brief")).toBeVisible();
    const graphBriefButton = screen.getByRole("button", {
      name: "Copy topology overview brief",
    });
    expect(graphBriefButton.className).toContain("min-h-7");
    expect(graphBriefButton.className).not.toContain("col-span-2");
    expect(graphBriefButton).toHaveAttribute("title", "Copy graph brief");

    fireEvent.click(graphBriefButton);

    const copiedButton = await screen.findByRole("button", {
      name: "Topology overview brief copied",
    });
    expect(copiedButton).toHaveTextContent("Copy graph brief");
    expect(copiedButton).not.toHaveTextContent("Graph brief copied");
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# Topology overview brief"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Total nodes: 36"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Health signals: 6"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("mode=health"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Insights URL: /ontology/insights/"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Agent overview check: ontology-atlas overview [vault] --limit 5",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP overview check: query_ontology({"operation":"overview","limit":5})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP query plan: query_ontology({"operation":"query_plan","targetOperation":"overview"})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Workspace check: ontology-atlas workspace-brief [vault]"),
    );
  });

  it("keeps overview compact copy labels stable after copy feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 36,
          secondaryMetric: 88,
          needsSelection: false,
          healthBreakdown: {
            stale: 1,
            orphan: 2,
            promotion: 3,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy ontology reanalysis command",
      }),
    );
    const reanalysisButton = await screen.findByRole("button", {
      name: "Ontology reanalysis command copied",
    });
    expect(reanalysisButton).toHaveTextContent("Copy reanalysis");
    expect(reanalysisButton).not.toHaveTextContent("Reanalysis command copied");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy ontology update check",
      }),
    );
    const syncButton = await screen.findByRole("button", {
      name: "Ontology update check copied",
    });
    expect(syncButton).toHaveTextContent("Copy update check");
    expect(syncButton).not.toHaveTextContent("Update check copied");
  });

  it("shows the Overview mode analysis order before exporting the graph handoff", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 36,
          secondaryMetric: 88,
          needsSelection: false,
          healthBreakdown: {
            stale: 1,
            orphan: 2,
            promotion: 3,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Agent handoff"));

    expect(screen.getByText("Analysis order")).toBeInTheDocument();
    expect(screen.getByTestId("topology-overview-work-order")).toBeVisible();
    expect(screen.getByText("Read ontology map")).toBeInTheDocument();
    expect(screen.getByText("Focus concept")).toBeInTheDocument();
    expect(screen.getByText("Prove path")).toBeInTheDocument();
    expect(screen.getByText("Repair health")).toBeInTheDocument();
  });

  it("copies MCP profile and impact checks for the focused node", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="capability:topology-analysis-modes"
        selectedTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy focus MCP profile" }));
    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"node_profile","slug":"capability:topology-analysis-modes","depth":2,"limit":12})',
    );
    expect(screen.getByRole("link", { name: "Open ontology" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/ontology/?node=capability%3Atopology-analysis-modes",
      ),
    );
    expect(screen.getByRole("link", { name: "Open builder" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy focus MCP impact" }));
    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"blast_radius","slug":"capability:topology-analysis-modes","depth":2,"direction":"incoming"})',
    );
  });

  it("shows the focus review order before advanced copy tools", () => {
    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="capability:topology-analysis-modes"
        selectedTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Focus review order")).toBeInTheDocument();
    expect(screen.getByTestId("topology-focus-review-order")).toBeVisible();
    expect(screen.getByText("Read node profile")).toBeInTheDocument();
    expect(screen.getByText("Trace incoming impact")).toBeInTheDocument();
    expect(screen.getByText("Edit or confirm meaning")).toBeInTheDocument();
    expect(screen.getByText("Run sync gate")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy focus review brief" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open ontology" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open builder" })).toBeInTheDocument();
    const summary = screen.getByTestId("topology-focus-proof-summary");
    expect(summary).toHaveTextContent("Focus proof");
    expect(summary.className).toContain("min-h-8");
    expect(screen.getByTestId("topology-focus-proof-chevron")).toHaveClass(
      "group-open:rotate-180",
    );
    expect(screen.queryByText("Copy tools")).not.toBeInTheDocument();
  });

  it("previews the focus review order before a node is selected", () => {
    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 0,
          secondaryMetric: 8,
          needsSelection: true,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Select a node.")).toBeInTheDocument();
    const reviewOrder = screen.getByTestId("topology-focus-review-order");
    expect(reviewOrder).toHaveTextContent("Read node profile");
    expect(reviewOrder).toHaveTextContent("Trace incoming impact");
    expect(reviewOrder).toHaveTextContent("Edit or confirm meaning");
    expect(reviewOrder).toHaveTextContent("Run sync gate");
    expect(
      screen.queryByRole("button", { name: "Copy focus review brief" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Open ontology")).not.toBeInTheDocument();
    expect(screen.queryByText("Open builder")).not.toBeInTheDocument();
  });

  it("copies a focused node review brief for collaborators and agents", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="capability:topology-analysis-modes"
        selectedTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy focus review brief" }));

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# Topology focus review"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Node: Topology Analysis Modes (capability:topology-analysis-modes)",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("mode=focus"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("p=capability%3Atopology-analysis-modes"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Ontology URL: /ontology/?node=capability%3Atopology-analysis-modes",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Builder URL: /ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Agent check: ontology-atlas node capability:topology-analysis-modes [vault] --limit 12",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP check: query_ontology({"operation":"node_profile","slug":"capability:topology-analysis-modes","depth":2,"limit":12})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Impact check: ontology-atlas blast-radius capability:topology-analysis-modes [vault] --depth 2 --direction incoming",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP impact check: query_ontology({"operation":"blast_radius","slug":"capability:topology-analysis-modes","depth":2,"direction":"incoming"})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Post-change sync gate:"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  # Post-change ontology sync gate"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"operation": "health"'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("ontology-atlas validate [vault]"),
    );
  });

  it("copies the post-change sync gate for a focused node", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="focus"
        summary={{
          mode: "focus",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="capability:topology-analysis-modes"
        selectedTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy focus post-change sync gate" }),
    );

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# Post-change ontology sync gate"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"operation": "health"'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("ontology-atlas validate [vault]"),
    );
  });

  it("keeps the selected path source visible before the target is picked", () => {
    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: true,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle="Topology Analysis Modes"
        pathSourceTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Path source is Topology Analysis Modes. Click a target node.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the restored path source and target when both are already selected", () => {
    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathSourceSlug="domains/views"
        pathTargetSlug="capability:topology-analysis-modes"
        pathSourceTitle="Views"
        pathTargetTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Path selected: Views to Topology Analysis Modes."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Source in ontology" })).toHaveAttribute(
      "href",
      "/ontology/?node=domains%2Fviews",
    );
    expect(screen.getByRole("link", { name: "Target in ontology" })).toHaveAttribute(
      "href",
      "/ontology/?node=capability%3Atopology-analysis-modes",
    );
    expect(screen.getByRole("link", { name: "Source in builder" })).toHaveAttribute(
      "href",
      "/ontology/edit/?node=domains%2Fviews",
    );
    expect(screen.getByRole("link", { name: "Target in builder" })).toHaveAttribute(
      "href",
      "/ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
    );
    expect(
      screen.getByRole("button", { name: "Copy topology path evidence" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy topology path MCP check" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Proof order")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Use the visible path as a clue, then run relation_check, explain_relation, and a bounded all_paths plan before treating it as write evidence.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("topology-path-proof-checklist")).not.toBeInTheDocument();
    expect(screen.queryByText("Visible path clue")).not.toBeInTheDocument();
    expect(screen.queryByText("required")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Copy topology path relation preflight MCP check",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Copy topology path explain_relation MCP check",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Copy topology path all_paths query plan MCP check",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Copy topology path all_paths MCP execution check",
      }),
    ).toBeInTheDocument();
  });

  it("names the selected path disclosure as path proof instead of generic actions", () => {
    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathSourceSlug="domains/views"
        pathTargetSlug="capability:topology-analysis-modes"
        pathSourceTitle="Views"
        pathTargetTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const summary = screen.getByTestId("topology-path-proof-summary");
    expect(summary).toHaveTextContent("Path proof");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("topology-path-proof-chevron")).toHaveClass(
      "group-open:rotate-180",
    );
    const toolsSummary = screen.getByTestId("topology-path-checks-summary");
    expect(toolsSummary).toHaveTextContent("Path checks");
    expect(toolsSummary.className).toContain("min-h-8");
    expect(screen.getByTestId("topology-path-checks-chevron")).toHaveClass(
      "group-open:rotate-180",
    );
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    expect(screen.queryByText("Copy tools")).not.toBeInTheDocument();
  });

  it("copies path evidence from the analysis bar for agent handoff", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathSourceSlug="domains/views"
        pathTargetSlug="capability:topology-analysis-modes"
        pathSourceTitle="Views"
        pathTargetTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy topology path evidence" }));

    const copiedButton = await screen.findByRole("button", {
      name: "Topology path evidence copied",
    });
    expect(copiedButton).toHaveTextContent("Copy path evidence");
    expect(copiedButton).not.toHaveTextContent("Path evidence copied");
    expect(copiedButton.className).toContain("active:translate-y-[1px]");
    expect(copiedButton.className).toContain("motion-reduce:transition-none");
    expect(copiedButton.className).toContain("motion-reduce:transform-none");
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# Topology path evidence"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Source: Views (domains/views)"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Target: Topology Analysis Modes (capability:topology-analysis-modes)",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Source ontology URL: /ontology/?node=domains%2Fviews"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Target builder URL: /ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- CLI check: ontology-atlas path domains/views capability:topology-analysis-modes [vault] --max-hops 5",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP check: query_ontology({"operation":"path","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Relation preflight reason: domain -> capability maps to capabilities because domains own capabilities.",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- Relation preflight MCP check: query_ontology({"operation":"relation_check","from":"domains/views","to":"capability:topology-analysis-modes","type":"capabilities"})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- explain_relation MCP check: query_ontology({"operation":"explain_relation","from":"domains/views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- all_paths query plan MCP check: query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- all_paths evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Proof checklist:"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  - Visible path clue: ready"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  - relation_check preflight: required"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  - explain_relation context: required"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  - bounded all_paths plan: required"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  - post-write sync gate: after write"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Post-write sync gate:"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  # Post-change ontology sync gate"),
    );
  });

  it("copies only the path MCP check from the analysis bar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathSourceSlug="domains/views"
        pathTargetSlug="capability:topology-analysis-modes"
        pathSourceTitle="Views"
        pathTargetTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy topology path MCP check" }));

    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"path","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5})',
    );
  });

  it("keeps compact path copy labels stable after copy feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathSourceSlug="domains/views"
        pathTargetSlug="capability:topology-analysis-modes"
        pathSourceTitle="Views"
        pathTargetTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const copyButton = screen.getByRole("button", {
      name: "Copy topology path MCP check",
    });

    fireEvent.click(copyButton);

    const copiedButton = await screen.findByRole("button", {
      name: "Topology path MCP check copied",
    });
    expect(copiedButton).toHaveTextContent("Copy MCP path");
    expect(copiedButton).not.toHaveTextContent("MCP path copied");
    expect(copiedButton.className).toContain("active:translate-y-[1px]");
    expect(copiedButton.className).toContain("motion-reduce:transition-none");
  });

  it("copies path relation preflight, explain_relation, all_paths plan, and all_paths execution checks", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 4,
          secondaryMetric: 3,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathSourceSlug="domains/views"
        pathTargetSlug="capability:topology-analysis-modes"
        pathSourceTitle="Views"
        pathTargetTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy topology path relation preflight MCP check",
      }),
    );
    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"relation_check","from":"domains/views","to":"capability:topology-analysis-modes","type":"capabilities"})',
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy topology path explain_relation MCP check",
      }),
    );
    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"explain_relation","from":"domains/views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy topology path all_paths query plan MCP check",
      }),
    );
    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy topology path all_paths MCP execution check",
      }),
    );
    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"all_paths","from":"domains/views","to":"capability:topology-analysis-modes","maxHops":5,"limit":10,"searchBudget":1000})',
    );
  });

  it("opens the first actionable health target from Health mode", () => {
    const onHealthAction = vi.fn();

    render(
      <TopologyAnalysisBar
        mode="health"
        summary={{
          mode: "health",
          primaryMetric: 3,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 1,
            orphan: 1,
            promotion: 1,
          },
        }}
        healthAction={{
          slug: "legacy-project",
          title: "Legacy Project",
          kind: "stale",
        }}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={onHealthAction}
      />,
    );

    expect(screen.getAllByText("stale evidence")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "stale evidence Legacy Project" }),
    );

    expect(onHealthAction).toHaveBeenCalledWith("legacy-project");
  });

  it("links the first actionable health target to builder repair", () => {
    render(
      <TopologyAnalysisBar
        mode="health"
        summary={{
          mode: "health",
          primaryMetric: 1,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 1,
          },
        }}
        healthAction={{
          slug: "capability:topology-analysis-modes",
          title: "Topology Analysis Modes",
          kind: "promotion",
        }}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "Open ontology" })).toHaveAttribute(
      "href",
      "/ontology/?node=capability%3Atopology-analysis-modes",
    );
    expect(screen.getByRole("link", { name: "Repair in builder" })).toHaveAttribute(
      "href",
      "/ontology/edit/?node=capabilities%2Ftopology-analysis-modes",
    );
  });

  it("shows the kind-specific next action beside the Health inspect target", () => {
    render(
      <TopologyAnalysisBar
        mode="health"
        summary={{
          mode: "health",
          primaryMetric: 1,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 1,
            promotion: 0,
          },
        }}
        healthAction={{
          slug: "domain:views",
          title: "Views",
          kind: "orphan",
        }}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Current repair target")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Connect this node to its owner/domain or document why it should stay standalone.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("topology-health-repair-order")).toBeInTheDocument();
    expect(screen.getByText("Repair order")).toBeInTheDocument();
    expect(screen.getByText("Inspect target")).toBeInTheDocument();
    expect(screen.getByText("Repair ownership or evidence")).toBeInTheDocument();
    expect(screen.getByText("Run sync gate")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "open question Views" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inspect" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repair in builder" })).toBeInTheDocument();
  });

  it("names the health repair disclosure as repair proof instead of generic actions", () => {
    render(
      <TopologyAnalysisBar
        mode="health"
        summary={{
          mode: "health",
          primaryMetric: 1,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 1,
            promotion: 0,
          },
        }}
        healthAction={{
          slug: "domain:views",
          title: "Views",
          kind: "orphan",
        }}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const summary = screen.getByTestId("topology-health-repair-proof-summary");
    expect(summary).toHaveTextContent("Repair proof");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("topology-health-repair-proof-chevron")).toHaveClass(
      "group-open:rotate-180",
    );
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("copies the current health evidence brief", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="health"
        summary={{
          mode: "health",
          primaryMetric: 2,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 1,
            promotion: 1,
          },
        }}
        healthAction={{
          slug: "domain:views",
          title: "Views",
          kind: "orphan",
        }}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Copy health evidence" })).toHaveTextContent(
      "Copy health",
    );
    expect(screen.getByRole("button", { name: "Copy health evidence" }).className).toContain(
      "min-h-8",
    );
    expect(screen.getByRole("button", { name: "Copy health evidence" }).className).not.toContain(
      "w-8",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy health evidence" }));

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Inspect: Open question · Views (domain:views)"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("p=domain%3Aviews"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Ontology URL: /ontology/?node=domain%3Aviews"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Repair URL: /ontology/edit/?node=domains%2Fviews"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Next action: Connect this node to its owner/domain or document why it should stay standalone.",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Agent check: ontology-atlas node domain:views [vault] --limit 12",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP check: query_ontology({"operation":"node_profile","slug":"domain:views","depth":2,"limit":12})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Owner relation preflight: ontology-atlas relation-check <owner-slug> domain:views contains [vault]",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP owner relation preflight: query_ontology({"operation":"relation_check","from":"<owner-slug>","to":"domain:views","type":"contains"})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Impact check: ontology-atlas blast-radius domain:views [vault] --depth 2 --direction incoming",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP impact check: query_ontology({"operation":"blast_radius","slug":"domain:views","depth":2,"direction":"incoming"})',
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Post-repair sync gate:"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  # Post-change ontology sync gate"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"operation": "maintenance_plan"'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("ontology-atlas validate [vault]"),
    );
  });

  it("keeps the health evidence copy label stable after copy feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="health"
        summary={{
          mode: "health",
          primaryMetric: 2,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 1,
            promotion: 1,
          },
        }}
        healthAction={{
          slug: "domain:views",
          title: "Views",
          kind: "orphan",
        }}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const copyButton = screen.getByRole("button", {
      name: "Copy health evidence",
    });

    fireEvent.click(copyButton);

    const copiedButton = await screen.findByRole("button", {
      name: "Health evidence copied",
    });
    expect(copiedButton).toHaveTextContent("Copy health");
    expect(copiedButton).not.toHaveTextContent("Copied");
    expect(copiedButton.className).toContain("min-h-8");
    expect(copiedButton.className).toContain("active:translate-y-[1px]");
    expect(copiedButton.className).toContain("motion-reduce:transition-none");
  });

  it("copies health MCP impact and sync checks from the repair actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <TopologyAnalysisBar
        mode="health"
        summary={{
          mode: "health",
          primaryMetric: 2,
          secondaryMetric: 8,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 1,
            promotion: 1,
          },
        }}
        healthAction={{
          slug: "domain:views",
          title: "Views",
          kind: "orphan",
        }}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const directMcpCheck = screen.getByRole("button", {
      name: "Copy health MCP check",
    });
    expect(directMcpCheck).toBeVisible();

    fireEvent.click(directMcpCheck);
    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"node_profile","slug":"domain:views","depth":2,"limit":12})',
    );

    const repairProofSummary = screen.getByTestId(
      "topology-health-repair-proof-summary",
    );
    expect(repairProofSummary).toHaveTextContent("Repair proof");
    fireEvent.click(repairProofSummary);

    fireEvent.click(
      screen.getByRole("button", { name: "Copy health impact MCP check" }),
    );
    expect(writeText).toHaveBeenCalledWith(
      'query_ontology({"operation":"blast_radius","slug":"domain:views","depth":2,"direction":"incoming"})',
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Copy health post-repair sync gate" }),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# Post-change ontology sync gate"),
    );
  });

});
