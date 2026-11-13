import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import docsManifest from "@/entities/docs-vault/data/manifest.json";
import storefrontManifest from "@/entities/docs-vault/data/sample-storefront.manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";
import type { CameraTarget } from "../../../engine/camera";
import { buildDialModel } from "../../../dial/dial-model";
import type { DialLabels, DialModel, DialWorld } from "../../../dial/types";
import { cachedGraphAttention } from "../../../flat-graph/attention";
import { graphDiscRadiusPx, zoomGrowth } from "../../../flat-graph/marks";
import { admitNamesAt, domainTitleBlocks, stepScale, zoomStep } from "../../../flat-graph/names";
import { buildFlatGraphScene } from "../../../flat-graph/scene";
import { resolveFlatGraphTokens } from "../../../flat-graph/tokens";
import {
  directRelations, readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesCapabilityPairs,
  rollRelatesDomainPairs, type TreeInputEdge, type TreeInputNode,
} from "../../../model/containment-tree";
import type { TopologyWorld } from "../../world/topology-world";
import { computeOverviewCameraTarget, computeOverviewFitScale, overviewEntryArea } from "../topology-camera-math";

const TOKENS = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../flat-graph/tokens", async (actual) => ({ ...(await actual<object>()), readFlatGraphTokens: () => TOKENS.current }));
vi.mock("../../../dial/fit", () => ({ createMeasureText: () => measureText }));
vi.mock("../../../render/labels", async (actual) => ({ ...(await actual<object>()), labelFontFamily: () => "sans-serif" }));

import { selectionSlideTarget } from "./selection-margin";

function measureText(text: string, font: string): number {
  return text.length * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 12) * 0.6;
}

function cssValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of ["app/styles/map-graph-tokens.css", "app/styles/tokens.css", "app/styles/base-map-tokens.css"]) {
    const css = readFileSync(join(process.cwd(), file), "utf8");
    for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) if (!values.has(m[1]!)) values.set(m[1]!, m[2]!.trim());
  }
  return values;
}

const tokens = resolveFlatGraphTokens((v) => cssValues().get(v) ?? "");
TOKENS.current = tokens;
const paint = tokens.paint;

function vaultModel(manifest: unknown): { model: DialModel; titles: Map<string, string> } {
  const d = deriveOntologyFromVault(manifest as VaultManifest);
  const kinds = new Set(["project", "domain", "capability", "element"]);
  const titles = new Map<string, string>();
  const treeNodes: TreeInputNode[] = (d.nodes as { id: string; kind: string; title?: string }[])
    .filter((n) => kinds.has(n.kind))
    .map((n) => {
      titles.set(n.id, n.title ?? n.id);
      return { id: n.id, label: n.title ?? n.id, kind: n.kind as TreeInputNode["kind"] };
    });
  const treeEdges: TreeInputEdge[] = (d.edges as { from: string; to: string; type: string }[]).map((e) => ({
    source: e.from, target: e.to, kind: isContainmentRelation(e.type) ? "contains" : "depends", relationType: e.type,
  }));
  const tree = readContainmentTree(treeNodes, treeEdges);
  const dependencies = rollDomainDependencies(tree, treeEdges);
  const model = buildDialModel({
    tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges)),
    elementIds: treeNodes.filter((n) => n.kind === "element").map((n) => n.id),
    relates: rollRelatesCapabilityPairs(tree, treeEdges), direct: directRelations(treeEdges),
  });
  return { model, titles };
}

const LABELS = { units: (c: number, e: number) => `${c} capabilities · ${e} elements`, stale: (n: number) => `${n} stale`, orphans: (n: number) => `${n} unplaced` } as unknown as DialLabels;
/** Both side panels open: the explorer's edge and the detail panel's width as the map measures them. */
const PANELS = { left: 376, right: 384, top: 148, bottom: 96 };
const INSETS = { safeInsetLeft: PANELS.left, safeInsetRight: PANELS.right, safeInsetTop: PANELS.top, safeInsetBottom: PANELS.bottom, overviewEntryRatio: 0.95, cameraMaxZoomRatio: 3.2, cameraScaleMax: 2.6 };

