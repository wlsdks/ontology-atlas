import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ConnectionsTab, type ConnectionsTabLabels } from "./ConnectionsTab";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

// agent readiness 계기·수리 큐는 "할 일" 탭(DoNextTab)이 소유한다. 여기는
// "뭐가 중심인가" 질문만 — 관계 타입 분포와 허브.
const labels: ConnectionsTabLabels = {
  relationTypesTitle: "Relation types",
  relationTypesCaption: "What kind of relations you have.",
  noRelationTypes: "No relations connected yet",
  noRelationTypesHint: "Connect them in the workshop.",
  hubsTitle: "Hubs",
  noHubs: "No hubs yet",
  noHubsHint: "Add relations to grow hubs.",
  hubTruncated: (shown, total) => `Showing ${shown} of ${total}`,
  hubDegreeCaption: "Number = all connections combined.",
};

const hubLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: (title: string) => `${title} — view on the map`,
};

describe("ConnectionsTab", () => {
  it("does not render the moved readiness/repair instruments", () => {
    render(
      <ConnectionsTab
        edgeTypeRows={[{ type: "contains", count: 10 }]}
        totalEdges={10}
        edgeTypeLabel={(type) => type}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
      />,
    );

    expect(screen.queryByTestId("insights-agent-readiness")).toBeNull();
    expect(screen.queryByTestId("insights-repair-queue")).toBeNull();
    expect(screen.getByText("Relation types")).toBeInTheDocument();
  });

  it("renders each hub row as a map-focus deeplink", () => {
    render(
      <ConnectionsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        hubs={[{ id: "domain:auth", title: "Auth", kind: "domain", degree: 12 }]}
        hubTotalCount={1}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
      />,
    );

    const link = screen.getByTestId("insights-hub-row-link");
    expect(link).toHaveAttribute("href", "/ontology/?node=domain%3Aauth");
    expect(link).toHaveAttribute("aria-label", "Auth — view on the map");
  });

  // 잉크 삭감 회귀 가드 — 에고 썸네일은 6행이 모두 같은 바퀴 모양이라
  // 구분 정보가 숫자에만 있었다. 다시 들어오면 행 높이가 두 배가 된다.
  it("허브 행에 에고 썸네일을 그리지 않는다", () => {
    const { container } = render(
      <ConnectionsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        hubs={[{ id: "domain:auth", title: "Auth", kind: "domain", degree: 12 }]}
        hubTotalCount={1}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
      />,
    );

    expect(container.querySelectorAll("line")).toHaveLength(0);
  });

  it("빈 볼트에서도 관계 타입 카드가 다음 한 걸음을 안내한다", () => {
    render(
      <ConnectionsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        hubs={[]}
        hubTotalCount={0}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
      />,
    );

    expect(screen.getByText("No relations connected yet")).toBeInTheDocument();
    expect(screen.getByText("Connect them in the workshop.")).toBeInTheDocument();
  });

  it("절단 문구와 각주를 한 줄로 합쳐 카드 해부구조를 흔들지 않는다", () => {
    const { container } = render(
      <ConnectionsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        hubs={[{ id: "domain:auth", title: "Auth", kind: "domain", degree: 12 }]}
        hubTotalCount={9}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
      />,
    );

    const footers = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(footers).toContain("Showing 1 of 9 · Number = all connections combined.");
  });
});
