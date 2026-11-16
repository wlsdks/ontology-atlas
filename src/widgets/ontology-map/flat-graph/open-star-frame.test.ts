import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";

import { buildDialModel } from "../dial/dial-model";
import { clearDialFrame, describeLastDialFrame } from "../dial/frame/frame";
import type { DialFrameInput, DialLabels, DialModel, Point } from "../dial/types";
import {
  directRelations, readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesCapabilityPairs, rollRelatesDomainPairs,
  type TreeInputEdge, type TreeInputNode,
} from "../model/containment-tree";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { paintFlatGraphFrame } from "./frame";
import { domainStarIds } from "./open-star";
import { buildFlatGraphScene } from "./scene";
import { resolveFlatGraphTokens } from "./tokens";

const KINDS = new Set(["project", "domain", "capability", "element"]);
const W = 1410;
const H = 840;
const FRAME_MS = 1000 / 60;

function dogfoodModel(): DialModel {
  const d = deriveOntologyFromVault(dogfoodManifest as unknown as VaultManifest);
  const treeNodes: TreeInputNode[] = (d.nodes as { id: string; kind: string; title?: string }[])
    .filter((n) => KINDS.has(n.kind)).map((n) => ({ id: n.id, label: n.title ?? n.id, kind: n.kind as TreeInputNode["kind"] }));
  const treeEdges: TreeInputEdge[] = (d.edges as { from: string; to: string; type: string }[])
    .map((e) => ({ source: e.from, target: e.to, kind: isContainmentRelation(e.type) ? "contains" : "depends", relationType: e.type }));
  const tree = readContainmentTree(treeNodes, treeEdges);
  const dependencies = rollDomainDependencies(tree, treeEdges);
  return buildDialModel({
    tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges)),
    elementIds: treeNodes.filter((n) => n.kind === "element").map((n) => n.id), relates: rollRelatesCapabilityPairs(tree, treeEdges), direct: directRelations(treeEdges),
  });
}

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

const model = dogfoodModel();
const scene = buildFlatGraphScene(model, TOKENS.layout, null);
const layout = scene.graph!;

/** A synthetic map of `domains` domains of `capsPer` capabilities with one to `2 * elsPer` elements each and a web of needs. */
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

type Mark = { x: number; y: number; r: number };

