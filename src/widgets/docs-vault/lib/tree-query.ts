import type { VaultDoc } from '@/entities/docs-vault';
import { readDisplayLocales } from '@/shared/lib/locale-display-name';
import { findNameMatch, normalizeForMatch, type NodeNameSource } from '@/shared/lib/node-name-match';

type DocsTreeQueryDoc = Pick<VaultDoc, 'title' | 'slug' | 'path' | 'frontmatter'>;

/**
 * The document's names, built once per document and kept.
 *
 * `findNameMatch` caches its work on the object it is handed, so handing it a fresh
 * literal on every keystroke would cache nothing. The document itself is the stable
 * object, so the name source is memoised against it.
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
 * Match the document-name and address fields exposed by the vault tree.
 *
 * **The palette's name rule, not a second one** (2026-09-19). This box and the `⌘K`
 * palette sit on the same vault, and this one answered nothing to a chosung query or
 * a half-typed syllable that the palette resolved. `findNameMatch` is that one rule;
 * `shared/lib/hangul-match` says why it is bounded to those two keyboard states.
 */
export function matchesDocsTreeQuery(doc: DocsTreeQueryDoc, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  if (findNameMatch(nameSource(doc), normalizedQuery)) return true;
  return [doc.slug, doc.path].some((value) =>
    normalizeForMatch(value).includes(normalizedQuery),
  );
}
