import type { VaultDoc } from '@/entities/docs-vault';

/**
 * One unit of the in-memory index the palette searches bodies with.
 *
 * - `raw` — the body with frontmatter stripped (for snippet display).
 * - `lower` — a lowercased copy. Lowercasing once at index time avoids
 *   re-normalising per keystroke (305 docs × ~6KB ≈ 1.2ms/key); after
 *   pre-normalising, a linear `indexOf` scan measures ~0.1–0.2ms/key, which is
 *   enough without an inverted index.
 * - `key` — a {@link docBodyCacheKey} value. An unchanged mtime skips the re-read.
 *
 * Note: snippets are cut on the assumption that raw and lower have the same
 * length (offset compatibility). For the handful of Unicode characters where
 * toLowerCase changes length (İ and friends) the highlight can slip a character
 * or two — search itself is unaffected.
 */
export interface DocsBodyEntry {
  raw: string;
  lower: string;
  key: string;
}

export type DocsBodyIndex = ReadonlyMap<string, DocsBodyEntry>;

/**
 * Strip the leading frontmatter block. title and tags are already searched in the
 * metadata tier, so the body index does not double-count them. Same rule as
 * DocsVaultViewer's render preprocessing (`^---…\n---`).
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
 * Per-document cache key — a local vault detects change by mtime (the file's
 * lastModified) and a static vault by updatedAt (computed at build time). This is
 * what lets an unchanged document skip its body re-read after a polling diff
 * rebuild.
 */
export function docBodyCacheKey(doc: VaultDoc): string {
  return `${doc.slug}@${doc.mtime ?? doc.updatedAt}`;
}
