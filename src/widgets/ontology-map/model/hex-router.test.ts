import { afterEach, describe, expect, it, vi } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "./containment-tree";
import { computeHexBoard, type HexBoardLayout } from "./hex-board";
import { buildHexLattice, HexRouteRun, HexRouter, layCanals, type HexRouteJob } from "./hex-router";

function board(capabilityCount: number, domainCount: number): HexBoardLayout {
  const nodes: TreeInputNode[] = [{ id: "project:p", label: "Project", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  for (let d = 0; d < domainCount; d++) {
    nodes.push({ id: `domain:d${d}`, label: `Domain ${d}`, kind: "domain" });
    edges.push({ source: "project:p", target: `domain:d${d}`, kind: "contains", relationType: "contains" });
  }
  for (let c = 0; c < capabilityCount; c++) {
    const id = `capability:c${c}`;
    nodes.push({ id, label: `Capability ${c}`, kind: "capability" });
    edges.push({ source: `domain:d${c % domainCount}`, target: id, kind: "contains", relationType: "contains" });
    for (const hop of [7, 31, 113]) {
      if (c < hop) continue;
      edges.push({ source: id, target: `capability:c${(c * hop) % c}`, kind: "depends", relationType: "depends_on" });
    }
  }
  return computeHexBoard(nodes, edges);
}

const shape = (routes: readonly { nodes: readonly number[]; sourceId: string; targetId: string; stub?: boolean }[]) =>
  routes.map((r) => ({ nodes: [...r.nodes], sourceId: r.sourceId, targetId: r.targetId, stub: r.stub === true }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routes laid a slice at a time", () => {
  const layout = board(220, 9);
  const lattice = buildHexLattice(layout);
  const hub = layout.capabilities.reduce((best, c) =>
    layout.dependencies.filter((d) => d.to === c.id).length > layout.dependencies.filter((d) => d.to === best.id).length ? c : best,
  );
  const jobs: HexRouteJob<"need" | "use">[] = [
    ...layout.dependencies.filter((d) => d.from === hub.id).map((d) => ({ from: [hub.id], to: [d.to], bundle: "need", role: "need" as const })),
    ...layout.dependencies.filter((d) => d.to === hub.id).map((d) => ({ from: [d.from], to: [hub.id], bundle: "use", role: "use" as const })),
  ];

  it("lay the same routes as one call, one route per slice when every route outlasts the budget", () => {
    expect(jobs.length).toBeGreaterThan(5);
    const whole = new HexRouter(lattice, 1.15, null);
    const laid = jobs.map((j) => whole.route(j.from, j.to, j.bundle));
    const expected = laid.filter((r) => r !== null);

    const run = new HexRouteRun(lattice, jobs, 1.15, null);
    let time = 0;
    const clock = () => (time += 10);
    let slices = 0;
    while (!run.advance(time + 1, clock)) slices += 1;
    expect(slices + 1).toBe(jobs.length);
    expect(shape(run.routes)).toEqual(shape(expected));
    expect(run.routes.map((r) => r.role)).toEqual(jobs.filter((_, i) => laid[i] !== null).map((j) => j.role));
  });
});

describe("canals", () => {
  const layout = board(400, 18);
  const lattice = buildHexLattice(layout);

  it("are laid only as far as the drawn few, which come out as they do with every canal laid", () => {
    expect(layout.canals.length).toBeGreaterThan(12);
    const all = layCanals(layout, lattice, null, Infinity);
    const route = vi.spyOn(HexRouter.prototype, "route");
    const drawn = layCanals(layout, lattice, null, 6);
    expect(drawn).toHaveLength(6);
    expect(route.mock.calls.length).toBeLessThan(layout.canals.length);
    expect(shape(drawn)).toEqual(shape(all.slice(0, 6)));
    expect(drawn.map((c) => [c.count, c.twoWay])).toEqual(all.slice(0, 6).map((c) => [c.count, c.twoWay]));
  });
});
