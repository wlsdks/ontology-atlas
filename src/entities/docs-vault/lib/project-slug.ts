import type { VaultDoc, VaultManifest } from "../model/types";

/**
 * `fm.slug` (trimmed) or the last path segment (`projects/foo` → `foo`); shared by project
 * derivation and the topology deeplink so `?p=` opens the right drawer.
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

/** Frontmatter `kind`, or a legacy `projects/` path. */
export function isProjectVaultDoc(doc: VaultDoc): boolean {
  return doc.frontmatter?.kind === "project" || doc.slug.startsWith("projects/");
}

/** `Project.slug` → its `VaultDoc`, the first hop of the lazy body load. */
export function findProjectVaultDoc(
  manifest: VaultManifest,
  slug: string,
): VaultDoc | null {
  return findProjectDocInList(manifest.docs, slug);
}

/** The same lookup from a doc list: `VaultDoc.slug` is path-based while `Project.slug` prefers frontmatter. */
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

/** The only project's slug, or null; stops at the second so every route can afford it. */
export function resolveSoleProjectSlug(docs: readonly VaultDoc[]): string | null {
  let only: string | null = null;
  for (const doc of docs) {
    if (!isProjectVaultDoc(doc)) continue;
    const slug = computeProjectSlug(doc);
    if (!slug) continue;
    if (only !== null) return null;
    only = slug;
  }
  return only;
}

/** Stops at the second project document. */
export function hasSeveralProjectDocs(docs: readonly VaultDoc[]): boolean {
  let seen = 0;
  for (const doc of docs) {
    if (!isProjectVaultDoc(doc)) continue;
    if (!computeProjectSlug(doc)) continue;
    seen += 1;
    if (seen > 1) return true;
  }
  return false;
}
