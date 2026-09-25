import { describe, expect, it } from "vitest";
import { INDIGO_RGB } from "@/shared/config/indigo-tokens";
import { RELATION_TYPE_MIN_ALPHA, relationTypeAlpha, relationTypeFill, relationTypeHatched, relationTypeIndigo } from "./relation-type-tone";

const KNOWN = ["contains", "belongs_to", "depends_on", "implements", "uses", "describes", "related_to"];

/** The panel every relation-type swatch sits on (`--color-panel`, #0f1011). */
const PANEL: readonly [number, number, number] = [0x0f, 0x10, 0x11];

function luminance(rgb: readonly number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function contrastOnPanel(alpha: number): number {
  const ink = INDIGO_RGB.highlight.split(",").map((part) => Number(part.trim()));
  const composite = ink.map((channel, i) => PANEL[i] + alpha * (channel - PANEL[i]));
  return (luminance(composite) + 0.05) / (luminance(PANEL) + 0.05);
}

describe("relationTypeAlpha", () => {
  /*
   * Round 4 review, 2026-09-25: depends_on at 0.85 and related_to at 0.62 were two nearly
   * identical indigos. The families now differ in kind: two solids a full scale apart, and a hatch.
   */
  it("draws containment and depends_on as two solids a full scale apart, and hatches the rest", () => {
    expect(relationTypeAlpha("contains")).toBe(0.95);
    expect(relationTypeAlpha("depends_on")).toBe(RELATION_TYPE_MIN_ALPHA);
    for (const type of ["contains", "belongs_to", "depends_on"]) expect(relationTypeHatched(type)).toBe(false);
    for (const type of ["implements", "uses", "describes", "related_to", "some_future_type"]) {
      expect(relationTypeHatched(type)).toBe(true);
      expect(relationTypeFill(type)).toContain("repeating-linear-gradient");
    }
    expect(relationTypeFill("depends_on")).toBe(relationTypeIndigo("depends_on"));
  });

  it("gives an unknown type the floor", () => {
    expect(relationTypeAlpha("some_future_type")).toBe(RELATION_TYPE_MIN_ALPHA);
  });

  // WCAG 1.4.11: a segment a reader needs must clear 3:1 against the panel it sits on. The old
  // brand-indigo scale drew related_to at 1.39:1, where it read as the empty track.
  it("keeps every known type and the fallback at 3:1 or more on the panel", () => {
    for (const type of [...KNOWN, "some_future_type"]) {
      expect(contrastOnPanel(relationTypeAlpha(type))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("relationTypeIndigo", () => {
  it("returns the highlight indigo with a type-scaled alpha", () => {
    expect(relationTypeIndigo("contains")).toBe(`rgba(${INDIGO_RGB.highlight}, 0.95)`);
    expect(relationTypeIndigo("depends_on")).toBe(`rgba(${INDIGO_RGB.highlight}, 0.62)`);
  });
});
