import { useEffect, useMemo, useState } from 'react';

import { passageLabelFor, sourceUnits, type PassageLabel, type SourceUnit } from '@/shared/lib/source-passage';

/**
 * **Search the words inside the documents, because a person typed them.**
 *
 * Until slice U2 the index column's field matched a source on its **path** and nothing
 * else, while the wiki half beside it already matched page text. Measured 2026-09-11 on a
 * six-file folder with no agent: typing "T+2" returned nothing, though
 * `sources/settlement-policy.md` says it on line 11 and `sources/fee-schedule.csv` says
 * it in three records. The one thing a person can do on their first day — find a sentence
 * they know they wrote — was the one thing the Library could not do.
 *
 * ## When the reading happens, and why that is the whole design
 *
 * **On the first keystroke, never on folder open** (PM selection, 2026-09-11, choosing
 * this over an eager read at open). The clause it protects is the standing one from
 * 2026-09-11 "Pressing a citation reads that one file": *nothing is read that a person
 * did not name*. A keystroke is a person naming what they want as surely as a press is,
 * so this stays inside that clause — while a read at folder open would put every readable
 * file through the reader before anybody asked anything, and would make
 * `source.neverOpened` false on every pane in the folder. That is a ledger cost, and at
 * first-day size it buys nothing: six files read and split in 0.6–3.5 ms, so eager and
 * lazy are indistinguishable exactly where the person is.
 *
 * The other clauses hold the same way as in `use-cited-passage.ts`:
 *
 * - **Through handles already granted.** `sourceHandles` is the folder walk's own map —
 *   a `TauriFileHandle` over `read_vault_binary_file` in the app, an FSA handle in the
 *   browser. No new permission, no new bridge.
 * - **Nothing kept on disk.** The units live in this hook's state, keyed by the folder's
 *   identity and each file's mtime, and go when the folder closes or the component
 *   unmounts. No IndexedDB, no `.ontology-atlas/` record: a search index on disk would be
 *   the second store `.claude/rules/local-first.md` forbids, and the vault's Markdown is
 *   the only index Atlas has.
 * - **Nothing sent.** No LLM, ACP or MCP path is touched.
 *
 * ## Why the input never waits
 *
 * The reads are asynchronous and publish per file, so the list fills while the rest
 * arrive and the field keeps every keystroke. Matching is separate from reading and runs
 * over whatever has landed — which is why the caller must print a reading state rather
 * than a bare count, or a folder mid-read would report "no match" for a file it has not
 * opened yet. That sentence is the difference between "not there" and "not read yet".
 *
 * ## The two caps, and the one they are not
 *
 * 200 files and 20 MB, whichever binds first, counted from the **directory listing's**
 * sizes — so the cap is decided before a single byte is read, not after. It exists
 * because of what a read costs in the installed app: `read_vault_binary_file` hands the
 * WebView a JSON array of bytes (one number per byte), which is the waste
 * `vault_fingerprint` and `hash_vault_files` were built to remove; measured, 7.83 MB of
 * non-Markdown files crossed as a 27.8 MB JSON wire. Markdown takes the cheap string
 * path.
 *
 * This is **not** the folder walk's own cap (`VAULT_WALK_MAX_ENTRIES`, 4,000 entries),
 * which decides what the folder is; this one decides what a search read. Both say so on
 * screen rather than truncating in silence.
 */

/** Files one search may read, however small they are. */
const SOURCE_SEARCH_MAX_FILES = 200;
/** Bytes one search may read, however few files that is. */
const SOURCE_SEARCH_MAX_BYTES = 20 * 1024 * 1024;

/**
 * One file's first match. Not exported: it reaches callers as the value type of
 * `SourceSearchState.hits`, and a second name for it would be a second thing to keep
 * true.
 */
interface SourceSearchHit {
  path: string;
  /** The address of the first matching unit — what the caption's press opens. */
  anchor: string;
  /** The place that anchor names, in the extractor's own precision. */
  label: PassageLabel;
  /**
   * The unit's text, verbatim and whole.
   *
   * A hard-wrapped line ends mid-sentence — line 11 of the fixture policy runs on into
   * "Bank transfers settle same day when" — and this is the file's own words, so it is
   * not trimmed to the matched phrase. The caption clips it visually; the string stays
   * true.
   */
  text: string;
  /** How many units in this file matched, for the passage count in the matches line. */
  matches: number;
}

export interface SourceSearchState {
  /**
   * `idle` — nothing typed, nothing read. `reading` — files are still arriving, so a
   * count is provisional. `ready` — every file within the cap has been read.
   */
  phase: 'idle' | 'reading' | 'ready';
  /** The first matching unit per source path, for the rows that matched. */
  hits: ReadonlyMap<string, SourceSearchHit>;
  /** Units that matched, across every file — the passage half of the matches line. */
  passageCount: number;
  /** True when the file or byte cap kept files out of this search. */
  capped: boolean;
  /** How many files this search is allowed to read at all. */
  plannedCount: number;
  /**
   * **Which paths have been read**, so a caller can tell an unread row from a row that
   * held nothing.
   *
   * The count below was already kept; only the set was private, and that privacy is what
   * emptied the column. Filtering on `hits` alone removes every row whose read has not
   * landed yet, so on the 200-file folder the list stood at **0 rows while the line said
   * `1/200`** (design-lead, council 2026-09-11) — "nothing found" arriving before "still
   * reading". With the set, the caller keeps an unread row and the list *narrows* as
   * reads land, which is the truth about what the search knows.
   */
  read: ReadonlySet<string>;
  /**
   * How many of those have been read so far — the numerator of the reading line.
   *
   * Distinct from `hits.size`, which counts only the files that *matched*: a folder
   * where nine of ten files hold nothing would otherwise report "1/10" forever and read
   * as stalled rather than finished.
   */
  readCount: number;
}

