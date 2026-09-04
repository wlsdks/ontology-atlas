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

// The agent-readiness meter and the repair queue are owned by the "to do" tab (DoNextTab). This one
// answers only "what is central" — the relation type distribution and the hubs.
const labels: ConnectionsTabLabels = {
  relationTypesTitle: "Relation types",
  relationTypesCaption: "What kind of relations you have.",
  noRelationTypes: "No relations connected yet",
  noRelationTypesHint: "Connect them on the map.",
  hubsTitle: "Hubs",
  noHubs: "No hubs yet",
  emptyAction: "Connect concepts on the map",
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

// The impact ranking is this tab's second band — only its presence and empty state are checked
// here; the computation and row rendering are covered by ImpactRankingCard.test.tsx.
const impactLabels: ImpactRankingLabels = {
  title: "Widest ripple when changed",
  caption: "How far a change travels.",
  directLabel: "direct",
  transitiveLabel: "indirect",
  empty: "Nothing ripples yet",
  emptyAction: "Connect concepts on the map",
  emptyHint: "Connect relations on the map.",
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
  /**
   * The readiness meter and the repair-queue counters were moved out of this tab and later
   * removed altogether (owner decision, 2026-08-31: the "to do" tab is one list). The assertion
   * stays because it is cheap and it names the exact testids: if either instrument is ever
   * rebuilt, this tab is not where it belongs.
   */
  it("does not render the removed readiness/repair instruments", () => {
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

    // Reordering here makes the answer to "what is central right now" itself wrong — a row that
    // genuinely has many connections stays on top, and only the absence of a document is quietly stated.
    expect(screen.getByTestId("insights-hub-row-link")).toHaveTextContent("Integration Test");
    expect(screen.getByTestId("evidence-only-badge")).toHaveTextContent("No document");
  });

  // An ink-reduction regression guard — the ego thumbnails were all the same wheel shape across six
  // rows, so the distinguishing information lived only in the number. Bringing them back doubles the row height.
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
    expect(screen.getByText("Connect them on the map.")).toBeInTheDocument();
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