/** A camera centred on `centreId` (the map's middle when null) of `world`'s map, at a zoom given per frame as a ratio of the fitting scale. */
function cameraOn(centreId: string | null, worldKey: object, world = { model, scene }) {
  const { model: m, scene: sc } = world;
  const graph = sc.graph!;
  const e = graph.extent;
  const fit = Math.min(W / (e.maxX - e.minX), H / (e.maxY - e.minY));
  const centre = centreId === null ? { x: (e.minX + e.maxX) / 2, y: (e.minY + e.maxY) / 2 } : graph.positions.get(centreId)!;
  const ctx = silentContext();
  return (zoomRatio: number, over: Partial<DialFrameInput>): DialFrameInput => {
    const scale = fit * zoomRatio;
    const toScreen = (x: number, y: number): Point => ({ x: W / 2 + (x - centre.x) * scale, y: H / 2 + (y - centre.y) * scale });
    return {
      ctx, dial: { model: m, scene: sc, overviewPadPx: { left: 0, right: 0, top: 0, bottom: 0 }, labels: LABELS }, worldKey,
      nodeScreen: (id) => { const p = graph.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen, scale, zoomRatio,
      viewportWidth: W, viewportHeight: H, freeRect: { minX: 0, minY: 0, maxX: W, maxY: H },
      mapTokens: { canvasBgNear: "#101014" } as unknown as OntologyMapTokens, dialTokens: {} as DialFrameInput["dialTokens"], labels: LABELS, evidence: null,
      hoveredNodeId: null, focusedNodeId: null, agentFocusNodeId: null, selectionPulse: null, appearOf: () => 1, hubCount: null,
      now: 0, reducedMotion: false, domainAppear: 1, elementLabel: (id) => id,
      ...over,
    };
  };
}

/** Each drawn mark in `ids` per 16 ms frame from `from` until the motion settles, the zoom easing from `zoomFrom` to `zoomTo` over `zoomMs`. */
function framesUntilSettled(
  camera: ReturnType<typeof cameraOn>, over: Partial<DialFrameInput>, ids: ReadonlySet<string>, from: number, zoomFrom: number, zoomTo: number, zoomMs: number,
): { frames: Map<string, Mark>[]; end: number } {
  const frames: Map<string, Mark>[] = [];
  for (let i = 0, now = from; i < 400; i += 1, now += FRAME_MS) {
    const t = Math.min(1, (now - from) / zoomMs);
    const zoom = zoomFrom * Math.pow(zoomTo / zoomFrom, (1 - Math.cos(Math.PI * t)) / 2);
    const result = paintFlatGraphFrame(camera(zoom, { ...over, now }), TOKENS);
    const probe = describeLastDialFrame(W, H)!;
    frames.push(new Map([...probe.discs, ...probe.glyphs].filter((m) => m.id !== null && ids.has(m.id)).map((m) => [m.id!, { x: m.x, y: m.y, r: m.r }])));
    if (t >= 1 && !result.branchMembersAnimating) return { frames, end: now };
  }
  throw new Error("the star never settled");
}

/** The fastest radius change between frames, in px per ms, and every frame in which two marks overlap past half a pixel. */
function smoothness(frames: readonly Map<string, Mark>[]): { pxPerMs: number; worst: string; overlaps: string[] } {
  let pxPerMs = 0;
  let worst = "";
  const overlaps: string[] = [];
  frames.forEach((frame, i) => {
    const marks = [...frame];
    for (let a = 0; a < marks.length; a += 1) {
      for (let b = a + 1; b < marks.length; b += 1) {
        const [ia, ma] = marks[a]!;
        const [ib, mb] = marks[b]!;
        if (Math.hypot(ma.x - mb.x, ma.y - mb.y) < ma.r + mb.r - 0.5) overlaps.push(`frame ${i}: ${ia} x ${ib}`);
      }
    }
    if (i === 0) return;
    for (const [id, m] of frame) {
      const was = frames[i - 1]!.get(id);
      if (!was) continue;
      const speed = Math.abs(m.r - was.r) / FRAME_MS;
      if (speed > pxPerMs) {
        pxPerMs = speed;
        worst = `frame ${i}: ${id} ${was.r.toFixed(2)} -> ${m.r.toFixed(2)}`;
      }
    }
  });
  return { pxPerMs, worst, overlaps };
}

/** Every drawn name in `ids` whose glyphs cross another name's or a disc or dot not its own, in the last painted frame. */
function crowdedNames(ids: ReadonlySet<string>): string[] {
  const probe = describeLastDialFrame(W, H)!;
  const marks = [...probe.discs, ...probe.glyphs].filter((m) => m.id !== null && ids.has(m.id));
  const names = probe.texts.filter((n) => n.id !== null && ids.has(n.id));
  const crowded: string[] = [];
  names.forEach((n, i) => {
    const b = n.box;
    for (const m of marks) {
      if (m.id !== n.id && Math.hypot(Math.max(b.minX - m.x, 0, m.x - b.maxX), Math.max(b.minY - m.y, 0, m.y - b.maxY)) < m.r - 0.5) crowded.push(`${n.text} on ${m.id}`);
    }
    for (const o of names.slice(i + 1)) {
      if (Math.min(b.maxX, o.box.maxX) > Math.max(b.minX, o.box.minX) && Math.min(b.maxY, o.box.maxY) > Math.max(b.minY, o.box.minY)) crowded.push(`${n.text} on ${o.text}`);
    }
  });
  return crowded;
}

afterEach(() => clearDialFrame());

type Probe = NonNullable<ReturnType<typeof describeLastDialFrame>>;

/** The probe once the map settles at each zoom with nothing selected. */
function restingFrames(camera: ReturnType<typeof cameraOn>, zooms: readonly number[]): { zoom: number; texts: Probe["texts"]; discs: Probe["discs"] }[] {
  let now = 0;
  return zooms.map((zoom) => {
    framesUntilSettled(camera, {}, new Set(), now, zoom, zoom, FRAME_MS);
    now += 10_000;
    const { texts, discs } = describeLastDialFrame(W, H)!;
    return { zoom, texts, discs };
  });
}

/** Well inside the viewport, where a name has room on every side. */
const INSET_PX = 160;

/** Each drawn disc's radius in the frame `camera` paints at `zoom` and `now`. */
function radiiAt(camera: ReturnType<typeof cameraOn>, zoom: number, over: Partial<DialFrameInput>): Map<string, number> {
  paintFlatGraphFrame(camera(zoom, over), TOKENS);
  return new Map(describeLastDialFrame(W, H)!.discs.filter((d) => d.id !== null).map((d) => [d.id!, d.r]));
}

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "keeps the opened %s star's marks apart while the reader pinches out from 3.6 to 0.9 in 300 ms",
  (domainId) => {
    const { capabilities, elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const camera = cameraOn(domainId, {});
    const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, 0, 3.6, 3.6, FRAME_MS);
    const pinched = framesUntilSettled(camera, { focusedNodeId: domainId }, star, opened.end + FRAME_MS, 3.6, 0.9, 300);
    expect(smoothness(pinched.frames).overlaps.slice(0, 4)).toEqual([]);
  },
);

