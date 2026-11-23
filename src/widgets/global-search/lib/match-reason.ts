import { normalizeForMatch } from "@/shared/lib/search-match/node-name-match";
import { snippetAroundFirstMatch } from "@/shared/lib/search-match/highlight-match";
import type { SearchMatchEvidence } from "./match";

/**
 * What a result row puts in its trailing column; `kind` is also written
 * as `data-search-result-reason` so the contract is measurable on the rendered row.
 */
export interface MatchReason {
  kind: "summary" | "name" | "id";
  text: string;
  query?: string;
}

/**
 * The row's reason for being in the list. Matching looks wider than the row draws (every name, the
 * summary, the id), so the trailing column always holds the evidence: the summary plain when the
 * drawn name matched, otherwise the other name, the summary at the match, or the id's slug, marked.
 * A mark means only "this is what you typed".
 */
export function describeMatchReason(input: {
  matched?: SearchMatchEvidence;
  label: string;
  summary?: string;
  query: string;
}): MatchReason | null {
  const { matched, label, query } = input;
  const summary = input.summary ? withoutInlineMarks(input.summary) : undefined;
  const plainSummary = summary ? { kind: "summary" as const, text: summary } : null;
  if (!matched) return plainSummary;

  if (matched.field === "name") {
    // The name on screen carried it, so the row is already marked where it counts.
    if (normalizeForMatch(matched.text) === normalizeForMatch(label)) return plainSummary;
    return { kind: "name", text: matched.text, query };
  }

  if (matched.field === "summary") {
    return { kind: "summary", text: snippetAroundFirstMatch(withoutInlineMarks(matched.text), query), query };
  }

  return { kind: "id", text: matched.text, query };
}

/**
 * From `md` up a fixed-width column, so one text start line. Below `md` a marked reason drops to
 * its own line under the name; an unmarked summary stays an md-and-up column.
 */
export function reasonLineClass(reason: MatchReason): string {
  const shared = "min-w-0 truncate text-body text-[color:var(--color-text-tertiary)] md:w-[14rem] md:shrink-0";
  return reason.query ? `block ${shared}` : `hidden md:block ${shared}`;
}

/** A summary as one line of prose: code ticks, emphasis marks and link targets are not shown. */
export function withoutInlineMarks(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2");
}
