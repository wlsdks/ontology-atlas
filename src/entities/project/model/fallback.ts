import type { Project, ProjectInput } from "./types";
import { SEED_PROJECTS } from "./seed-data";

function fallbackDate(offset: number) {
  return new Date(Date.UTC(2026, 3, 1 + offset, 0, 0, 0));
}

function toFallbackProject(input: ProjectInput, index: number): Project {
  return {
    slug: input.slug,
    name: input.name,
    nameEn: input.nameEn,
    category: input.category,
    status: input.status,
    description: input.description,
    detail: input.detail,
    tags: input.tags ?? [],
    stack: input.stack ?? [],
    links: input.links ?? [],
    dependencies: input.dependencies ?? [],
    owner: input.owner,
    icon: input.icon,
    screenshots: input.screenshots ?? [],
    timeline: input.timeline ?? {},
    progress: input.progress,
    isHub: input.isHub ?? false,
    position: input.position,
    createdAt: fallbackDate(index),
    updatedAt: fallbackDate(index + 1),
  };
}

export function resolveFallbackProjects(): Project[] {
  return SEED_PROJECTS.map(toFallbackProject);
}
