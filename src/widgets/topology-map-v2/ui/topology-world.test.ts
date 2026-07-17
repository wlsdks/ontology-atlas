import { describe, expect, it } from "vitest";

import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { computeEgoBounds, computeSpineBounds, isSpineNode, type WorldNode } from "./topology-world";

/**
 * Spine bounds (fit-fix): the overview camera must fit to the level-0 spine
 * (project + domain + hub) — the only tier drawn at entry — NOT the full
 * 295-node bounds. The de-pileup spreads capabilities/elements wide, so fitting
 * the full bounds shrinks the visible 8-node spine to a dot (the regression).
 */

// Minimal token literal — only the radii matter for bounds math.
const tokens = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
} as unknown as TopologyV2Tokens;

function node(partial: Partial<WorldNode> & Pick<WorldNode, "id" | "kind" | "x" | "y">): WorldNode {
  return {
    label: partial.id,
    isHub: false,
    fresh: false,
    stale: false,
    count: 0,
    ...partial,
  };
}

describe("isSpineNode", () => {
  it("is true for project, domain, and any hub node", () => {
    expect(isSpineNode({ kind: "project", isHub: false })).toBe(true);
    expect(isSpineNode({ kind: "domain", isHub: false })).toBe(true);
    expect(isSpineNode({ kind: "capability", isHub: true })).toBe(true);
    expect(isSpineNode({ kind: "element", isHub: true })).toBe(true);
  });

  it("is false for non-hub capability and element", () => {
    expect(isSpineNode({ kind: "capability", isHub: false })).toBe(false);
    expect(isSpineNode({ kind: "element", isHub: false })).toBe(false);
  });
});

describe("computeSpineBounds", () => {
  it("fits only project+domain+hub, ignoring the wide capability/element sprawl", () => {
    const nodes: WorldNode[] = [
      node({ id: "p", kind: "project", x: 0, y: 0 }),
      node({ id: "d1", kind: "domain", x: -100, y: 0 }),
      node({ id: "d2", kind: "domain", x: 100, y: 0 }),
      // capability/element pushed far out by the de-pileup — must NOT widen the fit.
      node({ id: "c1", kind: "capability", x: -900, y: -900 }),
      node({ id: "e1", kind: "element", x: 900, y: 900 }),
    ];
    const bounds = computeSpineBounds(nodes, tokens);
    // Spine spans x∈[-100-14, 100+14]=[-114,114], y∈[-14,14] (project r20 at 0 → [-20,20]).
    expect(bounds.minX).toBe(-114);
    expect(bounds.maxX).toBe(114);
    expect(bounds.minY).toBe(-20);
    expect(bounds.maxY).toBe(20);
  });

  it("includes a hub capability in the spine (so a hub anchors the entry frame)", () => {
    const nodes: WorldNode[] = [
      node({ id: "p", kind: "project", x: 0, y: 0 }),
      node({ id: "d", kind: "domain", x: 50, y: 0 }),
      node({ id: "hub", kind: "capability", x: 300, y: 0, isHub: true }),
    ];
    const bounds = computeSpineBounds(nodes, tokens);
    // hub capability r8 at x=300 → maxX 308.
    expect(bounds.maxX).toBe(308);
  });

  it("falls back to the full bounds when no spine node exists (degenerate vault)", () => {
    const nodes: WorldNode[] = [
      node({ id: "c1", kind: "capability", x: -40, y: -40 }),
      node({ id: "e1", kind: "element", x: 60, y: 60 }),
    ];
    const bounds = computeSpineBounds(nodes, tokens);
    // No spine → fall back to full: capability r8 at -40 → minX -48; element r5 at 60 → maxX 65.
    expect(bounds.minX).toBe(-48);
    expect(bounds.maxX).toBe(65);
  });

  it("returns a finite default when there are no nodes at all", () => {
    const bounds = computeSpineBounds([], tokens);
    expect(Number.isFinite(bounds.minX)).toBe(true);
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
  });
});

/**
 * Ego bounds — the radius-padded bbox of a focused node + its 1-hop neighbors.
 * Feeds the focus-aware pan clamp (drag-while-focused must not lose the cluster)
 * and the focus camera fit. Pure — derived from `nodeById` + `neighborMap`.
 */
describe("computeEgoBounds", () => {
  function egoWorld(nodes: WorldNode[], neighbors: Record<string, string[]>) {
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const neighborMap = new Map<string, ReadonlySet<string>>(
      Object.entries(neighbors).map(([id, ns]) => [id, new Set(ns)] as const),
    );
    return { nodeById, neighborMap };
  }

  it("returns the padded bbox of the focused node plus its 1-hop neighbors only", () => {
    const nodes: WorldNode[] = [
      node({ id: "f", kind: "domain", x: 0, y: 0 }), // r14
      node({ id: "n1", kind: "capability", x: 100, y: 0 }), // r8 → maxX 108
      node({ id: "n2", kind: "element", x: 0, y: -50 }), // r5 → minY -55
      // Not a neighbor of f — must be excluded even though it's far out.
      node({ id: "far", kind: "element", x: 900, y: 900 }),
    ];
    const world = egoWorld(nodes, { f: ["n1", "n2"], n1: ["f"], n2: ["f"], far: [] });
    const bounds = computeEgoBounds(world, tokens, "f");
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(-14); // focused domain r14 at 0
    expect(bounds!.maxX).toBe(108); // n1 at 100 + r8
    expect(bounds!.minY).toBe(-55); // n2 at -50 - r5
    expect(bounds!.maxY).toBe(14); // focused domain r14
  });

  it("returns just the focused node's own bbox when it has no neighbors", () => {
    const nodes: WorldNode[] = [node({ id: "lonely", kind: "capability", x: 10, y: 10 })];
    const world = egoWorld(nodes, { lonely: [] });
    const bounds = computeEgoBounds(world, tokens, "lonely");
    expect(bounds).toEqual({ minX: 2, minY: 2, maxX: 18, maxY: 18 }); // r8 around (10,10)
  });

  it("returns null when the focused slug doesn't resolve to a node", () => {
    const world = egoWorld([node({ id: "a", kind: "domain", x: 0, y: 0 })], { a: [] });
    expect(computeEgoBounds(world, tokens, "missing")).toBeNull();
  });
});