describe("a mark's drawn radius across frames", () => {
  it("takes its radius at once when it comes back on screen, however long it was away", () => {
    const worldKey = {};
    const away = cameraOn("domain:agent-access", worldKey);
    const home = cameraOn("domain:code-evidence", worldKey);
    framesUntilSettled(cameraOn(null, worldKey), {}, new Set(), 0, 1, 1, FRAME_MS);
    let now = 10_000;
    for (let i = 0; i < 300; i += 1, now += FRAME_MS) {
      expect(radiiAt(away, 4, { now }).has("domain:code-evidence"), "the domain is off screen while the reader is away").toBe(false);
    }
    const back = radiiAt(home, 4, { now }).get("domain:code-evidence")!;
    framesUntilSettled(home, {}, new Set(), now + FRAME_MS, 4, 4, FRAME_MS);
    const settled = radiiAt(home, 4, { now: now + 60_000 }).get("domain:code-evidence")!;
    expect(back).toBeCloseTo(settled, 3);
  });

  it("moves no further across a stalled frame than across a frame of two 60 Hz frames", () => {
    const radiiAfterGap = (gapMs: number) => {
      const camera = cameraOn("domain:code-evidence", {});
      framesUntilSettled(camera, {}, new Set(), 0, 3.6, 3.6, FRAME_MS);
      radiiAt(camera, 3.6, { now: 20_000, focusedNodeId: "domain:code-evidence" });
      return radiiAt(camera, 3.6, { now: 20_000 + gapMs, focusedNodeId: "domain:code-evidence" });
    };
    const stalled = radiiAfterGap(200);
    const twoFrames = radiiAfterGap(34);
    expect([...stalled].filter(([id, r]) => Math.abs(r - twoFrames.get(id)!) > 1e-6).map(([id]) => id)).toEqual([]);
    expect([...stalled].some(([id, r]) => r !== radiiAt(cameraOn("domain:code-evidence", {}), 3.6, { now: 0 }).get(id)), "the stalled frame still moved the star").toBe(true);
  });
});

it("draws a selected element's dot and name at every zoom the reader leaves it at", () => {
  const missing: string[] = [];
  for (const id of model.capabilityOf.keys()) {
    const camera = cameraOn(id, {});
    let now = 0;
    for (const zoom of [4, 2, 1.5, 1, 0.5]) {
      framesUntilSettled(camera, { focusedNodeId: id, reducedMotion: true }, new Set(), now, zoom, zoom, FRAME_MS);
      now += 10_000;
      const probe = describeLastDialFrame(W, H)!;
      if (!probe.glyphs.some((g) => g.id === id)) missing.push(`${id} dot at zoom ${zoom}`);
      if (!probe.texts.some((t) => t.id === id && t.role === "element")) missing.push(`${id} name at zoom ${zoom}`);
    }
  }
  expect(missing.slice(0, 6)).toEqual([]);
});

