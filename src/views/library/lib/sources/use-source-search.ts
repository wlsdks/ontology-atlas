import { useEffect, useMemo, useState } from 'react';
import { sourceSearchPrefix } from './source-search-prefix';

import { passageLabelFor, type PassageLabel } from '@/shared/lib/library/source-passage';
import { sourceUnits, type SourceUnit } from '@/shared/lib/library/source-units';

/**
 * Reads only on the first keystroke, never on folder open, through granted handles; nothing is kept
 * or sent. Reads publish per file, so the caller shows a reading state. Caps: 200 files and 20 MB
 * from listing sizes.
 */

/**
 * Markdown sources are searched by the vault index like every other `.md` file, so this reader never
 * opens one; it covers the formats the index does not read (PDF, CSV, DOCX and the rest). The match is
 * case-sensitive like the vault's own `.md` rule, so `README.MD` stays searchable here.
 */
export function isIndexedSource(path: string): boolean {
  return path.endsWith('.md');
}

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
   * Which paths have been read, so a caller can tell an unread row from a row that held nothing;
   * filtering on `hits` alone would empty the list before reads land.
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
  const active = enabled && needle.length > 0;

  /*
   * Which files a search may read, decided from the listing alone. Path order, so the
   * cap falls the same way twice on the same folder rather than on whatever the walk
   * happened to return first.
   */
  const { planned, capped } = useMemo(() => {
    const ordered = sourceSearchPrefix(
      sources.filter((source) => !isIndexedSource(source.path)),
      SOURCE_SEARCH_MAX_FILES + 1,
    );
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

  const [cache, setCache] = useState(() => ({ key: plannedKey, units: new Map<string, SourceUnit[]>() }));
  let unitsByStamp = cache.units;
  if (cache.key !== plannedKey) {
    const currentStamps = new Set(planned.map(file => file.stamp));
    unitsByStamp = new Map([...cache.units].filter(([stamp]) => currentStamps.has(stamp)));
    setCache({ key: plannedKey, units: unitsByStamp });
  }

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
          // Recorded as read-with-nothing, never skipped: a skipped file stays out of `readCount` and `phase` stays `reading` forever.
          units = [];
        } else {
          try {
            const bytes = await (await handle.getFile()).arrayBuffer();
            if (cancelled) return;
            units = sourceUnits(new Uint8Array(bytes), file.path).units;
          } catch {
            // Recorded with no units, so the search does not retry an unreadable file on every keystroke.
            units = [];
          }
        }
        if (cancelled) return;
        // A new Map per file keeps progress visible without restarting this reader.
        setCache((current) => {
          if (current.key !== plannedKey || current.units.has(file.stamp)) return current;
          const next = new Map(current.units);
          next.set(file.stamp, units);
          return { key: current.key, units: next };
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `plannedKey` stands for `planned`: the same paths at the same mtimes are the same work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, plannedKey, sourceHandles]);

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
