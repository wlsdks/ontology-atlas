import { describe, expect, it } from "vitest";
import { shouldShowFocusedCensus } from "./builder-census-label";

describe("shouldShowFocusedCensus", () => {
  it("shows the focused variant when the canvas draws fewer nodes than the vault total", () => {
    expect(
      shouldShowFocusedCensus({ isFocused: true, shownCount: 12, totalCount: 128 }),
    ).toBe(true);
  });

  it("stays on the plain total label when there is no focus (whole graph drawn)", () => {
    expect(
      shouldShowFocusedCensus({ isFocused: false, shownCount: 128, totalCount: 128 }),
    ).toBe(false);
  });

  it("stays on the plain total label when the focused subset happens to equal the total (no noisy '128 of 128')", () => {
    expect(
      shouldShowFocusedCensus({ isFocused: true, shownCount: 128, totalCount: 128 }),
    ).toBe(false);
  });

  it("stays on the plain total label for an empty vault", () => {
    expect(
      shouldShowFocusedCensus({ isFocused: false, shownCount: 0, totalCount: 0 }),
    ).toBe(false);
  });
});
