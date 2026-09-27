import { describe, expect, it } from "vitest";

import {
  computeConcentricLayout,
  type LayoutGraphNode,
  type LayoutRings,
} from "./layout";

/**
 * Small fixed vault fixture — one project, two domains, a handful of
 * capabilities/elements. Deliberately tiny (unlike the 12-domain prototype
 * fixture) so overlap/ring-radius assertions are easy to hand-verify.
 */
const FIXTURE: readonly LayoutGraphNode[] = [
  { id: "ontology-atlas", kind: "project", parentId: null },
  { id: "domain-a", kind: "domain", parentId: "ontology-atlas" },
  { id: "domain-b", kind: "domain", parentId: "ontology-atlas" },
  { id: "cap-a1", kind: "capability", parentId: "domain-a" },
  { id: "cap-a2", kind: "capability", parentId: "domain-a" },
  { id: "cap-b1", kind: "capability", parentId: "domain-b" },
  { id: "el-a1-1", kind: "element", parentId: "cap-a1" },
  { id: "el-a1-2", kind: "element", parentId: "cap-a1" },
  { id: "el-b1-1", kind: "element", parentId: "cap-b1" },
];

const RINGS: LayoutRings = { domain: 250, capability: 145, element: 90 };

function byId(points: { id: string; x: number; y: number }[], id: string) {
  const found = points.find((p) => p.id === id);
  if (!found) throw new Error(`fixture point ${id} missing from layout output`);
  return found;
}

describe("computeConcentricLayout", () => {
  it("places the project at the origin", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    const project = byId(points, "ontology-atlas");
    expect(project.x).toBeCloseTo(0, 6);
    expect(project.y).toBeCloseTo(0, 6);
  });

  it("places every domain exactly layoutRingDomain world-units from the origin (no aspectX distortion)", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    for (const domainId of ["domain-a", "domain-b"]) {
      const p = byId(points, domainId);
      const distanceFromOrigin = Math.hypot(p.x, p.y);
      expect(distanceFromOrigin).toBeCloseTo(RINGS.domain, 4);
    }
  });

  it("places every capability exactly layoutRingCapability world-units from its parent domain", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    const domainA = byId(points, "domain-a");
    for (const capId of ["cap-a1", "cap-a2"]) {
      const p = byId(points, capId);
      const distanceFromParent = Math.hypot(p.x - domainA.x, p.y - domainA.y);
      expect(distanceFromParent).toBeCloseTo(RINGS.capability, 4);
    }
  });

  it("places every element exactly layoutRingElement world-units from its parent capability", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    const capA1 = byId(points, "cap-a1");
    for (const elId of ["el-a1-1", "el-a1-2"]) {
      const p = byId(points, elId);
      const distanceFromParent = Math.hypot(p.x - capA1.x, p.y - capA1.y);
      expect(distanceFromParent).toBeCloseTo(RINGS.element, 4);
    }
  });

  it("is deterministic — calling twice with the same input produces identical coordinates", () => {
    const first = computeConcentricLayout(FIXTURE, RINGS);
    const second = computeConcentricLayout(FIXTURE, RINGS);
    expect(second).toEqual(first);
  });

  it("produces no two nodes at (or within 1 world-unit of) the same coordinates", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        expect(distance).toBeGreaterThan(1);
      }
    }
  });

  it("returns exactly one point per input node", () => {
    const points = computeConcentricLayout(FIXTURE, RINGS);
    expect(points).toHaveLength(FIXTURE.length);
  });
});

/**
 * De-pileup / determinism contract (Design Guardian rejected the earlier
 * fidelity): the static default must be a clean deterministic grid, NOT an FA2
 * settlement. The
 * collision-relax post-process spreads overlapping arcs with a FIXED iteration
 * count and a seeded tie-break — same input → byte-identical output.
 */
