import { describe, expect, it } from "vitest";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../model/containment-tree";
import { buildDialModel } from "./dial-model";
import { chordControl, layoutDial } from "./layout";
import type { DialModel, DialScene } from "./types";

const tokens = {
  ringMin: 300,
  ringSingleRowMax: 430,
  rowGap: 17,
  pitch: 26,
  pitchMin: 11,
  pitchMax: 33.8,
  rowsMax: 4,
  sectorGap: 0.11,
  chipSlots: 1.8,
  hubClearance: 92,
  elementStart: 18,
  elementPitch: 9,
  orphanGap: 160,
  orphanPitch: 11,
  orphanRow: 30,
  chordHubMargin: 30,
  chordDepth: 0.8,
  chordBow: 1.4,
};

function vault(domainCount: number, capsOf: (i: number) => number, elementsOf: (i: number, c: number) => number) {
  const nodes: TreeInputNode[] = [{ id: "p", label: "P", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const add = (id: string, kind: TreeInputNode["kind"], parent: string) => {
    nodes.push({ id, label: id, kind });
    edges.push({ source: parent, target: id, kind: "contains", relationType: "contains" });
  };
  for (let i = 0; i < domainCount; i += 1) {
    const d = `d${String(i).padStart(2, "0")}`;
    add(d, "domain", "p");
    for (let c = 0; c < capsOf(i); c += 1) {
      const cap = `${d}-c${String(c).padStart(3, "0")}`;
      add(cap, "capability", d);
      for (let e = 0; e < elementsOf(i, c); e += 1) add(`${cap}-e${e}`, "element", cap);
    }
  }
  add("d00-held", "element", "d00");
  nodes.push({ id: "stray", label: "stray", kind: "element" });
  for (let i = 0; i + 1 < domainCount; i += 1) {
    edges.push({ source: `d${String(i).padStart(2, "0")}-c000`, target: `d${String(i + 1).padStart(2, "0")}-c000`, kind: "depends", relationType: "depends_on" });
  }
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  const flows = rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges));
  const model = buildDialModel({ tree, dependencies, flows, elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id) });
  return { model, nodes };
}

const sorted = (model: DialModel) => model.domains.map((d) => d.id);

function sameRowPairs(scene: DialScene) {
  const petals = [...scene.petalById.values()].sort((a, b) => a.row - b.row || a.angle - b.angle);
  const out: [number, number, number][] = [];
  for (let k = 1; k < petals.length; k += 1) {
    const p = petals[k - 1]!;
    const q = petals[k]!;
    if (p.row === q.row) out.push([p.radius, p.angle, q.angle]);
  }
  return out;
}

