import { describe, expect, it } from "vitest";
import { resolveRiseBaseline, slugsToRise } from "./rise-rule";

describe("project rise rule", () => {
  const last = { scope: "local:a", slugs: new Set(["alpha"]) };

  it("raises a slug the same folder had not shown", () => {
    const baseline = resolveRiseBaseline(last, "local:a", ["alpha", "beta"]);
    expect(slugsToRise(baseline, ["alpha", "beta"])).toEqual(["beta"]);
  });

  it("raises nothing when the set is unchanged", () => {
    const baseline = resolveRiseBaseline(last, "local:a", ["alpha"]);
    expect(slugsToRise(baseline, ["alpha"])).toEqual([]);
  });

  it("raises nothing after a folder switch", () => {
    const baseline = resolveRiseBaseline(last, "local:b", ["gamma", "delta"]);
    expect(slugsToRise(baseline, ["gamma", "delta"])).toEqual([]);
  });

  it("raises nothing on a first visit", () => {
    const baseline = resolveRiseBaseline(null, "local:a", ["alpha"]);
    expect(slugsToRise(baseline, ["alpha"])).toEqual([]);
  });
});
