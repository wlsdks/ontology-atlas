import { describe, expect, it } from "vitest";

import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import {
  buildTopologyWorld,
  computeMagnitudeScale,
  computeEgoBounds,
  computeClusterDiscBounds,
  computeDrawnSpineBounds,
  computeFoldedIds,
  computeRevealedBounds,
  computeSpineBounds,
  isSpineNode,
  type WorldNode,
  containmentLevelFor,
} from "./topology-world";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";

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
    starMagnitude: 0,
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
      inputNode({ id: "d", kind: "domain" }),
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
      inputNode({ id: "element:local", kind: "element" }),
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
        contains("domain:a", "element:local"),
      ],
      fullTokens,
    );
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

  // S8 defect 4 — a fling neighbour outside the warding circle (thousands of units
  // out) inflated the ego bbox during realm expansion and flung the camera off
  // screen. restrictIds keeps only the realm's members.
  it("restrictIds 는 영역 밖(fling) 이웃을 bbox 에서 제외한다", () => {
    const nodes: WorldNode[] = [
      node({ id: "f", kind: "domain", x: 0, y: 0 }), // r14
      node({ id: "inside", kind: "capability", x: 100, y: 0 }), // a realm member, r8 → maxX 108
      node({ id: "outside", kind: "element", x: 5000, y: 5000 }), // a neighbour flung outside the warding circle
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

  it("부모 + 직속 자식 부챗살의 반지름 패딩 bbox", () => {
    const nodes: WorldNode[] = [
      node({ id: "d", kind: "domain", x: 0, y: 0 }), // r14
      node({ id: "c1", kind: "capability", x: 100, y: 0 }), // r8 → maxX 108
      node({ id: "c2", kind: "capability", x: 0, y: -60 }), // r8 → minY -68
      // Another parent's child — excluded.
      node({ id: "other", kind: "element", x: 900, y: 900 }),
    ];
    const world = discWorld(nodes, { d: ["c1", "c2"], p2: ["other"] });
    const bounds = computeClusterDiscBounds(world, tokens, "d");
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBe(-14);
    expect(bounds!.maxX).toBe(108);
    expect(bounds!.minY).toBe(-68);
    expect(bounds!.maxY).toBe(14);
  });

  it("부모 미해결이면 null", () => {
    const world = discWorld([node({ id: "d", kind: "domain", x: 0, y: 0 })], { d: [] });
    expect(computeClusterDiscBounds(world, tokens, "missing")).toBeNull();
  });

  it("restrictIds 를 주면 그 집합의 자식만 bbox 에 포함(고팬아웃 배치 fit)", () => {
    const nodes: WorldNode[] = [
      node({ id: "d", kind: "domain", x: 0, y: 0 }), // r14
      node({ id: "c1", kind: "capability", x: 100, y: 0 }), // r8 → maxX 108
      node({ id: "far", kind: "capability", x: 900, y: 0 }), // a collapsed leftover — must be excluded
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
  it("project 가 낀 엣지는 L0, domain 은 L1, 그 외는 L2", () => {
    expect(containmentLevelFor("project", "domain")).toBe(0);
    expect(containmentLevelFor("domain", "capability")).toBe(1);
    expect(containmentLevelFor("capability", "element")).toBe(2);
    expect(containmentLevelFor("element", "element")).toBe(2);
    expect(containmentLevelFor("domain", "project")).toBe(0);
  });
});

/** B4 — magnitude encoding: a compressed rank cue. */
describe("computeMagnitudeScale (S2 파트 2 — √childCount)", () => {
  it("domain/capability 만 배율을 받고 project/element 는 1", () => {
    expect(computeMagnitudeScale("project", 100, 100, 0.45)).toBe(1);
    expect(computeMagnitudeScale("element", 100, 100, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 100, 100, 0.45)).toBeGreaterThan(1);
  });

  it("항상 base(1) 이상 — childCount 1 은 정확히 base, 최대는 +40% 상한", () => {
    expect(computeMagnitudeScale("domain", 1, 103, 0.45)).toBe(1);
    // Even at the maximum (= maxChildCount) it never exceeds the +40% cap (1.4).
    expect(computeMagnitudeScale("domain", 103, 103, 0.45)).toBeLessThanOrEqual(1.4);
    expect(computeMagnitudeScale("domain", 103, 103, 0.45)).toBeGreaterThan(1.2);
  });

  it("√ 압축 — 큰 격차를 압축하되 순위 단서 유지(막대그래프 아님)", () => {
    const big = computeMagnitudeScale("domain", 103, 103, 0.45);
    const small = computeMagnitudeScale("domain", 9, 103, 0.45);
    // An 11× difference in children (9 → 103) compresses to within ~1.3× of size factor.
    expect(big / small).toBeGreaterThan(1.1);
    expect(big / small).toBeLessThan(1.4);
  });

  it("단조 — 직속 자식 수가 크면 배율도 크거나 같다", () => {
    let prev = 0;
    for (const c of [1, 5, 20, 60, 103]) {
      const v = computeMagnitudeScale("capability", c, 103, 0.45);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("방어 — maxChildCount 0 / childCount 0 / k 0 은 전부 1", () => {
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
 * **The overview frames the spine it draws** (2026-09-25). The one hub is spine, but
 * the density gate folds it behind its parent's chip like any sibling once that parent
 * holds more than twelve children, and the fit went on framing it: on the dogfood
 * ontology the folded hub stood 166 world units left of the drawn cross and the drawing
 * landed 77 px right of the free map's centre at 1512×949.
 */
describe("the drawn spine — a hub folded behind a crowded parent", () => {
  const p = node({ id: "p", kind: "project", x: 0, y: 0 });
  const left = node({ id: "dl", kind: "domain", x: -250, y: 0, parentId: "p" });
  const right = node({ id: "dr", kind: "domain", x: 250, y: 0, parentId: "p" });
  // Thirteen capabilities: one over the fold threshold, so the left domain collapses.
  const folded = Array.from({ length: 13 }, (_, i) =>
    node({ id: `c${i}`, kind: "capability", x: -395, y: -60 + i * 10, parentId: "dl", isHub: i === 0 }),
  );
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
