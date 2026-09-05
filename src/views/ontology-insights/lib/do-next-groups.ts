import type { InsightsSignalCounts } from "./insights-verdict";
import type { SessionAbilities } from "./session-abilities";
import { fixBlockOrder, type FixBlockKey } from "./fix-list";

/**
 * **The "to do" tab's finding groups — one row per kind of finding, and their counts add up to
 * the one title count.**
 *
 * ## Why the flat list became grouped rows (owner, 2026-09-06)
 *
 * The one flat list of 2026-08-31 was right about counting the work once and wrong about how a
 * person reads it. Measured on the dogfood folder at 1512×949: the first screen was eight rows,
 * every one of them 1,230px wide and 80px tall, and all eight carried **the same sentence** —
 * "the domain it belongs to does not point back at this concept". Eight rows to say one thing
 * eight times, with the actual scale of the work only visible by scrolling. The owner's words:
 * *"the to-do list just keeps getting longer and its content only runs sideways."*
 *
 * A group row says the same thing once with a number beside it, and opens to the named rows on
 * demand. Nothing was removed: expanding a group shows exactly the rows the flat list drew.
 *
 * ## The invariant that makes grouping safe
 *
 * Splitting one number into ten is the shape of the accident recorded in 2026-08-07 (3), where a
 * tab badge read 7 above a group heading reading 8. So the group counts are not a second census:
 * they are **the same `InsightsSignalCounts` the verdict is built from**, re-keyed. `groupCounts`
 * and `buildInsightsVerdict` therefore take one argument, and
 * `tests/contract/do-next-group-sum.contract.test.ts` pins `sum(groupCounts) === verdict.total`
 * over generated inputs. A group whose count is not in that record fails type checking, exactly
 * as `SECTION_SEVERITY` does.
 */
export type DoNextGroupKey =
  | "blocked-document"
  | "island"
  | "containment"
  | "missing-definition"
  | "missing-domain"
  | "duplicate"
  | "promotion"
  | "neglected-hub"
  | "orphan"
  | "cycle";

export type DoNextGroupCounts = Record<DoNextGroupKey, number>;

/**
 * The per-group scale, derived from the **same** signal counts the verdict reads. There is no
 * second traversal and no second list of section names, so the two can never disagree.
 */
export function buildDoNextGroupCounts(counts: InsightsSignalCounts): DoNextGroupCounts {
  return {
    "blocked-document": Math.max(0, counts.blockedDocuments),
    island: Math.max(0, counts.islands),
    containment: Math.max(0, counts.missingContainment),
    "missing-definition": Math.max(0, counts.sections["missing-definition"]),
    "missing-domain": Math.max(0, counts.sections["missing-domain"]),
    duplicate: Math.max(0, counts.sections.duplicate),
    promotion: Math.max(0, counts.sections.promotion),
    "neglected-hub": Math.max(0, counts.sections["neglected-hub"]),
    orphan: Math.max(0, counts.sections.orphan),
    cycle: Math.max(0, counts.sections.cycle),
  };
}

export function sumDoNextGroupCounts(counts: DoNextGroupCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

/**
 * The group order. It is `fixBlockOrder` — the standing order the flat list already rendered,
 * which still follows the session's abilities — with the single `repair` block expanded into the
 * two signals it always carried separately (`islandCount`, `missingContainmentCount`). Those two
 * were one block only because one flat list has no place to state two numbers; a grouped list
 * does, and the CLI has reported them apart all along.
 */
export function doNextGroupOrder(abilities: SessionAbilities): DoNextGroupKey[] {
  return fixBlockOrder(abilities).flatMap((block: FixBlockKey): DoNextGroupKey[] =>
    block === "repair" ? ["island", "containment"] : [block],
  );
}

/**
 * Which group holds a given review id, so returning from the map re-opens the group the row lives
 * in. Review ids are `<kind>:<node id>` (and `cycle:<cycle id>`), so the prefix is the group —
 * except the two repair signals, which have no review id of their own.
 */
export function groupOfReviewId(reviewId: string | null | undefined): DoNextGroupKey | null {
  if (!reviewId) return null;
  const prefix = reviewId.slice(0, reviewId.indexOf(":"));
  const known: readonly DoNextGroupKey[] = [
    "promotion",
    "neglected-hub",
    "orphan",
    "cycle",
    "duplicate",
  ];
  return known.find((key) => key === prefix) ?? null;
}
