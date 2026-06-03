import type { VaultDoc } from '@/entities/docs-vault';

export type DocsVaultCollection = 'guides' | 'ontology';

const ONTOLOGY_KINDS = new Set(['project', 'domain', 'capability', 'element']);

export function resolveDocsVaultCollection(
  doc: Pick<VaultDoc, 'frontmatter' | 'path' | 'slug'>,
): DocsVaultCollection {
  const kind = String(doc.frontmatter.kind ?? '');
  if (
    ONTOLOGY_KINDS.has(kind) ||
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
