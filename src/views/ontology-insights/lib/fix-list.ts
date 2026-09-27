import type { VaultDocumentIssue, VaultValidationSummary } from "@/shared/lib/validate-vault-document";
import type { SessionAbilities } from "./session-abilities";
import { queueGroupOrder } from "./queue-work-groups";

/**
 * One list, one order: which kinds of item come first on the to-do tab. Kept pure so the order is testable
 * without a renderer, and `FixBlockKey` makes a new kind a type error instead of a silent last place.
 */
export type FixBlockKey =
  | "blocked-document"
  | "repair"
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

/**
 * The blocks before the queue's own sections. Blocked documents and repairs are the blocking family
 * (`insights-verdict`), so they sit above advisory work. Priority is carried by the group order, not by a
 * picks band, whose count would not be in the verdict record.
 */
const LEADING_BLOCKS: readonly FixBlockKey[] = ["blocked-document", "repair"];

/** The queue's own sections, in each group's render order. */
const GROUP_BLOCKS = {
  // The validator's question order: what is this, what it includes and excludes, what was not checked, whether an
  // exclusion is a reading limit, where the file sits. The two write-in-place rows stay on top.
  meaning: [
    "missing-definition",
    "missing-domain",
    "missing-boundary",
    "missing-uncertainty",
    "epistemic-exclusion",
    "slug-outside-kind-folder",
    "duplicate",
    "promotion",
  ],
  code: ["neglected-hub", "orphan", "cycle"],
} as const satisfies Record<"meaning" | "code", readonly FixBlockKey[]>;

/**
 * The full render order. Groups still follow session abilities (`queueGroupOrder`), but without headings this is
 * one flat sequence of row kinds.
 */
export function fixBlockOrder(abilities: SessionAbilities): FixBlockKey[] {
  return [
    ...LEADING_BLOCKS,
    ...queueGroupOrder(abilities).flatMap((group) => [...GROUP_BLOCKS[group]]),
  ];
}

/** One document that failed validation, reduced to what a row needs. */
export interface BlockedDocumentRow {
  /** Vault slug: the row identity and the documents-surface address. */
  slug: string;
  /** The first error-severity issue, which the row states in plain words. */
  code: VaultDocumentIssue["code"];
}

/**
 * Blocked documents from the same `summarizeVaultValidation` result, each named. Warnings are excluded:
 * only an error stops a document becoming a usable node.
 */
export function buildBlockedDocumentRows(
  summary: Pick<VaultValidationSummary, "issuesBySlug">,
  limit: number,
): BlockedDocumentRow[] {
  const rows: BlockedDocumentRow[] = [];
  for (const entry of summary.issuesBySlug) {
    const error = entry.issues.find((issue) => issue.severity === "error");
    if (!error) continue;
    rows.push({ slug: entry.slug, code: error.code });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** All blocked documents, so a truncated list still states its scale. */
export function countBlockedDocuments(
  summary: Pick<VaultValidationSummary, "issuesBySlug">,
): number {
  return summary.issuesBySlug.filter((entry) =>
    entry.issues.some((issue) => issue.severity === "error"),
  ).length;
}