const EMPTY_HITS: ReadonlyMap<string, SourceSearchHit> = new Map();

const EMPTY_READ: ReadonlySet<string> = new Set();

const IDLE: SourceSearchState = {
  phase: 'idle',
  hits: EMPTY_HITS,
  passageCount: 0,
  capped: false,
  plannedCount: 0,
  readCount: 0,
  read: EMPTY_READ,
};

/** One file this search may read, and the key its units are remembered under. */
interface PlannedRead {
  path: string;
  stamp: string;
}

export function useSourceSearch({
  sources,
  sourceHandles,
  vaultScope,
  needle,
  enabled,
}: {
  /** The folder's source rows, with the size and mtime the listing already knows. */
  sources: readonly { path: string; bytes: number; mtime: number }[];
  sourceHandles: Map<string, FileSystemFileHandle>;
  /** The folder session's identity, so another folder's units can never leak in. */
  vaultScope: string;
  /** The trimmed, lower-cased query. Empty means nothing has been typed. */
  needle: string;
  enabled: boolean;
}): SourceSearchState {
  const [unitsByStamp, setUnitsByStamp] = useState<Map<string, SourceUnit[]>>(
    () => new Map(),
  );
  const active = enabled && needle.length > 0;

  /*
   * Which files a search may read, decided from the listing alone. Path order, so the
   * cap falls the same way twice on the same folder rather than on whatever the walk
   * happened to return first.
   */
  const { planned, capped } = useMemo(() => {
    const ordered = [...sources].sort((left, right) => left.path.localeCompare(right.path));
    const planned: PlannedRead[] = [];
    let bytes = 0;
    let capped = false;
    for (const source of ordered) {
      if (planned.length >= SOURCE_SEARCH_MAX_FILES) {
        capped = true;
        break;
      }
      if (bytes + source.bytes > SOURCE_SEARCH_MAX_BYTES) {
        capped = true;
        break;
      }
      bytes += source.bytes;
      planned.push({ path: source.path, stamp: `${vaultScope}\u0000${source.path}@${source.mtime}` });
    }
    return { planned, capped };
  }, [sources, vaultScope]);

  const plannedKey = planned.map((file) => file.stamp).join('');

  useEffect(() => {
    if (!active) return;
    const unread = planned.filter((file) => !unitsByStamp.has(file.stamp));
    if (unread.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const file of unread) {
        const handle = sourceHandles.get(file.path);
        let units: SourceUnit[];
        if (!handle) {
          /*
           * ⚠️ **Recorded as read-with-nothing, never skipped.** Skipping left the file
           * out of `readCount`, so `phase` stayed `reading` forever and the matches line
           * counted up to a total it could never reach — caught by
           * `LibrarySection.index.test.tsx`, whose folder has rows and no handles. A row
           * whose file left the folder between the walk and the keystroke is a file this
           * search cannot read, which is a finished answer about it, not a pending one.
           */
          units = [];
        } else {
          try {
            const bytes = await (await handle.getFile()).arrayBuffer();
            if (cancelled) return;
            units = sourceUnits(new Uint8Array(bytes), file.path).units;
          } catch {
            /*
             * A file that cannot be read, or a format with no text reader, contributes no
             * units — and is still recorded, so the search does not retry it on every
             * keystroke. An empty list is the honest answer for a PDF too.
             */
            units = [];
          }
        }
        if (cancelled) return;
        /*
         * Published per file rather than per batch: the rows fill while the rest arrive,
         * which is what lets the field stay responsive on a folder that takes 143–180 ms
         * to read whole. Each publish is a new Map because the value is read by a memo.
         */
        setUnitsByStamp((current) => {
          if (current.has(file.stamp)) return current;
          const next = new Map(current);
          next.set(file.stamp, units);
          return next;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `plannedKey` stands for `planned`: the same paths at the same mtimes are the same work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, plannedKey, sourceHandles, unitsByStamp]);

  return useMemo(() => {
    if (!active) return IDLE;
    const hits = new Map<string, SourceSearchHit>();
    const read = new Set<string>();
    let passageCount = 0;
    for (const file of planned) {
      const units = unitsByStamp.get(file.stamp);
      if (!units) continue;
      read.add(file.path);
      let first: SourceUnit | null = null;
      let matches = 0;
      for (const unit of units) {
        if (!unit.text.toLowerCase().includes(needle)) continue;
        matches += 1;
        if (!first) first = unit;
      }
      if (!first) continue;
      passageCount += matches;
      hits.set(file.path, {
        path: file.path,
        anchor: first.anchor,
        label: passageLabelFor(first.anchor, [first]),
        text: first.text,
        matches,
      });
    }
    return {
      phase: read.size < planned.length ? 'reading' : 'ready',
      hits,
      passageCount,
      capped,
      plannedCount: planned.length,
      readCount: read.size,
      read,
    };
  }, [active, capped, needle, planned, unitsByStamp]);
}
