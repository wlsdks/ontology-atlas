import { describe, expect, it } from "vitest";

import { edgeSentenceValues, normalizeEdgeSentenceKey } from "./edge-sentence";

describe("normalizeEdgeSentenceKey", () => {
  it("folds the containment synonyms onto one key and leaves the rest as related", () => {
    for (const type of ["contains", "elements", "capabilities", "domains", "domain"]) {
      expect(normalizeEdgeSentenceKey(type)).toBe("contains");
    }
    expect(normalizeEdgeSentenceKey("dependencies")).toBe("depends");
    expect(normalizeEdgeSentenceKey("depends_on")).toBe("depends");
    expect(normalizeEdgeSentenceKey("describes")).toBe("describes");
    expect(normalizeEdgeSentenceKey("belongs_to")).toBe("belongsTo");
    expect(normalizeEdgeSentenceKey("related_to")).toBe("related");
  });
});

describe("edgeSentenceValues — Korean particles follow the final consonant", () => {
  it("contains: 온라인 쇼핑몰이 배송을", () => {
    expect(edgeSentenceValues("contains", "온라인 쇼핑몰", "배송")).toEqual({
      from: "온라인 쇼핑몰",
      to: "배송",
      fromJosa: "이",
      toJosa: "을",
    });
    expect(edgeSentenceValues("contains", "결제", "환불 처리")).toMatchObject({ fromJosa: "가", toJosa: "를" });
  });

  it("depends and describes: only the subject particle varies", () => {
    expect(edgeSentenceValues("depends", "주문", "결제")).toMatchObject({ fromJosa: "이", toJosa: "" });
    expect(edgeSentenceValues("describes", "근거", "배송")).toMatchObject({ fromJosa: "가", toJosa: "" });
  });

  it("belongsTo takes the topic particle, related the with/subject pair", () => {
    expect(edgeSentenceValues("belongsTo", "배송", "온라인 쇼핑몰")).toMatchObject({ fromJosa: "은", toJosa: "" });
    expect(edgeSentenceValues("related", "회원", "마케팅")).toMatchObject({ fromJosa: "과", toJosa: "이" });
  });

  it("a Latin name keeps both forms, because no final consonant can be read", () => {
    expect(edgeSentenceValues("contains", "Storefront", "Fulfillment")).toMatchObject({ fromJosa: "이(가)", toJosa: "을(를)" });
  });
});
