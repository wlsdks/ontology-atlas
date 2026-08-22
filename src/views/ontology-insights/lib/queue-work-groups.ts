import type { SessionAbilities } from "./session-abilities";

/**
 * Splits the "to do" queue into two groups **by the nature of the work** — it does not split people.
 *
 * What it fixed: the queue dumped 83 items as one block, which to someone who does not read code
 * read as "there are 0 I can do" (measured 2026-07-26 from a planner's perspective). Yet mixed into
 * them was work that ends once you know the product's meaning — one line of definition, one parent,
 * deciding whether two things are the same concept. Leaving the data alone and changing **only the
 * grouping and the order** into human language turns it into "N mine + M to hand off".
 *
 * The rule (per section — rows are never split):
 *
 * - **Meaning work** = work whose answer comes from the concept's *meaning*: definition (the meaning
 *   itself), parent (where it belongs), similar names (are these the same?), broader-concept
 *   candidates (is this a larger concept?). The screen already supplies the supporting figures — the
 *   person deciding needs no knowledge of the code.
 * - **Code work** = work whose answer requires reading facts *outside* the concept: a long-unchanged
 *   hub (only comparison with the implementation says whether it still holds), an unconnected
 *   concept (what implementation evidence should it link to?), a dependency cycle (which direction
 *   to cut?).
 *
 * Why per section: a section header is a question ("similar names — are these the same thing?").
 * Splitting one question across two groups prints the header twice and makes the queue *less*
 * readable. A concept with no document is demoted within its row instead of moved between groups —
 * a "no document" badge plus a "create the document first" handoff, giving a different first step
 * honestly rather than hiding it.
 */

export type QueueWorkGroup = "meaning" | "code";

/** A section identifier inside the queue card — the source of truth for which group each section belongs to. */
export type QueueSectionKey =
  | "missing-definition"
  | "missing-domain"
  | "duplicate"
  | "promotion"
  | "neglected-hub"
  | "orphan"
  | "cycle";

const GROUP_OF_SECTION: Record<QueueSectionKey, QueueWorkGroup> = {
  "missing-definition": "meaning",
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
 * The group order. **In a writable vault, meaning work comes first** — the work that can be finished
 * on the spot in this session goes at the top of the screen.
 *
 * In a read-only session (a sample, or no permission) it inverts: the only action that session can
 * actually complete is the handoff (copying a command), so work that closes with a handoff goes on
 * top. Meaning work does not disappear and remains below, with the header stating "what would make
 * this fixable" — a next door instead of a dead end.
 */
export function queueGroupOrder(abilities: SessionAbilities): QueueWorkGroup[] {
  return abilities.canWriteVault ? ["meaning", "code"] : ["code", "meaning"];
}

/**
 * A key that tells whether the group order changed. The value differs only when abilities change,
 * so a consumer using it as `key` runs the crossfade **only on an ability change** rather than on
 * every render (rows never jump without reason).
 */
export function queueGroupOrderKey(abilities: SessionAbilities): string {
  return queueGroupOrder(abilities).join(">");
}

export interface QueueGroupCounts {
  meaning: number;
  code: number;
}

/**
 * Per-group scale — simply the sum of the pre-truncation totals already printed beside each section
 * header. Even with three rows visible, the header states the full number, so the group count must
 * be the full number too, or "N mine" contradicts the list length.
 */
export function sumQueueGroupCounts(
  totals: ReadonlyArray<{ section: QueueSectionKey; total: number }>,
): QueueGroupCounts {
  const counts: QueueGroupCounts = { meaning: 0, code: 0 };
  for (const { section, total } of totals) {
    counts[groupOfQueueSection(section)] += Math.max(0, total);
  }
  return counts;
}
