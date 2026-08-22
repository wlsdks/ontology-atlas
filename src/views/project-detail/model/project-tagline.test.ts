import { describe, expect, it } from "vitest";
import { resolveProjectTagline } from "./project-tagline";

describe("resolveProjectTagline — 히어로 한 줄 정의", () => {
  it("frontmatter 설명이 있으면 그걸 쓴다", () => {
    expect(
      resolveProjectTagline({ description: "주문부터 배송까지 잇는 커머스 지도입니다." }),
    ).toBe("주문부터 배송까지 잇는 커머스 지도입니다.");
  });

  it("설명이 없으면 본문 발췌로 떨어진다", () => {
    expect(
      resolveProjectTagline({
        description: null,
        excerpt: "이 프로젝트는 고객 주문을 재고와 배송까지 잇습니다. 그리고 두 번째 문장.",
      }),
    ).toBe("이 프로젝트는 고객 주문을 재고와 배송까지 잇습니다.");
  });

  // A first sentence that is too short (under 20 characters) does not represent the definition, so it is
  // not treated as a sentence and the next one is appended — the existing contract of
  // `compactOntologyDescription`.
  it("첫 문장이 너무 짧으면 거기서 끊지 않는다", () => {
    expect(resolveProjectTagline({ description: "짧다. 이어지는 설명이 본체다." })).toBe(
      "짧다. 이어지는 설명이 본체다.",
    );
  });

  // Measured defect: the hero passed a 320-character excerpt straight through and cut **mid-word**, as in
  // "…이 프로젝트의 ontology 는 비즈니". It has to end at a sentence boundary.
  it("어절 중간에서 자르지 않는다 — 문장 경계에서 끝난다", () => {
    const long =
      "마크다운에서 자라는 오픈소스 온톨로지 워크벤치입니다. " +
      "사람과 AI 가 같이 코드베이스의 뜻을 저작합니다. " +
      "그리고 세 번째 문장이 더 이어집니다.";
    const out = resolveProjectTagline({ description: long })!;
    expect(out).toBe("마크다운에서 자라는 오픈소스 온톨로지 워크벤치입니다.");
    expect(out.endsWith("비즈니")).toBe(false);
  });

  it("문장 부호가 없는 긴 글은 말줄임으로 닫는다 — 열린 채 끊기지 않는다", () => {
    const out = resolveProjectTagline({ description: "가".repeat(400) })!;
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("...")).toBe(true);
  });

  it("둘 다 비면 undefined — 화면이 문장을 지어내지 않는다", () => {
    expect(resolveProjectTagline({ description: null, excerpt: null })).toBeUndefined();
    expect(resolveProjectTagline({ description: "   ", excerpt: "" })).toBeUndefined();
  });

  it("설명이 공백뿐이면 발췌로 넘어간다", () => {
    expect(resolveProjectTagline({ description: "  ", excerpt: "발췌가 대신 나온다." })).toBe(
      "발췌가 대신 나온다.",
    );
  });
});
