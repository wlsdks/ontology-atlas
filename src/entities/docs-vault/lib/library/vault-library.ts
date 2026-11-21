import { isWikiFurnitureSlug } from '@/shared/lib/library/wiki-page-schema';

import { recordedLocalDay } from './source-progress';

import type { VaultDoc, VaultSourceFile } from '../../model/types';

/**
 * The two vault file kinds that are not the graph: raw sources under `sources/` and wiki pages
 * under `wiki/` (no `kind:`). A page's `sources`, `source_hash` and `sources_truncated` say
 * whether its write-up still matches the file on disk.
 */

/** The top-level wiki folder, anchored at the root like `VAULT_SOURCES_DIR`. */
const VAULT_WIKI_DIR = 'wiki';

/** Retained answers are revised through their own review workflow, not Compile. */
const WIKI_ANSWERS_PREFIX = 'wiki/answers/';

/**
 * `stale` covers a hash mismatch and a missing hash; `partial` means the matching page read only
 * part of the file; `checking` is transient until the file is hashed; `unreadable` is a cited file
 * Atlas could not open to hash, so it can never be proven compiled.
 */
export type SourceCompileState =
  | 'not-compiled'
  | 'compiled'
  | 'partial'
  | 'stale'
  | 'checking'
  | 'unreadable';

interface WikiCitation {
  wikiSlug: string;
  /** Vault-relative path of the cited source (`sources/quarter-plan.pdf`), NFC-normalised. */
  sourcePath: string;
  /** The sha256 that page recorded for this source, or null when it recorded none. */
  sourceHash: string | null;
  /** True when that page recorded this source under `sources_truncated`. */
  truncated: boolean;
  /** Local day index of the citing page's `compiled_at`, or -1 when it has no believable one. */
  compiledDay: number;
  /** The citing page's index in `LibraryModel.wikiPages`, or -1 when it is not listed there. */
  page: number;
}

export interface LibraryWikiPage {
  slug: string;
  title: string;
  sourcePaths: string[];
  createdBy: string | null;
  compiledAt: string | null;
  /** The page's summary and tags, which the web's search matches beside the title. */
  summary?: string;
  tags?: string[];
  /**
   * The concept slugs the page says it is about, trimmed and in NFC, as written: `null` when the
   * page has no `describes:` list, and empty when a writer checked and found none. Entries are not
   * resolved here; `map-reach.ts` resolves them against the folder's concepts. Optional so
   * hand-built pages need not carry it; absent reads as `null`.
   */
  describes?: readonly string[] | null;
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

/**
 * Citation paths in NFC, as the folder walk names files (`walk-vault.ts`): a page written on macOS
 * may hold decomposed Hangul, which would otherwise never match its file.
 */
function readPathArray(value: unknown): string[] {
  return readStringArray(value).map(toNfc);
}

const NON_ASCII = /[^\u0000-\u007f]/;

/** ASCII is already NFC, and nearly every path is ASCII, so most paths skip the ICU call. */
function toNfc(path: string): string {
  return NON_ASCII.test(path) ? path.normalize('NFC') : path;
}

const NO_CONCEPT: readonly string[] = Object.freeze([]);

/**
 * `describes:` as `LibraryWikiPage.describes` holds it. Nearly every list is already trimmed NFC
 * strings, and then the frontmatter's own array is kept rather than copied, so 50,000 pages add no
 * array. A scalar is not a list and is not read as a link, as the wiki schema reports it.
 */
function readDescribes(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return NO_CONCEPT;
  for (const entry of value) {
    if (typeof entry !== 'string' || entry !== entry.trim() || toNfc(entry) !== entry) {
      // Non-strings are dropped and empty strings kept, as `validateWikiPage` reads the list.
      return value.filter((item): item is string => typeof item === 'string').map((item) => toNfc(item.trim()));
    }
  }
  return value as string[];
}

function readHashMap(value: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, hash] of Object.entries(value as Record<string, unknown>)) {
    if (typeof hash === 'string' && hash.trim()) {
      out.set(toNfc(key.trim()), hash.trim().toLowerCase());
    }
  }
  return out;
}

function readCompiledAt(doc: VaultDoc): string | null {
  const value = doc.frontmatter.compiled_at;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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
    sourcePaths: readPathArray(doc.frontmatter.sources),
    createdBy:
      typeof doc.frontmatter.created_by === 'string' && doc.frontmatter.created_by.trim()
        ? doc.frontmatter.created_by.trim()
        : null,
    compiledAt: readCompiledAt(doc),
    summary: doc.description || doc.definitionPreview || '',
    tags: doc.tags,
    describes: readDescribes(doc.frontmatter.describes),
  }));
}

