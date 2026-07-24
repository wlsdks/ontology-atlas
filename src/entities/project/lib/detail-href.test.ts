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
  it("/project/<encoded-slug>/ 형식", () => {
    expect(getProjectDetailHref("foo")).toBe("/project/foo/");
  });

  it("URL-unsafe 문자 → encodeURIComponent escape", () => {
    expect(getProjectDetailHref("a/b")).toBe("/project/a%2Fb/");
    expect(getProjectDetailHref("foo bar")).toBe("/project/foo%20bar/");
    expect(getProjectDetailHref("한글")).toBe(
      `/project/${encodeURIComponent("한글")}/`,
    );
  });

  it("빈 slug 도 그대로 (caller contract)", () => {
    expect(getProjectDetailHref("")).toBe("/project//");
  });
});

describe("getProjectDetailUrl", () => {
  it("origin + canonical path", () => {
    expect(getProjectDetailUrl("https://example.com", "foo")).toBe(
      "https://example.com/project/foo/",
    );
  });

  it("origin trailing slash 정규화 (URL constructor)", () => {
    expect(getProjectDetailUrl("https://example.com/", "foo")).toBe(
      "https://example.com/project/foo/",
    );
  });

  it("encodeURIComponent 가 path 에 적용", () => {
    expect(getProjectDetailUrl("https://example.com", "한글")).toBe(
      `https://example.com/project/${encodeURIComponent("한글")}/`,
    );
  });
});

describe("static-export-safe project routes", () => {
  it("runtime 상세는 임의 slug 를 정적 fallback query 로 보낸다", () => {
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

  it("runtime 상세 URL은 locale·basePath를 포함해 정적 export 파일을 가리킨다", () => {
    expect(
      getProjectRuntimeDetailUrl("https://example.com/", "foo", {
        locale: "ko",
        basePath: "/ontology-atlas/",
      }),
    ).toBe(
      "https://example.com/ontology-atlas/ko/project/fallback/?slug=foo",
    );
  });

  it("전체 편집은 slug·복귀 경로·저장 알림을 같은 fallback에 보존한다", () => {
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
  it("query 상세 경로를 해석한다", () => {
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

  it("query 전체 편집 상태를 해석한다", () => {
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

  it("과거 CDN rewrite pathname 상세·편집 경로를 계속 해석한다", () => {
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

  it("직접 fallback·빈 slug·깨진 escape는 목록 복귀 대상으로 거부한다", () => {
    expect(resolveProjectFallbackRoute("/ko/project/fallback/", "")).toBeNull();
    expect(
      resolveProjectFallbackRoute("/ko/project/fallback/", "?slug="),
    ).toBeNull();
    expect(resolveProjectFallbackRoute("/ko/project/%E0%A4%A/", "")).toBeNull();
  });
});
