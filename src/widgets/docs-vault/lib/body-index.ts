import type { VaultDoc } from '@/entities/docs-vault';

/**
 * One entry of the palette's in-memory body index: `raw` for snippets, `lower` normalised once at
 * index time so each keystroke is a linear indexOf, `key` from docBodyCacheKey. Snippets assume raw
 * and lower have equal length; rare length-changing lowercase characters can shift the highlight.
 */
export interface DocsBodyEntry {
  raw: string;
  lower: string;
  key: string;
}

export type DocsBodyIndex = ReadonlyMap<string, DocsBodyEntry>;

/**
 * Strip the leading frontmatter block (already searched in the metadata tier); same rule as
 * DocsVaultViewer.
 */
export function stripFrontmatterBlock(text: string): string {
  if (!text.startsWith('---')) return text;
  return text.replace(/^---[\s\S]*?\n---\n?/, '').replace(/^\r?\n+/, '');
}

export function buildBodyEntry(rawFileText: string, key: string): DocsBodyEntry {
  const raw = stripFrontmatterBlock(rawFileText);
  return { raw, lower: raw.toLowerCase(), key };
}

/**
 * Change key per document: mtime for a local vault, updatedAt for a static one, so unchanged bodies
 * are not re-read.
 */
export function docBodyCacheKey(doc: VaultDoc): string {
  return `${doc.slug}@${doc.mtime ?? doc.updatedAt}`;
}