function collectWikiCitations(
  docs: readonly VaultDoc[],
  offsetMinutes: ((epochMs: number) => number) | undefined,
): Map<string, WikiCitation[]> {
  const out = new Map<string, WikiCitation[]>();
  // Pages written in one run share one `compiled_at`, so each distinct string is parsed once.
  const days = new Map<string, number>();
  const dayOf = (value: string | null): number => {
    if (value === null) return -1;
    let day = days.get(value);
    if (day === undefined) {
      day = recordedLocalDay(value, offsetMinutes) ?? -1;
      days.set(value, day);
    }
    return day;
  };
  // Counts listed pages in `selectWikiPages`'s order, so a citation can name its page by index.
  let listed = 0;
  for (const doc of docs) {
    if (!isWikiPage(doc)) continue;
    const page = isWikiFurnitureSlug(doc.slug) ? -1 : listed++;
    const hashes = readHashMap(doc.frontmatter.source_hash);
    // Same scalar tolerance as `sources:`.
    const truncated = new Set(readPathArray(doc.frontmatter.sources_truncated));
    const compiledDay = dayOf(readCompiledAt(doc));
    for (const sourcePath of readPathArray(doc.frontmatter.sources)) {
      const citation: WikiCitation = {
        wikiSlug: doc.slug,
        sourcePath,
        sourceHash: hashes.get(sourcePath) ?? null,
        truncated: truncated.has(sourcePath),
        compiledDay,
        page,
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
 * `compiled`; `partial` needs every matching page truncated; `stale` outranks `partial`. A file
 * that could not be hashed is `unreadable` where it would otherwise wait in `checking`.
 */
function judgeSource(
  citations: readonly WikiCitation[] | undefined,
  actualHash: string | undefined,
  unreadable: boolean,
): SourceCompileState {
  if (!citations || citations.length === 0) return 'not-compiled';
  const hashed = citations.filter((citation) => citation.sourceHash !== null);
  // A citation without a hash cannot prove coverage, so it is stale.
  if (hashed.length === 0) return 'stale';
  if (actualHash === undefined) return unreadable ? 'unreadable' : 'checking';
  const matching = hashed.filter((citation) => citation.sourceHash === actualHash);
  if (matching.length === 0) return 'stale';
  return matching.some((citation) => !citation.truncated) ? 'compiled' : 'partial';
}

/** The earliest believable day among the pages that make a source `compiled`, or -1. */
function earliestCoveredDay(citations: readonly WikiCitation[], actualHash: string): number {
  let earliest = -1;
  for (const citation of citations) {
    if (citation.sourceHash !== actualHash || citation.truncated || citation.compiledDay < 0) continue;
    if (earliest < 0 || citation.compiledDay < earliest) earliest = citation.compiledDay;
  }
  return earliest;
}

/**
 * Appends the listed pages whose whole, hash-matching citation makes a source `compiled`; a page
 * that cites the same path twice is appended once, since its citations sit side by side.
 */
function pushCoveringPages(out: number[], citations: readonly WikiCitation[], actualHash: string): void {
  let last = -1;
  for (const citation of citations) {
    if (citation.sourceHash !== actualHash || citation.truncated || citation.page < 0 || citation.page === last) continue;
    out.push(citation.page);
    last = citation.page;
  }
}

/**
 * For source row `i`, the indices into `wikiPages` of the pages that make it `compiled` are
 * `pages[offsets[i]]` up to, not including, `pages[offsets[i + 1]]`; a row in any other state has an
 * empty range. Two typed arrays rather than a list per row, so 50,000 rows add about 8 bytes each.
 */
export interface LibraryCompiledBy {
  /** `sources.length + 1` entries. */
  offsets: Int32Array;
  pages: Int32Array;
}

export interface LibrarySourceRow extends VaultSourceFile {
  state: SourceCompileState;
  citedBy: string[];
  /**
   * For a `compiled` row, the local day index (days since 1970-01-01) of the earliest believable
   * `compiled_at` among the pages that cover it; -1 otherwise. One number, so 50,000 rows cost one
   * slot each. Optional so hand-built rows need not carry it.
   */
  compiledDay?: number;
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
  /** Cited sources with a recorded hash that are not yet measured; `unreadable` rows are not retried. */
  pathsNeedingHash: string[];
  /** Both crossings between a source and the pages written from it. */
  pairing: LibraryPairing;
  /** Which pages make each `compiled` row compiled; `map-reach.ts` reads it. */
  compiledBy: LibraryCompiledBy;
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

/** What the manifest alone decides; kept while the manifest's `docs` array is the same one. */
interface DocsFacts {
  citations: Map<string, WikiCitation[]>;
  wikiPages: LibraryWikiPage[];
  titles: Map<string, string>;
  /** Each wiki page, furniture included, with the source paths it cites; a repeated slug keeps its last. */
  pathsBySlug: Map<string, string[]>;
}

function docsFacts(docs: readonly VaultDoc[], offsetMinutes: ((epochMs: number) => number) | undefined): DocsFacts {
  const titles = new Map<string, string>();
  const pathsBySlug = new Map<string, string[]>();
  for (const doc of docs) {
    if (!isWikiPage(doc)) continue;
    titles.set(doc.slug, doc.title);
    pathsBySlug.set(doc.slug, readPathArray(doc.frontmatter.sources));
  }
  return { citations: collectWikiCitations(docs, offsetMinutes), wikiPages: selectWikiPages(docs), titles, pathsBySlug };
}

function sameSource(a: VaultSourceFile, b: VaultSourceFile): boolean {
  return a === b || (a.path === b.path && a.name === b.name && a.format === b.format && a.bytes === b.bytes && a.mtime === b.mtime);
}

function sameCitations(a: readonly WikiCitation[] | undefined, b: readonly WikiCitation[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.wikiSlug !== y.wikiSlug || x.sourcePath !== y.sourcePath || x.sourceHash !== y.sourceHash || x.truncated !== y.truncated || x.compiledDay !== y.compiledDay || x.page !== y.page) return false;
  }
  return true;
}

/** One source row with what it was judged from, so the next build reuses it while those hold. */
interface KeptRow {
  source: VaultSourceFile;
  cited: WikiCitation[] | undefined;
  /** The hash as the map held it, so an unchanged one is recognised without lowercasing it again. */
  hash: string | undefined;
  unreadable: boolean;
  row: LibrarySourceRow;
  /** The listed pages that make the row `compiled`, for `compiledBy`. */
  covering: readonly number[];
}

const NO_PAGES: readonly number[] = Object.freeze([]);

function sourceRow(source: VaultSourceFile, cited: WikiCitation[] | undefined, hash: string | undefined, unreadable: boolean): KeptRow {
  const actual = hash?.toLowerCase();
  const state = judgeSource(cited, actual, unreadable);
  const compiled = state === 'compiled' && cited !== undefined && actual !== undefined;
  const covering: number[] = [];
  if (compiled) pushCoveringPages(covering, cited, actual);
  const row: LibrarySourceRow = {
    ...source,
    state,
    compiledDay: compiled ? earliestCoveredDay(cited, actual) : -1,
    citedBy: [...new Set((cited ?? []).map((citation) => citation.wikiSlug))].sort(),
    reviewPages: actual === undefined ? [] : [...new Set((cited ?? [])
      .filter((citation) => citation.sourceHash !== actual && !citation.wikiSlug.startsWith(WIKI_ANSWERS_PREFIX))
      .map((citation) => citation.wikiSlug))].sort(),
  };
  return { source, cited, hash, unreadable, row, covering: covering.length > 0 ? covering : NO_PAGES };
}

function writeUpsOf(cited: readonly WikiCitation[], actual: string | undefined, titles: ReadonlyMap<string, string>): LibraryWriteUpLink[] {
  const bySlug = new Map<string, LibraryWriteUpLink>();
  for (const citation of cited) {
    bySlug.set(citation.wikiSlug, {
      slug: citation.wikiSlug,
      title: titles.get(citation.wikiSlug) ?? citation.wikiSlug,
      freshness: writeUpFreshness(citation, actual),
    });
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

function originalsOf(paths: readonly string[], stateOf: (path: string) => SourceCompileState | null): LibraryOriginalLink[] {
  return paths.map((path) => ({ path, name: path.split('/').pop() || path, state: stateOf(path) }));
}

type LibraryModelInput = {
  sources: readonly VaultSourceFile[] | undefined;
  docs: readonly VaultDoc[];
  hashes: ReadonlyMap<string, string>;
  /** Paths whose file could not be opened to hash this session. */
  unreadable?: ReadonlySet<string>;
  /** Minutes east of UTC at an instant, for `compiledDay`; defaults to the runtime's zone. */
  offsetMinutes?: (epochMs: number) => number;
};

/**
 * Derived from the manifest and known hashes; the only held state is a session hash cache, since a
 * second canonical store is refused (`.claude/rules/forbidden.md`).
 */
export function buildLibraryModel(input: LibraryModelInput): LibraryModel {
  return createLibraryModelBuilder()(input);
}

/**
 * `buildLibraryModel` that keeps its last answer. While `docs` and `sources` are the same arrays, a
 * call compares each row's hash and readability, O(sources), and rebuilds only the rows, page lists
 * and write-up lists whose inputs changed; anything else rebuilds everything once. `hashes` names
 * only paths in `sources`, as the Library measures them.
 */
export function createLibraryModelBuilder(): (input: LibraryModelInput) => LibraryModel {
  let keptDocs: readonly VaultDoc[] | null = null;
  let keptSources: readonly VaultSourceFile[] | null = null;
  let keptOffset: LibraryModelInput['offsetMinutes'];
  let facts: DocsFacts | null = null;
  let rows: KeptRow[] = [];
  let pairing: LibraryPairing | null = null;

  return ({ sources, docs, hashes, unreadable, offsetMinutes }) => {
    const list = sources ?? [];
    if (facts === null || docs !== keptDocs || offsetMinutes !== keptOffset) {
      facts = docsFacts(docs, offsetMinutes);
      pairing = null;
    }
    if (list !== keptSources) pairing = null;
    keptDocs = docs;
    keptOffset = offsetMinutes;
    const { citations, wikiPages, titles, pathsBySlug } = facts;

    // Same arrays: rows pair by position. New arrays: by path, kept while their inputs are equal by
    // value, so an unchanged source keeps its row object and consumers can skip it by identity.
    const samePositions = pairing !== null;
    const kept = rows;
    let keptByPath: Map<string, KeptRow> | null = null;
    const nextRows: KeptRow[] = [];
    const restated = new Set<string>();
    const rehashed = new Set<string>();
    const offsets = new Int32Array(list.length + 1);
    const covering: number[] = [];
    for (let index = 0; index < list.length; index += 1) {
      const source = list[index]!;
      const cited = citations.get(source.path);
      const hash = hashes.get(source.path);
      const isUnreadable = unreadable?.has(source.path) ?? false;
      let before: KeptRow | undefined = kept[index];
      if (!samePositions && before?.source.path !== source.path) {
        keptByPath ??= new Map(kept.map((entry) => [entry.source.path, entry] as const));
        before = keptByPath.get(source.path);
      }
      let row = before;
      const reusable = samePositions
        ? row !== undefined && row.source === source && row.cited === cited
        : row !== undefined && sameSource(row.source, source) && sameCitations(row.cited, cited);
      if (!row || !reusable || row.hash !== hash || row.unreadable !== isUnreadable) {
        row = sourceRow(source, cited, hash, isUnreadable);
        if (before && before.row.state !== row.row.state) restated.add(source.path);
        if (before && before.hash !== hash) rehashed.add(source.path);
      } else if (row.source !== source || row.cited !== cited) {
        row = { ...row, source, cited };
      }
      nextRows.push(row);
      for (const page of row.covering) covering.push(page);
      offsets[index + 1] = covering.length;
    }
    rows = nextRows;
    const sourceRows = nextRows.map((row) => row.row);

    if (pairing === null) {
      const stateByPath = new Map(sourceRows.map((row) => [row.path, row.state] as const));
      const stateOf = (path: string) => stateByPath.get(path) ?? null;
      pairing = {
        originalsByWiki: new Map([...pathsBySlug].map(([slug, paths]) => [slug, originalsOf(paths, stateOf)] as const)),
        writeUpsBySource: new Map([...citations].map(([path, cited]) => [path, writeUpsOf(cited, hashes.get(path)?.toLowerCase(), titles)] as const)),
      };
    } else if (restated.size > 0 || rehashed.size > 0) {
      const stateByPath = new Map(sourceRows.map((row) => [row.path, row.state] as const));
      const stateOf = (path: string) => stateByPath.get(path) ?? null;
      const originalsByWiki = new Map(pairing.originalsByWiki);
      for (const path of restated) {
        for (const citation of citations.get(path) ?? []) {
          originalsByWiki.set(citation.wikiSlug, originalsOf(pathsBySlug.get(citation.wikiSlug) ?? [], stateOf));
        }
      }
      const writeUpsBySource = new Map(pairing.writeUpsBySource);
      for (const path of rehashed) {
        const cited = citations.get(path);
        if (cited) writeUpsBySource.set(path, writeUpsOf(cited, hashes.get(path)?.toLowerCase(), titles));
      }
      pairing = { originalsByWiki, writeUpsBySource };
    }
    keptSources = list;

    const count = (judge: (row: LibrarySourceRow) => boolean) => {
      let total = 0;
      for (const row of sourceRows) if (judge(row)) total += 1;
      return total;
    };
    return {
      sources: sourceRows,
      wikiPages,
      needsCompileCount: count(sourceNeedsCompile),
      notCompiledCount: count((row) => row.state === 'not-compiled'),
      staleCount: count((row) => row.state === 'stale'),
      partialCount: count((row) => row.state === 'partial'),
      // `checking` rows are exactly the paths worth hashing; an mtime change drops a cached hash.
      pathsNeedingHash: sourceRows.filter((row) => row.state === 'checking').map((row) => row.path),
      pairing: { originalsByWiki: pairing.originalsByWiki, writeUpsBySource: pairing.writeUpsBySource },
      compiledBy: { offsets, pages: Int32Array.from(covering) },
    };
  };
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

