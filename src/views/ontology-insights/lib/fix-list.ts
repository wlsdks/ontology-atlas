import type { VaultDocumentIssue, VaultValidationSummary } from "@/shared/lib/validate-vault-document";
import type { SessionAbilities } from "./session-abilities";
import { queueGroupOrder } from "./queue-work-groups";

/**
 * **One list, one order.**
 *
 * The "to do" tab used to show the same items three ways: a readiness meter, a counter band, and
 * a queue split into two labelled groups. The owner could not tell why the screen existed
 * (recorded decision, 2026-08-31). The data sources did not change; only the presentation did.
 * This module owns the one thing that presentation still needs from a pure function: **which
 * kinds of item come first**.
 *
 * Keeping the order here rather than inline in the tab means the order is testable without a
 * renderer, and adding a kind fails type checking in `FIX_BLOCK_KEYS` rather than silently
 * appending itself at the bottom of the screen.
 */
export type FixBlockKey =
  | "blocked-document"
  | "repair"
  | "missing-definition"
  | "missing-domain"
  | "duplicate"
  | "promotion"
  | "neglected-hub"
  | "orphan"
  | "cycle";

/**
 * The blocks that come before the queue's own sections.
 *
 * **blocked-document** and **repair** carry what the removed counter band used to state. They are
 * the blocking family (`insights-verdict`): a document that fails validation never becomes a
 * usable node, and an island or a missing parent is what flips the same verdict the CLI reports
 * to `needs_attention`. Blocking work sits above advisory work.
 *
 * A third block, **touch-up**, led this order until 2026-09-06. It drew the three highest-ranked
 * items again at the top of the list, deduplicated out of the sections they came from. With the
 * list grouped by finding (`do-next-groups.ts`), a picks band would be a group whose count is not
 * in the verdict record — the one thing the sum contract forbids — and priority is now carried by
 * the group order itself. `pickTodaysTouchUps` went with it.
 */
const LEADING_BLOCKS: readonly FixBlockKey[] = ["blocked-document", "repair"];

/** The queue's own sections, in the order each group already rendered them. */
const GROUP_BLOCKS = {
  meaning: ["missing-definition", "missing-domain", "duplicate", "promotion"],
  code: ["neglected-hub", "orphan", "cycle"],
} as const satisfies Record<"meaning" | "code", readonly FixBlockKey[]>;

/**
 * The full render order. The group order still follows the session's abilities
 * (`queueGroupOrder`) — in a read-only session the work that closes with a handoff comes first —
 * but no group heading is drawn any more, so this is one flat sequence of row kinds.
 */
export function fixBlockOrder(abilities: SessionAbilities): FixBlockKey[] {
  return [
    ...LEADING_BLOCKS,
    ...queueGroupOrder(abilities).flatMap((group) => [...GROUP_BLOCKS[group]]),
  ];
}

/** One document that failed validation, reduced to what a row needs. */
export interface BlockedDocumentRow {
  /** Vault slug, used both as the row identity and as the address in the documents surface. */
  slug: string;
  /** The first error-severity issue, which is the one the row states in plain words. */
  code: VaultDocumentIssue["code"];
}

/**
 * Blocked documents, derived from the **same** `summarizeVaultValidation` result the removed
 * readiness meter counted. The meter said "5 blocked" and named none of them; these rows name
 * them. Nothing about the computation changed.
 *
 * Warnings are excluded on purpose: only an error stops a document becoming a node an agent can
 * use, and a list that mixes the two makes "blocked" mean nothing.
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

/** How many documents are blocked in total, so a truncated list can still state its scale. */
export function countBlockedDocuments(
  summary: Pick<VaultValidationSummary, "issuesBySlug">,
): number {
  return summary.issuesBySlug.filter((entry) =>
    entry.issues.some((issue) => issue.severity === "error"),
  ).length;
}
