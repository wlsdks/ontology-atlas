import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildDialModel } from "../dial/dial-model";
import { clearDialFrame } from "../dial/frame/frame";
import type { DialFrameInput, DialLabels, DialModel, Point } from "../dial/dial-shapes";
import {
  directRelations, readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesCapabilityPairs, rollRelatesDomainPairs,
  type TreeInputEdge, type TreeInputNode,
} from "../model/containment-tree";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { paintFlatGraphFrame } from "./frame";
import { domainStarIds } from "./open-star";
import { buildFlatGraphScene } from "./scene";
import { resolveFlatGraphTokens } from "./tokens";
import { startWorkClock } from "../../../../tests/helpers/work-clock";

const W = 1410;
const H = 840;
const FRAME_MS = 1000 / 60;
type Free = { minX: number; minY: number; maxX: number; maxY: number };
/** The free map beside the closed dock at 1280x800, where a wide star opens at a low scale and its fans are pushed. */
const NARROW_FREE: Free = { minX: 324, minY: 112, maxX: 837, maxY: 728 };
const FULL_FREE: Free = { minX: 0, minY: 0, maxX: W, maxY: H };

function cssValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of ["app/styles/map-graph-tokens.css", "app/styles/tokens.css", "app/styles/base-map-tokens.css"]) {
    const css = readFileSync(join(process.cwd(), file), "utf8");
    for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) if (!values.has(m[1]!)) values.set(m[1]!, m[2]!.trim());
  }
  return values;
}

const TOKENS = resolveFlatGraphTokens((v) => cssValues().get(v) ?? "");
const LABELS: DialLabels = {
  units: (c, e) => `${c} capabilities · ${e} elements`, stale: (n) => `${n} stale`, orphans: (n) => `${n} unplaced`, more: (n) => `+${n}`,
  ring: () => "", reading: () => "", settling: () => "", linksShown: () => "",
};

