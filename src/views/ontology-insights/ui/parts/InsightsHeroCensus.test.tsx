import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InsightsHeroCensus } from "./InsightsHeroCensus";

vi.mock("@/shared/lib/use-count-up", () => ({
  useCountUp: (value: number) =>
    ({ 125: 123, 258: 254, 98: 97 } as Record<number, number>)[value] ?? value,
}));

describe("InsightsHeroCensus accessibility", () => {
  it("hides transient count-up frames and exposes exact final values", () => {
    render(
      <InsightsHeroCensus
        totalNodes={125}
        totalEdges={258}
        health={{
          edgesPerConcept: 2.06,
          orphanCount: 0,
          cycleCount: 0,
          domainMembershipPct: 98,
          evidenceLinkedPct: 100,
        }}
        islandCount={0}
        kindsSummary={[]}
        relationsSummary={[]}
        relationsTotal={0}
        onSeeAllRelations={() => {}}
        labels={{
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
        }}
      />,
    );

    const [concepts, relations, health] = screen.getAllByTestId("insights-bignum");
    expect(within(concepts).getByText("123")).toHaveAttribute("aria-hidden", "true");
    expect(within(concepts).getByText("125")).toHaveClass("sr-only");
    expect(
      concepts.querySelector("[data-insights-exact-value]"),
    ).toHaveTextContent("125");
    expect(within(relations).getByText("254")).toHaveAttribute("aria-hidden", "true");
    expect(within(relations).getByText("258")).toHaveClass("sr-only");
    expect(
      relations.querySelector("[data-insights-exact-value]"),
    ).toHaveTextContent("258");
    const animatedHealth = health.querySelector('[aria-hidden="true"]');
    expect(animatedHealth).toHaveAttribute("aria-hidden", "true");
    expect(animatedHealth).toHaveTextContent(/97%.*in a domain/);
    expect(within(health).getByText("98% in a domain")).toHaveClass("sr-only");
  });
});
