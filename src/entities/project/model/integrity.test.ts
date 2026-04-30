import { describe, expect, it } from "vitest";
import {
  formatProjectIntegrityIssue,
  getProjectIntegrityIssues,
} from "./integrity";
import type { Project } from "./types";

function project(
  slug: string,
  overrides: Partial<Project> = {},
): Project {
  const now = new Date("2026-04-13T00:00:00Z");
  return {
    slug,
    name: slug,
    category: "in-progress",
    status: "idea",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("getProjectIntegrityIssues", () => {
  it("reports missing taxonomy references and dependency issues", () => {
    const broken = project("broken", {
      category: "missing-category",
      status: "missing-status",
      dependencies: ["iam", "missing-dependency", "iam", "missing-dependency"],
    });
    const projects = [project("iam"), broken];

    expect(
      getProjectIntegrityIssues(broken, {
        allProjects: projects,
        categoryIds: ["in-progress", "planned"],
        statusIds: ["idea", "developing"],
      }),
    ).toEqual([
      { code: "missing-category", categoryId: "missing-category" },
      { code: "missing-status", statusId: "missing-status" },
      { code: "missing-dependency", dependencySlug: "missing-dependency" },
      { code: "duplicate-dependency", dependencySlug: "iam" },
      { code: "duplicate-dependency", dependencySlug: "missing-dependency" },
    ]);
  });

  it("returns an empty array for valid references", () => {
    const projects = [
      project("iam"),
      project("reactor", {
        dependencies: ["iam"],
      }),
    ];

    expect(
      getProjectIntegrityIssues(projects[1], {
        allProjects: projects,
        categoryIds: ["in-progress"],
        statusIds: ["idea"],
      }),
    ).toEqual([]);
  });
});

describe("formatProjectIntegrityIssue", () => {
  it("renders stable labels for dashboard diagnostics", () => {
    expect(
      formatProjectIntegrityIssue({
        code: "missing-dependency",
        dependencySlug: "ghost",
      }),
    ).toBe("의존성 누락: ghost");
  });
});
