import { describe, expect, it } from "vitest";

import {
  createGrowthReplay,
  GROWTH_REPLAY_MAX_MS,
  GROWTH_REPLAY_MIN_MS,
  GROWTH_REPLAY_RISE_MS,
  growthReplayDurationMs,
  growthReplayOrder,
  stepGrowthReplay,
  type GrowthReplayNode,
} from "./growth-replay";

const vault: GrowthReplayNode[] = [
  { id: "p", kind: "project", parentId: null },
  { id: "d-b", kind: "domain", parentId: "p" },
  { id: "d-a", kind: "domain", parentId: "p" },
  { id: "c-a2", kind: "capability", parentId: "d-a" },
  { id: "c-a1", kind: "capability", parentId: "d-a" },
  { id: "e-a1-1", kind: "element", parentId: "c-a1" },
  { id: "e-a-direct", kind: "element", parentId: "d-a" },
  { id: "c-b1", kind: "capability", parentId: "d-b" },
  { id: "e-lost", kind: "element", parentId: "nowhere" },
];

describe("growth replay — the ontology appears in containment order", () => {
  it("project, then each domain with its capabilities and their elements, then strays", () => {
    expect(growthReplayOrder(vault)).toEqual(["p", "d-a", "c-a1", "e-a1-1", "c-a2", "e-a-direct", "d-b", "c-b1", "e-lost"]);
  });

  it("is deterministic and covers every node exactly once", () => {
    const a = growthReplayOrder(vault);
    const b = growthReplayOrder([...vault].reverse());
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(vault.length);
  });

  it("lasts six seconds for a tiny vault and never more than sixteen", () => {
    expect(growthReplayDurationMs(0)).toBe(GROWTH_REPLAY_MIN_MS);
    expect(growthReplayDurationMs(5)).toBeGreaterThanOrEqual(GROWTH_REPLAY_MIN_MS);
    expect(growthReplayDurationMs(125)).toBeGreaterThan(GROWTH_REPLAY_MIN_MS);
    expect(growthReplayDurationMs(125)).toBeLessThan(GROWTH_REPLAY_MAX_MS);
    expect(growthReplayDurationMs(5000)).toBe(GROWTH_REPLAY_MAX_MS);
  });

  it("nodes appear one after another and the last one has fully risen at the end", () => {
    const replay = createGrowthReplay(vault, 1000);
    const out = new Map<string, number>();
    expect(stepGrowthReplay(replay, 1000, out)).toBe(false);
    expect(out.get("p")).toBe(0);
    expect(out.get("e-lost")).toBe(0);
    stepGrowthReplay(replay, 1000 + GROWTH_REPLAY_RISE_MS, out);
    expect(out.get("p")).toBe(1);
    expect(out.get("e-lost")).toBe(0);
    const mid = replay.startMs + (replay.endMs - replay.startMs) / 2;
    stepGrowthReplay(replay, mid, out);
    const values = growthReplayOrder(vault).map((id) => out.get(id)!);
    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    expect(stepGrowthReplay(replay, replay.endMs, out)).toBe(true);
    for (const v of out.values()) expect(v).toBe(1);
  });

  it("a single node does not divide by zero", () => {
    const replay = createGrowthReplay([vault[0]], 0);
    expect(replay.bornAt.get("p")).toBe(0);
    expect(Number.isFinite(replay.endMs)).toBe(true);
  });
});
