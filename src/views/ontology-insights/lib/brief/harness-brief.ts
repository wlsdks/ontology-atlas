import { isAfter, type BriefCore, type BriefLine } from './brief-model';

/** One coverage row: a vault domain and what reaches its recorded paths. */
interface HarnessBriefArea {
  told: readonly unknown[];
  gated: readonly unknown[];
  watched: readonly unknown[];
}

export interface HarnessBriefInput {
  /** Null when there is no report: `state` says whether that is a browser, a wait, or a failure. */
  areas: readonly HarnessBriefArea[] | null;
  /** How the scan stands, so a card inside the app never claims the app is missing. */
  state?: 'browser' | 'reading' | 'unreadable' | 'ready';
  /** Mirror findings between `.claude/**` and `.agents/**`. */
  driftCount: number | null;
  /** Guide and rule file change times, so "a rule changed since you looked" is a count. */
  fileTimes: readonly { path: string; mtimeMs: number | null }[] | null;
  /** Guide documents the scan found (AGENTS.md, rules, skills …). Null when nothing was scanned. */
  guideFileCount: number | null;
  anchorMs: number;
}

/**
 * The harness has no "stale" of its own: a rule file is text. Its three columns are the
 * coverage table's own words — told / gated / watched — and the brief counts the areas each
 * column reaches. The empty cells are the product (direction C, 2026-09-13), so the lines
 * name how many areas each column misses.
 */
export function buildHarnessBrief(input: HarnessBriefInput): BriefCore {
  if (!input.areas) {
    const state = input.state ?? 'browser';
    return {
      core: 'harness',
      availability: state === 'reading' ? 'reading' : state === 'unreadable' ? 'unreadable' : 'app-only',
      headline: null,
      current: null,
      stale: null,
      unknown: null,
      lines: state === 'browser' ? [{ id: 'harness-app-only', count: 0, state: 'unknown' }] : [],
    };
  }
  const untold = input.areas.filter((area) => area.told.length === 0).length;
  const ungated = input.areas.filter((area) => area.gated.length === 0).length;
  const unwatched = input.areas.filter((area) => area.watched.length === 0).length;
  const changedSince = (input.fileTimes ?? []).filter((time) => isAfter(time.mtimeMs, input.anchorMs)).length;
  const lines: BriefLine[] = [
    { id: 'harness-untold-areas', count: untold, state: 'unknown' },
    { id: 'harness-ungated-areas', count: ungated, state: 'unknown' },
    { id: 'harness-unwatched-areas', count: unwatched, state: 'unknown' },
    { id: 'harness-mirror-drift', count: input.driftCount ?? 0, state: 'stale' },
    { id: 'harness-changed-since', count: changedSince, state: 'current' },
  ];
  return {
    core: 'harness',
    availability: input.areas.length === 0 ? 'no-data' : 'measured',
    headline: input.guideFileCount,
    current: input.areas.length - untold,
    stale: input.areas.length - ungated,
    unknown: input.areas.length - unwatched,
    lines,
  };
}
