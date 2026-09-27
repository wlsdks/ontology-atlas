import { describe, expect, it } from "vitest";
import {
  INDIGO_ACCENT,
  INDIGO_BRAND,
  INDIGO_FOCUS,
  INDIGO_HIGHLIGHT,
  INDIGO_HOVER,
  INDIGO_HUB,
  indigoRgba,
} from "./indigo-tokens";

/** indigo-tokens is the single source of truth, matching the charter §11 "one indigo" promise. */
describe("indigo-tokens", () => {
  it("defines six variants, each a 7-character lowercase hex", () => {
    const all = [
      INDIGO_BRAND,
      INDIGO_ACCENT,
      INDIGO_HOVER,
      INDIGO_HUB,
      INDIGO_FOCUS,
      INDIGO_HIGHLIGHT,
    ];
    for (const hex of all) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  describe("indigoRgba()", () => {
    it("composes an rgba string from a variant and an alpha", () => {
      expect(indigoRgba("highlight", 0.95)).toBe("rgba(139, 151, 255, 0.95)");
      expect(indigoRgba("brand", 0.14)).toBe("rgba(94, 106, 210, 0.14)");
    });

    it("accepts the alpha bounds 0 and 1", () => {
      expect(indigoRgba("brand", 0)).toBe("rgba(94, 106, 210, 0)");
      expect(indigoRgba("brand", 1)).toBe("rgba(94, 106, 210, 1)");
    });
  });
});
