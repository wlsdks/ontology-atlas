import { describe, expect, it } from "vitest";
import { isBottomTabActive, shouldHideBottomTabBar } from "./is-tab-active";

describe("isBottomTabActive", () => {
  it('marks the home tab active on /', () => {
    expect(
      isBottomTabActive("/", "/", ["/ontology"]),
    ).toBe(true);
  });

  it('marks the ontology tab active on /ontology sub-surfaces', () => {
    expect(
      isBottomTabActive("/ontology", "/", ["/ontology"]),
    ).toBe(true);
    expect(
      isBottomTabActive("/en/ontology", "/", ["/ontology"]),
    ).toBe(true);
    expect(isBottomTabActive("/topology", "/", ["/ontology"])).toBe(false);
  });

  it('marks the topology tab active under the /topology prefix', () => {
    expect(isBottomTabActive("/topology", "/topology/", ["/topology"])).toBe(true);
    expect(isBottomTabActive("/ko/topology", "/topology/", ["/topology"])).toBe(true);
    expect(
      isBottomTabActive("/topology/?p=foo", "/topology/", ["/topology"]),
    ).toBe(true);
  });

  it('marks the projects tab active under both /projects and /project', () => {
    expect(
      isBottomTabActive("/projects", "/projects/", ["/projects", "/project"]),
    ).toBe(true);
    expect(
      isBottomTabActive("/project/foo", "/projects/", ["/projects", "/project"]),
    ).toBe(true);
  });

  it('marks the docs tab active under the /docs prefix', () => {
    expect(isBottomTabActive("/docs", "/docs/", ["/docs"])).toBe(true);
    expect(isBottomTabActive("/docs/?slug=x", "/docs/", ["/docs"])).toBe(true);
  });

  it('falls back to an exact href match when no prefix rule applies', () => {
    expect(isBottomTabActive("/projects/", "/projects/", [])).toBe(true);
    expect(isBottomTabActive("/projects", "/projects/", [])).toBe(true);
    expect(isBottomTabActive("/docs", "/projects/", [])).toBe(false);
  });

  it('keeps the home tab inactive on other paths', () => {
    expect(isBottomTabActive("/docs", "/", [])).toBe(false);
  });
});

describe("shouldHideBottomTabBar", () => {
  it("hides the bar on /download only, whether or not a vault is loaded", () => {
    expect(shouldHideBottomTabBar("/", true)).toBe(false);
    expect(shouldHideBottomTabBar("/download", true)).toBe(true);
  });
});
