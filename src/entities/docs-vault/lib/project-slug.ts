import type { VaultDoc, VaultManifest } from "../model/types";

/**
 * vault doc → `Project.slug`. A truthy `fm.slug` wins (trimmed); otherwise the
 * file path decides:
 *   - `projects/foo` → `foo`
 *   - `ontology/project` → `project`
 *   - `bar` → `bar`
 *
 * `deriveProjectsFromVault` and `buildTopologyDeeplinkForDoc` must produce the same
 * answer or the topology `?p=` deeplink opens the wrong drawer, so this helper is
 * the single source both call.
 */
export function computeProjectSlug(doc: VaultDoc): string | null {
  const fm = doc.frontmatter ?? {};
  const fmSlugRaw = fm.slug;
  const fmSlug =
    typeof fmSlugRaw === "string" && fmSlugRaw.trim() ? fmSlugRaw.trim() : null;
  const fileSlug = doc.slug.startsWith("projects/")
    ? doc.slug.replace(/^projects\//, "")
    : doc.slug.split("/").pop() || doc.slug;
  return fmSlug ?? (fileSlug || null);
}

/**
 * The same project-doc test `deriveProjectsFromVault` uses (frontmatter `kind`
 * first, a `projects/` path for legacy compatibility). It was written out twice and
 * drifted; `findProjectVaultDoc` also sits on this helper.
 */
export function isProjectVaultDoc(doc: VaultDoc): boolean {
  return doc.frontmatter?.kind === "project" || doc.slug.startsWith("projects/");
}

/**
 * Looks a `VaultDoc` back up from a `Project.slug` (which prefers frontmatter
 * `slug:`). The raw markdown is not in the manifest — it lives in content.json
 * (static) or behind a file handle (local), keyed by `doc.slug` — so this is the
 * first hop of the lazy body load.
 */
export function findProjectVaultDoc(
  manifest: VaultManifest,
  slug: string,
): VaultDoc | null {
  return findProjectDocInList(manifest.docs, slug);
}

/**
 * The same lookup for surfaces that hold only `VaultDoc[]` and no manifest (the
 * `/projects` cards). They must go through this function.
 *
 * Measured defect, 2026-07-26: the `/projects` cards searched with
 * `docs.find(d => d.slug === project.slug)` directly. `VaultDoc.slug` is
 * **path-based** (`ontology/project`) while `Project.slug` comes from **frontmatter
 * `slug:`** (`ontology-atlas`), so any project that declared its slug never found
 * its document. The card said "this project has no description yet" while the detail
 * screen showed the description perfectly — two screens contradicting each other
 * about one project.
 */
export function findProjectDocInList(
  docs: readonly VaultDoc[],
  slug: string,
): VaultDoc | null {
  for (const doc of docs) {
    if (!isProjectVaultDoc(doc)) continue;
    if (computeProjectSlug(doc) === slug) return doc;
  }
  return null;
}
