import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TopologyNodeFocusModel } from "../lib/topology-node-focus";
import {
  TopologyNodePopover,
  type TopologyNodePopoverLabels,
} from "./TopologyNodePopover";

const labels: TopologyNodePopoverLabels = {
  connections: "연결된 노드",
  usedBy: "이 노드를 쓰는 곳",
  dependsOn: "이 노드가 기대는 곳",
  noConnections: "직접 연결 없음",
  openFullDetail: "전체 상세",
  collapse: "지도 보기",
  expand: "상세 보기",
  close: "닫기",
  moreSuffix: "더",
  actionRailTitle: "에이전트 인계",
  actionRailHint: "복사",
  expandedNote:
    "{count}개 직접 연결은 지도에 펼쳐져 있어요. 지도 보기를 누르면 겹침 없이 확인할 수 있어요.",
  relationLensTitle: "관계 렌즈",
  relationLensDirectFactOne: "직접 의미 관계 {count}개",
  relationLensDirectFactOther: "직접 의미 관계 {count}개",
  relationLensTypeOne: "관계 유형 {count}종",
  relationLensTypeOther: "관계 유형 {count}종",
  relationLensCompactFacts: "관계",
  relationLensCompactTypes: "유형",
  relationLensNoScores: "추론된 유사도 점수가 아니라 타입이 있는 온톨로지 사실입니다.",
  relationQualityTitle: "관계 품질",
  relationQualityLabels: {
    strong: "강한 구조",
    supported: "근거 있는 관계",
    weak: "약한 관련",
    review: "검토",
  },
  agentReadinessTitle: "에이전트 준비도",
  agentReadinessLabels: {
    ready: "전달 가능",
    preflight: "사전 점검",
    review: "검토",
  },
  agentGateChipLabels: {
    "handoff-ready": "전달",
    "preflight-first": "점검",
    "review-first": "검토",
  },
  relationCopyActionChipLabels: {
    explain_relation: "설명",
    relation_check: "점검",
  },
  relationPayloadChipLabel: "복사",
  relationEvidenceChipLabel: "근거",
  kindLabels: {
    capability: "역량",
    domain: "도메인",
    element: "요소",
    unknown: "기타",
  },
  relationTypeLabels: {
    contains: "포함",
    uses: "사용",
  },
};

function focusModel(
  extra: Partial<TopologyNodeFocusModel> = {},
): TopologyNodeFocusModel {
  return {
    id: "capabilities/mcp-server",
    title: "MCP Server",
    kind: "capability",
    summary: "AI agent surface.",
    sourceSlug: "capabilities/mcp-server",
    usedByCount: 1,
    dependsOnCount: 2,
    connections: [
      {
        id: "elements/mcp-sdk",
        title: "MCP SDK",
        kind: "element",
        direction: "outgoing",
        relationType: "uses",
        relationQuality: "strong",
        evidenceCount: 1,
        authored: true,
      },
      {
        id: "domains/ai-agent-partner",
        title: "AI Agent Partner",
        kind: "domain",
        direction: "incoming",
        relationType: "contains",
        relationQuality: "supported",
        evidenceCount: 0,
        authored: true,
      },
    ],
    relationQuality: {
      strong: 1,
      supported: 1,
      weak: 0,
      review: 0,
    },
    hiddenConnectionCount: 0,
    ...extra,
  };
}

function setup(props: Partial<React.ComponentProps<typeof TopologyNodePopover>> = {}) {
  const onSelectConnection = vi.fn();
  const onOpenFullDetail = vi.fn();
  const onClose = vi.fn();
  render(
    <TopologyNodePopover
      focus={focusModel()}
      labels={labels}
      onSelectConnection={onSelectConnection}
      onOpenFullDetail={onOpenFullDetail}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSelectConnection, onOpenFullDetail, onClose };
}

