import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";

import { buildDialModel } from "../dial/dial-model";
import { clearDialFrame, describeLastDialFrame } from "../dial/frame/frame";
import type { DialFrameInput, DialLabels, DialModel, Point } from "../dial/dial-shapes";
import {
  directRelations, readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesCapabilityPairs, rollRelatesDomainPairs,
  type TreeInputEdge, type TreeInputNode,
} from "../model/containment-tree";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { cachedGraphAttention } from "./attention";
import { paintFlatGraphFrame } from "./frame";
import { exitedShare } from "./frame/exit-tags";
import { F as frameState, framePlan } from "./frame/state";
import { segmentCrossesBox } from "./names/lit-lines";
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

function silentContext(measure = (text: string, _font: string) => text.length * 6): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { globalCompositeOperation: "source-over", globalAlpha: 1, font: "10px sans-serif", lineWidth: 1 };
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    measureText: (text) => ({ width: measure(String(text), String(state.font)) }),
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
/** A domain's census and reach rows: one slot under its name. */
const CAPTION_ROLES = new Set(["units", "status"]);

/**
 * A camera centred on `centreId` (the map's middle when null) of `world`'s map in the free map `free`,
 * at a zoom given per frame as a ratio of the scale that fits the map into `free`.
 */
function cameraOn(centreId: string | null, worldKey: object, world = { model, scene }, free = { minX: 0, minY: 0, maxX: W, maxY: H }) {
  const { model: m, scene: sc } = world;
  const graph = sc.graph!;
  const e = graph.extent;
  const fit = Math.min((free.maxX - free.minX) / (e.maxX - e.minX), (free.maxY - free.minY) / (e.maxY - e.minY));
  const centre = centreId === null ? { x: (e.minX + e.maxX) / 2, y: (e.minY + e.maxY) / 2 } : graph.positions.get(centreId)!;
  const middle = { x: (free.minX + free.maxX) / 2, y: (free.minY + free.maxY) / 2 };
  const ctx = silentContext();
  return (zoomRatio: number, over: Partial<DialFrameInput>): DialFrameInput => {
    const scale = fit * zoomRatio;
    const toScreen = (x: number, y: number): Point => ({ x: middle.x + (x - centre.x) * scale, y: middle.y + (y - centre.y) * scale });
    return {
      ctx, dial: { model: m, scene: sc, overviewPadPx: { left: 0, right: 0, top: 0, bottom: 0 }, labels: LABELS }, worldKey,
      nodeScreen: (id) => { const p = graph.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen, scale, zoomRatio,
      viewportWidth: W, viewportHeight: H, freeRect: free,
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

/**
 * Every drawn name in `ids` whose glyphs cross another name's or a disc or dot not its own, in the
 * last painted frame; a backed name draws on the canvas ground, so only another name crowds it.
 */
function crowdedNames(ids: ReadonlySet<string>): string[] {
  const probe = describeLastDialFrame(W, H)!;
  const marks = [...probe.discs, ...probe.glyphs].filter((m) => m.id !== null && ids.has(m.id));
  const names = probe.texts.filter((n) => n.id !== null && ids.has(n.id));
  const crowded: string[] = [];
  names.forEach((n, i) => {
    const b = n.box;
    for (const m of marks) {
      if (m.id !== n.id && !n.backed && Math.hypot(Math.max(b.minX - m.x, 0, m.x - b.maxX), Math.max(b.minY - m.y, 0, m.y - b.maxY)) < m.r - 0.5) crowded.push(`${n.text} on ${m.id}`);
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

/** The free map beside the closed dock at 1280x800: narrow enough that a wide star opens at a low scale. */
const NARROW_FREE = { minX: 324, minY: 112, maxX: 837, maxY: 728 };
const denseWorld = (() => {
  const m = syntheticModel(4, 5, 9);
  return { model: m, scene: buildFlatGraphScene(m, TOKENS.layout, null) };
})();

it.each([
  ...["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"].map((id) => [id, { model, scene }] as const),
  ...denseWorld.model.domains.map((d) => [d.id, denseWorld] as const),
])(
  "draws every element of the opened %s star clear of every mark where a narrow free map frames it, though its largest members' discs reach past their innermost elements",
  (domainId, world) => {
    const { capabilities, elements } = domainStarIds(world.model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const camera = cameraOn(domainId, {}, world, NARROW_FREE);
    const unread: string[] = [];
    const overlaps: string[] = [];
    let now = 0;
    for (const zoom of [2.2, 2.6, 3, 3.4]) {
      const { frames, end } = framesUntilSettled(camera, { focusedNodeId: domainId }, star, now, zoom, zoom, FRAME_MS);
      now = end + 10_000;
      const input = camera(zoom, {});
      const inView = (id: string) => {
        const at = input.nodeScreen(id);
        return at !== null && at.x > 0 && at.x < W && at.y > 0 && at.y < H;
      };
      const drawn = new Set(describeLastDialFrame(W, H)!.glyphs.map((g) => g.id));
      unread.push(...[...new Set(elements)].filter((id) => inView(id) && !drawn.has(id)).map((id) => `${zoom}: ${id}`));
      overlaps.push(...smoothness(frames.slice(-1)).overlaps.map((o) => `${zoom}: ${o}`));
    }
    expect({ unread: unread.slice(0, 6), overlaps: overlaps.slice(0, 6) }).toEqual({ unread: [], overlaps: [] });
  },
);

it.each([
  ...["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"].map((id) => [id, { model, scene }] as const),
  ...denseWorld.model.domains.map((d) => [d.id, denseWorld] as const),
])(
  "opens the %s star from the overview where a narrow free map frames it with no frame drawing two marks over each other, and settles with every dot in view drawn, as dots move out of their members' discs",
  (domainId, world) => {
    const { capabilities, elements } = domainStarIds(world.model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const camera = cameraOn(domainId, {}, world, NARROW_FREE);
    const rest = framesUntilSettled(camera, {}, star, 0, 1, 1, FRAME_MS);
    const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, rest.end + FRAME_MS, 1, 2.6, 600);
    // A dot under a disc fades out before it lies half a pixel inside it, so no frame overlaps deeper whether the
    // dot moves out or is lost under the disc; the settled frame tells the two apart.
    const input = camera(2.6, {});
    const inView = (id: string) => {
      const at = input.nodeScreen(id);
      return at !== null && at.x > 0 && at.x < W && at.y > 0 && at.y < H;
    };
    const settled = opened.frames.at(-1)!;
    const lost = [...new Set(elements)].filter((id) => inView(id) && !settled.has(id));
    expect({ overlaps: smoothness(opened.frames).overlaps.slice(0, 4), lost: lost.slice(0, 4) }).toEqual({ overlaps: [], lost: [] });
  },
);

it("draws an opened star's dots again after one frame whose scale is not a number", () => {
  const domainId = "domain:code-evidence";
  const { capabilities, elements } = domainStarIds(model, domainId);
  const star = new Set([domainId, ...capabilities, ...elements]);
  const camera = cameraOn(domainId, {}, { model, scene }, NARROW_FREE);
  const dotsOf = (frame: Map<string, Mark>) => [...new Set(elements)].filter((id) => frame.has(id)).sort();
  const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, 0, 2.2, 2.2, FRAME_MS);
  const nan = Number.NaN;
  paintFlatGraphFrame({ ...camera(2.2, { focusedNodeId: domainId, now: opened.end + FRAME_MS }), scale: nan, toScreen: () => ({ x: nan, y: nan }), nodeScreen: () => null }, TOKENS);
  const after = framesUntilSettled(camera, { focusedNodeId: domainId }, star, opened.end + 2 * FRAME_MS, 2.2, 2.2, FRAME_MS);
  expect(dotsOf(opened.frames.at(-1)!).length).toBeGreaterThan(10);
  expect(dotsOf(after.frames.at(-1)!)).toEqual(dotsOf(opened.frames.at(-1)!));
});

it("keeps every dot of a pressed member's fan drawn on each frame as the reader goes back to its star, where a narrow free map pushes the fan out of the member's disc", () => {
  const domainId = "domain:code-evidence";
  const member = "capability:repo-structure-analysis";
  const { capabilities, elements } = domainStarIds(model, domainId);
  const star = new Set([domainId, ...capabilities, ...elements]);
  const fan = model.capabilityById.get(member)!.elementIds;
  const camera = cameraOn(domainId, {}, { model, scene }, NARROW_FREE);
  const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, 0, 2.2, 2.2, FRAME_MS);
  const pressed = framesUntilSettled(camera, { focusedNodeId: member }, star, opened.end + FRAME_MS, 2.2, 2.2, FRAME_MS);
  const back = framesUntilSettled(camera, { focusedNodeId: domainId }, star, pressed.end + FRAME_MS, 2.2, 2.2, FRAME_MS);
  expect(fan.filter((id) => opened.frames.at(-1)!.has(id))).toEqual(fan);
  const gaps = back.frames.flatMap((frame, i) => fan.filter((id) => !frame.has(id)).map((id) => `frame ${i}: ${id}`));
  expect(gaps.slice(0, 6)).toEqual([]);
});

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "names the opened %s star, and each member pressed in it, at rest without a name on another name or on a mark not its own",
  (domainId) => {
    const { capabilities, elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const crowded: string[] = [];
    let backed = 0;
    for (const member of capabilities) {
      const camera = cameraOn(domainId, {});
      const rest = framesUntilSettled(camera, {}, star, 0, 1, 1, FRAME_MS);
      const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, rest.end + FRAME_MS, 1, 3.6, 600);
      if (member === capabilities[0]) crowded.push(...crowdedNames(star).map((c) => `opened: ${c}`));
      framesUntilSettled(camera, { focusedNodeId: member }, star, opened.end + FRAME_MS, 3.6, 3.6, FRAME_MS);
      crowded.push(...crowdedNames(star).map((c) => `${member}: ${c}`));
      backed += describeLastDialFrame(W, H)!.texts.filter((t) => t.backed && t.id !== null && star.has(t.id) && (t.role === "capability" || t.role === "element")).length;
    }
    console.log(`[held names] ${domainId}: ${backed} backed across ${capabilities.length} members`);
    expect(crowded.slice(0, 6)).toEqual([]);
  },
);

/**
 * Every name the last frame painted whose glyphs cross another name, a disc not its own, or an
 * element dot grown past its resting radius while the name draws on no backing. A domain's census
 * and reach rows share one slot, so their cross-fade is no crossing.
 */
function nameBreaches(): string[] {
  const probe = describeLastDialFrame(W, H)!;
  const names = [...probe.texts, ...probe.fadingTexts].filter((n) => n.id !== null);
  const under = (b: Probe["texts"][number]["box"], m: Mark) => Math.hypot(Math.max(b.minX - m.x, 0, m.x - b.maxX), Math.max(b.minY - m.y, 0, m.y - b.maxY)) < m.r - 0.5;
  const breaches: string[] = [];
  names.forEach((n, i) => {
    for (const d of probe.discs) if (d.id !== n.id && under(n.box, d)) breaches.push(`${n.role} ${n.text} on ${d.id}`);
    for (const g of probe.glyphs) if (g.id !== n.id && g.grown && !n.backed && under(n.box, g)) breaches.push(`${n.role} ${n.text} on grown ${g.id}`);
    for (const o of names.slice(i + 1)) {
      if (o.id === n.id && CAPTION_ROLES.has(o.role) && CAPTION_ROLES.has(n.role)) continue;
      const b = n.box;
      if (Math.min(b.maxX, o.box.maxX) > Math.max(b.minX, o.box.minX) && Math.min(b.maxY, o.box.maxY) > Math.max(b.minY, o.box.minY)) breaches.push(`${n.role} ${n.text} on ${o.role} ${o.text}`);
    }
  });
  return breaches;
}

describe.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])("the opened %s star at rest", (domainId) => {
  const { capabilities, elements } = domainStarIds(model, domainId);
  const star = new Set([domainId, ...capabilities, ...elements]);

  it.each([2, 2.5, 3, 3.6])("names every member at zoom %s, a name over its star's grown dots only on a backing and none on a disc or a name", (zoom) => {
    const camera = cameraOn(domainId, {});
    const rest = framesUntilSettled(camera, {}, star, 0, 1, 1, FRAME_MS);
    framesUntilSettled(camera, { focusedNodeId: domainId }, star, rest.end + FRAME_MS, 1, zoom, 600);
    const { texts, discs } = describeLastDialFrame(W, H)!;
    // The camera here centres the domain rather than framing the star, so only members well in view are asked for.
    const inView = capabilities.filter((id) => discs.some((d) => d.id === id && d.x > INSET_PX && d.x < W - INSET_PX && d.y > INSET_PX && d.y < H - INSET_PX));
    const named = inView.filter((id) => texts.some((t) => t.id === id && t.role === "capability"));
    const backed = texts.filter((t) => t.backed && capabilities.includes(t.id ?? "")).length;
    console.log(`[star names] ${domainId} at zoom ${zoom}: ${named.length} of ${inView.length} in view named, ${backed} backed`);
    expect(inView.filter((id) => !named.includes(id))).toEqual([]);
    expect(nameBreaches().slice(0, 6)).toEqual([]);
  });
});

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "keeps a selected element's ring off its capability's disc in the opened %s star",
  (domainId) => {
    const { elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...domainStarIds(model, domainId).capabilities, ...elements]);
    const ringPx = TOKENS.paint.selectedRingGapPx + TOKENS.paint.selectedRingPx;
    const breaches: string[] = [];
    let measured = 0;
    for (const zoom of [1, 1.5, 2, 3.6]) {
      for (const element of elements) {
        const owner = model.capabilityOf.get(element);
        if (!owner) continue;
        const camera = cameraOn(domainId, {});
        const rest = framesUntilSettled(camera, {}, star, 0, 1, 1, FRAME_MS);
        const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, rest.end + FRAME_MS, 1, zoom, 600);
        framesUntilSettled(camera, { focusedNodeId: element }, star, opened.end + FRAME_MS, zoom, zoom, 600);
        const { discs, glyphs } = describeLastDialFrame(W, H)!;
        const self = [...discs, ...glyphs].find((m) => m.id === element);
        const cap = discs.find((m) => m.id === owner);
        if (!self || !cap) continue;
        measured += 1;
        const gap = Math.hypot(self.x - cap.x, self.y - cap.y) - self.r - ringPx - cap.r;
        if (gap < 0) breaches.push(`${element} on ${owner} at zoom ${zoom}: ${gap.toFixed(1)}px`);
      }
    }
    expect(breaches).toEqual([]);
    expect(measured, "most selections were measured, not skipped").toBeGreaterThanOrEqual(elements.length * 3);
  },
);

it("moves a selection between two elements of one capability with no frame jump", () => {
  const domainId = "domain:human-workbench";
  const { capabilities, elements } = domainStarIds(model, domainId);
  const star = new Set([domainId, ...capabilities, ...elements]);
  const [first, second] = elements.filter((id) => model.capabilityOf.get(id) === "capability:library-workspace");
  expect(first && second).toBeTruthy();
  const jumps: string[] = [];
  for (const zoom of [1, 2]) {
    const camera = cameraOn(domainId, {});
    const rest = framesUntilSettled(camera, {}, star, 0, 1, 1, FRAME_MS);
    const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, rest.end + FRAME_MS, 1, zoom, 600);
    const chosen = framesUntilSettled(camera, { focusedNodeId: first! }, star, opened.end + FRAME_MS, zoom, zoom, 600);
    const last = new Map<string, { x: number; y: number }>();
    for (let i = 0, now = chosen.end + FRAME_MS; i < 45; i += 1, now += FRAME_MS) {
      paintFlatGraphFrame(camera(zoom, { focusedNodeId: second!, now }), TOKENS);
      const { discs, glyphs } = describeLastDialFrame(W, H)!;
      for (const id of [first!, second!]) {
        const mark = [...discs, ...glyphs].find((m) => m.id === id);
        if (!mark) continue;
        const was = last.get(id);
        if (was && Math.hypot(mark.x - was.x, mark.y - was.y) > 3) jumps.push(`${id} at zoom ${zoom}, frame ${i}: ${Math.hypot(mark.x - was.x, mark.y - was.y).toFixed(1)}px`);
        last.set(id, { x: mark.x, y: mark.y });
      }
    }
  }
  expect(jumps).toEqual([]);
});

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "draws the name of each member pressed in the opened %s star clear of grown dots or on its plate, from the press to rest",
  (domainId) => {
    const { capabilities, elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const breaches: string[] = [];
    for (const zoom of [2.5, 3.3]) {
      for (const member of capabilities) {
        const camera = cameraOn(domainId, {});
        const rest = framesUntilSettled(camera, {}, star, 0, 1, 1, FRAME_MS);
        const opened = framesUntilSettled(camera, { focusedNodeId: domainId }, star, rest.end + FRAME_MS, 1, zoom, 600);
        for (let i = 1, now = opened.end + FRAME_MS; i <= 60; i += 1, now += FRAME_MS) {
          paintFlatGraphFrame(camera(zoom, { focusedNodeId: member, now }), TOKENS);
          const probe = describeLastDialFrame(W, H)!;
          for (const t of probe.texts.filter((x) => x.id === member && x.role === "capability" && !x.backed)) {
            for (const g of probe.glyphs) {
              if (g.grown && Math.hypot(Math.max(t.box.minX - g.x, 0, g.x - t.box.maxX), Math.max(t.box.minY - g.y, 0, g.y - t.box.maxY)) < g.r - 0.5) breaches.push(`${member} at ${zoom}, frame ${i}: on ${g.id}`);
            }
          }
        }
      }
    }
    expect(breaches.slice(0, 6)).toEqual([]);
  },
);

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "lets no name, the pressed member's included, hold or gain ink over a disc not its own while a member of the opened %s star is pressed",
  (domainId) => {
    const { capabilities, elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const breaches: string[] = [];
    for (const [zoom, free] of [2.5, 3, 3.3, 3.6].flatMap((z) => [{ minX: 0, minY: 0, maxX: W / 2 + 120, maxY: H }, { minX: 0, minY: 0, maxX: W, maxY: H }].map((f) => [z, f] as const))) {
      for (const member of capabilities) {
        const camera = cameraOn(domainId, {});
        const rest = framesUntilSettled(camera, { freeRect: free }, star, 0, 1, 1, FRAME_MS);
        const opened = framesUntilSettled(camera, { focusedNodeId: domainId, freeRect: free }, star, rest.end + FRAME_MS, 1, zoom, 600);
        let before = paintedInks();
        for (let i = 1, now = opened.end + FRAME_MS; i <= 40; i += 1, now += FRAME_MS) {
          paintFlatGraphFrame(camera(zoom, { focusedNodeId: member, freeRect: free, now }), TOKENS);
          const probe = describeLastDialFrame(W, H)!;
          for (const n of [...probe.texts, ...probe.fadingTexts]) {
            if (n.id === null || n.alpha < (before.get(`${n.role} ${n.id} ${n.side}`) ?? 0)) continue;
            for (const d of probe.discs) {
              if (d.id !== n.id && Math.hypot(Math.max(n.box.minX - d.x, 0, d.x - n.box.maxX), Math.max(n.box.minY - d.y, 0, d.y - n.box.maxY)) < d.r - 0.5) breaches.push(`${member} at ${zoom}, frame ${i}: ${n.role} ${n.text} on ${d.id}`);
            }
          }
          before = paintedInks();
        }
      }
    }
    expect(breaches.slice(0, 6)).toEqual([]);
  },
);

