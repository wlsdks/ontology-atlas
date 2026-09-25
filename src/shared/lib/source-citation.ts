/**
 * The wikilink sentinel must look like a query. `react-markdown` removes unknown
 * URL schemes, while a query survives its URL sanitiser.
 */
export const WIKILINK_SENTINEL = '?wikilink=';

/** Keep markdown link destinations unambiguous while leaving decoding to the renderer. */
function encodeWikilinkPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Marks a wikilink whose author wrote no `|label`. Its text is then the target itself, which
 * for a `[[src:…]]` citation is an address (`src:sources/budget.md#l5`), not words — so the
 * renderer has to know the text is only a stand-in. An encoded slug never contains a bare
 * `&`, so the mark cannot collide with one.
 */
const UNLABELLED_MARK = '&unlabelled';

/** Turn Obsidian-style wikilinks into markdown links that ReactMarkdown can render. */
export function rewriteWikilinks(markdown: string): string {
  return markdown.replace(
    /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
    (_, target: string, label?: string) => {
      const text = (label ?? target).trim();
      const clean = target.trim();
      const [rawSlug, rawAnchor] = clean.split('#');
      const slug = decodeWikilinkSlug(rawSlug);
      const anchor = rawAnchor ? decodeWikilinkSlug(rawAnchor) : undefined;
      const mark = label === undefined ? UNLABELLED_MARK : '';
      return `[${text}](${WIKILINK_SENTINEL}${encodeWikilinkPart(slug)}${mark}${anchor ? `#${encodeWikilinkPart(anchor)}` : ''})`;
    },
  );
}

export interface WikilinkHref {
  /** The target before `#`, still percent-encoded as the markdown renderer hands it over. */
  rawSlug: string;
  /** The part after `#`, still percent-encoded. */
  rawAnchor?: string;
  /** `false` when the author wrote no `|label`, so the link's text is the target itself. */
  labelled: boolean;
}

/**
 * Read back a destination `rewriteWikilinks` wrote. Every renderer of the rewritten Markdown
 * parses it here, so the unlabelled mark is stripped before a slug is resolved.
 */
export function parseWikilinkHref(href: string): WikilinkHref | null {
  if (!href.startsWith(WIKILINK_SENTINEL)) return null;
  const spec = href.slice(WIKILINK_SENTINEL.length);
  const hash = spec.indexOf('#');
  const head = hash < 0 ? spec : spec.slice(0, hash);
  const rawAnchor = hash < 0 ? undefined : spec.slice(hash + 1);
  const labelled = !head.endsWith(UNLABELLED_MARK);
  return {
    rawSlug: labelled ? head : head.slice(0, -UNLABELLED_MARK.length),
    rawAnchor: rawAnchor || undefined,
    labelled,
  };
}

/** Decode one wikilink segment and use the filesystem-safe NFC representation. */
export function decodeWikilinkSlug(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A truncated percent sequence must not prevent the document from rendering.
  }
  return decoded.normalize('NFC');
}

/** Preserve the exact path supplied by the parent while matching citations by NFC. */
export function normalizeOriginalPaths(
  paths: ReadonlySet<string> | undefined,
): ReadonlyMap<string, string> | undefined {
  if (paths === undefined) return undefined;
  return new Map(
    [...paths].map((path) => [path.normalize('NFC'), path] as const),
  );
}

/** Resolve only an allow-listed, non-traversing path inside the source namespace. */
function resolveKnownOriginalPath(
  sourcePath: string,
  knownPaths: ReadonlyMap<string, string>,
): string | null {
  if (!sourcePath.startsWith('sources/')) return null;
  const segments = sourcePath.split('/');
  if (
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || segment.includes('\\'),
    )
  ) {
    return null;
  }
  return knownPaths.get(sourcePath.normalize('NFC')) ?? null;
}

type SourceCitationStatus = 'known' | 'missing' | 'unavailable';

export interface SourceCitationResolution {
  /** The decoded citation path used in status copy and missing-source reports. */
  rawPath: string;
  anchor?: string;
  /** The exact path from the parent allow-list when status is `known`. */
  path: string | null;
  status: SourceCitationStatus;
}

/**
 * Apply the source-navigation contract shared by the document viewer and answer comparison.
 * A source is only considered missing when the parent supplied both an allow-list and a
 * navigator; without both, the honest state is unavailable. Returns `null` for ordinary
 * wikilinks so callers can keep their existing handling for those targets.
 */
export function resolveSourceCitation(
  rawWikiSlug: string,
  rawAnchor: string | undefined,
  knownPaths: ReadonlyMap<string, string> | undefined,
  canNavigate: boolean,
): SourceCitationResolution | null {
  const wikiSlug = decodeWikilinkSlug(rawWikiSlug);
  if (!wikiSlug.startsWith('src:')) return null;

  const rawSourcePath = wikiSlug.slice('src:'.length);
  const anchor = rawAnchor ? decodeWikilinkSlug(rawAnchor) : undefined;
  const navigationAvailable = knownPaths !== undefined && canNavigate;
  const path = navigationAvailable
    ? resolveKnownOriginalPath(rawSourcePath, knownPaths)
    : null;

  return {
    rawPath: rawSourcePath,
    anchor,
    path,
    status: !navigationAvailable ? 'unavailable' : path ? 'known' : 'missing',
  };
}
