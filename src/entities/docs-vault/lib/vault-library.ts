import type { VaultDoc, VaultSourceFile } from '../model/types';

/**
 * The library — the two vault file kinds that are not the graph.
 *
 * `docs/DECISIONS.md`, 2026-09-05: *a vault holds three kinds of file and only one is
 * the graph.* A **raw source** under `sources/` is what a document said, kept verbatim.
 * A **wiki page** under `wiki/` is what we made of it: ordinary Markdown with **no
 * `kind:`**, so `deriveDocNode` returns null for it and the map never draws it. An
 * ontology node has `kind:` and remains the only graph truth.
 *
 * Everything in this file is pure. It answers one question about a raw source — *has
 * anybody written it up, and does that write-up still match the file on disk?* — from
 * two frontmatter fields on the wiki pages:
 *
 * ```yaml
 * ---
 * created_by: agent:claude
 * sources: [sources/quarter-plan.pdf]
 * source_hash:
 *   sources/quarter-plan.pdf: 3b1f…
 * compiled_at: 2026-09-05T10:00:00Z
 * ---
 * ```
 *
 * The hash is what makes the answer honest. Without it a page that cites a file says
 * only "somebody once read something with this name", which is exactly the claim that
 * goes stale in silence when the file is replaced.
 */

/** The top-level folder holding wiki pages. Mirrors `VAULT_SOURCES_DIR`. */
const VAULT_WIKI_DIR = 'wiki';

/**
 * What the library knows about one raw source.
 *
 * - `not-compiled` — no wiki page cites it. Nothing is wrong; nobody has written it up.
 * - `compiled` — a page cites it **and** names a sha256 equal to the file's own.
 * - `stale` — a page cites it and the hashes disagree, or the page cites it without a
 *   hash at all. Both mean the same thing to a person: *the write-up may no longer
 *   describe this file*, and the cure is the same.
 * - `checking` — a page cites it with a hash and the file has not been hashed yet. A
 *   transient state, never a resting one; showing "compiled" during it would be a claim
 *   nothing has verified.
 */
type SourceCompileState = 'not-compiled' | 'compiled' | 'stale' | 'checking';

interface WikiCitation {
  /** Slug of the wiki page, as `VaultDoc.slug` spells it (`wiki/quarter-plan`). */
  wikiSlug: string;
  /** Vault-relative path of the cited source (`sources/quarter-plan.pdf`). */
  sourcePath: string;
  /** The sha256 that page recorded for this source, or null when it recorded none. */
  sourceHash: string | null;
}

export interface LibraryWikiPage {
  slug: string;
  title: string;
  /** Sources this page cites, in the order the frontmatter lists them. */
  sourcePaths: string[];
  /** `created_by`, verbatim — `agent:claude`, `human`, or absent. */
  createdBy: string | null;
  /** `compiled_at`, verbatim, when present. */
  compiledAt: string | null;
}

/** Whether a doc is a wiki page: under `wiki/` **and** carrying no `kind:`. */
function isWikiPage(doc: VaultDoc): boolean {
  if (!doc.slug.startsWith(`${VAULT_WIKI_DIR}/`)) return false;
  const kind = doc.frontmatter.kind;
  // A file under `wiki/` that grew a `kind:` is an ontology node someone filed in the
  // wrong folder. It belongs to the graph, and calling it a wiki page here would hide it
  // from every screen that lists concepts.
  return typeof kind !== 'string' || kind.trim() === '';
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim());
  }
  // A single citation written as a scalar is the commonest hand-edit. Reading it costs
  // nothing and refusing it would tell a person their page cites nothing.
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