/** How far a member's disc stands left of the panel for its name to be asked for: room for a name's gap. */
const PANEL_GAP_PX = 20;

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "names each member of the opened %s star beside a panel on a side clear of the panel",
  (domainId) => {
    const { capabilities, elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const camera = cameraOn(domainId, {});
    const panel = { minX: W / 2 + 60, maxX: W, minY: 0, maxY: H };
    const rest = framesUntilSettled(camera, { nameObstacles: [panel] }, star, 0, 1, 1, FRAME_MS);
    framesUntilSettled(camera, { focusedNodeId: domainId, nameObstacles: [panel] }, star, rest.end + FRAME_MS, 1, 2.5, 600);
    const { texts, discs } = describeLastDialFrame(W, H)!;
    const clearOfPanel = capabilities.filter((id) => discs.some((d) => d.id === id && d.x > INSET_PX && d.x + d.r < panel.minX - PANEL_GAP_PX && d.y > INSET_PX && d.y < H - INSET_PX));
    expect(clearOfPanel.filter((id) => !texts.some((t) => t.id === id && t.role === "capability"))).toEqual([]);
    expect(texts.filter((t) => capabilities.includes(t.id ?? "") && t.box.maxX > panel.minX).map((t) => t.text)).toEqual([]);
  },
);

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "draws each member name of the opened %s star inside the free map by the frame margin, or not at all",
  (domainId) => {
    const { capabilities, elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const camera = cameraOn(domainId, {});
    const free = { minX: 0, minY: 0, maxX: W / 2 + 60, maxY: H };
    const rest = framesUntilSettled(camera, { freeRect: free }, star, 0, 1, 1, FRAME_MS);
    framesUntilSettled(camera, { focusedNodeId: domainId, freeRect: free }, star, rest.end + FRAME_MS, 1, 2.5, 600);
    const margin = TOKENS.paint.frameMarginPx;
    const { texts } = describeLastDialFrame(W, H)!;
    const outside = texts.filter((t) => capabilities.includes(t.id ?? "") && (t.box.minX < free.minX + margin || t.box.maxX > free.maxX - margin || t.box.minY < free.minY + margin || t.box.maxY > free.maxY - margin));
    expect(outside.map((t) => t.text)).toEqual([]);
  },
);

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "names each member of the opened %s star whose disc stands inside the free map, its name kept inside it along its row",
  (domainId) => {
    const { capabilities, elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const margin = TOKENS.paint.frameMarginPx;
    const unnamed: string[] = [];
    for (const edge of [-60, 0, 60, 120, 180, 240]) {
      const camera = cameraOn(domainId, {});
      const free = { minX: 0, minY: 0, maxX: W / 2 + edge, maxY: H };
      const rest = framesUntilSettled(camera, { freeRect: free }, star, 0, 1, 1, FRAME_MS);
      framesUntilSettled(camera, { focusedNodeId: domainId, freeRect: free }, star, rest.end + FRAME_MS, 1, 2.5, 600);
      const { texts, discs } = describeLastDialFrame(W, H)!;
      const inside = capabilities.filter((id) => discs.some((d) => d.id === id && d.x > INSET_PX && d.x + d.r < free.maxX - margin && d.y > INSET_PX && d.y < H - INSET_PX));
      unnamed.push(...inside.filter((id) => !texts.some((t) => t.id === id && t.role === "capability")).map((id) => `${id} with the free map ending ${edge} px past the middle`));
    }
    expect(unnamed).toEqual([]);
  },
);

