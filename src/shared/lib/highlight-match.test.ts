import { describe, expect, it } from "vitest";
import { splitHighlightSegments } from "./highlight-match";

describe("splitHighlightSegments", () => {
  it("빈 query → 전체 단일 비매치 세그먼트", () => {
    expect(splitHighlightSegments("Auth Service", "")).toEqual([
      { text: "Auth Service", match: false },
    ]);
    expect(splitHighlightSegments("Auth Service", "   ")).toEqual([
      { text: "Auth Service", match: false },
    ]);
  });

  it("매치 없음 → 전체 단일 비매치 세그먼트", () => {
    expect(splitHighlightSegments("Auth Service", "zzz")).toEqual([
      { text: "Auth Service", match: false },
    ]);
  });

  it("대소문자 무시하고 원본 대소문자 보존하며 매치 분절", () => {
    expect(splitHighlightSegments("Authentication", "auth")).toEqual([
      { text: "Auth", match: true },
      { text: "entication", match: false },
    ]);
  });

  it("중간 매치 — 앞/매치/뒤 3 세그먼트", () => {
    expect(splitHighlightSegments("login flow", "in")).toEqual([
      { text: "log", match: false },
      { text: "in", match: true },
      { text: " flow", match: false },
    ]);
  });

  it("모든 occurrence 매치", () => {
    expect(splitHighlightSegments("aXaXa", "a")).toEqual([
      { text: "a", match: true },
      { text: "X", match: false },
      { text: "a", match: true },
      { text: "X", match: false },
      { text: "a", match: true },
    ]);
  });

  it("정규식 특수문자도 리터럴로 안전 매칭", () => {
    expect(splitHighlightSegments("a.b.c", ".")).toEqual([
      { text: "a", match: false },
      { text: ".", match: true },
      { text: "b", match: false },
      { text: ".", match: true },
      { text: "c", match: false },
    ]);
  });

  it("매치 세그먼트 텍스트를 join 하면 원본과 동일(손실 없음)", () => {
    const segs = splitHighlightSegments("Capability: token issue", "token");
    expect(segs.map((s) => s.text).join("")).toBe("Capability: token issue");
  });
});
