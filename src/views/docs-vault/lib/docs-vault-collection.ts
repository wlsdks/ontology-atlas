import type { VaultDoc } from '@/entities/docs-vault';

export type DocsVaultCollection = 'guides' | 'ontology';

const ONTOLOGY_KINDS = new Set(['project', 'domain', 'capability', 'element']);

function hasOntologyDescribes(frontmatter: Pick<VaultDoc, 'frontmatter'>['frontmatter']): boolean {
  return Array.isArray(frontmatter.describes) && frontmatter.describes.length > 0;
}

export function resolveDocsVaultCollection(
  doc: Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>,
): DocsVaultCollection {
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

export function filterDocsByCollection<T extends Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>>(
  docs: T[],
  collection: DocsVaultCollection,
): T[] {
  return docs.filter((doc) => resolveDocsVaultCollection(doc) === collection);
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
}: {
  normalizedQuerySlug: string | null;
  selectedSlug: string | null;
}): boolean {
  return Boolean(normalizedQuerySlug && selectedSlug !== normalizedQuerySlug);
}
