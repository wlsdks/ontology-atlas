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
    expect(
      isBottomTabActive("/en/ontology", "/", ["/ontology"]),
    ).toBe(true);
    expect(isBottomTabActive("/topology", "/", ["/ontology"])).toBe(false);
  });

  it("topology 탭 — /topology prefix", () => {
    expect(isBottomTabActive("/topology", "/topology/", ["/topology"])).toBe(true);
    expect(isBottomTabActive("/ko/topology", "/topology/", ["/topology"])).toBe(true);
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
    // A tab with no prefixes
    expect(isBottomTabActive("/projects/", "/projects/", [])).toBe(true);
    // Trailing-slash variants match
    expect(isBottomTabActive("/projects", "/projects/", [])).toBe(true);
    // Any other path is false
    expect(isBottomTabActive("/docs", "/projects/", [])).toBe(false);
  });

  it("home 탭 ('/') — 다른 path 에서는 prefix 아니면 false", () => {
    // A home tab with no matchPrefixes
    expect(isBottomTabActive("/docs", "/", [])).toBe(false);
  });
});

describe("shouldHideBottomTabBar", () => {
  it("hides mobile app navigation only on the standalone /download page", () => {
    expect(shouldHideBottomTabBar("/download", false)).toBe(true);
    expect(shouldHideBottomTabBar("/en/download", false)).toBe(true);
    expect(shouldHideBottomTabBar("/download/", true)).toBe(true);
  });

  it("keeps mobile app navigation on the root topology hub (root-first-open) even with no vault", () => {
    // Regression: root-first-open made `/` the topology hub (dogfood sample +
    // first-run starter), not a marketing page. Hiding the tab bar here left
    // tablet/mobile first-run visitors with zero global nav.
    expect(shouldHideBottomTabBar("/", false)).toBe(false);
    expect(shouldHideBottomTabBar("/", true)).toBe(false);
    expect(shouldHideBottomTabBar("/docs", false)).toBe(false);
  });
});