/** A vault laid out as the map lays it out for a canvas, at rest on its overview. */
function vaultMap(manifest: unknown, viewport: { width: number; height: number }) {
  const { model, titles } = vaultModel(manifest);
  const pad = paint.domainNamePx;
  const padPx = { left: pad, right: pad, top: pad, bottom: pad };
  const overview = {
    safeInsetLeft: PANELS.left, safeInsetRight: 112, safeInsetTop: PANELS.top, safeInsetBottom: PANELS.bottom, obstacleInsetLeft: 324, obstacleInsetRight: 64,
    cameraScaleMax: 2.6, cameraScaleMin: 0.24, cameraSmallGraphScaleMax: 1.3, overviewEntryRatio: 0.95,
  };
  const area = overviewEntryArea(viewport.width, viewport.height, overview as never, { padPx });
  const titleBlocks = domainTitleBlocks({ model, tokens: paint, labels: LABELS, measureText, fontFamily: "sans-serif" });
  const scene = buildFlatGraphScene(model, tokens.layout, null, { areaPx: area, titles: titleBlocks, capDiscPx: paint.capDiscMaxPx });
  const layout = scene.graph!;
  const at = (id: string) => layout.positions.get(id) ?? layout.itemAt.get(id)!;
  const ids = [...new Set([...model.capabilityOf.keys(), ...layout.positions.keys()])].filter((id) => at(id));
  const world = { nodeById: new Map(ids.map((id) => [id, { id, label: titles.get(id) ?? id, ...at(id) }])), dialScaleMax: null } as unknown as TopologyWorld;
  const dial = { model, scene, labels: LABELS } as unknown as DialWorld;
  const fitOptions = { padPx, scaleFloor: 0.02 };
  const fit = computeOverviewFitScale(layout.extent, viewport.width, viewport.height, overview as never, ids.length, fitOptions);
  const rest = computeOverviewCameraTarget(layout.extent, viewport.width, viewport.height, overview as never, ids.length, fitOptions);
  const free = { minX: PANELS.left, maxX: viewport.width - PANELS.right, minY: PANELS.top, maxY: viewport.height - PANELS.bottom };
  /** The frame a selection made at `zoomBase` (the reader's view, by default the camera) takes from `camera`. */
  const frame = (id: string, camera: CameraTarget, zoomBase = camera.tscale) => selectionSlideTarget(world, dial, id, camera, viewport, INSETS, fit, zoomBase);
  /** The selection's own name and reach line as the frame admits them at `camera`, in canvas pixels. */
  const ownNames = (id: string, camera: CameraTarget) => {
    const attention = cachedGraphAttention(model, id, true);
    const step = zoomStep(camera.tscale, paint.zoomStepsPerOctave);
    const growth = zoomGrowth(stepScale(step, paint.zoomStepsPerOctave) / (fit * INSETS.overviewEntryRatio), paint);
    const radius = (of: string) => {
      if (model.domainById.has(of)) return graphDiscRadiusPx("domain", 0, paint, growth);
      const cap = model.capabilityById.get(of);
      return graphDiscRadiusPx(cap || !model.domainOf.has(of) ? "capability" : "element", cap?.elementIds.length ?? 0, paint, growth);
    };
    const admission = admitNamesAt({
      model, layout, tokens: paint, labels: LABELS, measureText, fontFamily: "sans-serif", scale: camera.tscale, growth,
      elementLabel: (of) => titles.get(of) ?? null, staleByDomain: null, lit: attention.lit, focusId: id, selected: true,
      named: attention.named, reach: attention.reach, lines: attention.lines, agentFocusId: null, attentionKey: attention.key,
      discRadius: radius, elementSpacingPx: scene.medianElementPitch * camera.tscale,
    });
    const p = at(id);
    const sx = (p.x - camera.tx) * camera.tscale + viewport.width / 2;
    const sy = (p.y - camera.ty) * camera.tscale + viewport.height / 2;
    return admission.names.filter((n) => n.id === id).map((n) => ({ text: n.text, minX: sx + n.box.minX, maxX: sx + n.box.maxX, minY: sy + n.box.minY, maxY: sy + n.box.maxY }));
  };
  return { model, layout, at, rest, fit, free, frame, ownNames };
}

