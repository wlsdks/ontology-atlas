import type { VaultDoc } from '@/entities/docs-vault';
import { readDisplayLocales } from '@/shared/lib/locale-display-name';
import { nameIncludes, normalizeForMatch } from '@/shared/lib/node-name-match';

type DocsTreeQueryDoc = Pick<VaultDoc, 'title' | 'slug' | 'path' | 'frontmatter'>;

/** Match the document-name and address fields exposed by the vault tree. */
export function matchesDocsTreeQuery(doc: DocsTreeQueryDoc, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  if (
    nameIncludes(
      { title: doc.title, displayLocales: readDisplayLocales(doc.frontmatter) },
      normalizedQuery,
    )
  ) {
    return true;
  }
  return [doc.slug, doc.path].some((value) =>
    normalizeForMatch(value).includes(normalizedQuery),
  );
}
