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
 * ⚠️ **An architecture profile is not a document in this list, including under 'all'.**
 *
 * `docs/ARCHITECTURE.md` and the 2026-08-26 decision "Architecture is a separate reviewed
 * contract and primary workbench destination" settle what it is: a parallel, non-ontology record
 * that carries no `kind:` and never becomes a Map node — "not an ontology kind and not an
 * overloaded ontology `document`". Docs is the ontology folder's reading surface, so a profile
 * showing up there is the same overload the decision refuses, just at a different door.
 *
 * It is also measurable rather than a matter of taste. Adding one profile to the storefront sample
 * put it first in that folder, Docs opened it, and `<main>` fell to 26 elements against a floor of
 * 40 (`a11y-vault-backed.spec.ts`) — the reading surface's opening screen became a twenty-line
 * frontmatter record. `/architecture` is where this content has a shape built for it.
 */
function isArchitectureProfile(doc: Pick<VaultDoc, 'frontmatter'>): boolean {
  return doc.frontmatter.architecture_schema === 'architecture-profile/v1';
}

export function filterDocsByCollection<T extends Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>>(
  docs: T[],
  collection: DocsVaultCollection,
): T[] {
  const readable = docs.filter((doc) => !isArchitectureProfile(doc));
  // 'all' means no filter — every document in this folder.
  if (collection === 'all') return readable;
  return readable.filter((doc) => resolveDocsVaultCollection(doc) === collection);
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
 */
export function resolveInitialDocsCollection<
  T extends Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>,
>(docs: T[], preferred: DocsVaultDocCollection = 'guides'): DocsVaultCollection {
  if (docs.length === 0) return preferred;
  return filterDocsByCollection(docs, preferred).length > 0 ? preferred : 'all';
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
