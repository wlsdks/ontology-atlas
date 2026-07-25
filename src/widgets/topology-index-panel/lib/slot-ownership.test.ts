import { describe, expect, it } from "vitest";
import { resolveLeftSlotOwner, resolveRenderedIndexPanelState } from "./slot-ownership";

describe("resolveLeftSlotOwner", () => {
  it("always gives INDEX the slot — the analysis rail (TopologyAnalysisBar) was deleted in 분석 패널 완전 소멸 2단계 §d", () => {
    for (const mode of ["overview", "focus", "path", "health"] as const) {
      expect(resolveLeftSlotOwner({ analysisMode: mode })).toBe("index");
    }
  });
});

describe("resolveRenderedIndexPanelState", () => {
  it("shows the preferred state when INDEX owns the slot", () => {
    expect(resolveRenderedIndexPanelState("index", "expanded")).toBe("expanded");
    expect(resolveRenderedIndexPanelState("index", "collapsed")).toBe("collapsed");
  });

  it("forces the collapsed tab when the analysis rail owns the slot, regardless of preference (dead branch kept as a seam for a future rail)", () => {
    expect(resolveRenderedIndexPanelState("analysis-rail", "expanded")).toBe("collapsed");
    expect(resolveRenderedIndexPanelState("analysis-rail", "collapsed")).toBe("collapsed");
  });
});
