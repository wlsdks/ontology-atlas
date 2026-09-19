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

/**
 * The slug of the folder's **only** project, or null when it holds none or several.
 *
 * `<project>/atlas` is the standard folder shape, so most folders hold exactly one project and the
 * Projects door has nothing to choose between: it opens that project rather than a list of one row
 * above an empty screen (2026-09-19, decision "With one project, the Projects door opens that
 * project"). Deriving the whole `Project[]` to learn that would map every document on every route
 * the rail is drawn on, so this walks once and stops at the second.
 */
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

/**
 * Whether the folder holds more than one project document.
 *
 * The connected-projects card asks "which other project is this one tied to", and a folder with a
 * single project cannot answer it: connecting needs a second project to exist, so the card's empty
 * state is permanent and sits at the top of the rail saying so forever. This walks once and stops
 * at the second document, the same way `resolveSoleProjectSlug` does, because both run on every
 * render of a project page.
 */
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
