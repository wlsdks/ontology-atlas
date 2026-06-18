import { fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ONTOLOGY_KIND_TONE } from "@/entities/ontology-class";
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
  overviewBriefCopy: "Copy map brief",
  overviewBriefCopied: "Map brief copied",
  overviewReanalyzeCopy: "Audit",
  overviewReanalyzeCopied: "Reanalysis command copied",
  overviewSyncCopy: "Sync",
  overviewSyncCopied: "Update check copied",
  overviewHandoffSummary: "Share map",
  overviewCopyTools: "Agent follow-up",
  overviewWorkOrderTitle: "Analysis order",
  overviewWorkOrderRead: "Read ontology map",
  overviewWorkOrderFocus: "Focus concept",
  overviewWorkOrderPath: "Prove path",
  overviewWorkOrderHealth: "Repair health",
  overviewReaderLensTitle: "Reader lens",
  overviewReaderLensDomains: "Find the main domains and ownership areas.",
  overviewReaderLensCapabilities: "Read which capabilities each area carries.",
  overviewReaderLensChangePaths:
    "Trace what would change before handing it to an agent.",
  overviewTierLegendTitle: "Map layers",
  overviewTierLegendProject: "Product/system",
  overviewTierLegendDomain: "Domain",
  overviewTierLegendCapability: "Capability",
  overviewTierLegendElement: "Evidence",
  overviewRelationLegendTitle: "Relation lines",
  overviewRelationLegendSpine: "Containment backbone",
  overviewRelationLegendQuality: "Relations to check",
  overviewBriefCopyAriaLabel: "Copy topology map brief",
  overviewBriefCopiedAriaLabel: "Topology map brief copied",
  overviewReanalyzeCopyAriaLabel: "Copy ontology reanalysis command",
  overviewReanalyzeCopiedAriaLabel: "Ontology reanalysis command copied",
  overviewSyncCopyAriaLabel: "Copy ontology update check",
  overviewSyncCopiedAriaLabel: "Ontology update check copied",
  overviewBriefTitle: "Topology map brief",
  overviewBriefTotalNodes: "Total nodes",
  overviewBriefTotalRelations: "Total relations",
  overviewBriefRelationReading: "Relation reading: treat edges as typed ontology facts, not inferred similarity scores",
  overviewBriefRelationProvenance: "Evidence coverage",
  overviewBriefRelationSourceBacked: "with source",
  overviewBriefRelationAuthored: "team-added",
  overviewBriefRelationNeedsReview: "needs check",
  overviewBriefRelationQuality: "Trust level",
  overviewBriefRelationQualityStrong: "clear",
  overviewBriefRelationQualitySupported: "supported",
  overviewBriefRelationQualityWeak: "thin",
  overviewBriefRelationQualityReview: "check",
  overviewAgentReadiness: "Team handoff",
  overviewAgentReadinessReady: "ready",
  overviewAgentReadinessPreflight: "check first",
  overviewAgentReadinessReview: "needs review",
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
    "Showing the readable concept map. Use Focus or Path for exact relation evidence.",
  focusBriefCopy: "Copy focus brief",
  focusBriefCopied: "Focus brief copied",
  focusMcpCopy: "Copy concept check",
  focusMcpCopied: "Concept check copied",
  focusMcpImpactCopy: "Copy impact check",
  focusMcpImpactCopied: "Impact check copied",
  focusSyncGateCopy: "Copy sync gate",
  focusSyncGateCopied: "Sync gate copied",
  focusEnhanceCopy: "Copy strengthen command",
  focusEnhanceCopied: "Strengthen command copied",
  focusOpenOntology: "Open ontology",
  focusOpenBuilder: "Open builder",
  focusHandoffSummary: "Focus proof",
  focusReviewOrderTitle: "Focus review order",
  focusReviewOrderProfile: "Read concept brief",
  focusReviewOrderImpact: "Trace incoming impact",
  focusReviewOrderRepair: "Edit or confirm meaning",
  focusReviewOrderSync: "Run sync gate",
  focusBriefCopyAriaLabel: "Copy focus review brief",
  focusBriefCopiedAriaLabel: "Focus review brief copied",
  focusMcpCopyAriaLabel: "Copy focus concept check",
  focusMcpCopiedAriaLabel: "Focus concept check copied",
  focusMcpImpactCopyAriaLabel: "Copy focus impact check",
  focusMcpImpactCopiedAriaLabel: "Focus impact check copied",
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
  pathCandidateVisibility:
    "Showing {visible} of {total} path candidates so the map stays readable.",
  pathHandoffLabel: "Share route",
  pathHandoffMcpAction: "Agent check",
  pathHandoffCliFallback: "Terminal check",
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
    "Shows the visible link first, then the checks needed before changing the ontology.",
  pathProofChecklist: "Proof checklist",
  pathProofVisiblePath: "Visible path clue",
  pathProofRelationPreflight: "Check relation direction",
  pathProofExplainRelation: "Explain why it connects",
  pathProofBoundedTraversal: "Compare alternate paths",
  pathProofPostWriteSync: "Sync after edits",
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
  it("marks the overview panel as a 14-inch chrome-aligned support surface", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 294,
          secondaryMetric: 504,
          needsSelection: false,
          relationProvenance: {
            sourceBacked: 504,
            authored: 0,
            needsReview: 0,
          },
          relationQuality: {
            strong: 387,
            supported: 0,
            weak: 117,
            review: 0,
          },
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

    const panel = screen.getByTestId("topology-analysis-panel");
    expect(panel).toHaveAttribute("data-analysis-mode", "overview");
    expect(panel).toHaveAttribute("data-attention-role", "support");
    expect(panel).toHaveAttribute("data-panel-width-policy", "overview-support");
    expect(panel).toHaveAttribute("data-panel-width-band", "header-aligned");
    expect(panel).toHaveAttribute("data-panel-width-target", "overview-14-inch-compact");
    expect(panel).toHaveAttribute(
      "data-panel-width-contract",
      "overview-support-max-360-phone-utility-reserve",
    );
    expect(panel).toHaveAttribute(
      "data-panel-phone-utility-reserve-token",
      "--topology-panel-phone-utility-rail-reserve",
    );
    expect(panel).toHaveAttribute("data-panel-layer-contract", "read-surface-above-map-cards");
    expect(panel).toHaveAttribute("data-panel-z-index-token", "--topology-panel-read-layer-z-index");
    const provenance = screen.getByTestId("topology-overview-relation-provenance");
    expect(provenance).toHaveAttribute(
      "data-overview-provenance-contract",
      "scan-counts-not-wrapped-summary",
    );
    expect(provenance).toHaveAttribute(
      "data-overview-provenance-layout",
      "stacked-fact-rows",
    );
    expect(
      provenance.querySelector('[data-overview-provenance-row="source-backed"]'),
    ).toHaveTextContent("504");
    expect(
      provenance.querySelector('[data-overview-provenance-row="authored"]'),
    ).toHaveTextContent("0");
    expect(
      provenance.querySelector('[data-overview-provenance-row="needs-review"]'),
    ).toHaveTextContent("0");
    const supportedQuality = screen.getByTestId("topology-overview-relation-quality-supported");
    expect(supportedQuality).toHaveAttribute(
      "data-proof-label-contract",
      "compact-visible-full-aria",
    );
    expect(supportedQuality).toHaveAttribute("data-full-label", "supported");
    expect(supportedQuality).toHaveAttribute("data-compact-label", "support");
    expect(supportedQuality).toHaveAttribute("aria-label", "supported: 0");
    expect(supportedQuality).toHaveTextContent("support");
    const readyChip = screen
      .getByTestId("topology-overview-agent-readiness")
      .querySelector('[data-agent-readiness-chip="ready"]');
    expect(readyChip).toHaveAttribute(
      "data-proof-label-contract",
      "compact-visible-full-aria",
    );
    expect(readyChip).toHaveAttribute("data-full-label", "ready");
    expect(readyChip).toHaveAttribute("data-compact-label", "ready");
    expect(readyChip).toHaveAttribute("aria-label", "ready: 387");
    expect(readyChip).toHaveTextContent("ready");
  });

  it("promotes the panel to focus support when a node is selected from overview", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 294,
          secondaryMetric: 504,
          needsSelection: false,
          relationProvenance: {
            sourceBacked: 504,
            authored: 0,
            needsReview: 0,
          },
          relationQuality: {
            strong: 387,
            supported: 0,
            weak: 117,
            review: 0,
          },
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="domain:views"
        selectedTitle="Views (Topology · Browse · Builder)"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const panel = screen.getByTestId("topology-analysis-panel");
    expect(panel).toHaveAttribute("data-requested-analysis-mode", "overview");
    expect(panel).toHaveAttribute("data-analysis-mode", "focus");
    expect(panel).toHaveAttribute("data-selected-context", "true");
    expect(panel).toHaveAttribute("data-attention-role", "support");
    expect(screen.getByText("Focused on Views.")).toBeInTheDocument();
    expect(screen.getByTestId("topology-focus-review-order")).toBeVisible();
    expect(screen.queryByTestId("topology-overview-signal-grid")).not.toBeInTheDocument();
  });

  it("clears the selected focus context when returning to overview from the mode rail", () => {
    const onModeChange = vi.fn();
    const onClearSelection = vi.fn();

    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 294,
          secondaryMetric: 504,
          needsSelection: false,
          relationProvenance: {
            sourceBacked: 504,
            authored: 0,
            needsReview: 0,
          },
          relationQuality: {
            strong: 387,
            supported: 0,
            weak: 117,
            review: 0,
          },
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="domain:views"
        selectedTitle="Views (Topology · Browse · Builder)"
        labels={labels}
        onModeChange={onModeChange}
        onClearSelection={onClearSelection}
        onHealthAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith("overview");
  });

  it("keeps selected focus support compact enough to align with the top chrome group", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 294,
          secondaryMetric: 504,
          needsSelection: false,
          relationProvenance: {
            sourceBacked: 504,
            authored: 0,
            needsReview: 0,
          },
          relationQuality: {
            strong: 387,
            supported: 0,
            weak: 117,
            review: 0,
          },
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedSlug="domain:views"
        selectedTitle="Views (Topology · Browse · Builder)"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const panel = screen.getByTestId("topology-analysis-panel");
    expect(panel).toHaveAttribute("data-panel-width-policy", "mode-compact");
    expect(panel).toHaveAttribute("data-panel-width-target", "selected-focus-rail");
    expect(panel).toHaveAttribute(
      "data-panel-width-contract",
      "selected-focus-rail-max-320",
    );
    expect(panel).toHaveAttribute(
      "data-command-spine-padding-token",
      "--topology-command-spine-padding",
    );
    expect(panel).toHaveAttribute(
      "data-command-primary-height-token",
      "--topology-command-primary-min-height",
    );
    expect(panel).toHaveAttribute(
      "data-panel-surface-token",
      "--topology-panel-support-surface",
    );
    expect(panel).toHaveAttribute(
      "data-command-spine-surface-token",
      "--topology-command-spine-surface",
    );
    expect(panel).toHaveAttribute(
      "data-command-spine-border-token",
      "--topology-command-spine-border",
    );
    const commandSpine = screen.getByTestId("topology-focus-command-spine");
    expect(commandSpine).toHaveAttribute(
      "data-command-hierarchy",
      "brief-primary-review-agent-proof",
    );
    expect(commandSpine).toHaveAttribute(
      "data-tokenized-surface",
      "topology-command-spine",
    );
    expect(commandSpine).toHaveAttribute(
      "data-command-spine-surface-token",
      "--topology-command-spine-surface",
    );
    expect(commandSpine).toHaveAttribute(
      "data-command-spine-border-token",
      "--topology-command-spine-border",
    );
    expect(commandSpine.className).toContain(
      "p-[var(--topology-command-spine-padding)]",
    );
    const primaryAction = screen.getByTestId("topology-focus-primary-action");
    expect(primaryAction).toHaveTextContent("Copy focus brief");
    expect(primaryAction).toHaveAttribute(
      "data-command-primary-surface-token",
      "--topology-command-primary-surface",
    );
    expect(primaryAction).toHaveAttribute(
      "data-command-primary-border-token",
      "--topology-command-primary-border",
    );
    expect(primaryAction.className).toContain(
      "min-h-[var(--topology-command-primary-min-height)]",
    );
    expect(screen.getByTestId("topology-focus-review-order")).toHaveClass("grid");
    expect(screen.getByTestId("topology-focus-review-order")).toHaveAttribute(
      "data-review-order-contract",
      "flat-numbered-rail",
    );
    expect(screen.getByTestId("topology-focus-review-order")).toHaveAttribute(
      "data-command-step-surface-token",
      "--topology-command-step-surface",
    );
    expect(screen.getByTestId("topology-focus-review-order")).toHaveAttribute(
      "data-command-step-border-token",
      "--topology-command-step-border",
    );
    expect(screen.getByText("Read concept brief").closest("li")).toHaveAttribute(
      "data-command-step-contract",
      "flat-numbered-row",
    );
    expect(screen.getByTestId("topology-focus-secondary-actions")).toBeVisible();
    expect(screen.getByTestId("topology-focus-secondary-actions")).toHaveAttribute(
      "data-focus-secondary-action-contract",
      "ontology-builder-exits",
    );
    expect(screen.getByTestId("topology-focus-secondary-actions")).toHaveAttribute(
      "data-command-secondary-surface-token",
      "--topology-command-secondary-surface",
    );
    expect(screen.getByTestId("topology-focus-secondary-actions")).toHaveAttribute(
      "data-command-secondary-border-token",
      "--topology-command-secondary-border",
    );
    const ontologyExit = screen.getByRole("link", { name: "Open ontology" });
    expect(ontologyExit).toHaveAttribute("data-focus-secondary-action", "ontology");
    expect(ontologyExit).toHaveAttribute(
      "data-command-secondary-surface-token",
      "--topology-command-secondary-surface",
    );
    const builderExit = screen.getByRole("link", { name: "Open builder" });
    expect(builderExit).toHaveAttribute("data-focus-secondary-action", "builder");
    expect(builderExit).toHaveAttribute(
      "data-command-secondary-border-token",
      "--topology-command-secondary-border",
    );
    expect(screen.getByTestId("topology-focus-agent-handoff")).toHaveAttribute(
      "data-handoff-contract",
      "mcp-cli-proof-disclosed",
    );
    const focusProofActions = [
      ["Copy focus concept check", "mcp-profile"],
      ["Copy focus impact check", "mcp-impact"],
      ["Copy focus post-change sync gate", "sync-gate"],
      ["Copy selected concept strengthening command", "strengthen-command"],
    ] as const;
    for (const [name, proofAction] of focusProofActions) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("data-focus-proof-action", proofAction);
      expect(button).toHaveAttribute(
        "data-command-secondary-surface-token",
        "--topology-command-secondary-surface",
      );
      expect(button).toHaveAttribute(
        "data-command-secondary-border-token",
        "--topology-command-secondary-border",
      );
    }
  });

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
    expect(bar.className).toContain("max-h-[calc(100dvh-7rem)]");
    expect(bar.className).toContain("topology-ui-scale");
    const modeRail = screen.getByTestId("topology-analysis-mode-rail");
    expect(modeRail).toHaveAttribute(
      "data-mode-rail-contract",
      "four-icon-tabs-tooltip-labels",
    );
    expect(modeRail).toHaveAttribute(
      "data-surface-token",
      "--topology-analysis-mode-rail-surface",
    );
    expect(modeRail).toHaveAttribute(
      "data-active-surface-token",
      "--topology-analysis-mode-active-surface",
    );
    expect(modeRail).toHaveAttribute(
      "data-active-border-token",
      "--topology-analysis-mode-active-border",
    );
    expect(modeRail).toHaveAttribute(
      "data-active-text-token",
      "--topology-analysis-mode-active-text",
    );
    expect(modeRail).toHaveAttribute(
      "data-idle-text-token",
      "--topology-analysis-mode-idle-text",
    );
    expect(modeRail).toHaveAttribute(
      "data-focus-ring-token",
      "--topology-analysis-mode-focus-ring",
    );
    expect(screen.getByRole("button", { name: "Overview" }).className).toContain("h-9");
    expect(screen.getByRole("button", { name: "Focus" }).className).toContain("h-9");
    expect(screen.getByRole("button", { name: "Path" }).className).toContain("h-9");
    expect(screen.getByRole("button", { name: "Health" }).className).toContain("h-9");
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "data-mode-tab-state",
      "active",
    );
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "data-active-border-token",
      "--topology-analysis-mode-active-border",
    );
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "data-text-token",
      "--topology-analysis-mode-active-text",
    );
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "data-focus-ring-token",
      "--topology-analysis-mode-focus-ring",
    );
    expect(screen.getByRole("button", { name: "Path" })).toHaveAttribute(
      "data-hover-surface-token",
      "--topology-analysis-mode-hover-surface",
    );
    expect(screen.getByRole("button", { name: "Path" })).toHaveAttribute(
      "data-text-token",
      "--topology-analysis-mode-idle-text",
    );
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
      expect(tab).toHaveAttribute("data-analysis-mode-tab");
      expect(tab).toHaveAttribute(
        "data-focus-ring-token",
        "--topology-analysis-mode-focus-ring",
      );
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
            "Start with the product/system map: domains, capabilities, and change paths stay visible for team inspection and sharing.",
        }}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const prompt = screen.getByText(
      "Start with the product/system map: domains, capabilities, and change paths stay visible for team inspection and sharing.",
    );
    expect(prompt.className).toContain("line-clamp-3");
    expect(prompt.className).not.toContain("truncate");
    expect(prompt).toHaveAttribute(
      "data-prompt-text-token",
      "--topology-analysis-panel-prompt-text",
    );
    expect(prompt.className).toContain(
      "text-[color:var(--topology-analysis-panel-prompt-text)]",
    );
    expect(prompt.className).not.toContain("--color-text-secondary");

    const metrics = screen.getByTestId("topology-analysis-panel-metrics");
    expect(metrics.className).toContain("grid-cols-2");
    expect(metrics).toHaveAttribute(
      "data-metric-label-text-token",
      "--topology-analysis-panel-metric-label-text",
    );
    expect(metrics).toHaveAttribute(
      "data-metric-value-text-token",
      "--topology-analysis-panel-metric-value-text",
    );
    expect(metrics.className).toContain(
      "text-[color:var(--topology-analysis-panel-metric-label-text)]",
    );
    expect(metrics.className).not.toContain("--color-text-quaternary");
    expect(screen.getByText("292").className).toContain(
      "text-[color:var(--topology-analysis-panel-metric-value-text)]",
    );
    expect(screen.getByText("498").className).toContain(
      "text-[color:var(--topology-analysis-panel-metric-value-text)]",
    );
  });

  it("keeps the primary overview brief visible and tucks secondary agent commands into a compact rail", () => {
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
    expect(details).not.toBeNull();
    const actions = screen.getByTestId("topology-overview-handoff-actions");
    expect(actions).toBeVisible();
    expect(actions).toHaveAttribute(
      "data-divider-token",
      "--topology-overview-handoff-divider",
    );
    expect(actions.textContent).toContain("Share map");
    expect(actions.querySelectorAll("button")).toHaveLength(3);
    expect(actions.querySelector(".grid")?.className).not.toContain("grid-cols-2");
    const briefCopy = screen.getByTestId("topology-overview-brief-copy");
    expect(briefCopy.className).toContain("min-h-9");
    expect(briefCopy).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-handoff-primary-surface",
    );
    expect(briefCopy).toHaveAttribute(
      "data-border-token",
      "--topology-overview-handoff-primary-border",
    );
    const sync = screen.getByRole("button", {
      name: "Copy ontology update check",
    });
    expect(sync.closest("details")).not.toBeNull();
    expect(screen.getByTestId("topology-overview-reanalyze-copy")).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-handoff-secondary-surface",
    );
    expect(screen.getByTestId("topology-overview-sync-copy")).toHaveAttribute(
      "data-border-token",
      "--topology-overview-handoff-secondary-border",
    );
  });

  it("uses a disclosure for secondary overview commands so the first-screen panel stays about ontology reading", () => {
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

    const actions = screen.getByTestId("topology-overview-handoff-actions");
    const readerLens = screen.getByTestId("topology-overview-reader-lens");
    expect(readerLens).toHaveTextContent("Reader lens");
    expect(readerLens).toHaveTextContent("Find the main domains and ownership areas.");
    expect(readerLens).toHaveTextContent("Read which capabilities each area carries.");
    expect(readerLens).toHaveTextContent(
      "Trace what would change before handing it to an agent.",
    );
    expect(readerLens).toHaveAttribute(
      "data-reader-lens-contract",
      "non-developer-first-map-read",
    );
    const mapKey = screen.getByTestId("topology-overview-map-key");
    expect(mapKey).toHaveAttribute(
      "data-map-key-contract",
      "compact-node-and-relation-reading",
    );
    const tierLegend = screen.getByTestId("topology-overview-tier-legend");
    expect(tierLegend).toHaveAttribute(
      "data-tier-legend-contract",
      "map-color-to-ontology-layer",
    );
    expect(tierLegend).toHaveAttribute(
      "data-tier-legend-token-source",
      "ONTOLOGY_KIND_TONE",
    );
    expect(tierLegend).toHaveTextContent("Map layers");
    expect(tierLegend).toHaveTextContent("Product/system");
    expect(tierLegend).toHaveTextContent("Domain");
    expect(tierLegend).toHaveTextContent("Capability");
    expect(tierLegend).toHaveTextContent("Evidence");
    expect(
      tierLegend.querySelector('[data-tier-legend-kind="project"]'),
    ).toHaveAttribute("data-kind-tone-fill", ONTOLOGY_KIND_TONE.project.fill);
    expect(
      tierLegend.querySelector('[data-tier-legend-kind="domain"]'),
    ).toHaveAttribute("data-kind-tone-fill", ONTOLOGY_KIND_TONE.domain.fill);
    expect(
      tierLegend.querySelector('[data-tier-legend-kind="capability"]'),
    ).toHaveAttribute("data-kind-tone-fill", ONTOLOGY_KIND_TONE.capability.fill);
    expect(
      tierLegend.querySelector('[data-tier-legend-kind="element"]'),
    ).toHaveAttribute("data-kind-tone-fill", ONTOLOGY_KIND_TONE.element.fill);
    const relationLineLegend = screen.getByTestId(
      "topology-overview-relation-line-legend",
    );
    expect(relationLineLegend).toHaveAttribute(
      "data-relation-line-legend-contract",
      "map-line-to-ontology-relation",
    );
    expect(relationLineLegend).toHaveAttribute(
      "data-spine-token",
      "--topology-relation-spine-halo",
    );
    expect(relationLineLegend).toHaveAttribute(
      "data-spine-terminal-token",
      "--topology-relation-spine-terminal",
    );
    expect(relationLineLegend).toHaveAttribute(
      "data-quality-strong-token",
      "--topology-relation-stroke-strong",
    );
    expect(relationLineLegend).toHaveAttribute(
      "data-quality-weak-token",
      "--topology-relation-stroke-weak",
    );
    expect(relationLineLegend).toHaveTextContent("Relation lines");
    expect(relationLineLegend).toHaveTextContent("Containment backbone");
    expect(relationLineLegend).toHaveTextContent("Relations to check");
    expect(actions.closest("details")).toBeNull();
    expect(screen.getByText("Copy map brief")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy ontology reanalysis command" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy ontology update check" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("topology-overview-handoff-summary"),
    ).toHaveTextContent("Agent follow-up");
    expect(
      screen.getByText(
        "Showing key links only. Zoom in or use Focus/Path to inspect relations.",
      ),
    ).toBeVisible();
  });

  it("names the overview command rail as map sharing before agent handoff tools", () => {
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

    expect(screen.getByTestId("topology-overview-handoff-actions")).toHaveTextContent(
      "Share map",
    );
    expect(screen.queryByText("Actions")).not.toBeInTheDocument();
  });

  it("renders overview disclosure chrome only for secondary handoff commands", () => {
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

    expect(screen.getByTestId("topology-overview-handoff-summary")).toHaveTextContent(
      "Agent follow-up",
    );
    expect(screen.getByTestId("topology-overview-handoff-chevron")).toBeInTheDocument();
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

    expect(screen.getByTestId("topology-overview-relation-progress")).toHaveTextContent(
      "shown",
    );
    expect(screen.getByTestId("topology-overview-relation-progress")).toHaveTextContent(
      "36/428",
    );
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
    const signalGrid = screen.getByTestId("topology-overview-signal-grid");
    expect(signalGrid.className).toContain("rounded");
    expect(signalGrid).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-signal-grid-surface",
    );
    expect(signalGrid).toHaveAttribute(
      "data-border-token",
      "--topology-overview-signal-grid-border",
    );
    expect(progress).toHaveTextContent("shown");
    expect(progress).toHaveTextContent("36/428");
    expect(progress).toHaveAttribute("data-overview-signal-compact", "true");
    expect(progress).toHaveAttribute("data-overview-signal-card", "neutral");
    expect(progress).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-signal-neutral-surface",
    );
    expect(progress).toHaveAttribute(
      "data-border-token",
      "--topology-overview-signal-neutral-border",
    );

    const notice = screen.getByText(
      "Showing key links only. Zoom in or use Focus/Path to inspect relations.",
    );
    expect(notice.closest("p")?.className).toContain("leading-5");
    expect(notice.closest("p")?.className).toContain("max-md:sr-only");
    expect(notice.closest("p")?.className).not.toContain("line-clamp-2");
    expect(screen.getByTestId("topology-overview-relation-notice")).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-notice-surface",
    );
    expect(screen.getByTestId("topology-overview-relation-notice")).toHaveAttribute(
      "data-phone-overview-notice-contract",
      "sr-only-while-map-evidence-wins",
    );
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

    expect(screen.getByText("Audit")).toBeInTheDocument();
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

    expect(screen.getByText(/0\/428/)).toHaveTextContent("0/428");
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
        "Showing the readable concept map. Use Focus or Path for exact relation evidence.",
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
    expect(bar).toHaveAttribute("data-right-panel-reserved", "true");
    expect(bar).toHaveAttribute("data-selected-focus-rail", "true");
    expect(bar).toHaveAttribute("data-panel-width-target", "selected-focus-rail");
    expect(bar).toHaveAttribute(
      "data-compact-focus-collapse-contract",
      "selected-focus-support-hidden-under-md",
    );
    expect(bar).toHaveAttribute(
      "data-panel-width-css",
      "var(--topology-panel-selected-rail-width)",
    );
    expect(bar).toHaveAttribute(
      "data-panel-width-token",
      "--topology-panel-selected-rail-width",
    );
    expect(bar.className).toContain("max-md:hidden");
    expect(bar).toHaveAttribute("data-attention-role", "support");
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

  it("gives overview a readable desktop rail without hard-coded action overflow", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 292,
          secondaryMetric: 498,
          needsSelection: false,
          relationProvenance: {
            sourceBacked: 498,
            authored: 0,
            needsReview: 0,
          },
          relationQuality: {
            strong: 384,
            supported: 0,
            weak: 114,
            review: 0,
          },
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
    expect(bar).toHaveAttribute("data-panel-width-policy", "overview-support");
    expect(bar).toHaveAttribute("data-panel-width-band", "header-aligned");
    expect(bar).toHaveAttribute("data-panel-width-target", "overview-14-inch-compact");
    expect(bar).toHaveAttribute("data-panel-width-css", "var(--topology-panel-overview-responsive-width)");
    expect(bar).toHaveAttribute("data-panel-width-token", "--topology-panel-overview-responsive-width");
    expect(bar).toHaveAttribute(
      "data-panel-phone-utility-reserve-token",
      "--topology-panel-phone-utility-rail-reserve",
    );
    expect(bar).toHaveAttribute(
      "data-panel-compact-scroll-end-reserve-token",
      "--topology-analysis-panel-compact-scroll-end-reserve",
    );
    expect(bar).toHaveAttribute(
      "data-overview-panel-compact-gap-token",
      "--topology-overview-panel-compact-gap",
    );
    expect(bar).toHaveAttribute(
      "data-overview-panel-phone-max-height-token",
      "--topology-overview-panel-phone-max-height",
    );
    expect(bar).toHaveAttribute("data-attention-role", "support");
    expect(bar).toHaveAttribute("data-panel-surface-token", "--topology-panel-support-surface");
    expect(bar).toHaveAttribute("data-panel-shadow-token", "--topology-panel-support-shadow");
    expect(bar).toHaveAttribute("data-panel-radius-token", "--topology-panel-radius");
    expect(bar).toHaveAttribute("data-panel-padding-token", "--topology-panel-padding");
    expect(bar).toHaveAttribute("data-panel-motion-token", "--topology-motion-panel-duration");
    expect(bar.className).toContain("data-[analysis-mode=overview]:lg:min-h-[455px]");
    expect(bar.className).toContain("overflow-hidden");
    expect(bar.className).toContain(
      "data-[analysis-mode=overview]:max-md:max-h-[var(--topology-overview-panel-phone-max-height)]",
    );
    expect(bar.className).toContain("data-[analysis-mode=overview]:max-md:overflow-y-auto");
    const body = screen.getByTestId("topology-analysis-panel-body");
    expect(body).toHaveAttribute("data-analysis-body-mode", "overview");
    expect(body).toHaveAttribute(
      "data-panel-body-scroll-contract",
      "compact-scrolls-above-bottom-tab",
    );
    expect(body).toHaveAttribute(
      "data-panel-body-scroll-end-reserve-token",
      "--topology-analysis-panel-compact-scroll-end-reserve",
    );
    expect(body.className).toContain(
      "max-md:max-h-[calc(100dvh-7rem-var(--topology-analysis-panel-compact-scroll-end-reserve))]",
    );
    expect(body.className).toContain("max-md:overflow-y-auto");
    expect(body.className).toContain(
      "data-[analysis-body-mode=overview]:gap-[var(--topology-overview-panel-compact-gap)]",
    );
    expect(body.className).toContain(
      "data-[analysis-body-mode=overview]:max-md:pb-[var(--topology-analysis-panel-compact-scroll-end-reserve)]",
    );
    const readerLens = screen.getByTestId("topology-overview-reader-lens");
    expect(readerLens).toHaveAttribute(
      "data-reader-lens-contract",
      "non-developer-first-map-read",
    );
    expect(readerLens).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-reader-lens-surface",
    );
    expect(readerLens).toHaveAttribute(
      "data-border-token",
      "--topology-overview-reader-lens-border",
    );
    expect(readerLens).toHaveAttribute(
      "data-title-text-token",
      "--topology-overview-reader-lens-title-text",
    );
    expect(readerLens).toHaveAttribute(
      "data-item-text-token",
      "--topology-overview-reader-lens-item-text",
    );
    expect(readerLens).toHaveAttribute(
      "data-marker-surface-token",
      "--topology-overview-reader-lens-marker-surface",
    );
    expect(readerLens).toHaveAttribute(
      "data-marker-border-token",
      "--topology-overview-reader-lens-marker-border",
    );
    const relationQuality = screen.getByTestId("topology-overview-relation-quality");
    const signalGrid = screen.getByTestId("topology-overview-signal-grid");
    expect(signalGrid).toHaveAttribute(
      "data-compact-padding-token",
      "--topology-overview-signal-grid-compact-padding",
    );
    expect(signalGrid).toHaveAttribute(
      "data-compact-gap-token",
      "--topology-overview-signal-grid-compact-gap",
    );
    expect(screen.getByTestId("topology-overview-signal-metric-row")).toHaveAttribute(
      "data-overview-signal-layout",
      "compact-two-column",
    );
    expect(relationQuality).toHaveAttribute("data-density", "scan-facts");
    expect(relationQuality).toHaveAttribute(
      "data-proof-strip-contract",
      "flat-no-nested-cards",
    );
    expect(relationQuality).toHaveAttribute(
      "data-quality-meter-contract",
      "distribution-bar-maps-relation-quality",
    );
    expect(relationQuality).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-quality-surface",
    );
    expect(relationQuality).toHaveAttribute(
      "data-border-token",
      "--topology-overview-quality-border",
    );
    expect(relationQuality).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Trust level: clear 384"),
    );
    expect(
      within(relationQuality).getByTestId("topology-overview-relation-quality-strong"),
    ).toHaveTextContent("384");
    expect(
      within(relationQuality).getByTestId("topology-overview-relation-quality-strong"),
    ).toHaveAttribute("data-proof-cell-contract", "flat-divider-cell");
    expect(
      within(relationQuality).getByTestId("topology-overview-relation-quality-strong"),
    ).toHaveAttribute("data-text-token", "--topology-overview-proof-strong-text");
    expect(
      within(relationQuality).getByTestId("topology-overview-relation-quality-weak"),
    ).toHaveAttribute("data-divider-token", "--topology-overview-proof-cell-divider");
    expect(
      within(relationQuality).getByTestId("topology-overview-relation-quality-weak"),
    ).toHaveTextContent("114");
    const qualityMeter = within(relationQuality).getByTestId(
      "topology-overview-relation-quality-meter",
    );
    expect(qualityMeter).toHaveAttribute(
      "data-quality-meter-contract",
      "distribution-bar-maps-relation-quality",
    );
    expect(qualityMeter).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-quality-meter-surface",
    );
    expect(qualityMeter).toHaveAttribute(
      "data-border-token",
      "--topology-overview-quality-meter-border",
    );
    const strongSegment = qualityMeter.querySelector('[data-relation-quality-segment="strong"]');
    const weakSegment = qualityMeter.querySelector('[data-relation-quality-segment="weak"]');
    expect(strongSegment).toHaveAttribute("data-count", "384");
    expect(strongSegment).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-quality-strong-meter",
    );
    expect(weakSegment).toHaveAttribute("data-count", "114");
    expect(weakSegment).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-quality-weak-meter",
    );
    expect(
      screen.getByRole("button", { name: "Copy topology map brief" }).className,
    ).toContain("min-h-[var(--topology-overview-handoff-primary-min-height)]");
    expect(screen.getByRole("button", { name: "Copy topology map brief" })).toHaveAttribute(
      "data-min-height-token",
      "--topology-overview-handoff-primary-min-height",
    );
    expect(screen.getByTestId("topology-overview-handoff-actions")).toHaveAttribute(
      "data-compact-padding-top-token",
      "--topology-overview-handoff-compact-padding-top",
    );
    expect(screen.getByTestId("topology-overview-handoff-actions")).toHaveAttribute(
      "data-low-height-density-contract",
      "primary-copy-visible-secondary-tools-hidden",
    );
    expect(screen.getByTestId("topology-overview-handoff-actions").querySelector(
      "[data-overview-handoff-label-compact-contract]",
    )).toHaveAttribute(
      "data-overview-handoff-label-compact-contract",
      "phone-action-label-hidden",
    );
    expect(screen.getByTestId("topology-overview-handoff-actions").querySelector(
      "[data-overview-handoff-label-low-height-contract]",
    )).toHaveAttribute(
      "data-overview-handoff-label-low-height-contract",
      "hidden-under-800px",
    );
    expect(screen.getByTestId("topology-overview-handoff-summary")).toHaveAttribute(
      "data-min-height-token",
      "--topology-overview-handoff-summary-min-height",
    );
    expect(screen.getByTestId("topology-overview-relation-notice")).toHaveAttribute(
      "data-compact-padding-y-token",
      "--topology-overview-notice-compact-padding-y",
    );
    expect(screen.getByTestId("topology-overview-relation-notice")).toHaveAttribute(
      "data-low-height-overview-notice-contract",
      "sr-only-while-primary-copy-stays-visible",
    );
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
    const bar = screen.getByRole("region", {
      name: "Topology analysis mode",
    });
    expect(bar).toHaveAttribute("data-panel-width-band", "header-aligned");
    expect(bar).toHaveAttribute("data-panel-width-policy", "header-aligned");
    expect(bar).toHaveAttribute("data-panel-width-target", "path-14-inch-rail");
    expect(bar).toHaveAttribute(
      "data-panel-width-contract",
      "path-support-rail-max-360-phone-utility-reserve",
    );
    expect(bar).toHaveAttribute("data-attention-role", "support");
    expect(bar).toHaveAttribute(
      "data-panel-width-css",
      "var(--topology-panel-path-responsive-width)",
    );
    expect(bar).toHaveAttribute(
      "data-panel-width-token",
      "--topology-panel-path-responsive-width",
    );
    expect(bar).toHaveAttribute(
      "data-panel-phone-utility-reserve-token",
      "--topology-panel-phone-utility-rail-reserve",
    );
    expect(bar).toHaveAttribute("data-panel-surface-token", "--topology-panel-support-surface");
    expect(bar).toHaveAttribute("data-panel-motion-token", "--topology-motion-panel-duration");
    expect(bar).toHaveAttribute(
      "data-panel-compact-scroll-end-reserve-token",
      "--topology-analysis-panel-path-collapsed-scroll-end-reserve",
    );
    const body = screen.getByTestId("topology-analysis-panel-body");
    expect(body).toHaveAttribute("data-analysis-body-mode", "path");
    expect(body).toHaveAttribute(
      "data-panel-body-scroll-end-reserve-token",
      "--topology-analysis-panel-path-collapsed-scroll-end-reserve",
    );
    expect(body.className).toContain(
      "max-md:pb-[var(--topology-analysis-panel-path-collapsed-scroll-end-reserve)]",
    );
  });

  it("keeps the Path support rail contract even when a right detail surface is reserved", () => {
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
        selectedTitle="Views"
        rightPanelReserved
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const bar = screen.getByRole("region", {
      name: "Topology analysis mode",
    });
    expect(bar).toHaveAttribute("data-analysis-mode", "path");
    expect(bar).toHaveAttribute("data-panel-width-band", "header-aligned");
    expect(bar).toHaveAttribute("data-panel-width-target", "path-14-inch-rail");
    expect(bar).toHaveAttribute(
      "data-panel-width-contract",
      "path-support-rail-max-360-phone-utility-reserve",
    );
    expect(bar).toHaveAttribute(
      "data-panel-width-token",
      "--topology-panel-path-responsive-width",
    );
    expect(bar).toHaveAttribute(
      "data-panel-phone-utility-reserve-token",
      "--topology-panel-phone-utility-rail-reserve",
    );
  });

  it("uses a phone-safe primary rail width for Health mode", () => {
    render(
      <TopologyAnalysisBar
        mode="health"
        summary={{
          mode: "health",
          primaryMetric: 23,
          secondaryMetric: 504,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 1,
            promotion: 22,
          },
        }}
        healthAction={{
          slug: "ontology-atlas",
          title: "ontology-atlas",
          kind: "promotion",
        }}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const bar = screen.getByRole("region", {
      name: "Topology analysis mode",
    });
    expect(bar).toHaveAttribute("data-analysis-mode", "health");
    expect(bar).toHaveAttribute("data-attention-role", "primary");
    expect(bar).toHaveAttribute("data-panel-width-target", "health-phone-primary-rail");
    expect(bar).toHaveAttribute(
      "data-panel-width-contract",
      "health-primary-max-360-phone-full-width",
    );
    expect(bar).toHaveAttribute(
      "data-panel-width-token",
      "--topology-panel-overview-responsive-width",
    );
    expect(bar).toHaveAttribute(
      "data-panel-phone-utility-reserve-token",
      "--topology-panel-phone-utility-rail-reserve",
    );
    expect(bar).toHaveAttribute(
      "data-health-repair-lane-contract",
      "target-to-builder-to-sync",
    );
  });

  it("shows Path mode visible candidate coverage when collision clearance hides cards", () => {
    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 21,
          secondaryMetric: 504,
          needsSelection: true,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathCandidateVisibility={{ visible: 10, total: 21 }}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const visibility = screen.getByTestId("topology-path-candidate-visibility");
    expect(visibility).toHaveTextContent(
      "Showing 10 of 21 path candidates so the map stays readable.",
    );
    expect(visibility).not.toHaveTextContent(/panel clearance|hidden/i);
    expect(visibility).toHaveAttribute(
      "data-copy-contract",
      "reader-facing-map-readability",
    );
    expect(visibility).toHaveAttribute("data-visible", "10");
    expect(visibility).toHaveAttribute("data-total", "21");
    expect(visibility).toHaveAttribute(
      "data-surface-token",
      "--topology-path-candidate-visibility-surface",
    );
    expect(visibility).toHaveAttribute(
      "data-border-token",
      "--topology-path-candidate-visibility-border",
    );
    expect(visibility).toHaveAttribute(
      "data-notice-text-token",
      "--topology-analysis-panel-notice-text",
    );
    expect(visibility.className).toContain(
      "text-[color:var(--topology-analysis-panel-notice-text)]",
    );
    expect(visibility.className).toContain("tracking-normal");
    expect(visibility.className).not.toContain("uppercase");
    expect(visibility.className).not.toContain("font-mono");
    expect(visibility.className).not.toContain("--color-text-tertiary");
  });

  it("shows the Path mode MCP and CLI handoff contract in the support panel", () => {
    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 21,
          secondaryMetric: 504,
          needsSelection: true,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathCandidateVisibility={{ visible: 10, total: 21 }}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const handoff = screen.getByTestId("topology-path-agent-handoff");
    expect(handoff).toHaveAttribute("data-attention-layer", "focus-path-state");
    expect(handoff).toHaveAttribute(
      "data-handoff-contract",
      "route-proof-action-visible",
    );
    expect(handoff).toHaveAttribute("data-handoff-layout-contract", "compact-proof-strip");
    expect(handoff).toHaveAttribute("data-overflow-contract", "no-horizontal-scroll");
    expect(handoff).toHaveAttribute("data-surface-token", "--topology-path-handoff-surface");
    expect(handoff).toHaveAttribute("data-border-token", "--topology-path-handoff-border");
    expect(handoff).toHaveAttribute("data-text-token", "--topology-path-handoff-text");
    expect(handoff).toHaveAttribute(
      "data-label-text-token",
      "--topology-path-handoff-label-text",
    );
    expect(handoff.className).toContain(
      "text-[color:var(--topology-path-handoff-text)]",
    );
    expect(handoff.className).not.toContain("--color-text-tertiary");
    expect(handoff).toHaveAttribute(
      "data-action-min-height-token",
      "--topology-path-handoff-action-min-height",
    );
    expect(handoff).toHaveAttribute(
      "data-action-radius-token",
      "--topology-path-handoff-action-radius",
    );
    expect(handoff).toHaveAttribute(
      "data-compact-padding-y-token",
      "--topology-path-handoff-compact-padding-y",
    );
    expect(handoff).toHaveAttribute(
      "data-primary-evidence-min-height-token",
      "--topology-path-primary-evidence-min-height",
    );
    expect(handoff).toHaveAttribute("data-primary-evidence-visible", "false");
    expect(handoff).toHaveAttribute("data-mcp-action", "find_path");
    expect(handoff).toHaveAttribute("data-cli-fallback", "ontology-atlas path");
    const mcpChip = screen.getByTestId("topology-path-handoff-mcp-chip");
    expect(mcpChip).toHaveAttribute(
      "data-surface-token",
      "--topology-path-handoff-mcp-surface",
    );
    expect(mcpChip).toHaveAttribute(
      "data-border-token",
      "--topology-path-handoff-mcp-border",
    );
    expect(mcpChip).toHaveAttribute(
      "data-text-token",
      "--topology-path-handoff-mcp-text",
    );
    const cliChip = screen.getByTestId("topology-path-handoff-cli-chip");
    expect(cliChip).toHaveAttribute(
      "data-surface-token",
      "--topology-path-handoff-cli-surface",
    );
    expect(cliChip).toHaveAttribute(
      "data-border-token",
      "--topology-path-handoff-cli-border",
    );
    expect(cliChip).toHaveAttribute(
      "data-text-token",
      "--topology-path-handoff-cli-text",
    );
    expect(cliChip.className).toContain(
      "text-[color:var(--topology-path-handoff-cli-text)]",
    );
    expect(cliChip.className).not.toContain("--color-text-tertiary");
    expect(handoff).toHaveTextContent("Share route");
    expect(handoff).toHaveTextContent("Agent check");
    expect(handoff).toHaveTextContent("Terminal check");
  });

  it("keeps the selected Path route visible before the proof disclosure", () => {
    render(
      <TopologyAnalysisBar
        mode="path"
        summary={{
          mode: "path",
          primaryMetric: 21,
          secondaryMetric: 504,
          needsSelection: false,
          healthBreakdown: {
            stale: 0,
            orphan: 0,
            promotion: 0,
          },
        }}
        healthAction={null}
        selectedTitle={null}
        pathSourceSlug="domain:views"
        pathTargetSlug="capability:topology-analysis-modes"
        pathSourceTitle="Views (Topology · Browse · Builder)"
        pathTargetTitle="Topology Analysis Modes"
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    const route = screen.getByTestId("topology-path-visible-route");
    expect(route).toHaveAttribute(
      "data-route-contract",
      "source-target-visible-before-proof-disclosure",
    );
    expect(route).toHaveAttribute("data-attention-layer", "focus-path-state");
    expect(route).toHaveAttribute("data-guidance-owner", "analysis-rail");
    expect(route).toHaveAttribute("data-overflow-contract", "no-horizontal-scroll");
    expect(route).toHaveAttribute("data-source-slug", "domain:views");
    expect(route).toHaveAttribute("data-target-slug", "capability:topology-analysis-modes");
    expect(route).toHaveAttribute("data-surface-token", "--topology-path-route-surface");
    expect(route).toHaveAttribute("data-border-token", "--topology-path-route-border");
    expect(route).toHaveAttribute("data-chip-surface-token", "--topology-path-route-chip-surface");
    expect(route).toHaveAttribute("data-chip-border-token", "--topology-path-route-chip-border");
    expect(route).toHaveAttribute(
      "data-source-surface-token",
      "--topology-path-route-source-surface",
    );
    expect(route).toHaveAttribute(
      "data-source-border-token",
      "--topology-path-route-source-border",
    );
    expect(route).toHaveAttribute(
      "data-source-text-token",
      "--topology-path-route-source-text",
    );
    expect(route).toHaveAttribute(
      "data-target-surface-token",
      "--topology-path-route-target-surface",
    );
    expect(route).toHaveAttribute(
      "data-target-border-token",
      "--topology-path-route-target-border",
    );
    expect(route).toHaveAttribute(
      "data-target-text-token",
      "--topology-path-route-target-text",
    );
    expect(route).toHaveAttribute(
      "data-endpoint-marker-surface-token",
      "--topology-path-route-endpoint-marker-surface",
    );
    expect(route).toHaveAttribute(
      "data-endpoint-marker-border-token",
      "--topology-path-route-endpoint-marker-border",
    );
    expect(route).toHaveAttribute(
      "data-endpoint-marker-text-token",
      "--topology-path-route-endpoint-marker-text",
    );
    expect(route).toHaveAttribute(
      "data-route-compact-min-height-token",
      "--topology-path-route-compact-min-height",
    );
    expect(within(route).getByText("Source")).toBeInTheDocument();
    expect(within(route).getByText("Views")).toBeInTheDocument();
    expect(within(route).getByText("Target")).toBeInTheDocument();
    expect(within(route).getByText("Topology Analysis Modes")).toBeInTheDocument();
    expect(route.querySelector('[data-route-endpoint-marker="source"]')).toHaveTextContent("A");
    expect(route.querySelector('[data-route-endpoint-marker="target"]')).toHaveTextContent("B");
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
        }}
        healthAction={null}
        selectedTitle={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("topology-overview-work-order")).toBeNull();
    expect(screen.getByText("Copy map brief")).toBeVisible();
    const graphBriefButton = screen.getByRole("button", {
      name: "Copy topology map brief",
    });
    expect(graphBriefButton.className).toContain("min-h-9");
    expect(graphBriefButton.className).not.toContain("col-span-2");
    expect(graphBriefButton).toHaveAttribute("title", "Copy map brief");
    expect(
      screen.getByTestId("topology-overview-relation-provenance"),
    ).toHaveTextContent("Evidence coverage");
    expect(
      screen.getByTestId("topology-overview-relation-provenance"),
    ).toHaveTextContent("with source 70 · team-added 18 · needs check 0");
    expect(screen.getByTestId("topology-overview-relation-provenance")).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-signal-indigo-surface",
    );
    expect(screen.getByTestId("topology-overview-relation-quality")).toHaveTextContent(
      "Trust level",
    );
    expect(screen.getByTestId("topology-overview-relation-quality")).toHaveTextContent(
      "clear 62 · supported 20 · thin 4 · check 2",
    );
    const readinessGate = screen.getByTestId("topology-overview-agent-readiness");
    expect(readinessGate).toHaveTextContent("Team handoff");
    expect(readinessGate).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-readiness-surface",
    );
    expect(readinessGate).toHaveAttribute(
      "data-border-token",
      "--topology-overview-readiness-border",
    );
    expect(readinessGate).toHaveAttribute(
      "data-agent-readiness-summary",
      "ready 82 · check first 4 · needs review 2",
    );
    expect(readinessGate).toHaveAccessibleName(
      "Team handoff: ready 82 · check first 4 · needs review 2",
    );
    expect(
      readinessGate.querySelector('[data-agent-readiness-chip="ready"]'),
    ).toHaveTextContent("82");
    expect(
      readinessGate.querySelector('[data-agent-readiness-chip="ready"]'),
    ).toHaveAttribute("data-proof-cell-contract", "flat-divider-cell");
    expect(
      readinessGate.querySelector('[data-agent-readiness-chip="ready"]'),
    ).toHaveAttribute("data-text-token", "--topology-overview-proof-supported-text");
    expect(
      readinessGate.querySelector('[data-agent-readiness-chip="preflight"]'),
    ).toHaveTextContent("4");
    expect(
      readinessGate.querySelector('[data-agent-readiness-chip="preflight"]'),
    ).toHaveAttribute("data-text-token", "--topology-overview-proof-warning-text");
    expect(
      readinessGate.querySelector('[data-agent-readiness-chip="review"]'),
    ).toHaveTextContent("2");
    const readinessMeter = screen.getByTestId("topology-overview-agent-readiness-meter");
    expect(readinessMeter).toHaveAttribute(
      "aria-label",
      "Team handoff: ready 82 · check first 4 · needs review 2",
    );
    expect(readinessMeter).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-readiness-meter-surface",
    );
    expect(readinessMeter).toHaveAttribute(
      "data-border-token",
      "--topology-overview-readiness-meter-border",
    );
    expect(
      readinessMeter.querySelector('[data-agent-readiness-segment="ready"]'),
    ).toHaveAttribute("data-count", "82");
    expect(
      readinessMeter.querySelector('[data-agent-readiness-segment="ready"]'),
    ).toHaveAttribute("data-meter-token", "--topology-overview-readiness-ready-meter");
    expect(
      readinessMeter.querySelector('[data-agent-readiness-segment="preflight"]'),
    ).toHaveAttribute("data-count", "4");
    expect(
      readinessMeter.querySelector('[data-agent-readiness-segment="preflight"]'),
    ).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-readiness-preflight-meter",
    );
    expect(
      readinessMeter.querySelector('[data-agent-readiness-segment="review"]'),
    ).toHaveAttribute("data-count", "2");
    expect(screen.queryByTestId("topology-relation-quality-legend")).toBeNull();

    fireEvent.click(graphBriefButton);

    const copiedButton = await screen.findByRole("button", {
      name: "Topology map brief copied",
    });
    expect(copiedButton).toHaveTextContent("Copy map brief");
    expect(copiedButton).not.toHaveTextContent("Map brief copied");
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# Topology map brief"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Total nodes: 36"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Relation reading: treat edges as typed ontology facts, not inferred similarity scores",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Evidence coverage: with source 70 · team-added 18 · needs check 0",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Trust level: clear 62 · supported 20 · thin 4 · check 2",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Team handoff: ready 82 · check first 4 · needs review 2",
      ),
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
    expect(reanalysisButton).toHaveTextContent("Audit");
    expect(reanalysisButton).not.toHaveTextContent("Reanalysis command copied");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy ontology update check",
      }),
    );
    const syncButton = await screen.findByRole("button", {
      name: "Ontology update check copied",
    });
    expect(syncButton).toHaveTextContent("Sync");
    expect(syncButton).not.toHaveTextContent("Update check copied");
  });

  it("keeps the Overview handoff export direct instead of hiding it behind analysis-order chrome", () => {
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

    expect(screen.getByTestId("topology-overview-handoff-actions")).toBeVisible();
    expect(screen.queryByText("Analysis order")).toBeNull();
    expect(screen.queryByTestId("topology-overview-work-order")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Copy topology map brief" }),
    ).toBeVisible();
  });

  it("copies concept and impact checks for the focused node", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Copy focus concept check" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Copy focus impact check" }));
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
    expect(screen.getByText("Read concept brief")).toBeInTheDocument();
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
    expect(reviewOrder).toHaveTextContent("Read concept brief");
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
    const visibleRoute = screen.getByTestId("topology-path-visible-route");
    expect(visibleRoute).toHaveAttribute(
      "data-route-responsive-contract",
      "target-weighted-endpoints",
    );
    expect(visibleRoute.querySelector('[data-route-endpoint-title="target"]')).toHaveAttribute(
      "data-route-endpoint-title-contract",
      "weighted-route-title",
    );
    const handoff = screen.getByTestId("topology-path-agent-handoff");
    expect(handoff).toHaveAttribute("data-primary-evidence-visible", "true");
    expect(handoff).toHaveAttribute(
      "data-path-primary-evidence-contract",
      "visible-before-proof-disclosure",
    );
    const primaryEvidenceAction = screen.getByTestId("topology-path-primary-evidence-action");
    expect(primaryEvidenceAction).toHaveAttribute(
      "data-path-primary-evidence-contract",
      "visible-before-proof-disclosure",
    );
    expect(primaryEvidenceAction).toHaveAttribute(
      "data-surface-token",
      "--topology-path-primary-evidence-surface",
    );
    expect(primaryEvidenceAction).toHaveAttribute(
      "data-border-token",
      "--topology-path-primary-evidence-border",
    );
    expect(primaryEvidenceAction).toHaveAttribute(
      "data-text-token",
      "--topology-path-primary-evidence-text",
    );
    expect(primaryEvidenceAction).toHaveAttribute(
      "data-hover-surface-token",
      "--topology-path-primary-evidence-hover-surface",
    );
    expect(primaryEvidenceAction).toHaveAttribute(
      "data-hover-border-token",
      "--topology-path-primary-evidence-hover-border",
    );
    expect(primaryEvidenceAction).toHaveAttribute(
      "data-hover-text-token",
      "--topology-path-primary-evidence-hover-text",
    );
    expect(primaryEvidenceAction.className).toContain(
      "text-[color:var(--topology-path-primary-evidence-text)]",
    );
    expect(primaryEvidenceAction.className).not.toContain("--color-text-secondary");
    expect(
      within(handoff).getByRole("button", { name: "Copy topology path evidence" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy topology path MCP check" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Proof order")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Shows the visible link first, then the checks needed before changing the ontology.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("topology-path-proof-route")).toHaveTextContent("Views");
    expect(screen.getByTestId("topology-path-proof-route")).toHaveTextContent(
      "Topology Analysis Modes",
    );
    const proofRoute = screen.getByTestId("topology-path-proof-route");
    expect(proofRoute).toHaveAttribute(
      "data-route-contract",
      "proof-disclosure-source-target",
    );
    expect(proofRoute).toHaveAttribute(
      "data-surface-token",
      "--topology-path-route-surface",
    );
    expect(proofRoute).toHaveAttribute(
      "data-border-token",
      "--topology-path-route-border",
    );
    expect(proofRoute).toHaveAttribute(
      "data-chip-surface-token",
      "--topology-path-route-chip-surface",
    );
    expect(proofRoute).toHaveAttribute(
      "data-chip-border-token",
      "--topology-path-route-chip-border",
    );
    expect(
      proofRoute.querySelector('[data-route-endpoint="source"]'),
    ).toHaveTextContent("Views");
    expect(
      proofRoute.querySelector('[data-route-endpoint="target"]'),
    ).toHaveTextContent("Topology Analysis Modes");
    const pathProofActions = [
      ["Source in ontology", "source-ontology", "--topology-path-route-surface"],
      ["Target in ontology", "target-ontology", "--topology-path-route-surface"],
      ["Source in builder", "source-builder", "--topology-path-route-chip-surface"],
      ["Target in builder", "target-builder", "--topology-path-route-chip-surface"],
    ] as const;
    for (const [name, action, surfaceToken] of pathProofActions) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("data-path-proof-action", action);
      expect(link).toHaveAttribute("data-surface-token", surfaceToken);
    }
    const checklist = screen.getByTestId("topology-path-proof-checklist");
    expect(checklist).toHaveTextContent("Visible path clue");
    expect(checklist).toHaveTextContent("ready");
    expect(checklist.querySelector('[data-path-proof-step="ready"]')).toHaveAttribute(
      "data-surface-token",
      "--topology-path-proof-step-surface",
    );
    expect(checklist.querySelector('[data-path-proof-status="ready"]')).toHaveAttribute(
      "data-border-token",
      "--topology-path-proof-ready-border",
    );
    expect(checklist).toHaveTextContent("Check relation direction");
    expect(checklist).toHaveTextContent("Explain why it connects");
    expect(checklist).toHaveTextContent("Compare alternate paths");
    expect(checklist).toHaveTextContent("Sync after edits");
    expect(screen.getAllByText("required")).toHaveLength(3);
    expect(checklist.querySelector('[data-path-proof-status="required"]')).toHaveAttribute(
      "data-surface-token",
      "--topology-path-proof-required-surface",
    );
    expect(screen.getByText("after write")).toBeInTheDocument();
    expect(checklist.querySelector('[data-path-proof-status="after-write"]')).toHaveAttribute(
      "data-text-token",
      "--topology-path-proof-after-write-text",
    );
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
    expect(summary).toHaveClass("w-full");
    expect(summary).toHaveAttribute(
      "data-summary-contract",
      "full-width-proof-disclosure",
    );
    expect(summary).toHaveAttribute(
      "data-surface-token",
      "--topology-path-proof-summary-surface",
    );
    expect(summary).toHaveAttribute(
      "data-text-token",
      "--topology-path-proof-summary-text",
    );
    expect(summary).toHaveAttribute(
      "data-hover-surface-token",
      "--topology-path-proof-summary-hover-surface",
    );
    expect(summary).toHaveAttribute(
      "data-hover-text-token",
      "--topology-path-proof-summary-hover-text",
    );
    expect(summary.className).toContain(
      "text-[color:var(--topology-path-proof-summary-text)]",
    );
    expect(summary.className).not.toContain("--color-text-quaternary");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByTestId("topology-path-proof-chevron")).toHaveClass(
      "group-open:rotate-180",
    );
    const proofKicker = screen.getByTestId("topology-path-proof-kicker");
    expect(proofKicker).toHaveAttribute(
      "data-text-token",
      "--topology-path-proof-kicker-text",
    );
    expect(proofKicker.className).toContain(
      "text-[color:var(--topology-path-proof-kicker-text)]",
    );
    expect(proofKicker.className).not.toContain("--color-text-quaternary");
    const proofRoute = screen.getByTestId("topology-path-proof-route");
    expect(proofRoute).toHaveAttribute(
      "data-chip-text-token",
      "--topology-path-route-chip-text",
    );
    expect(proofRoute).toHaveAttribute(
      "data-arrow-text-token",
      "--topology-path-route-arrow-text",
    );
    for (const endpoint of proofRoute.querySelectorAll("[data-route-endpoint]")) {
      expect(endpoint.className).toContain(
        "text-[color:var(--topology-path-route-chip-text)]",
      );
      expect(endpoint.className).not.toContain("--color-text-secondary");
    }
    const proofDescription = screen.getByTestId("topology-path-proof-description");
    expect(proofDescription).toHaveAttribute(
      "data-text-token",
      "--topology-path-proof-desc-text",
    );
    expect(proofDescription.className).toContain(
      "text-[color:var(--topology-path-proof-desc-text)]",
    );
    expect(proofDescription.className).not.toContain("--color-text-tertiary");
    for (const action of [
      "source-ontology",
      "target-ontology",
      "source-builder",
      "target-builder",
    ] as const) {
      const link = document.querySelector(`[data-path-proof-action="${action}"]`);
      expect(link).toHaveAttribute(
        "data-text-token",
        "--topology-path-proof-action-text",
      );
      expect(link).toHaveAttribute(
        "data-hover-text-token",
        "--topology-path-proof-action-hover-text",
      );
      expect(link?.className).toContain(
        "text-[color:var(--topology-path-proof-action-text)]",
      );
      expect(link?.className).not.toContain("--color-text-tertiary");
    }
    const toolsSummary = screen.getByTestId("topology-path-checks-summary");
    expect(toolsSummary).toHaveTextContent("Path checks");
    expect(toolsSummary.className).toContain("min-h-8");
    expect(toolsSummary).toHaveAttribute(
      "data-text-token",
      "--topology-path-check-summary-text",
    );
    expect(toolsSummary).toHaveAttribute(
      "data-hover-text-token",
      "--topology-path-check-summary-hover-text",
    );
    expect(toolsSummary.className).toContain(
      "text-[color:var(--topology-path-check-summary-text)]",
    );
    expect(toolsSummary.className).not.toContain("--color-text-quaternary");
    expect(screen.getByTestId("topology-path-checks-chevron")).toHaveClass(
      "group-open:rotate-180",
    );
    const checkActions = screen.getByTestId("topology-path-check-actions");
    expect(checkActions).toHaveAttribute(
      "data-path-check-action-contract",
      "mcp-sequence-proof-actions",
    );
    expect(checkActions).toHaveAttribute(
      "data-surface-token",
      "--topology-path-handoff-surface",
    );
    const pathCheckActions = [
      ["Copy topology path MCP check", "path-mcp", "--topology-path-handoff-mcp-surface"],
      [
        "Copy topology path relation preflight MCP check",
        "relation-preflight",
        "--topology-path-handoff-cli-surface",
      ],
      [
        "Copy topology path explain_relation MCP check",
        "explain-relation",
        "--topology-path-handoff-cli-surface",
      ],
      [
        "Copy topology path all_paths query plan MCP check",
        "all-paths-plan",
        "--topology-path-handoff-cli-surface",
      ],
      [
        "Copy topology path all_paths MCP execution check",
        "all-paths-run",
        "--topology-path-handoff-cli-surface",
      ],
    ] as const;
    for (const [name, action, surfaceToken] of pathCheckActions) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("data-path-check-action", action);
      expect(button).toHaveAttribute("data-surface-token", surfaceToken);
    }
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
      expect.stringContaining("  - Check relation direction: required"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  - Explain why it connects: required"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  - Compare alternate paths: required"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("  - Sync after edits: after write"),
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
    expect(screen.getByTestId("topology-analysis-panel")).toHaveAttribute(
      "data-health-repair-lane-contract",
      "target-to-builder-to-sync",
    );
    expect(screen.getByTestId("topology-analysis-panel")).toHaveAttribute(
      "data-health-repair-target-slug",
      "domain:views",
    );
    expect(screen.getByTestId("topology-analysis-panel")).toHaveAttribute(
      "data-health-repair-target-kind",
      "orphan",
    );
    expect(screen.getByTestId("topology-analysis-panel")).toHaveAttribute(
      "data-health-panel-phone-max-height-token",
      "--topology-health-panel-phone-max-height",
    );
    expect(screen.getByTestId("topology-analysis-panel")).toHaveAttribute(
      "data-panel-compact-scroll-end-reserve-token",
      "--topology-health-panel-scroll-end-reserve",
    );
    expect(screen.getByTestId("topology-analysis-panel").className).toContain(
      "data-[analysis-mode=health]:max-md:max-h-[var(--topology-health-panel-phone-max-height)]",
    );
    expect(screen.getByTestId("topology-analysis-panel-body").className).toContain(
      "data-[analysis-body-mode=health]:max-md:pb-[var(--topology-health-panel-scroll-end-reserve)]",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-health-repair-order-contract",
      "inspect-repair-sync",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-health-repair-action-order",
      "builder-mcp-ontology",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-health-repair-visual-contract",
      "builder-primary-full-secondary-row",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-health-repair-primary-action",
      "builder",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-health-repair-sync-gate",
      "post-change",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-primary-surface-token",
      "--topology-health-repair-primary-surface",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-primary-border-token",
      "--topology-health-repair-primary-border",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-secondary-surface-token",
      "--topology-health-repair-secondary-surface",
    );
    expect(screen.getByTestId("topology-health-repair-order")).toHaveAttribute(
      "data-secondary-border-token",
      "--topology-health-repair-secondary-border",
    );
    expect(
      screen.getByRole("button", { name: "open question Views" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inspect" })).not.toBeInTheDocument();
    const actionRail = screen.getByTestId("topology-health-repair-order");
    const primaryRepair = within(actionRail).getByRole("link", {
      name: "Repair in builder",
    });
    expect(primaryRepair).toHaveAttribute(
      "data-health-repair-primary-action",
      "builder",
    );
    expect(primaryRepair).toHaveAttribute(
      "data-health-repair-action-tier",
      "primary",
    );
    expect(primaryRepair).toHaveAttribute(
      "data-surface-token",
      "--topology-health-repair-primary-surface",
    );
    expect(primaryRepair).toHaveAttribute(
      "data-border-token",
      "--topology-health-repair-primary-border",
    );
    expect(primaryRepair.className).toContain("min-h-9");
    expect(primaryRepair.className).toContain("justify-center");
    expect(primaryRepair.className).toContain("col-span-2");
    expect(primaryRepair.querySelector("span")?.className).toContain("whitespace-nowrap");
    expect(actionRail.className).toContain("grid-cols-2");
    expect(within(actionRail).getAllByRole("link")[0]).toBe(primaryRepair);
    const mcpCopy = within(actionRail).getByRole("button", {
      name: "Copy health MCP check",
    });
    expect(mcpCopy).toHaveAttribute("data-health-repair-secondary-action", "mcp");
    expect(mcpCopy).toHaveAttribute("data-health-repair-action-tier", "secondary");
    expect(mcpCopy).toHaveAttribute(
      "data-surface-token",
      "--topology-health-repair-secondary-surface",
    );
    expect(mcpCopy).toHaveAttribute(
      "data-border-token",
      "--topology-health-repair-secondary-border",
    );
    const ontologyLink = within(actionRail).getByRole("link", {
      name: "Open ontology",
    });
    expect(ontologyLink).toHaveAttribute(
      "data-health-repair-secondary-action",
      "ontology",
    );
    expect(ontologyLink).toHaveAttribute(
      "data-border-token",
      "--topology-health-repair-secondary-border",
    );
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
