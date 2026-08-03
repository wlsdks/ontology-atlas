import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ConnectionsTab, type ConnectionsTabLabels } from "./ConnectionsTab";
import type { ImpactRankingLabels } from "./ImpactRankingCard";

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
  evidenceBadge: "No document",
  evidenceBadgeHint: "Another document wrote this name down.",
  hubDegreeCaption: "Number = all connections combined.",
};

const hubLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: (title: string) => `${title} — view on the map`,
};

// 영향 랭킹은 같은 탭의 두 번째 밴드 — 여기서는 존재/빈 상태만 확인하고
// 계산·행 렌더는 ImpactRankingCard.test.tsx 가 본다.
const impactLabels: ImpactRankingLabels = {
  title: "Widest ripple when changed",
  caption: "How far a change travels.",
  directLabel: "direct",
  transitiveLabel: "indirect",
  empty: "Nothing ripples yet",
  emptyHint: "Connect relations in the workshop.",
  truncated: (shown, total) => `Top ${shown} / ${total} total`,
  evidenceShow: (count) => `Show ${count} names without a document`,
  evidenceHide: "Hide names without a document",
  evidenceCaption: "The number here is not risk.",
  evidenceTruncated: (shown, total) => `Top ${shown} / ${total} without a document`,
  evidenceBadge: "No document",
  evidenceBadgeHint: "Another document wrote this name down.",
  unknownTitle: "Impact range unknown",
  unknownDetail: (declared, rationale) => `${declared} declared · ${rationale} with rationale`,
  structureLink: "Explore structural connections",
};

const impactLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: ({ title }: { title: string }) => `${title} — view on the map`,
  evidenceAriaLabel: ({ title }: { title: string }) => `${title} — view on the map`,
};

const emptyImpact = {
  declaredDependencyEdges: 0,
  declaredWithRationaleEdges: 0,
  rows: [],
  rankedCount: 0,
  evidenceRows: [],
  evidenceRankedCount: 0,
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
        impact={emptyImpact}
        impactLink={impactLink}
        impactLabels={impactLabels}
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
        hubs={[{ id: "domain:auth", title: "Auth", kind: "domain", degree: 12, evidenceOnly: false }]}
        hubTotalCount={1}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
        impact={emptyImpact}
        impactLink={impactLink}
        impactLabels={impactLabels}
      />,
    );

    const link = screen.getByTestId("insights-hub-row-link");
    expect(link).toHaveAttribute("href", "/ontology/?node=domain%3Aauth");
    expect(link).toHaveAttribute("aria-label", "Auth — view on the map");
    expect(screen.queryByTestId("evidence-only-badge")).toBeNull();
  });

  it("허브는 순서를 그대로 두고 문서 없는 행만 배지로 밝힌다", () => {
    render(
      <ConnectionsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        hubs={[
          { id: "element:x", title: "Integration Test", kind: "element", degree: 12, evidenceOnly: true },
        ]}
        hubTotalCount={1}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
        impact={emptyImpact}
        impactLink={impactLink}
        impactLabels={impactLabels}
      />,
    );

    // 여기서 순서를 바꾸면 "지금 뭐가 중심인가"의 답 자체가 틀려진다 —
    // 실제로 연결이 많은 행은 위에 남고, 문서 유무만 조용히 밝힌다.
    expect(screen.getByTestId("insights-hub-row-link")).toHaveTextContent("Integration Test");
    expect(screen.getByTestId("evidence-only-badge")).toHaveTextContent("No document");
  });

  // 잉크 삭감 회귀 가드 — 에고 썸네일은 6행이 모두 같은 바퀴 모양이라
  // 구분 정보가 숫자에만 있었다. 다시 들어오면 행 높이가 두 배가 된다.
  it("허브 행에 에고 썸네일을 그리지 않는다", () => {
    const { container } = render(
      <ConnectionsTab
        edgeTypeRows={[]}
        totalEdges={0}
        edgeTypeLabel={(type) => type}
        hubs={[{ id: "domain:auth", title: "Auth", kind: "domain", degree: 12, evidenceOnly: false }]}
        hubTotalCount={1}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
        impact={emptyImpact}
        impactLink={impactLink}
        impactLabels={impactLabels}
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
        impact={emptyImpact}
        impactLink={impactLink}
        impactLabels={impactLabels}
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
        hubs={[{ id: "domain:auth", title: "Auth", kind: "domain", degree: 12, evidenceOnly: false }]}
        hubTotalCount={9}
        kindLabel={(kind) => kind}
        hubLink={hubLink}
        labels={labels}
        impact={emptyImpact}
        impactLink={impactLink}
        impactLabels={impactLabels}
      />,
    );

    const footers = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(footers).toContain("Showing 1 of 9 · Number = all connections combined.");
  });
});
