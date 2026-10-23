import { describe, expect, it } from "vitest";

import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildTopologyWorld } from "./topology-world";
import type { OntologyMapEdge, OntologyMapNode } from "../OntologyMap";
import { buildRealmRuntimeData, realmCameraTarget, realmVisibleBounds } from "./topology-realm-runtime";
import { DENSITY_GATE_THRESHOLD } from "../../model/layout/density-gate";
import { computeRealmLayout, extractRealmSubtree } from "../../model/realm/realm";
import type { LayoutRings } from "../../model/layout/layout";

const tokens = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
  layoutRingDomain: 250,
  layoutRingCapability: 145,
  layoutRingElement: 90,
  realmFillRadius1: 130,
  realmFillRadius2: 190,
  realmFillRadius3: 250,
  edgeBowContains: 70,
  edgeBowDepends: 92,
  edgeBlendContains: 0.46,
  edgeBlendDepends: 0.62,
  starCount: 2,
  radiusMagnitudeK: 0,
  cameraScaleMax: 2.6,
  cameraScaleMin: 0.24,
  safeInsetLeft: 0,
  safeInsetRight: 0,
  safeInsetTop: 0,
  safeInsetBottom: 0,
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

function containsEdge(source: string, target: string): OntologyMapEdge {
  return { source, target, relationType: "contains", relationQuality: null, evidenceCount: 0, kind: "contains", declaredBySlug: null };
}

/**
 * Fixture: project p ⊃ domain d (⊃ cap c ⊃ el e) + sibling domain d2 (⊃ el x).
 * With the realm root at d, the members are {d, c, e} and the outside is {p, d2, x}.
 */
function buildFixtureWorld() {
  const nodes: OntologyMapNode[] = [
    inputNode({ id: "p", kind: "project" }),
    inputNode({ id: "d", kind: "domain" }),
    inputNode({ id: "c", kind: "capability" }),
    inputNode({ id: "e", kind: "element" }),
    inputNode({ id: "d2", kind: "domain" }),
    inputNode({ id: "x", kind: "element" }),
  ];
  const edges: OntologyMapEdge[] = [
    containsEdge("p", "d"),
    containsEdge("d", "c"),
    containsEdge("c", "e"),
    containsEdge("p", "d2"),
    containsEdge("d2", "x"),
  ];
  return buildTopologyWorld(nodes, edges, tokens);
}

describe("buildRealmRuntimeData", () => {
  it("splits members from outside and re-roots the subtree at the origin", () => {
    const world = buildFixtureWorld();
    const data = buildRealmRuntimeData(world, "d", tokens);
    expect(data).not.toBeNull();
    expect([...data!.memberIds].sort()).toEqual(["c", "d", "e"]);
    expect([...data!.outsideIds].sort()).toEqual(["d2", "p", "x"]);
    // The root is the re-layout origin.
    expect(data!.insideTargets.get("d")).toEqual({ x: 0, y: 0 });
    // The fling's gravity centre = the root's original position.
    expect(data!.flingCenter).toEqual({ x: world.nodeById.get("d")!.homeX, y: world.nodeById.get("d")!.homeY });
    // The warding circle is centred on the origin with a positive radius.
    expect(data!.wardingCenter).toEqual({ x: 0, y: 0 });
    expect(data!.wardingRadius).toBeGreaterThan(0);
  });

  it("exposes depthById for every member (root=0), the runtime data for depth staging", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    // Every member has a depth, and the root's is 0.
    expect(new Set(data.depthById.keys())).toEqual(new Set(data.memberIds));
    expect(data.depthById.get("d")).toBe(0);
    // A non-root member is deeper than the root.
    for (const id of data.memberIds) {
      if (id !== "d") expect(data.depthById.get(id)!).toBeGreaterThan(0);
    }
  });

  it("is deterministic (same world + root → identical warding radius)", () => {
    const a = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    const b = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    expect(a.wardingRadius).toBe(b.wardingRadius);
    expect([...a.insideTargets.entries()]).toEqual([...b.insideTargets.entries()]);
  });

  it("returns null when the root is not in the world", () => {
    expect(buildRealmRuntimeData(buildFixtureWorld(), "missing", tokens)).toBeNull();
  });

  // S8 defect 2 — entryCamera is null at build time (the camera is unknown). The entry effect fills it.
  it("entryCamera is null right after the build (the entry effect fills it with a camera value)", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    expect(data.entryCamera).toBeNull();
  });

  it("realmCameraTarget centers on the content bbox (the content, not the realm boundary, is the subject) and clamps scale", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
  // S9 defects 1/2 — realmCameraTarget now takes bounds directly (on the visible-member basis).
    const target = realmCameraTarget(data.bounds, tokens, 1000, 800);
    expect(target.tx).toBeCloseTo((data.bounds.minX + data.bounds.maxX) / 2, 4);
    expect(target.ty).toBeCloseTo((data.bounds.minY + data.bounds.maxY) / 2, 4);
    expect(target.tscale).toBeLessThanOrEqual(2.6);
    expect(target.tscale).toBeGreaterThanOrEqual(0.24);
  });
});

