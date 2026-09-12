import { describe, expect, it } from "vitest";

import { cssLengthToPx, DEFAULT_ROOT_FONT_PX } from "./root-font-size";

/**
 * The defect this helper exists for, written as a test: `Number.parseFloat("0.6875rem")` is
 * **0.6875** — finite, positive, and off by a factor of sixteen. Every guard a caller writes
 * against a bad token (`Number.isFinite`, `> 0`) passes on it, so the canvas that reads
 * `--text-label` drew its names at two thirds of a pixel and threw nothing.
 */
describe("cssLengthToPx", () => {
  it("resolves rem against the root, which is the whole point", () => {
    expect(cssLengthToPx("0.6875rem", 16)).toBeCloseTo(11, 10);
    expect(cssLengthToPx("0.6875rem", 32)).toBeCloseTo(22, 10);
    expect(cssLengthToPx("0.59375rem", 16)).toBeCloseTo(9.5, 10);
    expect(cssLengthToPx("1rem", 16)).toBe(16);
  });

  it("leaves px alone at every root", () => {
    expect(cssLengthToPx("11px", 16)).toBe(11);
    expect(cssLengthToPx("11px", 32)).toBe(11);
    expect(cssLengthToPx(" 36px ", 32)).toBe(36);
  });

  it("reads a bare number as pixels — what every historical caller meant", () => {
    expect(cssLengthToPx("12", 16)).toBe(12);
  });

  it("refuses em rather than guessing — it resolves against a parent this cannot see", () => {
    // Returning a number here would be the same class of defect as the one above: quietly
    // plausible and wrong. `NaN` fails at the caller's own guard, where the token is named.
    expect(cssLengthToPx("0.6875em", 16)).toBeNaN();
    expect(cssLengthToPx("2em", 32)).toBeNaN();
  });

  it("returns NaN for a value that is not a length at all", () => {
    expect(cssLengthToPx("", 16)).toBeNaN();
    expect(cssLengthToPx("inherit", 16)).toBeNaN();
  });

  it("defaults the root to 16, the value a browser starts at", () => {
    expect(DEFAULT_ROOT_FONT_PX).toBe(16);
    expect(cssLengthToPx("0.6875rem")).toBeCloseTo(11, 10);
  });
});
