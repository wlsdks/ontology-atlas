import { describe, expect, it } from "vitest";
import { wouldCreateDependencyCycle } from "./cycles";
import type { Project } from "./project";

function project(
  slug: string,
  dependencies: string[] = [],
  overrides: Partial<Project> = {},
): Project {
  const now = new Date("2026-04-12T00:00:00Z");
  return {
    slug,
    name: slug,
    category: "in-progress",
    status: "idea",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies,
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("wouldCreateDependencyCycle", () => {
  it("returns true when the dependency already reaches the project", () => {
    const projects = [
      project("iam"),
      project("sample", ["iam"]),
      project("pick", ["sample"]),
    ];

    expect(wouldCreateDependencyCycle(projects, "iam", "sample")).toBe(
      true,
    );
    expect(wouldCreateDependencyCycle(projects, "iam", "pick")).toBe(true);
  });

  it("returns false when the dependency does not create a cycle", () => {
    const projects = [
      project("iam"),
      project("reactor"),
      project("sample", ["iam"]),
    ];

    expect(wouldCreateDependencyCycle(projects, "iam", "reactor")).toBe(false);
  });
});
