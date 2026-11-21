import type { VaultDoc, VaultSourceFile } from '../../model/vault-manifest';
import {
  earliestCoveredDay,
  judgeSource,
  pushCoveringPages,
  writeUpFreshness,
  type SourceCompileState,
  type WriteUpFreshness,
} from './source-compile-state';
import { collectWikiCitations, isWikiPage, readPathArray, selectWikiPages, type LibraryWikiPage, type WikiCitation } from './wiki-page-facts';

/** Retained answers are revised through their own review workflow, not Compile. */
const WIKI_ANSWERS_PREFIX = 'wiki/answers/';

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
  /** For a `compiled` row, the local day index (days since 1970-01-01) of the earliest believable `compiled_at` among its covering pages; -1 otherwise. */
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
  notCompiledCount: number;
  staleCount: number;
  /** Sources every citing page read only part of, with the bytes still matching. */
  partialCount: number;
  /** Cited sources with a recorded hash that are not yet measured; `unreadable` rows are not retried. */
  pathsNeedingHash: string[];
  pairing: LibraryPairing;
  /** Which pages make each `compiled` row compiled; `map-reach.ts` reads it. */
  compiledBy: LibraryCompiledBy;
}

export interface LibraryOriginalLink {
  path: string;
  name: string;
  state: SourceCompileState | null;
}

export interface LibraryWriteUpLink {
  slug: string;
  title: string;
  freshness: WriteUpFreshness;
  /** Set on a `behind` link whose page recorded no hash for this source, so no change is claimed. */
  unhashed?: true;
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

interface KeptRow {
  source: VaultSourceFile;
  cited: WikiCitation[] | undefined;
  /** The hash as the map held it, so an unchanged one is recognised without lowercasing it again. */
  hash: string | undefined;
  unreadable: boolean;
  row: LibrarySourceRow;
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
    const link: LibraryWriteUpLink = {
      slug: citation.wikiSlug,
      title: titles.get(citation.wikiSlug) ?? citation.wikiSlug,
      freshness: writeUpFreshness(citation, actual),
    };
    if (citation.sourceHash === null) link.unhashed = true;
    bySlug.set(citation.wikiSlug, link);
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
