import { isWikiFurnitureSlug } from '@/shared/lib/wiki-page-schema';

import type { VaultDoc, VaultSourceFile } from '../model/types';

/**
 * The two vault file kinds that are not the graph: raw sources under `sources/` and wiki pages
 * under `wiki/` (no `kind:`). A page's `sources`, `source_hash` and `sources_truncated` say
 * whether its write-up still matches the file on disk. Vault file kinds: `docs/DECISIONS.md`.
 */

/** The top-level wiki folder, anchored at the root like `VAULT_SOURCES_DIR`. */
const VAULT_WIKI_DIR = 'wiki';

/** Retained answers are revised through their own review workflow, not Compile. */
const WIKI_ANSWERS_PREFIX = 'wiki/answers/';

/**
 * `stale` covers a hash mismatch and a missing hash; `partial` means the matching page read only
 * part of the file; `checking` is transient until the file is hashed.
 */
type SourceCompileState = 'not-compiled' | 'compiled' | 'partial' | 'stale' | 'checking';

interface WikiCitation {
  wikiSlug: string;
  /** Vault-relative path of the cited source (`sources/quarter-plan.pdf`). */
  sourcePath: string;
  /** The sha256 that page recorded for this source, or null when it recorded none. */
  sourceHash: string | null;
  /** True when that page recorded this source under `sources_truncated`. */
  truncated: boolean;
}

export interface LibraryWikiPage {
  slug: string;
  title: string;
  sourcePaths: string[];
  createdBy: string | null;
  compiledAt: string | null;
}

export function isWikiPage(doc: VaultDoc): boolean {
  if (!doc.slug.startsWith(`${VAULT_WIKI_DIR}/`)) return false;
  const kind = doc.frontmatter.kind;
  // A `kind:` under `wiki/` is a misfiled ontology node, which must stay visible as a concept.
  return typeof kind !== 'string' || kind.trim() === '';
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim());
  }
  // A scalar citation is the commonest hand-edit; read it as one entry.
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function readHashMap(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, hash] of Object.entries(value as Record<string, unknown>)) {
    if (typeof hash === 'string' && hash.trim()) out.set(key.trim(), hash.trim().toLowerCase());
  }
  return out;
}

/** A listed wiki page: under `wiki/`, no `kind:`, and not the shipped `_template.md`. */
function isListedWikiPage(doc: VaultDoc): boolean {
  return isWikiPage(doc) && !isWikiFurnitureSlug(doc.slug);
}

/** Wiki pages counted by the Wiki list's own rule, so screens agree. */
export function countWikiPages(docs: readonly VaultDoc[]): number {
  let count = 0;
  for (const doc of docs) if (isListedWikiPage(doc)) count += 1;
  return count;
}

export function selectWikiPages(docs: readonly VaultDoc[]): LibraryWikiPage[] {
  return docs.filter(isListedWikiPage).map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    sourcePaths: readStringArray(doc.frontmatter.sources),
    createdBy:
      typeof doc.frontmatter.created_by === 'string' && doc.frontmatter.created_by.trim()
        ? doc.frontmatter.created_by.trim()
        : null,
    compiledAt:
      typeof doc.frontmatter.compiled_at === 'string' && doc.frontmatter.compiled_at.trim()
        ? doc.frontmatter.compiled_at.trim()
        : null,
  }));
}

function collectWikiCitations(
  docs: readonly VaultDoc[],
): Map<string, WikiCitation[]> {
  const out = new Map<string, WikiCitation[]>();
  for (const doc of docs) {
    if (!isWikiPage(doc)) continue;
    const hashes = readHashMap(doc.frontmatter.source_hash);
    // Same scalar tolerance as `sources:`.
    const truncated = new Set(readStringArray(doc.frontmatter.sources_truncated));
    for (const sourcePath of readStringArray(doc.frontmatter.sources)) {
      const citation: WikiCitation = {
        wikiSlug: doc.slug,
        sourcePath,
        sourceHash: hashes.get(sourcePath) ?? null,
        truncated: truncated.has(sourcePath),
      };
      const list = out.get(sourcePath);
      if (list) list.push(citation);
      else out.set(sourcePath, [citation]);
    }
  }
  return out;
}

