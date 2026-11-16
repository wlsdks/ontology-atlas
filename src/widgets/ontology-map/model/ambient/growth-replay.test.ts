import { describe, expect, it } from "vitest";

import {
  createGrowthReplay,
  GROWTH_REPLAY_CLEAR_MS,
  GROWTH_REPLAY_MAX_MS,
  GROWTH_REPLAY_MIN_MS,
  GROWTH_REPLAY_RISE_MS,
  growthReplayDurationMs,
  growthReplayOrder,
  settleGrowthReplay,
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

  it("the map leaves first, then nodes appear one after another and the last has fully risen at the end", () => {
    const replay = createGrowthReplay(vault, 1000);
    const out = new Map<string, number>();
    expect(stepGrowthReplay(replay, 1000, out)).toBe(false);
    for (const v of out.values()) expect(v).toBe(1);
    stepGrowthReplay(replay, 1000 + GROWTH_REPLAY_CLEAR_MS, out);
    for (const v of out.values()) expect(v).toBe(0);
    stepGrowthReplay(replay, 1000 + GROWTH_REPLAY_CLEAR_MS + GROWTH_REPLAY_RISE_MS, out);
    expect(out.get("p")).toBe(1);
    expect(out.get("e-lost")).toBe(0);
    const mid = replay.startMs + (replay.endMs - replay.startMs) / 2;
    stepGrowthReplay(replay, mid, out);
    const values = growthReplayOrder(vault).map((id) => out.get(id)!);
    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    expect(stepGrowthReplay(replay, replay.endMs, out)).toBe(true);
    for (const v of out.values()) expect(v).toBe(1);
  });

  it("no node's presence steps further in one frame than its steepest ramp allows", () => {
    const frameMs = 8;
    const steepestPerMs = 3 / Math.min(GROWTH_REPLAY_CLEAR_MS, GROWTH_REPLAY_RISE_MS);
    const out = new Map<string, number>();
    const before = new Map<string, number>(vault.map((n) => [n.id, 1]));
    let replay = createGrowthReplay(vault, 0);
    const stopAt = replay.endMs / 2;
    const restartAt = stopAt + GROWTH_REPLAY_RISE_MS / 2;
    let stopped = false;
    let restarted = false;
    for (let now = 0; ; now += frameMs) {
      if (!stopped && now >= stopAt) {
        replay = settleGrowthReplay(replay, now, out);
        stopped = true;
      }
      if (!restarted && now >= restartAt) {
        replay = createGrowthReplay(vault, now, out);
        restarted = true;
      }
      const over = stepGrowthReplay(replay, now, out);
      for (const [id, v] of out) {
        expect(Math.abs(v - before.get(id)!), `${id} at ${now} ms`).toBeLessThanOrEqual(steepestPerMs * frameMs + 1e-9);
        before.set(id, v);
      }
      if (over) break;
    }
    for (const v of out.values()) expect(v).toBe(1);
  });

  it("a stopped replay brings every node back from where it was, together", () => {
    const replay = createGrowthReplay(vault, 0);
    const out = new Map<string, number>();
    const stopAt = GROWTH_REPLAY_CLEAR_MS + GROWTH_REPLAY_RISE_MS / 2;
    stepGrowthReplay(replay, stopAt, out);
    const held = new Map(out);
    expect(held.get("p")).toBeGreaterThan(0);
    expect(held.get("e-lost")).toBe(0);
    const settle = settleGrowthReplay(replay, stopAt, out);
    stepGrowthReplay(settle, stopAt, out);
    expect([...out]).toEqual([...held]);
    expect(stepGrowthReplay(settle, stopAt + GROWTH_REPLAY_RISE_MS, out)).toBe(true);
    for (const v of out.values()) expect(v).toBe(1);
  });

  it("a single node does not divide by zero", () => {
    const replay = createGrowthReplay([vault[0]], 0);
    expect(replay.bornAt.get("p")).toBe(GROWTH_REPLAY_CLEAR_MS);
    expect(Number.isFinite(replay.endMs)).toBe(true);
  });
});
