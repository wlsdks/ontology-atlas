/**
 * Sorts authored Markdown into guides, documents a guide cites (transitively), and documents
 * nothing cites. Only a literal path in a guide counts; a rule's `paths:` glob is not a citation.
 */

interface DocumentReachFolder {
  folder: string;
  count: number;
}

export interface DocumentReach {
  /** Authored Markdown files found, after the stated exclusions. */
  total: number;
  guides: number;
  /** Documents a guide names directly. */
  namedDirect: number;
  /** Hops until the citation walk reached a fixpoint. */
  hops: number;
  /** Codex copies of declared byte-identical skills, so they are not counted as distinct guides. */
  mirroredGuides: number;
  named: number;
  unnamed: number;
  /** Unnamed documents by folder, most first. */
  unnamedByFolder: readonly DocumentReachFolder[];
  /** Folders left out of `total`, named on screen. */
  excluded: readonly string[];
  /** The walk hit its bound, so counts are floors. */
  truncated: boolean;
}

const GUIDE_PATTERNS: readonly RegExp[] = Object.freeze([
  /^CLAUDE\.md$/,
  /^AGENTS\.md$/,
  /^GEMINI\.md$/,
  /^[^/]+\/AGENTS\.md$/,
  /^\.claude\/rules\/.+\.md$/,
  /^\.claude\/skills\/.+\.mdc?$/,
  /^\.agents\/skills\/.+\.mdc?$/,
  /^\.cursor\/rules\/.+\.mdc$/,
  /^\.github\/copilot-instructions\.md$/,
]);

/** A document read without being asked; agent briefs load by name only, so they are not guides. */
function isGuideDocument(path: string): boolean {
  return GUIDE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Markdown path tokens, found in one pass over the text rather than one regex per candidate. The
 * boundary keeps `cli/README.md` from also citing the root `README.md`.
 */
const MARKDOWN_PATH_TOKEN = /(?:^|[^\w./-])([A-Za-z0-9_][A-Za-z0-9_./-]*\.mdc?)(?![\w])/g;

function citedPaths(text: string): Set<string> {
  const out = new Set<string>();
  MARKDOWN_PATH_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_PATH_TOKEN.exec(String(text ?? ''))) !== null) out.add(match[1]);
  return out;
}

/** Whether `path` appears in `text` as a whole path, not the tail of a longer one. */
export function citesPath(text: string, path: string): boolean {
  return citedPaths(text).has(path);
}

export interface DocumentReachInput {
  /** Every authored Markdown path found, repo-relative. */
  markdownPaths: readonly string[];
  /** Text of every document the walk reads. */
  contents: ReadonlyMap<string, string>;
  excluded: readonly string[];
  truncated: boolean;
  /** Awaited before each hop so the caller can yield the main thread. */
  onHop?: (hop: number) => Promise<void> | void;
}

/** Walks citations to a fixpoint and reports direct and reachable counts. */
export async function buildDocumentReach({
  markdownPaths,
  contents,
  excluded,
  truncated,
  onHop,
}: DocumentReachInput): Promise<DocumentReach> {
  const guides = markdownPaths.filter(isGuideDocument);
  const rest = markdownPaths.filter((path) => !isGuideDocument(path));

  const remaining = new Set(rest);
  const reached = new Set<string>();
  let frontier = guides.map((path) => contents.get(path) ?? '').join('\n');
  let namedDirect = 0;
  let hops = 0;
  while (frontier) {
    hops += 1;
    await onHop?.(hops);
    const cited = citedPaths(frontier);
    const found: string[] = [];
    for (const path of cited) {
      if (remaining.delete(path)) found.push(path);
    }
    if (hops === 1) namedDirect = found.length;
    if (found.length === 0) break;
    for (const path of found) reached.add(path);
    frontier = found.map((path) => contents.get(path) ?? '').join('\n');
  }

  const named = rest.filter((path) => reached.has(path));
  const unnamed = rest.filter((path) => !reached.has(path));

  const byFolder = new Map<string, number>();
  for (const path of unnamed) {
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
  }

  return {
    total: markdownPaths.length,
    guides: guides.length,
    namedDirect,
    hops,
    mirroredGuides: guides.filter((path) => path.startsWith('.agents/skills/')).length,
    named: named.length,
    unnamed: unnamed.length,
    unnamedByFolder: [...byFolder]
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder)),
    excluded,
    truncated,
  };
}
