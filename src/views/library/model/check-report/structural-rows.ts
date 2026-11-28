import type { useTranslations } from "use-intl";

import {
  describeWikiProblem,
  type WikiProblemContext,
  type WikiProblemWhere,
  type WikiProblemWords,
} from "@/features/library";
import type { WikiReportRow } from "@/shared/lib/library/wiki-report.mjs";

/**
 * Rows in one code group naming the same page and sentence merge into one row whose door carries
 * every place; places come from the describer in the reader's words.
 */
export interface StructuralRow {
  row: WikiReportRow;
  words: WikiProblemWords;
  /** Every place this row stands for, in the validator's order. */
  places: WikiProblemWhere[];
}

export function collapseStructuralRows(
  rows: readonly WikiReportRow[],
  t: ReturnType<typeof useTranslations<"library">>,
  context: WikiProblemContext,
): StructuralRow[] {
  const out: StructuralRow[] = [];
  const at = new Map<string, number>();
  for (const row of rows) {
    const words = describeWikiProblem(row, t, context);
    // A unit separator between the fields, since a page path can hold any character a folder allows.
    const key = `${row.page}␟${words.sentence}`;
    const seen = at.get(key);
    if (seen === undefined) {
      at.set(key, out.length);
      out.push({ row, words, places: words.where ? [words.where] : [] });
    } else if (words.where) {
      out[seen]!.places.push(words.where);
    }
  }
  return out;
}

/** The sentence with every name and place taken out: what makes two rows one finding said twice. */
export function sentenceShape(words: WikiProblemWords): string {
  return words.segments
    .map((segment) =>
      segment.kind === "text"
        ? `t${segment.text}`
        : segment.kind === "where"
          ? "w"
          : `g${segment.target.kind}:${segment.target.id}`,
    )
    .join("␟");
}

/**
 * A sentence is shared only when every row's shape and place read alike; one that names a different
 * page or line on each row is the finding itself. The action is judged apart: one code can carry two
 * repairs, and a wrong one printed once is worse than a right one printed twice.
 */
export function sharedRule(rows: readonly StructuralRow[]): { sentence: StructuralRow | null; action: string | null } {
  const first = rows[0];
  if (!first) return { sentence: null, action: null };
  const shape = sentenceShape(first.words);
  const place = first.words.where?.label ?? null;
  const sameSentence = rows.every(
    (entry) => sentenceShape(entry.words) === shape && (entry.words.where?.label ?? null) === place,
  );
  const action = first.words.action;
  const sameAction = action !== null && rows.every((entry) => entry.words.action === action);
  return { sentence: sameSentence ? first : null, action: sameAction ? action : null };
}

/** The place on a door, in the reader's words; the section is already in the sentence. */
export function placeSuffix(where: WikiProblemWhere): string {
  return where.lineLabel ?? where.label;
}

/** A page's slug without the `wiki/` folder, as a door shows it. */
export function pageName(slug: string): string {
  return slug.replace(/^wiki\//, "");
}

/** `wiki/<slug>.md` as the aggregator carries it, to the slug the reader opens. */
export function pageSlug(path: string): string {
  return path.replace(/\.md$/, "");
}
