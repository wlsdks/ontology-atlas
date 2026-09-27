import type { InsightsSignalCounts } from "./insights-verdict";
import type { SessionAbilities } from "./session-abilities";
import { fixBlockOrder, type FixBlockKey } from "./fix-list";

/**
 * The to-do tab's finding groups: one row per kind of finding, whose counts add up to the title count. A group says
 * a repeated sentence once with its number and opens to the same rows the flat list drew. The counts are the
 * verdict's own `InsightsSignalCounts` re-keyed, not a second census; the
 * contract `tests/contract/do-next-group-sum.contract.test.ts` pins `sum(groupCounts) === verdict.total`, and a group
 * missing from that record fails type checking.
 */
export type DoNextGroupKey =
  | "blocked-document"
  | "island"
  | "containment"
  | "missing-definition"
  | "missing-boundary"
  | "missing-uncertainty"
  | "epistemic-exclusion"
  | "slug-outside-kind-folder"
  | "missing-domain"
  | "duplicate"
  | "promotion"
  | "neglected-hub"
  | "orphan"
  | "cycle";

export type DoNextGroupCounts = Record<DoNextGroupKey, number>;

/** The per-group scale from the verdict's signal counts: no second traversal or list of section names. */
export function buildDoNextGroupCounts(counts: InsightsSignalCounts): DoNextGroupCounts {
  return {
    "blocked-document": Math.max(0, counts.blockedDocuments),
    island: Math.max(0, counts.islands),
    containment: Math.max(0, counts.missingContainment),
    "missing-definition": Math.max(0, counts.sections["missing-definition"]),
    "missing-boundary": Math.max(0, counts.sections["missing-boundary"]),
    "missing-uncertainty": Math.max(0, counts.sections["missing-uncertainty"]),
    "epistemic-exclusion": Math.max(0, counts.sections["epistemic-exclusion"]),
    "slug-outside-kind-folder": Math.max(0, counts.sections["slug-outside-kind-folder"]),
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
 * The group order is `fixBlockOrder` with the `repair` block split into its two signals
 * (`islandCount`, `missingContainmentCount`), which the CLI reports apart.
 */
export function doNextGroupOrder(abilities: SessionAbilities): DoNextGroupKey[] {
  return fixBlockOrder(abilities).flatMap((block: FixBlockKey): DoNextGroupKey[] =>
    block === "repair" ? ["island", "containment"] : [block],
  );
}

/**
 * The group holding a review id, so returning from the map reopens it. Ids are `<kind>:<node id>`
 * or `cycle:<cycle id>`, so the prefix is the group; the two repair signals have no review id.
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
    // The four finding sections claim their rows the same way.
    "missing-boundary",
    "missing-uncertainty",
    "epistemic-exclusion",
    "slug-outside-kind-folder",
  ];
  return known.find((key) => key === prefix) ?? null;
}
