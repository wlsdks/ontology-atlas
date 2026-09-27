import type { Project } from '@/entities/project';
import type { SampleSource } from '@/shared/lib/sample-source';
import { deriveProjectsFromVault } from './derive-projects-from-vault';
import { resolveStaticVaultSource } from './static-vault-source';

/**
 * Every bundled sample's project nodes: the full set of `/project/[slug]/` routes static export
 * must generate. Only for route generation and SSR seeding; screens ask `resolveStaticVaultSource()`.
 */
const BUNDLED_SOURCES: SampleSource[] = ['dogfood', 'storefront'];

export function deriveBundledProjects(): Project[] {
  const bySlug = new Map<string, Project>();
  for (const source of BUNDLED_SOURCES) {
    for (const project of deriveProjectsFromVault(resolveStaticVaultSource(source).manifest)) {
      // On a slug collision, dogfood is canonical.
      if (!bySlug.has(project.slug)) bySlug.set(project.slug, project);
    }
  }
  return [...bySlug.values()];
}

/** Every slug static export must emit; one fallback keeps an empty build from breaking. */
export function bundledProjectSlugs(): string[] {
  const slugs = deriveBundledProjects().map((p) => p.slug);
  return slugs.length > 0 ? slugs : ['iam'];
}
