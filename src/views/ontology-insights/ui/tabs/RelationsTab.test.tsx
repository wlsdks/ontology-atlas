import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { RelationsTab, type RelationsTabLabels } from "./RelationsTab";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

// S5 재편: agent readiness 계기·수리 큐는 "할 일" 탭(DoNextTab)으로 이관 —
// 그 렌더 계약은 DoNextTab.test.tsx 가 소유한다. 여기는 관계 재고(타입
// 분포·depends_on·허브)만 남는다.
const labels: RelationsTabLabels = {
  relationTypesTitle: "Relation types",
  topDependsOnTitle: "Top depends_on",
  noDependsOn: "No depends_on relations yet",
  hubsTitle: "Hubs",
  noHubs: "No hubs yet",
  connectionsUnit: "connections",
  hubTruncated: (shown, total) => `Showing ${shown} of ${total}`,
  hubThumbnailCaption: "Thumbnails are mini ego maps.",
};

const hubLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: (title: string) => `${title} — view on the map`,
};

const dependsOnLink = hubLink;

describe("RelationsTab", () => {
  it("does not render the moved readiness/repair instruments (S5 이관 회귀)", () => {
    render(
      <RelationsTab
        edgeTypeRows={[{ type: "contains", count: 10 }]}
        totalEdges={10}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[]}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        dependsOnLink={dependsOnLink}
        labels={labels}
      />,
    );

    expect(screen.queryByTestId("insights-agent-readiness")).toBeNull();
    expect(screen.queryByTestId("insights-repair-queue")).toBeNull();
    expect(screen.getByText("Relation types")).toBeInTheDocument();
  });

  it("renders each hub row as a map-focus deeplink (UX 부대 — 허브 행 비클릭 해소)", () => {
    render(
      <RelationsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[]}
        hubs={[
          {
            id: "domain:auth",
            title: "Auth",
            kind: "domain",
            degree: 12,
            thumbnail: { degree: 12, spokes: [] },
          },
        ]}
        hubTotalCount={1}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        dependsOnLink={dependsOnLink}
        labels={labels}
      />,
    );

    const link = screen.getByTestId("insights-hub-row-link");
    expect(link).toHaveAttribute("href", "/ontology/?node=domain%3Aauth");
    expect(link).toHaveAttribute("aria-label", "Auth — view on the map");
  });

  it("renders both ends of each TOP DEPENDS_ON row as map-focus deeplinks (UX 부대 — [I-3] 비클릭 해소)", () => {
    render(
      <RelationsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        dependsOnRows={[
          {
            fromId: "capability:mcp-server",
            fromTitle: "MCP Server",
            toId: "domain:ai-agent-partner",
            toTitle: "AI Agent Partner",
            count: 3,
          },
        ]}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        dependsOnLink={dependsOnLink}
        labels={labels}
      />,
    );

    const links = screen.getAllByTestId("insights-depends-row-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/ontology/?node=capability%3Amcp-server");
    expect(links[0]).toHaveAttribute("aria-label", "MCP Server — view on the map");
    expect(links[1]).toHaveAttribute("href", "/ontology/?node=domain%3Aai-agent-partner");
    expect(links[1]).toHaveAttribute("aria-label", "AI Agent Partner — view on the map");
  });
});
