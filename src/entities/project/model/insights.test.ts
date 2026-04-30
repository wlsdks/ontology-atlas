import { describe, expect, it } from "vitest";
import {
  isProjectRecentlyUpdated,
  resolveProjectCompletenessInsight,
  resolveProjectFreshnessInsight,
  resolveProjectImpactInsight,
} from "./insights";
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
    description: "desc",
    tags: ["tag"],
    stack: ["stack"],
    links: [{ label: "Docs", url: "https://example.com" }],
    dependencies,
    screenshots: ["https://example.com/image.png"],
    timeline: { startedAt: now },
    isHub: false,
    position: { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now,
    detail: "detail",
    owner: "jinan",
    ...overrides,
  };
}

describe("resolveProjectImpactInsight", () => {
  const projects = [
    project("iam"),
    project("reactor", ["iam"]),
    project("maps", ["iam"]),
    project("studio", ["iam", "reactor"]),
    project("pick", ["reactor"]),
  ];

  it("returns upstream closure for dependency context", () => {
    const insight = resolveProjectImpactInsight(projects, "studio", "upstream");

    expect(insight.highlightedSlugs.sort()).toEqual(
      ["iam", "reactor", "studio"].sort(),
    );
    expect(insight.highlightedEdgeIds).toEqual(
      expect.arrayContaining(["studio->iam", "studio->reactor", "reactor->iam"]),
    );
    expect(insight.relatedCount).toBe(2);
  });

  it("returns downstream closure for impact mode", () => {
    const insight = resolveProjectImpactInsight(projects, "iam", "downstream");

    expect(insight.highlightedSlugs.sort()).toEqual(
      ["iam", "reactor", "maps", "studio", "pick"].sort(),
    );
    expect(insight.highlightedEdgeIds).toEqual(
      expect.arrayContaining(["maps->iam", "studio->iam", "pick->reactor"]),
    );
  });

  it("returns no highlight when mode is none", () => {
    expect(resolveProjectImpactInsight(projects, "iam", "none")).toEqual({
      mode: "none",
      highlightedSlugs: [],
      highlightedEdgeIds: [],
      relatedCount: 0,
    });
  });
});

describe("resolveProjectCompletenessInsight", () => {
  it("returns a perfect score when all storytelling fields are present", () => {
    const insight = resolveProjectCompletenessInsight(project("maps"));

    expect(insight.score).toBe(100);
    expect(insight.prompts).toEqual([]);
  });

  it("returns missing field prompts when content is sparse", () => {
    const insight = resolveProjectCompletenessInsight(
      project("maps", [], {
        detail: "",
        screenshots: [],
        owner: "",
        timeline: {},
        tags: [],
      }),
    );

    expect(insight.score).toBeLessThan(100);
    expect(insight.missingFields).toEqual(
      expect.arrayContaining(["detail", "screenshots", "owner", "timeline", "tags"]),
    );
    expect(insight.prompts).toEqual(
      expect.arrayContaining([
        "detail 본문을 채워 서비스 소개를 더 깊게 설명하세요.",
        "스크린샷을 추가해 시각적 이해를 높이세요.",
      ]),
    );
  });
});

describe("freshness helpers", () => {
  const now = new Date("2026-04-14T00:00:00Z");

  it("marks recently updated projects as fresh", () => {
    const freshness = resolveProjectFreshnessInsight(project("maps"), now);
    expect(freshness).toEqual({
      level: "fresh",
      label: "이번 주 업데이트",
      ageDays: 2,
    });
    expect(isProjectRecentlyUpdated(project("maps"), 7, now)).toBe(true);
  });

  it("marks older projects as stale", () => {
    const staleProject = project("legacy", [], {
      updatedAt: new Date("2026-02-01T00:00:00Z"),
    });

    expect(resolveProjectFreshnessInsight(staleProject, now)).toEqual({
      level: "stale",
      label: "업데이트 권장",
      ageDays: 72,
    });
    expect(isProjectRecentlyUpdated(staleProject, 30, now)).toBe(false);
  });
});
