import { describe, expect, it } from "vitest";

import {
  upsertPastWalk,
  deserializePastTrails,
  describePastTrailDay,
  refinePastWalkEntries,
  PAST_WALKS_MAX,
  serializePastTrails,
  type PastWalk,
  type PastWalkEntry,
} from "./past-trail-record";

function entries(...ids: string[]): PastWalkEntry[] {
  return ids.map((id) => ({ id, title: id.toUpperCase(), kind: id.split(":")[0] ?? "element" }));
}

describe("past-trail-record format rules independent of the medium", () => {
  it("a walk under the two-step threshold is not a trail", () => {
    expect(upsertPastWalk([], "w1", entries("domain:a"))).toEqual([]);
  });

  it("a walk of two or more steps stacks newest first", () => {
    const one = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const two = upsertPastWalk(one, "w2", entries("element:c", "element:d"), { now: 2_000 });
    expect(two.map((w) => w.id)).toEqual(["w2", "w1"]);
  });

  it("the same id updates in place, one row per session", () => {
    const one = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const grown = upsertPastWalk(one, "w1", entries("domain:a", "capability:b", "element:c"), {
      now: 2_000,
    });
    expect(grown).toHaveLength(1);
    expect(grown[0].entries).toHaveLength(3);
    expect(grown[0].endedAt).toBe(2_000);
  });

  it("a different id with the same path as the newest trail adds no row and keeps the date", () => {
    const one = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const again = upsertPastWalk(one, "w2", entries("domain:a", "capability:b"), { now: 9_000 });
    expect(again).toHaveLength(1);
    expect(again[0].endedAt).toBe(1_000);
  });

  it("a path equal to a non-first row adds no row when a past trail is reopened", () => {
    // Reopen w1 (walked yesterday) with a different walk w2 stacked on top today.
    const yesterday = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const today = upsertPastWalk(yesterday, "w2", entries("element:c", "element:d"), { now: 2_000 });
    const replayed = upsertPastWalk(today, "w3", entries("domain:a", "capability:b"), {
      now: 9_000,
    });
    expect(replayed.map((w) => w.id)).toEqual(["w2", "w1"]);
    expect(replayed.find((w) => w.id === "w1")?.endedAt).toBe(1_000);
  });

  it("one more step on a reopened trail makes a new row", () => {
    const yesterday = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const walkedOn = upsertPastWalk(
      yesterday,
      "w3",
      entries("domain:a", "capability:b", "element:c"),
      { now: 9_000 },
    );
    expect(walkedOn.map((w) => w.id)).toEqual(["w3", "w1"]);
    expect(walkedOn[1].endedAt).toBe(1_000);
  });

  it("a single differing step makes a new row", () => {
    const one = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const two = upsertPastWalk(one, "w2", entries("domain:a", "capability:b", "element:c"), {
      now: 2_000,
    });
    expect(two).toHaveLength(2);
  });

  it("the cap of 10 rotates, so an eleventh trail drops the oldest", () => {
    let walks: PastWalk[] = [];
    for (let i = 0; i < PAST_WALKS_MAX + 1; i += 1) {
      walks = upsertPastWalk(walks, `w${i}`, entries(`domain:a${i}`, `capability:b${i}`), {
        now: 1_000 + i,
      });
    }
    expect(walks).toHaveLength(PAST_WALKS_MAX);
    expect(walks[0].id).toBe("w10");
    expect(walks.some((w) => w.id === "w0")).toBe(false);
  });

  it("the step cap of 30 trims the oldest steps first", () => {
    const long = entries(...Array.from({ length: 42 }, (_, i) => `element:n${i}`));
    const [walk] = upsertPastWalk([], "w1", long, { now: 1_000 });
    expect(walk.entries).toHaveLength(30);
    expect(walk.entries[0].id).toBe("element:n12");
    expect(walk.entries[29].id).toBe("element:n41");
  });

  it("does not mutate the input list", () => {
    const before = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1 });
    upsertPastWalk(before, "w2", entries("element:c", "element:d"), { now: 2 });
    expect(before).toHaveLength(1);
  });

  it("serialized JSON has no per-step time, only one endedAt per trail", () => {
    const walks = upsertPastWalk([], "w1", entries("domain:a", "capability:b", "element:c"), {
      now: 1_700_000,
    });
    const raw = serializePastTrails(walks);
    const parsed = JSON.parse(raw) as { walks: Array<Record<string, unknown>> };

    expect(parsed.walks).toHaveLength(1);
    expect(parsed.walks[0].endedAt).toBe(1_700_000);
    for (const entry of parsed.walks[0].entries as Array<Record<string, unknown>>) {
      expect(Object.keys(entry).sort()).toEqual(["id", "kind", "title"]);
    }

    // The only numbers in the stored tree are `v: 1` and `endedAt`, so three steps prove no
    // per-step timestamp.
    const numbers: number[] = [];
    const walkTree = (node: unknown): void => {
      if (typeof node === "number") numbers.push(node);
      else if (Array.isArray(node)) node.forEach(walkTree);
      else if (node && typeof node === "object") Object.values(node).forEach(walkTree);
    };
    walkTree(JSON.parse(raw));
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 1_700_000]);
  });

  it("a serialize and parse round trip yields the same records", () => {
    const walks = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 5 });
    expect(deserializePastTrails(serializePastTrails(walks))).toEqual(walks);
  });

  it("broken JSON, empty values and an old schema read as an empty list", () => {
    expect(deserializePastTrails(null)).toEqual([]);
    expect(deserializePastTrails("{not json")).toEqual([]);
    expect(deserializePastTrails(JSON.stringify({ v: 99, walks: [] }))).toEqual([]);
    expect(deserializePastTrails(JSON.stringify([1, 2]))).toEqual([]);
  });

  it("a hand-inserted per-step time field drops on read", () => {
    const raw = JSON.stringify({
      v: 1,
      walks: [
        {
          id: "w1",
          endedAt: 1_000,
          entries: [
            { id: "domain:a", title: "A", kind: "domain", visitedAt: 5, dwellMs: 900 },
            { id: "capability:b", title: "B", kind: "capability", visitCount: 3 },
          ],
        },
      ],
    });
    expect(deserializePastTrails(raw)[0].entries).toEqual([
      { id: "domain:a", title: "A", kind: "domain" },
      { id: "capability:b", title: "B", kind: "capability" },
    ]);
  });
});

