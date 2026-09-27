/**
 * Resolves a relative `.md` link in the /docs viewer, or a vault-escaping link like
 * `../mcp/README.md` resolves against the route and 404s. Absolute URLs, anchors and non-md paths
 * pass through; known slugs route internally; others go to a GitHub blob with repoBlobBase, else
 * stay unresolved.
 */

export type ResolvedDocLink =
  | { kind: 'internal'; slug: string; anchor?: string }
  | { kind: 'external'; url: string }
  | { kind: 'unresolved' }
  | { kind: 'passthrough' };

export interface ResolveDocLinkParams {
  /** The markdown link's raw href. */
  href: string;
  /** The vault slug of the document containing this link (e.g. `README`, `ontology/project`). */
  fromSlug: string;
  /** Every slug present in the vault (used to decide internal vs external). */
  vaultSlugs: Set<string>;
  /**
   * Base for a vault-external GitHub blob URL; undefined for a local vault, where such links stay
   * unresolved.
   */
  repoBlobBase?: string;
  /**
   * Where this vault sits in the repo (bundled docs vault = `docs`); needed with repoBlobBase for
   * external URLs.
   */
  vaultRepoRoot?: string;
}

/** posix path normalisation — drop `.` and empty segments, pop the parent for `..` where possible. */
function collapsePath(pathStr: string): string {
  const out: string[] = [];
  for (const seg of pathStr.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
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
  repoBlobBase,
  vaultRepoRoot,
}: ResolveDocLinkParams): ResolvedDocLink {
  // Absolute URLs, protocols and anchor-only links are not the resolver's business.
  if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return { kind: 'passthrough' };
  }
  const [rawTarget, rawAnchor] = href.split('#');
  /*
   * Percent-decode and NFC-normalise both sides: the parser passes Hangul slugs encoded and macOS
   * stores NFD (same judgement as `cli/src/commands/validate.mjs`).
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

  // Outside the vault or an unknown internal slug: external GitHub blob when the repo location is
  // known, otherwise unresolved.
  if (repoBlobBase && vaultRepoRoot !== undefined) {
    const repoRel = collapsePath(`${vaultRepoRoot}/${joined}`);
    const base = repoBlobBase.replace(/\/+$/, '');
    const url = `${base}/${repoRel}${anchor ? `#${anchor}` : ''}`;
    return { kind: 'external', url };
  }
  return { kind: 'unresolved' };
}

/** The blob base and vault root of the public repo the bundled docs vault (`docs/**`) belongs to. */
export const ONTOLOGY_ATLAS_REPO_BLOB_BASE =
  'https://github.com/wlsdks/ontology-atlas/blob/main';
export const DOCS_VAULT_REPO_ROOT = 'docs';

export function githubBlobUrl(
  repoRelativePath: string,
  base: string = ONTOLOGY_ATLAS_REPO_BLOB_BASE,
): string {
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = repoRelativePath.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}
