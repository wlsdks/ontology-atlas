import type { Project, ProjectInput } from './types';

/** `Project` → `ProjectInput` with copied arrays and nested objects, for editing one field. */
export function projectToInput(project: Project): ProjectInput {
  return {
    slug: project.slug,
    name: project.name,
    description: project.description,
    // Never invent a taxonomy value the vault lacked; an omission must survive a rewrite.
    category: project.category,
    status: project.status,
    owner: project.owner,
    isHub: project.isHub ?? false,
    progress: project.progress,
    tags: [...project.tags],
    stack: [...project.stack],
    dependencies: [...project.dependencies],
    timeline: project.timeline ? { ...project.timeline } : {},
    links: project.links.map((l) => ({ ...l })),
    screenshots: [...project.screenshots],
    position: project.position
      ? { x: project.position.x, y: project.position.y }
      : { x: 0, y: 0 },
  };
}
