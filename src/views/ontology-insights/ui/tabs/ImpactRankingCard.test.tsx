import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { ImpactRankingCard, type ImpactRankingLabels } from "./ImpactRankingCard";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels: ImpactRankingLabels = {
  title: "Widest ripple when changed",
  caption: "Number = concepts to re-check.",
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

const nodeLink = {
  href: (nodeId: string) => `/ontology/?node=${encodeURIComponent(nodeId)}`,
  ariaLabel: ({ title, direct, total }: { title: string; direct: number; total: number }) =>
    `${title} — ${direct} direct, ${total} including indirect`,
  evidenceAriaLabel: ({ title, total }: { title: string; total: number }) =>
    `${title} — ${total} concepts wrote this name down`,
};

const rows = [
  { id: "element:token", title: "Token", kind: "element", direct: 3, total: 9, evidenceOnly: false },
  {
    id: "capability:login",
    title: "Login",
    kind: "capability",
    direct: 1,
    total: 2,
    evidenceOnly: false,
  },
];

const evidenceRows = [
  {
    id: "element:integration-test",
    title: "Integration Test",
    kind: "element",
    direct: 2,
    total: 15,
    evidenceOnly: true,
    ref: "mcp/src/integration.test.mjs",
  },
];

describe("ImpactRankingCard", () => {
  it("gives each row a map deep link that reads both counts", () => {
    render(
      <ImpactRankingCard
        rows={rows}
        evidenceRows={[]}
        evidenceRankedCount={0}
        rankedCount={2}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    const links = screen.getAllByTestId("insights-impact-row-link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/ontology/?node=element%3Atoken");
    // The bar is `aria-hidden`, so the link name is the only accessible route to the numbers.
    expect(links[0]).toHaveAttribute("aria-label", "Token — 3 direct, 9 including indirect");
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("adds a truncation line to the footnote when ranks exceed shown rows", () => {
    const { container } = render(
      <ImpactRankingCard
        rows={rows}
        evidenceRows={[]}
        evidenceRankedCount={0}
        rankedCount={40}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    const footers = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(footers).toContain("Top 2 / 40 total · Number = concepts to re-check.");
  });

  it("keeps the footnote to one explanation line without truncation", () => {
    const { container } = render(
      <ImpactRankingCard
        rows={rows}
        evidenceRows={[]}
        evidenceRankedCount={0}
        rankedCount={2}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    const footers = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(footers).toContain("Number = concepts to re-check.");
  });

  it("shows a next step for an empty vault", () => {
    render(
      <ImpactRankingCard
        rows={[]}
        evidenceRows={[]}
        evidenceRankedCount={0}
        rankedCount={0}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    expect(screen.getByText("Nothing ripples yet")).toBeInTheDocument();
    expect(screen.getByText("Connect relations on the map.")).toBeInTheDocument();
    expect(screen.queryByTestId("insights-impact-row-link")).toBeNull();
  });

  it("keeps both segment meanings in the header when empty", () => {
    render(
      <ImpactRankingCard
        rows={[]}
        evidenceRows={[]}
        evidenceRankedCount={0}
        rankedCount={0}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    expect(screen.getByText("direct")).toBeInTheDocument();
    expect(screen.getByText("indirect")).toBeInTheDocument();
  });

  it("drops the divider on the first row of the second column", () => {
    render(
      <ImpactRankingCard
        rows={rows}
        evidenceRows={[]}
        evidenceRankedCount={0}
        rankedCount={2}
        kindLabel={(kind) => kind}
        nodeLink={nodeLink}
        labels={labels}
      />,
    );

    const links = screen.getAllByTestId("insights-impact-row-link");
    // Each column's first row is a column head, so it has no line above; the line lives on the cell, not the row that
    // bleeds for hover.
    expect(links[0].parentElement?.className ?? "").not.toContain("border-t");
    expect(links[1].parentElement?.className).toContain("@min-[960px]/insights:border-t-0");
    expect(links[0].className).not.toContain("border-t");
  });

  describe("evidence layer", () => {
    const renderWithEvidence = () =>
      render(
        <ImpactRankingCard
          rows={rows}
          rankedCount={2}
          evidenceRows={evidenceRows}
          evidenceRankedCount={193}
          kindLabel={(kind) => kind}
          nodeLink={nodeLink}
          labels={labels}
        />,
      );

    it("lists a concept without a document only in the folded layer", () => {
      renderWithEvidence();

      // The top of a risk slot is not filled with test file names; the toggle label states the scale.
      expect(screen.queryByText("Integration Test")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Show 193 names without a document" }),
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("reads the same number as citations, not risk, when expanded", () => {
      renderWithEvidence();

      fireEvent.click(screen.getByTestId("insights-impact-evidence-toggle"));

      const row = screen.getByTestId("insights-impact-evidence-row-link");
      expect(row).toHaveAttribute(
        "aria-label",
        "Integration Test — 15 concepts wrote this name down",
      );
      // The same number meant "places to re-check" in the concept layer; without per-layer captions a test reads as a risk.
      expect(screen.getByText(/The number here is not risk/)).toBeInTheDocument();
    });

    it("identifies the file of an expanded row with a neutral badge and raw reference", () => {
      renderWithEvidence();
      fireEvent.click(screen.getByTestId("insights-impact-evidence-toggle"));

      const badge = screen.getByTestId("evidence-only-badge");
      expect(badge).toHaveTextContent("No document");
      // Quiet ink, not amber: dozens of these badges appear on one screen.
      expect(badge.className).toContain("--color-text-quaternary");
      expect(badge.className).not.toContain("amber");
      // Two files collapse to "Integration Test", so the reference string tells them apart.
      expect(screen.getByText("mcp/src/integration.test.mjs")).toBeInTheDocument();
    });

    it("renders no toggle for a vault without evidence", () => {
      render(
        <ImpactRankingCard
          rows={rows}
          rankedCount={2}
          evidenceRows={[]}
          evidenceRankedCount={0}
          kindLabel={(kind) => kind}
          nodeLink={nodeLink}
          labels={labels}
        />,
      );

      expect(screen.queryByTestId("insights-impact-evidence-toggle")).toBeNull();
    });
  });
});
