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

type Mark = { x: number; y: number; r: number };

/** A camera centred on `centreId`, at a zoom given per frame as a ratio of the fitting scale. */
function cameraOn(centreId: string, worldKey: object) {
  const e = layout.extent;
  const fit = Math.min(W / (e.maxX - e.minX), H / (e.maxY - e.minY));
  const centre = layout.positions.get(centreId)!;
  const ctx = silentContext();
  return (zoomRatio: number, over: Partial<DialFrameInput>): DialFrameInput => {
    const scale = fit * zoomRatio;
    const toScreen = (x: number, y: number): Point => ({ x: W / 2 + (x - centre.x) * scale, y: H / 2 + (y - centre.y) * scale });
    return {
      ctx, dial: { model, scene, overviewPadPx: { left: 0, right: 0, top: 0, bottom: 0 }, labels: LABELS }, worldKey,
      nodeScreen: (id) => { const p = layout.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen, scale, zoomRatio,
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
