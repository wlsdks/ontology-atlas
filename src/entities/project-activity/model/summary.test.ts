import { describe, expect, it } from "vitest";
import { summarizeProjectUpdate } from "./summary";
import type { Project, ProjectInput } from "@/entities/project";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "p",
    name: "P",
    category: "platform",
    status: "developing",
    description: "desc",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 0, y: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInput(before: Project, overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    slug: before.slug,
    name: before.name,
    category: before.category,
    status: before.status,
    description: before.description,
    position: before.position,
    dependencies: before.dependencies,
    isHub: before.isHub,
    owner: before.owner,
    detail: before.detail,
    ...overrides,
  };
}

describe("summarizeProjectUpdate", () => {
  it("변경 없으면 null", () => {
    const before = makeProject();
    expect(summarizeProjectUpdate(before, makeInput(before))).toBeNull();
  });

  it("dependencies 수 증가", () => {
    const before = makeProject({ dependencies: ["a"] });
    expect(
      summarizeProjectUpdate(before, makeInput(before, { dependencies: ["a", "b"] })),
    ).toBe("dependencies 1 → 2");
  });

  it("dependencies 구성 변경 (수 같음)", () => {
    const before = makeProject({ dependencies: ["a", "b"] });
    expect(
      summarizeProjectUpdate(before, makeInput(before, { dependencies: ["a", "c"] })),
    ).toBe("dependencies 구성 변경");
  });

  it("status 우선순위가 name/description 보다 높음", () => {
    const before = makeProject({ status: "developing", name: "A", description: "a" });
    const after = makeInput(before, {
      status: "live",
      name: "B",
      description: "b",
    });
    expect(summarizeProjectUpdate(before, after)).toBe("status: developing → live");
  });

  it("isHub 변경 감지 — 승격/해제 모두", () => {
    const beforeHub = makeProject({ isHub: true });
    expect(
      summarizeProjectUpdate(beforeHub, makeInput(beforeHub, { isHub: false })),
    ).toBe("허브 해제");
    const beforeNon = makeProject({ isHub: false });
    expect(
      summarizeProjectUpdate(beforeNon, makeInput(beforeNon, { isHub: true })),
    ).toBe("허브 승격");
  });

  it("owner 만 바뀌면 owner 변경", () => {
    const before = makeProject({ owner: "김" });
    expect(
      summarizeProjectUpdate(before, makeInput(before, { owner: "이" })),
    ).toBe("owner 변경");
  });
});
