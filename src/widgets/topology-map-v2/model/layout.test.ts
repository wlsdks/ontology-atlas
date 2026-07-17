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
 * De-pileup / determinism contract (Design Guardian 충실도 반려): the static
 * default must be a clean deterministic grid, NOT an FA2 settlement. The
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