describe("buildRealmRuntimeData — depth-derived realm ring fill (Slice A)", () => {
  function buildShallowCapabilityWorld() {
    const nodes: OntologyMapNode[] = [
      inputNode({ id: "c", kind: "capability" }),
      inputNode({ id: "e1", kind: "element" }),
      inputNode({ id: "e2", kind: "element" }),
    ];
    const edges: OntologyMapEdge[] = [containsEdge("c", "e1"), containsEdge("c", "e2")];
    return buildTopologyWorld(nodes, edges, tokens);
  }

  it("pulls a shallow (maxDepth=1) realm's depth-1 children to ≈130, not the 250 global spine ring", () => {
    const world = buildShallowCapabilityWorld();
    const data = buildRealmRuntimeData(world, "c", tokens)!;
    for (const id of ["e1", "e2"]) {
      const p = data.insideTargets.get(id)!;
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeCloseTo(tokens.realmFillRadius1, 0);
      expect(r).toBeLessThan(tokens.layoutRingDomain);
    }
  });

  it("tightens the warding radius for the shallow realm (no longer stretched to the 250-ring scale)", () => {
    const world = buildShallowCapabilityWorld();
    const shallow = buildRealmRuntimeData(world, "c", tokens)!;
    // The children sit at a radius of ~130, so the warding circle should be near that
    // — distinctly smaller than what a 250 spine basis would require (> 250).
    expect(shallow.wardingRadius).toBeLessThan(tokens.layoutRingDomain);
  });

  it("leaves a deep (maxDepth≥3) realm's coordinates identical to the unscaled base rings — regression guard", () => {
    const world = buildFixtureWorld();
    const data = buildRealmRuntimeData(world, "p", tokens)!;
    // p ⊃ d(⊃ c ⊃ e) + p ⊃ d2(⊃ x) — maxDepth from "p" is 3 (p→d→c→e), so
    // realmRingsForDepth caps at depth3 → s=1 → base rings unscaled.
    const childrenByParent = new Map<string, string[]>([
      ["p", ["d", "d2"]],
      ["d", ["c"]],
      ["c", ["e"]],
      ["d2", ["x"]],
    ]);
    const subtree = extractRealmSubtree("p", childrenByParent);
    const baseRings: LayoutRings = {
      domain: tokens.layoutRingDomain,
      capability: tokens.layoutRingCapability,
      element: tokens.layoutRingElement,
    };
    const expected = computeRealmLayout(subtree, baseRings, {
      project: tokens.radiusProject,
      domain: tokens.radiusDomain,
      capability: tokens.radiusCapability,
      element: tokens.radiusElement,
    });
    for (const [id, p] of expected) {
      expect(data.insideTargets.get(id)).toEqual({ x: p.x, y: p.y });
    }
  });
});

/**
 * S9 defect 2 — whether children the density gate collapses (the phyllotaxis disc
 * under a parent with >12 children) inflate the warding radius and camera bbox. Root
 * d ⊃ cap c ⊃ (threshold + 8) elements. When cap c collapses its element children are
 * invisible, so they have to drop out of the warding circle.
 */
