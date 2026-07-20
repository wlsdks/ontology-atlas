import { describe, expect, it } from "vitest";
import { shouldShowFocusedCensus } from "./builder-census-label";

describe("shouldShowFocusedCensus", () => {
  it("shows the focused variant when the canvas draws fewer nodes than the vault total", () => {
    expect(
      shouldShowFocusedCensus({ shownCount: 12, totalCount: 128 }),
    ).toBe(true);
  });

  it("stays on the plain total label when the whole graph is drawn (shown === total)", () => {
    expect(
      shouldShowFocusedCensus({ shownCount: 128, totalCount: 128 }),
    ).toBe(false);
  });

  it("shows the canvas count when a draft (unsaved) node pushes the render count above the saved total", () => {
    // B-1: 8 saved + 1 draft on canvas → 9 drawn, must not read as a flat "8".
    expect(
      shouldShowFocusedCensus({ shownCount: 9, totalCount: 8 }),
    ).toBe(true);
  });

  it("stays on the plain total label for an empty vault", () => {
    expect(
      shouldShowFocusedCensus({ shownCount: 0, totalCount: 0 }),
    ).toBe(false);
  });
});
