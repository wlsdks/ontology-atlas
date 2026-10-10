import type { VaultDoc } from '@/entities/docs-vault';
import type { DocsVaultSource } from './persistence';

export type DocsVaultCollection = 'all' | 'guides' | 'ontology';

/** 'all' is a filter, not a document property. */
export type DocsVaultDocCollection = Exclude<DocsVaultCollection, 'all'>;

const ONTOLOGY_KINDS = new Set(['project', 'domain', 'capability', 'element']);
const AUTHORABLE_ONTOLOGY_KINDS = new Set([
  'project',
  'domain',
  'capability',
  'element',
  'document',
]);

/**
 * The public schema's five `VAULT_KINDS` decide; location, `describes:` and path cannot
 * promote prose, and a kind-bearing node stays ontology anywhere. The `vault-readme` kind is a
 * reader sentinel, not an authorable kind.
 */
export function isAuthorableOntologyDocument(
  doc: Pick<VaultDoc, 'frontmatter'>,
): boolean {
  const kind = typeof doc.frontmatter.kind === 'string'
    ? doc.frontmatter.kind.trim()
    : '';
  return AUTHORABLE_ONTOLOGY_KINDS.has(kind);
}

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
 * Listed in Docs but never auto-opened: the 2026-08-26 architecture record says a profile
 * "appears in Docs but never in the ontology graph".
 */
export function isArchitectureProfile(doc: Pick<VaultDoc, 'frontmatter'>): boolean {
  return doc.frontmatter.architecture_schema === 'architecture-profile/v1';
}

/** An architecture profile is never the unattended first document (`a11y-vault-backed.spec.ts`). */
export function firstReadableSlug<T extends { slug: string; frontmatter: Record<string, unknown> }>(
  docs: readonly T[],
): string | undefined {
  // No fallback to `docs[0]`; callers handle "no document".
  return docs.find((doc) => !isArchitectureProfile(doc))?.slug;
}

export function filterDocsByCollection<T extends Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>>(
  docs: T[],
  collection: DocsVaultCollection,
): T[] {
  if (collection === 'all') return docs;
  return docs.filter((doc) => resolveDocsVaultCollection(doc) === collection);
}

/**
 * Open on a collection that has documents, so the first screen does not claim N documents over
 * an empty list. An empty vault keeps the preferred collection.
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

/** Maps saved slugs through the moved-document aliases, keeping order and dropping repeats. */
export function followMovedSlugs(slugs: readonly string[], aliases?: Record<string, string>): string[] {
  if (!aliases) return [...slugs];
  return [...new Set(slugs.map((slug) => aliases[slug] ?? slug))];
}

export function resolveDocsVaultSlugAlias(
  slug: string | null,
  docs: Pick<VaultDoc, 'slug'>[],
  aliases?: Record<string, string>,
): string | null {
  if (!slug) return null;
  const slugs = new Set(docs.map((doc) => doc.slug));
  if (slugs.has(slug)) return slug;
  const moved = aliases?.[slug];
  if (moved && slugs.has(moved)) return moved;

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
 * Only in sample mode without a `?slug=` deeplink, until the person picks a document
 * (`dismissed`), so a non-developer gets context above the English default document.
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