describe("refinePastWalkEntries aligns a trail with the live map before reopening", () => {
  const live = new Map([
    ["domain:a", { title: "지금 이름 A", kind: "domain" }],
    ["capability:b", { title: "B", kind: "capability" }],
  ]);
  const lookup = (id: string) => live.get(id) ?? null;

  it("removed nodes drop out and remaining nodes take their current names", () => {
    const stored = [
      { id: "domain:a", title: "그때 이름 A", kind: "domain" },
      { id: "element:gone", title: "지워진 곳", kind: "element" },
      { id: "capability:b", title: "B", kind: "capability" },
    ];
    expect(refinePastWalkEntries(stored, lookup)).toEqual([
      { id: "domain:a", title: "지금 이름 A", kind: "domain" },
      { id: "capability:b", title: "B", kind: "capability" },
    ]);
  });

  it("returns an empty list when every node is gone, which the caller reads as not on the map", () => {
    expect(refinePastWalkEntries(entries("element:gone", "element:gone2"), lookup)).toEqual([]);
  });

  it("keeps the visit order so the handoff packet replays in the same order", () => {
    const stored = entries("capability:b", "domain:a");
    expect(refinePastWalkEntries(stored, lookup).map((e) => e.id)).toEqual([
      "capability:b",
      "domain:a",
    ]);
  });
});

describe("describePastTrailDay groups by day", () => {
  const now = new Date(2026, 6, 26, 14, 0, 0).getTime();

  it("the same day is today", () => {
    expect(describePastTrailDay(new Date(2026, 6, 26, 1, 0, 0).getTime(), now)).toEqual({
      kind: "today",
    });
  });

  it("one day earlier is yesterday", () => {
    expect(describePastTrailDay(new Date(2026, 6, 25, 23, 0, 0).getTime(), now)).toEqual({
      kind: "yesterday",
    });
  });

  it("an earlier day in the same year is sameYear", () => {
    const at = new Date(2026, 6, 22, 9, 0, 0).getTime();
    expect(describePastTrailDay(at, now)).toEqual({ kind: "sameYear", at });
  });

  it("a previous year is olderYear", () => {
    const at = new Date(2025, 11, 3, 9, 0, 0).getTime();
    expect(describePastTrailDay(at, now)).toEqual({ kind: "olderYear", at });
  });
});
