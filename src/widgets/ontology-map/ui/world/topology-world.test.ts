import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";

import { computeConcentricLayout } from "../../model/layout/layout";
import { resolveDialTokens } from "../../dial/tokens";
import type { DialLabels, DialMemory, DialWorldInput } from "../../dial/dial-shapes";
import { resolveFlatGraphTokens } from "../../flat-graph/tokens";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildTopologyWorld, computeMagnitudeScale, type TopologyWorld, containmentLevelFor } from "./topology-world";
import { computeDrawnSpineBounds, computeRevealedBounds } from "./framing/world-bounds";
import { computeFoldedIds } from "./framing/density-fold";
import { dialOverviewFit, dialFocusFrame } from "./framing/dial-world-framing";
import { recomputeWorldGeometry } from "./geometry/world-geometry";
import type { OntologyMapEdge, OntologyMapNode } from "../OntologyMap";
import { computeTopologyClusterState } from "./cluster/topology-cluster-state";

vi.mock("../../model/layout/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../model/layout/layout")>();
  return { ...actual, computeConcentricLayout: vi.fn(actual.computeConcentricLayout) };
});

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
    let previous = 0;
    for (const c of [1, 5, 20, 60, 103]) {
      const v = computeMagnitudeScale("capability", c, 103, 0.45);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it("defensive: maxChildCount 0, childCount 0 and k 0 all give 1", () => {
    expect(computeMagnitudeScale("domain", 0, 103, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 10, 0, 0.45)).toBe(1);
    expect(computeMagnitudeScale("domain", 10, 103, 0)).toBe(1);
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
        expect(dialOverviewFit(world)).toEqual({ padPx: dial.overviewPadPx, scaleFloor: 0.01, labelBottomAllowance: 0 });
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

    /** A fresh page's world builder, and a hand-turned browser: `turn()` resumes every slice waiting for one. */
    async function freshBuilder() {
        vi.resetModules();
        const world = await import("./topology-world");
        const { runStepsSliced } = await import("./lifecycle/run-steps-sliced");
        const forceAtlas2 = (await import("graphology-layout-forceatlas2")).default;
        let clock = 0;
        let waiting: (() => void)[] = [];
        const options = {
            budgetMs: 8,
            now: () => (clock += 1),
            yieldNow: () => new Promise<void>((resolve) => waiting.push(resolve)),
        };
        const turn = async () => {
            const ready = waiting;
            waiting = [];
            for (const resolve of ready) resolve();
            await Promise.resolve();
            await Promise.resolve();
            return ready.length;
        };
        const fail = (error: unknown) => {
            throw error;
        };
        const sliced = (onDone: (built: TopologyWorld) => void, graph = folder) =>
            runStepsSliced(world.buildTopologyWorldSteps(graph.nodes, graph.edges, mapTokens, "disc", input(null)), onDone, fail, options);
        return { ...world, forceAtlas2, sliced, turn };
    }
    const placesOf = (world: TopologyWorld) => world.nodes.map((n) => [n.id, n.x, n.y]);

    it("builds the world in more than one slice and lands it where the synchronous build does", async () => {
        const once = (await freshBuilder()).buildTopologyWorld(folder.nodes, folder.edges, mapTokens, "disc", input(null));
        const { sliced, turn } = await freshBuilder();
        let built: TopologyWorld | null = null;
        sliced((world) => (built = world));
        let slices = 1;
        while (built === null && (await turn()) > 0) slices += 1;
        expect(slices).toBeGreaterThan(1);
        expect(placesOf(built!)).toEqual(placesOf(once));
    });

    it("never swaps in a superseded build, and the build after it resumes its layout instead of repeating it", async () => {
        const fresh = await freshBuilder();
        const assign = vi.spyOn(fresh.forceAtlas2, "assign");
        const once = fresh.buildTopologyWorld(folder.nodes, folder.edges, mapTokens, "disc", input(null));
        const fullLayoutRuns = assign.mock.calls.length;
        assign.mockRestore();

        const { sliced, turn, forceAtlas2 } = await freshBuilder();
        const counted = vi.spyOn(forceAtlas2, "assign");
        const swapped: string[] = [];
        let superseded = 0;
        const cancel = sliced(() => (superseded += 1));
        for (let k = 0; k < 1000 && counted.mock.calls.length === 0; k += 1) await turn();
        expect(counted.mock.calls.length).toBeGreaterThan(0);
        cancel();
        let latest: TopologyWorld | null = null;
        sliced((world) => {
            swapped.push("latest");
            latest = world;
        });
        while ((await turn()) > 0);
        const runs = counted.mock.calls.length;
        counted.mockRestore();
        expect(superseded).toBe(0);
        expect(swapped).toEqual(["latest"]);
        expect(runs).toBe(fullLayoutRuns);
        expect(placesOf(latest!)).toEqual(placesOf(once));
    });

    it("lays out a different folder from its own start when a build of another folder was cancelled mid-layout", async () => {
        const once = (await freshBuilder()).buildTopologyWorld(folder.nodes, folder.edges, mapTokens, "disc", input(null));
        const { sliced, turn, forceAtlas2 } = await freshBuilder();
        const counted = vi.spyOn(forceAtlas2, "assign");
        const cancel = sliced(() => undefined, partOf(2));
        for (let k = 0; k < 1000 && counted.mock.calls.length === 0; k += 1) await turn();
        expect(counted.mock.calls.length).toBeGreaterThan(0);
        counted.mockRestore();
        cancel();
        let latest: TopologyWorld | null = null;
        sliced((world) => (latest = world));
        while ((await turn()) > 0);
        expect(placesOf(latest!)).toEqual(placesOf(once));
    });

    it("draws one folder as one picture however it was opened: after the bundled sample, streamed, or reopened", async () => {
        const oneShot = await open(null, [folder], null);
        const afterSample = await open(readOf(storefrontManifest), [folder], null);
        const streamed = await open(null, [partOf(4), partOf(2), folder], null);
        const reopened = await open(null, [folder], afterSample.memory);
        for (const [how, scene] of Object.entries({ afterSample, streamed, reopened })) {
            const drift = Math.max(...[...oneShot.positions].map(([id, at]) => Math.hypot(scene.positions.get(id)!.x - at.x, scene.positions.get(id)!.y - at.y)));
            expect.soft(drift, `${how}: farthest drift from the one-shot open`).toBeLessThan(1e-6);
        }
    });
});