describe("TopologyNodePopover", () => {
  it("uses a readable inspector rail while leaving the map primary", () => {
    setup();
    const popover = screen.getByTestId("topology-node-popover");
    expect(popover).toHaveAttribute("data-surface-role", "active-node-inspector");
    expect(popover).toHaveAttribute("data-attention-role", "supporting-detail");
    expect(popover).toHaveAttribute("data-focus-primary", "linked-focus-cluster");
    expect(popover).toHaveAttribute("data-hierarchy-contract", "click-focus-detail-support");
    expect(popover).toHaveAttribute("data-density", "readable");
    expect(popover).toHaveAttribute("data-size-policy", "inspector-rail");
    expect(popover).toHaveAttribute(
      "data-width-token",
      "--topology-node-popover-fluid-width",
    );
    expect(popover).toHaveAttribute(
      "data-rail-width-token",
      "--topology-node-popover-rail-width",
    );
    expect(popover).toHaveAttribute(
      "data-max-height-token",
      "--topology-node-popover-max-height",
    );
    expect(popover).toHaveAttribute(
      "data-popover-surface-token",
      "--topology-node-popover-surface",
    );
    expect(popover).toHaveAttribute(
      "data-popover-border-token",
      "--topology-node-popover-border",
    );
    expect(popover).toHaveAttribute(
      "data-title-lines-token",
      "--topology-node-popover-title-lines",
    );
    const kindLabel = document.querySelector("[data-selected-node-kind-label]");
    const countLine = document.querySelector("[data-selected-node-count-line]");
    const summaryLine = document.querySelector("[data-summary-text-token]");
    expect(kindLabel).toHaveAttribute(
      "data-kind-text-token",
      "--topology-node-popover-kind-text",
    );
    expect(kindLabel?.className).toContain(
      "text-[color:var(--topology-node-popover-kind-text)]",
    );
    expect(kindLabel?.className).not.toContain("var(--color-text-quaternary)");
    expect(countLine).toHaveAttribute(
      "data-count-text-token",
      "--topology-node-popover-count-text",
    );
    expect(countLine?.className).toContain(
      "text-[color:var(--topology-node-popover-count-text)]",
    );
    expect(countLine?.className).not.toContain("var(--color-text-quaternary)");
    expect(summaryLine).toHaveAttribute(
      "data-summary-text-token",
      "--topology-node-popover-summary-text",
    );
    expect(summaryLine).toHaveAttribute("data-summary-role", "raw-supporting-note");
    expect(summaryLine).toHaveAttribute("data-summary-order-contract", "primary-when-no-meaning");
    expect(summaryLine?.className).toContain(
      "text-[color:var(--topology-node-popover-summary-text)]",
    );
    expect(summaryLine?.className).toContain("line-clamp-1");
    expect(summaryLine?.className).not.toContain("var(--color-text-tertiary)");
    expect(popover).toHaveAttribute(
      "data-responsive-width-contract",
      "fluid-inspector-to-rail",
    );
    expect(popover).toHaveAttribute(
      "data-popover-scroll-contract",
      "expanded-internal-scroll",
    );
    expect(popover).toHaveAttribute(
      "data-title-readability-contract",
      "selected-node-title-readable",
    );
    expect(popover).toHaveAttribute("data-selected-node-id", "capabilities/mcp-server");
    expect(popover).toHaveAttribute("data-selected-node-kind", "capability");
    expect(popover).toHaveAttribute("data-selected-node-title", "MCP Server");
    expect(popover).toHaveAttribute("data-selected-node-source", "capabilities/mcp-server");
    expect(popover).toHaveAttribute(
      "data-selected-node-summary",
      "capability capabilities/mcp-server · MCP Server",
    );
    expect(popover.className).toContain("min-w-0");
    expect(popover.className).toContain("w-[var(--topology-node-popover-fluid-width)]");
    expect(popover.className).toContain("max-w-[var(--topology-node-popover-fluid-width)]");
    expect(popover.className).toContain("overflow-hidden");
    expect(screen.getByTestId("topology-node-popover-body").className).toContain(
      "overflow-y-auto",
    );
    expect(screen.getByTestId("topology-node-popover-body")).toHaveAttribute(
      "data-body-scroll-contract",
      "content-scrolls-above-fixed-footer",
    );
    const connectionSection = screen.getByTestId("topology-connections-section");
    expect(connectionSection).toHaveAttribute(
      "data-relation-section-border-token",
      "--topology-node-popover-relation-section-border",
    );
    expect(connectionSection).toHaveAttribute(
      "data-relation-section-title-text-token",
      "--topology-node-popover-relation-section-title-text",
    );
    expect(connectionSection).toHaveAttribute(
      "data-relation-section-lens-text-token",
      "--topology-node-popover-relation-section-lens-text",
    );
    expect(connectionSection.className).toContain(
      "border-[color:var(--topology-node-popover-relation-section-border)]",
    );
    expect(connectionSection.className).not.toContain("var(--color-divider)");
    expect(popover.className).toContain("lg:w-[var(--topology-node-popover-rail-width)]");
    expect(popover.className).toContain("lg:max-w-[var(--topology-node-popover-rail-width)]");
    expect(popover.className).toContain(
      "min-[1400px]:w-[var(--topology-node-popover-wide-rail-width)]",
    );
    expect(popover.className).toContain(
      "min-[1400px]:max-w-[var(--topology-node-popover-wide-rail-width)]",
    );
    expect(popover.className).toContain(
      "min-[1800px]:w-[var(--topology-node-popover-cinema-rail-width)]",
    );
    expect(popover.className).toContain("max-h-[var(--topology-node-popover-max-height)]");
    const title = screen.getByTestId("topology-node-popover-title");
    expect(title).toHaveAttribute(
      "data-title-readability-contract",
      "selected-node-title-readable",
    );
    expect(title).toHaveAttribute(
      "data-title-lines-token",
      "--topology-node-popover-title-lines",
    );
    expect(title).toHaveAttribute(
      "data-title-text-token",
      "--topology-node-popover-title-text",
    );
    expect(title.className).toContain("line-clamp-[var(--topology-node-popover-title-lines)]");
    expect(title.className).toContain(
      "text-[color:var(--topology-node-popover-title-text)]",
    );
    expect(title.className).not.toContain("truncate");
    expect(title.className).not.toContain("var(--color-text-primary)");

    const usedByMetric = document.querySelector('[data-node-popover-metric="이 노드를 쓰는 곳"]');
    expect(usedByMetric).toHaveAttribute(
      "data-metric-surface-token",
      "--topology-node-popover-metric-surface",
    );
    expect(usedByMetric).toHaveAttribute(
      "data-metric-border-token",
      "--topology-node-popover-metric-border",
    );
    expect(usedByMetric).toHaveAttribute(
      "data-metric-label-text-token",
      "--topology-node-popover-metric-label-text",
    );
    expect(usedByMetric).toHaveAttribute(
      "data-metric-value-text-token",
      "--topology-node-popover-metric-value-text",
    );
    expect(usedByMetric?.className).toContain(
      "bg-[color:var(--topology-node-popover-metric-surface)]",
    );
    expect(usedByMetric?.className).toContain(
      "border-[color:var(--topology-node-popover-metric-border)]",
    );
    expect(usedByMetric?.className).not.toContain("var(--color-overlay-1)");
    const usedByMetricTexts = usedByMetric?.querySelectorAll("p");
    expect(usedByMetricTexts?.[0]?.className).toContain(
      "text-[color:var(--topology-node-popover-metric-label-text)]",
    );
    expect(usedByMetricTexts?.[1]?.className).toContain(
      "text-[color:var(--topology-node-popover-metric-value-text)]",
    );
    const relationTitle = document.querySelector('[data-relation-section-title="connections"]');
    expect(relationTitle?.className).toContain(
      "text-[color:var(--topology-node-popover-relation-section-title-text)]",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-section-lens",
      "typed-fact-summary",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-lens-density-contract",
      "split-metric-proof-strip",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-lens-layout",
      "label-value-metrics",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-lens-grid-token",
      "--topology-node-popover-relation-lens-grid",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-lens-gap-token",
      "--topology-node-popover-relation-lens-gap",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-lens-padding-x-token",
      "--topology-node-popover-relation-lens-padding-x",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-lens-padding-y-token",
      "--topology-node-popover-relation-lens-padding-y",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-lens-metric-gap-token",
      "--topology-node-popover-relation-lens-metric-gap",
    );
    expect(screen.getByTestId("topology-relation-lens")).toHaveAttribute(
      "data-relation-lens-metric-min-width-token",
      "--topology-node-popover-relation-lens-metric-min-width",
    );
    expect(screen.getByTestId("topology-relation-lens").className).toContain(
      "grid-cols-[var(--topology-node-popover-relation-lens-grid)]",
    );
    expect(screen.getByTestId("topology-relation-lens").className).toContain(
      "gap-[var(--topology-node-popover-relation-lens-gap)]",
    );
    expect(screen.getByTestId("topology-relation-lens").className).toContain(
      "text-[color:var(--topology-node-popover-relation-section-lens-text)]",
    );
  });

  it("reserves enough 14-inch vertical budget for relation rows before scrolling", () => {
    setup();
    const popover = screen.getByTestId("topology-node-popover");
    const section = screen.getByTestId("topology-connections-section");

    expect(popover.className).toContain("max-h-[var(--topology-node-popover-max-height)]");
    expect(popover.className).not.toContain("max-h-[min(72vh,38rem)]");
    expect(popover.className).not.toContain("max-h-[min(78vh,44rem)]");
    expect(section).toHaveAttribute(
      "data-readable-list-budget",
      "two-relation-preview-primary-scroll",
    );
  });

  it("keeps the connection list in the only scrolling region so the footer cannot overlap it", () => {
    setup();
    const section = screen.getByTestId("topology-connections-section");
    const relationLens = screen.getByTestId("topology-relation-lens");
    const mapContextNote = screen.queryByTestId("topology-map-context-note");
    const significance = screen.queryByTestId("topology-node-significance");
    const summary = screen.getByText("AI agent surface.");
    const list = screen.getByText("MCP SDK").closest("ul");
    const body = screen.getByTestId("topology-node-popover-body");
    const footer = screen.getByTestId("topology-node-popover-footer");
    const row = document.querySelector("[data-relation-row]");
    expect(body).toHaveAttribute(
      "data-body-scroll-contract",
      "content-scrolls-above-fixed-footer",
    );
    expect(body.className).toContain("min-h-0");
    expect(body.className).toContain("overflow-y-auto");
    expect(section).toHaveAttribute("data-overflow-contract", "single-vertical-scroll-region");
    expect(relationLens).toHaveAttribute(
      "data-phone-density-contract",
      "hide-explainer-before-readable-row",
    );
    expect(relationLens.className).toContain("max-[540px]:hidden");
    expect(summary).toHaveAttribute(
      "data-phone-density-contract",
      "hide-summary-before-readable-row",
    );
    expect(summary.className).toContain("max-[540px]:hidden");
    if (significance) {
      expect(significance).toHaveAttribute(
        "data-phone-density-contract",
        "keep-primary-meaning-before-readable-row",
      );
      expect(significance).toHaveAttribute(
        "data-meaning-order-contract",
        "before-raw-summary",
      );
      expect(significance.className).toContain("max-[540px]:mt-2");
    }
    if (mapContextNote) {
      expect(mapContextNote).toHaveAttribute(
        "data-phone-density-contract",
        "defer-map-context-before-readable-row",
      );
      expect(mapContextNote.className).toContain("max-xl:hidden");
    }
    expect(list).toHaveAttribute("data-testid", "topology-node-connection-list");
    expect(list).toHaveAttribute("data-overflow-contract", "vertical-scroll-only");
    expect(list).toHaveAttribute(
      "data-readable-row-contract",
      "at-least-one-full-relation-row",
    );
    expect(list).toHaveAttribute(
      "data-relation-list-min-height-token",
      "--topology-node-popover-relation-list-min-height",
    );
    expect(list?.className).toContain(
      "min-h-[var(--topology-node-popover-relation-list-min-height)]",
    );
    expect(list?.className).toContain("flex-1");
    expect(list?.className).toContain("overflow-y-auto");
    expect(list?.className).toContain("overflow-x-hidden");
    expect(list?.className).not.toContain("max-h-40");
    expect(row).toHaveAttribute("data-overflow-contract", "no-horizontal-scroll");
    expect(footer).toHaveAttribute("data-footer-contract", "fixed-outside-scroll-region");
    expect(footer).toHaveAttribute("data-footer-position-contract", "anchored-bottom-visible");
    expect(footer).toHaveAttribute("data-overflow-contract", "no-horizontal-scroll");
    expect(footer).toHaveAttribute("data-footer-density-contract", "compact-command-strip");
    expect(footer).toHaveAttribute(
      "data-popover-footer-surface-token",
      "--topology-node-popover-footer-surface",
    );
    expect(footer).toHaveAttribute(
      "data-popover-footer-border-token",
      "--topology-node-popover-footer-border",
    );
    expect(footer).toHaveAttribute(
      "data-popover-footer-title-text-token",
      "--topology-node-popover-footer-title-text",
    );
    expect(footer).toHaveAttribute(
      "data-popover-footer-padding-x-token",
      "--topology-node-popover-footer-padding-x",
    );
    expect(footer).toHaveAttribute(
      "data-popover-footer-padding-y-token",
      "--topology-node-popover-footer-padding-y",
    );
    expect(footer.className).toContain("shrink-0");
    expect(footer.className).toContain("overflow-hidden");
    expect(footer.className).toContain(
      "border-[color:var(--topology-node-popover-footer-border)]",
    );
    expect(footer.className).not.toContain("var(--topology-node-popover-border)");
    expect(section.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(footer.closest('[data-testid="topology-connections-section"]')).toBeNull();
  });

  it("gives relation rows a scan-friendly handoff density contract", () => {
    setup();

    const list = screen.getByTestId("topology-node-connection-list");
    const relationRow = document.querySelector("[data-relation-row]");
    const relationTitle = relationRow?.querySelector("[data-relation-title]");
    const relationMeta = relationRow?.querySelector("[data-relation-row-meta]");
    const handoffLane = relationRow?.querySelector("[data-relation-route]");

    expect(list).toHaveAttribute("data-row-density-contract", "agent-handoff-scan-list");
    expect(list).toHaveAttribute("data-row-surface-contract", "flat-divider-rail");
    expect(list).toHaveAttribute(
      "data-relation-list-surface-token",
      "--topology-node-popover-relation-list-surface",
    );
    expect(list).toHaveAttribute(
      "data-relation-list-border-token",
      "--topology-node-popover-relation-list-border",
    );
    expect(list).toHaveAttribute(
      "data-relation-row-divider-token",
      "--topology-node-popover-relation-row-divider",
    );
    expect(list).toHaveAttribute(
      "data-relation-row-hover-surface-token",
      "--topology-node-popover-relation-row-hover-surface",
    );
    expect(list.className).toContain(
      "bg-[color:var(--topology-node-popover-relation-list-surface)]",
    );
    expect(list.className).toContain(
      "ring-[color:var(--topology-node-popover-relation-list-border)]",
    );
    expect(list).toHaveAttribute(
      "data-readable-row-contract",
      "at-least-one-full-relation-row",
    );
    expect(list).toHaveAttribute("data-row-min-hit-height", "72");
    expect(relationRow).toHaveAttribute("data-row-density-contract", "agent-handoff-scan-row");
    expect(relationRow).toHaveAttribute("data-row-surface-contract", "flat-divider-row");
    expect(relationRow).toHaveAttribute("data-row-min-hit-height", "72");
    expect(relationRow).toHaveAttribute(
      "data-row-hover-surface-token",
      "--topology-node-popover-relation-row-hover-surface",
    );
    expect(relationRow).toHaveAttribute(
      "data-row-focus-surface-token",
      "--topology-node-popover-relation-row-focus-surface",
    );
    expect(relationRow).toHaveAttribute(
      "data-row-focus-border-token",
      "--topology-node-popover-relation-row-focus-border",
    );
    expect(relationRow).toHaveAttribute(
      "data-row-focus-ring-token",
      "--topology-node-popover-relation-row-focus-ring",
    );
    expect(relationRow).toHaveAttribute(
      "data-expanded-focus-entry",
      "selected-node-first-relation-row",
    );
	    expect(relationRow).toHaveAttribute(
	      "data-row-scan-order",
	      "title>relation>direction>proof>handoff",
	    );
    expect(relationRow?.className).toContain("min-h-[72px]");
    expect(relationRow?.className).toContain("gap-2");
    expect(relationRow?.className).toContain("bg-transparent");
    expect(relationRow?.className).toContain(
      "hover:bg-[color:var(--topology-node-popover-relation-row-hover-surface)]",
    );
    expect(relationRow?.className).toContain(
      "focus-visible:border-[color:var(--topology-node-popover-relation-row-focus-border)]",
    );
    expect(relationRow?.className).toContain(
      "focus-visible:bg-[color:var(--topology-node-popover-relation-row-focus-surface)]",
    );
    expect(relationRow?.className).toContain(
      "focus-visible:ring-[color:var(--topology-node-popover-relation-row-focus-ring)]",
    );
    expect(relationRow?.className).toContain("px-2");
    expect(relationRow?.className).toContain("py-2");
    expect(relationTitle).toHaveAttribute("data-primary-scan-target", "true");
	    expect(relationRow?.querySelector("[data-relation-primary-line]")).toHaveAttribute(
	      "data-visible-contract",
	      "connected-title-plus-relation-pill",
	    );
    expect(relationTitle).toHaveAttribute(
      "data-relation-title-text-token",
      "--topology-node-popover-relation-row-title-text",
    );
    expect(relationTitle?.className).toContain(
      "text-[color:var(--topology-node-popover-relation-row-title-text)]",
    );
    expect(relationTitle?.className).not.toContain("var(--color-text-primary)");
    expect(relationMeta).toHaveAttribute(
      "data-row-meta-text-token",
      "--topology-node-popover-relation-row-meta-text",
    );
    expect(relationMeta).toHaveAttribute(
      "data-visible-contract",
      "relation-facts-secondary-to-connected-title",
    );
    expect(relationMeta).toHaveAttribute(
      "data-readable-summary-contract",
      "plain-language-proof-before-machine-route",
    );
    expect(relationMeta?.className).toContain(
      "text-[color:var(--topology-node-popover-relation-row-meta-text)]",
    );
    expect(relationMeta?.className).toContain("text-[11px]");
	    expect(relationMeta?.className).not.toContain("var(--color-text-quaternary)");
	    expect(relationMeta?.textContent?.replace(/\s+/g, " ").trim()).toBe(
	      "이 노드가 기대는 곳 · 요소 · 근거 1 · 설명",
	    );
    expect(handoffLane).toHaveAttribute("data-handoff-lane", "mcp-cli-next-action");
    expect(handoffLane).toHaveAttribute(
      "data-relation-payload-layout",
      "plain-next-action-line",
    );
    expect(handoffLane).toHaveAttribute(
      "data-route-surface-token",
      "--topology-node-popover-route-surface",
    );
    expect(handoffLane).toHaveAttribute(
      "data-route-border-token",
      "--topology-node-popover-route-border",
    );
    expect(handoffLane).toHaveAttribute(
      "data-route-chip-surface-token",
      "--topology-node-popover-route-chip-surface",
    );
    expect(handoffLane).toHaveAttribute(
      "data-route-chip-border-token",
      "--topology-node-popover-route-chip-border",
    );
    expect(handoffLane).toHaveAttribute(
      "data-route-text-token",
      "--topology-node-popover-route-text",
    );
    expect(handoffLane).toHaveAttribute(
      "data-route-chip-text-token",
      "--topology-node-popover-route-chip-text",
    );
    expect(handoffLane?.className).not.toContain(
      "bg-[color:var(--topology-node-popover-route-surface)]",
    );
    expect(handoffLane?.className).not.toContain(
      "border-[color:var(--topology-node-popover-route-border)]",
    );
    expect(handoffLane?.className).toContain("sr-only");
    expect(
      handoffLane?.querySelector('[data-relation-route-chip="fact"]')?.className,
    ).toContain("sr-only");
    expect(
      handoffLane?.querySelector('[data-relation-route-chip="evidence"]')?.className,
    ).toContain("text-[color:var(--topology-node-popover-route-chip-text)]");
  });

  it("keeps a proof row visible when preview relations are already expanded on the map", () => {
    setup({
      expandedChildIds: new Set(["elements/mcp-sdk", "domains/ai-agent-partner"]),
    });

    const mapNote = screen.getByTestId("topology-map-context-note");
    const list = screen.getByTestId("topology-node-connection-list");
    const rows = document.querySelectorAll("[data-relation-row]");

    expect(mapNote).toHaveAttribute("data-map-context-count", "2");
    expect(list).toHaveAttribute("data-row-render-source", "map-expanded-proof");
    expect(list).toHaveAttribute("data-rendered-connection-count", "2");
    expect(list).toHaveAttribute("data-hidden-connection-count", "0");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-row-render-source", "map-expanded-proof");
	    expect(rows[0]).toHaveAttribute(
	      "data-row-visual-contract",
	      "title-plus-relation-pill-meta-secondary",
	    );
    expect(screen.getByText("MCP SDK")).toBeInTheDocument();
    expect(screen.getByText("AI Agent Partner")).toBeInTheDocument();
  });

  it("hands focus to the first relation row when expanded from the compact inspector", async () => {
    const props = {
      focus: focusModel(),
      labels,
      onSelectConnection: vi.fn(),
      onOpenFullDetail: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(
      <TopologyNodePopover {...props} collapsed onToggleCollapsed={vi.fn()} />,
    );

    expect(screen.getByTestId("topology-node-popover")).toHaveAttribute(
      "data-collapsed",
      "true",
    );

    rerender(<TopologyNodePopover {...props} collapsed={false} onToggleCollapsed={vi.fn()} />);

    const popover = screen.getByTestId("topology-node-popover");
    expect(popover).toHaveAttribute(
      "data-expanded-focus-contract",
      "first-relation-row-on-expand",
    );
    const firstRelationRow = document.querySelector("[data-relation-row]");
    expect(firstRelationRow).toHaveAttribute(
      "data-expanded-focus-entry",
      "selected-node-first-relation-row",
    );
    await waitFor(() => expect(document.activeElement).toBe(firstRelationRow));
  });

  it("keeps the full-detail footer action compact when hidden relations exist", () => {
    setup({
      focus: focusModel({
        hiddenConnectionCount: 77,
      }),
    });

    const footer = screen.getByTestId("topology-node-popover-footer");
    const openFullDetail = screen.getByRole("button", { name: /전체 상세/ });
    expect(footer).toHaveAttribute("data-footer-contract", "fixed-outside-scroll-region");
    expect(footer).toHaveAttribute("data-footer-position-contract", "anchored-bottom-visible");
    expect(footer).toHaveAttribute("data-overflow-contract", "no-horizontal-scroll");
    expect(openFullDetail.className).toContain("min-w-0");
    expect(openFullDetail.className).toContain("overflow-hidden");
    expect(openFullDetail).toHaveAttribute("data-footer-action", "open-full-detail");
    expect(openFullDetail).toHaveAttribute(
      "data-footer-action-border-token",
      "--topology-node-popover-footer-action-border",
    );
    expect(openFullDetail).toHaveAttribute(
      "data-footer-action-hover-border-token",
      "--topology-node-popover-footer-action-hover-border",
    );
    expect(openFullDetail).toHaveAttribute(
      "data-footer-action-text-token",
      "--topology-node-popover-footer-action-text",
    );
    expect(openFullDetail).toHaveAttribute(
      "data-footer-action-hover-text-token",
      "--topology-node-popover-footer-action-hover-text",
    );
    expect(openFullDetail).toHaveAttribute(
      "data-footer-action-min-height-token",
      "--topology-node-popover-footer-secondary-action-min-height",
    );
    expect(openFullDetail.className).toContain(
      "min-h-[var(--topology-node-popover-footer-secondary-action-min-height)]",
    );
    expect(openFullDetail.className).toContain(
      "border-[color:var(--topology-node-popover-footer-action-border)]",
    );
    expect(openFullDetail.className).toContain(
      "text-[color:var(--topology-node-popover-footer-action-text)]",
    );
    expect(openFullDetail).toHaveTextContent("+77 더");
    expect(openFullDetail.querySelector(".truncate")).toHaveTextContent("전체 상세");
    const hiddenCount = openFullDetail.querySelector("[data-footer-hidden-count]");
    expect(hiddenCount).toHaveAttribute(
      "data-footer-count-border-token",
      "--topology-node-popover-footer-count-border",
    );
    expect(hiddenCount).toHaveAttribute(
      "data-footer-count-text-token",
      "--topology-node-popover-footer-count-text",
    );
    expect(hiddenCount).toHaveTextContent("+77 더");
  });

  it("exposes a compact MCP/CLI handoff action rail outside the scrolling region", () => {
    const copyBrief = vi.fn();
    const copyMcp = vi.fn();
    const copyImpact = vi.fn();
    setup({
      actions: [
        {
          kind: "focus-brief",
          label: "선택 브리프 복사",
          ariaLabel: "지형도 선택 개념 검토 브리프 복사",
          onClick: copyBrief,
        },
        {
          kind: "mcp-profile",
          label: "MCP 노드 점검 복사",
          ariaLabel: "지형도 선택 개념 MCP 노드 점검 복사",
          onClick: copyMcp,
        },
        {
          kind: "mcp-impact",
          label: "MCP 영향 점검 복사",
          ariaLabel: "지형도 선택 개념 MCP 영향 점검 복사",
          onClick: copyImpact,
        },
      ],
    });

    const popover = screen.getByTestId("topology-node-popover");
    const rail = screen.getByTestId("topology-node-popover-action-rail");
    const footer = screen.getByTestId("topology-node-popover-footer");
    const briefAction = screen.getByRole("button", {
      name: "지형도 선택 개념 검토 브리프 복사",
    });
    expect(popover).toHaveAttribute(
      "data-compact-handoff-contract",
      "selected-node-actions-visible",
    );
    expect(rail).toHaveAttribute("data-action-rail-contract", "compact-mcp-cli-handoff");
    expect(rail).toHaveAttribute(
      "data-action-rail-title-gap-token",
      "--topology-node-popover-action-rail-title-gap",
    );
    expect(rail).toHaveAttribute(
      "data-action-rail-margin-bottom-token",
      "--topology-node-popover-action-rail-margin-bottom",
    );
    expect(rail).toHaveAttribute(
      "data-action-min-height-token",
      "--topology-node-popover-action-min-height",
    );
    expect(rail).toHaveAttribute("data-action-count", "3");
    expect(rail).toHaveTextContent("에이전트 인계");
    expect(rail).toHaveTextContent("복사");
    const handoffTitleRow = footer.querySelector('[data-agent-handoff-title-row="footer"]');
    expect(handoffTitleRow).toHaveAttribute(
      "data-agent-handoff-title-row-contract",
      "title-plus-copy-hint",
    );
    const handoffTitle = footer.querySelector('[data-agent-handoff-title="footer"]');
    expect(handoffTitle?.className).toContain(
      "text-[color:var(--topology-node-popover-footer-title-text)]",
    );
    const handoffHint = footer.querySelector('[data-agent-handoff-title-hint="copy"]');
    expect(handoffHint).toHaveAttribute(
      "data-agent-handoff-title-hint-token",
      "--topology-node-popover-footer-title-text",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-surface-token",
      "--topology-node-popover-action-surface",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-text-token",
      "--topology-node-popover-action-text",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-hover-text-token",
      "--topology-node-popover-action-hover-text",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-focus-ring-token",
      "--topology-node-popover-action-focus-ring",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-label-contract",
      "compact-visible-full-aria",
    );
    expect(briefAction.className).toContain(
      "min-h-[var(--topology-node-popover-action-min-height)]",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-icon-contract",
      "icon-marks-agent-handoff-kind",
    );
    expect(briefAction).toHaveAttribute("data-popover-action-icon", "brief");
    expect(briefAction).toHaveAttribute(
      "data-popover-action-icon-token",
      "--topology-node-popover-action-text",
    );
    expect(briefAction.querySelector("[data-popover-action-icon-glyph]")).toHaveAttribute(
      "data-popover-action-icon-glyph",
      "brief",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-full-label",
      "선택 브리프 복사",
    );
    expect(briefAction).toHaveAttribute("data-popover-action-compact-label", "브리프");
    expect(briefAction).toHaveAttribute("title", "선택 브리프 복사");
    expect(briefAction).toHaveTextContent("브리프");
    expect(briefAction).not.toHaveTextContent("선택 브리프 복사");
    expect(briefAction.className).toContain(
      "text-[color:var(--topology-node-popover-action-text)]",
    );
    expect(briefAction.className).toContain(
      "hover:text-[color:var(--topology-node-popover-action-hover-text)]",
    );
    expect(footer.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
    expect(rail.closest('[data-testid="topology-connections-section"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "지형도 선택 개념 검토 브리프 복사" }));
    fireEvent.click(screen.getByRole("button", { name: "지형도 선택 개념 MCP 노드 점검 복사" }));
    fireEvent.click(screen.getByRole("button", { name: "지형도 선택 개념 MCP 영향 점검 복사" }));
    expect(copyBrief).toHaveBeenCalledTimes(1);
    expect(copyMcp).toHaveBeenCalledTimes(1);
    expect(copyImpact).toHaveBeenCalledTimes(1);
  });

  it("can collapse into a low map chip without losing the selected node context", () => {
    const onToggleCollapsed = vi.fn();
    setup({ collapsed: true, onToggleCollapsed });

    const popover = screen.getByTestId("topology-node-popover");
    expect(popover).toHaveAttribute("data-surface-role", "active-node-inspector");
    expect(popover).toHaveAttribute("data-attention-role", "supporting-detail");
    expect(popover).toHaveAttribute("data-focus-primary", "linked-focus-cluster");
    expect(popover).toHaveAttribute("data-hierarchy-contract", "click-focus-detail-support");
    expect(popover).toHaveAttribute("data-collapsed", "true");
    expect(popover).toHaveAttribute("data-size-policy", "context-chip");
    expect(popover).toHaveAttribute(
      "data-responsive-width-contract",
      "fluid-chip-to-rail",
    );
    expect(popover).toHaveAttribute(
      "data-width-token",
      "--topology-node-popover-fluid-width",
    );
    expect(popover).toHaveAttribute(
      "data-rail-width-token",
      "--topology-node-popover-rail-width",
    );
    expect(popover).toHaveAttribute(
      "data-compact-gap-token",
      "--topology-node-popover-chip-gap",
    );
    expect(popover).toHaveAttribute(
      "data-compact-action-size-token",
      "--topology-node-popover-compact-action-size",
    );
    expect(popover).toHaveAttribute(
      "data-title-lines-token",
      "--topology-node-popover-title-lines",
    );
    expect(popover).toHaveAttribute(
      "data-popover-surface-token",
      "--topology-node-popover-surface",
    );
    expect(popover).toHaveAttribute(
      "data-popover-border-token",
      "--topology-node-popover-border",
    );
    expect(popover).toHaveAttribute("data-selected-node-id", "capabilities/mcp-server");
    expect(popover).toHaveAttribute(
      "data-selected-node-summary",
      "capability capabilities/mcp-server · MCP Server",
    );
    expect(popover).toHaveAttribute(
      "data-popover-scroll-contract",
      "collapsed-chip-no-scroll",
    );
    expect(popover).toHaveAttribute("data-compact-handoff-contract", "detail-only");
    expect(popover).toHaveAttribute("data-compact-action-contract", "icon-only-under-480");
    expect(popover).toHaveAttribute(
      "data-title-readability-contract",
      "selected-node-title-readable",
    );
    expect(popover).toHaveAttribute(
      "data-compact-facts-layout-contract",
      "facts-before-actions",
    );
    expect(popover).toHaveAttribute(
      "data-phone-layout-contract",
      "title-row-before-actions",
    );
    expect(popover.className).toContain("gap-[var(--topology-node-popover-chip-gap)]");
    expect(popover.className).toContain("flex-wrap");
    expect(popover.className).toContain("lg:w-[var(--topology-node-popover-rail-width)]");
    expect(popover.className).toContain(
      "min-[1400px]:w-[var(--topology-node-popover-wide-rail-width)]",
    );
    expect(popover.className).toContain(
      "min-[1800px]:w-[var(--topology-node-popover-cinema-rail-width)]",
    );
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("이 노드를 쓰는 곳 1 · 이 노드가 기대는 곳 2")).toBeInTheDocument();
    const compactFacts = screen.getByTestId("topology-node-popover-compact-relation-facts");
    expect(compactFacts).toHaveAttribute(
      "data-compact-relation-facts-contract",
      "collapsed-dock-surfaces-typed-facts",
    );
    expect(compactFacts).toHaveAttribute("data-relation-fact-count", "3");
    expect(compactFacts).toHaveAttribute("data-relation-type-count", "2");
    expect(compactFacts).toHaveAttribute("data-relation-fact-label", "직접 의미 관계 3개");
    expect(compactFacts).toHaveAttribute("data-relation-type-label", "관계 유형 2종");
    expect(compactFacts).toHaveAttribute("data-compact-relation-fact-label", "관계");
    expect(compactFacts).toHaveAttribute("data-compact-relation-type-label", "유형");
    expect(compactFacts).toHaveAccessibleName("직접 의미 관계 3개 · 관계 유형 2종");
    expect(compactFacts).toHaveAttribute(
      "data-compact-relation-facts-surface-token",
      "--topology-node-popover-context-surface",
    );
    expect(compactFacts).toHaveAttribute(
      "data-compact-relation-facts-border-token",
      "--topology-node-popover-context-border",
    );
    expect(compactFacts).toHaveAttribute(
      "data-compact-relation-facts-text-token",
      "--topology-node-popover-context-text",
    );
    expect(compactFacts).toHaveTextContent("관계");
    expect(compactFacts).toHaveTextContent("3");
    expect(compactFacts).toHaveTextContent("유형");
    expect(compactFacts).toHaveTextContent("2");
    expect(compactFacts).not.toHaveTextContent("직접 의미 관계 3개");
    expect(compactFacts).not.toHaveTextContent("관계 유형 2종");
    const factPriority = document.querySelector(
      "[data-node-popover-compact-fact-priority]",
    );
    expect(factPriority).toHaveAttribute(
      "data-node-popover-compact-fact-priority",
      "selected-node-facts-before-actions",
    );
    expect(factPriority).toHaveAttribute(
      "data-phone-layout-contract",
      "title-keeps-full-width-before-actions",
    );
    expect(factPriority?.className).toContain("basis-full");
    const actions = screen.getByTestId("topology-node-popover-compact-actions");
    expect(actions).toHaveAttribute(
      "data-compact-actions-layout-contract",
      "actions-after-facts",
    );
    expect(actions).toHaveAttribute(
      "data-phone-layout-contract",
      "actions-wrap-below-title",
    );
    expect(actions.className).toContain("w-full");
    expect(actions.className).toContain("justify-end");
    const kindLabel = document.querySelector("[data-selected-node-kind-label]");
    expect(kindLabel).toHaveAttribute(
      "data-kind-text-token",
      "--topology-node-popover-kind-text",
    );
    expect(kindLabel?.className).toContain(
      "text-[color:var(--topology-node-popover-kind-text)]",
    );
    expect(kindLabel?.className).not.toContain("var(--color-text-quaternary)");
    const title = screen.getByTestId("topology-node-popover-title");
    expect(title).toHaveAttribute(
      "data-title-readability-contract",
      "selected-node-title-readable",
    );
    expect(title).toHaveAttribute(
      "data-title-lines-token",
      "--topology-node-popover-title-lines",
    );
    expect(title).toHaveAttribute(
      "data-title-text-token",
      "--topology-node-popover-title-text",
    );
    expect(title.className).toContain("line-clamp-[var(--topology-node-popover-title-lines)]");
    expect(title.className).toContain(
      "text-[color:var(--topology-node-popover-title-text)]",
    );
    expect(title.className).not.toContain("truncate");
    expect(title.className).not.toContain("var(--color-text-primary)");

    const close = screen.getByRole("button", { name: "닫기" });
    expect(close).toHaveAttribute("data-node-popover-close", "true");
    expect(close).toHaveAttribute(
      "data-chrome-action-text-token",
      "--topology-node-popover-chrome-action-text",
    );
    expect(close).toHaveAttribute(
      "data-chrome-action-hover-text-token",
      "--topology-node-popover-chrome-action-hover-text",
    );
    expect(close.className).toContain(
      "text-[color:var(--topology-node-popover-chrome-action-text)]",
    );

    const expand = screen.getByRole("button", { name: "상세 보기" });
    expect(expand).toHaveAttribute("data-node-popover-toggle", "expand");
    expect(expand).toHaveAttribute("data-compact-action-contract", "icon-only-under-480");
    expect(expand).toHaveAttribute(
      "data-chrome-action-border-token",
      "--topology-node-popover-chrome-action-border",
    );
    expect(expand).toHaveAttribute(
      "data-chrome-action-hover-border-token",
      "--topology-node-popover-chrome-action-hover-border",
    );
    expect(expand).toHaveAttribute(
      "data-chrome-action-text-token",
      "--topology-node-popover-chrome-action-text",
    );
    expect(expand).toHaveAttribute(
      "data-chrome-action-hover-text-token",
      "--topology-node-popover-chrome-action-hover-text",
    );
    expect(expand.className).toContain("h-[var(--topology-node-popover-compact-action-size)]");
    expect(expand.className).toContain(
      "border-[color:var(--topology-node-popover-chrome-action-border)]",
    );
    expect(expand.className).toContain(
      "text-[color:var(--topology-node-popover-chrome-action-text)]",
    );
    expect(expand.className).toContain("max-[480px]:w-[var(--topology-node-popover-compact-action-size)]");
    expect(expand.querySelector("span")?.className).toContain("max-[480px]:sr-only");
    fireEvent.click(expand);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("keeps the primary agent handoff label visible in the collapsed mobile inspector", () => {
    const copyBrief = vi.fn();
    setup({
      collapsed: true,
      onToggleCollapsed: vi.fn(),
      actions: [
        {
          kind: "focus-brief",
          label: "선택 브리프 복사",
          ariaLabel: "지형도 선택 개념 검토 브리프 복사",
          onClick: copyBrief,
        },
      ],
    });

    const popover = screen.getByTestId("topology-node-popover");
    const briefAction = screen.getByRole("button", {
      name: "지형도 선택 개념 검토 브리프 복사",
    });
    expect(popover).toHaveAttribute(
      "data-compact-handoff-contract",
      "selected-node-actions-visible",
    );
    expect(popover).toHaveAttribute(
      "data-compact-action-contract",
      "label-visible-above-480",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-label-contract",
      "icon-only-full-aria-title",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-full-label",
      "선택 브리프 복사",
    );
    expect(briefAction).toHaveAttribute("data-popover-action-compact-label", "브리프");
    expect(briefAction).toHaveAttribute(
      "data-popover-action-surface-token",
      "--topology-node-popover-action-icon-surface",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-border-token",
      "--topology-node-popover-action-icon-border",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-text-token",
      "--topology-node-popover-action-text",
    );
    expect(briefAction).toHaveAttribute(
      "data-popover-action-size-token",
      "--topology-node-popover-compact-action-size",
    );
    expect(briefAction.className).toContain(
      "h-[var(--topology-node-popover-compact-action-size)]",
    );
    expect(briefAction.className).toContain(
      "w-[var(--topology-node-popover-compact-action-size)]",
    );
    expect(briefAction.className).toContain("overflow-hidden");
    expect(briefAction.className).toContain(
      "text-[color:var(--topology-node-popover-action-text)]",
    );
    expect(briefAction).toHaveTextContent("브리프");
    expect(briefAction).not.toHaveTextContent("선택 브리프 복사");

    fireEvent.click(briefAction);
    expect(copyBrief).toHaveBeenCalledTimes(1);
  });

  it("shows a readable compact map return control when expanded", () => {
    const onToggleCollapsed = vi.fn();
    setup({ onToggleCollapsed });

    const collapse = screen.getByRole("button", { name: "지도 보기" });
    expect(collapse).toHaveAttribute("data-node-popover-toggle", "collapse");
    expect(collapse).toHaveAttribute(
      "data-footer-action-border-token",
      "--topology-node-popover-footer-action-border",
    );
    expect(collapse).toHaveAttribute(
      "data-footer-action-text-token",
      "--topology-node-popover-footer-action-text",
    );
    expect(collapse.className).toContain(
      "border-[color:var(--topology-node-popover-footer-action-border)]",
    );
    expect(collapse.className).toContain(
      "text-[color:var(--topology-node-popover-footer-action-text)]",
    );
    expect(collapse).toHaveTextContent("지도 보기");

    fireEvent.click(collapse);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("지도에 펼쳐진 자식은 리스트에서 제외하고 안내 한 줄로 축약한다", () => {
    setup({ expandedChildIds: new Set(["elements/mcp-sdk"]) });
    // 펼쳐진 자식은 중복 나열 안 함 (Toss '한 화면에 한 가지').
    expect(screen.queryByText("MCP SDK")).not.toBeInTheDocument();
    const note = screen.getByTestId("topology-map-context-note");
    expect(note).toHaveAttribute("data-map-context-count", "1");
    expect(note).toHaveAttribute("data-map-context-contract", "expanded-relations-stay-on-map");
    expect(note).toHaveAttribute(
      "data-map-context-handoff-contract",
      "map-visible-relations-summarized",
    );
    expect(note).toHaveAttribute("data-map-context-relation-type-count", "1");
    expect(note).toHaveAttribute(
      "data-map-context-quality-summary",
      "강한 구조 1 · 근거 있는 관계 0 · 약한 관련 0 · 검토 0",
    );
    expect(note).toHaveAttribute(
      "data-map-context-agent-readiness-summary",
      "전달 가능 1 · 사전 점검 0 · 검토 0",
    );
    expect(note).toHaveTextContent(
      "1개 직접 연결은 지도에 펼쳐져 있어요. 지도 보기를 누르면 겹침 없이 확인할 수 있어요.",
    );
    expect(note).toHaveAttribute(
      "data-map-context-surface-token",
      "--topology-node-popover-context-surface",
    );
    expect(note).toHaveAttribute(
      "data-map-context-border-token",
      "--topology-node-popover-context-border",
    );
    expect(note).toHaveAttribute(
      "data-map-context-text-token",
      "--topology-node-popover-context-text",
    );
    expect(note.className).toContain(
      "border-[color:var(--topology-node-popover-context-border)]",
    );
    expect(note.className).toContain(
      "text-[color:var(--topology-node-popover-context-text)]",
    );
    expect(note.className).not.toContain("var(--color-text-tertiary)");
    // 펼쳐지지 않은 관계는 그대로.
    expect(screen.getByText("AI Agent Partner")).toBeInTheDocument();
  });

  it("연결이 전부 펼쳐졌으면 빈 상태 문구 대신 안내만 보여준다", () => {
    setup({
      expandedChildIds: new Set(["elements/mcp-sdk", "domains/ai-agent-partner"]),
    });
    expect(screen.getByTestId("topology-map-context-note")).toHaveTextContent(
      "2개 직접 연결은 지도에 펼쳐져 있어요. 지도 보기를 누르면 겹침 없이 확인할 수 있어요.",
    );
    expect(screen.getByTestId("topology-map-context-note")).toHaveAttribute(
      "data-map-context-agent-readiness-summary",
      "전달 가능 2 · 사전 점검 0 · 검토 0",
    );
    expect(screen.queryByText("직접 연결 없음")).not.toBeInTheDocument();
  });

  it("renders the node title, kind, summary, and its direct connections", () => {
    setup();
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("역량")).toBeInTheDocument();
    expect(screen.getByText("AI agent surface.")).toBeInTheDocument();
    // each direct connection is a row the user can click into
    expect(screen.getByText("MCP SDK")).toBeInTheDocument();
    expect(screen.getByText("AI Agent Partner")).toBeInTheDocument();
  });

  it("shows plain-language counts instead of graph jargon", () => {
    setup();
    expect(screen.getAllByText("이 노드를 쓰는 곳").length).toBeGreaterThan(0);
    expect(screen.getAllByText("이 노드가 기대는 곳").length).toBeGreaterThan(0);
    // no '영향받음' / '의존 N' raw jargon
    expect(screen.queryByText(/영향받음/)).not.toBeInTheDocument();
  });

  it("labels each connection row with its plain-language direction", () => {
    setup();
    expect(
      screen.getByRole("button", {
        name: /사용.*MCP SDK.*이 노드가 기대는 곳/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /포함.*AI Agent Partner.*이 노드를 쓰는 곳/,
      }),
    ).toBeInTheDocument();
  });

  it("shows the connected node kind in each connection row", () => {
    setup();
    expect(
      screen.getByRole("button", {
        name: /사용.*MCP SDK.*이 노드가 기대는 곳.*요소/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /포함.*AI Agent Partner.*이 노드를 쓰는 곳.*도메인/,
      }),
    ).toBeInTheDocument();
  });

  it("surfaces the connected title before relation metadata in each connection row", () => {
    setup();
    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows).toHaveLength(2);
    expect(relationRows[0]).toHaveAttribute("data-relation-direction", "outgoing");
    expect(relationRows[0]).toHaveAttribute("data-relation-type", "uses");
    expect(relationRows[0]).toHaveAttribute("data-relation-quality", "strong");
    expect(relationRows[0]).toHaveAttribute("data-relation-evidence-state", "source-backed");
    expect(relationRows[0]).toHaveAttribute("data-relation-evidence-count", "1");
    expect(relationRows[0]).toHaveAttribute("data-agent-gate-kind", "handoff-ready");
    expect(relationRows[0]).toHaveAttribute("data-primary-copy-action", "explain_relation");
	    expect(relationRows[0]).toHaveAttribute(
	      "data-row-visual-contract",
	      "title-plus-relation-pill-meta-secondary",
	    );
    expect(
      relationRows[0].querySelector("[data-relation-title]")?.compareDocumentPosition(
        relationRows[0].querySelector("[data-relation-type-label]") as Node,
      ) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      relationRows[0].querySelector("[data-relation-direction-marker]"),
    ).toHaveAttribute("data-relation-direction-marker", "outgoing");
    expect(
      relationRows[0].querySelector("[data-relation-direction-marker]"),
    ).toHaveAttribute(
      "data-direction-surface-token",
      "--topology-node-popover-direction-surface",
    );
    expect(
      relationRows[0].querySelector("[data-relation-direction-marker]"),
    ).toHaveAttribute(
      "data-direction-hover-text-token",
      "--topology-node-popover-direction-hover-text",
    );
    expect(
      relationRows[0].querySelector("[data-relation-direction-marker]"),
    ).toHaveAttribute(
      "data-direction-shadow-token",
      "--topology-node-popover-direction-shadow",
    );
    expect(
      relationRows[0].querySelector("[data-relation-direction-marker]"),
    ).toHaveAttribute(
      "data-direction-marker-contract",
      "primary-row-scan-anchor",
    );
    expect(
      relationRows[0].querySelector("[data-relation-direction-marker]")?.className,
    ).toContain("h-6");
    expect(
      relationRows[0].querySelector("[data-relation-direction-marker]")?.className,
    ).toContain("shadow-[var(--topology-node-popover-direction-shadow)]");
    expect(
      relationRows[0].querySelector("[data-relation-quality-dot]"),
    ).toHaveAttribute("data-dot-token", "--topology-relation-quality-strong-dot");
    expect(
      relationRows[0].querySelector("[data-relation-quality-dot]"),
    ).toHaveAttribute("data-glow-token", "--topology-relation-quality-strong-glow");
    expect(
      relationRows[0].querySelector("[data-relation-type-label]"),
    ).toHaveTextContent("사용");
    expect(
      relationRows[0].querySelector("[data-relation-type-label]"),
    ).toHaveAttribute(
      "data-fact-type-surface-token",
      "--topology-node-popover-fact-type-surface",
    );
    expect(
      relationRows[0].querySelector("[data-relation-type-label]"),
    ).toHaveAttribute(
      "data-fact-type-border-token",
      "--topology-node-popover-fact-type-border",
    );
	    expect(
	      relationRows[0].querySelector("[data-relation-type-label]"),
	    ).toHaveAttribute(
	      "data-fact-type-text-token",
	      "--topology-node-popover-fact-type-text",
	    );
	    expect(
	      relationRows[0].querySelector("[data-relation-type-label]"),
	    ).toHaveAttribute("data-relation-pill-contract", "primary-line-typed-fact");
	    expect(
	      relationRows[0].querySelector("[data-relation-type-label]")?.className,
	    ).toContain("rounded-full");
	    expect(
	      relationRows[0].querySelector("[data-relation-type-label]")?.className,
	    ).toContain("bg-[color:var(--topology-node-popover-fact-type-surface)]");
	    expect(
	      relationRows[0].querySelector("[data-relation-type-label]")?.className,
	    ).toContain("border-[color:var(--topology-node-popover-fact-type-border)]");
    expect(
      relationRows[0].querySelector("[data-relation-evidence-glyph]"),
    ).toHaveTextContent("1");
    expect(
      relationRows[0].querySelector("[data-relation-evidence-glyph]"),
    ).toHaveAttribute(
      "data-evidence-surface-token",
      "--topology-node-popover-evidence-source-surface",
    );
    expect(
      relationRows[0].querySelector("[data-relation-evidence-glyph]"),
    ).toHaveAttribute(
      "data-evidence-text-token",
      "--topology-node-popover-evidence-source-text",
    );
    expect(
      relationRows[0].querySelector("[data-relation-row-agent-gate]"),
    ).toHaveTextContent("설명");
    expect(
      relationRows[0].querySelector("[data-relation-row-agent-gate]"),
    ).toHaveAttribute("data-relation-row-action-chip", "explain_relation");
    expect(
      relationRows[0].querySelector("[data-relation-row-agent-gate]"),
    ).toHaveAttribute("data-route-chip-text", "설명");
    expect(
      relationRows[0].querySelector("[data-relation-row-agent-gate]"),
    ).toHaveAttribute(
      "data-agent-gate-surface-token",
      "--topology-node-popover-gate-handoff-surface",
    );
    expect(
      relationRows[0].querySelector("[data-relation-row-agent-gate]"),
    ).toHaveAttribute(
      "data-agent-gate-text-token",
      "--topology-node-popover-gate-handoff-text",
    );
    expect(relationRows[1]).toHaveAttribute("data-relation-direction", "incoming");
    expect(
      relationRows[1].querySelector("[data-relation-direction-marker]"),
    ).toHaveAttribute("data-relation-direction-marker", "incoming");
    expect(relationRows[1]).toHaveAttribute("data-relation-type", "contains");
    expect(relationRows[1]).toHaveAttribute("data-relation-quality", "supported");
    expect(relationRows[1]).toHaveAttribute("data-relation-evidence-state", "authored");
    expect(
      relationRows[1].querySelector("[data-relation-evidence-glyph]"),
    ).toHaveAttribute(
      "data-evidence-border-token",
      "--topology-node-popover-evidence-authored-border",
    );
    expect(relationRows[1]).toHaveAttribute("data-agent-gate-kind", "handoff-ready");
    expect(
      relationRows[1].querySelector("[data-relation-type-label]"),
    ).toHaveTextContent("포함");
  });

  it("exposes each connection row as a fact to evidence to gate to action handoff route", () => {
    setup();

    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-fact-route",
      "fact>evidence>gate>action",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-handoff-grammar-contract",
      "fact-evidence-gate-action-payload",
    );
    expect(relationRows[0]).toHaveAttribute("data-relation-fact-route-quality", "strong");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-fact-route-evidence",
      "source-backed",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-fact-route-gate",
      "handoff-ready",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-fact-route-action",
      "explain_relation",
    );
    expect(
      Array.from(relationRows[0].querySelectorAll("[data-relation-route-chip]"))
        .map((chip) => chip.getAttribute("data-relation-route-chip"))
        .join(">"),
    ).toBe("fact>evidence>gate>action>payload");
    expect(relationRows[0].querySelector("[data-relation-route]")).toHaveAttribute(
      "data-handoff-grammar-contract",
      "fact-evidence-gate-action-payload",
    );
    expect(relationRows[0].querySelector("[data-relation-route]")).toHaveAttribute(
      "data-relation-route-state",
      "compact-json-ready",
    );
    expect(relationRows[0].querySelector("[data-relation-route]")).toHaveAttribute(
      "data-relation-payload-layout",
      "plain-next-action-line",
    );
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="fact"]'),
    ).toHaveTextContent("사용");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="evidence"]'),
    ).toHaveTextContent("근거 1");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="gate"]'),
    ).toHaveTextContent("전달");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="gate"]'),
    ).toHaveClass("sr-only");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="action"]'),
    ).toHaveTextContent("설명");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="action"]'),
    ).toHaveAttribute("title", "explain_relation");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="payload"]'),
    ).toHaveTextContent("복사");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="payload"]'),
    ).toHaveClass("sr-only");
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="payload"]'),
    ).toHaveAttribute(
      "data-visible-contract",
      "machine-payload-hidden-from-default-row",
    );
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="payload"]'),
    ).toHaveAttribute(
      "title",
      "query_ontology · explain_relation · capabilities/mcp-server -> elements/mcp-sdk · uses",
    );
    expect(
      relationRows[0].querySelector('[data-relation-route-chip="payload"]'),
    ).toHaveAttribute(
      "data-relation-payload-summary",
      "query_ontology · explain_relation · capabilities/mcp-server -> elements/mcp-sdk · uses",
    );
  });

  it("exposes source to target endpoint context for outgoing and incoming rows", () => {
    setup();

    const relationRows = document.querySelectorAll("[data-relation-row]");
    const outgoingEndpointRoute = relationRows[0].querySelector(
      "[data-relation-endpoint-route-label]",
    );
    const outgoingSourceChip = relationRows[0].querySelector(
      '[data-relation-endpoint-chip="source"]',
    );
    const outgoingTargetChip = relationRows[0].querySelector(
      '[data-relation-endpoint-chip="target"]',
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-endpoint-route",
      "capabilities/mcp-server>elements/mcp-sdk",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-source-id",
      "capabilities/mcp-server",
    );
    expect(relationRows[0]).toHaveAttribute("data-relation-target-id", "elements/mcp-sdk");
    expect(outgoingEndpointRoute).toHaveAttribute(
      "data-endpoint-route-text-token",
      "--topology-node-popover-endpoint-text",
    );
    expect(outgoingEndpointRoute).toHaveAttribute(
      "data-endpoint-chip-text-token",
      "--topology-node-popover-endpoint-chip-text",
    );
    expect(outgoingEndpointRoute).toHaveAttribute(
      "data-endpoint-separator-token",
      "--topology-node-popover-endpoint-separator",
    );
    expect(outgoingEndpointRoute).toHaveAttribute(
      "data-visible-contract",
      "machine-route-hidden-from-default-row",
    );
    expect(outgoingEndpointRoute).toHaveClass("sr-only");
    expect(outgoingSourceChip).toHaveTextContent("capabilities/mcp-server");
    expect(outgoingTargetChip).toHaveTextContent("elements/mcp-sdk");

    expect(relationRows[1]).toHaveAttribute(
      "data-relation-endpoint-route",
      "domains/ai-agent-partner>capabilities/mcp-server",
    );
    expect(relationRows[1]).toHaveAttribute(
      "data-relation-source-id",
      "domains/ai-agent-partner",
    );
    expect(relationRows[1]).toHaveAttribute(
      "data-relation-target-id",
      "capabilities/mcp-server",
    );
    expect(
      relationRows[1].querySelector('[data-relation-endpoint-chip="source"]'),
    ).toHaveTextContent("domains/ai-agent-partner");
    expect(
      relationRows[1].querySelector('[data-relation-endpoint-chip="target"]'),
    ).toHaveTextContent("capabilities/mcp-server");
  });

  it("summarizes each relation row as an accessible agent handoff fact", () => {
    setup();

    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-handoff-summary",
      "capabilities/mcp-server > elements/mcp-sdk · 사용 · source-backed · handoff-ready · explain_relation",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-readable-summary",
      "이 노드가 기대는 곳 · 요소 · 사용 · 근거 1 · 설명",
    );
    expect(relationRows[0]).toHaveAttribute(
      "aria-label",
      "사용 · MCP SDK · 이 노드가 기대는 곳 · 요소 · 사용 · 1 · 설명",
    );
    expect(relationRows[1]).toHaveAttribute(
      "data-relation-handoff-summary",
      "domains/ai-agent-partner > capabilities/mcp-server · 포함 · authored · handoff-ready · explain_relation",
    );
  });

  it("exposes a machine-readable MCP handoff payload for each relation row", () => {
    setup();

    const relationRows = document.querySelectorAll("[data-relation-row]");
    expect(relationRows[0]).toHaveAttribute("data-relation-handoff-tool", "query_ontology");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-handoff-operation",
      "explain_relation",
    );
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-handoff-from",
      "capabilities/mcp-server",
    );
    expect(relationRows[0]).toHaveAttribute("data-relation-handoff-to", "elements/mcp-sdk");
    expect(relationRows[0]).toHaveAttribute("data-relation-handoff-type", "uses");
    expect(relationRows[0]).toHaveAttribute(
      "data-relation-handoff-payload-summary",
      "query_ontology · explain_relation · capabilities/mcp-server -> elements/mcp-sdk · uses",
    );
    expect(
      JSON.parse(relationRows[0].getAttribute("data-relation-handoff-payload-json") || "{}"),
    ).toEqual({
      tool: "query_ontology",
      operation: "explain_relation",
      from: "capabilities/mcp-server",
      to: "elements/mcp-sdk",
      type: "uses",
    });
  });

  it("routes weak connection rows to relation_check before agent handoff", () => {
    setup({
      focus: focusModel({
        connections: [
          {
            id: "elements/mcp-sdk",
            title: "MCP SDK",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "weak",
            evidenceCount: 0,
            authored: false,
          },
        ],
      }),
    });

    const relationRow = document.querySelector("[data-relation-row]");
    expect(relationRow).toHaveAttribute("data-relation-evidence-state", "needs-review");
    expect(relationRow).toHaveAttribute("data-agent-gate-kind", "preflight-first");
    expect(relationRow).toHaveAttribute("data-primary-copy-action", "relation_check");
    expect(relationRow).toHaveAttribute(
      "data-row-quality-accent-token",
      "--topology-overview-quality-weak-meter",
    );
    expect(relationRow?.querySelector("[data-relation-quality-accent]")).toHaveAttribute(
      "data-quality-accent-contract",
      "row-scan-rail-maps-relation-quality",
    );
    expect(relationRow?.querySelector("[data-relation-quality-accent]")).toHaveAttribute(
      "data-quality-accent-token",
      "--topology-overview-quality-weak-meter",
    );
    expect(relationRow?.querySelector("[data-relation-evidence-glyph]")).toHaveTextContent("!");
    expect(relationRow?.querySelector("[data-relation-evidence-glyph]")).toHaveAttribute(
      "data-evidence-surface-token",
      "--topology-node-popover-evidence-review-surface",
    );
    expect(relationRow?.querySelector("[data-relation-evidence-glyph]")).toHaveAttribute(
      "data-evidence-text-token",
      "--topology-node-popover-evidence-review-text",
    );
    expect(relationRow?.querySelector("[data-relation-row-agent-gate]")).toHaveTextContent(
      "점검",
    );
  });

  it("summarizes direct typed relations inside the connections section without a tall card", () => {
    setup();

    const section = screen.getByTestId("topology-connections-section");
    const lens = screen.getByTestId("topology-relation-lens");
    expect(section).toContainElement(lens);
    expect(lens).toHaveAttribute(
      "data-relation-lens-density-contract",
      "split-metric-proof-strip",
    );
    expect(lens).toHaveAttribute("data-relation-lens-layout", "label-value-metrics");
    expect(lens).toHaveAttribute("data-relation-fact-label", "직접 의미 관계 3개");
    expect(lens).toHaveAttribute("data-relation-type-label", "관계 유형 2종");
    expect(lens).toHaveAccessibleName(
      "관계 렌즈: 직접 의미 관계 3개 · 관계 유형 2종 · 추론된 유사도 점수가 아니라 타입이 있는 온톨로지 사실입니다.",
    );
    expect(lens).toHaveTextContent("관계 렌즈");
    expect(lens.querySelector('[data-relation-lens-metric="facts"]')).toHaveTextContent(
      "관계3",
    );
    expect(lens.querySelector('[data-relation-lens-metric="facts"]')?.className).toContain(
      "min-w-[var(--topology-node-popover-relation-lens-metric-min-width)]",
    );
    expect(lens.querySelector('[data-relation-lens-metric="types"]')).toHaveTextContent(
      "유형2",
    );
    expect(lens.querySelector('[data-relation-lens-metric="types"]')?.className).toContain(
      "gap-[var(--topology-node-popover-relation-lens-metric-gap)]",
    );
    expect(lens).not.toHaveTextContent("직접 의미 관계 3개");
    expect(lens).not.toHaveTextContent("관계 유형 2종");
    expect(lens).toHaveAttribute(
      "title",
      "관계 렌즈: 직접 의미 관계 3개 · 관계 유형 2종 · 추론된 유사도 점수가 아니라 타입이 있는 온톨로지 사실입니다.",
    );
  });

  it("surfaces relation quality as a compact handoff lens", () => {
    setup();

    const lens = screen.getByTestId("topology-relation-quality-lens");
    expect(lens).toHaveAccessibleName(
      "관계 품질: 강한 구조 1 · 근거 있는 관계 1 · 약한 관련 0 · 검토 0",
    );
    expect(lens).toHaveAttribute(
      "data-relation-quality-summary",
      "강한 구조 1 · 근거 있는 관계 1 · 약한 관련 0 · 검토 0",
    );
    expect(lens).toHaveAttribute("data-relation-quality-meter-total", "2");
    expect(lens).toHaveAttribute("data-relation-quality-layout", "meter-only-summary");
    const meter = screen.getByTestId("topology-node-relation-quality-meter");
    expect(meter).toHaveAttribute(
      "data-quality-meter-contract",
      "distribution-bar-maps-relation-quality",
    );
    expect(meter).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-quality-meter-surface",
    );
    expect(meter).toHaveAttribute(
      "data-border-token",
      "--topology-overview-quality-meter-border",
    );
    expect(meter.className).toContain(
      "bg-[color:var(--topology-overview-quality-meter-surface)]",
    );
    expect(
      meter.querySelector('[data-relation-quality-meter-segment="strong"]'),
    ).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-quality-strong-meter",
    );
    expect(
      meter.querySelector('[data-relation-quality-meter-segment="strong"]'),
    ).toHaveAttribute("data-count", "1");
    expect(
      meter.querySelector('[data-relation-quality-meter-segment="supported"]'),
    ).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-quality-supported-meter",
    );
    expect(
      meter.querySelector('[data-relation-quality-meter-segment="supported"]'),
    ).toHaveAttribute("data-count", "1");
    expect(
      meter.querySelector('[data-relation-quality-meter-segment="weak"]'),
    ).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-quality-weak-meter",
    );
    expect(
      meter.querySelector('[data-relation-quality-meter-segment="weak"]'),
    ).toHaveAttribute("data-count", "0");
    expect(
      meter.querySelector('[data-relation-quality-meter-segment="review"]'),
    ).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-quality-review-meter",
    );
    expect(
      meter.querySelector('[data-relation-quality-meter-segment="review"]'),
    ).toHaveAttribute("data-count", "0");
    expect(lens.querySelector("[data-relation-quality-summary-line]")?.className).toContain(
      "sr-only",
    );
    expect(lens).toHaveAttribute(
      "data-visible-density-contract",
      "meter-only-preserve-summary-for-agents",
    );
    expect(lens.querySelector('[data-relation-quality-chip="strong"]')).toHaveAttribute(
      "data-relation-quality-surface-token",
      "--topology-selected-relation-quality-strong-surface",
    );
    expect(
      lens.querySelector('[data-relation-quality-chip="supported"]'),
    ).toHaveAttribute(
      "data-relation-quality-border-token",
      "--topology-selected-relation-quality-supported-border",
    );
    expect(lens.querySelector('[data-relation-quality-chip="review"]')).toHaveAttribute(
      "data-relation-quality-text-token",
      "--topology-selected-relation-quality-review-text",
    );
  });

  it("summarizes relation rows by agent readiness before the list", () => {
    setup({
      focus: focusModel({
        connections: [
          {
            id: "elements/mcp-sdk",
            title: "MCP SDK",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "strong",
            evidenceCount: 1,
            authored: true,
          },
          {
            id: "elements/mcp-config",
            title: "MCP Config",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "weak",
            evidenceCount: 0,
            authored: false,
          },
          {
            id: "elements/mcp-unknown",
            title: "MCP Unknown",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "review",
            evidenceCount: 0,
            authored: false,
          },
        ],
      }),
    });

    const lens = screen.getByTestId("topology-node-agent-readiness-lens");
    expect(lens).toHaveAccessibleName(
      "에이전트 준비도: 전달 가능 1 · 사전 점검 1 · 검토 1",
    );
    expect(lens).toHaveAttribute(
      "data-agent-readiness-layout",
      "meter-only-summary",
    );
    expect(lens).toHaveAttribute(
      "data-agent-readiness-strip-surface-token",
      "--topology-node-popover-context-surface",
    );
    expect(lens).toHaveAttribute(
      "data-agent-readiness-strip-border-token",
      "--topology-node-popover-context-border",
    );
    expect(lens).toHaveAttribute(
      "data-agent-readiness-strip-title-text-token",
      "--topology-node-popover-relation-section-title-text",
    );
    expect(lens).toHaveAttribute(
      "data-agent-readiness-summary",
      "전달 가능 1 · 사전 점검 1 · 검토 1",
    );
    expect(lens.className).not.toContain(
      "bg-[color:var(--topology-node-popover-context-surface)]",
    );
    expect(lens.className).not.toContain(
      "border-[color:var(--topology-node-popover-context-border)]",
    );
    expect(lens.querySelector("[data-agent-readiness-title]")).toHaveTextContent(
      "에이전트 준비도",
    );
    expect(
      lens.querySelector("[data-agent-readiness-summary-line]")?.className,
    ).toContain(
      "sr-only",
    );
    expect(lens).toHaveAttribute(
      "data-visible-density-contract",
      "meter-only-preserve-summary-for-agents",
    );
    const meter = screen.getByTestId("topology-node-agent-readiness-meter");
    expect(meter).toHaveAttribute(
      "data-agent-readiness-meter-contract",
      "distribution-bar-maps-agent-readiness",
    );
    expect(meter).toHaveAttribute("data-agent-readiness-meter-total", "3");
    expect(meter).toHaveAttribute(
      "data-surface-token",
      "--topology-overview-readiness-meter-surface",
    );
    expect(meter).toHaveAttribute(
      "data-border-token",
      "--topology-overview-readiness-meter-border",
    );
    expect(meter.className).toContain(
      "bg-[color:var(--topology-overview-readiness-meter-surface)]",
    );
    expect(
      meter.querySelector('[data-agent-readiness-meter-segment="ready"]'),
    ).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-readiness-ready-meter",
    );
    expect(
      meter.querySelector('[data-agent-readiness-meter-segment="ready"]'),
    ).toHaveAttribute("data-count", "1");
    expect(
      meter.querySelector('[data-agent-readiness-meter-segment="preflight"]'),
    ).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-readiness-preflight-meter",
    );
    expect(
      meter.querySelector('[data-agent-readiness-meter-segment="preflight"]'),
    ).toHaveAttribute("data-count", "1");
    expect(
      meter.querySelector('[data-agent-readiness-meter-segment="review"]'),
    ).toHaveAttribute(
      "data-meter-token",
      "--topology-overview-readiness-review-meter",
    );
    expect(
      meter.querySelector('[data-agent-readiness-meter-segment="review"]'),
    ).toHaveAttribute("data-count", "1");
    expect(lens.querySelector('[data-agent-readiness-chip="ready"]')).toHaveTextContent(
      "전달 가능1",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="ready"]')).toHaveAttribute(
      "data-agent-readiness-label-contract",
      "compact-visible-full-aria",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="ready"]')).toHaveAttribute(
      "data-agent-readiness-full-label",
      "전달 가능",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="ready"]')).toHaveAttribute(
      "data-agent-readiness-compact-label",
      "전달 가능",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="ready"]')).toHaveAttribute(
      "data-agent-readiness-surface-token",
      "--topology-node-popover-agent-ready-surface",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="preflight"]')).toHaveTextContent(
      "사전 점검1",
    );
    expect(
      lens.querySelector('[data-agent-readiness-chip="preflight"]'),
    ).toHaveAttribute(
      "data-agent-readiness-border-token",
      "--topology-node-popover-agent-preflight-border",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="review"]')).toHaveTextContent(
      "검토1",
    );
    expect(lens.querySelector('[data-agent-readiness-chip="review"]')).toHaveAttribute(
      "data-agent-readiness-text-token",
      "--topology-node-popover-agent-review-text",
    );
  });

  it("keeps English readiness labels compact while preserving the full handoff state", () => {
    setup({
      labels: {
        ...labels,
        agentReadinessTitle: "Agent readiness",
        agentReadinessLabels: {
          ready: "handoff-ready",
          preflight: "preflight",
          review: "review",
        },
      },
      focus: focusModel({
        connections: [
          {
            id: "elements/mcp-sdk",
            title: "MCP SDK",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "strong",
            evidenceCount: 1,
            authored: true,
          },
          {
            id: "elements/mcp-config",
            title: "MCP Config",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "weak",
            evidenceCount: 0,
            authored: false,
          },
        ],
      }),
    });

    const lens = screen.getByTestId("topology-node-agent-readiness-lens");
    expect(lens).toHaveAccessibleName(
      "Agent readiness: handoff-ready 1 · preflight 1 · review 0",
    );
    expect(lens.querySelector("[data-agent-readiness-summary-line]")?.className).toContain(
      "sr-only",
    );
    const ready = lens.querySelector('[data-agent-readiness-chip="ready"]');
    const preflight = lens.querySelector('[data-agent-readiness-chip="preflight"]');
    const review = lens.querySelector('[data-agent-readiness-chip="review"]');
    expect(ready).toHaveTextContent("ready1");
    expect(ready).not.toHaveTextContent("handoff-ready");
    expect(ready).toHaveAttribute("data-agent-readiness-full-label", "handoff-ready");
    expect(ready).toHaveAttribute("data-agent-readiness-compact-label", "ready");
    expect(ready).toHaveAttribute("title", "handoff-ready 1");
    expect(preflight).toHaveTextContent("check1");
    expect(preflight).not.toHaveTextContent("preflight1");
    expect(preflight).toHaveAttribute("data-agent-readiness-full-label", "preflight");
    expect(preflight).toHaveAttribute("data-agent-readiness-compact-label", "check");
    expect(review).toHaveTextContent("review0");
    expect(review).toHaveAttribute("data-agent-readiness-full-label", "review");
    expect(review).toHaveAttribute("data-agent-readiness-compact-label", "review");
  });

  it("uses singular relation lens labels when the count is one", () => {
    setup({
      focus: focusModel({
        usedByCount: 0,
        dependsOnCount: 1,
        connections: [
          {
            id: "elements/mcp-sdk",
            title: "MCP SDK",
            kind: "element",
            direction: "outgoing",
            relationType: "uses",
            relationQuality: "strong",
            evidenceCount: 1,
            authored: true,
          },
        ],
        relationQuality: {
          strong: 1,
          supported: 0,
          weak: 0,
          review: 0,
        },
      }),
      labels: {
        ...labels,
        relationLensDirectFactOne: "{count} direct fact",
        relationLensDirectFactOther: "{count} direct facts",
        relationLensTypeOne: "{count} relation type",
        relationLensTypeOther: "{count} relation types",
        relationLensCompactFacts: "Facts",
        relationLensCompactTypes: "Types",
      },
    });

    const lens = screen.getByTestId("topology-relation-lens");
    expect(lens).toHaveAccessibleName(
      "관계 렌즈: 1 direct fact · 1 relation type · 추론된 유사도 점수가 아니라 타입이 있는 온톨로지 사실입니다.",
    );
    expect(lens.querySelector('[data-relation-lens-metric="facts"]')).toHaveTextContent(
      "Facts1",
    );
    expect(lens.querySelector('[data-relation-lens-metric="types"]')).toHaveTextContent(
      "Types1",
    );
    expect(lens).not.toHaveTextContent("1 direct fact");
    expect(lens).not.toHaveTextContent("1 relation type");
    expect(lens).not.toHaveTextContent(
      "1 relation types",
    );
  });

  it("reports a hidden remainder when connections are capped", () => {
    setup({ focus: focusModel({ hiddenConnectionCount: 5 }) });
    expect(screen.getAllByText("+5 더").length).toBeGreaterThan(0);
  });

  it("caps rendered relation rows and rolls the rest into the full-detail remainder", () => {
    const manyConnections = Array.from({ length: 12 }, (_, index) => ({
      id: `elements/runtime-${index}`,
      title: `Runtime ${index}`,
      kind: "element",
      direction: "outgoing" as const,
      relationType: "uses",
      relationQuality: "strong" as const,
      evidenceCount: 1,
      authored: true,
    }));

    setup({
      focus: focusModel({
        usedByCount: 10,
        dependsOnCount: 72,
        connections: manyConnections,
        hiddenConnectionCount: 70,
      }),
    });

    const list = screen.getByTestId("topology-node-connection-list");
    expect(list).toHaveAttribute("data-row-render-contract", "capped-preview-plus-remainder");
    expect(list).toHaveAttribute("data-row-render-budget", "2");
    expect(list).toHaveAttribute("data-rendered-connection-count", "2");
    expect(list).toHaveAttribute("data-hidden-connection-count", "80");
    expect(list).toHaveAttribute("data-total-connection-count", "82");
    expect(document.querySelectorAll("[data-relation-row]")).toHaveLength(2);
    expect(screen.getByText("Runtime 0")).toBeInTheDocument();
    expect(screen.queryByText("Runtime 2")).not.toBeInTheDocument();
    expect(screen.getAllByText("+80 더").length).toBeGreaterThan(0);
    const relationRemainder = document.querySelector("[data-relation-hidden-remainder]");
    expect(relationRemainder).toHaveAttribute(
      "data-remainder-text-token",
      "--topology-node-popover-remainder-text",
    );
    expect(relationRemainder?.className).toContain(
      "text-[color:var(--topology-node-popover-remainder-text)]",
    );
    expect(relationRemainder?.className).not.toContain("var(--color-text-quaternary)");
  });

  it("keeps the primary focus brief action visible in collapsed compact focus", () => {
    const copyBrief = vi.fn();
    setup({
      collapsed: true,
      onToggleCollapsed: vi.fn(),
      actions: [
        {
          kind: "focus-brief",
          label: "선택 브리프 복사",
          ariaLabel: "지형도 선택 개념 검토 브리프 복사",
          onClick: copyBrief,
        },
      ],
    });

    const popover = screen.getByTestId("topology-node-popover");
    const action = screen.getByTestId("topology-node-popover-compact-brief-action");
    expect(popover).toHaveAttribute(
      "data-compact-handoff-contract",
      "selected-node-actions-visible",
    );
    expect(popover).toHaveAttribute(
      "data-compact-facts-layout-contract",
      "facts-before-actions",
    );
    expect(popover).toHaveAttribute(
      "data-phone-layout-contract",
      "title-row-before-actions",
    );
    expect(screen.getByTestId("topology-node-popover-compact-actions")).toHaveAttribute(
      "data-compact-actions-layout-contract",
      "actions-after-facts",
    );
    expect(screen.getByTestId("topology-node-popover-compact-actions")).toHaveAttribute(
      "data-phone-layout-contract",
      "actions-wrap-below-title",
    );
    expect(action).toHaveAttribute("data-popover-action", "focus-brief");
    expect(action).toHaveAttribute("data-agent-handoff-action", "copy-focus-brief");
    expect(action).toHaveAttribute(
      "data-popover-action-label-contract",
      "icon-only-full-aria-title",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-responsive-label-contract",
      "visible-above-480-icon-only-below",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-surface-token",
      "--topology-node-popover-action-icon-surface",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-border-token",
      "--topology-node-popover-action-icon-border",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-text-token",
      "--topology-node-popover-action-text",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-hover-text-token",
      "--topology-node-popover-action-hover-text",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-focus-ring-token",
      "--topology-node-popover-action-focus-ring",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-size-token",
      "--topology-node-popover-compact-action-size",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-min-width-token",
      "--topology-node-popover-compact-handoff-action-min-width",
    );
    expect(action).toHaveAttribute(
      "data-popover-action-max-width-token",
      "--topology-node-popover-compact-handoff-action-max-width",
    );
    expect(action.className).toContain(
      "min-w-[var(--topology-node-popover-compact-handoff-action-min-width)]",
    );
    expect(action.className).toContain(
      "max-w-[var(--topology-node-popover-compact-handoff-action-max-width)]",
    );
    expect(action.className).toContain(
      "max-[480px]:w-[var(--topology-node-popover-compact-action-size)]",
    );
    expect(action.querySelector("span")?.className).toContain("max-[480px]:sr-only");
    expect(action).toHaveTextContent("브리프");
    expect(action.className).toContain(
      "text-[color:var(--topology-node-popover-action-text)]",
    );
    expect(action.className).toContain(
      "hover:text-[color:var(--topology-node-popover-action-hover-text)]",
    );
    fireEvent.click(action);
    expect(copyBrief).toHaveBeenCalledTimes(1);
  });

  it("ties hidden remainders to the full-detail action", () => {
    setup({ focus: focusModel({ hiddenConnectionCount: 5 }) });
    expect(
      screen.getByRole("button", {
        name: /전체 상세.*\+5 더/,
      }),
    ).toBeInTheDocument();
  });

  it("wires connection click, full-detail open, and close", () => {
    const { onSelectConnection, onOpenFullDetail, onClose } = setup();

    fireEvent.click(screen.getByText("MCP SDK"));
    expect(onSelectConnection).toHaveBeenCalledWith("elements/mcp-sdk");

    fireEvent.click(screen.getByRole("button", { name: "전체 상세" }));
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when there are no direct connections", () => {
    setup({
      focus: focusModel({
        connections: [],
        usedByCount: 0,
        dependsOnCount: 0,
        relationQuality: {
          strong: 0,
          supported: 0,
          weak: 0,
          review: 0,
        },
      }),
    });
    const emptyState = screen.getByText("직접 연결 없음");
    expect(emptyState).toBeInTheDocument();
    expect(emptyState).toHaveAttribute(
      "data-empty-text-token",
      "--topology-node-popover-empty-text",
    );
    expect(emptyState.className).toContain(
      "text-[color:var(--topology-node-popover-empty-text)]",
    );
    expect(emptyState.className).not.toContain("var(--color-text-quaternary)");
  });

  it("renders the plain-language 'so what' significance block when provided", () => {
    setup({
      significance: {
        whatLine: "AI Agent Partner 영역에 속한 역량",
        importanceLine: "12곳이 직접 의존하는 핵심 축이에요",
        dependsOnLine: "2곳에 기댑니다: MCP SDK, Parser",
        impactLine: "바꾸면 최대 7곳까지 영향이 번질 수 있어요",
        level: "core",
      },
    });
    const contextLine = screen.getByText("AI Agent Partner 영역에 속한 역량");
    const summaryLine = screen.getByText("AI agent surface.");
    const significance = screen.getByTestId("topology-node-significance");
    expect(significance.compareDocumentPosition(summaryLine)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(summaryLine).toHaveAttribute("data-summary-role", "raw-supporting-note");
    expect(summaryLine).toHaveAttribute("data-summary-order-contract", "after-meaning");
    expect(summaryLine).toHaveAttribute("data-summary-visibility", "metadata-only");
    expect(summaryLine).toHaveClass("sr-only");
    expect(contextLine).toBeInTheDocument();
    expect(contextLine).toHaveAttribute(
      "data-significance-context-text-token",
      "--topology-node-popover-significance-context-text",
    );
    expect(contextLine.className).toContain(
      "text-[color:var(--topology-node-popover-significance-context-text)]",
    );
    expect(contextLine.className).not.toContain("var(--color-text-quaternary)");
    const importanceLine = screen.getByText("12곳이 직접 의존하는 핵심 축이에요");
    expect(importanceLine).toBeInTheDocument();
    expect(importanceLine).toHaveAttribute("data-selected-node-importance-line");
    expect(importanceLine).toHaveAttribute("data-significance-level", "core");
    expect(importanceLine).toHaveAttribute(
      "data-importance-text-token",
      "--topology-node-popover-significance-core-text",
    );
    expect(importanceLine.className).toContain(
      "text-[color:var(--topology-node-popover-significance-core-text)]",
    );
    expect(importanceLine.className).not.toContain("var(--color-text-primary)");
    for (const detailLine of [
      screen.getByText("2곳에 기댑니다: MCP SDK, Parser"),
      screen.getByText("바꾸면 최대 7곳까지 영향이 번질 수 있어요"),
    ]) {
      expect(detailLine).toHaveAttribute(
        "data-significance-detail-text-token",
        "--topology-node-popover-significance-detail-text",
      );
      expect(detailLine.className).toContain(
        "text-[color:var(--topology-node-popover-significance-detail-text)]",
      );
      expect(detailLine.className).not.toContain("var(--color-text-tertiary)");
    }
  });

  it("omits the significance block when no significance is provided", () => {
    setup();
    expect(
      screen.queryByTestId("topology-node-significance"),
    ).not.toBeInTheDocument();
  });
});
