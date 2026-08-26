import type { VaultDoc } from '@/entities/docs-vault';
import type { DocsVaultSource } from './persistence';

export type DocsVaultCollection = 'all' | 'guides' | 'ontology';

/** The collection a document actually belongs to ('all' is a filter, not a document property). */
export type DocsVaultDocCollection = Exclude<DocsVaultCollection, 'all'>;

const ONTOLOGY_KINDS = new Set(['project', 'domain', 'capability', 'element']);

function hasOntologyDescribes(frontmatter: Pick<VaultDoc, 'frontmatter'>['frontmatter']): boolean {
  return Array.isArray(frontmatter.describes) && frontmatter.describes.length > 0;
}

export function resolveDocsVaultCollection(
  doc: Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>,
): DocsVaultDocCollection {
  const kind = String(doc.frontmatter.kind ?? '');
  if (
    ONTOLOGY_KINDS.has(kind) ||
    hasOntologyDescribes(doc.frontmatter) ||
    doc.path.startsWith('docs/ontology/') ||
    doc.slug.startsWith('ontology/')
  ) {
    return 'ontology';
  }
  return 'guides';
}

/**
 * ⚠️ **An architecture profile is listed here, but never the document Docs opens by itself.**
 *
 * This used to remove profiles from the list entirely, and that was an unrecorded overturn of the
 * standing 2026-08-26 record "Architecture is a separate reviewed contract and primary workbench
 * destination", whose §2 says in as many words that a profile "appears in Docs but never in the
 * ontology graph". The comment defending the removal cited a decision number the ledger has never
 * issued.
 *
 * The measured defect was real but narrower than the fix. The profile sorted first in its folder,
 * Docs **auto-opened** it, and `<main>` fell to 26 elements against a floor of 40
 * (`a11y-vault-backed.spec.ts`) — the reading surface's opening screen became a twenty-line
 * frontmatter record. That is a default-selection defect, not a membership one, so the exclusion
 * now lives only in the default-selection path. Removing it from the list also cost something
 * real: with drafting shipped, a person's brand-new profile would be invisible everywhere except
 * a surface they may not know exists.
 */
export function isArchitectureProfile(doc: Pick<VaultDoc, 'frontmatter'>): boolean {
  return doc.frontmatter.architecture_schema === 'architecture-profile/v1';
}

export function filterDocsByCollection<T extends Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>>(
  docs: T[],
  collection: DocsVaultCollection,
): T[] {
  // 'all' means no filter — every document in this folder.
  if (collection === 'all') return docs;
  return docs.filter((doc) => resolveDocsVaultCollection(doc) === collection);
}

/**
 * Which collection the first screen opens on — **it shows what it actually has**.
 *
 * The default `'guides'` meant "show the writing first", but in a vault where that collection has
 * zero entries (this repository's dogfood sample is one — everything is an ontology node) the
 * vault pill said "31 documents" while the list was empty. The screen was lying about its own
 * state, so this is an honesty defect rather than a matter of taste.
 *
 * With a genuinely empty vault there is no fallback — switching to `'all'` still gives zero, which
 * only churns state and gives the user nothing. That slot belongs to the empty-state copy.
 *
 * ⚠️ **Non-empty is not the same as having something to read.** Measured 2026-08-26, when
 * architecture profiles were restored to the list: the storefront sample's guides collection holds
 * exactly one document and it is a profile, which Docs must never open unattended. Choosing that
 * collection therefore opened nothing, and `<main>` fell below its element floor — the same thin
 * screen the floor was written to catch, arrived at from the other direction. The preference has
 * to be counted in readable documents.
 */
export function resolveInitialDocsCollection<
  T extends Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>,
>(docs: T[], preferred: DocsVaultDocCollection = 'guides'): DocsVaultCollection {
  if (docs.length === 0) return preferred;
  const readable = filterDocsByCollection(docs, preferred).filter(
    (doc) => !isArchitectureProfile(doc),
  );
  return readable.length > 0 ? preferred : 'all';
}

export function buildTagIndexForDocs(docs: Pick<VaultDoc, 'slug' | 'tags'>[]): Record<string, string[]> {
  const tags: Record<string, string[]> = {};
  for (const doc of docs) {
    for (const tag of doc.tags) {
      tags[tag] = [...(tags[tag] ?? []), doc.slug];
    }
  }
  return tags;
}

export function resolveDocsVaultSlugAlias(
  slug: string | null,
  docs: Pick<VaultDoc, 'slug'>[],
): string | null {
  if (!slug) return null;
  const slugs = new Set(docs.map((doc) => doc.slug));
  if (slugs.has(slug)) return slug;

  if (slug.startsWith('ontology/')) {
    const localSlug = slug.slice('ontology/'.length);
    if (slugs.has(localSlug)) return localSlug;
  } else {
    const packagedSlug = `ontology/${slug}`;
    if (slugs.has(packagedSlug)) return packagedSlug;
  }

  return slug;
}

export function shouldDeferDocsVaultDefaultSelection({
  normalizedQuerySlug,
  selectedSlug,
  selectionReady = true,
}: {
  normalizedQuerySlug: string | null;
  selectedSlug: string | null;
  selectionReady?: boolean;
}): boolean {
  if (!selectionReady) return true;
  return Boolean(normalizedQuerySlug && selectedSlug !== normalizedQuerySlug);
}

/**
 * Shows the "what is this docs surface and how do I use it" note only when landing in sample mode
 * (no vault chosen) without an explicit deeplink (`?slug=`). The default selection logic
 * (`README`/`FEATURES`/…) still picks a 100% English developer document, so this note gives context
 * above it first, keeping a non-developer visitor from bouncing on the first screen.
 *
 * The caller (`DocsVaultPage`) passes `dismissed` as true once the user explicitly selects a
 * document (a sidebar click, the palette, activating a tab — anything through `handleSelect`) —
 * having picked a real document once, it is not pushed again.
 */
export function shouldShowSampleWelcomeNote({
  source,
  normalizedQuerySlug,
  dismissed,
}: {
  source: DocsVaultSource;
  normalizedQuerySlug: string | null;
  dismissed: boolean;
}): boolean {
  return source === 'server' && !normalizedQuerySlug && !dismissed;
}
