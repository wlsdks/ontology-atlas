import type { Project, ProjectInput } from './types';

/**
 * `Project` → `ProjectInput`.
 *
 * Used when patching one field of an existing project and carrying the rest through,
 * as in inline editing. Arrays and nested objects are rebuilt rather than shared by
 * reference, which keeps the result deterministic.
 */
export function projectToInput(project: Project): ProjectInput {
  return {
    slug: project.slug,
    name: project.name,
    description: project.description,
    // Never invent a taxonomy fact the vault lacked during conversion. The form's
    // defaults for a new project are decided form-locally, and any path that rewrites
    // an existing project must preserve the omission.
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
