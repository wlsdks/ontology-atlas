/**
 * Resolves a relative `.md` link in the /docs viewer, or a vault-escaping link
 * like `../mcp/README.md` resolves against the route and 404s. Absolute URLs, anchors and non-md paths
 * pass through; known slugs route internally; others stay unresolved.
 */

export type ResolvedDocLink =
  | { kind: 'internal'; slug: string; anchor?: string }
  | { kind: 'unresolved' }
  | { kind: 'passthrough' };

export interface ResolveDocLinkParams {
  href: string;
  fromSlug: string;
  vaultSlugs: Set<string>;
}

/**
 * Percent-decode then NFC-normalise a path segment; a truncated `%` returns the raw value, or a
 * throw would stop the document rendering.
 */
function decodeVaultPath(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    /* Truncated percent sequence — leave the raw value. */
  }
  return decoded.normalize('NFC');
}

export function resolveDocLink({
  href,
  fromSlug,
  vaultSlugs,
}: ResolveDocLinkParams): ResolvedDocLink {
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return { kind: 'passthrough' };
  }
  const [rawTarget, rawAnchor] = href.split('#');
  /*
   * Percent-decode and NFC-normalise both sides: the parser passes Hangul slugs encoded and macOS
   * stores NFD.
   */
  const target = decodeVaultPath(rawTarget);
  const anchor = rawAnchor ? decodeVaultPath(rawAnchor) : undefined;
  if (!target || !target.endsWith('.md')) {
    return { kind: 'passthrough' };
  }

  const fromDir = fromSlug.includes('/')
    ? fromSlug.slice(0, fromSlug.lastIndexOf('/'))
    : '';
  const rel = target.replace(/^\.\//, '');
  const joined = fromDir ? `${fromDir}/${rel}` : rel;

  // Normalise while deciding whether it escapes the vault root. `..` meeting an empty stack is an escape.
  const stack: string[] = [];
  let escaped = false;
  for (const seg of joined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length === 0 || stack[stack.length - 1] === '..') {
        escaped = true;
        stack.push('..');
      } else {
        stack.pop();
      }
      continue;
    }
    stack.push(seg);
  }

  if (!escaped) {
    const slug = stack.join('/').replace(/\.md$/, '');
    if (vaultSlugs.has(slug)) {
      return { kind: 'internal', slug, anchor };
    }
  }

  return { kind: 'unresolved' };
}

export const ONTOLOGY_ATLAS_REPO_BLOB_BASE =
  'https://github.com/wlsdks/ontology-atlas/blob/main';

export function githubBlobUrl(
  repoRelativePath: string,
  base: string = ONTOLOGY_ATLAS_REPO_BLOB_BASE,
): string {
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = repoRelativePath.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}
