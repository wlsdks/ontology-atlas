import { describe, expect, it } from "vitest";
import {
  collectProjectConnectedClosure,
  collectProjectDependencyClosure,
  collectProjectDependentClosure,
  findBulkDeleteBlockingReferences,
  findDuplicateDependencySlugs,
  findMissingDependencySlugs,
  findProjectsReferencingSlug,
} from "./dependencies";
import type { Project } from "./types";

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

describe("findProjectsReferencingSlug", () => {
  it("returns projects that depend on the target slug", () => {
    const projects = [
      project("iam"),
      project("aslan-maps", ["iam"]),
      project("aslan-studio", ["iam", "reactor"]),
      project("pick", ["reactor"]),
    ];

    expect(findProjectsReferencingSlug(projects, "iam").map((item) => item.slug))
      .toEqual(["aslan-maps", "aslan-studio"]);
  });

  it("returns an empty array when no project references the slug", () => {
    const projects = [project("iam"), project("pick", ["reactor"])];

    expect(findProjectsReferencingSlug(projects, "iam")).toEqual([]);
  });
});

describe("findMissingDependencySlugs", () => {
  it("returns dependencies that do not exist in the available set", () => {
    expect(
      findMissingDependencySlugs(
        ["iam", "ghost", "reactor", "ghost"],
        ["iam", "reactor"],
      ),
    ).toEqual(["ghost", "ghost"]);
  });
});

describe("findDuplicateDependencySlugs", () => {
  it("returns duplicate entries in encounter order", () => {
    expect(
      findDuplicateDependencySlugs(["iam", "ghost", "iam", "ghost", "ghost"]),
    ).toEqual(["iam", "ghost", "ghost"]);
  });
});

describe("collectProjectDependencyClosure", () => {
  it("returns targets and nested dependencies in original project order", () => {
    const projects = [
      project("iam"),
      project("reactor", ["iam"]),
      project("aslan-studio", ["iam", "reactor"]),
      project("pick", ["reactor"]),
    ];

    expect(
      collectProjectDependencyClosure(projects, ["aslan-studio"]).map(
        (item) => item.slug,
      ),
    ).toEqual(["iam", "reactor", "aslan-studio"]);
  });

  it("ignores missing targets without failing", () => {
    const projects = [project("iam"), project("pick", ["iam"])];

    expect(
      collectProjectDependencyClosure(projects, ["missing", "pick"]).map(
        (item) => item.slug,
      ),
    ).toEqual(["iam", "pick"]);
  });
});

describe("collectProjectDependentClosure", () => {
  it("returns targets and nested dependents in original project order", () => {
    const projects = [
      project("iam"),
      project("reactor", ["iam"]),
      project("aslan-maps", ["iam"]),
      project("aslan-studio", ["iam", "reactor"]),
      project("pick", ["reactor"]),
    ];

    expect(
      collectProjectDependentClosure(projects, ["iam"]).map((item) => item.slug),
    ).toEqual(["iam", "reactor", "aslan-maps", "aslan-studio", "pick"]);
  });

  it("ignores missing targets without failing", () => {
    const projects = [project("iam"), project("pick", ["iam"])];

    expect(
      collectProjectDependentClosure(projects, ["missing", "iam"]).map(
        (item) => item.slug,
      ),
    ).toEqual(["iam", "pick"]);
  });
});

describe("collectProjectConnectedClosure", () => {
  it("returns the full connected component around the targets", () => {
    const projects = [
      project("iam"),
      project("reactor", ["iam"]),
      project("aslan-maps", ["iam"]),
      project("aslan-studio", ["iam", "reactor"]),
      project("pick", ["reactor"]),
      project("isolated"),
    ];

    expect(
      collectProjectConnectedClosure(projects, ["pick"]).map((item) => item.slug),
    ).toEqual(["iam", "reactor", "aslan-maps", "aslan-studio", "pick"]);
  });

  it("ignores missing targets without failing", () => {
    const projects = [project("iam"), project("pick", ["iam"]), project("solo")];

    expect(
      collectProjectConnectedClosure(projects, ["missing", "pick"]).map(
        (item) => item.slug,
      ),
    ).toEqual(["iam", "pick"]);
  });
});

describe("findBulkDeleteBlockingReferences", () => {
  it("ignores references between projects that are deleted together", () => {
    const projects = [
      project("iam"),
      project("reactor", ["iam"]),
      project("pick", ["reactor"]),
    ];

    expect(
      findBulkDeleteBlockingReferences(projects, ["reactor", "pick"]),
    ).toEqual([]);
  });

  it("returns only external projects that block the bulk delete", () => {
    const projects = [
      project("iam"),
      project("reactor", ["iam"]),
      project("pick", ["reactor"]),
      project("atlas", ["iam"]),
    ];

    expect(
      findBulkDeleteBlockingReferences(projects, ["iam", "reactor"]),
    ).toEqual([
      { targetSlug: "iam", referencedBy: [projects[3]] },
      { targetSlug: "reactor", referencedBy: [projects[2]] },
    ]);
  });
});