/**
 * `actualHash` is undefined until hashed; only cited files are hashed. Any matching page makes it
 * `compiled`; `partial` needs every matching page truncated; `stale` outranks `partial`.
 */
function deriveSourceState(
  citations: readonly WikiCitation[] | undefined,
  actualHash: string | undefined,
): SourceCompileState {
  if (!citations || citations.length === 0) return 'not-compiled';
  const hashed = citations.filter((citation) => citation.sourceHash !== null);
  // A citation without a hash cannot prove coverage, so it is stale.
  if (hashed.length === 0) return 'stale';
  if (actualHash === undefined) return 'checking';
  const matching = hashed.filter((citation) => citation.sourceHash === actualHash.toLowerCase());
  if (matching.length === 0) return 'stale';
  return matching.some((citation) => !citation.truncated) ? 'compiled' : 'partial';
}

export interface LibrarySourceRow extends VaultSourceFile {
  state: SourceCompileState;
  citedBy: string[];
  /** Compilable pages with a different source receipt; retained answers are reviewed elsewhere. */
  reviewPages?: string[];
}

/** Source coverage and the currency of every citing page are separate obligations. */
export function sourceNeedsCompile(row: LibrarySourceRow): boolean {
  return row.state === 'not-compiled' || row.state === 'stale' || row.state === 'partial' ||
    (row.reviewPages?.length ?? 0) > 0;
}

export interface LibraryModel {
  sources: LibrarySourceRow[];
  wikiPages: LibraryWikiPage[];
  /** Sources in `not-compiled`, `partial` or `stale`: the count Compile acts on. */
  needsCompileCount: number;
  /** Sources nobody has written up, named apart from `staleCount`. */
  notCompiledCount: number;
  /** Sources whose page cites a hash the bytes no longer match. */
  staleCount: number;
  /** Sources every citing page read only part of, with the bytes still matching. */
  partialCount: number;
  /** Cited sources with a recorded hash that are not yet measured. */
  pathsNeedingHash: string[];
  /** Both crossings between a source and the pages written from it. */
  pairing: LibraryPairing;
}

/**
 * Derived from the manifest and known hashes; the only held state is a session hash cache, since a
 * second canonical store is refused (`.claude/rules/forbidden.md`).
 */
export function buildLibraryModel({
  sources,
  docs,
  hashes,
}: {
  sources: readonly VaultSourceFile[] | undefined;
  docs: readonly VaultDoc[];
  hashes: ReadonlyMap<string, string>;
}): LibraryModel {
  const citations = collectWikiCitations(docs);
  const rows: LibrarySourceRow[] = (sources ?? []).map((source) => {
    const cited = citations.get(source.path);
    const actual = hashes.get(source.path)?.toLowerCase();
    return {
      ...source,
      state: deriveSourceState(cited, hashes.get(source.path)),
      citedBy: [...new Set((cited ?? []).map((citation) => citation.wikiSlug))].sort(),
      reviewPages: actual === undefined ? [] : [...new Set((cited ?? [])
        .filter((citation) => citation.sourceHash !== actual && !citation.wikiSlug.startsWith(WIKI_ANSWERS_PREFIX))
        .map((citation) => citation.wikiSlug))].sort(),
    };
  });
  return {
    sources: rows,
    wikiPages: selectWikiPages(docs),
    needsCompileCount: rows.filter(sourceNeedsCompile).length,
    notCompiledCount: rows.filter((row) => row.state === 'not-compiled').length,
    staleCount: rows.filter((row) => row.state === 'stale').length,
    partialCount: rows.filter((row) => row.state === 'partial').length,
    // `checking` rows are exactly the paths worth hashing; an mtime change drops a cached hash.
    pathsNeedingHash: rows.filter((row) => row.state === 'checking').map((row) => row.path),
    pairing: buildLibraryPairing({ docs, sources, hashes }),
  };
}

