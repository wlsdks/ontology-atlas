import { describe, expect, it } from "vitest";
import type { Project } from "../../../entities/project/model/types";
import { SEED_PROJECTS } from "../../../entities/project/model/seed-data";
import { resolveProjectTourSteps } from "./steps";

function toProject(
  input: (typeof SEED_PROJECTS)[number],
  index: number,
): Project {
  return {
    slug: input.slug,
    name: input.name,
    nameEn: input.nameEn,
    category: input.category,
    status: input.status,
    description: input.description,
    detail: input.detail,
    tags: input.tags ?? [],
    stack: input.stack ?? [],
    links: input.links ?? [],
    dependencies: input.dependencies ?? [],
    owner: input.owner,
    icon: input.icon,
    screenshots: input.screenshots ?? [],
    timeline: input.timeline ?? {},
    progress: input.progress,
    isHub: input.isHub ?? false,
    position: input.position,
    createdAt: new Date(2026, 3, 14, 0, index),
    updatedAt: new Date(2026, 3, 14, 0, index),
  };
}

describe("resolveProjectTourSteps", () => {
  it("keeps the intended guided order when projects exist", () => {
    const steps = resolveProjectTourSteps(SEED_PROJECTS.map(toProject));

    expect(steps.map((step) => step.slug)).toEqual([
      "iam",
      "reactor",
      "aslan-maps",
      "aslan-verse",
    ]);
  });

  it("filters out tour steps whose projects are missing", () => {
    const projects = SEED_PROJECTS.filter(
      (project) => project.slug !== "reactor",
    ).map(toProject);

    expect(resolveProjectTourSteps(projects).map((step) => step.slug)).toEqual([
      "iam",
      "aslan-maps",
      "aslan-verse",
    ]);
  });
});
