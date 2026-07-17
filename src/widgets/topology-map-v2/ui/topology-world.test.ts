import { describe, expect, it } from "vitest";

import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { computeSpineBounds, isSpineNode, type WorldNode } from "./topology-world";

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
