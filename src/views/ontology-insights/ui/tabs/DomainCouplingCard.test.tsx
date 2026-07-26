import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { DomainCouplingCard, type DomainCouplingCardLabels } from "./DomainCouplingCard";
import type { DomainCouplingBoundaryRow, DomainCouplingPairRow } from "../../lib/domain-coupling-rows";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels: DomainCouplingCardLabels = {
  title: "Domain coupling",
  emptyTitle: "Not enough coupling data yet",
  emptyDescription: "Needs 2+ domains and a cross-domain relation.",
  emptyAction: "Connect concepts in the workshop",
  emptyActionHref: "/ontology/studio/",
  pairsUnit: "pairs",
  boundaryTitle: "Boundary pressure",
  boundarySelfLabel: "self",
  boundaryCrossLabel: "cross",
  boundaryCaption: "Higher cross % means a leakier domain boundary.",
  examplesCaption: "Expand a pair to see example edges.",
  pairTruncated: (shown, total) => `Showing ${shown} of ${total}`,
};

const nodeLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: (title: string) => `${title} — view on the map`,
};

const pairs: DomainCouplingPairRow[] = [
  {
    fromId: "domain:auth",
    fromTitle: "Auth",
    toId: "domain:billing",
    toTitle: "Billing",
    count: 3,
    relationCounts: [{ type: "depends_on", count: 3 }],
    examples: [
      {
        id: "e1",
        fromId: "capability:login",
        fromTitle: "Login",
        toId: "capability:invoice",
        toTitle: "Invoice",
        type: "depends_on",
      },
    ],
  },
];

const boundaries: DomainCouplingBoundaryRow[] = [
  { id: "domain:auth", title: "Auth", selfEdges: 2, crossEdges: 3, crossRatio: 0.6 },
];

describe("DomainCouplingCard", () => {
  it("renders top pairs, relation counts, and example edges as map deeplinks", () => {
    render(
      <DomainCouplingCard
        domainCount={2}
        crossDomainEdgeCount={3}
        pairs={pairs}
        totalPairCount={1}
        boundaries={boundaries}
        isColdStart={false}
        edgeTypeLabel={(type) => type}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    expect(screen.getByText("Domain coupling")).toBeInTheDocument();
    const pairRow = screen.getByTestId("domain-coupling-pair");
    expect(pairRow).toBeInTheDocument();
    expect(pairRow.textContent).toContain("Auth");
    expect(pairRow.textContent).toContain("Billing");

    const links = screen.getAllByTestId("domain-coupling-example-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/ontology/?node=capability%3Alogin");
    expect(links[1]).toHaveAttribute("href", "/ontology/?node=capability%3Ainvoice");

    // 경계 압력 — self/cross 비율 카드도 함께 렌더.
    expect(screen.getByText("Boundary pressure")).toBeInTheDocument();
    expect(screen.getByText(/self 2 · cross 3/)).toBeInTheDocument();
  });

  it("shows the truncation caption when totalPairCount exceeds shown pairs", () => {
    render(
      <DomainCouplingCard
        domainCount={2}
        crossDomainEdgeCount={10}
        pairs={pairs}
        totalPairCount={5}
        boundaries={boundaries}
        isColdStart={false}
        edgeTypeLabel={(type) => type}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    expect(screen.getByText("Showing 1 of 5")).toBeInTheDocument();
  });

  it("renders the cold-start empty-state instead of pairs when domainCount < 2 or no cross edges (rank #10 contract)", () => {
    render(
      <DomainCouplingCard
        domainCount={1}
        crossDomainEdgeCount={0}
        pairs={[]}
        totalPairCount={0}
        boundaries={[]}
        isColdStart
        edgeTypeLabel={(type) => type}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    expect(screen.getByTestId("domain-coupling-empty")).toBeInTheDocument();
    expect(screen.getByText("Not enough coupling data yet")).toBeInTheDocument();
    expect(screen.queryByTestId("domain-coupling-pair")).toBeNull();
    // 빈 방 금지 — 설명만 두지 않고 다음 한 걸음을 함께 준다.
    expect(screen.getByTestId("domain-coupling-empty-action")).toHaveAttribute(
      "href",
      "/ontology/studio/",
    );
  });
});