function silentContext(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { globalCompositeOperation: "source-over", globalAlpha: 1, font: "10px sans-serif", lineWidth: 1 };
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (text) => ({ width: String(text).length * 6 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    getLineDash: () => [],
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  return new Proxy(state, {
    get: (target, key: string) => (key in methods ? methods[key] : key in target ? target[key] : () => undefined),
    set: (target, key: string, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** `domains` domains of `capsPer` capabilities with one to `2 * elsPer` elements each, and a web of needs. */
function syntheticModel(domains: number, capsPer: number, elsPer: number): DialModel {
  const nodes: TreeInputNode[] = [{ id: "project:p", label: "Project", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const caps: string[] = [];
  for (let d = 0; d < domains; d += 1) {
    const domainId = `domain:d${d}`;
    nodes.push({ id: domainId, label: `Domain number ${d}`, kind: "domain" });
    edges.push({ source: "project:p", target: domainId, kind: "contains", relationType: "contains" });
    for (let c = 0; c < capsPer; c += 1) {
      const capId = `capability:d${d}c${c}`;
      nodes.push({ id: capId, label: `Capability ${d} ${c} name`, kind: "capability" });
      edges.push({ source: domainId, target: capId, kind: "contains", relationType: "contains" });
      caps.push(capId);
      for (let e = 0; e < 1 + ((c * 7 + d * 3) % (2 * elsPer)); e += 1) {
        nodes.push({ id: `element:d${d}c${c}e${e}`, label: `Element ${d} ${c} ${e}`, kind: "element" });
        edges.push({ source: capId, target: `element:d${d}c${c}e${e}`, kind: "contains", relationType: "contains" });
      }
    }
  }
  caps.forEach((id, i) => {
    edges.push({ source: id, target: caps[(i * 37 + 11) % caps.length]!, kind: "depends", relationType: "depends_on" });
    if (i % 3 === 0) edges.push({ source: id, target: caps[(i * 53 + 5) % caps.length]!, kind: "depends", relationType: "depends_on" });
  });
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  return buildDialModel({
    tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)),
    elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id), relates: rollRelatesCapabilityPairs(tree, edges), direct: directRelations(edges),
  });
}

/** A camera on `centreId` in the free map `free`, at a zoom ratio of the scale that fits the map there, panned by `pan` px. */
function cameraOn(model: DialModel, centreId: string, free: Free) {
  const scene = buildFlatGraphScene(model, TOKENS.layout, null);
  const graph = scene.graph!;
  const e = graph.extent;
  const fit = Math.min((free.maxX - free.minX) / (e.maxX - e.minX), (free.maxY - free.minY) / (e.maxY - e.minY));
  const centre = graph.positions.get(centreId)!;
  const middle = { x: (free.minX + free.maxX) / 2, y: (free.minY + free.maxY) / 2 };
  const ctx = silentContext();
  const worldKey = {};
  return (zoomRatio: number, now: number, pan: Point): DialFrameInput => {
    const scale = fit * zoomRatio;
    const toScreen = (x: number, y: number): Point => ({ x: middle.x + pan.x + (x - centre.x) * scale, y: middle.y + pan.y + (y - centre.y) * scale });
    return {
      ctx, dial: { model, scene, overviewPadPx: { left: 0, right: 0, top: 0, bottom: 0 }, labels: LABELS }, worldKey,
      nodeScreen: (id) => { const p = graph.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen, scale, zoomRatio,
      viewportWidth: W, viewportHeight: H, freeRect: free,
      mapTokens: { canvasBgNear: "#101014" } as unknown as OntologyMapTokens, dialTokens: {} as DialFrameInput["dialTokens"], labels: LABELS, evidence: null,
      hoveredNodeId: null, focusedNodeId: centreId, agentFocusNodeId: null, selectionPulse: null, appearOf: () => 1, hubCount: null,
      now, reducedMotion: false, domainAppear: 1, elementLabel: (id) => id,
    };
  };
}

/**
 * Timed, not counted: the frame has a 60 Hz requirement, and the clearance and push work it
 * guards runs inside the paint with no count it exposes.
 *
 * The median time of one frame of `domainId`'s star, opened from the overview to `zoom` and
 * settled, while the reader pans it a few px. The open pushes every fan its members cover on the way.
 */
function frameCpuMs(model: DialModel, domainId: string, free: Free, zoom: number): number {
  return frameCost(model, domainId, free, zoom).cpuMs;
}

/**
 * `frameCpuMs`, with the median heap a settled frame leaves allocated before the collector runs, in
 * KiB, and the median time of a frame while the star opens and the camera zooms.
 */
function frameCost(model: DialModel, domainId: string, free: Free, zoom: number): { cpuMs: number; heapKiB: number; zoomingMs: number } {
  clearDialFrame();
  const camera = cameraOn(model, domainId, free);
  const zooming: number[] = [];
  let now = 0;
  for (let i = 0; i < 400; i += 1, now += FRAME_MS) {
    const t = Math.min(1, now / 600);
    const at = Math.pow(zoom, (1 - Math.cos(Math.PI * t)) / 2);
    const spent = startWorkClock();
    const painted = paintFlatGraphFrame(camera(at, now, { x: 0, y: 0 }), TOKENS);
    if (t < 1) zooming.push(spent());
    else if (!painted.branchMembersAnimating) break;
  }
  const times: number[] = [];
  const heaps: number[] = [];
  for (let i = 0; i < 60; i += 1, now += FRAME_MS) {
    const input = camera(zoom, now, { x: Math.sin(i / 20) * 6, y: Math.cos(i / 20) * 6 });
    const heap = process.memoryUsage().heapUsed;
    const spent = startWorkClock();
    paintFlatGraphFrame(input, TOKENS);
    times.push(spent());
    // A collection during the frame shows as a fall, which says nothing of what the frame allocated.
    const grew = process.memoryUsage().heapUsed - heap;
    if (grew >= 0) heaps.push(grew / 1024);
  }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  return { cpuMs: median(times), heapKiB: median(heaps), zoomingMs: median(zooming) };
}

/**
 * Measured 2026-11-20 on an Apple-silicon Mac: 1.1 to 3.6 ms per frame, the narrow map at 2.2 the
 * most, where every fan is pushed. Before the push the frame hid those dots and took 1.0 to 1.7 ms;
 * a push that walked every mark of the star for every pushed dot took 71 to 98 ms.
 */
const BUDGET_MS = 20;

/**
 * How many times the 40-capability star's frames, summed over the four maps and zooms, the
 * 160-capability star's may take on the same machine: it has 4.1 times the marks, so about linear.
 * Measured 2026-11-21 on an Apple-silicon Mac, the 160-capability star took 5.0 to 6.2 ms a settled
 * frame against 1.1 to 2.4 ms, 2.3 to 4.0 times as much, and 9.5 to 24 ms a frame while it opens.
 * Before its names' clearance tests read a grid and a pan reused its pushed dots' rooms it took 9.1
 * to 35.9 ms settled, 9.9 times as much, and 34 to 60 ms opening, over a 60 Hz frame.
 */
const LARGE_STAR_RATIO = 5;

const CASES = [["narrow", NARROW_FREE, 2.2], ["narrow", NARROW_FREE, 3.4], ["full-width", FULL_FREE, 2.2], ["full-width", FULL_FREE, 3.4]] as const;

describe("the largest opened star", () => {
  const model = syntheticModel(3, 40, 12);
  const { capabilities, elements } = domainStarIds(model, "domain:d0");

  it("paints a frame of its 40 capabilities and 480-odd elements within a few ms of CPU, its fans pushed or not", () => {
    expect(capabilities.length).toBe(40);
    expect(new Set(elements).size).toBeGreaterThan(450);
    const measured: string[] = [];
    let worst = 0;
    for (const [name, free, zoom] of CASES) {
      const ms = frameCpuMs(model, "domain:d0", free, zoom);
      measured.push(`${name} at ${zoom}: ${ms.toFixed(2)} ms`);
      worst = Math.max(worst, ms);
    }
    console.log(`[open-star-push] median CPU per frame: ${measured.join(", ")}`);
    expect(worst).toBeLessThan(BUDGET_MS);
  });

  it("paints a star four times as large, 160 capabilities and 1,984 elements, in about four times the CPU, every name's clearance and pushed dot included", () => {
    const large = syntheticModel(3, 160, 12);
    const star = domainStarIds(large, "domain:d0");
    expect(star.capabilities.length).toBe(160);
    expect(new Set(star.elements).size).toBe(1984);
    let small = 0;
    let big = 0;
    const measured: string[] = [];
    for (const [name, free, zoom] of CASES) {
      const base = frameCost(model, "domain:d0", free, zoom);
      const cost = frameCost(large, "domain:d0", free, zoom);
      small += base.cpuMs;
      big += cost.cpuMs;
      measured.push(`${name} at ${zoom}: ${cost.cpuMs.toFixed(2)} ms against ${base.cpuMs.toFixed(2)}, ${cost.heapKiB.toFixed(0)} KiB a frame, ${cost.zoomingMs.toFixed(2)} ms zooming`);
      expect(cost.cpuMs, `${name} at ${zoom}`).toBeLessThan(BUDGET_MS);
    }
    console.log(`[open-star-push] 160/1984 median CPU per frame: ${measured.join("; ")}; ${(big / small).toFixed(2)} times the 40/484 star`);
    expect(big / small).toBeLessThan(LARGE_STAR_RATIO);
  });
});
