import { describe, expect, it } from "vitest";
import type { Project } from "./types";
import { projectToInput } from "./to-input";

function makeProject(partial: Partial<Project> = {}): Project {
  return {
    slug: "demo",
    name: "Demo",
    category: "in-progress",
    status: "active",
    description: "demo description",
    detail: undefined,
    tags: ["a", "b"],
    stack: ["nextjs"],
    links: [{ label: "site", url: "https://example.com" }],
    dependencies: ["other"],
    owner: "me",
    icon: undefined,
    screenshots: ["a.png", "b.png"],
    timeline: { startedAt: new Date("2026-01-01") },
    progress: 0.5,
    isHub: false,
    position: { x: 10, y: 20 },
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-02-01"),
    ...partial,
  };
}

describe("projectToInput", () => {
  it("값이 동일하게 매핑", () => {
    const project = makeProject();
    const input = projectToInput(project);
    expect(input.slug).toBe(project.slug);
    expect(input.name).toBe(project.name);
    expect(input.description).toBe(project.description);
    expect(input.category).toBe(project.category);
    expect(input.status).toBe(project.status);
    expect(input.owner).toBe(project.owner);
    expect(input.isHub).toBe(project.isHub);
    expect(input.progress).toBe(project.progress);
    expect(input.tags).toEqual(project.tags);
    expect(input.stack).toEqual(project.stack);
    expect(input.dependencies).toEqual(project.dependencies);
    expect(input.position).toEqual(project.position);
    expect(input.screenshots).toEqual(project.screenshots);
    expect(input.timeline).toEqual(project.timeline);
    expect(input.links).toEqual(project.links);
  });

  it("arrays 는 새 참조 (immutable copy) — 원본 mutation 회피", () => {
    const project = makeProject();
    const input = projectToInput(project);
    expect(input.tags).not.toBe(project.tags);
    expect(input.stack).not.toBe(project.stack);
    expect(input.dependencies).not.toBe(project.dependencies);
    expect(input.screenshots).not.toBe(project.screenshots);
    expect(input.links).not.toBe(project.links);
  });

  it("nested object (timeline / position / link entry) 도 새 참조", () => {
    const project = makeProject();
    const input = projectToInput(project);
    expect(input.timeline).not.toBe(project.timeline);
    expect(input.position).not.toBe(project.position);
    expect(input.links![0]).not.toBe(project.links[0]);
  });

  it("input 의 array mutation 이 원본 Project 에 안 새어 들어감", () => {
    const project = makeProject();
    const input = projectToInput(project);
    input.tags!.push("c");
    expect(project.tags).toEqual(["a", "b"]);
  });
});
