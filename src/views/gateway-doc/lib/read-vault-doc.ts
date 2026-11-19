import { resolveStaticVaultSource } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';

/**
 * Reads the vault documents the gateway's reading pages render. Called by the route's server
 * component, which hands the text to `GatewayDocPage` as props: the bundled vault JSON is a static
 * import here, so a client module must never import this file or every guide page ships it.
 */

/**
 * Vault slug to raw markdown, or `null`. `'dogfood'` is pinned: the guide and changelog are this
 * product's documents, not the chosen sample's. The resolver is still used (importing the raw JSON
 * would break its contract); only the argument is fixed.
 */
export function readVaultDoc(slug: string): string | null {
  const { content, contentPreviews } = resolveStaticVaultSource('dogfood');
  const doc = content[slug];
  if (typeof doc === 'string') return withoutFrontmatter(doc);
  // A document not fully bundled (CHANGELOG) is read from its truncated preview; the folded count comes from `readVaultDocOmittedSections`.
  const preview = contentPreviews?.[slug];
  return typeof preview?.body === 'string' ? preview.body : null;
}

/** Frontmatter is metadata for the Library and `pnpm docs:meta`; the public site renders the body only. */
function withoutFrontmatter(raw: string): string {
  return raw.startsWith('---') ? parseFrontmatter(raw).body.replace(/^(\r?\n)+/, '') : raw;
}

/**
 * Sections already folded at bundle time in `readVaultDoc(slug)`'s body. `GatewayDocPage` adds its
 * own fold to this, or the bundle's truncation would go unstated.
 */
export function readVaultDocOmittedSections(slug: string): number {
  const { contentPreviews } = resolveStaticVaultSource('dogfood');
  return contentPreviews?.[slug]?.omittedSections ?? 0;
}

/** What `GatewayDocPage` draws: the document and the sections already folded when it was bundled. */
export interface GatewayDocument {
  /** Markdown without frontmatter, or `null` when the slug names no bundled document. */
  raw: string | null;
  bundledOmittedSections: number;
  /** The locale the body is written in; the page marks a body in another language than its own. */
  language: string;
}

/** Vault documents are the English source. */
export function readGatewayDocument(slug: string): GatewayDocument {
  return { raw: readVaultDoc(slug), bundledOmittedSections: readVaultDocOmittedSections(slug), language: 'en' };
}