/** Where each member name in `ids` the last frame drew stands from its disc. */
function nameOffsets(ids: readonly string[]): Map<string, string> {
  const { texts, discs } = describeLastDialFrame(W, H)!;
  return new Map(texts.filter((t) => t.role === "capability" && ids.includes(t.id ?? "")).map((t) => {
    const d = discs.find((x) => x.id === t.id)!;
    return [t.id!, `${Math.round(t.box.minX - d.x)},${Math.round(t.box.minY - d.y)}`];
  }));
}

/**
 * Each name in `moved` the last frame drew across the line from its domain while a side on its row was
 * clear of every line from the domain, of names, of discs not its own and grown dots, and inside the
 * free map by the margin; the clear side is padded so a side the step's zoom sweep may close is not asked for.
 */
function namesOnSpokes(domainId: string, capabilities: readonly string[], moved: ReadonlySet<string>, free: { minX: number; minY: number; maxX: number; maxY: number }): string[] {
  const { texts, discs, glyphs } = describeLastDialFrame(W, H)!;
  const P = TOKENS.paint;
  const hub = discs.find((d) => d.id === domainId)!;
  const spokes = capabilities.flatMap((id) => discs.filter((d) => d.id === id)).map((d) => [hub.x, hub.y, d.x, d.y] as const);
  const onSpoke = (b: Probe["texts"][number]["box"]) => spokes.some(([x0, y0, x1, y1]) => segmentCrossesBox(x0, y0, x1, y1, b));
  const under = (b: Probe["texts"][number]["box"], m: Mark) => Math.hypot(Math.max(b.minX - m.x, 0, m.x - b.maxX), Math.max(b.minY - m.y, 0, m.y - b.maxY)) < m.r;
  const breaches: string[] = [];
  for (const t of texts.filter((x) => x.role === "capability" && moved.has(x.id ?? ""))) {
    const disc = discs.find((d) => d.id === t.id)!;
    if (!segmentCrossesBox(hub.x, hub.y, disc.x, disc.y, t.box)) continue;
    const w = t.box.maxX - t.box.minX;
    const h = t.box.maxY - t.box.minY;
    const x = disc.r + P.nameGapPx;
    const pad = P.namePadPx * 2;
    const box = (dx0: number, dy0: number) => ({ minX: disc.x + dx0 - pad, maxX: disc.x + dx0 + w + pad, minY: disc.y + dy0 - pad, maxY: disc.y + dy0 + h + pad });
    const row = [box(x, -h / 2), box(-x - w, -h / 2), box(-w / 2, x), box(-w / 2, -x - h)];
    const clear = row.find((b) => !onSpoke(b)
      && b.minX >= free.minX + P.frameMarginPx && b.maxX <= free.maxX - P.frameMarginPx && b.minY >= free.minY + P.frameMarginPx && b.maxY <= free.maxY - P.frameMarginPx
      && !texts.some((o) => o !== t && Math.min(b.maxX, o.box.maxX) > Math.max(b.minX, o.box.minX) && Math.min(b.maxY, o.box.maxY) > Math.max(b.minY, o.box.minY))
      && !discs.some((d) => d.id !== t.id && under(b, d)) && !glyphs.some((g) => g.grown && under(b, g)));
    if (clear) breaches.push(t.text);
  }
  return breaches;
}

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "moves a member of the opened %s star whose side leaves the free map off the line from its domain while a side on its row is clear, the panel closed or open",
  (domainId) => {
    const { capabilities, elements } = domainStarIds(model, domainId);
    const star = new Set([domainId, ...capabilities, ...elements]);
    const lens = { contextAlphas: new Map([...layout.positions.keys()].map((id) => [id, 1])) };
    const breaches: string[] = [];
    for (const over of [{}, lens]) {
      for (const [zoom, edge] of [1.8, 2, 2.5, 3.2].flatMap((z) => [0, 30, 60, 120, 180, 240].map((e) => [z, e] as const))) {
        const sides: Map<string, string>[] = [];
        const free = { minX: 0, minY: 0, maxX: W / 2 + edge, maxY: H };
        for (const freeRect of [{ minX: 0, minY: 0, maxX: W, maxY: H }, free]) {
          const camera = cameraOn(domainId, {});
          const rest = framesUntilSettled(camera, { ...over, freeRect }, star, 0, 1, 1, FRAME_MS);
          framesUntilSettled(camera, { ...over, focusedNodeId: domainId, freeRect }, star, rest.end + FRAME_MS, 1, zoom, 600);
          sides.push(nameOffsets(capabilities));
        }
        const moved = new Set([...sides[1]!].filter(([id, at]) => sides[0]!.get(id) !== at).map(([id]) => id));
        breaches.push(...namesOnSpokes(domainId, capabilities, moved, free).map((text) => `${text} at ${zoom} with the free map ending ${edge} px past the middle${over === lens ? ", panel open" : ""}`));
      }
    }
    expect(breaches).toEqual([]);
  },
);

