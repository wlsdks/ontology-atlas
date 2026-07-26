import { describe, expect, it } from "vitest";

import type { CreateCandidate } from "./build-create-node";
import { candidateMatches, normalizeForMatch } from "./match-candidate";

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