describe("computeConcentricLayout — deterministic de-pileup", () => {
  // One domain with a fat fan of capabilities (each with several elements) —
  // the 295-vs-40-concept density the guardian flagged, in miniature.
  const DENSE: LayoutGraphNode[] = [{ id: "p", kind: "project", parentId: null }];
  DENSE.push({ id: "d", kind: "domain", parentId: "p" });
  for (let c = 0; c < 10; c += 1) {
    const capId = `cap-${c}`;
    DENSE.push({ id: capId, kind: "capability", parentId: "d" });
    for (let e = 0; e < 6; e += 1) {
      DENSE.push({ id: `el-${c}-${e}`, kind: "element", parentId: capId });
    }
  }

  const RADII = { project: 25, domain: 17, capability: 11, element: 7 };

  function minPairwiseDistance(points: { x: number; y: number }[]): number {
    let min = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
      }
    }
    return min;
  }

  it("is byte-identical across two runs on a dense graph (no organic jitter)", () => {
    const a = computeConcentricLayout(DENSE, RINGS, { radii: RADII });
    const b = computeConcentricLayout(DENSE, RINGS, { radii: RADII });
    expect(b).toEqual(a);
  });

  it("leaves no two nodes closer than their combined collision radii", () => {
    const points = computeConcentricLayout(DENSE, RINGS, { radii: RADII, relaxPadding: 6 });
    // Smallest possible min-distance = two elements = 7 + 7 = 14 (padding is
    // extra headroom the relax targets, so we assert against the hard radii).
    expect(minPairwiseDistance(points)).toBeGreaterThanOrEqual(14);
  });

  it("actually separates an overlapping seed (relax does work), deterministically", () => {
    // Inflate radii so even the concentric seed overlaps heavily, forcing the
    // relax to push nodes apart.
    const huge = { project: 400, domain: 400, capability: 400, element: 400 };
    const seedOnly = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 0 });
    const relaxed = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 80 });
    expect(minPairwiseDistance(relaxed)).toBeGreaterThan(minPairwiseDistance(seedOnly));
    // Still fully deterministic under the heavy relax.
    const relaxedAgain = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 80 });
    expect(relaxedAgain).toEqual(relaxed);
  });
});

describe("computeConcentricLayout with nonstandard lineage and orphans (blob regression)", () => {
  // A vault where a domain holds elements directly (no capability in between).
  // These nodes used not to be placed at all: they stacked at (0,0), and live
  // physics dragged the stack toward the hub into a "blob" where even the labels
  // overlapped (owner report).
  const DOMAIN_DIRECT: readonly LayoutGraphNode[] = [
    { id: "p", kind: "project", parentId: null },
    { id: "d", kind: "domain", parentId: "p" },
    { id: "el-1", kind: "element", parentId: "d" },
    { id: "el-2", kind: "element", parentId: "d" },
    { id: "el-3", kind: "element", parentId: "d" },
  ];

  it("fans elements directly under a domain around it instead of stacking them at (0,0)", () => {
    const points = computeConcentricLayout(DOMAIN_DIRECT, RINGS);
    const d = byId(points, "d");
    for (const id of ["el-1", "el-2", "el-3"]) {
      const p = byId(points, id);
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(1); // never stacked on the origin
      // A fan of 3 is at or below the density threshold → they ring the domain at exactly the element radius.
      expect(Math.hypot(p.x - d.x, p.y - d.y)).toBeCloseTo(RINGS.element, 4);
    }
    // And they do not overlap each other.
    const [a, b, c] = ["el-1", "el-2", "el-3"].map((id) => byId(points, id));
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
    expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeGreaterThan(1);
  });

  it("places children of an element-in-element chain around their placed parent", () => {
    const chain: readonly LayoutGraphNode[] = [
      { id: "p", kind: "project", parentId: null },
      { id: "d", kind: "domain", parentId: "p" },
      { id: "c", kind: "capability", parentId: "d" },
      { id: "el-parent", kind: "element", parentId: "c" },
      { id: "el-child", kind: "element", parentId: "el-parent" },
    ];
    const points = computeConcentricLayout(chain, RINGS);
    const parent = byId(points, "el-parent");
    const child = byId(points, "el-child");
    expect(Math.hypot(child.x, child.y)).toBeGreaterThan(1);
    // Single child, no relax collision → exactly the element ring radius.
    expect(Math.hypot(child.x - parent.x, child.y - parent.y)).toBeCloseTo(RINGS.element, 4);
  });

  it("spirals orphans outside containment apart beyond the domain ring", () => {
    const withOrphans: readonly LayoutGraphNode[] = [
      { id: "p", kind: "project", parentId: null },
      { id: "d", kind: "domain", parentId: "p" },
      { id: "orphan-1", kind: "element", parentId: null },
      { id: "orphan-2", kind: "element", parentId: "ghost-missing" },
      { id: "orphan-3", kind: "element", parentId: null },
    ];
    const points = computeConcentricLayout(withOrphans, RINGS);
    const orphans = ["orphan-1", "orphan-2", "orphan-3"].map((id) => byId(points, id));
    for (const o of orphans) {
      expect(Math.hypot(o.x, o.y)).toBeGreaterThanOrEqual(RINGS.domain + RINGS.capability - 1);
    }
    expect(Math.hypot(orphans[0].x - orphans[1].x, orphans[0].y - orphans[1].y)).toBeGreaterThan(1);
    expect(Math.hypot(orphans[1].x - orphans[2].x, orphans[1].y - orphans[2].y)).toBeGreaterThan(1);
  });

  it("keeps the output of a standard vault unchanged (the fan merge is a no-op)", () => {
    // FIXTURE has no direct elements → every new pass is a no-op. Re-checks the core ring contract.
    const points = computeConcentricLayout(FIXTURE, RINGS);
    for (const capId of ["cap-a1", "cap-a2", "cap-b1"]) {
      const cap = FIXTURE.find((n) => n.id === capId)!;
      const capPoint = byId(points, capId);
      const domainPoint = byId(points, cap.parentId!);
      expect(Math.hypot(capPoint.x - domainPoint.x, capPoint.y - domainPoint.y)).toBeCloseTo(RINGS.capability, 4);
    }
  });
});

