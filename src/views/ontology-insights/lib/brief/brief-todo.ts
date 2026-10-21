import type { BriefCore } from './brief-model';
import type { BriefRow } from './brief-rows';

/** Where each line opens: the screen that lists the named things, never a second copy of that list here. */
const LINE_HREF: Record<string, string> = {
  'ontology-evidence-moved': '/ontology/insights/?tab=growth',
  'ontology-evidence-missing': '/ontology/insights/?tab=do-next',
  'ontology-evidence-folder-only': '/topology/',
  // Where it goes depends on why it cannot be checked. See `lineHref`.
  'ontology-evidence-unchecked': '/download/',
  'ontology-agent-unreviewed': '/topology/',
  'ontology-changed-since': '/ontology/insights/?tab=growth',
  'ontology-repair': '/ontology/insights/?tab=do-next',
  'ontology-unmatched': '/ontology/insights/?tab=unmatched',
  'wiki-stale-pages': '/library/',
  'wiki-disagreements': '/library/',
  'wiki-sources-unwritten': '/library/',
  'wiki-orphan-pages': '/library/',
  'wiki-dangling-links': '/library/',
  'wiki-written-since': '/library/',
  'wiki-redrafted-since': '/library/?tab=rounds',
  'wiki-passes-troubled-since': '/library/?tab=rounds',
  'harness-untold-areas': '/architecture/?view=overview',
  'harness-ungated-areas': '/architecture/?view=overview',
  'harness-unwatched-areas': '/architecture/?view=overview',
  'harness-mirror-drift': '/architecture/?view=guides',
  'harness-changed-since': '/architecture/?view=guides',
  'agent-writes-waiting': '/agents/',
  'agent-writes-failed': '/git/',
  'agent-writes-refused': '/git/',
  'agent-calls-since': '/agents/',
  'agent-writes-since': '/git/',
  'agent-distinct-since': '/agents/',
};

/**
 * In a browser the unchecked-evidence line sends the reader to the download page; inside the app the line means
 * concepts citing no path, so it must not offer the app to someone already in it.
 */
export function lineHref(lineId: string, availability: BriefCore['availability'], appRowPresent = false): string | undefined {
  if (lineId === 'ontology-evidence-unchecked' && availability !== 'app-only') return '/topology/';
  const href = LINE_HREF[lineId];
  // The app row at the foot of the list carries the one "Get the app"; a second copy here would duplicate it.
  if (href === '/download/' && appRowPresent) return undefined;
  return href;
}

/** The destination a row opens, or `undefined` for a row that is not a counted line with somewhere to go. */
export function briefRowHref(row: BriefRow, appRowPresent: boolean): string | undefined {
  if (row.kind !== 'line' || row.line.count === 0) return undefined;
  return lineHref(row.line.id, row.availability, appRowPresent);
}

export const BRIEF_TODO_LIMIT = 3;

/**
 * The first three counted lines with a destination, in list order, are the reader's to-do; every other row stays in
 * the list behind a toggle. `zeroCount` is how many of those rows a reader sees as zero.
 */
export function splitBriefTodo(
  rows: readonly BriefRow[],
  hrefOf: (row: BriefRow) => string | undefined,
): { todo: BriefRow[]; rest: BriefRow[]; zeroCount: number } {
  const todo: BriefRow[] = [];
  const rest: BriefRow[] = [];
  for (const row of rows) {
    if (todo.length < BRIEF_TODO_LIMIT && row.kind === 'line' && row.line.count > 0 && hrefOf(row) !== undefined) todo.push(row);
    else rest.push(row);
  }
  const zeroCount = rest.filter(
    (row) => (row.kind === 'line' && row.line.count === 0) || (row.kind === 'status' && (row.status === 'quiet' || row.status === 'no-data')),
  ).length;
  return { todo, rest, zeroCount };
}
