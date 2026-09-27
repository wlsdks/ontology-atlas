/**
 * The analysis brief, "what in your understanding has to change", across the ontology, wiki and harness cores plus
 * agent activity. Every line is a count with a message id, so number and wording are never written apart, and a
 * count is never a score. States: `current` (checked, still true), `stale` (checked and moved), `unknown` (could not
 * be checked here); a browser cannot read code beside a vault, so ontology evidence is `unknown` there.
 */
export type BriefState = 'current' | 'stale' | 'unknown';

export type BriefCoreKey = 'ontology' | 'wiki' | 'harness' | 'agent';

/**
 * Why a core's numbers are what they are: `measured` (real counts), `app-only` (only the installed app reaches the
 * input), `no-data` (the input exists but is empty), `reading` (still walking), `unreadable` (tried and failed), and
 * the last, `no-source` (the harness's code repository is not connected to this vault).
 */
export type BriefAvailability = 'measured' | 'app-only' | 'no-data' | 'reading' | 'unreadable' | 'no-source';

export interface BriefLine {
  /** Message id under `brief.line.*`. Stable; screens and tests key on it. */
  id: string;
  count: number;
  /**
   * The value `stale`: something the reader believed is now wrong. `unknown`: nobody checked it or nothing reaches it.
   * And `current`: worth knowing, contradicting nothing. The headline sums the first two.
   */
  state: BriefState;
}

export interface BriefCore {
  core: BriefCoreKey;
  availability: BriefAvailability;
  /** The core's magnitude (concepts, pages, guide files, calls since the anchor); `null` when this session cannot count it. */
  headline: number | null;
  /** Items in each state. `null` when this core cannot state that column here. */
  current: number | null;
  stale: number | null;
  unknown: number | null;
  /** Lines with a count of zero are kept: the screen decides whether a zero is worth ink. */
  lines: readonly BriefLine[];
  /**
   * The core's headline contribution when its lines overlap: the ontology's lines describe overlapping sets of the
   * same concepts. Omitted means the lines already count separate things.
   */
  headlineTotals?: { stale: number; unknown: number };
}

/** The headline's two sums. */
export interface BriefTotals {
  stale: number;
  unknown: number;
}

/**
 * Cores still arriving (harness scan, ontology Git walk). Such a core contributes nothing yet, not zero, so no sum
 * including it is final.
 */
export function briefCounting(cores: readonly BriefCore[]): BriefCoreKey[] {
  return cores.filter((core) => core.availability === 'reading').map((core) => core.core);
}

/**
 * The line above the cards: stale and unknown items, two sums of named things, never one score. Each core adds its
 * own `headlineTotals` when its lines overlap, else their sum, so a count never exceeds what it counts. It is `null`
 * while a core reads: a partial sum is not even a lower bound, since the ontology's unchecked count falls when its walk lands.
 */
export function briefTotals(cores: readonly BriefCore[]): BriefTotals | null {
  if (briefCounting(cores).length > 0) return null;
  let stale = 0;
  let unknown = 0;
  for (const core of cores) {
    if (core.headlineTotals) {
      stale += core.headlineTotals.stale;
      unknown += core.headlineTotals.unknown;
      continue;
    }
    for (const line of core.lines) {
      if (line.state === 'stale') stale += line.count;
      else if (line.state === 'unknown') unknown += line.count;
    }
  }
  return { stale, unknown };
}

/** One named thing under a line: concept, path, when it moved and when the concept's document last moved. */
export interface BriefLineDetail {
  name: string;
  /** The concept's vault document slug, what `get_concept` takes; `null` when it owns no document. */
  slug: string | null;
  path: string;
  /** When the path moved. `null` for a path that is simply gone. */
  at: string | null;
  /** When the concept document last moved, for the comparison the verdict rests on. */
  docAt: string | null;
  href: string;
}

/** Nonzero lines in the builder's order. */
export function visibleLines(core: BriefCore): readonly BriefLine[] {
  return core.lines.filter((line) => line.count > 0);
}

/** ISO or epoch to ms, or null when unparseable. */
export function toMs(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isAfter(value: string | number | null | undefined, anchorMs: number): boolean {
  const ms = toMs(value);
  return ms != null && ms > anchorMs;
}
