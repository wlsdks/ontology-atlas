import { describe, expect, it } from "vitest";
import type { Project } from "@/entities/project";
import { resolveSubscribeUpdate } from "./resolve-subscribe-update";

function makeProject(slug: string, name: string): Project {
  const now = new Date("2026-04-22T00:00:00Z");
  return {
    slug,
    name,
    category: "in-progress",
    status: "developing",
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
  };
}

describe("resolveSubscribeUpdate", () => {
  it("returns next=null when the slug is not in the current list, so the caller shows not-found", () => {
    const result = resolveSubscribeUpdate([makeProject("other", "Other")], "iam");
    expect(result.next).toBeNull();
  });

  it("returns the project when the slug is in the current list", () => {
    const freshIam = makeProject("iam", "IAM fresh");
    const result = resolveSubscribeUpdate([freshIam], "iam");
    expect(result.next).toBe(freshIam);
  });

  it("returns an empty related list for an empty list instead of seed data", () => {
    const result = resolveSubscribeUpdate([], "iam");
    expect(result.next).toBeNull();
    expect(result.related).toEqual([]);
  });

  it("returns the current list as related, never mixing two sources of truth", () => {
    const list = [makeProject("iam", "IAM"), makeProject("reactor", "Reactor")];
    const result = resolveSubscribeUpdate(list, "iam");
    expect(result.related).toBe(list);
  });
});
