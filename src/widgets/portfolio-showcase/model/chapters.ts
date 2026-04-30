import type { Project, ProjectCategory } from "@/entities/project";
import type { FeaturedPathPreset } from "@/widgets/featured-paths/model/presets";

export interface PortfolioChapter {
  slug: string;
  pathId: string;
  pathLabel: string;
  pathSummary: string;
  focusedHubSlug: string | null;
  category: ProjectCategory | null;
  title: string;
  eyebrow: string;
  description: string;
  narrative: string;
  screenshot: string | null;
  icon: string | null;
  tags: string[];
  stack: string[];
  isHub: boolean;
  owner: string | null;
  updatedAt: Date;
}

export function resolvePortfolioChapters(
  projects: Project[],
  paths: FeaturedPathPreset[],
): PortfolioChapter[] {
  const bySlug = new Map(projects.map((project) => [project.slug, project]));
  const chapters: PortfolioChapter[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    for (const step of path.steps) {
      if (seen.has(step.slug)) continue;
      const project = bySlug.get(step.slug);
      if (!project) continue;
      seen.add(step.slug);
      chapters.push({
        slug: project.slug,
        pathId: path.id,
        pathLabel: path.label,
        pathSummary: path.summary,
        focusedHubSlug: path.focusedHubSlug,
        category: path.category,
        title: project.name,
        eyebrow: project.isHub ? `${path.label} core` : path.label,
        description: project.description,
        narrative: resolveNarrative(project, path.summary),
        screenshot: project.screenshots[0] ?? null,
        icon: project.icon ?? null,
        tags: project.tags.slice(0, 3),
        stack: project.stack.slice(0, 3),
        isHub: project.isHub,
        owner: project.owner ?? null,
        updatedAt: project.updatedAt,
      });
    }
  }

  if (chapters.length > 0) {
    return chapters;
  }

  return projects.slice(0, 6).map((project) => ({
    slug: project.slug,
    pathId: "default",
    pathLabel: "포트폴리오",
    pathSummary: "Demo 의 주요 시스템을 빠르게 훑는 기본 포트폴리오 순서",
    focusedHubSlug: project.isHub ? project.slug : null,
    category: project.category,
    title: project.name,
    eyebrow: project.isHub ? "핵심 허브" : "포트폴리오",
    description: project.description,
    narrative: resolveNarrative(project, project.description),
    screenshot: project.screenshots[0] ?? null,
    icon: project.icon ?? null,
    tags: project.tags.slice(0, 3),
    stack: project.stack.slice(0, 3),
    isHub: project.isHub,
    owner: project.owner ?? null,
    updatedAt: project.updatedAt,
  }));
}

function resolveNarrative(project: Project, fallback: string) {
  const source = project.detail?.trim() || fallback;
  const normalized = source
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block.length > 18 || block.includes(" "));

  if (!normalized) {
    return project.description;
  }

  const firstLine = normalized
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  const narrative = firstLine || normalized;

  return narrative.length > 180
    ? `${narrative.slice(0, 177).trimEnd()}…`
    : narrative;
}
