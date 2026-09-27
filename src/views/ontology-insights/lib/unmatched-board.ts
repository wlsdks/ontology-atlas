import type { UnmatchedGraphAsk } from "@/entities/knowledge-graph";

/**
 * Names this folder was asked for and does not hold. An agent's invented relation type never reaches disk
 * (`add_relation` rejects it and logs nothing), so the board cannot claim it; a dangling reference such
 * as `dependencies: [capabilities/ledger]` is durable and reviewable, and a name several nodes reached for is a missing
 * concept. Missing containment and unplaced concepts stay Do-next's, so one problem never raises two numbers, and
 * dangling names are not documents, so the two lists cannot meet (`unmatched-board.test.ts`). A dismissal is this
 * viewer's browser preference (`unmatched-dismissals.ts`), never a vault write: `totalCount` ignores dismissals,
 * only `rows` is filtered, and `dismissedCount` says how much was hidden.
 */
export interface UnmatchedRow {
  /** Stable across re-reads of the same folder, so a dismissal outlives a reload. */
  id: string;
  /** The frontmatter name no document answers to. */
  name: string;
  /** How many references asked for it. */
  count: number;
  sources: string[];
  relations: string[];
}

export interface UnmatchedBoardInput {
  asks: readonly UnmatchedGraphAsk[];
}

export interface UnmatchedBoard {
  /** What this viewer has not dismissed, most-asked-for first. */
  rows: UnmatchedRow[];
  /** Distinct missing names in the folder, dismissals included. */
  totalCount: number;
  dismissedCount: number;
}

/** The dismissal key; its prefix is kept so slots written by the earlier three-group version still resolve. */
export function unmatchedRowId(name: string): string {
  return `unresolved-reference:${name}`;
}

export function buildUnmatchedBoard(
  input: UnmatchedBoardInput,
  dismissed: ReadonlySet<string>,
): UnmatchedBoard {
  // Asks arrive ordered by how often each name was reached for.
  const rows: UnmatchedRow[] = input.asks.map((ask) => ({
    id: unmatchedRowId(ask.ref),
    name: ask.ref,
    count: ask.count,
    sources: [...ask.sources],
    relations: [...ask.relations],
  }));

  const visible = rows.filter((row) => !dismissed.has(row.id));
  return {
    rows: visible,
    totalCount: rows.length,
    dismissedCount: rows.length - visible.length,
  };
}
