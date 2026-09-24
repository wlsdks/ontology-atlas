import { visibleLines, type BriefAvailability, type BriefCore, type BriefCoreKey, type BriefLine } from './brief-model';
import type { SinceRow } from './since-list';

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
  | {
      kind: 'status';
      core: BriefCoreKey;
      status: 'no-source' | 'no-data' | 'reading' | 'unreadable' | 'quiet';
      /** The no-source row stands for the concepts' unchecked-evidence line; see `briefRows`. */
      unchecked?: true;
    }
  | { kind: 'app-only'; cores: readonly BriefCoreKey[] };

const STATE_RANK: Record<BriefLine['state'], number> = { stale: 0, unknown: 1, current: 2 };

/**
 * The "happened" line each kind of the since list already names, one by one, under the list.
 * Counting it here too put "concepts whose document changed since: 20" directly above a card
 * titled "20 things changed since" (review, 2026-09-25, round 4). The card names them, so the
 * card is the one place they are said.
 */
const SINCE_LINE: Record<SinceRow['kind'], string> = {
  'concept-doc': 'ontology-changed-since',
  'wiki-log': 'wiki-written-since',
  'guide-file': 'harness-changed-since',
  'agent-call': 'agent-calls-since',
};

export function briefRows(cores: readonly BriefCore[], options: { namedSince?: readonly SinceRow['kind'][] } = {}): BriefRow[] {
  const lines: Array<{ row: BriefRow; rank: number; coreIndex: number; lineIndex: number }> = [];
  const statuses: BriefRow[] = [];
  const appOnly: BriefCoreKey[] = [];
  const namedElsewhere = new Set((options.namedSince ?? []).map((kind) => SINCE_LINE[kind]));
  cores.forEach((core, coreIndex) => {
    /*
     * ⚠️ **No repository and "could not check the code" are one fact.** With no repository every
     * concept is unchecked, so the unchecked line and the connect row stood one above the other
     * with two doors to the same map (review, 2026-09-25, round 4). The connect row takes the
     * line's place in the order and wears its hollow ring; the line itself is not drawn.
     */
    const absorbed = core.core === 'ontology' && core.availability === 'no-source' ? visibleLines(core).find((line) => line.id === 'ontology-evidence-unchecked') : undefined;
    if (absorbed) {
      lines.push({
        row: { kind: 'status', core: core.core, status: 'no-source', unchecked: true },
        rank: STATE_RANK.unknown,
        coreIndex,
        lineIndex: visibleLines(core).indexOf(absorbed),
      });
    }
    visibleLines(core).forEach((line, lineIndex) => {
      if (line === absorbed || namedElsewhere.has(line.id)) return;
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
        if (!absorbed) statuses.push({ kind: 'status', core: core.core, status: core.availability });
        break;
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
