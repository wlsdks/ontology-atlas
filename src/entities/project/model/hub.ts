import type { Project } from './types';

/**
 * The slugs of projects flagged as hubs, computed at runtime from the `isHub` flag —
 * replacing the earlier hardcoded HUB_SLUGS constant.
 */
export function computeHubSlugs(projects: Project[]): string[] {
  return projects.filter((p) => p.isHub).map((p) => p.slug);
}

/**
 * Whether a dependency list depends on two or more hubs, which decides the SHARED
 * badge. The caller must pass the hubSlugs computed from the current project list.
 */
export function isSharedNode(dependencies: string[], hubSlugs: string[]): boolean {
  const matched = hubSlugs.filter((h) => dependencies.includes(h));
  return matched.length >= 2;
}
