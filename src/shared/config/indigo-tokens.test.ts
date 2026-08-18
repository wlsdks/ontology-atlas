import { describe, expect, it } from "vitest";
import {
  INDIGO_ACCENT,
  INDIGO_BRAND,
  INDIGO_FOCUS,
  INDIGO_HIGHLIGHT,
  INDIGO_HOVER,
  INDIGO_HUB,
  INDIGO_RGB,
  indigoRgba,
} from "./indigo-tokens";

/**
 * indigo-tokens 단일 진실원 — 헌장 §11 의 "단일 인디고" 약속과 정합.
 */
describe("indigo-tokens", () => {
  it("hex 6 variant 가 정의되고 모두 7자 hex 형식", () => {
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

  it("brand canonical = #5e6ad2 (CLAUDE.md §11)", () => {
    expect(INDIGO_BRAND).toBe("#5e6ad2");
  });

  it("RGB triplet 6 variant 가 hex 와 일치 (lowercase)", () => {
    const expected: Record<keyof typeof INDIGO_RGB, string> = {
      brand: "94, 106, 210", // 5e=94, 6a=106, d2=210
      accent: "113, 112, 255", // 71=113, 70=112, ff=255
      hover: "130, 143, 255", // 82=130, 8f=143, ff=255
      hub: "108, 119, 212", // 6c=108, 77=119, d4=212
      focus: "124, 135, 230", // 7c=124, 87=135, e6=230
      highlight: "139, 151, 255", // 8b=139, 97=151, ff=255
    };
    expect(INDIGO_RGB).toEqual(expected);
  });

  describe("indigoRgba()", () => {
    it("variant + alpha 조합으로 rgba 문자열 합성", () => {
      expect(indigoRgba("highlight", 0.95)).toBe("rgba(139, 151, 255, 0.95)");
      expect(indigoRgba("brand", 0.14)).toBe("rgba(94, 106, 210, 0.14)");
    });

    it("alpha 0 / 1 경계", () => {
      expect(indigoRgba("brand", 0)).toBe("rgba(94, 106, 210, 0)");
      expect(indigoRgba("brand", 1)).toBe("rgba(94, 106, 210, 1)");
    });
  });
});