const inside = (box: { minX: number; maxX: number; minY: number; maxY: number }, free: typeof box) =>
  box.minX >= free.minX - 0.5 && box.maxX <= free.maxX + 0.5 && box.minY >= free.minY - 0.5 && box.maxY <= free.maxY + 0.5;

describe("an element selection's zoom", () => {
  it("keeps the scale it was made at when the far ends of its lines cannot all fit there", () => {
    const viewport = { width: 1512, height: 949 };
    const { model, at, free, frame } = vaultMap(docsManifest, viewport);
    const element = [...model.capabilityOf.keys()]
      .map((id) => {
        const ends = cachedGraphAttention(model, id, true).lines.flatMap((line) => [at(line.from), at(line.to)]);
        return { id, lines: ends.length / 2, span: Math.max(...ends.map((p) => p.x)) - Math.min(...ends.map((p) => p.x)) };
      })
      .filter((e) => e.lines >= 3)
      .sort((a, b) => b.span - a.span)[0]!;
    // Far ends twice wider than the free map, the element's own corner of the map well inside it.
    const scale = (2 * (free.maxX - free.minX)) / element.span;
    const home = at(element.id);
    const target = frame(element.id, { tx: home.x, ty: home.y, tscale: scale });
    expect(target?.tscale ?? scale, `${element.id}: ${element.lines} lines over ${Math.round(element.span * scale)} px at the clicked scale`).toBeLessThanOrEqual(scale + 1e-9);
  });
});

describe("a selection framed between both panels", () => {
  it("keeps the selection's own name inside a free span narrower than its every-side reach", () => {
    const { rest, free, frame, ownNames } = vaultMap(docsManifest, { width: 1216, height: 800 });
    const id = "element:relation-reference-normalizer";
    const landed = frame(id, rest) ?? rest;
    const names = ownNames(id, landed);
    expect(names.length).toBeGreaterThan(0);
    for (const box of names) expect(inside(box, free), `${box.text} [${Math.round(box.minX)}, ${Math.round(box.maxX)}] inside [${free.minX}, ${free.maxX}]`).toBe(true);
  });

  it("zooms a domain out from a zoomed-in view until its own star and names fit, and never in", () => {
    const { model, at, rest, free, frame, ownNames } = vaultMap(docsManifest, { width: 1448, height: 949 });
    const zoomed = rest.tscale * 4;
    let zoomedOut = 0;
    for (const domain of model.domains) {
      const home = at(domain.id);
      const start = { tx: home.x, ty: home.y, tscale: zoomed };
      const landed = frame(domain.id, start) ?? start;
      expect(landed.tscale, domain.id).toBeLessThanOrEqual(zoomed);
      if (landed.tscale < zoomed) zoomedOut += 1;
      for (const box of ownNames(domain.id, landed)) expect(inside(box, free), `${domain.id}: ${box.text}`).toBe(true);
    }
    expect(zoomedOut, "some domain's star outgrows the free map at this zoom").toBeGreaterThan(0);
  });

  it("is a fixed point: framing the view it landed on moves nothing", () => {
    const { rest, frame } = vaultMap(docsManifest, { width: 1448, height: 949 });
    const id = "capability:repo-structure-analysis";
    const landed = frame(id, rest);
    expect(landed, "the first selection frames").not.toBeNull();
    const again = frame(id, landed!, rest.tscale);
    expect(again, `landed at ${JSON.stringify(landed)} from ${rest.tscale.toFixed(3)}, then ${JSON.stringify(again)}`).toBeNull();
  });
});

/** The far ends of a selection's lines, in canvas pixels at `camera`. */
function farEnds(map: ReturnType<typeof vaultMap>, id: string, camera: CameraTarget, viewport: { width: number; height: number }) {
  return cachedGraphAttention(map.model, id, true).lines.flatMap((line) => [line.from, line.to]).map((end) => {
    const p = map.at(end);
    return { id: end, x: (p.x - camera.tx) * camera.tscale + viewport.width / 2, y: (p.y - camera.ty) * camera.tscale + viewport.height / 2 };
  });
}

