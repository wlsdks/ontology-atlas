import { describe, expect, it } from "vitest";

import { buildInsightsVerdict, type InsightsSignalCounts } from "./insights-verdict";

/**
 * Every section total is written out — being a `Record<QueueSectionKey, number>`, omitting even one
 * fails type checking. That is why this shape was chosen (2026-08-07: duplicate pairs were missing
 * from the verdict, so a tab badge of 7 and a group badge of 8 appeared on one screen).
 */
const NO_SECTIONS: InsightsSignalCounts["sections"] = {
  "missing-definition": 0,
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
  it("검사에서 막힌 문서는 차단 신호로 센다", () => {
    const verdict = buildInsightsVerdict({ ...NONE, blockedDocuments: 2 });
    expect(verdict.blocking).toBe(2);
    expect(verdict.total).toBe(2);
    expect(verdict.healthy).toBe(false);
    expect(verdict.status).toBe("needs_attention");
  });

  it("신호가 하나도 없을 때만 '건강함' — CLI 판정도 healthy", () => {
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
  it("누락된 연결 1건이면 할 일도 1 · 건강하지 않음 · CLI 와 같은 needs_attention", () => {
    const verdict = buildInsightsVerdict({ ...NONE, missingContainment: 1 });

    expect(verdict.total).toBe(1);
    expect(verdict.healthy).toBe(false);
    expect(verdict.status).toBe("needs_attention");
  });

  it("분리된 섬도 차단 신호다", () => {
    const verdict = buildInsightsVerdict({ ...NONE, islands: 3 });

    expect(verdict.blocking).toBe(3);
    expect(verdict.status).toBe("needs_attention");
  });

  it("의존 순환도 차단 신호다 — 구조적 결함", () => {
    expect(buildInsightsVerdict(withSections({ cycle: 2 })).status).toBe("needs_attention");
  });

  it("권장 사항만 있으면 CLI 판정은 healthy 지만 화면은 '건강합니다' 라고 말하지 않는다", () => {
    const verdict = buildInsightsVerdict(withSections({ "neglected-hub": 2, orphan: 1, promotion: 4 }));

    expect(verdict.blocking).toBe(0);
    expect(verdict.advisory).toBe(7);
    expect(verdict.status).toBe("healthy");
    // Saying "nothing to fix" while the queue directly below shows seven is self-contradiction.
    expect(verdict.healthy).toBe(false);
  });

  it("배지 총합은 차단 + 권장 — 숫자를 숨겨 모순을 피하지 않는다", () => {
    const verdict = buildInsightsVerdict(
      withSections({ cycle: 1, "neglected-hub": 3, promotion: 5 }, { islands: 1, missingContainment: 2 }),
    );

    expect(verdict.blocking).toBe(4);
    expect(verdict.advisory).toBe(8);
    expect(verdict.total).toBe(12);
  });

  it("의미 공백은 권장으로 세어 배지가 큐 행보다 적게 말하지 않게 한다", () => {
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
