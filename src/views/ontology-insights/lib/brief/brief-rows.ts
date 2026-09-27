import { visibleLines, type BriefAvailability, type BriefCore, type BriefCoreKey, type BriefLine } from './brief-model';
import type { SinceRow } from './since-list';

/**
 * The brief's one list in working order: stale before unknown before what merely happened, so the work comes
 * before the bookkeeping. A core that cannot count adds exactly one row saying why and where to go, and the app-only
 * reason is said once, not per core.
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

/** The since card names these one by one, so the brief does not repeat them as "happened" lines. */
const SINCE_LINE: Record<SinceRow['kind'], string> = {
  'concept-doc': 'ontology-changed-since',
  'wiki-log': 'wiki-written-since',
  'guide-file': 'harness-changed-since',
  'agent-call': 'agent-calls-since',
};

export function briefRows(
  cores: readonly BriefCore[],
  options: {
    namedSince?: readonly SinceRow['kind'][];
    /** The since card is still counting, so its happened lines wait too rather than appearing and folding away. */
    sinceCounting?: boolean;
  } = {},
): BriefRow[] {
  const lines: Array<{ row: BriefRow; rank: number; coreIndex: number; lineIndex: number }> = [];
  const statuses: BriefRow[] = [];
  const appOnly: BriefCoreKey[] = [];
  const namedElsewhere = new Set(
    options.sinceCounting ? Object.values(SINCE_LINE) : (options.namedSince ?? []).map((kind) => SINCE_LINE[kind]),
  );
  cores.forEach((core, coreIndex) => {
    // With no repository every concept is unchecked, so the connect row takes the unchecked line's place and ring and
    // the line is not drawn.
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
  // The app-only reason comes straight after the lines, next to the count only the app can check.
  return [
    ...lines.map((entry) => entry.row),
    ...(appOnly.length > 0 ? [{ kind: 'app-only' as const, cores: appOnly }] : []),
    ...statuses,
  ];
}
