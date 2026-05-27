import { describe, expect, it } from "vitest";
import { isBottomTabActive, shouldHideBottomTabBar } from "./is-tab-active";

describe("isBottomTabActive", () => {
  it("home 탭 ('/') — / 에서 active", () => {
    expect(
      isBottomTabActive("/", "/", ["/ontology"]),
    ).toBe(true);
  });

  it("ontology 탭 — /ontology sub-surface 에서 active", () => {
    expect(
      isBottomTabActive("/ontology", "/", ["/ontology"]),
    ).toBe(true);
    expect(isBottomTabActive("/topology", "/", ["/ontology"])).toBe(false);
  });

  it("topology 탭 — /topology prefix", () => {
    expect(isBottomTabActive("/topology", "/topology/", ["/topology"])).toBe(true);
    expect(
      isBottomTabActive("/topology/?p=foo", "/topology/", ["/topology"]),
    ).toBe(true);
  });

  it("projects 탭 — /projects + /project 둘 다 startsWith", () => {
    expect(
      isBottomTabActive("/projects", "/projects/", ["/projects", "/project"]),
    ).toBe(true);
    expect(
      isBottomTabActive("/project/foo", "/projects/", ["/projects", "/project"]),
    ).toBe(true);
  });

  it("docs 탭 — /docs prefix", () => {
    expect(isBottomTabActive("/docs", "/docs/", ["/docs"])).toBe(true);
    expect(isBottomTabActive("/docs/?slug=x", "/docs/", ["/docs"])).toBe(true);
  });

  it("fallback exact-match — prefix 가 안 잡히면 href 정확 일치만", () => {
    // 가상의 prefix 빈 탭
    expect(isBottomTabActive("/projects/", "/projects/", [])).toBe(true);
    // trailing-slash 변형 호환
    expect(isBottomTabActive("/projects", "/projects/", [])).toBe(true);
    // 다른 path 는 false
    expect(isBottomTabActive("/docs", "/projects/", [])).toBe(false);
  });

  it("home 탭 ('/') — 다른 path 에서는 prefix 아니면 false", () => {
    // matchPrefixes 빈 가상의 home 탭
    expect(isBottomTabActive("/docs", "/", [])).toBe(false);
  });
});

describe("shouldHideBottomTabBar", () => {
  it("hides mobile app navigation on public marketing and download pages", () => {
    expect(shouldHideBottomTabBar("/", false)).toBe(true);
    expect(shouldHideBottomTabBar("/download", false)).toBe(true);
    expect(shouldHideBottomTabBar("/download/", true)).toBe(true);
  });

  it("keeps mobile app navigation once the root is an active local workspace", () => {
    expect(shouldHideBottomTabBar("/", true)).toBe(false);
    expect(shouldHideBottomTabBar("/docs", false)).toBe(false);
  });
});