/** `1536` → `1.5 KB`; locale-independent. */
export function formatSourceBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export interface LibraryOriginalLink {
  path: string;
  /** File name, or the whole path when the citation has no `/`. */
  name: string;
  /** The cited file's state, or `null` when no such file is in this folder. */
  state: SourceCompileState | null;
}

/**
 * `unchecked`: a hash was recorded but the file is not measured; permanent when hashing is
 * impossible, so it must not collapse into `behind`.
 */
type WriteUpFreshness = 'current' | 'partial' | 'behind' | 'unchecked';

function writeUpFreshness(citation: WikiCitation, actualHash: string | undefined): WriteUpFreshness {
  if (citation.sourceHash === null) return 'behind';
  if (actualHash === undefined) return 'unchecked';
  if (citation.sourceHash !== actualHash) return 'behind';
  return citation.truncated ? 'partial' : 'current';
}

export interface LibraryWriteUpLink {
  slug: string;
  title: string;
  freshness: WriteUpFreshness;
}

interface LibraryPairing {
  /** Wiki slug → the sources it cites. */
  originalsByWiki: Map<string, LibraryOriginalLink[]>;
  /** Source path → citing wiki pages, in slug order. */
  writeUpsBySource: Map<string, LibraryWriteUpLink[]>;
}

/** Both pairing directions from the manifest and the lazily filled hash map. */
function buildLibraryPairing({
  docs,
  sources,
  hashes,
}: {
  docs: readonly VaultDoc[];
  sources: readonly VaultSourceFile[] | undefined;
  hashes: ReadonlyMap<string, string>;
}): LibraryPairing {
  const present = new Map((sources ?? []).map((source) => [source.path, source] as const));
  const citations = collectWikiCitations(docs);
  const titles = new Map<string, string>();
  const originalsByWiki = new Map<string, LibraryOriginalLink[]>();

  for (const doc of docs) {
    if (!isWikiPage(doc)) continue;
    titles.set(doc.slug, doc.title);
    originalsByWiki.set(
      doc.slug,
      readStringArray(doc.frontmatter.sources).map((path) => ({
        path,
        name: path.split('/').pop() || path,
        state: present.has(path)
          ? deriveSourceState(citations.get(path), hashes.get(path))
          : null,
      })),
    );
  }

  const writeUpsBySource = new Map<string, LibraryWriteUpLink[]>();
  for (const [path, cited] of citations) {
    const actual = hashes.get(path)?.toLowerCase();
    const bySlug = new Map<string, LibraryWriteUpLink>();
    for (const citation of cited) {
      bySlug.set(citation.wikiSlug, {
        slug: citation.wikiSlug,
        title: titles.get(citation.wikiSlug) ?? citation.wikiSlug,
        freshness: writeUpFreshness(citation, actual),
      });
    }
    writeUpsBySource.set(
      path,
      [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    );
  }

  return { originalsByWiki, writeUpsBySource };
}

/** Newest `compiled_at` first, then slug, so hand-written folders still get a stable answer. */
export function newestWikiPage(
  pages: readonly LibraryWikiPage[],
): LibraryWikiPage | null {
  let best: LibraryWikiPage | null = null;
  for (const page of pages) {
    if (best === null) {
      best = page;
      continue;
    }
    const left = page.compiledAt ?? '';
    const right = best.compiledAt ?? '';
    if (left > right || (left === right && page.slug.localeCompare(best.slug) < 0)) best = page;
  }
  return best;
}

/** Formats by file count; extensionless files count under `''` so totals match. */
export function countSourceFormats(
  sources: readonly VaultSourceFile[],
): Array<{ format: string; count: number }> {
  const totals = new Map<string, number>();
  for (const source of sources) {
    const key = source.format.toLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([format, count]) => ({ format, count }))
    .sort((a, b) => (b.count - a.count) || a.format.localeCompare(b.format));
}

