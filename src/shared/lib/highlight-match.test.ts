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

  // 착지 결함 (P1 검수) — 문서 본문은 ~80자에서 줄바꿈된다(AGENTS.md 컨벤션).
  // 사용자가 타이핑한 구절 쿼리의 공백이 실제로는 소스의 줄바꿈일 수 있다.
  // 리터럴 substring 매칭은 이 경우 0건이라 mark 가 안 생기고 스크롤도
  // 무산됐다 — 공백 런(스페이스/개행/탭)을 유연하게 매치해야 한다.
  it("멀티 토큰 쿼리는 소스의 줄바꿈도 공백처럼 매치한다 (줄-랩 구절)", () => {
    const text = "Give it a local, git-backed\nmental model it can read.";
    const segs = splitHighlightSegments(text, "git-backed mental model");
    const matched = segs.filter((s) => s.match).map((s) => s.text);
    expect(matched).toEqual(["git-backed\nmental model"]);
    // 무손실 재조합 계약은 공백-유연 매칭에서도 유지.
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });

  it("멀티 토큰 쿼리는 연속 다중 공백/탭도 매치한다", () => {
    const text = "before  needle\tphrase  after";
    const segs = splitHighlightSegments(text, "needle phrase");
    expect(segs.filter((s) => s.match).map((s) => s.text)).toEqual([
      "needle\tphrase",
    ]);
  });

  it("멀티 토큰이어도 특수문자는 여전히 리터럴 이스케이프", () => {
    const segs = splitHighlightSegments("a.b c(d)", "a.b c(d)");
    expect(segs.filter((s) => s.match).map((s) => s.text)).toEqual([
      "a.b c(d)",
    ]);
  });

  it("모든 occurrence 매치 — 멀티 토큰도 전역 매치", () => {
    const text = "needle phrase here, another needle phrase there";
    const segs = splitHighlightSegments(text, "needle phrase");
    expect(segs.filter((s) => s.match)).toHaveLength(2);
  });
});
