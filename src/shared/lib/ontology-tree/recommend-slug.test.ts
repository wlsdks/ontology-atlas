import { describe, expect, it } from "vitest";
import { recommendDocumentSlug } from "./recommend-slug";

describe("recommendDocumentSlug", () => {
  it("빈 문자열 → 빈 문자열", () => {
    expect(recommendDocumentSlug("")).toBe("");
    expect(recommendDocumentSlug("   ")).toBe("");
  });

  it("한글 보존 (음역 X)", () => {
    expect(recommendDocumentSlug("로그인")).toBe("로그인");
    expect(recommendDocumentSlug("사용자 인증")).toBe("사용자-인증");
  });

  it("한·영 혼합", () => {
    expect(recommendDocumentSlug("Auth 로그인")).toBe("auth-로그인");
  });

  it("특수문자 → `-`, 연속 압축, 양 끝 trim", () => {
    expect(recommendDocumentSlug("Hello, World!")).toBe("hello-world");
    expect(recommendDocumentSlug("---foo___bar---")).toBe("foo-bar");
    expect(recommendDocumentSlug(":auth:login:")).toBe("auth-login");
  });

  it("연속 공백 압축", () => {
    expect(recommendDocumentSlug("foo    bar    baz")).toBe("foo-bar-baz");
  });

  it("영문 lower-case", () => {
    expect(recommendDocumentSlug("AuthLogin")).toBe("authlogin");
    expect(recommendDocumentSlug("AUTH-LOGIN")).toBe("auth-login");
  });

  it("전부 invalid → 빈 문자열", () => {
    expect(recommendDocumentSlug("@@@!!!")).toBe("");
    expect(recommendDocumentSlug("---")).toBe("");
  });

  it("숫자 보존", () => {
    expect(recommendDocumentSlug("v2 release")).toBe("v2-release");
  });
});
