import { describe, expect, it, vi } from "vitest";

import { nextDueAt, type RoundRecord, type RoundState } from "@/entities/library-round";

import { reconcileRoundDueTimes } from "./round-due-times";

const NOW = new Date(2026, 10, 22, 10, 0, 0);
const CADENCE = { daily: "03:00", weekdaysOnly: false } as const;
const ON_GRID = nextDueAt(CADENCE, NOW).toISOString();
const OFF_GRID = new Date(NOW.getTime() + 90 * 60_000).toISOString();

const round = (nextDue: string): RoundRecord =>
  ({ id: "r1", name: "Nightly", kind: "consistency", cadence: CADENCE, enabled: true, createdAt: "2026-11-01T00:00:00.000Z", nextDueAt: nextDue }) as RoundRecord;

function storeSaving(nextDueAtAfter: string | null) {
  const patch = vi.fn(async (_id: string, change: unknown) => {
    const current = round(OFF_GRID);
    const applied = typeof change === "function" ? change(current) : change;
    return nextDueAtAfter === null
      ? { status: "write_failed" as const, state: { rounds: [current] } as unknown as RoundState }
      : { status: "saved" as const, state: { rounds: [{ ...current, ...applied, nextDueAt: nextDueAtAfter }] } as unknown as RoundState };
  });
  return { store: { patch }, patch };
}

describe("reconcileRoundDueTimes", () => {
  it("leaves a round alone when its stored time already sits on this clock's grid", async () => {
    const { store, patch } = storeSaving(ON_GRID);
    const stored = [round(ON_GRID)];
    expect(await reconcileRoundDueTimes(stored, new Map(), store, NOW)).toEqual(stored);
    expect(patch).not.toHaveBeenCalled();
  });

  it("moves a round whose time is off this clock's grid and saves the move only if nobody changed it meanwhile", async () => {
    const { store, patch } = storeSaving(ON_GRID);
    const [moved] = await reconcileRoundDueTimes([round(OFF_GRID)], new Map(), store, NOW);
    expect(moved!.nextDueAt).toBe(ON_GRID);
    const change = patch.mock.calls[0]![1] as (current: RoundRecord) => Partial<RoundRecord>;
    expect(change(round(OFF_GRID))).toEqual({ nextDueAt: ON_GRID });
    expect(change(round("2026-12-01T00:00:00.000Z"))).toEqual({});
  });

  it("holds the corrected time when the file refuses it, so the next read does not undo it", async () => {
    const { store, patch } = storeSaving(null);
    const held = new Map<string, string>();
    const [shown] = await reconcileRoundDueTimes([round(OFF_GRID)], held, store, NOW);
    expect(shown!.nextDueAt).toBe(ON_GRID);
    expect(held.get("r1")).toBe(ON_GRID);
    const [again] = await reconcileRoundDueTimes([round(OFF_GRID)], held, store, NOW);
    expect(again!.nextDueAt).toBe(ON_GRID);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("drops a held time once the file's own time has caught up with it", async () => {
    const { store } = storeSaving(null);
    const held = new Map([["r1", ON_GRID]]);
    await reconcileRoundDueTimes([round(ON_GRID)], held, store, NOW);
    expect(held.has("r1")).toBe(false);
  });
});
