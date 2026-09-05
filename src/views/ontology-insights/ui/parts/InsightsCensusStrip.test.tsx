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
 * **The strip is four tiles, and the health tile never prints a total.**
 *
 * The single number a person acts on lives in exactly two agreeing places — the Do-next tab badge
 * and its list title (`insights-badge-agreement`). A third place printing it is the accident of
 * 2026-08-07 (3), "one screen does not count the same thing two ways". What this strip adds is the
 * verdict *word*, which is the fact the number never carried.
 */
describe("InsightsCensusStrip — 네 타일, 그리고 세 번째 총계는 없다", () => {
  it("타일은 넷이고, 건강 타일은 총계 대신 판정 단어를 쓴다", () => {
    renderStrip();
    expect(screen.getAllByTestId("insights-census-tile")).toHaveLength(4);
    const verdictWord = screen.getByTestId("insights-verdict-word");
    expect(verdictWord).toHaveTextContent("Needs attention");
    expect(verdictWord.textContent).not.toMatch(/\d/);
    // The total (15) may not appear anywhere in the strip.
    expect(screen.getByTestId("insights-census-strip").textContent).not.toContain("15");
  });

  it("막힘과 권고는 나뉘어 보이고, 판정 단어는 CLI 와 같은 두 가지뿐이다", () => {
    renderStrip();
    const split = screen.getByTestId("insights-verdict-split");
    expect(split).toHaveTextContent("Blocking9");
    expect(split).toHaveTextContent("Advisory6");

    renderStrip({
      verdict: { blocking: 0, advisory: 0, total: 0, healthy: true, status: "healthy" },
    });
    expect(screen.getAllByTestId("insights-verdict-word")[1]).toHaveTextContent("Nothing blocking");
  });

  it("주간 막대는 12개이고 마지막 주만 인디고를 쓴다", () => {
    renderStrip();
    const bars = screen.getAllByTestId("insights-weekly-bar");
    expect(bars).toHaveLength(12);
    expect(bars[11].style.backgroundColor).toBe("var(--color-indigo-brand)");
    // A week with no update is a 2px baseline tick, never a short bar — a quiet week and a busy
    // week must not be drawn the same size.
    expect(bars[0].style.height).toBe("2px");
    expect(bars[0].style.backgroundColor).toBe("var(--color-overlay-2)");
    expect(bars[1].style.height).not.toBe("2px");
  });

  it("주간 자료가 없으면 막대를 그리지 않는다 — 빈 축은 사실이 아니다", () => {
    renderStrip({ weeklyTotals: [] });
    expect(screen.queryByTestId("insights-weekly-bars")).toBeNull();
    expect(screen.getByText("0 this week")).toBeInTheDocument();
  });
});
