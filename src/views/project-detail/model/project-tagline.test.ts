import { describe, expect, it } from "vitest";
import { resolveProjectTagline } from "./project-tagline";

describe("resolveProjectTagline: the hero one-line definition", () => {
  it("uses the frontmatter description when present", () => {
    expect(
      resolveProjectTagline({ description: "주문부터 배송까지 잇는 커머스 지도입니다." }),
    ).toBe("주문부터 배송까지 잇는 커머스 지도입니다.");
  });

  it("falls back to the body excerpt without a description", () => {
    expect(
      resolveProjectTagline({
        description: null,
        excerpt: "이 프로젝트는 고객 주문을 재고와 배송까지 잇습니다. 그리고 두 번째 문장.",
      }),
    ).toBe("이 프로젝트는 고객 주문을 재고와 배송까지 잇습니다.");
  });

  // Under 20 characters, per `compactOntologyDescription`.
  it("does not stop at a first sentence that is too short", () => {
    expect(resolveProjectTagline({ description: "짧다. 이어지는 설명이 본체다." })).toBe(
      "짧다. 이어지는 설명이 본체다.",
    );
  });

  it("ends at a sentence boundary, never mid-word", () => {
    const long =
      "마크다운에서 자라는 오픈소스 온톨로지 워크벤치입니다. " +
      "사람과 AI 가 같이 코드베이스의 뜻을 저작합니다. " +
      "그리고 세 번째 문장이 더 이어집니다.";
    const out = resolveProjectTagline({ description: long })!;
    expect(out).toBe("마크다운에서 자라는 오픈소스 온톨로지 워크벤치입니다.");
    expect(out.endsWith("비즈니")).toBe(false);
  });

  it("closes long unpunctuated text with an ellipsis instead of cutting it open", () => {
    const out = resolveProjectTagline({ description: "가".repeat(600) })!;
    expect(out.length).toBeLessThanOrEqual(320);
    expect(out.endsWith("...")).toBe(true);
  });

  it("returns undefined when both are empty, inventing no sentence", () => {
    expect(resolveProjectTagline({ description: null, excerpt: null })).toBeUndefined();
    expect(resolveProjectTagline({ description: "   ", excerpt: "" })).toBeUndefined();
  });

  it("falls back to the excerpt when the description is whitespace", () => {
    expect(resolveProjectTagline({ description: "  ", excerpt: "발췌가 대신 나온다." })).toBe(
      "발췌가 대신 나온다.",
    );
  });
});
