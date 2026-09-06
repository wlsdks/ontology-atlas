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
export type SourceCompileState = 'not-compiled' | 'compiled' | 'stale' | 'checking';

export interface WikiCitation {
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
export function isWikiPage(doc: VaultDoc): boolean {
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
export function collectWikiCitations(
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
export function deriveSourceState(
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
