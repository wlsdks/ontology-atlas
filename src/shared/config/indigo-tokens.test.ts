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

  it("brand canonical = #c14a24 (2026-08-18 악센트 교체)", () => {
    expect(INDIGO_BRAND).toBe("#c14a24");
  });

  it("RGB triplet 6 variant 가 hex 와 일치 (lowercase)", () => {
    const expected: Record<keyof typeof INDIGO_RGB, string> = {
      brand: "193, 74, 36", // c1=193, 4a=74, 24=36
      accent: "240, 137, 78", // f0=240, 89=137, 4e=78
      hover: "245, 160, 107", // f5=245, a0=160, 6b=107
      hub: "199, 97, 63", // c7=199, 61=97, 3f=63
      focus: "218, 113, 78", // da=218, 71=113, 4e=78
      highlight: "242, 127, 89", // f2=242, 7f=127, 59=89
    };
    expect(INDIGO_RGB).toEqual(expected);
  });

  describe("indigoRgba()", () => {
    it("variant + alpha 조합으로 rgba 문자열 합성", () => {
      expect(indigoRgba("highlight", 0.95)).toBe("rgba(242, 127, 89, 0.95)");
      expect(indigoRgba("brand", 0.14)).toBe("rgba(193, 74, 36, 0.14)");
    });

    it("alpha 0 / 1 경계", () => {
      expect(indigoRgba("brand", 0)).toBe("rgba(193, 74, 36, 0)");
      expect(indigoRgba("brand", 1)).toBe("rgba(193, 74, 36, 1)");
    });
  });
});
