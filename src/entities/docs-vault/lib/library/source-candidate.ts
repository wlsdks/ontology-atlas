/** The shape of a document a folder walk proposes, and the filters the page applies to the proposal. */

/**
 * Must equal Rust `DISCOVERY_MARKDOWN_EXTENSIONS`. Markdown is offered only from the open folder,
 * and never a file the vault index knows as a node (`withoutVaultOwnedMarkdown`).
 */
export const DISCOVERY_MARKDOWN_EXTENSIONS = ['md', 'markdown'] as const;

/** `'Plan.PDF'` → `'pdf'`; `''` without an extension. */
export function discoveryExtension(name: string): string {
  const at = name.lastIndexOf('.');
  return at > 0 ? name.slice(at + 1).toLowerCase() : '';
}

/** Why a folder walk passes a file over; mirrors Rust `SkipReason`. */
export type DiscoverySkipReason = 'secretName' | 'licence' | 'notDocument';

export function isMarkdownName(name: string): boolean {
  return (DISCOVERY_MARKDOWN_EXTENSIONS as readonly string[]).includes(discoveryExtension(name));
}

export interface SourceCandidate {
  /** Absolute root of the walked folder. */
  rootPath: string;
  /** The root's on-screen name. */
  rootLabel: string;
  /** Path relative to that root. */
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  mtime: number;
}

export interface SourceDiscoveryReport {
  candidates: SourceCandidate[];
  /** Whether the walk stopped at the cap. */
  truncated: boolean;
  /** Roots that could not be read. */
  unreadableRoots: string[];
}

/** Root plus relative path, since discovery never reads content to hash. */
export function candidateKey(candidate: SourceCandidate): string {
  // NUL cannot appear in a path, so keys never collide.
  return `${candidate.rootPath}\u0000${candidate.relativePath}`;
}

/**
 * Markdown the vault already owns is never offered: a `.md` file is kept only when the vault index
 * holds it without `kind:`, so nothing new is read and an unread file is not guessed at. Markdown
 * from any root but the open folder is dropped too: a bound code root's Markdown is developer
 * documentation.
 */
export function withoutVaultOwnedMarkdown(
  candidates: readonly SourceCandidate[],
  {
    openRootPath,
    docs,
  }: {
    openRootPath: string;
    docs: readonly { path: string; frontmatter: Record<string, unknown> }[];
  },
): SourceCandidate[] {
  const unowned = new Set<string>();
  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    if (typeof kind !== 'string' || kind.trim() === '') unowned.add(doc.path);
  }
  return candidates.filter((candidate) => {
    if (!isMarkdownName(candidate.name)) return true;
    if (candidate.rootPath !== openRootPath) return false;
    return candidate.extension !== 'md' || unowned.has(candidate.relativePath);
  });
}