const pointInside = (p: { x: number; y: number }, free: { minX: number; maxX: number; minY: number; maxY: number }) =>
  p.x >= free.minX - 0.5 && p.x <= free.maxX + 0.5 && p.y >= free.minY - 0.5 && p.y <= free.maxY + 0.5;

describe("an element selection that zooms in", () => {
  it("keeps every far end of its lines inside the free map", () => {
    const viewport = { width: 1448, height: 949 };
    const map = vaultMap(docsManifest, viewport);
    const id = "element:source-receipt-store";
    const landed = map.frame(id, map.rest);
    expect(landed?.tscale ?? 0, "the selection zooms in").toBeGreaterThan(map.rest.tscale);
    for (const end of farEnds(map, id, landed!, viewport)) expect(pointInside(end, map.free), `${end.id} at (${Math.round(end.x)}, ${Math.round(end.y)})`).toBe(true);
  });

  it.each([
    ["docs", 1448, 949, docsManifest], ["docs", 1856, 1080, docsManifest],
    ["storefront", 1448, 949, storefrontManifest], ["storefront", 1856, 1080, storefrontManifest],
  ])("loses no far end and lands in one step across the %s vault at %ix%i", (_, width, height, manifest) => {
    const viewport = { width, height };
    const map = vaultMap(manifest, viewport);
    const entry = map.rest.tscale;
    const starts = [map.rest, { ...map.rest, tscale: entry * 1.6 }, { tx: map.rest.tx + 300 / entry, ty: map.rest.ty, tscale: entry * 2.4 }];
    const ids = [...map.model.capabilityById.keys(), ...map.model.capabilityOf.keys()];
    const lostFarEnds: string[] = [];
    const secondSteps: string[] = [];
    let zoomedElements = 0;
    for (const start of starts) {
      for (const id of ids) {
        const landed = map.frame(id, start) ?? start;
        if (map.frame(id, landed, start.tscale)) secondSteps.push(`${id} from ${start.tscale.toFixed(2)}`);
        if (!map.model.capabilityOf.has(id) || landed.tscale <= start.tscale + 1e-6) continue;
        zoomedElements += 1;
        const lost = farEnds(map, id, landed, viewport).filter((end) => !pointInside(end, map.free));
        if (lost.length) lostFarEnds.push(`${id} from ${start.tscale.toFixed(2)}: ${lost.map((end) => end.id).join(", ")}`);
      }
    }
    expect(zoomedElements, "some element selection zooms in").toBeGreaterThan(0);
    expect(lostFarEnds).toEqual([]);
    expect(secondSteps).toEqual([]);
  });
});

describe("a capability selection that zooms in", () => {
  it.each([
    ["docs", 1448, 949, docsManifest], ["docs", 1856, 1080, docsManifest],
    ["storefront", 1448, 949, storefrontManifest], ["storefront", 1856, 1080, storefrontManifest],
  ])("keeps every far end the panned view shows inside the free map across the %s vault at %ix%i", (_, width, height, manifest) => {
    const viewport = { width, height };
    const map = vaultMap(manifest, viewport);
    const entry = map.rest.tscale;
    const starts = [map.rest, { ...map.rest, tscale: entry * 1.6 }, { tx: map.rest.tx + 300 / entry, ty: map.rest.ty, tscale: entry * 2.4 }];
    const lost: string[] = [];
    let zoomed = 0;
    for (const start of starts) {
      for (const id of map.model.capabilityById.keys()) {
        const landed = map.frame(id, start) ?? start;
        if (landed.tscale <= start.tscale + 1e-6) continue;
        zoomed += 1;
        // A zoom base of zero leaves no zoom-in: the frame only pans.
        const panned = map.frame(id, start, 0) ?? start;
        const shown = new Set(farEnds(map, id, panned, viewport).filter((end) => pointInside(end, map.free)).map((end) => end.id));
        const gone = farEnds(map, id, landed, viewport).filter((end) => shown.has(end.id) && !pointInside(end, map.free));
        if (gone.length) lost.push(`${id} from ${start.tscale.toFixed(2)}: ${gone.map((end) => end.id).join(", ")}`);
      }
    }
    expect(zoomed, "some capability selection zooms in").toBeGreaterThan(0);
    expect(lost).toEqual([]);
  });
});
