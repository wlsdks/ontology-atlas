import { describe, expect, it } from "vitest";
import { resolveLeftSlotOwner, resolveRenderedIndexPanelState } from "./slot-ownership";

describe("resolveLeftSlotOwner", () => {
  it("gives INDEX the slot in overview mode", () => {
    expect(resolveLeftSlotOwner({ analysisMode: "overview" })).toBe("index");
  });

  it("gives the analysis rail the slot for every non-overview mode", () => {
    for (const mode of ["graph", "focus", "path", "health"] as const) {
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
