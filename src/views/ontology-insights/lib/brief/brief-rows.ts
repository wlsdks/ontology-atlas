import { visibleLines, type BriefAvailability, type BriefCore, type BriefCoreKey, type BriefLine } from './brief-model';

/**
 * The brief's one list, in the order a reader should work it.
 *
 * Until 2026-09-23 each core drew its own card, so a core with nothing to say still
 * reserved a quarter of the row: measured at 1512x900 on the hosted sample, 55% of the
 * first screen was blank and three of four cards used 179 of their 276px. The owner chose
 * one band of counts with one list under it (direction C). Every line from every core joins
 * this list, stale before unknown before what merely happened, so the eye reaches the work
 * before the bookkeeping; a core that cannot count adds exactly one row saying why and where
 * to go; and the app-only reason is said once, not once per core that shares it.
 */
export type BriefRow =
  | { kind: 'line'; core: BriefCoreKey; availability: BriefAvailability; line: BriefLine }
  | { kind: 'status'; core: BriefCoreKey; status: 'no-source' | 'no-data' | 'reading' | 'unreadable' | 'quiet' }
  | { kind: 'app-only'; cores: readonly BriefCoreKey[] };

const STATE_RANK: Record<BriefLine['state'], number> = { stale: 0, unknown: 1, current: 2 };

export function briefRows(cores: readonly BriefCore[]): BriefRow[] {
  const lines: Array<{ row: BriefRow; rank: number; coreIndex: number; lineIndex: number }> = [];
  const statuses: BriefRow[] = [];
  const appOnly: BriefCoreKey[] = [];
  cores.forEach((core, coreIndex) => {
    visibleLines(core).forEach((line, lineIndex) => {
      lines.push({
        row: { kind: 'line', core: core.core, availability: core.availability, line },
        rank: STATE_RANK[line.state],
        coreIndex,
        lineIndex,
      });
    });
    switch (core.availability) {
      case 'app-only':
        appOnly.push(core.core);
        break;
      case 'no-source':
      case 'no-data':
      case 'reading':
      case 'unreadable':
        statuses.push({ kind: 'status', core: core.core, status: core.availability });
        break;
      case 'measured':
        if (visibleLines(core).length === 0) statuses.push({ kind: 'status', core: core.core, status: 'quiet' });
        break;
    }
  });
  lines.sort((a, b) => a.rank - b.rank || a.coreIndex - b.coreIndex || a.lineIndex - b.lineIndex);
  // The app-only reason comes straight after the lines: on the hosted sample the first line is a
  // count only the app can check, and its explanation sat five rows below it behind two "none yet"
  // rows that explain nothing the headline counts (design-lead, 2026-09-23).
  return [
    ...lines.map((entry) => entry.row),
    ...(appOnly.length > 0 ? [{ kind: 'app-only' as const, cores: appOnly }] : []),
    ...statuses,
  ];
}