describe("layoutDial", () => {
  const small = vault(6, (i) => 2 + i, (i, c) => (c + i) % 4);
  const scene = layoutDial(small.model, sorted(small.model), tokens);

  it("spans sectors by demand with equal gaps", () => {
    const demand = scene.sectors.map((s) => {
      const d = small.model.domainById.get(s.domainId)!;
      const slots = d.capabilityIds.length + (d.directElementIds.length > 0 ? 1 : 0);
      return Math.max(2, slots / s.rows) + tokens.chipSlots;
    });
    const spans = scene.sectors.map((s) => s.end - s.start);
    for (let k = 1; k < spans.length; k += 1) expect(spans[k]! / spans[0]!).toBeCloseTo(demand[k]! / demand[0]!, 9);
    for (let k = 1; k < scene.sectors.length; k += 1) {
      expect(scene.sectors[k]!.start - scene.sectors[k - 1]!.end).toBeCloseTo(tokens.sectorGap, 9);
    }
    const last = scene.sectors[scene.sectors.length - 1]!;
    expect(scene.sectors[0]!.start + Math.PI * 2 - last.end).toBeCloseTo(tokens.sectorGap, 9);
  });

  it("centres the first domain at 12 o'clock with its chip at the arc middle", () => {
    const first = scene.sectors[0]!;
    expect(first.angle).toBeCloseTo(-Math.PI / 2, 9);
    expect(first.chip.x).toBeCloseTo(0, 9);
    expect(first.chip.y).toBeCloseTo(-scene.ringRadius, 9);
    for (const s of scene.sectors) {
      expect(s.angle).toBeCloseTo((s.start + s.end) / 2, 9);
      expect(scene.positions.get(s.domainId)).toEqual(s.chip);
    }
  });

  it("alternates petals by element weight, heaviest beside the chip", () => {
    const sector = scene.sectorByDomain.get("d03")!;
    const right = sector.petals.filter((p) => p.angle > sector.angle).sort((a, b) => a.angle - b.angle);
    const left = sector.petals.filter((p) => p.angle < sector.angle).sort((a, b) => b.angle - a.angle);
    expect(right.length - left.length).toBeGreaterThanOrEqual(0);
    expect(right.length - left.length).toBeLessThanOrEqual(1);
    const weights = sector.petals.map((p) => p.elementIds.length).sort((a, b) => b - a);
    expect(right[0]!.elementIds.length).toBe(weights[0]);
    expect(left[0]!.elementIds.length).toBe(weights[1]);
  });

  it("adds rows only past the single-row ring, and never shrinks below the minimum ring", () => {
    expect(scene.ringRadius).toBeGreaterThanOrEqual(tokens.ringMin);
    expect(scene.sectors.every((s) => s.rows === 1)).toBe(true);
    const big = vault(20, () => 30, () => 1);
    const wide = layoutDial(big.model, sorted(big.model), tokens);
    expect(wide.sectors[0]!.rows).toBeGreaterThan(1);
    expect(wide.ringRadius).toBeGreaterThanOrEqual(tokens.ringMin);
    for (const [r, a, b] of sameRowPairs(wide)) expect(r * Math.abs(b - a)).toBeGreaterThanOrEqual(tokens.pitchMin - 1e-9);
  });

  it("keeps same-row neighbours at least the minimum pitch apart", () => {
    for (const [r, a, b] of sameRowPairs(scene)) expect(r * Math.abs(b - a)).toBeGreaterThanOrEqual(tokens.pitchMin - 1e-9);
  });

  it("places every concept inside the extent", () => {
    for (const n of small.nodes) {
      const p = scene.positions.get(n.id);
      expect(p, n.id).toBeDefined();
      expect(p!.x).toBeGreaterThanOrEqual(scene.extent.minX);
      expect(p!.x).toBeLessThanOrEqual(scene.extent.maxX);
      expect(p!.y).toBeGreaterThanOrEqual(scene.extent.minY);
      expect(p!.y).toBeLessThanOrEqual(scene.extent.maxY);
    }
    expect(scene.orphans).toEqual(["stray"]);
    expect(scene.positions.get("stray")!.y).toBeCloseTo(scene.outerRadius + tokens.orphanGap, 9);
    expect(scene.positions.get("p")).toEqual({ x: 0, y: 0 });
  });

  it("pulls a neighbour pair's control nearer the ring than an opposite pair's", () => {
    const angle = (id: string) => scene.sectorByDomain.get(id)!.angle;
    for (const flow of small.model.flows) {
      expect(scene.controls.get(flow.key)).toEqual(chordControl(scene.ringRadius, angle(flow.a), angle(flow.b), tokens));
    }
    const apexDepth = (a: string, b: string) => {
      const c = chordControl(scene.ringRadius, angle(a), angle(b), tokens);
      const pa = scene.sectorByDomain.get(a)!.chip;
      const pb = scene.sectorByDomain.get(b)!.chip;
      return scene.ringRadius - Math.hypot((pa.x + 2 * c.x + pb.x) / 4, (pa.y + 2 * c.y + pb.y) / 4);
    };
    expect(apexDepth("d00", "d01")).toBeLessThan(apexDepth("d00", "d03"));
  });

  it("is deterministic", () => {
    expect(layoutDial(small.model, sorted(small.model), tokens)).toEqual(scene);
  });
});

