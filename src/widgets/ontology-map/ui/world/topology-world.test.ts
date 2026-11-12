import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";

import { computeConcentricLayout } from "../../model/layout/layout";
import { resolveDialTokens } from "../../dial/tokens";
import type { DialLabels, DialMemory, DialWorldInput } from "../../dial/types";
import { resolveFlatGraphTokens } from "../../flat-graph/tokens";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import {
  buildTopologyWorld,
  computeMagnitudeScale,
  computeEgoBounds,
  computeClusterDiscBounds,
  computeDrawnSpineBounds,
  computeFoldedIds,
  computePathPickBounds,
  computeRevealedBounds,
  computeSpineBounds,
  dialOverviewFit,
  dialFocusFrame,
  isSpineNode,
  recomputeWorldGeometry,
  type TopologyWorld,
  type WorldNode,
  containmentLevelFor } from "./topology-world";
import type { OntologyMapEdge, OntologyMapNode } from "../OntologyMap";
import { computeTopologyClusterState } from "./topology-cluster-state";

vi.mock("../../model/layout/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../model/layout/layout")>();
  return { ...actual, computeConcentricLayout: vi.fn(actual.computeConcentricLayout) };
});

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

/**
 * C1 B3 — auto-arrange restores canonical layout. `homeX`/`homeY` are the
 * world builder's own deterministic layout coordinate, cached once at build
 * time and never mutated by drag/force-sim position writes — the "canonical"
 * position auto-arrange springs nodes back to.
 */
describe("buildTopologyWorld — homeX/homeY", () => {
  const fullTokens = {
    radiusProject: 20,
    radiusDomain: 14,
    radiusCapability: 8,
    radiusElement: 5,
    layoutRingDomain: 250,
    layoutRingCapability: 145,
    layoutRingElement: 90,
    edgeBowContains: 70,
    edgeBowDepends: 92,
    edgeBlendContains: 0.46,
    edgeBlendDepends: 0.62,
    starCount: 2,
  } as unknown as OntologyMapTokens;

  function inputNode(partial: Partial<OntologyMapNode> & Pick<OntologyMapNode, "id" | "kind">): OntologyMapNode {
    return {
      label: partial.id,
      size: 1,
      x: 0,
      y: 0,
      isHub: false,
      ownerKey: null,
      recentlyUpdated: false,
      fullDegree: 0,
      descendantCount: 0,
      ...partial,
    };
  }

  it("seeds homeX/homeY equal to the initial deterministic layout position", () => {
    const nodes: OntologyMapNode[] = [
      inputNode({ id: "p", kind: "project" }),
      inputNode({ id: "d", kind: "domain" })
        ];
    const edges: OntologyMapEdge[] = [{ source: "p", target: "d", relationType: "contains", relationQuality: null, evidenceCount: 0, kind: "contains", declaredBySlug: null }];
    const world = buildTopologyWorld(nodes, edges, fullTokens);
    for (const node of world.nodes) {
      expect(node.homeX).toBe(node.x);
      expect(node.homeY).toBe(node.y);
    }
  });

  it("keeps homeX/homeY unchanged when x/y are mutated afterward (e.g. by a drag/sim write)", () => {
    const nodes: OntologyMapNode[] = [inputNode({ id: "p", kind: "project" }), inputNode({ id: "d", kind: "domain" })];
    const edges: OntologyMapEdge[] = [];
    const world = buildTopologyWorld(nodes, edges, fullTokens);
    const domainNode = world.nodeById.get("d")!;
    const originalHomeX = domainNode.homeX;
    const originalHomeY = domainNode.homeY;
    domainNode.x = 9999;
    domainNode.y = -9999;
    expect(domainNode.homeX).toBe(originalHomeX);
    expect(domainNode.homeY).toBe(originalHomeY);
    expect(domainNode.x).not.toBe(domainNode.homeX);
  });

  it("keeps the last containment parent inside a domain, and yields to the spine across domains", () => {
    // `element:shared` is declared by `capability:c1` (domain A) and by domain B. Drawing
    // it under B put it outside the domain the INDEX and the census hold it in, so domain
    // A's node was engraved one more than its chip could open. `element:local` is declared
    // twice inside domain A, where the later parent only changes depth, so the domain keeps
    // its fan.
    const nodes: OntologyMapNode[] = [
      inputNode({ id: "p", kind: "project" }),
      inputNode({ id: "domain:a", kind: "domain" }),
      inputNode({ id: "domain:b", kind: "domain" }),
      inputNode({ id: "capability:c1", kind: "capability" }),
      inputNode({ id: "element:shared", kind: "element" }),
      inputNode({ id: "element:local", kind: "element" })
        ];
    const contains = (source: string, target: string): OntologyMapEdge => ({
      source,
      target,
      relationType: "contains",
      relationQuality: null,
      evidenceCount: 0,
      kind: "contains",
      declaredBySlug: null,
    });
    const world = buildTopologyWorld(
      nodes,
      [
        contains("p", "domain:a"),
        contains("p", "domain:b"),
        contains("domain:a", "capability:c1"),
        contains("capability:c1", "element:shared"),
        contains("capability:c1", "element:local"),
        contains("domain:b", "element:shared"),
        contains("domain:a", "element:local")
        ], fullTokens);
    expect(world.nodeById.get("element:shared")!.parentId).toBe("capability:c1");
    expect(world.nodeById.get("element:local")!.parentId).toBe("domain:a");
    expect(world.childrenByParent.get("domain:b") ?? []).toEqual([]);
  });
});

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

