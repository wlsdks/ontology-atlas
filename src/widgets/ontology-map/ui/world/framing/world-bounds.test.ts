import { describe, expect, it } from "vitest";

import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import type { WorldNode } from "../topology-world";
import { computeFoldedIds } from "./density-fold";
import { computeClusterDiscBounds, computeDrawnSpineBounds, computeEgoBounds, computePathPickBounds, computeRevealedBounds, computeSpineBounds } from "./world-bounds";

// Minimal token literal — only the radii matter for bounds math.
const tokens = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
} as unknown as OntologyMapTokens;

function node(partial: Partial<WorldNode> & Pick<WorldNode, "id" | "kind" | "x" | "y">): WorldNode {
  return {
    label: partial.id,
    parentId: null,
    isHub: false,
    fresh: false,
    stale: false,
    count: 0,
    magnitudeScale: 1,
    homeX: partial.x,
    homeY: partial.y,
    ...partial,
  };
}

describe("computeSpineBounds", () => {
  it("fits only project+domain+hub, ignoring the wide capability/element sprawl", () => {
    const nodes: WorldNode[] = [
      node({ id: "p", kind: "project", x: 0, y: 0 }),
      node({ id: "d1", kind: "domain", x: -100, y: 0 }),
      node({ id: "d2", kind: "domain", x: 100, y: 0 }),
      // capability/element pushed far out by the de-pileup — must NOT widen the fit.
      node({ id: "c1", kind: "capability", x: -900, y: -900 }),
      node({ id: "e1", kind: "element", x: 900, y: 900 })
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
      node({ id: "hub", kind: "capability", x: 300, y: 0, isHub: true })
        ];
    const bounds = computeSpineBounds(nodes, tokens);
    // hub capability r8 at x=300 → maxX 308.
    expect(bounds.maxX).toBe(308);
  });

  it("falls back to the full bounds when no spine node exists (degenerate vault)", () => {
    const nodes: WorldNode[] = [
      node({ id: "c1", kind: "capability", x: -40, y: -40 }),
      node({ id: "e1", kind: "element", x: 60, y: 60 })
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
      Object.entries(neighbors).map(([id, ns]) => [id, new Set(ns)] as const));
    return { nodeById, neighborMap };
  }

  it("returns the padded bbox of the focused node plus its 1-hop neighbors only", () => {
    const nodes: WorldNode[] = [
      node({ id: "f", kind: "domain", x: 0, y: 0 }), // r14
      node({ id: "n1", kind: "capability", x: 100, y: 0 }), // r8 → maxX 108
      node({ id: "n2", kind: "element", x: 0, y: -50 }), // r5 → minY -55
      // Not a neighbor of f — must be excluded even though it's far out.
      node({ id: "far", kind: "element", x: 900, y: 900 })
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

  // S8 defect 4 — a fling neighbour outside the warding circle (thousands of units
  // out) inflated the ego bbox during realm expansion and flung the camera off
  // screen. restrictIds keeps only the realm's members.
  it("restrictIds excludes neighbours outside the area (fling) from the bbox", () => {
    const nodes: WorldNode[] = [
      node({ id: "f", kind: "domain", x: 0, y: 0 }), // r14
      node({ id: "inside", kind: "capability", x: 100, y: 0 }), // a realm member, r8 → maxX 108
      node({ id: "outside", kind: "element", x: 5000, y: 5000 })
        ];
    const world = egoWorld(nodes, { f: ["inside", "outside"], inside: ["f"], outside: ["f"] });
    const members = new Set(["f", "inside"]);
    const bounds = computeEgoBounds(world, tokens, "f", members)!;
    // outside(5000,5000) is excluded, so the bbox stays inside the warding circle (f + inside).
    expect(bounds.maxX).toBe(108);
    expect(bounds.maxY).toBe(14);
    // Without restrictIds it wraps outside too and the bbox explodes (the control).
    const unbounded = computeEgoBounds(world, tokens, "f")!;
    expect(unbounded.maxX).toBeGreaterThan(4000);
  });
});

/** S2 part 5B — the bbox of an expanded cluster disc (the parent plus its direct contains children). */
describe("computeClusterDiscBounds", () => {
  function discWorld(nodes: WorldNode[], childrenByParent: Record<string, string[]>) {
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const cbp = new Map<string, readonly string[]>(Object.entries(childrenByParent));
    return { nodeById, childrenByParent: cbp };
  }

  it("the radius-padded bbox of a parent plus its direct children fan", () => {
    const nodes: WorldNode[] = [
      node({ id: "d", kind: "domain", x: 0, y: 0 }), // r14
      node({ id: "c1", kind: "capability", x: 100, y: 0 }), // r8 → maxX 108
      node({ id: "c2", kind: "capability", x: 0, y: -60 }), // r8 → minY -68
      // Another parent's child — excluded.
      node({ id: "other", kind: "element", x: 900, y: 900 })
        ];
    const world = discWorld(nodes, { d: ["c1", "c2"], p2: ["other"] });
    const bounds = computeClusterDiscBounds(world, tokens, "d");
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(-14);
    expect(bounds!.maxX).toBe(108);
    expect(bounds!.minY).toBe(-68);
    expect(bounds!.maxY).toBe(14);
  });

  it("null when the parent is unresolved", () => {
    const world = discWorld([node({ id: "d", kind: "domain", x: 0, y: 0 })], { d: [] });
    expect(computeClusterDiscBounds(world, tokens, "missing")).toBeNull();
  });

  it("with restrictIds only that set's children enter the bbox (fit for a high fan-out layout)", () => {
    const nodes: WorldNode[] = [
      node({ id: "d", kind: "domain", x: 0, y: 0 }), // r14
      node({ id: "c1", kind: "capability", x: 100, y: 0 }), // r8 → maxX 108
      node({ id: "far", kind: "capability", x: 900, y: 0 })
        ];
    const world = discWorld(nodes, { d: ["c1", "far"] });
    // The batch holds only c1 (plus the parent d) — far is a leftover and drops out of the framing.
    const bounds = computeClusterDiscBounds(world, tokens, "d", new Set(["d", "c1"]));
    expect(bounds!.maxX).toBe(108); // not far(908) — a few, large.
    // Without restrict, far is included too (confirming zero regression).
    expect(computeClusterDiscBounds(world, tokens, "d")!.maxX).toBe(908);
  });
});

describe("computeRevealedBounds", () => {
  const p = node({ id: "p", kind: "project", x: 0, y: 0 });
  const d = node({ id: "d", kind: "domain", x: 100, y: 0, parentId: "p" });
  const e1 = node({ id: "e1", kind: "element", x: 100, y: 300, parentId: "d" });
  const e2 = node({ id: "e2", kind: "element", x: 100, y: 900, parentId: "d" });
  const world = {
    spineBounds: computeSpineBounds([p, d], tokens),
    childrenByParent: new Map([["p", ["d"]], ["d", ["e1", "e2"]]]),
    nodeById: new Map([["p", p], ["d", d], ["e1", e1], ["e2", e2]]),
  };

  it("is exactly the spine when nothing is expanded", () => {
    expect(computeRevealedBounds(world, tokens, new Set(), null)).toEqual(world.spineBounds);
  });

  it("grows the spine by an expanded parent's drawn children only", () => {
    // e2 is clustered past the batch cap, so it is not drawn and must not widen the frame.
    const bounds = computeRevealedBounds(world, tokens, new Set(["d"]), new Set(["e2"]));
    expect(bounds.maxY).toBe(305);
    expect(bounds.minY).toBe(world.spineBounds.minY);
    expect(computeRevealedBounds(world, tokens, new Set(["d"]), null).maxY).toBe(905);
  });

  it("does not mutate the world's spine bounds", () => {
    const before = { ...world.spineBounds };
    computeRevealedBounds(world, tokens, new Set(["d"]), null);
    expect(world.spineBounds).toEqual(before);
  });
});

/**
 * The density gate can fold the hub behind a crowded parent's chip (over twelve children), so the
 * overview must frame only the spine that is drawn.
 */
describe("the drawn spine — a hub folded behind a crowded parent", () => {
  const p = node({ id: "p", kind: "project", x: 0, y: 0 });
  const left = node({ id: "dl", kind: "domain", x: -250, y: 0, parentId: "p" });
  const right = node({ id: "dr", kind: "domain", x: 250, y: 0, parentId: "p" });
  // Thirteen capabilities: one over the fold threshold, so the left domain collapses.
  const folded = Array.from({ length: 13 }, (_, i) =>
    node({ id: `c${i}`, kind: "capability", x: -395, y: -60 + i * 10, parentId: "dl", isHub: i === 0 }));
    const crowded = {
        spineBounds: computeSpineBounds([p, left, right, ...folded], tokens),
        childrenByParent: new Map([["p", ["dl", "dr"]], ["dl", folded.map((c) => c.id)]]),
        nodeById: new Map([p, left, right, ...folded].map((n) => [n.id, n] as const)),
    };
    // The same hub under a parent with three children: nothing folds, the hub is drawn.
    const few = folded.slice(0, 3);
    const open = {
        spineBounds: computeSpineBounds([p, left, right, ...few], tokens),
        childrenByParent: new Map([["p", ["dl", "dr"]], ["dl", few.map((c) => c.id)]]),
        nodeById: new Map([p, left, right, ...few].map((n) => [n.id, n] as const)),
    };
    it("still counts the hub in the whole spine (pan clamp, fallbacks)", () => {
        expect(crowded.spineBounds.minX).toBe(-403);
    });
    it("leaves the folded hub out of the overview frame", () => {
        const bounds = computeRevealedBounds(crowded, tokens, new Set(), null);
        // Only the drawn spine: domains r14 at ±250, so the frame is centred on the cross.
        expect(bounds).toEqual({ minX: -264, minY: -20, maxX: 264, maxY: 20 });
        expect(computeDrawnSpineBounds(crowded, tokens, new Set())).toEqual(bounds);
    });
    it("frames the hub again once expanding its parent draws it", () => {
        expect(computeRevealedBounds(crowded, tokens, new Set(["dl"]), null).minX).toBe(-403);
        expect(computeDrawnSpineBounds(crowded, tokens, new Set(["dl"])).minX).toBe(-403);
    });
    it("frames a hub nothing folds", () => {
        expect(computeRevealedBounds(open, tokens, new Set(), null).minX).toBe(-403);
    });
    it("names the folded nodes from the gate itself, not from a frame's published set", () => {
        // The initial snap runs before any frame has published `clusteredIds`, so the
        // fit must not depend on it to know the hub is folded.
        expect([...computeFoldedIds(crowded, new Set())].sort()).toEqual(folded.map((c) => c.id).sort());
        expect(computeFoldedIds(crowded, new Set(["dl"])).size).toBe(0);
        expect(computeFoldedIds(open, new Set()).size).toBe(0);
    });
});
/**
 * The path pick frame is the overview bounds grown by the source and the neighbours its focus draws;
 * the source's own folded children stay behind its chip.
 */
describe("computePathPickBounds", () => {
    const p = node({ id: "p", kind: "project", x: 0, y: 0 });
    const top = node({ id: "dt", kind: "domain", x: 0, y: -300, parentId: "p" });
    const bottom = node({ id: "db", kind: "domain", x: 0, y: 300, parentId: "p" });
    // Thirteen capabilities under the top domain: over the fold threshold, so they fold.
    const caps = Array.from({ length: 13 }, (_, i) => node({ id: `c${i}`, kind: "capability", x: -600 + i * 10, y: -700, parentId: "dt" }));
    // A dependency of the top domain's, under the bottom domain and far to the right.
    const dep = node({ id: "x", kind: "capability", x: 800, y: 320, parentId: "db" });
    const all = [p, top, bottom, ...caps, dep];
    const world = {
        spineBounds: computeSpineBounds(all, tokens),
        childrenByParent: new Map([["p", ["dt", "db"]], ["dt", caps.map((c) => c.id)], ["db", ["x"]]]),
        nodeById: new Map(all.map((n) => [n.id, n] as const)),
        neighborMap: new Map<string, ReadonlySet<string>>([["dt", new Set(["p", ...caps.map((c) => c.id), "x"])]]),
    };
    const overview = computeRevealedBounds(world, tokens, new Set(), null);
    it("keeps every drawn domain in the frame — the sibling a person picks next included", () => {
        const bounds = computePathPickBounds(world, tokens, "dt", overview, new Set());
        expect(bounds.minY).toBeLessThanOrEqual(-314);
        expect(bounds.maxY).toBeGreaterThanOrEqual(314);
    });
    it("grows the frame by a neighbour the focus holds open, not by the source's folded children", () => {
        const bounds = computePathPickBounds(world, tokens, "dt", overview, new Set());
        expect(bounds.maxX).toBe(808);
        // The thirteen folded capabilities at y −700 stay behind the chip.
        expect(bounds.minY).toBe(overview.minY);
    });
    it("frames the source's children once they are drawn", () => {
        expect(computePathPickBounds(world, tokens, "dt", overview, new Set(["dt"])).minY).toBe(-708);
    });
    it("is the overview when the source is not in the world", () => {
        expect(computePathPickBounds(world, tokens, "gone", overview, new Set())).toEqual(overview);
    });
});
