import { describe, expect, it } from "vitest";

import { facesForText, parseUnicodeRange, type GlyphFace } from "./product-glyphs";

const face = (family: string, unicodeRange: string): GlyphFace => ({ family, unicodeRange, status: "unloaded", load: async () => undefined });

describe("facesForText", () => {
  const latin = face("'latin'", "U+0-7F");
  const hangulA = face('"Pretendard Variable"', "U+AC00-B000");
  const hangulB = face('"Pretendard Variable"', "U+B001-D7A3");
  const whole = face("whole", "U+0-10FFFF");
  const faces = [latin, hangulA, hangulB, whole];
  const stack = `'latin', "Pretendard Variable", whole, system-ui, sans-serif`;

  it("takes each character from the first family that covers it, so the whole file stays unfetched", () => {
    expect(facesForText(stack, faces, "Atlas 가")).toEqual([latin, hangulA]);
    expect(facesForText(stack, faces, "지도")).toEqual([hangulB]);
  });

  it("reaches the whole file only for a character no subset carries", () => {
    expect(facesForText(stack, faces, "é")).toEqual([whole]);
  });

  it("stops at an installed family, which draws what it has", () => {
    expect(facesForText(`'latin', "Hiragino Sans", whole`, faces, "かな")).toEqual([]);
  });
});

describe("parseUnicodeRange", () => {
  it("reads single points, spans and wildcards", () => {
    expect(parseUnicodeRange("U+0-FF, U+131, u+4??")).toEqual([[0, 0xff], [0x131, 0x131], [0x400, 0x4ff]]);
  });
});
