import { describe, expect, it } from "vitest";
import type { Project } from "../../../entities/project";
import { SEED_PROJECTS } from "../../../entities/project/model";
import { resolveFeaturedPathPresets } from "../../featured-paths/model/presets";
import { resolvePortfolioChapters } from "./chapters";

describe("resolvePortfolioChapters", () => {
  const projects: Project[] = SEED_PROJECTS.map((project, index) => ({
    ...project,
    tags: project.tags ?? [],
    stack: project.stack ?? [],
    links: project.links ?? [],
    dependencies: project.dependencies ?? [],
    screenshots: project.screenshots ?? [],
    timeline: project.timeline ?? {},
    isHub: project.isHub ?? false,
    createdAt: new Date(`2026-04-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    updatedAt: new Date(`2026-04-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`),
  }));

  it("follows featured path order without duplicates", () => {
    const paths = resolveFeaturedPathPresets(projects);
    const chapters = resolvePortfolioChapters(projects, paths);

    expect(chapters.map((chapter) => chapter.slug)).toEqual([
      "iam",
      "aslan-maps",
      "paravel",
      "pick",
      "reactor",
      "reactor-web",
      "reactor-admin",
      "atlassian-mcp",
      "aslan-verse",
      "news-clipping",
    ]);
  });

  it("extracts clean narrative text from markdown detail", () => {
    const projectsWithDetail = projects.map((project) =>
      project.slug === "aslan-maps"
        ? {
            ...project,
            detail:
              "# Intro\n\n아슬란의 프로젝트를 하나의 포트폴리오 지도로 설명합니다.\n\n- detail line",
          }
        : project,
    );

    const chapters = resolvePortfolioChapters(
      projectsWithDetail,
      resolveFeaturedPathPresets(projectsWithDetail),
    );
    const mapsChapter = chapters.find((chapter) => chapter.slug === "aslan-maps");

    expect(mapsChapter?.narrative).toBe(
      "아슬란의 프로젝트를 하나의 포트폴리오 지도로 설명합니다.",
    );
  });
});
