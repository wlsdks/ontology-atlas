import { describe, expect, it } from "vitest";
import { resolveFallbackProjects } from "./fallback";

describe("resolveFallbackProjects", () => {
  it("creates stable portfolio-safe fallback projects from seed inputs", () => {
    const projects = resolveFallbackProjects();

    expect(projects).toHaveLength(15);
    expect(projects[0]).toMatchObject({
      slug: "iam",
      isHub: true,
      category: "in-progress",
      dependencies: [],
      tags: ["Auth", "Hub"],
    });
    expect(projects[0].createdAt).toBeInstanceOf(Date);
    expect(projects[0].updatedAt).toBeInstanceOf(Date);
  });

  it("preserves dependency graph for downstream UI features", () => {
    const projects = resolveFallbackProjects();
    const newsClipping = projects.find(
      (project) => project.slug === "news-clipping",
    );

    expect(newsClipping?.dependencies).toEqual(["iam", "reactor"]);
  });
});
