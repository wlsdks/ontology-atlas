import { describe, expect, it } from "vitest";
import type { Project } from "@/entities/project";
import { projectsToCsv } from "./csv-export";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "iam",
    name: "통합 인증",
    category: "in-progress",
    status: "developing",
    description: "인증 허브",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: true,
    position: { x: 0, y: 0 },
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

describe("projectsToCsv", () => {
  it("직렬화 결과는 헤더 + 행들로 구성된다", () => {
    const csv = projectsToCsv([makeProject()]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "slug,name,category,status,description,detail,tags,stack,dependencies,owner,isHub",
    );
    expect(lines[1]).toBe(
      "iam,통합 인증,in-progress,developing,인증 허브,,,,,,true",
    );
  });

  it("배열 필드는 | 로 조인하고 comma 있는 필드는 따옴표로 감싼다", () => {
    const csv = projectsToCsv([
      makeProject({
        slug: "checkout",
        name: "결제, 정산",
        tags: ["Commerce", "Billing"],
        dependencies: ["iam", "audit"],
        description: '그는 "안녕" 이라고 말했다',
      }),
    ]);
    const dataLine = csv.split("\n")[1];
    expect(dataLine).toContain('"결제, 정산"');
    expect(dataLine).toContain("Commerce|Billing");
    expect(dataLine).toContain("iam|audit");
    // 이중 따옴표 이스케이프 확인
    expect(dataLine).toContain('그는 ""안녕"" 이라고 말했다');
  });

  it("isHub 는 true/false 리터럴로 직렬화", () => {
    const csv = projectsToCsv([
      makeProject({ slug: "hub", isHub: true }),
      makeProject({ slug: "leaf", isHub: false }),
    ]);
    const [, line1, line2] = csv.split("\n");
    expect(line1).toMatch(/,true$/);
    expect(line2).toMatch(/,false$/);
  });
});
