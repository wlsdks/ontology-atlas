import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InsightsCensusStrip } from "./InsightsCensusStrip";

vi.mock("@/shared/lib/use-count-up", () => ({
  useCountUp: (value: number) =>
    ({ 125: 123, 258: 254, 98: 97 } as Record<number, number>)[value] ?? value,
}));

const LABELS = {
  concepts: "Concepts",
  relations: "Relations",
  health: "Health",
  orphan: "Lone concepts",
  cycle: "Tangled loops",
  membershipLabel: "in a domain",
  densityGloss: "2.06 connections per concept",
  evidenceLinked: "Evidence linked",
  islands: "Disconnected groups",
  relationsHidden: (hidden: number) => `${hidden} more relation types are not on this strip`,
  relationsHiddenRoute: "All relation types",
  statusHealthy: "Nothing blocking",
  statusNeedsAttention: "Needs attention",
  statusBlocking: "Blocking",
  statusAdvisory: "Advisory",
  recentTitle: "Last 12 weeks",
  recentThisWeek: (count: number) => `${count} this week`,
  recentBarsAria: (weeks: number, total: number) => `${weeks} weeks, ${total} updates`,
};

const HEALTH = {
  edgesPerConcept: 2.06,
  orphanCount: 0,
  cycleCount: 0,
  domainMembershipPct: 98,
  evidenceLinkedPct: 100,
};

const renderStrip = (
  overrides: Partial<React.ComponentProps<typeof InsightsCensusStrip>> = {},
) =>
  render(
    <InsightsCensusStrip
      totalNodes={125}
      totalEdges={258}
      health={HEALTH}
      islandCount={0}
      verdict={{ blocking: 9, advisory: 6, total: 15, healthy: false, status: "needs_attention" }}
      weeklyTotals={[0, 1, 2, 3, 1, 0, 2, 4, 1, 0, 3, 4]}
      kindsSummary={[]}
      relationsSummary={[]}
      relationsTotal={0}
      onSeeAllRelations={() => {}}
      labels={LABELS}
      {...overrides}
    />,
  );

describe("InsightsCensusStrip accessibility", () => {
  it("hides transient count-up frames and exposes exact final values", () => {
    renderStrip();

    const [concepts, relations] = screen.getAllByTestId("insights-bignum");
    expect(within(concepts).getByText("123")).toHaveAttribute("aria-hidden", "true");
    expect(within(concepts).getByText("125")).toHaveClass("sr-only");
    expect(concepts.querySelector("[data-insights-exact-value]")).toHaveTextContent("125");
    expect(within(relations).getByText("254")).toHaveAttribute("aria-hidden", "true");
    expect(relations.querySelector("[data-insights-exact-value]")).toHaveTextContent("258");
  });

  it("names the weekly bars for a reader who cannot see them", () => {
    renderStrip();
    expect(screen.getByTestId("insights-weekly-bars")).toHaveAccessibleName("12 weeks, 21 updates");
  });
});

/**
 * Four tiles, and the health tile never prints a total: the number a person acts on lives in the Do-next badge and
 * list title (`insights-badge-agreement`); the strip adds the verdict word.
 */
describe("InsightsCensusStrip four tiles without a third total", () => {
  it("renders four tiles with a verdict word on the health tile instead of a total", () => {
    renderStrip();
    expect(screen.getAllByTestId("insights-census-tile")).toHaveLength(4);
    const verdictWord = screen.getByTestId("insights-verdict-word");
    expect(verdictWord).toHaveTextContent("Needs attention");
    expect(verdictWord.textContent).not.toMatch(/\d/);
    // The total (15) may not appear anywhere in the strip.
    expect(screen.getByTestId("insights-census-strip").textContent).not.toContain("15");
  });

  it("shows blocking and recommended apart with only the two CLI verdict words", () => {
    renderStrip();
    const split = screen.getByTestId("insights-verdict-split");
    expect(split).toHaveTextContent("Blocking9");
    expect(split).toHaveTextContent("Advisory6");

    renderStrip({
      verdict: { blocking: 0, advisory: 0, total: 0, healthy: true, status: "healthy" },
    });
    expect(screen.getAllByTestId("insights-verdict-word")[1]).toHaveTextContent("Nothing blocking");
  });

  it("draws twelve weekly bars with only the last in indigo", () => {
    renderStrip();
    const bars = screen.getAllByTestId("insights-weekly-bar");
    expect(bars).toHaveLength(12);
    expect(bars[11].style.backgroundColor).toBe("var(--color-indigo-brand)");
    // A week with no update is a 2px baseline tick, never a short bar.
    expect(bars[0].style.height).toBe("2px");
    expect(bars[0].style.backgroundColor).toBe("var(--color-text-quaternary)");
    expect(bars[1].style.height).not.toBe("2px");
  });

  it("draws no bars without weekly data", () => {
    renderStrip({ weeklyTotals: [] });
    expect(screen.queryByTestId("insights-weekly-bars")).toBeNull();
    expect(screen.getByText("0 this week")).toBeInTheDocument();
  });
});
