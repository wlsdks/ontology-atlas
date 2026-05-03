import { describe, expect, it } from "vitest";
import {
  isOntologySubItemActive,
  shouldShowOntologySubNav,
} from "./active-matchers";

describe("isOntologySubItemActive", () => {
  it("exactMatches — 정규화된 pathname 이 정확히 일치할 때 active", () => {
    // 'tree' sub-item: exactMatches=['', '/ontology']
    expect(isOntologySubItemActive("/", ["", "/ontology"], [])).toBe(true);
    expect(isOntologySubItemActive("/ontology", ["", "/ontology"], [])).toBe(
      true,
    );
    expect(isOntologySubItemActive("/ontology/", ["", "/ontology"], [])).toBe(
      true,
    );
    expect(isOntologySubItemActive("/topology", ["", "/ontology"], [])).toBe(
      false,
    );
  });

  it("prefixMatches — startsWith 로 sub-path 까지 활성", () => {
    // 'builder' sub-item: prefixMatches=['/ontology/edit']
    expect(
      isOntologySubItemActive("/ontology/edit", [], ["/ontology/edit"]),
    ).toBe(true);
    expect(
      isOntologySubItemActive("/ontology/edit/", [], ["/ontology/edit"]),
    ).toBe(true);
    expect(
      isOntologySubItemActive("/ontology/edit/foo", [], ["/ontology/edit"]),
    ).toBe(true);
    expect(
      isOntologySubItemActive("/ontology", [], ["/ontology/edit"]),
    ).toBe(false);
  });

  it("exactMatches 우선 — exact 매칭이면 prefix 안 봐도 true", () => {
    // 미스매칭일 때만 prefix 평가
    expect(
      isOntologySubItemActive("/ontology", ["/ontology"], ["/never-match"]),
    ).toBe(true);
  });

  it("둘 다 빈 배열 → 안전 false", () => {
    expect(isOntologySubItemActive("/", [], [])).toBe(false);
    expect(isOntologySubItemActive("/ontology", [], [])).toBe(false);
  });
});

describe("shouldShowOntologySubNav", () => {
  it("/ → true (RootEntry → OntologyView 인 경우)", () => {
    expect(shouldShowOntologySubNav("/")).toBe(true);
    expect(shouldShowOntologySubNav("")).toBe(true);
  });

  it("/ontology + sub-routes → true", () => {
    expect(shouldShowOntologySubNav("/ontology")).toBe(true);
    expect(shouldShowOntologySubNav("/ontology/")).toBe(true);
    expect(shouldShowOntologySubNav("/ontology/edit")).toBe(true);
    expect(shouldShowOntologySubNav("/ontology/insights")).toBe(true);
  });

  it("그 외 surface → false", () => {
    expect(shouldShowOntologySubNav("/topology")).toBe(false);
    expect(shouldShowOntologySubNav("/docs")).toBe(false);
    expect(shouldShowOntologySubNav("/projects")).toBe(false);
    expect(shouldShowOntologySubNav("/project/foo")).toBe(false);
  });
});
