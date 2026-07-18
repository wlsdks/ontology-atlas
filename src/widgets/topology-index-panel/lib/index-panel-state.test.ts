import { describe, expect, it } from "vitest";
import {
  parseIndexPanelStateParam,
  resolveIndexPanelState,
} from "./index-panel-state";

describe("parseIndexPanelStateParam", () => {
  it("accepts the two valid literals", () => {
    expect(parseIndexPanelStateParam("expanded")).toBe("expanded");
    expect(parseIndexPanelStateParam("collapsed")).toBe("collapsed");
  });

  it("returns null for missing or invalid values", () => {
    expect(parseIndexPanelStateParam(null)).toBeNull();
    expect(parseIndexPanelStateParam(undefined)).toBeNull();
    expect(parseIndexPanelStateParam("")).toBeNull();
    expect(parseIndexPanelStateParam("open")).toBeNull();
  });
});

describe("resolveIndexPanelState", () => {
  it("prefers the URL state when present", () => {
    expect(resolveIndexPanelState("collapsed", "expanded")).toBe("collapsed");
    expect(resolveIndexPanelState("expanded", "collapsed")).toBe("expanded");
  });

  it("falls back to the stored preference when URL is absent", () => {
    expect(resolveIndexPanelState(null, "collapsed")).toBe("collapsed");
  });

  it("defaults to expanded when neither source is set", () => {
    expect(resolveIndexPanelState(null, null)).toBe("expanded");
  });
});
