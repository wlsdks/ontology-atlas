import type { UnmatchedGraphAsk } from "@/entities/knowledge-graph";

/**
 * **Names this folder was asked for and does not hold** — one question, one list.
 *
 * ## What it is, and what it is honestly not (2026-09-05)
 *
 * A relation *type* an agent invents never reaches disk. `add_relation` rejects an
 * unknown `type` against a closed set before touching a file, hands back a
 * closest-value hint, and records the refusal nowhere — not in
 * `.ontology-atlas/activity.jsonl`, which logs successful writes only. So this board
 * cannot say "an agent tried to write `holds_position` twice"; nothing in the folder
 * knows that. Claiming otherwise would be a screen inventing its own evidence.
 *
 * What the folder does hold is the same question asked from the other side: an agent
 * wrote `dependencies: [capabilities/ledger]` because it believed that concept existed.
 * The reference is durable, dated by Git, and reviewable as a diff — and a name three
 * nodes reached for is a concept this ontology is missing, not three typos.
 *
 * ## Why only that one fact (council, 2026-09-05)
 *
 * The first draft also carried missing containment and unplaced concepts. Both already
 * fed the Do-next queue and its blocking badge, so one folder problem raised two numbers
 * on the same screen — the double-count decision 2026-08-07 (3) forbids. Those two stay
 * Do-next's. What is left here is the one fact no other tab can hold, because a dangling
 * name is not a concept: Do-next rows are all real documents, so the two lists cannot
 * meet (proved in `unmatched-board.test.ts`).
 *
 * ## Dismissing hides, it does not fix
 *
 * A dismissal is this viewer's preference in this browser (`unmatched-dismissals.ts`),
 * never a vault write: the folder is Git's, and hiding a row from one screen must not
 * arrive in someone else's diff as a decision. So `totalCount` describes what the folder
 * says and is unmoved by dismissals; only `rows` is filtered, and `dismissedCount` states
 * how much of the truth this viewer chose not to look at.
 */
export interface UnmatchedRow {
  /** Stable across re-reads of the same folder — a dismissal has to outlive a reload. */
  id: string;
  /** The name written in frontmatter that no document answers to. */
  name: string;
  /** How many references asked for it. */
  count: number;
  /** The concepts that asked, sorted. */
  sources: string[];
  /** Frontmatter keys the name was written under, sorted. */
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

/**
 * The dismissal key. The prefix is kept from the three-group draft so a slot written
 * before the narrowing still resolves rather than silently reappearing.
 */
export function unmatchedRowId(name: string): string {
  return `unresolved-reference:${name}`;
}

export function buildUnmatchedBoard(
  input: UnmatchedBoardInput,
  dismissed: ReadonlySet<string>,
): UnmatchedBoard {
  // Asks arrive already ordered by how often each name was reached for.
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
