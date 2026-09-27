import type { Project } from './types';

/** Slugs of projects with `isHub`. */
export function computeHubSlugs(projects: Project[]): string[] {
  return projects.filter((p) => p.isHub).map((p) => p.slug);
}

/** Two or more hub dependencies earn the SHARED badge. */
export function isSharedNode(dependencies: string[], hubSlugs: string[]): boolean {
  const matched = hubSlugs.filter((h) => dependencies.includes(h));
  return matched.length >= 2;
}
