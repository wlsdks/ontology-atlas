import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TreeInputEdge, TreeInputNode } from "./containment-tree";
import { computeHexBoard, type HexBoardLayout } from "./hex-board";
import { buildHexLattice, HexFocusRoutes, HexRouteRun, HexRouter, layCanals, type HexRouteJob } from "./hex-router";

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

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function seededBoard(caps: number, doms: number, seed: number, hub: boolean): HexBoardLayout {
  const r = seeded(seed);
  const nodes: TreeInputNode[] = [{ id: "project:p", label: "P", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  for (let d = 0; d < doms; d++) {
    nodes.push({ id: `domain:d${d}`, label: `D${d}`, kind: "domain" });
    edges.push({ source: "project:p", target: `domain:d${d}`, kind: "contains", relationType: "contains" });
  }
  for (let c = 0; c < caps; c++) {
    nodes.push({ id: `capability:c${c}`, label: `C${c}`, kind: "capability" });
    edges.push({ source: `domain:d${Math.floor(r() * doms)}`, target: `capability:c${c}`, kind: "contains", relationType: "contains" });
  }
  for (let c = 0; c < caps; c++) {
    const k = Math.floor(r() * 4);
    for (let j = 0; j < k; j++) {
      const t = Math.floor(r() * caps);
      if (t !== c) edges.push({ source: `capability:c${c}`, target: `capability:c${t}`, kind: "depends", relationType: "depends_on" });
    }
    if (hub && c > 0) edges.push({ source: `capability:c${c}`, target: "capability:c0", kind: "depends", relationType: "depends_on" });
  }
  return computeHexBoard(nodes, edges);
}

describe("the router against the one it replaced", () => {
  const golden: [number, number, number, boolean, number, { routes: number; canals: number; hash: string }][] = [
    [40, 3, 4, true, 0, { routes: 196, canals: 3, hash: "b522aeff72ae9196a46188eb" }],
    [300, 12, 6, false, 0.15, { routes: 188, canals: 66, hash: "c7bcdc1ec984d93f8ee07f99" }],
    [300, 12, 7, true, 0.35, { routes: 258, canals: 66, hash: "f5041521e206cbd9c96db5ee" }],
    [800, 30, 8, true, 0.05, { routes: 230, canals: 399, hash: "4da8a5bddda95d1980fc2747" }],
  ];

  it.each(golden)("lays every route and canal of a %i-capability board exactly as before", (caps, doms, seed, hub, blockFrac, expected) => {
    const layout = seededBoard(caps, doms, seed, hub);
    const lattice = buildHexLattice(layout);
    const r = seeded(seed * 7 + 1);
    const blocked = blockFrac > 0 ? new Uint8Array(lattice.xs.length) : null;
    if (blocked) for (let i = 0; i < blocked.length; i++) if (r() < blockFrac) blocked[i] = 1;
    const hash = createHash("sha256");
    let routes = 0;
    for (const tile of layout.capabilities.slice(0, 60)) {
      const router = new HexRouter(lattice, 1.15, blocked);
      for (const d of layout.dependencies.filter((x) => x.from === tile.id)) {
        const route = router.route([tile.id], [d.to], `need:${layout.byId.get(d.to)?.domainId}`);
        hash.update(JSON.stringify(route ? [route.nodes, route.sourceId, route.targetId, route.stub === true] : null));
        routes += 1;
      }
      for (const d of layout.dependencies.filter((x) => x.to === tile.id)) {
        const route = router.route([d.from], [tile.id], "use");
        hash.update(JSON.stringify(route ? [route.nodes, route.sourceId, route.targetId, route.stub === true] : null));
        routes += 1;
      }
    }
    const canals = layCanals(layout, lattice, blocked, Infinity).map((c) => [c.nodes, c.sourceId, c.targetId, c.stub === true, c.count, c.twoWay]);
    hash.update(JSON.stringify(canals));
    expect({ routes, canals: canals.length, hash: hash.digest("hex").slice(0, 24) }).toEqual(expected);
  });
});

describe("a focus's routes across route frames", () => {
  const layout = board(220, 9);
  const lattice = buildHexLattice(layout);
  const jobsFor = (id: string): HexRouteJob<"need" | "use">[] => [
    ...layout.dependencies.filter((d) => d.from === id).map((d) => ({ from: [id], to: [d.to], bundle: "need", role: "need" as const })),
    ...layout.dependencies.filter((d) => d.to === id).map((d) => ({ from: [d.from], to: [id], bundle: "use", role: "use" as const })),
  ];
  const busiest = [...layout.capabilities].sort((a, b) => jobsFor(b.id).length - jobsFor(a.id).length);

  it("keep the last laid routes while a new frame lays them, and drop them for a new focus", () => {
    const focusA = { id: busiest[0]!.id };
    const jobsA = jobsFor(focusA.id);
    expect(jobsA.length).toBeGreaterThan(3);
    const layer = new HexFocusRoutes<"need" | "use">();
    const first = layer.lay(lattice, focusA, jobsA, null, 1.15, Infinity);
    expect(first.pending).toBe(false);
    expect(first.routes.length).toBeGreaterThan(0);

    let time = 0;
    const slow = () => (time += 10);
    const moved = new Uint8Array(lattice.xs.length);
    const relaying = layer.lay(lattice, focusA, jobsA, moved, 1.15, 1, slow);
    expect(relaying.pending).toBe(true);
    expect(relaying.routes).toBe(first.routes);

    let settled = relaying;
    while (settled.pending) settled = layer.lay(lattice, focusA, jobsA, moved, 1.15, time + 1, slow);
    expect(shape(settled.routes)).toEqual(shape(first.routes));

    const focusB = { id: focusA.id };
    const switching = layer.lay(lattice, focusB, jobsFor(focusB.id), moved, 1.15, time + 1, slow);
    expect(switching.pending).toBe(true);
    expect(switching.routes).toEqual([]);
  });
});
