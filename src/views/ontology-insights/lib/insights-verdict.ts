/**
 * The single verdict model for the insights screen. It folds the CLI-parity health signals (islands, missing
 * containment) and the to-do queue's statistical signals into one count split into blocking and advisory, so the
 * tab badge, repair rows and health copy cannot contradict each other or MCP `health`. Queue sections arrive whole
 * as `Record<QueueSectionKey, number>`: a new section fails type checking until it is classified here, and the
 * group badge (`sumQueueGroupCounts`) reads the same input.
 */

import type { QueueSectionKey } from "./queue-work-groups";

export interface InsightsSignalCounts {
  /** A signal the CLI flags as needs_attention: disconnected islands. */
  islands: number;
  /** A signal the CLI flags as needs_attention: missing parent domain. */
  missingContainment: number;
  /**
   * Documents failing frontmatter validation. Each is a row in the list, so the verdict counts it as blocking: such a
   * document never becomes a node or collides on identity, so an agent cannot use it.
   */
  blockedDocuments: number;
  /** Pre-truncation to-do section totals, all present; the same numbers the group badge (`sumQueueGroupCounts`) receives. */
  sections: Record<QueueSectionKey, number>;
}

/**
 * Blocking means structurally broken (only dependency cycles); advisory means a statistical suggestion or a gap a
 * person fills with one sentence. A new section leaves this table incomplete and fails type checking.
 */
const SECTION_SEVERITY: Record<QueueSectionKey, "blocking" | "advisory"> = {
  "missing-definition": "advisory",
  // The meaning findings are advisory by construction rule 5: refusing a body would make naming a thing before
  // defining it an error. They repeat to the person what the validator tells the agent.
  "missing-boundary": "advisory",
  "missing-uncertainty": "advisory",
  "epistemic-exclusion": "advisory",
  "slug-outside-kind-folder": "advisory",
  "missing-domain": "advisory",
  duplicate: "advisory",
  promotion: "advisory",
  "neglected-hub": "advisory",
  orphan: "advisory",
  cycle: "blocking",
};

export interface InsightsVerdict {
  /** Signals the CLI judges as needs_attention; while non-zero, no surface may say "healthy". */
  blocking: number;
  /** Advisory items worth doing; not blocking. */
  advisory: number;
  /** The badge total: blocking plus advisory. */
  total: number;
  /** True only when blocking and advisory are both zero, or the screen would say healthy above a repair row. */
  healthy: boolean;
  /** The CLI's verdict string (`health` in CLI and MCP), exposed so a contract test catches the UI using other words. */
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
    // The CLI flags only islands, missing containment, blocked documents and cycles, so `status` reads blocking alone
    // while `healthy` reads both.
    status: blocking === 0 ? "healthy" : "needs_attention",
  };
}