/** Wiki pages in the manifest, newest write-up first by slug order. */
export function selectWikiPages(docs: readonly VaultDoc[]): LibraryWikiPage[] {
  return docs.filter(isWikiPage).map((doc) => ({
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

/** Every citation any wiki page makes, grouped by the source path it names. */
function collectWikiCitations(
  docs: readonly VaultDoc[],
): Map<string, WikiCitation[]> {
  const out = new Map<string, WikiCitation[]>();
  for (const doc of docs) {
    if (!isWikiPage(doc)) continue;
    const hashes = readHashMap(doc.frontmatter.source_hash);
    for (const sourcePath of readStringArray(doc.frontmatter.sources)) {
      const citation: WikiCitation = {
        wikiSlug: doc.slug,
        sourcePath,
        sourceHash: hashes.get(sourcePath) ?? null,
      };
      const list = out.get(sourcePath);
      if (list) list.push(citation);
      else out.set(sourcePath, [citation]);
    }
  }
  return out;
}

/**
 * One source's state.
 *
 * `actualHash` is `undefined` while the file has not been hashed. Hashing is deliberately
 * lazy and only ever asked for on cited files: a source nobody has written up is
 * `not-compiled` whatever its bytes are, so hashing it would spend a person's disk on a
 * question nobody asked.
 *
 * **Any** citing page matching is enough for `compiled`. Two pages may cover one document
 * and one of them may be older; the source is still described somewhere by something
 * current, and marking it stale would send a person to re-compile a file that is already
 * covered.
 */
function deriveSourceState(
  citations: readonly WikiCitation[] | undefined,
  actualHash: string | undefined,
): SourceCompileState {
  if (!citations || citations.length === 0) return 'not-compiled';
  const hashed = citations.filter((citation) => citation.sourceHash !== null);
  // Cited with no hash at all: the page claims coverage it cannot prove. That is the same
  // problem as a mismatch — the write-up may not describe this file — so it gets the same
  // name and the same cure.
  if (hashed.length === 0) return 'stale';
  if (actualHash === undefined) return 'checking';
  return hashed.some((citation) => citation.sourceHash === actualHash.toLowerCase())
    ? 'compiled'
    : 'stale';
}

export interface LibrarySourceRow extends VaultSourceFile {
  state: SourceCompileState;
  /** Wiki pages citing this source, whether or not their hash still matches. */
  citedBy: string[];
}

export interface LibraryModel {
  sources: LibrarySourceRow[];
  wikiPages: LibraryWikiPage[];
  /** Sources whose state is `not-compiled` or `stale` — the count Compile acts on. */
  needsCompileCount: number;
  /** Sources nobody has written up. The footer names this apart from `staleCount`: a person
   *  reading "5 not written up" when two of them have pages is being told something false. */
  notCompiledCount: number;
  /** Sources whose page cites a hash the bytes no longer match. */
  staleCount: number;
  /** Paths worth hashing: cited, hash recorded, not yet measured. */
  pathsNeedingHash: string[];
  /** Both crossings between a source and the pages written from it. */
  pairing: LibraryPairing;
}

/**
 * The whole library, derived from the manifest plus whatever hashes are already known.
 *
 * Nothing here is stored. The folder is the state: the source list comes from the walk,
 * the citations come from wiki frontmatter, and the only thing held in memory is a
 * session cache of hashes, which is a measurement rather than a fact about the vault.
 * A second store of any of this would be a second canonical store, which
 * `.claude/rules/forbidden.md` refuses.
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
    return {
      ...source,
      state: deriveSourceState(cited, hashes.get(source.path)),
      citedBy: [...new Set((cited ?? []).map((citation) => citation.wikiSlug))].sort(),
    };
  });
  return {
    sources: rows,
    wikiPages: selectWikiPages(docs),
    needsCompileCount: rows.filter(
      (row) => row.state === 'not-compiled' || row.state === 'stale',
    ).length,
    notCompiledCount: rows.filter((row) => row.state === 'not-compiled').length,
    staleCount: rows.filter((row) => row.state === 'stale').length,
    // `checking` **is** the definition of "worth hashing": cited, a hash recorded, and
    // nothing measured yet. The caller drops a path from its cache when the file's mtime
    // changes, which puts the row back into `checking` and back into this list.
    pathsNeedingHash: rows.filter((row) => row.state === 'checking').map((row) => row.path),
    pairing: buildLibraryPairing({ docs, sources, hashes }),
  };
}

/** `1536` → `1.5 KB`. Locale-independent: the unit is a symbol, not a word. */
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

/* ────────────────────────────────────────────────────────────────────────────────
 * Pairing: the original and the write-up, from one side to the other.
 *
 * The owner's instruction on 2026-09-06: *"'view the original' and 'view the
 * template-based write-up' must be separate."* Separate is what the two panes already
 * are — a wiki page renders as Markdown, a source states the six facts a file Atlas
 * never opened can honestly carry. What was missing is the **crossing**: standing on
 * one, there was no named way to the other.
 *
 * Both directions come from the same two frontmatter fields the state machine above
 * already reads, so nothing new is stored and nothing new can drift. `sources:` gives
 * page → file; inverting it gives file → page; `source_hash` decides whether that
 * crossing lands on a write-up that still describes the bytes.
 * ──────────────────────────────────────────────────────────────────────────────── */

/** One source a wiki page cites, resolved against the files really in this folder. */
export interface LibraryOriginalLink {
  /** Vault-relative path exactly as the page cites it. */
  path: string;
  /** File name, or the whole path when the citation has no `/`. */
  name: string;
  /**
   * The cited file's state, or `null` when **no such file is in this folder**.
   *
   * A citation naming a file nobody can open is not the same fact as a citation
   * naming a stale one, and a chip that behaved identically for both would send a
   * person looking for a document that is not there.
   */
  state: SourceCompileState | null;
}

/**
 * How a write-up stands to the bytes it was written from.
 *
 * - `current` — the page recorded a hash for this source and it matches the measured one.
 * - `behind` — the hashes disagree, or the page recorded none. A reader can act on
 *   neither, and the cure is the same.
 * - `unchecked` — the page recorded a hash and **nothing has measured the file yet**.
 *
 * `unchecked` exists because collapsing it into `behind` was a measured lie (PO steward,
 * 2026-09-06): the source row's own state says `checking` in exactly that window, so one
 * pane stated two things about one file. It is transient on the app path and permanent
 * whenever hashing cannot happen at all — a browser without `crypto.subtle`, or a source
 * the session holds no handle for — so it is a resting state, not a flicker.
 */
type WriteUpFreshness = 'current' | 'behind' | 'unchecked';

/** One wiki page citing a source, and how it stands to the bytes on disk. */
export interface LibraryWriteUpLink {
  slug: string;
  title: string;
  freshness: WriteUpFreshness;
}

interface LibraryPairing {
  /** Wiki slug → the sources that page cites. Empty array for a page citing none. */
  originalsByWiki: Map<string, LibraryOriginalLink[]>;
  /** Source path → the wiki pages citing it, in slug order. */
  writeUpsBySource: Map<string, LibraryWriteUpLink[]>;
}

/**
 * Both directions of the pairing, from the manifest plus whatever hashes are measured.
 *
 * `hashes` is the same lazily filled map the state machine reads: a source nobody has
 * written up is never hashed, so a page citing it is reported `current: false` — which
 * is exactly right, because an unproven claim is not a proven one.
 */
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
        freshness:
          citation.sourceHash === null
            ? 'behind'
            : actual === undefined
              ? 'unchecked'
              : citation.sourceHash === actual
                ? 'current'
                : 'behind',
      });
    }
    writeUpsBySource.set(
      path,
      [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    );
  }

  return { originalsByWiki, writeUpsBySource };
}

/**
 * Which wiki page to open first, for the shelf's “start with” row.
 *
 * `compiled_at` before a slug tiebreak: the freshest write-up is the one whose facts a
 * person has the best chance of still being able to check, and a folder whose pages
 * were all written by hand (no `compiled_at` anywhere) still gets a stable answer
 * rather than none.
 */
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

/**
 * The formats present, most files first — the shelf's honest answer to “what did I
 * bring in”. A file with no extension is counted under `''` and the screen names it,
 * because dropping it would make the total disagree with the source count above it.
 */
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

/*
 * `lastSourceAddedAt` lived here until 2026-09-06. It had one consumer, the Library
 * shelf's four-row "Last added" table, and that table went when the guide became a
 * three-row stepper whose rows carry one caption each. A derivation with no surface is a
 * fact nobody can check, so it left with its reader rather than waiting for one.
 */