/** Glyph width per em of a font a sixth wider than the 0.6 em the map measures without a canvas, as a wider system font sets it. */
const WIDE_EM = 0.7;

/**
 * Six domains of six capabilities with three elements each, every domain's hub needing three of its
 * siblings, one capability of the next domain and two siblings' elements, and needed by two siblings:
 * a hub lights five far ends in its own domain, whose names carry long titles.
 */
const HUB_DOMAINS = ["orders", "catalog", "payments", "shipping", "returns", "inventory"];

function hubModel(): DialModel {
  const names = HUB_DOMAINS;
  const nodes: TreeInputNode[] = [{ id: "project:p", label: "Atlas", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const cap = (d: number, c: number) => `capability:${names[d % names.length]}-${c}`;
  names.forEach((name, d) => {
    nodes.push({ id: `domain:${name}`, label: name, kind: "domain" });
    edges.push({ source: "project:p", target: `domain:${name}`, kind: "contains", relationType: "contains" });
    for (let c = 0; c < 6; c += 1) {
      nodes.push({ id: cap(d, c), label: c === 0 ? `${name} hub` : `${name} step ${c} named at length`, kind: "capability" });
      edges.push({ source: `domain:${name}`, target: cap(d, c), kind: "contains", relationType: "contains" });
      for (let e = 0; e < 3; e += 1) {
        nodes.push({ id: `element:${name}-${c}-${e}`, label: `${name}-${c}-${e}`, kind: "element" });
        edges.push({ source: cap(d, c), target: `element:${name}-${c}-${e}`, kind: "contains", relationType: "contains" });
      }
    }
    const needs = [cap(d, 1), cap(d, 2), cap(d, 3), cap(d + 1, 1), ...[1, 2].flatMap((c) => [0, 1, 2].map((e) => `element:${name}-${c}-${e}`))];
    for (const to of needs) edges.push({ source: cap(d, 0), target: to, kind: "depends", relationType: "depends_on" });
    for (const c of [4, 5]) edges.push({ source: cap(d, c), target: cap(d, 0), kind: "depends", relationType: "depends_on" });
  });
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  return buildDialModel({
    tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)),
    elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id), relates: rollRelatesCapabilityPairs(tree, edges), direct: directRelations(edges),
  });
}

