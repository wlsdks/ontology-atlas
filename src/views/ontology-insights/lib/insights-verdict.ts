/**
 * The **single verdict model** for the insights screen.
 *
 * Why it exists: one screen said contradictory things about the same vault.
 *
 * - The `to do` tab badge counted only `do-next-queue` — neglected hubs, orphans, promotion
 *   candidates, and dependency cycles. Statistical signals.
 * - The `repair queue` counted the CLI-parity `vault-health` — disconnected islands and missing
 *   containment, the very signals `node $ATLAS/cli/src/index.mjs health` flips to
 *   `needs_attention` on.
 * - The empty-state copy judged from do-next alone and declared "nothing to fix right now — the
 *   graph is healthy".
 *
 * So on a starter vault whose only signal is one missing containment, `to do 0` +
 * "the graph is healthy" + `missing containment 1` appeared **at the same time**, while MCP
 * `health` returned `needs_attention` for the same data (review 2026-07-25). That was the
 * result of aligning only the repair queue with the CLI while leaving the to-do and health copy
 * on the old model.
 *
 * This module folds the two signal families into one verdict. It does not avoid the
 * contradiction by hiding numbers — it counts both, while distinguishing **what is blocking from
 * what is advisory**, so "healthy" appears only when the count really is zero.
 *
 * ## ⚠️ Why queue sections arrive as `Record<QueueSectionKey, number>` rather than separate fields
 *
 * **Because the same illness happened twice more.** This verdict and the group badge
 * (`sumQueueGroupCounts`) each kept a **hand-maintained list**, and each time a section was added
 * only one of them grew:
 *
 * - `meaningGaps` — retrofitted later (the field comment above records that history).
 * - `duplicate` — **never made it in.** Measured 2026-08-07 on a sample vault: the tab badge read
 *   «to do **7**» directly above a group heading reading «**8**». The difference was one duplicate
 *   pair, and one screen was counting the same work with two numbers.
 *
 * Adding values does not stop the third occurrence. So **the section totals arrive whole** —
 * adding an entry to `QueueSectionKey` makes this `Record` incomplete, which **fails type
 * checking**, and forces the decision «is this blocking or advisory?» right there. With one list
 * there is nowhere to diverge.
 */

import type { QueueSectionKey } from "./queue-work-groups";

export interface InsightsSignalCounts {
  /** A signal the CLI flips to needs_attention on — disconnected islands. */
  islands: number;
  /** A signal the CLI flips to needs_attention on — missing parent domain. */
  missingContainment: number;
  /**
   * Documents that fail frontmatter validation.
   *
   * Added 2026-08-31 with the one-list "to do" tab. The readiness meter used to be the only place
   * these appeared, as a number with no names attached; now each blocked document is a row in the
   * list. A row the screen draws and the badge does not count is the exact contradiction this
   * module exists to prevent, so the signal joins the verdict on the blocking side: a document
   * that fails validation either never becomes a node or collides on identity, so an agent cannot
   * use it at all.
   */
  blockedDocuments: number;
  /**
   * Per-section totals of the "to do" queue (the pre-truncation scale) — **all of them** must be
   * present.
   *
   * These are **the same numbers** the group badge (`sumQueueGroupCounts`) receives. Two consumers
   * sharing one input means one screen cannot count the same work with two numbers.
   */
  sections: Record<QueueSectionKey, number>;
}

/**
 * Whether a section is blocking or advisory.
 *
 * - **Blocking** — the graph is structurally broken. Dependency cycles are the only one (a
 *   direction has to be cut, and until it is, every other judgement is unstable).
 * - **Advisory** — a statistical suggestion, or a gap a person fills with one sentence: meaning,
 *   parent, duplicates, promotion candidates, neglected hubs, orphans.
 *
 * Adding a section makes this table incomplete and fails type checking — that is the point where
 * classification is forced.
 */
const SECTION_SEVERITY: Record<QueueSectionKey, "blocking" | "advisory"> = {
  "missing-definition": "advisory",
  "missing-domain": "advisory",
  duplicate: "advisory",
  promotion: "advisory",
  "neglected-hub": "advisory",
  orphan: "advisory",
  cycle: "blocking",
};

export interface InsightsVerdict {
  /**
   * The number of signals meaning the graph "must be fixed" — what the CLI judges as
   * needs_attention. While this is non-zero, no surface may say "healthy".
   */
  blocking: number;
  /** The number of advisory items worth doing. Not blocking. */
  advisory: number;
  /** The total used by the badge — the "to do" a user sees is the sum of both. */
  total: number;
  /**
   * May `healthy` be claimed? True **only when both blocking and advisory are zero** — saying
   * "the graph is healthy" while advisory items remain makes the screen contradict itself the
   * moment the repair queue directly below shows one.
   */
  healthy: boolean;
  /**
   * The same verdict string as the CLI (`node $ATLAS/cli/src/index.mjs health` / MCP `health`).
   * Exposed so a contract test can catch the UI and the agent using different words.
   */
  status: "healthy" | "needs_attention";
}

export function buildInsightsVerdict(counts: InsightsSignalCounts): InsightsVerdict {
  let sectionBlocking = 0;
  let advisory = 0;
  for (const key of Object.keys(SECTION_SEVERITY) as QueueSectionKey[]) {
    const total = Math.max(0, counts.sections[key] ?? 0);
    if (SECTION_SEVERITY[key] === "blocking") sectionBlocking += total;
    else advisory += total;
  }
  const blocking =
    counts.islands + counts.missingContainment + counts.blockedDocuments + sectionBlocking;
  return {
    blocking,
    advisory,
    total: blocking + advisory,
    healthy: blocking === 0 && advisory === 0,
    // The CLI flips to needs_attention only on islands, missing containment, blocked documents,
    // and cycles —
    // advisory items are statistical suggestions and do not change the verdict. So `status` reads
    // blocking alone, while `healthy` (may the screen say "healthy"?) reads both.
    status: blocking === 0 ? "healthy" : "needs_attention",
  };
}