/** P3a — the contract for deriving the ink ramp's level. */
describe("containmentLevelFor", () => {
  it("an edge touching a project is L0, domain is L1, everything else is L2", () => {
    expect(containmentLevelFor("project", "domain")).toBe(0);
    expect(containmentLevelFor("domain", "capability")).toBe(1);
    expect(containmentLevelFor("capability", "element")).toBe(2);
    expect(containmentLevelFor("element", "element")).toBe(2);
    expect(containmentLevelFor("domain", "project")).toBe(0);
  });
});

/** B4 — magnitude encoding: a compressed rank cue. */
describe("computeMagnitudeScale (part 2, square root of childCount)", () => {
  it("only domain and capability get a multiplier, project and element stay at 1", () => {
    expect(computeMagnitudeScale("project", 100, 100, 0.45)).toBe(1);
    expect(computeMagnitudeScale("element", 100, 100, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 100, 100, 0.45)).toBeGreaterThan(1);
  });

  it("always at least base (1): childCount 1 is exactly base, and the maximum is capped at +40%", () => {
    expect(computeMagnitudeScale("domain", 1, 103, 0.45)).toBe(1);
    // Even at the maximum (= maxChildCount) it never exceeds the +40% cap (1.4).
    expect(computeMagnitudeScale("domain", 103, 103, 0.45)).toBeLessThanOrEqual(1.4);
    expect(computeMagnitudeScale("domain", 103, 103, 0.45)).toBeGreaterThan(1.2);
  });

  it("square-root compression squeezes large gaps while keeping the rank cue (not a bar chart)", () => {
    const big = computeMagnitudeScale("domain", 103, 103, 0.45);
    const small = computeMagnitudeScale("domain", 9, 103, 0.45);
    // An 11× difference in children (9 → 103) compresses to within ~1.3× of size factor.
    expect(big / small).toBeGreaterThan(1.1);
    expect(big / small).toBeLessThan(1.4);
  });

  it("monotonic: more direct children never gives a smaller multiplier", () => {
    let prev = 0;
    for (const c of [1, 5, 20, 60, 103]) {
      const v = computeMagnitudeScale("capability", c, 103, 0.45);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("defensive: maxChildCount 0, childCount 0 and k 0 all give 1", () => {
    expect(computeMagnitudeScale("domain", 0, 103, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 10, 0, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 10, 103, 0)).toBe(1);
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
describe("buildTopologyWorld with the Flat dial", () => {
    const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
    const dialTokens = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));
    const fullTokens = {
        radiusProject: 20, radiusDomain: 14, radiusCapability: 8, radiusElement: 5,
        layoutRingDomain: 250, layoutRingCapability: 145, layoutRingElement: 90,
        edgeBowContains: 70, edgeBowDepends: 92, edgeBlendContains: 0.46, edgeBlendDepends: 0.62, starCount: 2,
    } as unknown as OntologyMapTokens;
    const mapNode = (id: string, kind: OntologyMapNode["kind"]): OntologyMapNode => ({
        id, label: id, kind, size: 1, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, fullDegree: 0, descendantCount: 0,
    });
    const edge = (source: string, target: string, relationType: string): OntologyMapEdge => ({
        source, target, relationType, relationQuality: null, evidenceCount: 0, kind: relationType === "contains" ? "contains" : "depends", declaredBySlug: null,
    });
    const nodes: OntologyMapNode[] = [mapNode("p", "project")];
    const edges: OntologyMapEdge[] = [];
    for (let d = 0; d < 4; d += 1) {
        nodes.push(mapNode(`d${d}`, "domain"));
        edges.push(edge("p", `d${d}`, "contains"));
        for (let c = 0; c < 14; c += 1) {
            nodes.push(mapNode(`d${d}c${c}`, "capability"));
            edges.push(edge(`d${d}`, `d${d}c${c}`, "contains"));
            nodes.push(mapNode(`d${d}c${c}e`, "element"));
            edges.push(edge(`d${d}c${c}`, `d${d}c${c}e`, "contains"));
        }
    }
    edges.push(edge("d1c0", "d0c0", "depends_on"), edge("d2c3", "d0c1", "depends_on"), edge("d3c2", "d1c4", "depends_on"));
    const input = (memory: DialMemory | null): DialWorldInput => ({
        labels: null, tokens: dialTokens, measureText: (text) => text.length * 6, rememberOrder: false, memory,
    });
    it("places every node at the scene's position and folds nothing", () => {
        const world = buildTopologyWorld(nodes, edges, fullTokens, "disc", input(null));
        const dial = world.dial!;
        expect(dial.scene.clusters).toHaveLength(4);
        for (const n of world.nodes) {
            const p = dial.scene.positions.get(n.id)!;
            expect([n.x, n.y, n.homeX, n.homeY]).toEqual([p.x, p.y, p.x, p.y]);
        }
        const crowded = new Set(["d0"]);
        expect(computeFoldedIds(world, new Set()).size).toBe(0);
        expect(computeTopologyClusterState(world, new Set()).clusteredIds.size).toBe(0);
        expect(computeFoldedIds({ ...world, dial: null }, new Set()).size).toBeGreaterThan(0);
        const extent = dial.scene.extent;
        expect(world.spineBounds).toEqual(extent);
        expect(computeDrawnSpineBounds(world, fullTokens, new Set())).toEqual(extent);
        expect(computeRevealedBounds(world, fullTokens, crowded, null)).toEqual(extent);
        recomputeWorldGeometry(world, fullTokens);
        expect(world.spineBounds).toEqual(extent);
        expect(dialOverviewFit(world)).toEqual({ padPx: dial.overviewPadPx, scaleFloor: 0.02, labelBottomAllowance: 0 });
    });
    it("frames hidden contained, direct and unassigned elements by their actual scene position", () => {
        const world = buildTopologyWorld([...nodes, mapNode("direct", "element"), mapNode("free", "element")], [...edges, edge("d0", "direct", "contains")], fullTokens, "disc", input(null));
        for (const id of ["d0c13e", "direct", "free"]) {
            expect(world.nodeById.get(id)?.kind).toBe("element");
            const frame = dialFocusFrame(world, id, dialTokens);
            expect(frame?.ids).toEqual(new Set([id]));
            expect(frame?.nameScale).toBe(dialTokens.capName / dialTokens.pitch);
            expect(world.dial!.scene.positions.has(id)).toBe(true);
        }
        expect(dialFocusFrame(world, "missing", dialTokens)).toBeUndefined();
        expect(dialFocusFrame(world, "d0", dialTokens)).toBeUndefined();
        expect(dialFocusFrame(world, "p", dialTokens)).toBeUndefined();
        const capability = dialFocusFrame(world, "d0c0", dialTokens)!;
        expect(capability.ids.has("d0c0")).toBe(true);
        expect(capability.ids.has("d1c0")).toBe(true);
    });
    it("spends nothing on the classic layout when the scene places every node", () => {
        vi.mocked(computeConcentricLayout).mockClear();
        buildTopologyWorld(nodes, edges, fullTokens, "disc", input(null));
        expect(computeConcentricLayout).not.toHaveBeenCalled();
        buildTopologyWorld(nodes, edges, fullTokens);
        expect(computeConcentricLayout).toHaveBeenCalledOnce();
    });
    it("leaves the world as it was without dial input", () => {
        const plain = buildTopologyWorld(nodes, edges, fullTokens);
        expect(plain.dial).toBeNull();
        expect(dialOverviewFit(plain)).toBeUndefined();
        expect(buildTopologyWorld(nodes, edges, fullTokens, undefined, null).nodes.map((n) => [n.x, n.y])).toEqual(plain.nodes.map((n) => [n.x, n.y]));
    });
    it("reproduces every position from the memory it returned, through JSON", () => {
        const first = buildTopologyWorld(nodes, edges, fullTokens, "disc", input(null));
        const memory = first.dial!.scene.memory;
        const json = JSON.parse(JSON.stringify({
            order: memory.order, radius: [...memory.radiusByStep], angle: [...memory.angleById], items: [...memory.itemOrder],
        })) as {
            order: string[];
            radius: [
                number,
                number
            ][];
            angle: [
                string,
                {
                    step: number;
                    angle: number;
                }
            ][];
            items: [
                string,
                string[]
            ][];
        };
        const restored: DialMemory = { order: json.order, radiusByStep: new Map(json.radius), angleById: new Map(json.angle), itemOrder: new Map(json.items) };
        const again = buildTopologyWorld(nodes, edges, fullTokens, "disc", input(restored));
        for (const n of again.nodes) {
            const was = first.nodeById.get(n.id)!;
            expect(Math.hypot(n.x - was.x, n.y - was.y)).toBeLessThanOrEqual(0.5);
        }
    });
    it("builds no dial for a graph without a domain", () => {
        const world = buildTopologyWorld([mapNode("p", "project"), mapNode("c", "capability")], [edge("p", "c", "contains")], fullTokens, "disc", input(null));
        expect(world.dial).toBeNull();
    });
});

describe("buildTopologyWorld with the Flat graph", () => {
    const css = new Map<string, string>();
    for (const file of ["app/styles/map-graph-tokens.css", "app/styles/tokens.css", "app/styles/base-map-tokens.css", "app/styles/map-dial-tokens.css"]) {
        for (const m of readFileSync(file, "utf8").matchAll(/(--[\w-]+):\s*([^;]+);/g)) if (!css.has(m[1]!)) css.set(m[1]!, m[2]!.trim());
    }
    const graph = resolveFlatGraphTokens((v) => css.get(v) ?? "");
    const dialTokens = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.get(v) ?? ""));
    const mapTokens = {
        radiusProject: 20, radiusDomain: 14, radiusCapability: 8, radiusElement: 5,
        layoutRingDomain: 250, layoutRingCapability: 145, layoutRingElement: 90,
        edgeBowContains: 70, edgeBowDepends: 92, edgeBlendContains: 0.46, edgeBlendDepends: 0.62, starCount: 2,
    } as unknown as OntologyMapTokens;
    const labels: DialLabels = {
        units: (c, e) => `${c} capabilities · ${e} elements`, stale: (n) => `${n} stale`, orphans: (n) => `${n} unplaced`, more: (n) => `+${n}`,
        ring: () => "", reading: () => "", settling: () => "", linksShown: () => "",
    };
    const input = (memory: DialMemory | null): DialWorldInput => ({
        graph, graphAreaPx: { width: 1600, height: 900 }, labels, tokens: dialTokens, rememberOrder: true, memory,
        measureText: (text, font) => text.length * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 12) * 0.6,
    });
    type Read = { nodes: OntologyMapNode[]; edges: OntologyMapEdge[] };
    const readOf = (manifest: unknown, keep: (kind: string, at: number) => boolean = () => true): Read => {
        const derived = deriveOntologyFromVault(manifest as VaultManifest);
        const nodes = (derived.nodes as { id: string; kind: string; title?: string }[])
            .filter((n, at) => ["project", "domain", "capability", "element"].includes(n.kind) && keep(n.kind, at))
            .map((n): OntologyMapNode => ({ id: n.id, label: n.title ?? n.id, kind: n.kind as OntologyMapNode["kind"], size: 1, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, fullDegree: 0, descendantCount: 0 }));
        const ids = new Set(nodes.map((n) => n.id));
        const edges = (derived.edges as { from: string; to: string; type: string }[])
            .filter((e) => ids.has(e.from) && ids.has(e.to))
            .map((e): OntologyMapEdge => ({ source: e.from, target: e.to, relationType: e.type, relationQuality: null, evidenceCount: 0, kind: isContainmentRelation(e.type) ? "contains" : "depends", declaredBySlug: null }));
        return { nodes, edges };
    };
    const folder = readOf(dogfoodManifest);
    const partOf = (every: number) => readOf(dogfoodManifest, (kind, at) => (kind !== "capability" && kind !== "element") || at % every === 0);

    /**
     * One page session, with fresh module memory, as the map lifecycle drives it: whatever showed
     * before the pick, then each provisional read hands its memory to the next and only the end settles.
     */
    async function open(shownBefore: Read | null, reads: readonly Read[], stored: DialMemory | null) {
        vi.resetModules();
        const { buildTopologyWorld: build } = await import("./topology-world");
        const { claimDialOrderFolder } = await import("../../dial/order");
        const { claimFlatGraphFolder, settleFlatGraph } = await import("../../flat-graph/scene");
        const { labelFontFamily } = await import("../../render/labels");
        if (shownBefore) build(shownBefore.nodes, shownBefore.edges, mapTokens, "disc", input(null));
        claimDialOrderFolder("folder");
        claimFlatGraphFolder("folder");
        let provisional: DialMemory | null = null;
        let world: TopologyWorld | null = null;
        reads.forEach((read, at) => {
            world = build(read.nodes, read.edges, mapTokens, "disc", input(provisional ?? stored));
            const settled = at === reads.length - 1;
            settleFlatGraph(world.dial!.model, world.dial!.scene.graph!, settled ? "settled" : "provisional", labelFontFamily());
            provisional = settled ? null : world.dial!.scene.memory;
        });
        return world!.dial!.scene;
    }

    it("draws one folder as one picture however it was opened: after the bundled sample, streamed, or reopened", async () => {
        const oneShot = await open(null, [folder], null);
        const afterSample = await open(readOf(storefrontManifest), [folder], null);
        const streamed = await open(null, [partOf(4), partOf(2), folder], null);
        const reopened = await open(null, [folder], afterSample.memory);
        for (const [how, scene] of Object.entries({ afterSample, streamed, reopened })) {
            const drift = Math.max(...[...oneShot.positions].map(([id, at]) => Math.hypot(scene.positions.get(id)!.x - at.x, scene.positions.get(id)!.y - at.y)));
            expect.soft(drift, `${how}: farthest drift from the one-shot open`).toBeLessThan(1e-6);
            expect.soft(new Map(scene.graph!.hueByDomain), `${how}: hue per domain`).toEqual(new Map(oneShot.graph!.hueByDomain));
        }
    });
});