it("names each far end of a selected capability inside its domain whenever a side of it is clear of names and of discs not its own, its text set wider", () => {
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => silentContext((text, font) => text.length * Number.parseFloat(font.split(" ")[1] ?? "10") * WIDE_EM) as never,
  );
  try {
    const wide = hubModel();
    const names = HUB_DOMAINS;
    const world = { model: wide, scene: buildFlatGraphScene(wide, TOKENS.layout, null) };
    const P = TOKENS.paint;
    const unnamed: string[] = [];
    for (const [id, cap] of [...wide.capabilityById].filter(([x]) => x.endsWith("-0"))) {
      const farEnds = [...cachedGraphAttention(wide, id, true).named].filter((x) => x !== id && wide.capabilityById.get(x)?.domainId === cap.domainId);
      if (farEnds.length === 0) continue;
      const partner = id.replace(/([^:]+)-0$/, (_, name: string) => `${names[(names.indexOf(name) + 1) % names.length]}-1`);
      for (const [zoom, free] of [1.7, 1.8, 1.85, 1.9, 1.95, 2, 2.1, 2.2].flatMap((z) => [{ minX: 0, minY: 0, maxX: W, maxY: H }, { minX: 0, minY: 0, maxX: W - 380, maxY: H }].map((f) => [z, f] as const))) {
        const camera = cameraOn(id, {}, world);
        const before = framesUntilSettled(camera, { focusedNodeId: partner, freeRect: free }, new Set(), 0, zoom, zoom, FRAME_MS);
        framesUntilSettled(camera, { focusedNodeId: id, freeRect: free }, new Set(), before.end + FRAME_MS, zoom, zoom, FRAME_MS);
        const { texts, discs } = describeLastDialFrame(W, H)!;
        for (const end of farEnds.filter((x) => !texts.some((t) => t.id === x && t.role === "capability"))) {
          const disc = discs.find((d) => d.id === end);
          if (!disc) continue;
          const w = wide.capabilityById.get(end)!.label.length * P.capNamePx * WIDE_EM;
          const h = P.capNamePx;
          const x = disc.r + P.nameGapPx;
          const rise = P.capNamePx + P.namePadPx * 2;
          const pad = P.namePadPx * 2;
          const box = (left: number, top: number) => ({ minX: disc.x + left - pad, maxX: disc.x + left + w + pad, minY: disc.y + top - pad, maxY: disc.y + top + h + pad });
          const sides = [box(x, -h / 2), box(-x - w, -h / 2), box(-w / 2, x), box(-w / 2, -x - h), ...[-rise, rise].flatMap((dy) => [box(x, dy - h / 2), box(-x - w, dy - h / 2)])];
          const clear = sides.some((b) => b.minX >= free.minX + P.frameMarginPx && b.maxX <= free.maxX - P.frameMarginPx && b.minY >= free.minY + P.frameMarginPx && b.maxY <= free.maxY - P.frameMarginPx
            && !texts.some((o) => Math.min(b.maxX, o.box.maxX) > Math.max(b.minX, o.box.minX) && Math.min(b.maxY, o.box.maxY) > Math.max(b.minY, o.box.minY))
            && !discs.some((d) => d.id !== end && Math.hypot(Math.max(b.minX - d.x, 0, d.x - b.maxX), Math.max(b.minY - d.y, 0, d.y - b.maxY)) < d.r));
          if (clear) unnamed.push(`${end} with ${id} selected after ${partner} at zoom ${zoom}, the free map ${free.maxX} wide`);
        }
        clearDialFrame();
      }
    }
    expect(unnamed).toEqual([]);
  } finally {
    getContext.mockRestore();
  }
});

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

  it("settles a mark whose room at this zoom is smaller than its opened radius", () => {
    const camera = cameraOn("domain:agent-access", {});
    const opened = framesUntilSettled(camera, { focusedNodeId: "domain:agent-access" }, new Set(), 0, 1, 1, FRAME_MS);
    expect(() => framesUntilSettled(camera, { focusedNodeId: "capability:in-app-coding-agent" }, new Set(), opened.end + FRAME_MS, 1, 1, FRAME_MS)).not.toThrow();
  });

  // An element's dot draws only once the reader has zoomed in.
  it.each([
    ["capability:repo-structure-analysis", 1],
    ["domain:code-evidence", 1],
    [model.capabilityById.get("capability:repo-structure-analysis")!.elementIds[0]!, 4],
  ] as const)(
    "grows %s under the pointer at zoom %s by the hover growth without a jump, and gives it back when the pointer leaves",
    (id, zoom) => {
      const camera = cameraOn(id, {});
      const ids = new Set([id]);
      const rest = framesUntilSettled(camera, {}, ids, 0, zoom, zoom, FRAME_MS);
      const restR = rest.frames.at(-1)!.get(id)!.r;
      const hovered = framesUntilSettled(camera, { hoveredNodeId: id }, ids, rest.end + FRAME_MS, zoom, zoom, FRAME_MS);
      const left = framesUntilSettled(camera, {}, ids, hovered.end + FRAME_MS, zoom, zoom, FRAME_MS);
      const grown = hovered.frames.at(-1)!.get(id)!.r;
      console.log(`[hover growth] ${id} at zoom ${zoom}: ${restR.toFixed(2)} -> ${grown.toFixed(2)} px over ${hovered.frames.length} frames`);
      expect(grown - restR, "grows at least the hover growth").toBeGreaterThanOrEqual(TOKENS.paint.hoverGrowPx - 0.05);
      expect(hovered.frames[0]!.get(id)!.r, "the first hovered frame starts the growth, not ends it").toBeLessThan(grown - 0.5);
      expect(smoothness([rest.frames.at(-1)!, ...hovered.frames, ...left.frames]).pxPerMs).toBeLessThanOrEqual(TOKENS.paint.markPxPerMs + 1e-9);
      expect(left.frames.at(-1)!.get(id)!.r).toBeCloseTo(restR, 3);
    },
  );

  it("takes the hover growth at once under reduced motion", () => {
    const id = "capability:repo-structure-analysis";
    const camera = cameraOn(id, {});
    const ids = new Set([id]);
    const rest = framesUntilSettled(camera, { reducedMotion: true }, ids, 0, 1, 1, FRAME_MS);
    const hovered = framesUntilSettled(camera, { hoveredNodeId: id, reducedMotion: true }, ids, rest.end + FRAME_MS, 1, 1, FRAME_MS);
    expect(hovered.frames[0]!.get(id)!.r).toBeCloseTo(rest.frames.at(-1)!.get(id)!.r + TOKENS.paint.hoverGrowPx, 3);
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

/** Each admitted name's drawn ink per 16 ms frame from `from` until the motion settles, at a fixed zoom. */
function nameInks(camera: ReturnType<typeof cameraOn>, over: Partial<DialFrameInput>, from: number, zoom: number): { frames: Map<string, number>[]; end: number } {
  const frames: Map<string, number>[] = [];
  for (let i = 0, now = from; i < 400; i += 1, now += FRAME_MS) {
    const result = paintFlatGraphFrame(camera(zoom, { ...over, now }), TOKENS);
    frames.push(paintedInks());
    if (!result.branchMembersAnimating) return { frames, end: now };
  }
  throw new Error("the names never settled");
}

/** Every name the last frame painted, a name no longer admitted included while its ink runs out. */
function paintedInks(): Map<string, number> {
  const probe = describeLastDialFrame(W, H)!;
  return new Map([...probe.texts, ...probe.fadingTexts].map((t) => [`${t.role} ${t.id} ${t.side}`, t.alpha]));
}

/** Paints a press's path, the camera travelling from the overview's middle to `domainId` at `zoomTo`, and calls `visit` after each of its frames. */
function pressPath(domainId: string, zoomTo: number, visit: (frame: number) => void): void {
  const e = layout.extent;
  const fit = Math.min(W / (e.maxX - e.minX), H / (e.maxY - e.minY));
  const from = { x: (e.minX + e.maxX) / 2, y: (e.minY + e.maxY) / 2 };
  const to = layout.positions.get(domainId)!;
  const worldKey = {};
  const ctx = silentContext();
  const frame = (zoomRatio: number, centre: Point, over: Partial<DialFrameInput>) => {
    const scale = fit * zoomRatio;
    const toScreen = (x: number, y: number): Point => ({ x: W / 2 + (x - centre.x) * scale, y: H / 2 + (y - centre.y) * scale });
    return cameraOn(null, worldKey)(zoomRatio, { ctx, toScreen, scale, nodeScreen: (id) => { const p = layout.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, ...over });
  };
  let now = 0;
  for (let i = 0; i < 30; i += 1, now += FRAME_MS) paintFlatGraphFrame(frame(1, from, { now }), TOKENS);
  visit(0);
  for (let i = 1; i <= 60; i += 1) {
    const s = (1 - Math.cos(Math.PI * Math.min(1, i / 42))) / 2;
    paintFlatGraphFrame(frame(Math.pow(zoomTo, s), { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s }, { now: now + (i - 1) * FRAME_MS, focusedNodeId: domainId }), TOKENS);
    visit(i);
  }
}

/** Name ink steps of 0.2 or more on a press's path to `domainId` at `zoomTo`. */
function inkJumpsOnTheWay(domainId: string, zoomTo: number): string[] {
  const jumps: string[] = [];
  let before = new Map<string, number>();
  pressPath(domainId, zoomTo, (i) => {
    const after = paintedInks();
    if (i > 0) {
      // A name that comes in over the canvas edge takes its ink at once, as the star-motion spec allows.
      const overEdge = new Set(describeLastDialFrame(W, H)!.texts.filter((t) => t.box.minX <= 0 || t.box.minY <= 0 || t.box.maxX >= W || t.box.maxY >= H).map((t) => `${t.role} ${t.id} ${t.side}`));
      for (const [name, alpha] of after) {
        const was = before.get(name) ?? (overEdge.has(name) ? alpha : 0);
        if (Math.abs(alpha - was) >= 0.2) jumps.push(`frame ${i}: ${name} ${was.toFixed(2)} -> ${alpha.toFixed(2)}`);
      }
    }
    before = after;
  });
  return jumps;
}

/**
 * Every name on a press's path whose ink rises or holds while its glyphs cross a disc not its own,
 * another name doing the same, or an element dot grown past its resting radius while it draws on
 * no backing. A name whose ink falls is on its way out and may be crossed.
 */
function arrivalBreachesOnTheWay(domainId: string, zoomTo: number): string[] {
  const breaches: string[] = [];
  let before = new Map<string, number>();
  pressPath(domainId, zoomTo, (i) => {
    const probe = describeLastDialFrame(W, H)!;
    const key = (t: Probe["texts"][number]) => `${t.role} ${t.id} ${t.side}`;
    const arriving = [...probe.texts, ...probe.fadingTexts].filter((t) => t.id !== null && t.alpha >= (before.get(key(t)) ?? 0));
    const under = (b: Probe["texts"][number]["box"], m: Mark) => Math.hypot(Math.max(b.minX - m.x, 0, m.x - b.maxX), Math.max(b.minY - m.y, 0, m.y - b.maxY)) < m.r - 0.5;
    arriving.forEach((n, k) => {
      for (const d of probe.discs) if (d.id !== n.id && under(n.box, d)) breaches.push(`frame ${i}: ${n.role} ${n.text} on ${d.id}`);
      for (const g of probe.glyphs) if (g.id !== n.id && g.grown && !n.backed && under(n.box, g)) breaches.push(`frame ${i}: ${n.role} ${n.text} on grown ${g.id}`);
      for (const o of arriving.slice(k + 1)) {
        if (o.id === n.id && CAPTION_ROLES.has(o.role) && CAPTION_ROLES.has(n.role)) continue;
        const b = n.box;
        if (Math.min(b.maxX, o.box.maxX) > Math.max(b.minX, o.box.minX) && Math.min(b.maxY, o.box.maxY) > Math.max(b.minY, o.box.minY)) breaches.push(`frame ${i}: ${n.role} ${n.text} on ${o.role} ${o.text}`);
      }
    });
    before = paintedInks();
  });
  return breaches;
}

it.each(["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"])(
  "lets a name's ink rise or hold on the way to the pressed %s only where the frame drawn leaves it clear",
  (domainId) => {
    expect(arrivalBreachesOnTheWay(domainId, 3).slice(0, 6)).toEqual([]);
  },
);

describe("a name's drawn ink across frames", () => {
  it.each(["domain:human-workbench", "domain:code-evidence", "domain:agent-access"])(
    "changes by less than 0.2 a frame while the %s star opens and a member is pressed",
    (domainId) => {
      const member = domainStarIds(model, domainId).capabilities[0]!;
      const camera = cameraOn(domainId, {});
      const rest = nameInks(camera, {}, 0, 3.6);
      const opened = nameInks(camera, { focusedNodeId: domainId }, rest.end + FRAME_MS, 3.6);
      const pressed = nameInks(camera, { focusedNodeId: member }, opened.end + FRAME_MS, 3.6);
      const frames = [rest.frames.at(-1)!, ...opened.frames, ...pressed.frames];
      const jumps: string[] = [];
      for (let i = 1; i < frames.length; i += 1) {
        for (const [name, alpha] of frames[i]!) {
          const was = frames[i - 1]!.get(name) ?? 0;
          if (Math.abs(alpha - was) >= 0.2) jumps.push(`frame ${i}: ${name} ${was.toFixed(2)} -> ${alpha.toFixed(2)}`);
        }
      }
      expect(jumps.slice(0, 6)).toEqual([]);
    },
  );

  it.each(["domain:code-evidence", "domain:agent-access"])(
    "changes by less than 0.2 a frame while the camera travels to the pressed %s, a name that leaves the admitted set included",
    (domainId) => {
      expect(inkJumpsOnTheWay(domainId, 4.5).slice(0, 6)).toEqual([]);
    },
  );

  it("takes its ink at once under reduced motion", () => {
    const camera = cameraOn("domain:code-evidence", {});
    nameInks(camera, { reducedMotion: true }, 0, 3.6);
    const opened = nameInks(camera, { reducedMotion: true, focusedNodeId: "domain:code-evidence" }, 10_000, 3.6);
    expect([...opened.frames[0]!]).toEqual([...opened.frames.at(-1)!]);
  });
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

  it.each([["closed", {}], ["open", { contextAlphas: new Map([...layout.positions.keys()].map((id) => [id, 1])) }]] as const)(
    "with the dock %s draws no domain caption over a disc not its own at any zoom",
    (_, dock) => {
      const camera = cameraOn(null, {});
      const onDiscs: string[] = [];
      let now = 0;
      for (const zoom of sweep) {
        framesUntilSettled(camera, dock, new Set(), now, zoom, zoom, FRAME_MS);
        now += 10_000;
        const { texts, discs } = describeLastDialFrame(W, H)!;
        for (const t of texts.filter((n) => CAPTION_ROLES.has(n.role))) {
          for (const d of discs) {
            if (d.id !== t.id && Math.hypot(Math.max(t.box.minX - d.x, 0, d.x - t.box.maxX), Math.max(t.box.minY - d.y, 0, d.y - t.box.maxY)) < d.r - 0.5) onDiscs.push(`zoom ${zoom}: ${t.role} ${t.id} on ${d.id}`);
          }
        }
      }
      expect(onDiscs.slice(0, 6)).toEqual([]);
    },
  );

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


  it("settles at once under reduced motion", () => {
    const camera = cameraOn(domainId, {});
    framesUntilSettled(camera, { reducedMotion: true }, star, 0, 3.6, 3.6, FRAME_MS);
    const opened = framesUntilSettled(camera, { reducedMotion: true, focusedNodeId: domainId }, star, 100, 3.6, 3.6, FRAME_MS);
    const radii = (frame: Map<string, Mark>) => [...frame].map(([id, m]) => [id, m.r.toFixed(3)]);
    expect(radii(opened.frames[0]!), "the first frame draws the opened star").toEqual(radii(opened.frames.at(-1)!));
  });
});

/**
 * Every frame on a path to `domainId`'s star in `free`, the camera easing to `zoomTo` and then
 * panning up to `panPx` around it, in which a member's capability name begins rising after another
 * member's name under it began fading: the place is handed over, so the second waits for the first
 * to go. A swap that begins in one frame is admission trading a zoom step's names, not a hand-over.
 */
function handOverBreaches(domainId: string, free: { minX: number; minY: number; maxX: number; maxY: number }, zoomTo: number, panPx: number): string[] {
  const members = new Set(domainStarIds(model, domainId).capabilities);
  const e = layout.extent;
  const fit = Math.min((free.maxX - free.minX) / (e.maxX - e.minX), (free.maxY - free.minY) / (e.maxY - e.minY));
  const centre = layout.positions.get(domainId)!;
  const middle = { x: (free.minX + free.maxX) / 2, y: (free.minY + free.maxY) / 2 };
  const camera = cameraOn(domainId, {}, { model, scene }, free);
  const breaches: string[] = [];
  let before = new Map<string, number>();
  let trend = new Map<string, number>();
  const since = new Map<string, number>();
  for (let i = 0, now = 0; i < 260; i += 1, now += FRAME_MS) {
    const zoom = Math.pow(zoomTo, (1 - Math.cos(Math.PI * Math.min(1, i / 36))) / 2);
    const turn = Math.max(0, i - 36) / 50;
    const pan = { x: Math.sin(turn) * panPx, y: Math.sin(turn * 0.7) * panPx * 0.6 };
    const scale = fit * zoom;
    const toScreen = (x: number, y: number): Point => ({ x: middle.x + pan.x + (x - centre.x) * scale, y: middle.y + pan.y + (y - centre.y) * scale });
    const nodeScreen = (id: string) => { const p = layout.positions.get(id); return p ? toScreen(p.x, p.y) : null; };
    paintFlatGraphFrame(camera(zoom, { toScreen, nodeScreen, scale, now, focusedNodeId: domainId }), TOKENS);
    const probe = describeLastDialFrame(W, H)!;
    const names = [...probe.texts, ...probe.fadingTexts].filter((t) => t.role === "capability" && t.id !== null && members.has(t.id));
    const key = (t: (typeof names)[number]) => `${t.id} ${t.side}`;
    const signs = new Map<string, number>();
    for (const t of names) {
      const sign = Math.sign(t.alpha - (before.get(key(t)) ?? 0));
      if (!before.has(key(t)) || sign !== trend.get(key(t))) since.set(key(t), i);
      signs.set(key(t), sign);
    }
    for (const t of names) {
      if (signs.get(key(t))! <= 0) continue;
      for (const o of names) {
        if (o.id === t.id || signs.get(key(o))! >= 0 || since.get(key(t))! <= since.get(key(o))!) continue;
        if (Math.min(t.box.maxX, o.box.maxX) - Math.max(t.box.minX, o.box.minX) > 1 && Math.min(t.box.maxY, o.box.maxY) - Math.max(t.box.minY, o.box.minY) > 1) {
          breaches.push(`frame ${i}: ${t.id} rises to ${t.alpha.toFixed(2)} over ${o.id} fading at ${o.alpha.toFixed(2)}`);
        }
      }
    }
    before = new Map(names.map((t) => [key(t), t.alpha]));
    trend = signs;
  }
  return breaches;
}

describe("an opened star's member names while the camera pans the narrow free map", () => {
  it.each([[2.2, 40], [2.2, 120], [3, 40]])(
    "hand a place over at zoom %s and a %s px pan: a member's name begins rising only once no other member's name under it is fading",
    (zoom, pan) => {
      expect(handOverBreaches("domain:human-workbench", NARROW_FREE, zoom, pan).slice(0, 6)).toEqual([]);
    },
  );
});

describe("an open star in a rebuilt world", () => {
  it("names each star's members clear of the discs of the world it draws, whatever the last world painted", () => {
    // Each world counts its frames from 1, so a world that paints once leaves state stamped with the
    // same frame number the next world's first frame carries.
    const over: string[] = [];
    const pad = TOKENS.paint.namePadPx;
    for (const domainId of ["domain:human-workbench", "domain:code-evidence", "domain:meaning-layer", "domain:agent-access"]) {
      const { capabilities } = domainStarIds(model, domainId);
      for (const lastFrames of [1, 2]) {
        const last = cameraOn(domainId, {});
        for (let i = 0; i < lastFrames; i += 1) paintFlatGraphFrame(last(2.5, { focusedNodeId: domainId, now: i * FRAME_MS }), TOKENS);
        const rebuilt = cameraOn(capabilities[0]!, {});
        paintFlatGraphFrame(rebuilt(2.2, { focusedNodeId: domainId, now: 10 * FRAME_MS }), TOKENS);
        const { texts, discs } = describeLastDialFrame(W, H)!;
        for (const t of texts) {
          if (t.role !== "capability" || !capabilities.includes(t.id ?? "")) continue;
          for (const m of discs) {
            if (m.id === t.id || m.id === null) continue;
            const dx = Math.max(t.box.minX + pad - m.x, 0, m.x - (t.box.maxX - pad));
            const dy = Math.max(t.box.minY + pad - m.y, 0, m.y - (t.box.maxY - pad));
            if (Math.hypot(dx, dy) - m.r <= -0.5) over.push(`${domainId} after ${lastFrames}: ${t.id} over ${m.id}`);
          }
        }
      }
    }
    expect(over).toEqual([]);
  });
});

describe("room round a growing mark", () => {
  /** Edge-to-edge screen air every mark keeps from the one a selection or hover grows; a hair under the rule's 6 px for float error. */
  const LEAST_AIR_PX = 5.9;
  const ring = TOKENS.paint.selectedRingGapPx + TOKENS.paint.selectedRingPx;
  const settledMarks = (zoom: number, over: Partial<DialFrameInput>) => {
    const camera = cameraOn(null, {});
    for (let i = 0, now = 0; i < 90; i += 1, now += FRAME_MS) paintFlatGraphFrame(camera(zoom, { ...over, now }), TOKENS);
    const probe = describeLastDialFrame(W, H)!;
    return [...probe.discs, ...probe.glyphs].filter((m) => m.id !== null && m.r > 0.5 && m.x > 0 && m.y > 0 && m.x < W && m.y < H);
  };
  /** The least edge-to-edge air between `grower` (its ring counted when selected) and any other drawn mark. */
  const leastAir = (marks: ReturnType<typeof settledMarks>, grower: string | null, selected: string | null) => {
    let least = Infinity;
    for (const [i, a] of marks.entries()) for (const b of marks.slice(i + 1)) {
      if (grower !== null && a.id !== grower && b.id !== grower) continue;
      const reach = (m: typeof a) => m.r + (m.id === selected ? ring : 0);
      least = Math.min(least, Math.hypot(a.x - b.x, a.y - b.y) - reach(a) - reach(b));
    }
    return least;
  };
  const growers = [...model.capabilityById.keys(), ...[...model.capabilityById.values()].flatMap((c) => c.elementIds)];

  it.each([[1], [1.6]])("keeps every drawn mark 6 px clear of another at rest, and of the mark a selection or hover grows, at %fx the overview", (zoom) => {
    expect(leastAir(settledMarks(zoom, {}), null, null)).toBeGreaterThanOrEqual(LEAST_AIR_PX);
    const crowded: string[] = [];
    for (const id of growers) {
      if (leastAir(settledMarks(zoom, { focusedNodeId: id }), id, id) < LEAST_AIR_PX) crowded.push(`selected ${id}`);
      if (leastAir(settledMarks(zoom, { hoveredNodeId: id }), id, null) < LEAST_AIR_PX) crowded.push(`hovered ${id}`);
    }
    expect(crowded).toEqual([]);
  });
});

describe("a selection's ends and name", () => {
  /** Settles a selection of `id` with the camera framed on the whole canvas, the frame told `free` is the map left clear. */
  const settle = (id: string, zoom: number, free = { minX: 0, minY: 0, maxX: W, maxY: H }) => {
    const camera = cameraOn(id, {});
    for (let i = 0, now = 0; i < 90; i += 1, now += FRAME_MS) paintFlatGraphFrame(camera(zoom, { focusedNodeId: id, freeRect: free, now }), TOKENS);
  };
  const capabilities = [...model.capabilityById.keys()];

  it("names an end the panel cuts once: by its edge tag, its disc and name gone", () => {
    const twice: string[] = [];
    let cut = 0;
    for (const id of capabilities) {
      settle(id, 1.6);
      const lit = frameState.attention.lit;
      const self = framePlan.discs.find((d) => d.id === id);
      const end = framePlan.discs.find((d) => d.id !== id && lit?.has(d.id) === true && d.ink > 0.5 && self !== undefined && d.x > self.x + 40 && d.x < W);
      if (!end) continue;
      // A right panel whose edge runs half a pixel short of that end's centre.
      const free = { minX: 0, minY: 0, maxX: end.x - 0.5, maxY: H };
      settle(id, 1.6, free);
      const d = framePlan.discs.find((m) => m.id === end.id);
      if (!d || d.x < free.maxX) continue;
      cut += 1;
      if (d.ink > 0.01) twice.push(`${id} -> ${d.id} disc ${d.ink.toFixed(2)}`);
      if (framePlan.names.some((n) => n.name.id === d.id && n.ink > 0.01)) twice.push(`${id} -> ${d.id} name`);
      if (exitedShare(d.id) < 1) twice.push(`${id} -> ${d.id} no tag`);
    }
    expect(cut).toBeGreaterThan(2);
    expect(twice).toEqual([]);
  });

  it("keeps every other capability clear of the edge the selection's name reads from", () => {
    const lead = 47.5;
    const crowded: string[] = [];
    for (const zoom of [1, 1.6]) for (const id of capabilities) {
      settle(id, zoom);
      const box = frameState.selectedNameBox;
      if (box === null) continue;
      const owner = model.capabilityOf.get(id);
      for (const d of framePlan.discs) {
        if (d.id === id || d.id === owner || d.y < box.minY || d.y > box.maxY || d.x >= box.minX) continue;
        if (box.minX - (d.x + d.r) < lead) crowded.push(`${zoom}x ${id}: ${d.id} ${(box.minX - d.x - d.r).toFixed(1)} px`);
      }
    }
    expect(crowded).toEqual([]);
  });
});
