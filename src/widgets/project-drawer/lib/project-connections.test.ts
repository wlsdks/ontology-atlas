import { describe, expect, it } from "vitest";
import type { Project } from "@/entities/project";
import {
  buildDependencyRelations,
  buildReferencedByRelations,
  displayNameWithoutContainer,
  findReferencedBy,
  pickNextProjects,
  relationshipSummaryMessage,
} from "./project-connections";

function projectOf(slug: string, dependencies: string[] = [], isHub = false): Project {
  return { slug, name: slug, dependencies, isHub } as Project;
}

describe("relationshipSummaryMessage", () => {
  it("picks one sentence by hub flag and counts", () => {
    expect(relationshipSummaryMessage(projectOf("a", [], true), 2)).toEqual({
      key: "summaryHubReferenced",
      values: { count: 2 },
    });
    expect(relationshipSummaryMessage(projectOf("a"), 0).key).toBe("summaryStandalone");
    expect(relationshipSummaryMessage(projectOf("a", ["b"]), 3)).toEqual({
      key: "summaryBoth",
      values: { deps: 1, refs: 3 },
    });
    expect(relationshipSummaryMessage(projectOf("a", ["b", "c"]), 0)).toEqual({
      key: "summaryDepsOnly",
      values: { count: 2 },
    });
    expect(relationshipSummaryMessage(projectOf("a"), 4)).toEqual({
      key: "summaryRefsOnly",
      values: { count: 4 },
    });
  });

  it("treats a hub nobody references like any other project", () => {
    expect(relationshipSummaryMessage(projectOf("hub", ["b"], true), 0).key).toBe("summaryDepsOnly");
  });
});

describe("displayNameWithoutContainer", () => {
  it("drops the container prefix from a member and keeps everything else", () => {
    expect(displayNameWithoutContainer("Atlas · Parser", "Atlas", false)).toBe("Parser");
    expect(displayNameWithoutContainer("Atlas · Parser", " Atlas ", false)).toBe("Parser");
    expect(displayNameWithoutContainer("Atlas · Parser", "Atlas", true)).toBe("Atlas · Parser");
    expect(displayNameWithoutContainer("Parser", "Atlas", false)).toBe("Parser");
    expect(displayNameWithoutContainer("Atlas · Parser", null, false)).toBe("Atlas · Parser");
  });

  it("keeps the full name when nothing is left after the prefix", () => {
    expect(displayNameWithoutContainer("Atlas ·  ", "Atlas", false)).toBe("Atlas ·  ");
  });
});

describe("relations", () => {
  const storefront = projectOf("storefront", ["payments", "gone", "iam"]);
  const payments = projectOf("payments");
  const iam = projectOf("iam");
  const bySlug = new Map([payments, iam].map((project) => [project.slug, project]));

  it("lists only dependencies that resolve, with the relationship each carries", () => {
    const relations = buildDependencyRelations(storefront, bySlug);
    expect(relations.map((relation) => relation.project.slug)).toEqual(["payments", "iam"]);
    expect(relations[0].relationship.kind).toBe("dependency");
    expect(relations[1].relationship.kind).toBe("auth");
  });

  it("finds referrers by dependency slug", () => {
    expect(findReferencedBy([storefront, payments], "payments")).toEqual([storefront]);
    expect(buildReferencedByRelations(payments, [storefront])[0].project).toBe(storefront);
  });

  it("picks three distinct neighbours, dependencies first", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((slug) => projectOf(slug));
    const relation = (project: Project) => ({ project, relationship: buildDependencyRelations(storefront, bySlug)[0].relationship });
    const picked = pickNextProjects([a, b].map(relation), [b, c, d].map(relation));
    expect(picked.map((project) => project.slug)).toEqual(["a", "b", "c"]);
  });
});
