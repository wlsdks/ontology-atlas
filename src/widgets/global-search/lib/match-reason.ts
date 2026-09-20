import { normalizeForMatch } from "@/shared/lib/node-name-match";
import { snippetAroundFirstMatch } from "@/shared/lib/highlight-match";
import type { SearchMatchEvidence } from "./match";

/**
 * What a result row puts in its trailing column, and whether to mark inside it.
 *
 * `kind` is also written to the DOM as `data-search-result-reason`, so the contract
 * can be measured on the rendered row rather than inferred.
 */
export interface MatchReason {
  kind: "summary" | "name" | "id";
  /** The text to draw. */
  text: string;
  /** The query to mark inside `text`, or undefined to draw it plain. */
  query?: string;
}

/**
 * The row's reason for being in the list.
 *
 * **Why the column changes contents.** Matching deliberately looks wider than the
 * row draws: every one of a node's names (the canonical `title` and every
 * `display_<locale>`, which is `shared/lib/node-name-match`'s whole purpose), the
 * summary, and the id. The row drew only the localised name and the summary, so a
 * match on anything else arrived with nothing to see. Measured 2026-09-19 on the
 * bundled Online Store sample, thirty English queries: **97 of 317 rows (30.6%)
 * carried no highlight at all** — a capability found by "policy" whose screen name is
 * Korean, an element found by "log" through its slug, and so on. A search result that
 * cannot say why it is a result reads as a broken search.
 *
 * So one seat, one job: the trailing column always holds the evidence.
 *
 * | matched | column |
 * |---|---|
 * | the name already drawn | the summary, plain — the mark is already on the name |
 * | another of its names | that name, marked |
 * | the summary | the summary opened at the match, marked |
 * | the id | the id's slug, marked (drawn mono, because it is one) |
 *
 * A mark therefore means exactly one thing: *this is what you typed*. That is why the
 * context summary is drawn plain even when it happens to contain the query — a second
 * incidental mark would make the first one ambiguous.
 */
export function describeMatchReason(input: {
  matched?: SearchMatchEvidence;
  /** The name the row is drawing. */
  label: string;
  summary?: string;
  query: string;
}): MatchReason | null {
  const { matched, label, summary, query } = input;
  const plainSummary = summary ? { kind: "summary" as const, text: summary } : null;
  if (!matched) return plainSummary;

  if (matched.field === "name") {
    // The name on screen carried it, so the row is already marked where it counts.
    if (normalizeForMatch(matched.text) === normalizeForMatch(label)) return plainSummary;
    return { kind: "name", text: matched.text, query };
  }

  if (matched.field === "summary") {
    return { kind: "summary", text: snippetAroundFirstMatch(matched.text, query), query };
  }

  return { kind: "id", text: matched.text, query };
}

/**
 * Where the reason sits, which is a different question at each width.
 *
 * From `md` up it is a column beside the name: a **fixed** width, not a maximum, so
 * one column has one text start line (with `max-w`, four rows of the same query began
 * at four different x across a 153px spread, because each short reason was pushed
 * flush right by the name's `flex-1`).
 *
 * Below `md` there is no room for a column, and the class that hid it took the whole
 * answer with it — measured 2026-09-19 at 390x844 on the bundled sample: `policy`
 * showed 4 rows with **0** marks, `order` and `shopper` 20 rows with 0, while on the
 * desktop layout every one of them was explained. So a reason that **carries a mark**
 * drops to a line of its own under the name there.
 *
 * A reason with no mark is the summary standing in as context, and the name it would
 * sit under is already the answer. Giving that a second line would make every row on
 * a phone twice as tall to repeat something the row is not there for, so it stays a
 * `md`-and-up column.
 */
export function reasonLineClass(reason: MatchReason): string {
  const shared = "min-w-0 truncate text-body text-[color:var(--color-text-tertiary)] md:w-[14rem] md:shrink-0";
  return reason.query ? `block ${shared}` : `hidden md:block ${shared}`;
}
