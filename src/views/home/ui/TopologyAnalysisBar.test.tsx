import { fireEvent, render, screen, within } from "@testing-library/react";
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
        healthAction={null}
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
        healthAction={null}
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
      "two-view-tabs-health-queue-chip",
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
        healthAction={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
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
        healthAction={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );
    const panel = screen.getByTestId("topology-analysis-panel");
    expect(panel).toHaveAttribute("data-panel-width-target", "graph-compact-rail");
    expect(panel.style.width).toBe("var(--topology-panel-graph-width)");
  });

  it("surfaces the health queue as a count chip and routes clicks to health mode", () => {
    const onModeChange = vi.fn();
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 22,
          secondaryMetric: 504,
          needsSelection: false,
          healthBreakdown: { stale: 0, orphan: 1, promotion: 22 },
        }}
        healthAction={null}
        labels={labels}
        onModeChange={onModeChange}
        onHealthAction={vi.fn()}
      />,
    );
    const chip = screen.getByRole("button", { name: "Health" });
    expect(chip).toHaveAttribute("data-analysis-health-chip");
    // 칩 숫자 = 진짜 결함(오래된 근거 + 소속 미정)만. 허브 후보 22건은
    // 통계적 제안이라 카운트에서 제외 (감사 ⑦-b: alert fatigue 방지).
    expect(chip).toHaveAttribute("data-health-queue-count", "1");
    expect(chip.textContent).toBe("1");
    fireEvent.click(chip);
    expect(onModeChange).toHaveBeenCalledWith("health");
  });

  it("hides the health chip when only statistical suggestions remain", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 22,
          secondaryMetric: 504,
          needsSelection: false,
          healthBreakdown: { stale: 0, orphan: 0, promotion: 22 },
        }}
        healthAction={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Health" })).toBeNull();
  });

  it("hides the health queue chip when the maintenance queue is empty", () => {
    render(
      <TopologyAnalysisBar
        mode="overview"
        summary={{
          mode: "overview",
          primaryMetric: 22,
          secondaryMetric: 504,
          needsSelection: false,
          healthBreakdown: { stale: 0, orphan: 0, promotion: 0 },
        }}
        healthAction={null}
        labels={labels}
        onModeChange={vi.fn()}
        onHealthAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Health" })).toBeNull();
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
        healthAction={null}
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
        healthAction={null}
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
        healthAction={null}
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
    expect(visibility).toHaveAttribute(
      "data-path-rail-spacing-contract",
      "parent-gap-owns-path-stack",
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
    expect(visibility.className).not.toContain("mt-");
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
    expect(handoff).toHaveAttribute(
      "data-handoff-layout-contract",
      "evidence-first-agent-handoff-compact",
    );
    expect(handoff).toHaveAttribute(
      "data-handoff-hierarchy",
      "primary-evidence-secondary-agent-checks",
    );
    expect(handoff).toHaveAttribute("data-overflow-contract", "no-horizontal-scroll");
    expect(handoff).toHaveAttribute(
      "data-path-rail-spacing-contract",
      "parent-gap-owns-path-stack",
    );
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
    expect(handoff.className).toContain("gap-1");
    expect(handoff.className).not.toContain("mt-");
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
    expect(screen.getByTestId("topology-path-handoff-header")).toHaveAttribute(
      "data-path-handoff-header-contract",
      "share-label-before-actions",
    );
    expect(screen.getByTestId("topology-path-handoff-secondary-row")).toHaveAttribute(
      "data-path-handoff-secondary-contract",
      "agent-actions-demoted-after-evidence",
    );
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
    expect(route).toHaveAttribute(
      "data-path-rail-spacing-contract",
      "parent-gap-owns-path-stack",
    );
    expect(route).toHaveAttribute(
      "data-route-responsive-contract",
      "phone-fluid-tablet-stacked-wide-desktop-weighted-endpoints",
    );
    expect(route.className).toContain("grid-cols-[");
    expect(route.className).toContain("md:grid-cols-1");
    expect(route.className).toContain("2xl:grid-cols-[");
    expect(route.className).toContain("2xl:gap-0");
    expect(route.className).not.toContain("mt-");
    expect(within(route).getByText("Source")).toBeInTheDocument();
    expect(within(route).getByText("Views")).toBeInTheDocument();
    expect(within(route).getByText("Target")).toBeInTheDocument();
    expect(within(route).getByText("Topology Analysis Modes")).toBeInTheDocument();
    expect(route.querySelector('[data-route-endpoint-marker="source"]')).toHaveTextContent("A");
    expect(route.querySelector('[data-route-endpoint-marker="target"]')).toHaveTextContent("B");
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
      "phone-fluid-tablet-stacked-wide-desktop-weighted-endpoints",
    );
    expect(visibleRoute.className).toContain("md:grid-cols-1");
    expect(visibleRoute.className).toContain("2xl:grid-cols-[");
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
    const disclosure = screen.getByTestId("topology-path-proof-disclosure");
    expect(disclosure).toHaveAttribute(
      "data-path-proof-disclosure-contract",
      "closed-by-default-path-rail-proof",
    );
    expect(disclosure).toHaveAttribute(
      "data-path-rail-spacing-contract",
      "parent-gap-owns-path-stack",
    );
    expect(disclosure.className).not.toContain("mt-");
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
