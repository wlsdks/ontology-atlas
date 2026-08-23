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

  // Landing defect: document bodies wrap around 80 characters (the AGENTS.md
  // convention), so a space in a phrase the user typed may be a newline in the
  // source. Literal substring matching found 0 hits there, producing no marks and no
  // scroll — whitespace runs (space, newline, tab) must match flexibly.
  it("멀티 토큰 쿼리는 소스의 줄바꿈도 공백처럼 매치한다 (줄-랩 구절)", () => {
    const text = "Give it a local, git-backed\nmental model it can read.";
    const segs = splitHighlightSegments(text, "git-backed mental model");
    const matched = segs.filter((s) => s.match).map((s) => s.text);
    expect(matched).toEqual(["git-backed\nmental model"]);
    // The lossless-rejoin contract holds under whitespace-flexible matching too.
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

  // Landing defect: `searchDocs` in search.ts treats a multi-token query as an AND
  // match — every token merely has to appear somewhere in the document (title,
  // excerpt, body) to count as a hit, scored at bodyTierScore when the phrase is not
  // contiguous. It never requires the phrase to exist. Viewer highlighting
  // (splitHighlightSegments) used to require the whole phrase contiguously, and when
  // the two contracts disagree the result is "search says it matched but the viewer
  // shows 0 marks".
  //
  // Repro: `/ko/docs/` → search "Relationship type" → click the CLI Developer Entry body
  // match → scrollTop 0, 0 marks. That phrase is nowhere contiguous in the document,
  // while the tokens "Relationship" and "type" each occur.
  it("멀티 토큰 쿼리 — 구절이 어디에도 연속으로 없으면 개별 토큰을 OR 로 매치(스캐터드 AND 매치 착지)", () => {
    const text = "이 관계는 유용하다. 나중에 타입을 정의한다.";
    // The phrase "Relationship type" occurs nowhere contiguously in this text.
    const segs = splitHighlightSegments(text, "관계 타입");
    const matched = segs.filter((s) => s.match).map((s) => s.text);
    expect(matched).toEqual(["관계", "타입"]);
    // The lossless-rejoin contract still holds.
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });

  it("멀티 토큰 스캐터드 폴백 — 토큰 중 일부만 존재해도 존재하는 토큰만 매치", () => {
    const text = "관계만 있고 다른 단어는 없다.";
    const segs = splitHighlightSegments(text, "관계 타입");
    const matched = segs.filter((s) => s.match).map((s) => s.text);
    expect(matched).toEqual(["관계"]);
  });

  it("멀티 토큰 스캐터드 폴백 — 토큰이 전혀 없으면 여전히 비매치", () => {
    const text = "아무 관련도 없는 문장이다.";
    const segs = splitHighlightSegments(text, "관계 타입");
    expect(segs).toEqual([{ text, match: false }]);
  });

  it("구절 매치가 있으면 폴백을 타지 않고 구절 그대로 우선한다", () => {
    // When the phrase does occur contiguously the phrase-match path wins, even
    // though the individual tokens also appear elsewhere. Guards the
    // newline-flexible matching above against regression.
    const text = "먼저 관계 타입 순서로 쓴다. 그리고 타입만 다시 언급.";
    const segs = splitHighlightSegments(text, "관계 타입");
    const matched = segs.filter((s) => s.match).map((s) => s.text);
    expect(matched).toEqual(["관계 타입"]);
  });
});
