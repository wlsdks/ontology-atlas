import type { Project } from '@/entities/project';
import type { SampleSource } from '@/shared/lib/sample-source';
import { deriveProjectsFromVault } from './derive-projects-from-vault';
import { resolveStaticVaultSource } from './static-vault-source';

/**
 * The project nodes of **every** bundled sample vault — the complete set of
 * `/project/[slug]/` addresses static export must generate.
 *
 * Measured 2026-08-01: `generateStaticParams` in
 * `app/[locale]/project/[slug]/page.tsx` took slugs only from the dogfood
 * manifest, so `/ko/project/ontology-atlas/` existed while
 * **`/ko/project/storefront/` was a 404** — the one demo the app promotes
 * everywhere had no canonical address, breaking sharing, bookmarks, and crawlers.
 *
 * Both bundled samples exist at build time regardless of what the user picks.
 * Which one they are looking at is a runtime preference (`demo:sample-source:v1`)
 * and is unrelated to whether an address exists, so route generation ignores the
 * preference and emits the full set.
 *
 * ⚠️ Use this **only for route generation and SSR seeding**. When a screen asks
 * "which vault am I showing?", the answer is still `useStaticVaultSource()` /
 * `resolveStaticVaultSource()` — mixing two vaults on one screen is the defect
 * that resolver exists to prevent.
 */
const BUNDLED_SOURCES: SampleSource[] = ['dogfood', 'storefront'];

export function deriveBundledProjects(): Project[] {
  const bySlug = new Map<string, Project>();
  for (const source of BUNDLED_SOURCES) {
    for (const project of deriveProjectsFromVault(resolveStaticVaultSource(source).manifest)) {
      // First wins — on a slug collision, dogfood is canonical.
      if (!bySlug.has(project.slug)) bySlug.set(project.slug, project);
    }
  }
  return [...bySlug.values()];
}

/** Every project slug static export must emit. One fallback keeps the build from breaking when empty. */
export function bundledProjectSlugs(): string[] {
  const slugs = deriveBundledProjects().map((p) => p.slug);
  return slugs.length > 0 ? slugs : ['iam'];
}
