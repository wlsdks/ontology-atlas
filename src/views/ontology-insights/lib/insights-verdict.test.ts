import { describe, expect, it } from "vitest";

import { buildInsightsVerdict, type InsightsSignalCounts } from "./insights-verdict";

/**
 * Every section total is written out — being a `Record<QueueSectionKey, number>`, omitting even one
 * fails type checking. That is why this shape was chosen (2026-08-07: duplicate pairs were missing
 * from the verdict, so a tab badge of 7 and a group badge of 8 appeared on one screen).
 */
const NO_SECTIONS: InsightsSignalCounts["sections"] = {
  "missing-definition": 0,
  "missing-boundary": 0,
  "missing-uncertainty": 0,
  "epistemic-exclusion": 0,
  "slug-outside-kind-folder": 0,
  "missing-domain": 0,
  duplicate: 0,
  promotion: 0,
  "neglected-hub": 0,
  orphan: 0,
  cycle: 0,
};

const NONE: InsightsSignalCounts = {
  islands: 0,
  missingContainment: 0,
  blockedDocuments: 0,
  sections: NO_SECTIONS,
};

/** An input with only some sections filled. */
const withSections = (
  partial: Partial<InsightsSignalCounts["sections"]>,
  rest: Partial<Omit<InsightsSignalCounts, "sections">> = {},
): InsightsSignalCounts => ({ ...NONE, ...rest, sections: { ...NO_SECTIONS, ...partial } });

describe("buildInsightsVerdict", () => {
  // The "to do" tab draws one row per blocked document. A row the screen shows and the badge does
  // not count is the contradiction this module exists to prevent.
  it("counts a document blocked by the check as a blocking signal", () => {
    const verdict = buildInsightsVerdict({ ...NONE, blockedDocuments: 2 });
    expect(verdict.blocking).toBe(2);
    expect(verdict.total).toBe(2);
    expect(verdict.healthy).toBe(false);
    expect(verdict.status).toBe("needs_attention");
  });

  it("is healthy only with no signal, matching the CLI verdict", () => {
    expect(buildInsightsVerdict(NONE)).toEqual({
      blocking: 0,
      advisory: 0,
      total: 0,
      healthy: true,
      status: "healthy",
    });
  });

  // The measured contradiction found in review: on a starter vault whose only signal was one
  // missing containment, `to do 0` + "the graph is healthy" + `missing containment 1` appeared at
  // once, while MCP health returned needs_attention for the same data.
  it("reports one task and needs_attention like the CLI for one missing link", () => {
    const verdict = buildInsightsVerdict({ ...NONE, missingContainment: 1 });

    expect(verdict.total).toBe(1);
    expect(verdict.healthy).toBe(false);
    expect(verdict.status).toBe("needs_attention");
  });

  it("counts a disconnected island as blocking", () => {
    const verdict = buildInsightsVerdict({ ...NONE, islands: 3 });

    expect(verdict.blocking).toBe(3);
    expect(verdict.status).toBe("needs_attention");
  });

  it("counts a dependency cycle as blocking", () => {
    expect(buildInsightsVerdict(withSections({ cycle: 2 })).status).toBe("needs_attention");
  });

  it("does not say healthy on screen with only recommendations, though the CLI verdict is healthy", () => {
    const verdict = buildInsightsVerdict(withSections({ "neglected-hub": 2, orphan: 1, promotion: 4 }));

    expect(verdict.blocking).toBe(0);
    expect(verdict.advisory).toBe(7);
    expect(verdict.status).toBe("healthy");
    // Saying "nothing to fix" while the queue directly below shows seven is self-contradiction.
    expect(verdict.healthy).toBe(false);
  });

  it("sums blocking and recommended signals into the badge total", () => {
    const verdict = buildInsightsVerdict(
      withSections({ cycle: 1, "neglected-hub": 3, promotion: 5 }, { islands: 1, missingContainment: 2 }),
    );

    expect(verdict.blocking).toBe(4);
    expect(verdict.advisory).toBe(8);
    expect(verdict.total).toBe(12);
  });

  it("counts meaning gaps as recommendations so the badge never undercounts the queue", () => {
    const verdict = buildInsightsVerdict(
      withSections({ "missing-definition": 2, "missing-domain": 1 }),
    );
    expect(verdict.total).toBe(3);
    expect(verdict.advisory).toBe(3);
    expect(verdict.blocking).toBe(0);
    // While anything remains to fix, no surface may say "healthy".
    expect(verdict.healthy).toBe(false);
    expect(verdict.status).toBe("healthy");
  });
});
