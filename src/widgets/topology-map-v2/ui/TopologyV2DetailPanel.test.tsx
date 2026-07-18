import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopologyV2DetailPanel } from "./TopologyV2DetailPanel";

const labels = {
  kindLabel: "Domain",
  poweredOn: "fresh",
  poweredOff: "idle",
  metricUsedBy: "used by",
  metricDependsOn: "leans on",
  metricEvidence: "evidence",
  noConnections: "no direct connections",
  handoff: "Copy next action",
  close: "Close",
  openFullDetail: "Full detail →",
};

function renderPanel(
  onOpenFullDetail?: () => void,
  evidence: { rows: { id: string; title: string; path: string | null }[]; total: number } = {
    rows: [],
    total: 0,
  },
) {
  render(
    <TopologyV2DetailPanel
      slug="domains/views"
      title="Views"
      kind="domain"
      powered={false}
      metric={{ usedBy: 1, dependsOn: 2, evidence: evidence.total }}
      groups={{ usedBy: { rows: [], total: 1 }, dependsOn: { rows: [], total: 2 } }}
      evidence={evidence}
      handoffText="node: domains/views"
      labels={labels}
      onSelectConnection={() => {}}
      onCopyHandoff={() => {}}
      onClose={() => {}}
      onOpenFullDetail={onOpenFullDetail}
    />,
  );
}

describe("TopologyV2DetailPanel — full-detail A1 opt-in link", () => {
  it("renders the '전체 상세 →' link when onOpenFullDetail is provided", () => {
    const onOpenFullDetail = vi.fn();
    renderPanel(onOpenFullDetail);
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-open-full-detail"));
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);
  });

  it("hides the link when onOpenFullDetail is omitted", () => {
    renderPanel(undefined);
    expect(
      screen.queryByTestId("topology-v2-detail-panel-open-full-detail"),
    ).not.toBeInTheDocument();
  });
});

describe("TopologyV2DetailPanel — 근거(evidence) group promotion (RATIO-SYSTEM §4)", () => {
  it("renders an evidence group with its row's title/path when evidence rows exist", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    const group = screen.getByText("evidence").closest("[data-datasheet-group='evidence']");
    expect(group).not.toBeNull();
    expect(screen.getByText("product-owner-operating-system")).toBeInTheDocument();
    expect(screen.getByText("capabilities/")).toBeInTheDocument();
  });

  it("does not render the evidence group when there are no evidence rows", () => {
    renderPanel(undefined, { rows: [], total: 0 });
    expect(document.querySelector("[data-datasheet-group='evidence']")).toBeNull();
  });
});
