import { describe, expect, it } from "vitest";
import { INDIGO_RGB } from "@/shared/config/indigo-tokens";
import { RELATION_TYPE_MIN_ALPHA, relationTypeAlpha, relationTypeIndigo } from "./relation-type-tone";

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
  it("ranks containment strongest, then depends_on, then the rest", () => {
    expect(relationTypeAlpha("contains")).toBeGreaterThan(relationTypeAlpha("depends_on"));
    expect(relationTypeAlpha("belongs_to")).toBeGreaterThan(relationTypeAlpha("depends_on"));
    expect(relationTypeAlpha("depends_on")).toBeGreaterThan(relationTypeAlpha("describes"));
    expect(relationTypeAlpha("depends_on")).toBeGreaterThan(relationTypeAlpha("related_to"));
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
    expect(relationTypeIndigo("related_to")).toBe(`rgba(${INDIGO_RGB.highlight}, 0.62)`);
  });
});
