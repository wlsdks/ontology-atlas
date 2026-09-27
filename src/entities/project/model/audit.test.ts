import { describe, expect, it } from "vitest";
import {
  detectOrphanProjects,
  detectPromotionCandidates,
  detectStaleProjects,
} from "./audit";
import type { Project } from "./types";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "p",
    name: "P",
    category: "platform",
    status: "live",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    screenshots: [],
    timeline: {},
    isHub: false,
    position: { x: 0, y: 0 },
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

const NOW = new Date("2026-04-20T00:00:00Z");

describe("detectStaleProjects", () => {
  it("returns only projects unmodified for longer than the given days", () => {
    const projects: Project[] = [
      // 25 days: under the 30-day threshold.
      makeProject({
        slug: "fresh",
        updatedAt: new Date("2026-03-26T00:00:00Z"),
      }),
      // 60 days.
      makeProject({
        slug: "stale-60",
        updatedAt: new Date("2026-02-19T00:00:00Z"),
      }),
      // 100 days.
      makeProject({
        slug: "stale-100",
        updatedAt: new Date("2026-01-10T00:00:00Z"),
      }),
    ];

    const stale = detectStaleProjects(projects, { now: NOW, daysThreshold: 30 });

    expect(stale.map((p) => p.slug)).toEqual(["stale-100", "stale-60"]);
  });

  it("sorts the oldest first", () => {
    const projects: Project[] = [
      makeProject({
        slug: "older",
        updatedAt: new Date("2025-08-01T00:00:00Z"),
      }),
      makeProject({
        slug: "oldest",
        updatedAt: new Date("2025-01-01T00:00:00Z"),
      }),
      makeProject({
        slug: "old",
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ];

    const stale = detectStaleProjects(projects, { now: NOW, daysThreshold: 30 });
    expect(stale.map((p) => p.slug)).toEqual(["oldest", "older", "old"]);
  });

  it("does not treat a project exactly at the threshold as stale", () => {
    const projects: Project[] = [
      // Exactly 30 days is not stale (strictly greater).
      makeProject({
        slug: "exact-30",
        updatedAt: new Date("2026-03-21T00:00:00Z"),
      }),
    ];
    expect(
      detectStaleProjects(projects, { now: NOW, daysThreshold: 30 }),
    ).toEqual([]);
  });

  it("returns the top N with limit", () => {
    const projects: Project[] = Array.from({ length: 5 }, (_, i) =>
      makeProject({
        slug: `s${i}`,
        updatedAt: new Date(`2025-0${i + 1}-01T00:00:00Z`),
      }),
    );

    const stale = detectStaleProjects(projects, {
      now: NOW,
      daysThreshold: 30,
      limit: 2,
    });
    expect(stale).toHaveLength(2);
    // Oldest first.
    expect(stale[0].slug).toBe("s0");
    expect(stale[1].slug).toBe("s1");
  });
});

describe("detectOrphanProjects", () => {
  it("returns only projects with no incoming or outgoing links", () => {
    const projects: Project[] = [
      makeProject({ slug: "truly-alone" }),
      makeProject({ slug: "has-out", dependencies: ["other"] }),
      makeProject({ slug: "has-in" }),
      makeProject({ slug: "ref", dependencies: ["has-in"] }),
      makeProject({ slug: "other" }),
    ];

    const orphans = detectOrphanProjects(projects);
    expect(orphans.map((p) => p.slug)).toEqual(["truly-alone"]);
  });

  it("excludes hubs from orphans", () => {
    const projects: Project[] = [
      makeProject({ slug: "hub-alone", isHub: true }),
      makeProject({ slug: "non-hub-alone" }),
    ];

    const orphans = detectOrphanProjects(projects);
    expect(orphans.map((p) => p.slug)).toEqual(["non-hub-alone"]);
  });

  it("sorts by name", () => {
    const projects: Project[] = [
      makeProject({ slug: "b", name: "나 프로젝트" }),
      makeProject({ slug: "a", name: "가 프로젝트" }),
      makeProject({ slug: "c", name: "다 프로젝트" }),
    ];

    const orphans = detectOrphanProjects(projects);
    expect(orphans.map((p) => p.slug)).toEqual(["a", "b", "c"]);
  });
});

describe("detectPromotionCandidates", () => {
  it("returns non-hub projects with fan-in at or above the threshold", () => {
    const projects: Project[] = [
      makeProject({ slug: "center" }), // Non-hub, fan-in 4
      makeProject({ slug: "a", dependencies: ["center"] }),
      makeProject({ slug: "b", dependencies: ["center"] }),
      makeProject({ slug: "c", dependencies: ["center"] }),
      makeProject({ slug: "d", dependencies: ["center"] }),
      makeProject({ slug: "quiet" }),
      makeProject({ slug: "hub", isHub: true }), // Excluded: a hub.
    ];

    const candidates = detectPromotionCandidates(projects, { minFanIn: 4 });
    expect(candidates.map((p) => p.slug)).toEqual(["center"]);
  });

  it("excludes existing hubs from candidates", () => {
    const projects: Project[] = [
      makeProject({ slug: "hub", isHub: true }),
      makeProject({ slug: "a", dependencies: ["hub"] }),
      makeProject({ slug: "b", dependencies: ["hub"] }),
      makeProject({ slug: "c", dependencies: ["hub"] }),
      makeProject({ slug: "d", dependencies: ["hub"] }),
    ];

    expect(detectPromotionCandidates(projects, { minFanIn: 4 })).toEqual([]);
  });

  it("sorts by fan-in descending", () => {
    const projects: Project[] = [
      makeProject({ slug: "two-in" }),
      makeProject({ slug: "five-in" }),
      makeProject({ slug: "three-in" }),
      makeProject({ slug: "r1", dependencies: ["two-in", "five-in", "three-in"] }),
      makeProject({ slug: "r2", dependencies: ["two-in", "five-in", "three-in"] }),
      makeProject({ slug: "r3", dependencies: ["five-in", "three-in"] }),
      makeProject({ slug: "r4", dependencies: ["five-in"] }),
      makeProject({ slug: "r5", dependencies: ["five-in"] }),
    ];

    const candidates = detectPromotionCandidates(projects, { minFanIn: 2 });
    expect(candidates.map((p) => p.slug)).toEqual([
      "five-in",
      "three-in",
      "two-in",
    ]);
  });

  it("returns the top N candidates with limit", () => {
    const projects: Project[] = [
      makeProject({ slug: "target" }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeProject({ slug: `ref${i}`, dependencies: ["target"] }),
      ),
    ];
    const candidates = detectPromotionCandidates(projects, {
      minFanIn: 3,
      limit: 1,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].slug).toBe("target");
  });
});
