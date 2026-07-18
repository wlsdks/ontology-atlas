import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelationsTab, type RelationsTabLabels } from "./RelationsTab";

const labels: RelationsTabLabels = {
  relationTypesTitle: "Relation types",
  topDependsOnTitle: "Top depends_on",
  noDependsOn: "No depends_on relations yet",
  hubsTitle: "Hubs",
  noHubs: "No hubs yet",
  connectionsUnit: "connections",
  hubTruncated: (shown, total) => `Showing ${shown} of ${total}`,
  hubThumbnailCaption: "Thumbnails are mini ego maps.",
  agentReadinessTitle: "Agent readiness",
  agentReadinessReady: "ready",
  agentReadinessPreflight: "preflight",
  agentReadinessReview: "review",
};

describe("RelationsTab", () => {
  it("renders the agent readiness gauge with ready/preflight/review counts (W3 분석 보기 이관)", () => {
    render(
      <RelationsTab
        edgeTypeRows={[{ type: "contains", count: 10 }]}
        totalEdges={10}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[]}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        agentReadiness={{ ready: 82, preflight: 4, review: 2 }}
        labels={labels}
      />,
    );

    const gauge = screen.getByTestId("insights-agent-readiness");
    expect(gauge).toHaveTextContent("Agent readiness");
    expect(gauge).toHaveTextContent("82");
    expect(gauge).toHaveTextContent("ready");
    expect(gauge).toHaveTextContent("4");
    expect(gauge).toHaveTextContent("preflight");
    expect(gauge).toHaveTextContent("2");
    expect(gauge).toHaveTextContent("review");
    expect(gauge).toHaveAttribute(
      "aria-label",
      "Agent readiness: 82 ready · 4 preflight · 2 review",
    );
  });

  it("does not divide by zero when there are no relations yet", () => {
    render(
      <RelationsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[]}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        agentReadiness={{ ready: 0, preflight: 0, review: 0 }}
        labels={labels}
      />,
    );

    expect(screen.getByTestId("insights-agent-readiness-meter")).toBeInTheDocument();
  });
});
