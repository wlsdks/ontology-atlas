import { describe, expect, it } from "vitest";

import type { RoundPassEntry, RoundRecord } from "@/entities/library-round";

import { groupLedgerByDay, lastOutcome, nextRound, sinceSpan, summarizeSince } from "./round-presentation";

function pass(overrides: Partial<RoundPassEntry> = {}): RoundPassEntry {
  return {
    v: 1,
    id: Math.random().toString(36).slice(2),
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

function round(overrides: Partial<RoundRecord> = {}): RoundRecord {
  return {
    id: "r1",
    name: "Pages still match",
    kind: "consistency",
    cadence: { every: "hour" },
    enabled: true,
    createdAt: "2026-09-17T00:00:00.000Z",
    nextDueAt: "2026-09-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("since span", () => {
  it("is the last absence when it was long enough and ended today", () => {
    const now = new Date(2026, 8, 17, 9, 5);
    const from = new Date(2026, 8, 16, 18, 30).toISOString();
    const to = new Date(2026, 8, 17, 9, 2).toISOString();
    const span = sinceSpan({ v: 1, rounds: [], lastAway: { from, to } }, now);
    expect(span.kind).toBe("away");
    expect(span.from.toISOString()).toBe(from);
  });

  it("falls back to today since midnight for a short absence or a stale one", () => {
    const now = new Date(2026, 8, 17, 9, 5);
    const brief = sinceSpan({ v: 1, rounds: [], lastAway: { from: new Date(2026, 8, 17, 9, 0).toISOString(), to: new Date(2026, 8, 17, 9, 4).toISOString() } }, now);
    expect(brief.kind).toBe("today");
    expect(brief.from).toEqual(new Date(2026, 8, 17, 0, 0));
    const yesterday = sinceSpan({ v: 1, rounds: [], lastAway: { from: new Date(2026, 8, 15, 18, 0).toISOString(), to: new Date(2026, 8, 16, 9, 0).toISOString() } }, now);
    expect(yesterday.kind).toBe("today");
    expect(sinceSpan(null, now).kind).toBe("today");
  });
});

describe("since summary", () => {
  it("counts passes in the span, names stale and redrafted pages once, and leaves gaps to the ledger", () => {
    const span = { kind: "away" as const, from: new Date("2026-09-16T18:30:00Z"), to: new Date("2026-09-17T09:02:00Z") };
    const entries = [
      pass({ startedAt: "2026-09-16T17:00:00Z", endedAt: "2026-09-16T17:00:03Z" }), // before
      pass({ startedAt: "2026-09-16T19:00:00Z", endedAt: "2026-09-16T19:00:03Z" }),
      pass({ startedAt: "2026-09-16T20:00:00Z", endedAt: "2026-09-16T20:00:09Z", outcome: "stale", stale: ["wiki/plan", "wiki/budget"] }),
      pass({ startedAt: "2026-09-16T21:00:00Z", endedAt: "2026-09-16T21:01:00Z", outcome: "redrafted", stale: ["wiki/plan"], written: ["wiki/plan.md", "sources/x.md"], agentTurns: 1 }),
      pass({ startedAt: "2026-09-17T01:12:00Z", endedAt: "2026-09-17T08:55:00Z", outcome: "asleep", roundId: undefined }),
      pass({ id: "refusing", startedAt: "2026-09-17T09:00:00Z", endedAt: "2026-09-17T09:00:03Z", outcome: "refused", refused: ["Bash", "mcp__notion__search"] }),
      pass({ startedAt: "2026-09-17T09:30:00Z", endedAt: "2026-09-17T09:30:03Z" }), // after
    ];
    const summary = summarizeSince(entries, span);
    expect(summary.passes).toBe(4);
    expect(summary.held).toBe(1);
    expect(summary.stale).toEqual(["wiki/plan", "wiki/budget"]);
    expect(summary.redrafted).toEqual(["wiki/plan.md"]);
    expect(summary.refused).toBe(2);
    // The asleep gap is in the span but is not a pass: it is not counted.
    expect(summary).not.toHaveProperty("asleep");
    // The card's refused press needs the pass that names the tool.
    expect(summary.refusedIn).toEqual(["refusing"]);
  });
});

describe("ledger grouping and header facts", () => {
  it("groups by local day, newest first, newest entry first within a day", () => {
    const a = pass({ id: "a", endedAt: new Date(2026, 8, 16, 23, 0).toISOString() });
    const b = pass({ id: "b", endedAt: new Date(2026, 8, 17, 9, 0).toISOString() });
    const c = pass({ id: "c", endedAt: new Date(2026, 8, 17, 8, 0).toISOString() });
    const days = groupLedgerByDay([a, b, c]);
    expect(days.map((day) => day.entries.map((entry) => entry.id))).toEqual([["b", "c"], ["a"]]);
  });

  it("names a round's latest pass and the round due soonest", () => {
    const early = pass({ id: "e", roundId: "r1", endedAt: "2026-09-17T01:00:00Z" });
    const late = pass({ id: "l", roundId: "r1", endedAt: "2026-09-17T02:00:00Z" });
    const other = pass({ id: "o", roundId: "r2", endedAt: "2026-09-17T03:00:00Z" });
    expect(lastOutcome(round(), [early, late, other])?.id).toBe("l");
    const paused = round({ id: "p", enabled: false, nextDueAt: "2026-09-17T05:00:00Z" });
    const soon = round({ id: "s", nextDueAt: "2026-09-17T06:00:00Z" });
    expect(nextRound([round(), paused, soon])?.id).toBe("s");
  });

});
