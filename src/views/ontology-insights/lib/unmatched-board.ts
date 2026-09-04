import type { UnmatchedGraphAsk } from "@/entities/knowledge-graph";

/**
 * **The standing list of what agents asked this vault for and did not get.**
 *
 * ## What it is, and what it is honestly not (2026-09-05)
 *
 * A relation *type* an agent invents never reaches disk. `add_relation` rejects an
 * unknown `type` against a closed set before touching a file, hands back a
 * closest-value hint, and records the refusal nowhere — not in
 * `.ontology-atlas/activity.jsonl`, which logs successful writes only. So this board
 * cannot say "an agent tried to write `holds_position` twice"; nothing in the vault
 * knows that. Claiming otherwise would be a screen inventing its own evidence.
 *
 * What the vault does hold is the same question asked from the other side, and all
 * three answers are already on disk:
 *
 * - **A name nothing answers to.** An agent wrote `dependencies: [capabilities/ledger]`
 *   because it believed that concept existed. Three nodes reaching for one name is a
 *   missing concept, not three typos. (MCP `resolve_dangling_reference`.)
 * - **A placement that only points one way.** A capability names its domain and the
 *   domain never names it back. (MCP `add_missing_relation`.)
 * - **A node nothing placed.** A capability or element with no domain and no
 *   containment parent. (MCP `unassigned_node`.)
 *
 * ## Dismissing hides, it does not fix
 *
 * A dismissal is this viewer's preference in this browser (`unmatched-dismissals.ts`),
 * never a vault write: the vault is Git's, and hiding a row from one screen must not
 * arrive in someone else's diff as a decision. So `counts` and `totalCount` describe
 * what the vault says and are unmoved by dismissals; only `rows` is filtered, and
 * `dismissedCount` states how much of the truth this viewer chose not to look at.
 */
export type UnmatchedRowKind =
  | "unresolved-reference"
  | "missing-containment"
  | "unassigned-node";

export interface UnmatchedRow {
  /** Stable across re-reads of the same vault — a dismissal has to outlive a reload. */
  id: string;
  kind: UnmatchedRowKind;
  /** The name this row is about. */
  name: string;
  /** How many references asked for it. One for a row about a single node. */
  count: number;
  /** The nodes involved: who asked, or where the node should have sat. */
  sources: string[];
  /** Frontmatter keys the name was written under. Empty for the node-shaped rows. */
  relations: string[];
}

export interface UnmatchedBoardInput {
  asks: readonly UnmatchedGraphAsk[];
  missingContainment: readonly { slug: string; domain: string }[];
  unassigned: readonly string[];
}

export interface UnmatchedBoard {
  /** What this viewer has not dismissed, most-asked-for first. */
  rows: UnmatchedRow[];
  /** Everything the vault says, dismissals included. */
  totalCount: number;
  dismissedCount: number;
  counts: Record<UnmatchedRowKind, number>;
}

export function unmatchedRowId(kind: UnmatchedRowKind, name: string): string {
  return `${kind}:${name}`;
}

export function buildUnmatchedBoard(
  input: UnmatchedBoardInput,
  dismissed: ReadonlySet<string>,
): UnmatchedBoard {
  const rows: UnmatchedRow[] = [
    // Asks arrive already ordered by how often each name was reached for.
    ...input.asks.map((ask) => ({
      id: unmatchedRowId("unresolved-reference", ask.ref),
      kind: "unresolved-reference" as const,
      name: ask.ref,
      count: ask.count,
      sources: [...ask.sources],
      relations: [...ask.relations],
    })),
    ...input.missingContainment.map((target) => ({
      id: unmatchedRowId("missing-containment", target.slug),
      kind: "missing-containment" as const,
      name: target.slug,
      count: 1,
      sources: [target.domain],
      relations: [],
    })),
    ...input.unassigned.map((slug) => ({
      id: unmatchedRowId("unassigned-node", slug),
      kind: "unassigned-node" as const,
      name: slug,
      count: 1,
      sources: [],
      relations: [],
    })),
  ];

  const counts: Record<UnmatchedRowKind, number> = {
    "unresolved-reference": input.asks.length,
    "missing-containment": input.missingContainment.length,
    "unassigned-node": input.unassigned.length,
  };

  const visible = rows.filter((row) => !dismissed.has(row.id));
  return {
    rows: visible,
    totalCount: rows.length,
    dismissedCount: rows.length - visible.length,
    counts,
  };
}
