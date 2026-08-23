/**
 * The docs viewer's markdown link resolver, extracted as a pure function so it can
 * be unit tested.
 *
 * It decides how the `/docs` viewer's `a` component handles a relative `.md` link.
 * The regression it exists for: a relative path pointing **outside** the vault
 * (say `docs/`) — a link that escapes the vault root with `..`, like
 * `../mcp/README.md` — rendered straight into `<a href>` is interpreted by the
 * browser relative to the current route (`/ko/docs/`) as `/ko/mcp/README.md` and
 * falls into the app's 404. That is why the link to the MCP registration doc
 * (`mcp/README.md`) was dead.
 *
 * Decision rules:
 *   - absolute URL (http(s)://…) · anchor (`#…`) · non-md path → passthrough
 *   - vault-internal relative path with a known slug → internal (app routing)
 *   - escapes the vault root, or is internal with an unknown slug →
 *       · with a repoBlobBase, external (GitHub blob, new tab)
 *       · without one (a local vault, repo location unknown), unresolved — rendered
 *         without routing rather than as a dead 404
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
   * The base used to turn a vault-external relative path into a GitHub blob URL
   * (e.g. `https://github.com/wlsdks/ontology-atlas/blob/main`). Undefined where the
   * repo location is unknown, as in a local vault — then it is unresolved.
   */
  repoBlobBase?: string;
  /**
   * Where this vault sits inside the repo (the bundled docs vault = `docs`). An
   * external URL is only built when this is present alongside repoBlobBase.
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
 * Put a vault path segment into a comparable form — **percent-decode plus NFC**.
 *
 * Decoding has to come first for normalisation to apply to real characters. A
 * truncated percent sequence (`%`) makes `decodeURIComponent` throw, so the raw
 * value is returned — a throw here means the whole document does not render.
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
   * ⚠️ **Percent-decode and normalise to NFC** (measured fix, 2026-08-08).
   *
   * The markdown parser passes link URLs percent-encoded —
   * `../capabilities/sweep-verification-procedure.md` arrives as `%EC%8A%A4%EC%9C%95…`. That string
   * is not in the vault's slug set, so **every link to a Hangul slug fell through
   * to "unknown document"**. An ASCII slug has nothing to encode and stays fine, so
   * this defect appears only in a vault with Hangul (or space, or non-ASCII) slugs —
   * our samples were ASCII, so nobody saw it.
   *
   * The same defect was caught first on the wikilink side (`DocsVaultViewer`); this
   * revives **hand-written standard links** too.
   *
   * NFC is matched as well: Hangul splits into NFC/NFD depending on origin (the
   * macOS filesystem uses NFD), so the characters are identical while the strings
   * do not match. Normalising only one side leaves that state intact
   * (`cli/src/commands/validate.mjs` records the same judgement).
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

  // Getting here means either outside the vault (escape) or internal with an unknown
  // slug. With the repo location known, an external GitHub blob link; otherwise unresolved.
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

/** A repo-root-relative path as a GitHub blob URL. Reused for canonical shortcuts (mcp/README and so on). */
export function githubBlobUrl(
  repoRelativePath: string,
  base: string = ONTOLOGY_ATLAS_REPO_BLOB_BASE,
): string {
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = repoRelativePath.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}
