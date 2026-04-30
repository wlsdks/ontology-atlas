import { describe, expect, it } from "vitest";
import { computeFrontmatterGrade } from "./frontmatter-grade";

describe("computeFrontmatterGrade", () => {
  it("필수 5 + 권장 4 모두 채움 → A", () => {
    const r = computeFrontmatterGrade({
      frontmatter: {
        id: "auth-login",
        kind: "capability",
        project: "aslan-maps",
        title: "로그인",
        version: 1,
        domain: "auth",
        status: "active",
        aliases: ["login"],
        tags: ["auth"],
      },
    });
    expect(r.grade).toBe("A");
    expect(r.missingRequired).toEqual([]);
    expect(r.missingRecommended).toEqual([]);
  });

  it("필수 5 만 → B (권장 누락)", () => {
    const r = computeFrontmatterGrade({
      frontmatter: {
        id: "auth-login",
        kind: "capability",
        project: "aslan-maps",
        title: "로그인",
        version: 1,
      },
    });
    expect(r.grade).toBe("B");
    expect(r.missingRequired).toEqual([]);
    expect(r.missingRecommended).toContain("domain");
    expect(r.missingRecommended).toContain("status");
    expect(r.missingRecommended).toContain("aliases");
    expect(r.missingRecommended).toContain("tags");
  });

  it("필수 일부 누락 → C", () => {
    const r = computeFrontmatterGrade({
      frontmatter: {
        title: "로그인",
        kind: "capability",
      },
    });
    expect(r.grade).toBe("C");
    expect(r.missingRequired).toContain("id");
    expect(r.missingRequired).toContain("project");
    expect(r.missingRequired).toContain("version");
  });

  it("페이지 폼 입력으로 fallback — 필수 보완", () => {
    // frontmatter 에 title/kind/project 없어도 페이지 입력 있으면 그 필수 채워짐.
    // id / version 은 frontmatter 만 → 여전히 누락.
    const r = computeFrontmatterGrade({
      frontmatter: {},
      pageTitle: "로그인",
      pageKind: "capability",
      pageProjectIds: ["aslan-maps"],
    });
    expect(r.missingRequired).toEqual(["id", "version"]);
    expect(r.grade).toBe("C");
  });

  it("frontmatter projectIds (legacy array) 도 project 필수로 인정", () => {
    const r = computeFrontmatterGrade({
      frontmatter: {
        id: "auth-login",
        kind: "capability",
        projectIds: ["aslan-maps"],
        title: "로그인",
        version: 1,
      },
    });
    expect(r.missingRequired).not.toContain("project");
    expect(r.grade).toBe("B"); // 권장 4 종 누락
  });

  it("빈 frontmatter + 페이지 입력 0 → C, 모든 필수 누락", () => {
    const r = computeFrontmatterGrade({ frontmatter: {} });
    expect(r.grade).toBe("C");
    expect(r.missingRequired).toEqual(["id", "kind", "project", "title", "version"]);
  });

  it("권장 일부 채움 → B (전체 채워야 A)", () => {
    const r = computeFrontmatterGrade({
      frontmatter: {
        id: "auth-login",
        kind: "capability",
        project: "aslan-maps",
        title: "로그인",
        version: 1,
        domain: "auth",
        status: "active",
        // aliases / tags 누락
      },
    });
    expect(r.grade).toBe("B");
    expect(r.missingRecommended).toEqual(["aliases", "tags"]);
  });
});
