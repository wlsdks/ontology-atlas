import { describe, expect, it } from "vitest";

import type { RoundPassEntry } from "@/entities/library-round";

import { groupLedgerByDay, passDurationSeconds } from "./ledger-days";

function pass(overrides: Partial<RoundPassEntry> = {}): RoundPassEntry {
  return {
    v: 1,
    id: "p",
    roundId: "r1",
    roundName: "Pages still match",
    kind: "consistency",
    startedAt: "2026-09-17T01:00:00.000Z",
    endedAt: "2026-09-17T01:00:04.000Z",
    outcome: "held",
    checked: 14,
    stale: [],
    written: [],
    refused: [],
    called: [],
    agentTurns: 0,
    summary: "",
    trigger: "clock",
    ...overrides,
  };
}

describe("ledger days", () => {
  it("groups by local day, newest first, newest entry first within a day", () => {
    const a = pass({ id: "a", endedAt: new Date(2026, 8, 16, 23, 0).toISOString() });
    const b = pass({ id: "b", endedAt: new Date(2026, 8, 17, 9, 0).toISOString() });
    const c = pass({ id: "c", endedAt: new Date(2026, 8, 17, 8, 0).toISOString() });
    const days = groupLedgerByDay([a, b, c]);
    expect(days.map((day) => day.entries.map((entry) => entry.id))).toEqual([["b", "c"], ["a"]]);
  });

  it("measures a pass in whole seconds and never reports a negative or unreadable span", () => {
    expect(passDurationSeconds(pass())).toBe(4);
    expect(passDurationSeconds(pass({ endedAt: "2026-09-17T00:59:00.000Z" }))).toBe(0);
    expect(passDurationSeconds(pass({ endedAt: "not a date" }))).toBe(0);
  });
});