describe("the resting overview", () => {
  const sweep = [0.5, 0.7, 1, 1.4, 2, 2.8, 4, 5.6, 8];

  it("lets no mark or name crowd an admitted name, and zooming in keeps every capability name still well in view", () => {
    let named = new Set<string>();
    for (const { zoom, texts, discs } of restingFrames(cameraOn(null, {}), sweep)) {
      expect(texts.filter((t) => t.room !== 1).map((t) => t.text), `zoom ${zoom}`).toEqual([]);
      const inView = new Set(discs.filter((d) => d.x > INSET_PX && d.x < W - INSET_PX && d.y > INSET_PX && d.y < H - INSET_PX).map((d) => d.id));
      const now = new Set(texts.filter((t) => t.role === "capability").map((t) => t.id!));
      expect([...named].filter((id) => inView.has(id) && !now.has(id)), `zoom ${zoom} drops no name the zoom below drew`).toEqual([]);
      named = now;
    }
  });

  it("lets no mark or name crowd an admitted name on a 1,800-concept map", () => {
    const big = syntheticModel(12, 20, 6);
    const world = { model: big, scene: buildFlatGraphScene(big, TOKENS.layout, null) };
    for (const { zoom, texts } of restingFrames(cameraOn("domain:d3", {}, world), [2, 4])) {
      expect(texts.filter((t) => t.room !== 1).map((t) => t.text), `zoom ${zoom}`).toEqual([]);
    }
  });
});

describe.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer"])("the %s star while the camera zooms", (domainId) => {
  const { capabilities, elements } = domainStarIds(model, domainId);
  const star = new Set([domainId, ...capabilities, ...elements]);
  const member = capabilities[0]!;
  const limit = TOKENS.paint.markPxPerMs + 1e-9;
  const contextAlphas = new Map([...layout.positions.keys()].map((id) => [id, 1]));

  it.each([["closed", {}], ["open", { contextAlphas }]] as const)(
    "with the dock %s grows, hands over to a member and closes no faster than its radius limit, two marks never overlapping",
    (_, dock) => {
      const camera = cameraOn(domainId, {});
      const rest = framesUntilSettled(camera, dock, star, 0, 1, 1, FRAME_MS);
      const opened = framesUntilSettled(camera, { ...dock, focusedNodeId: domainId }, star, rest.end + FRAME_MS, 1, 3.6, 600);
      const pressed = framesUntilSettled(camera, { ...dock, focusedNodeId: member }, star, opened.end + FRAME_MS, 3.6, 3.6, FRAME_MS);
      const closed = framesUntilSettled(camera, dock, star, pressed.end + FRAME_MS, 3.6, 1, 600);
      const legs = [["open", [rest.frames.at(-1)!, ...opened.frames]], ["member", [opened.frames.at(-1)!, ...pressed.frames]], ["close", [pressed.frames.at(-1)!, ...closed.frames]]] as const;
      for (const [leg, frames] of legs) {
        const { pxPerMs, worst, overlaps } = smoothness(frames);
        expect(pxPerMs, `${leg}: ${worst}`).toBeLessThanOrEqual(limit);
        expect(overlaps.slice(0, 4), leg).toEqual([]);
      }
    },
  );

  it("names the opened star and a pressed member at rest without a name on another name or on a mark not its own", () => {
    const camera = cameraOn(domainId, {});
    const rest = framesUntilSettled(camera, {}, star, 0, 1, 1, FRAME_MS);
    const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, rest.end + FRAME_MS, 1, 3.6, 600);
    expect(crowdedNames(star), "the opened star").toEqual([]);
    framesUntilSettled(camera, { focusedNodeId: member }, star, opened.end + FRAME_MS, 3.6, 3.6, FRAME_MS);
    expect(crowdedNames(star), "the pressed member").toEqual([]);
  });

  it("settles at once under reduced motion", () => {
    const camera = cameraOn(domainId, {});
    framesUntilSettled(camera, { reducedMotion: true }, star, 0, 3.6, 3.6, FRAME_MS);
    const opened = framesUntilSettled(camera, { reducedMotion: true, focusedNodeId: domainId }, star, 100, 3.6, 3.6, FRAME_MS);
    const radii = (frame: Map<string, Mark>) => [...frame].map(([id, m]) => [id, m.r.toFixed(3)]);
    expect(radii(opened.frames[0]!), "the first frame draws the opened star").toEqual(radii(opened.frames.at(-1)!));
  });
});