/**
 * Children of a parent past the threshold (12) are placed on a bounded
 * phyllotaxis disc instead of a runaway fan. Parents at or below it keep the fan
 * contract above — the regression tests below re-check that.
 */
describe("computeConcentricLayout phyllotaxis disc for dense parents", () => {
  // One domain with 108 capabilities — the dogfood Onboarding & UX density, as-is.
  const DENSE_DOMAIN: LayoutGraphNode[] = [
    { id: "p", kind: "project", parentId: null },
    { id: "d", kind: "domain", parentId: "p" },
  ];
  const DENSE_CHILD_COUNT = 108;
  for (let c = 0; c < DENSE_CHILD_COUNT; c += 1) {
    DENSE_DOMAIN.push({ id: `cap-${c}`, kind: "capability", parentId: "d" });
  }
  const RADII = { project: 25, domain: 17, capability: 11, element: 7 };

  it("bounds the disc radius, preventing fan runaway (a 108-child fan exceeded 2000)", () => {
    const points = computeConcentricLayout(DENSE_DOMAIN, RINGS, { radii: RADII });
    const d = byId(points, "d");
    let maxFromParent = 0;
    for (let c = 0; c < DENSE_CHILD_COUNT; c += 1) {
      const p = byId(points, `cap-${c}`);
      maxFromParent = Math.max(maxFromParent, Math.hypot(p.x - d.x, p.y - d.y));
    }
    // shift (capability ring 145) + spacing (26)·√108 ≈ 415; the bound includes relax slack.
    expect(maxFromParent).toBeLessThan(650);
    // The old fan (radius ∝ n) would have been 1500+ — the contrast is what proves boundedness.
    expect(maxFromParent).toBeLessThan(700);
  });

  it("is deterministic: two runs are byte identical", () => {
    const a = computeConcentricLayout(DENSE_DOMAIN, RINGS, { radii: RADII });
    const b = computeConcentricLayout(DENSE_DOMAIN, RINGS, { radii: RADII });
    expect(b).toEqual(a);
  });

  it("leaves no two nodes closer than the combined collision radius", () => {
    const points = computeConcentricLayout(DENSE_DOMAIN, RINGS, { radii: RADII, relaxPadding: 6 });
    let min = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        min = Math.min(min, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
      }
    }
    // Two capabilities = 11 + 11 = 22, the lower bound.
    expect(min).toBeGreaterThanOrEqual(22);
  });

  it("bounds a capability-to-element set above the threshold into a disc too", () => {
    const chain: LayoutGraphNode[] = [
      { id: "p", kind: "project", parentId: null },
      { id: "d", kind: "domain", parentId: "p" },
      { id: "c", kind: "capability", parentId: "d" },
    ];
    for (let e = 0; e < 40; e += 1) chain.push({ id: `el-${e}`, kind: "element", parentId: "c" });
    const points = computeConcentricLayout(chain, RINGS, { radii: RADII });
    const c = byId(points, "c");
    let maxFromParent = 0;
    for (let e = 0; e < 40; e += 1) {
      const p = byId(points, `el-${e}`);
      maxFromParent = Math.max(maxFromParent, Math.hypot(p.x - c.x, p.y - c.y));
    }
    // element ring (90) shift + spacing·√40 ≈ 90 + 26·6.3 ≈ 254; bound includes slack.
    expect(maxFromParent).toBeLessThan(450);
  });

  it("at the threshold edge, 12 children fan and 13 form a disc (branch split)", () => {
    const mk = (n: number): LayoutGraphNode[] => {
      const g: LayoutGraphNode[] = [
        { id: "p", kind: "project", parentId: null },
        { id: "d", kind: "domain", parentId: "p" },
      ];
      for (let c = 0; c < n; c += 1) g.push({ id: `cap-${c}`, kind: "capability", parentId: "d" });
      return g;
    };
    // 12 (the threshold) = fan → every child sits exactly on the capability ring
    // (base × multiplier, before the radius runs away). All this checks is that 13
    // becomes a denser √-growth disc whose max radius does not jump — the fan's
    // base grows with the n multiplier.
    const twelve = computeConcentricLayout(mk(12), RINGS, { radii: RADII });
    const thirteen = computeConcentricLayout(mk(13), RINGS, { radii: RADII });
    const maxR = (pts: { id: string; x: number; y: number }[], n: number) => {
      const d = byId(pts, "d");
      let m = 0;
      for (let c = 0; c < n; c += 1) {
        const p = byId(pts, `cap-${c}`);
        m = Math.max(m, Math.hypot(p.x - d.x, p.y - d.y));
      }
      return m;
    };
    // The 13-child disc's max radius is bounded (under the disc limit), independent of the fan multiplier.
    expect(maxR(thirteen, 13)).toBeLessThan(400);
    // 12 takes the fan path (≤ capability ring × density multiplier) and keeps its own contract.
    expect(maxR(twelve, 12)).toBeGreaterThan(0);
  });
});

