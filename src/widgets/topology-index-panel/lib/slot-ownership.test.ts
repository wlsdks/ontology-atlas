import { describe, expect, it } from "vitest";
import { resolveLeftSlotOwner, resolveRenderedIndexPanelState } from "./slot-ownership";

describe("resolveLeftSlotOwner", () => {
  it("gives INDEX the slot in overview mode", () => {
    expect(resolveLeftSlotOwner({ analysisMode: "overview" })).toBe("index");
  });

  it("gives INDEX the slot in focus mode too (분석 패널 완전 소멸 2단계 §a — no more auto-collapse on node expand)", () => {
    expect(resolveLeftSlotOwner({ analysisMode: "focus" })).toBe("index");
  });

  it("gives INDEX the slot in path mode too (분석 패널 완전 소멸 2단계 §b — path moved to a top-center chip, not the left slot)", () => {
    expect(resolveLeftSlotOwner({ analysisMode: "path" })).toBe("index");
  });

  it("gives the analysis rail the slot for health/graph", () => {
    for (const mode of ["graph", "health"] as const) {
      expect(resolveLeftSlotOwner({ analysisMode: mode })).toBe("analysis-rail");
    }
  });
});

describe("resolveRenderedIndexPanelState", () => {
  it("shows the preferred state when INDEX owns the slot", () => {
    expect(resolveRenderedIndexPanelState("index", "expanded")).toBe("expanded");
    expect(resolveRenderedIndexPanelState("index", "collapsed")).toBe("collapsed");
  });

  it("forces the collapsed tab when the analysis rail owns the slot, regardless of preference", () => {
    expect(resolveRenderedIndexPanelState("analysis-rail", "expanded")).toBe("collapsed");
    expect(resolveRenderedIndexPanelState("analysis-rail", "collapsed")).toBe("collapsed");
  });
});
