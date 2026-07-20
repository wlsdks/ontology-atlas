import { describe, expect, it } from "vitest";

import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import {
  buildTopologyWorld,
  computeMagnitudeScale,
  computeEgoBounds,
  computeSpineBounds,
  isSpineNode,
  type WorldNode,
  containmentLevelFor,
} from "./topology-world";
import type { TopologyV2Edge, TopologyV2Node } from "./TopologyMapV2";

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
    count: 0, magnitudeScale: 1,
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
  } as unknown as TopologyV2Tokens;

  function inputNode(partial: Partial<TopologyV2Node> & Pick<TopologyV2Node, "id" | "kind">): TopologyV2Node {
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
    const nodes: TopologyV2Node[] = [
      inputNode({ id: "p", kind: "project" }),
      inputNode({ id: "d", kind: "domain" }),
    ];
    const edges: TopologyV2Edge[] = [{ source: "p", target: "d", relationType: "contains", relationQuality: null, evidenceCount: 0, kind: "contains", declaredBySlug: null }];
    const world = buildTopologyWorld(nodes, edges, fullTokens);
    for (const node of world.nodes) {
      expect(node.homeX).toBe(node.x);
      expect(node.homeY).toBe(node.y);
    }
  });

  it("keeps homeX/homeY unchanged when x/y are mutated afterward (e.g. by a drag/sim write)", () => {
    const nodes: TopologyV2Node[] = [inputNode({ id: "p", kind: "project" }), inputNode({ id: "d", kind: "domain" })];
    const edges: TopologyV2Edge[] = [];
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
});

/** P3a — 잉크 사다리의 레벨 유도 계약. */
describe("containmentLevelFor", () => {
  it("project 가 낀 엣지는 L0, domain 은 L1, 그 외는 L2", () => {
    expect(containmentLevelFor("project", "domain")).toBe(0);
    expect(containmentLevelFor("domain", "capability")).toBe(1);
    expect(containmentLevelFor("capability", "element")).toBe(2);
    expect(containmentLevelFor("element", "element")).toBe(2);
    expect(containmentLevelFor("domain", "project")).toBe(0);
  });
});

/** B4 — 규모 인코딩: 로그 압축 순위 단서. */
describe("computeMagnitudeScale", () => {
  it("domain/capability 만 배율을 받고 project/element 는 1", () => {
    expect(computeMagnitudeScale("project", 100, 100, 0.45)).toBe(1);
    expect(computeMagnitudeScale("element", 100, 100, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 100, 100, 0.45)).toBeGreaterThan(1);
  });

  it("로그 압축 — 103 이 9 의 ~1.2배 수준 (막대그래프 아님)", () => {
    const big = computeMagnitudeScale("domain", 103, 103, 0.45);
    const small = computeMagnitudeScale("domain", 9, 103, 0.45);
    expect(big / small).toBeGreaterThan(1.1);
    expect(big / small).toBeLessThan(1.35);
  });

  it("단조 — count 가 크면 배율도 크거나 같다", () => {
    let prev = 0;
    for (const c of [1, 5, 20, 60, 103]) {
      const v = computeMagnitudeScale("capability", c, 103, 0.45);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("방어 — maxCount 0 / count 0 / k 0 은 전부 1", () => {
    expect(computeMagnitudeScale("domain", 0, 103, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 10, 0, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 10, 103, 0)).toBe(1);
  });
});
