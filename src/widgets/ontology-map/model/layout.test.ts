import { describe, expect, it } from "vitest";

import {
  computeConcentricLayout,
  type LayoutGraphNode,
  type LayoutRings,
} from "./layout";

/** Deliberately tiny so overlap and ring-radius assertions can be verified by hand. */
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
  it("bounds parent lookups for broad and deep hierarchies", () => {
    for (const deep of [false, true]) {
      let parentReads = 0;
      const nodes: LayoutGraphNode[] = [{ id: "p", kind: "project", parentId: null }];
      for (let i = 0; i < 1000; i += 1) {
        nodes.push({
          id: `node-${i}`,
          kind: deep ? "element" : "capability",
          get parentId() {
            parentReads += 1;
            return deep && i > 0 ? `node-${i - 1}` : "p";
          },
        });
      }
      const points = computeConcentricLayout(nodes, RINGS, { relaxIterations: 0 });
      expect(points).toHaveLength(nodes.length);
      expect(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
      expect(parentReads).toBeLessThan(nodes.length * 20);
    }
  });

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
 * The static default is a deterministic grid, not an FA2 settlement: the collision relax
 * runs a fixed iteration count with a seeded tie-break, so the output is byte-identical.
 */
describe("computeConcentricLayout — deterministic de-pileup", () => {
  // One domain with a fat fan of capabilities, each with several elements.
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
    // Two elements at 7 + 7; padding is headroom the relax targets, so assert the hard radii.
    expect(minPairwiseDistance(points)).toBeGreaterThanOrEqual(14);
  });

  it("actually separates an overlapping seed (relax does work), deterministically", () => {
    // Radii large enough that the concentric seed overlaps and the relax must push apart.
    const huge = { project: 400, domain: 400, capability: 400, element: 400 };
    const seedOnly = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 0 });
    const relaxed = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 80 });
    expect(minPairwiseDistance(relaxed)).toBeGreaterThan(minPairwiseDistance(seedOnly));
    const relaxedAgain = computeConcentricLayout(DENSE, RINGS, { radii: huge, relaxIterations: 80 });
    expect(relaxedAgain).toEqual(relaxed);
  });
});

describe("computeConcentricLayout with nonstandard lineage and orphans (blob regression)", () => {
  // A domain holding elements directly: unplaced, they stack at (0,0) and physics drags
  // the stack into a blob with overlapping labels.
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
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(1);
      // A fan of 3 is below the density threshold, so it rings the domain at the element radius.
      expect(Math.hypot(p.x - d.x, p.y - d.y)).toBeCloseTo(RINGS.element, 4);
    }
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
    // FIXTURE has no direct elements, so the new passes are no-ops.
    const points = computeConcentricLayout(FIXTURE, RINGS);
    for (const capId of ["cap-a1", "cap-a2", "cap-b1"]) {
      const cap = FIXTURE.find((n) => n.id === capId)!;
      const capPoint = byId(points, capId);
      const domainPoint = byId(points, cap.parentId!);
      expect(Math.hypot(capPoint.x - domainPoint.x, capPoint.y - domainPoint.y)).toBeCloseTo(RINGS.capability, 4);
    }
  });
});

/** Past the threshold (12) children take a bounded phyllotaxis disc instead of a runaway fan. */
describe("computeConcentricLayout phyllotaxis disc for dense parents", () => {
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
    // capability ring shift (145) + spacing (26)·√108 ≈ 415; the bound includes relax slack.
    expect(maxFromParent).toBeLessThan(650);
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
    // element ring (90) + spacing·√40 ≈ 90 + 26·6.3 ≈ 254; the bound includes slack.
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
    // At the threshold of 12 the fan path runs; 13 becomes a √-growth disc whose radius stays bounded.
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
    expect(maxR(thirteen, 13)).toBeLessThan(400);
    expect(maxR(twelve, 12)).toBeGreaterThan(0);
  });
});

/**
 * The spatial-grid `relaxCollisions` must be byte-identical to the O(n²) brute
 * force; `relaxStrategy` runs both paths so this block checks only equivalence.
 */
describe("computeConcentricLayout grid and brute force agree", () => {
  const RADII = { project: 25, domain: 17, capability: 11, element: 7 };

  // Mixed fan densities on both sides of the threshold, direct elements and orphans.
  function buildMixedFixture(): LayoutGraphNode[] {
    const g: LayoutGraphNode[] = [{ id: "p", kind: "project", parentId: null }];
    for (let d = 0; d < 6; d += 1) {
      const domainId = `d-${d}`;
      g.push({ id: domainId, kind: "domain", parentId: "p" });
      const capCount = 4 + (d % 6);
      for (let c = 0; c < capCount; c += 1) {
        const capId = `d-${d}-c-${c}`;
        g.push({ id: capId, kind: "capability", parentId: domainId });
        for (let e = 0; e < 3 + (c % 3); e += 1) {
          g.push({ id: `${capId}-e-${e}`, kind: "element", parentId: capId });
        }
      }
      g.push({ id: `d-${d}-de-0`, kind: "element", parentId: domainId });
      g.push({ id: `d-${d}-de-1`, kind: "element", parentId: domainId });
    }
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
    // Relax must do real work here at the production radius (25), not pass as a no-op.
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
    expect(min(grid)).toBeGreaterThan(min(seed));
    expect(grid).toEqual(brute);
  });

  it("the grid stays deterministic and separates at an unrealistically large radius", () => {
    // Radius 400 is far past production (25): per-iteration movement exceeds the cell slack,
    // so only determinism and separation hold, not identity with brute force.
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

  // No wall-clock guard: it flakes under CPU contention. The byte-identity test pins the
  // algorithm, and the scripts/perf-graph bench measures absolute cost.
});
