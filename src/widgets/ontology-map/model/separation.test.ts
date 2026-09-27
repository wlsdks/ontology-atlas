import { describe, expect, it } from "vitest";

import { relaxNodeSeparation, type SeparationNode } from "./separation";

const dist = (a: SeparationNode, b: SeparationNode) => Math.hypot(b.x - a.x, b.y - a.y);

describe("relaxNodeSeparation", () => {
  it("pushes an overlapping pair to at least the minimum distance", () => {
    const nodes: SeparationNode[] = [
      { id: "parent", x: 0, y: 0, r: 28 },
      { id: "child", x: 5, y: 0, r: 7 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(dist(nodes[0], nodes[1])).toBeGreaterThanOrEqual((28 + 7) * 1.35 - 0.01);
  });

  it("never moves a pinned node; only its partner moves", () => {
    const nodes: SeparationNode[] = [
      { id: "pinned", x: 0, y: 0, r: 17 },
      { id: "other", x: 3, y: 0, r: 17 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2, pinnedId: "pinned" });
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
    expect(dist(nodes[0], nodes[1])).toBeGreaterThanOrEqual(34 * 1.35 - 0.01);
  });

  it("leaves an already separated pair alone (deterministic, no side effect)", () => {
    const nodes: SeparationNode[] = [
      { id: "a", x: 0, y: 0, r: 10 },
      { id: "b", x: 200, y: 0, r: 10 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(nodes[1]).toMatchObject({ x: 200, y: 0 });
  });

  it("separates identical coordinates deterministically (division by zero guard)", () => {
    const nodes: SeparationNode[] = [
      { id: "a", x: 50, y: 50, r: 10 },
      { id: "b", x: 50, y: 50, r: 10 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(dist(nodes[0], nodes[1])).toBeGreaterThan(0);
  });
});

/**
 * The function edits coordinates in place, so the pair visitation order is the
 * result. `referenceRelax` is the unoptimised enumeration, and on random graphs both must match
 * bit for bit. Moving `iActive` inside its j loop turns this red.
 */
function referenceRelax(nodes: SeparationNode[], options: {
  ratio: number;
  iterations: number;
  pinnedId?: string | null;
  activeIds?: ReadonlySet<string> | null;
}): void {
  const { ratio, iterations, pinnedId = null, activeIds = null } = options;
  const active = activeIds ? nodes.map((n) => activeIds.has(n.id)) : null;
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      const iActive = active === null || active[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (!iActive && active !== null && !active[j]) continue;
        const a = nodes[i];
        const b = nodes[j];
        const minDist = (a.r + b.r) * ratio;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        if (dist < 1e-6) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = (minDist - dist) / dist;
        const px = dx * push;
        const py = dy * push;
        if (a.id === pinnedId) {
          b.x += px;
          b.y += py;
        } else if (b.id === pinnedId) {
          a.x -= px;
          a.y -= py;
        } else {
          a.x -= px / 2;
          a.y -= py / 2;
          b.x += px / 2;
          b.y += py / 2;
        }
        if (active !== null) {
          active[i] = true;
          active[j] = true;
        }
      }
    }
  }
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeNodes(rng: () => number, count: number): SeparationNode[] {
  const out: SeparationNode[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      id: `n${i}`,
      // Crowded into a small box so overlaps, and chain propagation, actually happen.
      x: Math.round(rng() * 300 * 1000) / 1000,
      y: Math.round(rng() * 300 * 1000) / 1000,
      r: 6 + Math.round(rng() * 20),
    });
  }
  return out;
}

describe("relaxNodeSeparation active-set enumeration", () => {
  it("matches the unoptimised enumeration on 30 random graphs", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = makeRng(seed * 7919);
      const base = makeNodes(rng, 60);
      const activeCount = seed % 61;
      const activeIds = new Set(base.slice(0, activeCount).map((n) => n.id));
      const pinnedId = seed % 3 === 0 ? base[0].id : null;

      const mine = base.map((n) => ({ ...n }));
      const ref = base.map((n) => ({ ...n }));
      const options = { ratio: 1.35, iterations: 2, pinnedId, activeIds };
      relaxNodeSeparation(mine, options);
      referenceRelax(ref, options);

      expect(mine.map((n) => `${n.id}:${n.x}:${n.y}`)).toEqual(
        ref.map((n) => `${n.id}:${n.x}:${n.y}`),
      );
    }
  });

  it("matches the plain path without an active set (every node active)", () => {
    const rng = makeRng(4242);
    const base = makeNodes(rng, 40);
    const mine = base.map((n) => ({ ...n }));
    const ref = base.map((n) => ({ ...n }));
    relaxNodeSeparation(mine, { ratio: 1.35, iterations: 2 });
    referenceRelax(ref, { ratio: 1.35, iterations: 2 });
    expect(mine.map((n) => `${n.x}:${n.y}`)).toEqual(ref.map((n) => `${n.x}:${n.y}`));
  });

  it("keeps chain propagation: one active node pushes a resting chain A to B to C", () => {
    // Only `a` is active, yet `c` must still be pushed.
    const nodes: SeparationNode[] = [
      { id: "a", x: 0, y: 0, r: 20 },
      { id: "b", x: 10, y: 0, r: 20 },
      { id: "c", x: 20, y: 0, r: 20 },
    ];
    relaxNodeSeparation(nodes, {
      ratio: 1.35,
      iterations: 2,
      activeIds: new Set(["a"]),
    });
    expect(nodes[2].x).not.toBe(20);
  });
});
