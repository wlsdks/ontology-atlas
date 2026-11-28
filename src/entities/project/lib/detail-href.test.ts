import { describe, expect, it } from "vitest";
import {
  buildProjectEditHref,
  buildProjectRuntimeDetailHref,
  buildProjectRuntimeDetailUrl,
  resolveProjectFallbackRoute,
} from "./detail-href";

describe("static-export-safe project routes", () => {
  it("sends an arbitrary runtime slug through the static fallback query", () => {
    expect(buildProjectRuntimeDetailHref("foo")).toBe(
      "/project/fallback/?slug=foo",
    );
    expect(buildProjectRuntimeDetailHref("a/b")).toBe(
      "/project/fallback/?slug=a%2Fb",
    );
    expect(buildProjectRuntimeDetailHref("한글 프로젝트")).toBe(
      `/project/fallback/?${new URLSearchParams({
        slug: "한글 프로젝트",
      }).toString()}`,
    );
  });

  it("includes locale and basePath in the runtime detail URL", () => {
    expect(
      buildProjectRuntimeDetailUrl("https://example.com/", "foo", {
        locale: "ko",
        basePath: "/ontology-atlas/",
      }),
    ).toBe(
      "https://example.com/ontology-atlas/ko/project/fallback/?slug=foo",
    );
  });

  it("keeps slug, return path and save notice in the full-edit fallback", () => {
    expect(
      buildProjectEditHref("foo", {
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
      resolveProjectFallbackRoute("?slug=%ED%95%9C%EA%B8%80+%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8"),
    ).toEqual({
      mode: "detail",
      slug: "한글 프로젝트",
      returnTo: undefined,
      savedNotice: false,
    });
  });

  it("parses the query full-edit state", () => {
    expect(
      resolveProjectFallbackRoute("?slug=foo&mode=edit&returnTo=%2Fprojects%2F&saved=1"),
    ).toEqual({
      mode: "edit",
      slug: "foo",
      returnTo: "/projects/",
      savedNotice: true,
    });
  });

  it("rejects a query with no slug, an empty slug or the fallback's own name", () => {
    expect(resolveProjectFallbackRoute("")).toBeNull();
    expect(resolveProjectFallbackRoute("?slug=")).toBeNull();
    expect(resolveProjectFallbackRoute("?slug=fallback")).toBeNull();
  });
});