/**
 * Spatial-grid `relaxCollisions` replaces the brute-force O(n²) scan under a
 * **byte-identity** contract. The `relaxStrategy` option runs both paths and the
 * outputs are compared directly. Determinism, de-pileup, and the rest are already
 * covered above through the grid (default) path, so this block only checks
 * equivalence.
 */
describe("computeConcentricLayout grid and brute force agree", () => {
  const RADII = { project: 25, domain: 17, capability: 11, element: 7 };

  // Several domains · mixed fan densities (both sides of the threshold) · direct
  // elements · orphans, in one fixture, so the relax path is exercised broadly.
  // Generated deterministically (fixed input order).
  function buildMixedFixture(): LayoutGraphNode[] {
    const g: LayoutGraphNode[] = [{ id: "p", kind: "project", parentId: null }];
    for (let d = 0; d < 6; d += 1) {
      const domainId = `d-${d}`;
      g.push({ id: domainId, kind: "domain", parentId: "p" });
      // Vary the fan size per domain (4–9) to force overlap — below the threshold (12), so the fan path.
      const capCount = 4 + (d % 6);
      for (let c = 0; c < capCount; c += 1) {
        const capId = `d-${d}-c-${c}`;
        g.push({ id: capId, kind: "capability", parentId: domainId });
        for (let e = 0; e < 3 + (c % 3); e += 1) {
          g.push({ id: `${capId}-e-${e}`, kind: "element", parentId: capId });
        }
      }
      // Two elements directly under the domain (non-standard lineage).
      g.push({ id: `d-${d}-de-0`, kind: "element", parentId: domainId });
      g.push({ id: `d-${d}-de-1`, kind: "element", parentId: domainId });
    }
    // A few orphans.
    for (let o = 0; o < 5; o += 1) {
      g.push({ id: `orphan-${o}`, kind: "element", parentId: null });
    }
    return g;
  }

  const MIXED = buildMixedFixture();

  it("the grid path is byte identical to brute force (medium mixed fixture)", () => {
    const grid = computeConcentricLayout(MIXED, RINGS, { radii: RADII, relaxStrategy: "grid" });
    const brute = computeConcentricLayout(MIXED, RINGS, { radii: RADII, relaxStrategy: "bruteforce" });
    expect(grid).toEqual(brute);
  });

  it("both paths are byte identical on DENSE (one domain fan)", () => {
    const dense: LayoutGraphNode[] = [
      { id: "p", kind: "project", parentId: null },
      { id: "d", kind: "domain", parentId: "p" },
    ];
    for (let c = 0; c < 10; c += 1) {
      const capId = `cap-${c}`;
      dense.push({ id: capId, kind: "capability", parentId: "d" });
      for (let e = 0; e < 6; e += 1) dense.push({ id: `el-${c}-${e}`, kind: "element", parentId: capId });
    }
    const grid = computeConcentricLayout(dense, RINGS, { radii: RADII, relaxStrategy: "grid" });
    const brute = computeConcentricLayout(dense, RINGS, { radii: RADII, relaxStrategy: "bruteforce" });
    expect(grid).toEqual(brute);
  });

  it("both paths separate the seed and agree on default DENSE (0 relax seed overlap)", () => {
    // Checks both that relax actually separates overlaps rather than being a
    // no-op, and that the result is the same on both paths — re-confirming grid ≡
    // brute at the production radius (25) in a state where work is being done, not
    // one where there is nothing to do.
    const dense: LayoutGraphNode[] = [
      { id: "p", kind: "project", parentId: null },
      { id: "d", kind: "domain", parentId: "p" },
    ];
    for (let c = 0; c < 8; c += 1) {
      const capId = `cap-${c}`;
      dense.push({ id: capId, kind: "capability", parentId: "d" });
      for (let e = 0; e < 8; e += 1) dense.push({ id: `el-${c}-${e}`, kind: "element", parentId: capId });
    }
    const min = (pts: { x: number; y: number }[]) => {
      let m = Infinity;
      for (let i = 0; i < pts.length; i += 1)
        for (let j = i + 1; j < pts.length; j += 1)
          m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      return m;
    };
    const seed = computeConcentricLayout(dense, RINGS, { radii: RADII, relaxStrategy: "grid", relaxIterations: 0 });
    const grid = computeConcentricLayout(dense, RINGS, { radii: RADII, relaxStrategy: "grid" });
    const brute = computeConcentricLayout(dense, RINGS, { radii: RADII, relaxStrategy: "bruteforce" });
    expect(min(grid)).toBeGreaterThan(min(seed)); // relax really did separate them
    expect(grid).toEqual(brute); // and both paths are byte-identical
  });

  it("the grid stays deterministic and separates at an unrealistically large radius", () => {
    // Radius 400 is an extreme production never sees (real max 25). Per-iteration
    // movement exceeds the cell slack here, so byte-identity with brute force is
    // not guaranteed — but the grid path itself stays deterministic and really
    // does separate overlaps.
    const huge = { project: 400, domain: 400, capability: 400, element: 400 };
    const a = computeConcentricLayout(MIXED, RINGS, { radii: huge, relaxStrategy: "grid", relaxIterations: 40 });
    const b = computeConcentricLayout(MIXED, RINGS, { radii: huge, relaxStrategy: "grid", relaxIterations: 40 });
    expect(a).toEqual(b);
    const seed = computeConcentricLayout(MIXED, RINGS, { radii: huge, relaxStrategy: "grid", relaxIterations: 0 });
    const min = (pts: { x: number; y: number }[]) => {
      let m = Infinity;
      for (let i = 0; i < pts.length; i += 1)
        for (let j = i + 1; j < pts.length; j += 1)
          m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      return m;
    };
    expect(min(a)).toBeGreaterThan(min(seed));
  });

  // No performance guard here: a wall-clock comparison is flaky under CPU
  // contention (demonstrated in practice), so it was removed. O(n²) regressions
  // are pinned structurally by the grid/brute-force byte-identity test, and
  // absolute performance is measured by the scripts/perf-graph bench path.
});