describe("buildRealmRuntimeData: realm boundary and framing based on visible members", () => {
  function buildDenseWorld() {
    const childIds = Array.from({ length: DENSITY_GATE_THRESHOLD + 8 }, (_, i) => `el-${i}`);
    const nodes: OntologyMapNode[] = [
      inputNode({ id: "d", kind: "domain" }),
      inputNode({ id: "c", kind: "capability" }),
      ...childIds.map((id) => inputNode({ id, kind: "element" })),
    ];
    const edges: OntologyMapEdge[] = [
      containsEdge("d", "c"),
      ...childIds.map((id) => containsEdge("c", id)),
    ];
    return { world: buildTopologyWorld(nodes, edges, tokens), childIds };
  }

  it("collapsed children do not inflate the realm radius (expanded vs collapsed radius comparison)", () => {
    const { world } = buildDenseWorld();
    // c collapsed (the default): only root d is expanded → every element child of c is clustered.
    const collapsed = buildRealmRuntimeData(world, "d", tokens, new Set(["d"]))!;
    // c expanded: the element children are visible, so the warding circle grows to match.
    const expanded = buildRealmRuntimeData(world, "d", tokens, new Set(["d", "c"]))!;
    expect(collapsed.wardingRadius).toBeLessThan(expanded.wardingRadius);
    // The bbox moves the same way — collapsed is narrower.
    const wCollapsed = collapsed.bounds.maxX - collapsed.bounds.minX;
    const wExpanded = expanded.bounds.maxX - expanded.bounds.minX;
    expect(wCollapsed).toBeLessThan(wExpanded);
  });

  it("realmVisibleBounds refits the framing as chips expand and collapse", () => {
    const { world } = buildDenseWorld();
    const data = buildRealmRuntimeData(world, "d", tokens, new Set(["d"]))!;
    const collapsedBounds = realmVisibleBounds(world, data, new Set(["d"]), tokens);
    const expandedBounds = realmVisibleBounds(world, data, new Set(["d", "c"]), tokens);
    const wCollapsed = collapsedBounds.maxX - collapsedBounds.minX;
    const wExpanded = expandedBounds.maxX - expandedBounds.minX;
    expect(wCollapsed).toBeLessThan(wExpanded);
  });
});

describe('Flat scoped branches', () => {
  const dialInput = {
    tokens: { pitch: 34, spiralC: 0.61, spiralK0: 4.5, elementRoom: 0.42, elementHole: 0.13, angularGap: 0.9, ringGap: 2.1, hubClearance: 78, orphanPitch: 0.5, nameMaxPx: 164, labelScale: 1, chipMinPx: 8, ledgerGapPx: 16 },
    labels: null, measureText: (text: string) => text.length * 8, memory: null, rememberOrder: false,
  } as unknown as import('../../dial/types').DialWorldInput;
  it('keeps domain and member kinds in a scoped branch scene instead of promoting their depth', () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), 'd', tokens, new Set(['d']), dialInput)!;
    expect(data.flat).toBe(true);
    expect(data.dial?.scene.branches).toBe(true);
    expect(data.dial?.model.projectId).toBeNull();
    expect(data.dial?.model.domains.map(d => d.id)).toEqual(['d']);
    expect([...data.insideTargets.keys()].sort()).toEqual(['c', 'd', 'e']);
    expect(data.tierKindById.get('d')).toBe('domain');
    expect(data.tierKindById.get('e')).toBe('element');
    expect(data.insideTargets.get('c')!.x).toBeGreaterThan(data.insideTargets.get('d')!.x);
  });
  it('lays out capability scopes as a readable tree while retaining the true node kinds', () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), 'c', tokens, new Set(['c']), dialInput)!;
    expect(data.flat).toBe(true);
    expect(data.dial).toBeNull();
    expect(data.insideTargets.get('c')).toEqual({ x: 0, y: 0 });
    expect(data.insideTargets.get('e')!.x).toBeGreaterThan(0);
    expect(data.tierKindById.get('c')).toBe('capability');
    expect(data.tierKindById.get('e')).toBe('element');
  });
});
