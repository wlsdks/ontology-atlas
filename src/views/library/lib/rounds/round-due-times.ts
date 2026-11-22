import { dueOnThisClock, type RoundRecord, type RoundStore } from "@/entities/library-round";

/**
 * Each round with the due time this clock reads for it, saving a corrected time back to the file.
 * A time the file refused is kept in `held` so the next read does not undo it; `held` drops it once the
 * file's own time has caught up. Mutates `held`.
 */
export async function reconcileRoundDueTimes(
  stored: readonly RoundRecord[],
  held: Map<string, string>,
  store: Pick<RoundStore, "patch">,
  now: Date,
): Promise<RoundRecord[]> {
  const rounds: RoundRecord[] = [];
  for (const round of stored) {
    const kept = held.get(round.id);
    if (kept !== undefined && Date.parse(round.nextDueAt) >= Date.parse(kept)) held.delete(round.id);
    let due = held.get(round.id) ?? dueOnThisClock(round, now);
    if (due !== round.nextDueAt && !held.has(round.id)) {
      const seen = round.nextDueAt;
      const moved = await store.patch(round.id, (current) => (current.nextDueAt === seen ? { nextDueAt: due } : {}));
      if (moved.status !== "saved") held.set(round.id, due);
      else due = moved.state.rounds.find((entry) => entry.id === round.id)?.nextDueAt ?? due;
      due = held.get(round.id) ?? due;
    }
    rounds.push(due === round.nextDueAt ? round : { ...round, nextDueAt: due });
  }
  return rounds;
}
