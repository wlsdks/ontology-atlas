import type { Project } from '@/entities/project';
import type { SampleSource } from '@/shared/lib/vault-folder/sample-source';
import { deriveProjectsFromVault } from '../projects/derive-projects-from-vault';
import { resolveStaticVaultSource } from './static-vault-source';

/**
 * Every bundled sample's project nodes: the full set of `/project/[slug]/` routes static export
 * must generate. Only for route generation and SSR seeding; screens ask `resolveStaticVaultSource()`,
 * or one screen would mix two vaults.
 */
const BUNDLED_SOURCES: SampleSource[] = ['dogfood', 'storefront'];

/**
 * Samples that describe no real product (storefront is a fictional shop for learning the map).
 * Their project pages still render but are noindex and stay out of the sitemap.
 */
const DEMO_SOURCES: ReadonlySet<SampleSource> = new Set<SampleSource>(['storefront']);

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

/** The bundled projects that describe a real product: the sitemap's project set, each indexable. */
export function deriveIndexedProjects(): Project[] {
  const real = new Set(
    BUNDLED_SOURCES.filter((source) => !DEMO_SOURCES.has(source)).flatMap((source) =>
      deriveProjectsFromVault(resolveStaticVaultSource(source).manifest).map((project) => project.slug),
    ),
  );
  return deriveBundledProjects().filter((project) => real.has(project.slug));
}
