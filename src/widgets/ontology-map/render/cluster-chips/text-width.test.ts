import { describe, expect, it } from "vitest";

import { estimateCanvasTextWidth } from "./text-width";

describe("estimateCanvasTextWidth", () => {
  it("weighs a character by its class: wide glyphs, spaces, digits, capitals and the rest", () => {
    expect(estimateCanvasTextWidth("가", 10)).toBeCloseTo(9.2, 6);
    expect(estimateCanvasTextWidth("字", 10)).toBeCloseTo(9.2, 6);
    expect(estimateCanvasTextWidth(" ", 10)).toBeCloseTo(3.2, 6);
    expect(estimateCanvasTextWidth("7", 10)).toBeCloseTo(6.2, 6);
    expect(estimateCanvasTextWidth("A", 10)).toBeCloseTo(7.2, 6);
    expect(estimateCanvasTextWidth("a", 10)).toBeCloseTo(5.8, 6);
  });

  it("scales with the font size and sums over code points, so a surrogate pair is one cell", () => {
    expect(estimateCanvasTextWidth("aA", 20)).toBeCloseTo(26, 6);
    expect(estimateCanvasTextWidth("\u{1F600}", 10)).toBeCloseTo(5.8, 6);
  });
});
