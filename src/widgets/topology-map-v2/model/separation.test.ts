import { describe, expect, it } from "vitest";

import { relaxNodeSeparation, type SeparationNode } from "./separation";

const dist = (a: SeparationNode, b: SeparationNode) => Math.hypot(b.x - a.x, b.y - a.y);

describe("relaxNodeSeparation", () => {
  it("겹친 쌍을 최소 거리 이상으로 밀어낸다", () => {
    const nodes: SeparationNode[] = [
      { id: "parent", x: 0, y: 0, r: 28 },
      { id: "child", x: 5, y: 0, r: 7 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(dist(nodes[0], nodes[1])).toBeGreaterThanOrEqual((28 + 7) * 1.35 - 0.01);
  });

  it("핀 노드는 절대 움직이지 않는다 — 상대만 밀린다", () => {
    const nodes: SeparationNode[] = [
      { id: "pinned", x: 0, y: 0, r: 17 },
      { id: "other", x: 3, y: 0, r: 17 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2, pinnedId: "pinned" });
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
    expect(dist(nodes[0], nodes[1])).toBeGreaterThanOrEqual(34 * 1.35 - 0.01);
  });

  it("이미 떨어진 쌍은 건드리지 않는다 (결정론·무부작용)", () => {
    const nodes: SeparationNode[] = [
      { id: "a", x: 0, y: 0, r: 10 },
      { id: "b", x: 200, y: 0, r: 10 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(nodes[1]).toMatchObject({ x: 200, y: 0 });
  });

  it("완전 동일 좌표도 결정론적으로 분리한다 (0 나누기 방어)", () => {
    const nodes: SeparationNode[] = [
      { id: "a", x: 50, y: 50, r: 10 },
      { id: "b", x: 50, y: 50, r: 10 },
    ];
    relaxNodeSeparation(nodes, { ratio: 1.35, iterations: 2 });
    expect(dist(nodes[0], nodes[1])).toBeGreaterThan(0);
  });
});

/**
 * Differential check — it got faster, it did not get different.
 *
 * On 2026-08-19 the inner loop of an inactive `i` was narrowed to active `j`
 * only (the 3D dome does not fold by density, so N² visits landed directly in
 * the frame budget — node-drag p95 52.1 ms). The function edits coordinates
 * **in place**, so the *order* in which pairs are visited is the result. This
 * therefore checks **identity**, not speed: `referenceRelax` below is the
 * pre-optimisation enumeration verbatim, and on random graphs the two results
 * must match bit for bit.
 *
 * Evidence this check is not idling: move `iActive` in `referenceRelax` *inside*
 * the j loop — i.e. let chain propagation take effect within the same pass — and
 * it turns red immediately.
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

/** Deterministic RNG — a fixed seed makes any failure reproducible. */
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
      // Crowd them into a small box so overlaps, and thus chain propagation, actually happen.
      x: Math.round(rng() * 300 * 1000) / 1000,
      y: Math.round(rng() * 300 * 1000) / 1000,
      r: 6 + Math.round(rng() * 20),
    });
  }
  return out;
}

describe("relaxNodeSeparation — 활성 집합 열거 최적화", () => {
  it("무작위 그래프 30개에서 최적화 이전 열거와 결과가 동일하다", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = makeRng(seed * 7919);
      const base = makeNodes(rng, 60);
      // Sweep the active-set size from 0 to all, boundaries included.
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

  it("활성 집합이 없으면(=전 노드 활성) 종전 경로와 동일하다", () => {
    const rng = makeRng(4242);
    const base = makeNodes(rng, 40);
    const mine = base.map((n) => ({ ...n }));
    const ref = base.map((n) => ({ ...n }));
    relaxNodeSeparation(mine, { ratio: 1.35, iterations: 2 });
    referenceRelax(ref, { ratio: 1.35, iterations: 2 });
    expect(mine.map((n) => `${n.x}:${n.y}`)).toEqual(ref.map((n) => `${n.x}:${n.y}`));
  });

  it("연쇄 전파가 살아 있다 — 활성 하나가 정지 사슬 A→B→C 를 민다", () => {
    // Overlap them in a row: only `a` is active, yet `c` must still be pushed.
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
