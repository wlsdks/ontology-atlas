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

  // 착지 결함 (최종 라이브 스윕 P2) — search.ts 의 searchDocs 는 멀티 토큰
  // 쿼리를 AND 매치로 취급한다: 각 토큰이 문서 어딘가(제목/발췌/본문 등)에
  // 있기만 하면 히트로 인정하고, 본문에서 구절이 실제로 안 이어지면
  // bodyTierScore(최하위 티어)로 채점한다 — 구절 존재를 요구하지 않는다.
  // 하지만 뷰어 하이라이트(splitHighlightSegments)는 지금까지 구절 전체가
  // 어딘가에 연속으로 있어야만 매치를 인정했다 — 두 계약이 어긋나면
  // "검색은 매치라고 판단했는데 뷰어엔 mark 가 0개"인 착지 결함이 난다.
  // (재현: `/ko/docs/` → "관계 타입" 검색 → CLI Developer Entry 본문
  // 매치 결과 클릭 → scrollTop 0, mark 0개. "관계 타입" 구절은 그 문서
  // 어디에도 연속으로 존재하지 않지만 "관계"와 "타입" 토큰은 각각 존재.)
  it("멀티 토큰 쿼리 — 구절이 어디에도 연속으로 없으면 개별 토큰을 OR 로 매치(스캐터드 AND 매치 착지)", () => {
    const text = "이 관계는 유용하다. 나중에 타입을 정의한다.";
    // "관계 타입" 구절은 이 텍스트 어디에도 연속으로 존재하지 않는다.
    const segs = splitHighlightSegments(text, "관계 타입");
    const matched = segs.filter((s) => s.match).map((s) => s.text);
    expect(matched).toEqual(["관계", "타입"]);
    // 무손실 재조합 계약 유지.
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
    // "관계 타입" 이 연속으로 존재하면 (설령 개별 토큰이 다른 곳에 더 있어도)
    // 기존 구절-매치 경로가 우선한다 — 오늘 이미 고친 줄바꿈 유연 매칭 회귀 방지.
    const text = "먼저 관계 타입 순서로 쓴다. 그리고 타입만 다시 언급.";
    const segs = splitHighlightSegments(text, "관계 타입");
    const matched = segs.filter((s) => s.match).map((s) => s.text);
    expect(matched).toEqual(["관계 타입"]);
  });
});
