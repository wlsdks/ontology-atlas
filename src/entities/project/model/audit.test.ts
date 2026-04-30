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
  it("지정한 일수 초과 미수정 프로젝트만 반환한다", () => {
    const projects: Project[] = [
      // 25일 전 — threshold 30 미만이므로 제외
      makeProject({
        slug: "fresh",
        updatedAt: new Date("2026-03-26T00:00:00Z"),
      }),
      // 60일 전 — 포함
      makeProject({
        slug: "stale-60",
        updatedAt: new Date("2026-02-19T00:00:00Z"),
      }),
      // 100일 전 — 포함
      makeProject({
        slug: "stale-100",
        updatedAt: new Date("2026-01-10T00:00:00Z"),
      }),
    ];

    const stale = detectStaleProjects(projects, { now: NOW, daysThreshold: 30 });

    expect(stale.map((p) => p.slug)).toEqual(["stale-100", "stale-60"]);
  });

  it("가장 오래된 것부터 정렬한다 (수리 우선순위)", () => {
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

  it("threshold 경계 정확: threshold 와 정확히 일치하면 stale 아님", () => {
    const projects: Project[] = [
      // 정확히 30일 전 — NOT stale (> 30 만 stale)
      makeProject({
        slug: "exact-30",
        updatedAt: new Date("2026-03-21T00:00:00Z"),
      }),
    ];
    expect(
      detectStaleProjects(projects, { now: NOW, daysThreshold: 30 }),
    ).toEqual([]);
  });

  it("limit 옵션으로 상위 N개만 반환", () => {
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
    // 가장 오래된 2개 (s0, s1) 이 앞에 와야
    expect(stale[0].slug).toBe("s0");
    expect(stale[1].slug).toBe("s1");
  });
});

describe("detectOrphanProjects", () => {
  it("들어오는 참조도 나가는 의존도 없는 프로젝트만 반환한다", () => {
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

  it("허브 노드는 orphan 에서 제외한다 (허브가 고립이라도 구조상 의도된 경우 많음)", () => {
    const projects: Project[] = [
      makeProject({ slug: "hub-alone", isHub: true }),
      makeProject({ slug: "non-hub-alone" }),
    ];

    const orphans = detectOrphanProjects(projects);
    expect(orphans.map((p) => p.slug)).toEqual(["non-hub-alone"]);
  });

  it("이름 가나다 순 정렬", () => {
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
  it("isHub=false 이면서 fan-in 이 임계값 이상인 프로젝트를 반환한다", () => {
    const projects: Project[] = [
      makeProject({ slug: "center" }), // 비허브, fan-in 4
      makeProject({ slug: "a", dependencies: ["center"] }),
      makeProject({ slug: "b", dependencies: ["center"] }),
      makeProject({ slug: "c", dependencies: ["center"] }),
      makeProject({ slug: "d", dependencies: ["center"] }),
      makeProject({ slug: "quiet" }), // 비허브, fan-in 0
      makeProject({ slug: "hub", isHub: true }), // 허브라서 제외 대상
    ];

    const candidates = detectPromotionCandidates(projects, { minFanIn: 4 });
    expect(candidates.map((p) => p.slug)).toEqual(["center"]);
  });

  it("허브는 이미 승격된 상태이므로 후보에서 제외한다", () => {
    const projects: Project[] = [
      makeProject({ slug: "hub", isHub: true }),
      makeProject({ slug: "a", dependencies: ["hub"] }),
      makeProject({ slug: "b", dependencies: ["hub"] }),
      makeProject({ slug: "c", dependencies: ["hub"] }),
      makeProject({ slug: "d", dependencies: ["hub"] }),
    ];

    expect(detectPromotionCandidates(projects, { minFanIn: 4 })).toEqual([]);
  });

  it("fan-in 이 큰 순서로 정렬한다", () => {
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

  it("limit 으로 상위 N개만 반환", () => {
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
