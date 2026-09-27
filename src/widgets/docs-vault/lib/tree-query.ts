import type { VaultDoc } from '@/entities/docs-vault';
import { readDisplayLocales } from '@/shared/lib/locale-display-name';
import { findNameMatch, normalizeForMatch, type NodeNameSource } from '@/shared/lib/node-name-match';

type DocsTreeQueryDoc = Pick<VaultDoc, 'title' | 'slug' | 'path' | 'frontmatter'>;

/**
 * Name source memoised per document: `findNameMatch` caches on the object it receives, so a fresh
 * literal per keystroke would cache nothing.
 */
const NAME_SOURCE = new WeakMap<object, NodeNameSource>();

function nameSource(doc: DocsTreeQueryDoc): NodeNameSource {
  const cached = NAME_SOURCE.get(doc);
  if (cached) return cached;
  const source: NodeNameSource = {
    title: doc.title,
    displayLocales: readDisplayLocales(doc.frontmatter),
  };
  NAME_SOURCE.set(doc, source);
  return source;
}

/**
 * Matches the tree's name and address fields with the palette's rule (`findNameMatch`);
 * `shared/lib/hangul-match` bounds the Hangul keyboard states.
 */
export function matchesDocsTreeQuery(doc: DocsTreeQueryDoc, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  if (findNameMatch(nameSource(doc), normalizedQuery)) return true;
  return [doc.slug, doc.path].some((value) =>
    normalizeForMatch(value).includes(normalizedQuery),
  );
}
