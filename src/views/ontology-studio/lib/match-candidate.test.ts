import { describe, expect, it } from "vitest";

import type { CreateCandidate } from "./build-create-node";
import { candidateMatches, normalizeForMatch, rankCandidates } from "./match-candidate";

const LOCALIZED: CreateCandidate = {
  id: "element:example-element",
  // 화면에 보이는 이름(현재 로케일).
  title: "예시 구성요소",
  // frontmatter 의 단일 진실원.
  canonicalTitle: "Example element",
  kind: "element",
  ref: "elements/example-element",
};

describe("normalizeForMatch", () => {
  it("대소문자·앞뒤 공백·연속 공백을 접는다", () => {
    expect(normalizeForMatch("  Example   ELEMENT ")).toBe("example element");
  });

  it("NFD 로 들어온 한글을 NFC 로 모은다 — 로컬 vault 파일명/클립보드 대비", () => {
    const nfd = "예시".normalize("NFD");
    expect(normalizeForMatch(nfd)).toBe("예시");
  });
});

describe("candidateMatches", () => {
  it("빈 검색어는 모두 통과 — 발견-우선 목록을 가리지 않는다", () => {
    expect(candidateMatches(LOCALIZED, "")).toBe(true);
    expect(candidateMatches(LOCALIZED, "   ")).toBe(true);
  });

  // #66 의 핵심: 예전엔 표시 이름만 봐서 원문으로는 못 찾았다.
  it("canonical title 로 찾는다 — 표시 이름이 다른 언어여도", () => {
    expect(candidateMatches(LOCALIZED, "Example element")).toBe(true);
    expect(candidateMatches(LOCALIZED, "example ELEMENT")).toBe(true);
  });

  it("표시 이름으로도 찾는다 — 기존 동작 유지", () => {
    expect(candidateMatches(LOCALIZED, "예시")).toBe(true);
  });

  it("ref 슬러그로도 찾는다", () => {
    expect(candidateMatches(LOCALIZED, "elements/example")).toBe(true);
  });

  it("한글 NFD 입력도 찾는다", () => {
    expect(candidateMatches(LOCALIZED, "예시 구성요소".normalize("NFD"))).toBe(true);
  });

  it("아무 데도 없는 말은 안 찾는다", () => {
    expect(candidateMatches(LOCALIZED, "환불")).toBe(false);
  });

  it("canonicalTitle 이 없는(구) 후보도 표시 이름/ref 로 동작한다", () => {
    const legacy = { ...LOCALIZED, canonicalTitle: undefined } as unknown as CreateCandidate;
    expect(candidateMatches(legacy, "예시")).toBe(true);
    expect(candidateMatches(legacy, "Example element")).toBe(false);
  });

  // 흐름 점검 2026-07-26 D1 — 피커와 전역 검색이 같은 이름 규칙을 써야
  // "피커엔 나오는데 검색엔 없다" 는 표면 간 불일치가 안 생긴다.
  it("현재 화면 언어가 아닌 어권 이름으로도 찾는다", () => {
    const bilingual: CreateCandidate = {
      ...LOCALIZED,
      displayLocales: { ko: "예시 구성요소", en: "Sample piece" },
    };
    expect(candidateMatches(bilingual, "sample piece")).toBe(true);
  });
});

describe("rankCandidates", () => {
  const cand = (id: string, title: string, ref = id): CreateCandidate => ({
    id,
    title,
    canonicalTitle: title,
    kind: "capability",
    ref,
  });

  it("정확 일치는 접두 일치들보다 위다 — 풀 순서가 늦어도 (2026-08-13 실측 회귀)", () => {
    // 실측: 스튜디오 검색에 「주문」을 치면 도메인 「주문」이 접두 역량 5개 아래
    // 6위였다 — 필터 → 앞 8개 자르기뿐이라 순위가 아예 없어서, 풀 순서상 늦은
    // 정확 일치는 컷에 잘려 안 보일 수도 있다.
    const pool = [
      cand("cap-checkout", "주문서 작성"),
      cand("cap-cancel", "주문 취소"),
      cand("domain-order", "주문"),
      cand("elem-draft", "주문서 초안"),
    ];
    const r = rankCandidates(pool, "주문", 8).map((c) => c.id);
    expect(r[0]).toBe("domain-order");
  });

  it("접두 일치는 부분 일치보다, 이름 일치는 ref 일치보다 위다", () => {
    const pool = [
      cand("ref-only", "결제 수단", "capabilities/주문-결제"),
      cand("substr", "재주문"),
      cand("prefix", "주문 확정"),
    ];
    const r = rankCandidates(pool, "주문", 8).map((c) => c.id);
    expect(r).toEqual(["prefix", "substr", "ref-only"]);
  });

  it("같은 층 안에서는 풀 순서를 지킨다 (안정 정렬)", () => {
    const pool = [cand("a", "주문 취소"), cand("b", "주문 조회"), cand("c", "주문 확정")];
    expect(rankCandidates(pool, "주문", 8).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("빈 검색어는 풀 순서 그대로 limit 까지", () => {
    const pool = [cand("a", "하나"), cand("b", "둘"), cand("c", "셋")];
    expect(rankCandidates(pool, "", 2).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("limit 은 순위를 매긴 뒤에 자른다 — 정확 일치가 컷에 잘리지 않는다", () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => cand(`p${i}`, `주문 파생 ${i}`)),
      cand("exact", "주문"),
    ];
    const r = rankCandidates(pool, "주문", 8).map((c) => c.id);
    expect(r[0]).toBe("exact");
    expect(r).toHaveLength(8);
  });
});
