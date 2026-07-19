import { describe, expect, it } from "vitest";
import { relationTypeAlpha, relationTypeIndigo } from "./relation-type-tone";

describe("relationTypeAlpha", () => {
  it("ranks containment relations strongest, matching the trace mark's solid-line convention", () => {
    expect(relationTypeAlpha("contains")).toBeGreaterThan(relationTypeAlpha("depends_on"));
    expect(relationTypeAlpha("belongs_to")).toBeGreaterThan(relationTypeAlpha("depends_on"));
  });

  it("ranks depends_on above describes/related_to", () => {
    expect(relationTypeAlpha("depends_on")).toBeGreaterThan(relationTypeAlpha("describes"));
    expect(relationTypeAlpha("depends_on")).toBeGreaterThan(relationTypeAlpha("related_to"));
  });

  it("falls back to a default alpha for an unknown type", () => {
    expect(relationTypeAlpha("some_future_type")).toBeGreaterThanOrEqual(0.2);
    expect(relationTypeAlpha("some_future_type")).toBeLessThanOrEqual(0.9);
  });

  it("is deterministic — same type always resolves to the same alpha", () => {
    expect(relationTypeAlpha("contains")).toBe(relationTypeAlpha("contains"));
  });

  it("stays within the legible [0.2, 0.9] range for every known type", () => {
    for (const type of ["contains", "belongs_to", "depends_on", "implements", "uses", "describes", "related_to"]) {
      const alpha = relationTypeAlpha(type);
      expect(alpha).toBeGreaterThanOrEqual(0.2);
      expect(alpha).toBeLessThanOrEqual(0.9);
    }
  });
});

describe("relationTypeIndigo", () => {
  it("returns the shared indigo hue rgb(94,106,210) with a type-scaled alpha", () => {
    expect(relationTypeIndigo("contains")).toBe("rgba(94, 106, 210, 0.85)");
    expect(relationTypeIndigo("depends_on")).toBe("rgba(94, 106, 210, 0.62)");
  });
});
