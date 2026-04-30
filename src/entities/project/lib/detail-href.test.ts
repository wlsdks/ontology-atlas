import { describe, expect, it } from "vitest";
import { getProjectDetailHref, getProjectDetailUrl } from "./detail-href";

describe("getProjectDetailHref", () => {
  it("builds the canonical path route for project detail pages", () => {
    expect(getProjectDetailHref("gemma4")).toBe("/project/gemma4/");
  });

  it("appends the account query when provided", () => {
    expect(getProjectDetailHref("gemma4", "sandbox")).toBe(
      "/project/gemma4/?account=sandbox",
    );
  });

  it("encodes slugs safely within the path segment", () => {
    expect(getProjectDetailHref("alpha beta")).toBe("/project/alpha%20beta/");
  });

  it("builds an absolute detail URL from an origin", () => {
    expect(getProjectDetailUrl("https://project-map.dev", "gemma4")).toBe(
      "https://project-map.dev/project/gemma4/",
    );
  });

  it("builds an absolute detail URL with the account query", () => {
    expect(
      getProjectDetailUrl("https://project-map.dev", "gemma4", "sandbox"),
    ).toBe("https://project-map.dev/project/gemma4/?account=sandbox");
  });

  it("appends the workspace project query when provided", () => {
    expect(getProjectDetailHref("gemma4", null, "narnia")).toBe(
      "/project/gemma4/?pj=narnia",
    );
  });

  it("chains both account and project queries", () => {
    expect(getProjectDetailHref("gemma4", "stark", "narnia")).toBe(
      "/project/gemma4/?account=stark&pj=narnia",
    );
  });
});
