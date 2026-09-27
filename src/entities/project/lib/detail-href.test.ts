import { describe, expect, it } from "vitest";
import {
  getProjectDetailHref,
  getProjectDetailUrl,
  getProjectEditHref,
  getProjectRuntimeDetailHref,
  getProjectRuntimeDetailUrl,
  resolveProjectFallbackRoute,
} from "./detail-href";

describe("getProjectDetailHref", () => {
  it("builds /project/<encoded-slug>/", () => {
    expect(getProjectDetailHref("foo")).toBe("/project/foo/");
  });

  it("escapes URL-unsafe characters", () => {
    expect(getProjectDetailHref("a/b")).toBe("/project/a%2Fb/");
    expect(getProjectDetailHref("foo bar")).toBe("/project/foo%20bar/");
    expect(getProjectDetailHref("한글")).toBe(
      `/project/${encodeURIComponent("한글")}/`,
    );
  });

  it("keeps an empty slug", () => {
    expect(getProjectDetailHref("")).toBe("/project//");
  });
});

describe("getProjectDetailUrl", () => {
  it("origin + canonical path", () => {
    expect(getProjectDetailUrl("https://example.com", "foo")).toBe(
      "https://example.com/project/foo/",
    );
  });

  it("normalizes a trailing slash on origin", () => {
    expect(getProjectDetailUrl("https://example.com/", "foo")).toBe(
      "https://example.com/project/foo/",
    );
  });

  it("encodes the path segment", () => {
    expect(getProjectDetailUrl("https://example.com", "한글")).toBe(
      `https://example.com/project/${encodeURIComponent("한글")}/`,
    );
  });
});

describe("static-export-safe project routes", () => {
  it("sends an arbitrary runtime slug through the static fallback query", () => {
    expect(getProjectRuntimeDetailHref("foo")).toBe(
      "/project/fallback/?slug=foo",
    );
    expect(getProjectRuntimeDetailHref("a/b")).toBe(
      "/project/fallback/?slug=a%2Fb",
    );
    expect(getProjectRuntimeDetailHref("한글 프로젝트")).toBe(
      `/project/fallback/?${new URLSearchParams({
        slug: "한글 프로젝트",
      }).toString()}`,
    );
  });

  it("includes locale and basePath in the runtime detail URL", () => {
    expect(
      getProjectRuntimeDetailUrl("https://example.com/", "foo", {
        locale: "ko",
        basePath: "/ontology-atlas/",
      }),
    ).toBe(
      "https://example.com/ontology-atlas/ko/project/fallback/?slug=foo",
    );
  });

  it("keeps slug, return path and save notice in the full-edit fallback", () => {
    expect(
      getProjectEditHref("foo", {
        returnTo: "/project/fallback/?slug=foo",
        savedNotice: true,
      }),
    ).toBe(
      "/project/fallback/?slug=foo&mode=edit&returnTo=%2Fproject%2Ffallback%2F%3Fslug%3Dfoo&saved=1",
    );
  });
});

describe("resolveProjectFallbackRoute", () => {
  it("parses the query detail path", () => {
    expect(
      resolveProjectFallbackRoute(
        "/ko/project/fallback/",
        "?slug=%ED%95%9C%EA%B8%80+%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8",
      ),
    ).toEqual({
      mode: "detail",
      slug: "한글 프로젝트",
      returnTo: undefined,
      savedNotice: false,
    });
  });

  it("parses the query full-edit state", () => {
    expect(
      resolveProjectFallbackRoute(
        "/en/project/fallback/",
        "?slug=foo&mode=edit&returnTo=%2Fprojects%2F&saved=1",
      ),
    ).toEqual({
      mode: "edit",
      slug: "foo",
      returnTo: "/projects/",
      savedNotice: true,
    });
  });

  it("still parses legacy rewritten detail and edit pathnames", () => {
    expect(resolveProjectFallbackRoute("/ko/project/foo/", "")).toEqual({
      mode: "detail",
      slug: "foo",
      returnTo: undefined,
      savedNotice: false,
    });
    expect(
      resolveProjectFallbackRoute(
        "/ko/project/foo/edit/",
        "?returnTo=%2Fprojects%2F",
      ),
    ).toEqual({
      mode: "edit",
      slug: "foo",
      returnTo: "/projects/",
      savedNotice: false,
    });
  });

  it("rejects a direct fallback, empty slug or broken escape", () => {
    expect(resolveProjectFallbackRoute("/ko/project/fallback/", "")).toBeNull();
    expect(
      resolveProjectFallbackRoute("/ko/project/fallback/", "?slug="),
    ).toBeNull();
    expect(resolveProjectFallbackRoute("/ko/project/%E0%A4%A/", "")).toBeNull();
  });
});
