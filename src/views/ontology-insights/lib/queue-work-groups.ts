import type { SessionAbilities } from "./session-abilities";

/**
 * Groups the to-do queue by the nature of the work, not by person. Meaning work is answered from what the concept
 * means (definition, parent, similar names, broader concept); code work needs facts outside it (a long-unchanged
 * hub, an unconnected concept, a dependency cycle). Grouping is per section, since a section is one question; a
 * concept without a document is demoted within its row instead.
 */

export type QueueWorkGroup = "meaning" | "code";

/** The section identifier inside the queue card; decides each section's group. */
export type QueueSectionKey =
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

// The meaning findings are meaning work: boundaries, unchecked scope, exclusions and kind folders are decidable by
// the person who knows the product.
const GROUP_OF_SECTION: Record<QueueSectionKey, QueueWorkGroup> = {
  "missing-definition": "meaning",
  "missing-boundary": "meaning",
  "missing-uncertainty": "meaning",
  "epistemic-exclusion": "meaning",
  "slug-outside-kind-folder": "meaning",
  "missing-domain": "meaning",
  duplicate: "meaning",
  promotion: "meaning",
  "neglected-hub": "code",
  orphan: "code",
  cycle: "code",
};

export function groupOfQueueSection(section: QueueSectionKey): QueueWorkGroup {
  return GROUP_OF_SECTION[section];
}

/**
 * In a writable vault meaning work comes first, since it finishes here. Read-only inverts it: the handoff is the
 * only action that completes there, and meaning work stays below with what would make it fixable.
 */
export function queueGroupOrder(abilities: SessionAbilities): QueueWorkGroup[] {
  return abilities.canWriteVault ? ["meaning", "code"] : ["code", "meaning"];
}

/** Changes only when abilities change, so a consumer keying on it crossfades only then. */
export function queueGroupOrderKey(abilities: SessionAbilities): string {
  return queueGroupOrder(abilities).join(">");
}

export interface QueueGroupCounts {
  meaning: number;
  code: number;
}

/** Per-group scale: the sum of the pre-truncation section totals, so "N mine" matches the headers. */
export function sumQueueGroupCounts(
  totals: ReadonlyArray<{ section: QueueSectionKey; total: number }>,
): QueueGroupCounts {
  const counts: QueueGroupCounts = { meaning: 0, code: 0 };
  for (const { section, total } of totals) {
    counts[groupOfQueueSection(section)] += Math.max(0, total);
  }
  return counts;
}
