import { render, screen } from "@testing-library/react";
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
  graph: "Graph",
  graphPrompt: "Drag nodes freely; hover to trace neighbors.",
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
  focusBriefCopy: "Copy focus brief",
  focusBriefCopySummary: "Brief + impact packet",
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
        labels={labels}
        onModeChange={vi.fn()}
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
    // Relation provenance/quality/readiness gates retired from this panel
    // (W3 분석 보기 은퇴) — readiness now lives on the insights relations tab
    // (`RelationsTab.test.tsx`), provenance/quality are not duplicated there.
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
        labels={labels}
        onModeChange={vi.fn()}
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
      "two-view-tabs",
    );
    expect(modeRail).toHaveAttribute(
      "data-surface-token",
      "--topology-analysis-mode-rail-surface",
    );
    expect(modeRail).toHaveAttribute(
      "data-mode-tab-height-token",
      "--topology-analysis-mode-tab-height",
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
    expect(screen.getByRole("button", { name: "Overview" }).className).toContain(
      "h-[var(--topology-analysis-mode-tab-height)]",
    );
    expect(screen.getByRole("button", { name: "Graph" }).className).toContain(
      "h-[var(--topology-analysis-mode-tab-height)]",
    );
    // 초점/경로 탭은 제거 — 초점은 노드 선택 상태, 경로는 액션으로 재배치.
    expect(screen.queryByRole("button", { name: "Focus" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Path" })).toBeNull();
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
    expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute(
      "data-hover-surface-token",
      "--topology-analysis-mode-hover-surface",
    );
    expect(screen.getByRole("button", { name: "Graph" })).toHaveAttribute(
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
        labels={labels}
        onModeChange={vi.fn()}
      />,
    );

    for (const name of ["Overview", "Graph"] as const) {
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

  it("keeps the graph view rail compact so the living canvas stays the protagonist", () => {
    render(
      <TopologyAnalysisBar
        mode="graph"
        summary={{
          mode: "graph",
          primaryMetric: 294,
          secondaryMetric: 504,
          needsSelection: false,
          healthBreakdown: { stale: 0, orphan: 0, promotion: 0 },
        }}
        labels={labels}
        onModeChange={vi.fn()}
      />,
    );
    const panel = screen.getByTestId("topology-analysis-panel");
    expect(panel).toHaveAttribute("data-panel-width-target", "graph-compact-rail");
    expect(panel.style.width).toBe("var(--topology-panel-graph-width)");
  });

  it("keeps the overview guidance to a single line and defers concept/relation census to the workspace HUD (design guardian verdict a6)", () => {
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
        labels={{
          ...labels,
          overviewPrompt:
            "Start with the product/system map: domains, capabilities, and change paths stay visible for team inspection and sharing.",
        }}
        onModeChange={vi.fn()}
      />,
    );

    const prompt = screen.getByText(
      "Start with the product/system map: domains, capabilities, and change paths stay visible for team inspection and sharing.",
    );
    // 산문 1줄화(verdict a6) — overview 는 더 이상 2~3줄로 펼쳐지지 않는다.
    // (문안 자체는 scripts/validate-messages.test.mjs 계약이 고정 — 시각
    // 압축은 line-clamp-1 로, ellipsis 로 1줄에 자연스럽게 잘린다.)
    expect(prompt.className).toContain("line-clamp-1");
    expect(prompt.className).not.toContain("line-clamp-3");
    expect(prompt.className).not.toContain("truncate");
    expect(prompt).toHaveAttribute(
      "data-prompt-text-token",
      "--topology-analysis-panel-prompt-text",
    );
    expect(prompt.className).toContain(
      "text-[color:var(--topology-analysis-panel-prompt-text)]",
    );
    expect(prompt.className).not.toContain("--color-text-secondary");

    // census 중복 삭제(verdict a6) — concepts/relations 숫자는 상단 워크스페이스
    // HUD(HeroCollapsed subtitle) 가 이미 보여주므로 overview 패널은 반복하지
    // 않는다. 값 자체는 렌더되지 않아야 한다(다른 모드 프롬프트에 우연히
    // "292"/"498" 이 없다는 전제 — 이 테스트의 labels 는 기본 labels 를 씀).
    expect(screen.queryByTestId("topology-analysis-panel-metrics")).toBeNull();
    expect(screen.queryByText("292")).toBeNull();
    expect(screen.queryByText("498")).toBeNull();
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
        leftPanelExpanded
        labels={labels}
        onModeChange={vi.fn()}
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
        labels={labels}
        onModeChange={vi.fn()}
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
    expect(bar.className).toContain("data-[analysis-mode=overview]:lg:min-h-[390px]");
    expect(bar.className).toContain("overflow-x-hidden");
    expect(bar.className).toContain("overflow-y-hidden");
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
        createPanelReserved
        labels={labels}
        onModeChange={vi.fn()}
      />,
    );

    const bar = screen.getByRole("region", {
      name: "Topology analysis mode",
    });
    expect(bar.className).toContain("top-[31.5rem]");
    expect(bar.className).toContain("max-h-[calc(100dvh-33.5rem)]");
  });

});
