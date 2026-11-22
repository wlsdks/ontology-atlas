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
import type { DialLabels, DialModel, DialWorld } from "../../../dial/dial-shapes";
import { cachedGraphAttention } from "../../../flat-graph/attention";
import { elementDotRadiusPx, graphDiscRadiusPx, zoomGrowth } from "../../../flat-graph/marks";
import { admitNamesAt } from "../../../flat-graph/names";
import { domainTitleBlocks, hubBlockReachPx } from "../../../flat-graph/names/titles";
import { stepScale, zoomStep } from "../../../flat-graph/names/zoom-step";
import { domainStarIds, domainStarRooms, openRadiusPx } from "../../../flat-graph/open-star";
import { buildFlatGraphScene } from "../../../flat-graph/scene";
import { resolveFlatGraphTokens } from "../../../flat-graph/tokens";
import {
  directRelations, readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesCapabilityPairs,
  rollRelatesDomainPairs, type TreeInputEdge, type TreeInputNode,
} from "../../../model/containment-tree";
import type { TopologyWorld } from "../../world/topology-world";
import { computeOverviewCameraTarget, computeOverviewFitScale, overviewEntryArea } from "../target/fit-targets";
import { computeEffectiveCameraScaleMax } from "../target/zoom-range";

const TOKENS = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../flat-graph/tokens", async (actual) => ({ ...(await actual<object>()), readFlatGraphTokens: () => TOKENS.current }));
vi.mock("../../../dial/fit", () => ({ createMeasureText: () => measureText }));
const OPEN_STAR = vi.hoisted(() => ({ domainId: null as string | null }));
vi.mock("../../../flat-graph/frame", async (actual) => ({ ...(await actual<object>()), lastOpenedDomainStar: () => OPEN_STAR.domainId }));
vi.mock("../../../render/labels", async (actual) => ({ ...(await actual<object>()), labelFontFamily: () => "sans-serif" }));

import { selectionFrameTarget, type FramedMark } from "../../../model/camera/flat-selection-camera";
import { domainSelectionZoom } from "./graph-selection-zoom";
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
const INSETS = { safeInsetLeft: PANELS.left, safeInsetRight: PANELS.right, safeInsetTop: PANELS.top, safeInsetBottom: PANELS.bottom, overviewEntryRatio: 0.95, cameraMaxZoomRatio: 3.2, cameraScaleMax: 2.6, cameraMinZoomRatio: 0.5, cameraScaleMin: 0.24 };

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
  const scene = buildFlatGraphScene(model, tokens.layout, null, { areaPx: area, titles: titleBlocks, capDiscPx: paint.capDiscMaxPx, hubPx: hubBlockReachPx({ model, tokens: paint }) });
  const layout = scene.graph!;
  const at = (id: string) => layout.positions.get(id) ?? layout.itemAt.get(id)!;
  const ids = [...new Set([...model.capabilityOf.keys(), ...layout.positions.keys()])].filter((id) => at(id));
  const world = { nodeById: new Map(ids.map((id) => [id, { id, label: titles.get(id) ?? id, ...at(id) }])), dialScaleMax: null } as unknown as TopologyWorld;
  const dial = { model, scene, labels: LABELS } as unknown as DialWorld;
  const fitOptions = { padPx, scaleFloor: 0.01 };
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
      discRadius: radius, elementSpacingPx: scene.medianElementPitch * camera.tscale, hubCaption: null,
    });
    const p = at(id);
    const sx = (p.x - camera.tx) * camera.tscale + viewport.width / 2;
    const sy = (p.y - camera.ty) * camera.tscale + viewport.height / 2;
    return admission.names.filter((n) => n.id === id).map((n) => ({ text: n.text, minX: sx + n.box.minX, maxX: sx + n.box.maxX, minY: sy + n.box.minY, maxY: sy + n.box.maxY }));
  };
  /**
   * The names of a selected capability, its domain and the capabilities inside it at the far ends of its lines, admitted at
   * `camera` as the frame admits them with the capability's elements opened round it, in canvas pixels.
   */
  const framedNames = (id: string, camera: CameraTarget) => {
    const attention = cachedGraphAttention(model, id, true);
    const domainId = model.domainOf.get(id)!;
    const near = new Set([id, domainId, ...attention.lines.flatMap((l) => [l.from, l.to]).filter((end) => model.capabilityById.has(end) && model.domainOf.get(end) === domainId)]);
    const step = zoomStep(camera.tscale, paint.zoomStepsPerOctave);
    const stepAt = stepScale(step, paint.zoomStepsPerOctave);
    const growth = zoomGrowth(stepAt / (fit * INSETS.overviewEntryRatio), paint);
    const radius = (of: string) => {
      if (model.domainById.has(of)) return graphDiscRadiusPx("domain", 0, paint, growth);
      const cap = model.capabilityById.get(of);
      if (cap || !model.domainOf.has(of)) return graphDiscRadiusPx("capability", cap?.elementIds.length ?? 0, paint, growth);
      return elementDotRadiusPx(paint, growth, scene.medianElementPitch, stepAt);
    };
    const admission = admitNamesAt({
      model, layout, tokens: paint, labels: LABELS, measureText, fontFamily: "sans-serif", scale: camera.tscale, growth,
      elementLabel: (of) => titles.get(of) ?? null, staleByDomain: null, lit: attention.lit, focusId: id, selected: true, openStarId: id,
      named: attention.named, reach: attention.reach, lines: attention.lines, agentFocusId: null, attentionKey: attention.key,
      discRadius: radius, elementSpacingPx: scene.medianElementPitch * camera.tscale, hubCaption: null,
    });
    return admission.names.filter((n) => near.has(n.id)).map((n) => {
      const p = admission.anchors.get(n.id) ?? at(n.id);
      const sx = (p.x - camera.tx) * camera.tscale + viewport.width / 2;
      const sy = (p.y - camera.ty) * camera.tscale + viewport.height / 2;
      const pad = paint.namePadPx;
      return { label: `${n.role}:${n.id}`, minX: sx + n.box.minX + pad, maxX: sx + n.box.maxX - pad, minY: sy + n.box.minY + pad, maxY: sy + n.box.maxY - pad };
    });
  };
  /** The screen distance between a domain's two closest member capabilities at `camera`. */
  const membersApartPx = (domainId: string, camera: CameraTarget) => {
    const members = model.domainById.get(domainId)!.capabilityIds.map(at);
    let least = Infinity;
    for (const [i, p] of members.entries()) for (const q of members.slice(i + 1)) least = Math.min(least, Math.hypot(p.x - q.x, p.y - q.y) * camera.tscale);
    return least;
  };
  /** Whether a domain's disc and name block, its member discs and their elements, opened at `scale`, outgrow the free map less its margin there. */
  const starFills = (domainId: string, scale: number) => {
    const home = at(domainId);
    const title = titleBlocks.get(domainId)!;
    const domainR = graphDiscRadiusPx("domain", 0, paint, paint.growthMax);
    const half = Math.max(domainR, title.halfWidthPx);
    const boxes = [{ x: home.x, y: home.y, minX: -half, maxX: half, minY: Math.min(-domainR, title.topPx), maxY: Math.max(domainR, title.bottomPx) }];
    const rooms = domainStarRooms(model, layout, domainId, paint);
    const { capabilities, elements } = domainStarIds(model, domainId);
    const ownOf = (id: string) => {
      const capability = model.capabilityById.get(id);
      return graphDiscRadiusPx(capability ? "capability" : "element", capability?.elementIds.length ?? 0, paint, paint.growthMax);
    };
    for (const id of [...capabilities, ...elements]) {
      const room = rooms.get(id)!;
      const r = openRadiusPx(ownOf(id), room, scale, domainR, paint, room.nearestId === null ? 0 : ownOf(room.nearestId));
      boxes.push({ ...at(id), minX: -r, maxX: r, minY: -r, maxY: r });
    }
    const span = (lo: "minX" | "minY", hi: "maxX" | "maxY", axis: "x" | "y") =>
      Math.max(...boxes.map((b) => b[axis] * scale + b[hi])) - Math.min(...boxes.map((b) => b[axis] * scale + b[lo]));
    const margin = paint.frameMarginPx * 2;
    return span("minX", "maxX", "x") > free.maxX - free.minX - margin || span("minY", "maxY", "y") > free.maxY - free.minY - margin;
  };
  return { model, layout, at, rest, fit, free, frame, ownNames, framedNames, membersApartPx, starFills };
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

  it("zooms a domain out from a zoomed-in view only until its star fits, never in", () => {
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

  it.each([
    ["docs", 1410, 840, docsManifest], ["docs", 1920, 1080, docsManifest],
    ["storefront", 1410, 840, storefrontManifest], ["storefront", 1920, 1080, storefrontManifest],
  ])("zooms a domain in until its star fills the free map, its closest members stand the widest separation apart or the camera's deepest zoom, past the ratio cap, in the %s vault at %ix%i", (_, width, height, manifest) => {
    const map = vaultMap(manifest, { width, height });
    const apart = paint.domainApartMaxPx;
    const short: string[] = [];
    const over: string[] = [];
    let pastRatioCap = 0;
    const deepest = computeEffectiveCameraScaleMax(map.fit * INSETS.overviewEntryRatio, INSETS.cameraMaxZoomRatio, INSETS.cameraScaleMax, undefined);
    for (const start of [map.rest, { ...map.rest, tscale: map.rest.tscale / 2 }]) {
      for (const domain of map.model.domains) {
        const landed = map.frame(domain.id, start) ?? start;
        const after = map.membersApartPx(domain.id, landed);
        if (landed.tscale > start.tscale * paint.selectZoomMaxRatio) pastRatioCap += 1;
        if (after > apart * 1.02) over.push(`${domain.id}: ${after.toFixed(1)} px apart at ${landed.tscale.toFixed(3)}`);
        if (after < apart - 1e-6 && landed.tscale < deepest * (1 - 1e-9) && !map.starFills(domain.id, landed.tscale * 1.02)) short.push(`${domain.id} from ${start.tscale.toFixed(3)}: ${after.toFixed(1)} px at ${landed.tscale.toFixed(3)}`);
      }
    }
    expect(pastRatioCap, "a domain selection zooms past the ratio a capability's selection keeps to").toBeGreaterThan(0);
    expect(short, "a domain that stops short of filling the free map").toEqual([]);
    expect(over, "a domain whose closest members stand past the widest separation").toEqual([]);
  });

  it.each([
    ["docs", 1100, 700, docsManifest], ["docs", 1280, 800, docsManifest], ["docs", 1512, 949, docsManifest], ["docs", 1920, 1080, docsManifest],
    ["storefront", 1100, 700, storefrontManifest], ["storefront", 1280, 800, storefrontManifest], ["storefront", 1410, 840, storefrontManifest],
  ])("pans a domain's star off the free map's edge so each member's one-line name it leaves off, on the side facing away from the domain, is one the star had no width left for, in the %s vault at %ix%i", (_, width, height, manifest) => {
    const map = vaultMap(manifest, { width, height });
    const titleBlocks = domainTitleBlocks({ model: map.model, tokens: paint, labels: LABELS, measureText, fontFamily: "sans-serif" });
    const domainR = graphDiscRadiusPx("domain", 0, paint, paint.growthMax);
    const ownOf = (id: string) => {
      const capability = map.model.capabilityById.get(id);
      return graphDiscRadiusPx(capability ? "capability" : "element", capability?.elementIds.length ?? 0, paint, paint.growthMax);
    };
    const room = map.free.maxX - map.free.minX - paint.frameMarginPx * 2;
    const left = map.free.minX + paint.frameMarginPx;
    const right = map.free.maxX - paint.frameMarginPx;
    const passedOver: string[] = [];
    let short = 0;
    for (const domain of map.model.domains) {
      const landed = map.frame(domain.id, map.rest) ?? map.rest;
      const s = landed.tscale;
      const sx = (x: number) => (x - landed.tx) * s + width / 2;
      const home = map.at(domain.id);
      const title = titleBlocks.get(domain.id)!;
      const half = Math.max(domainR, title.halfWidthPx);
      const rooms = domainStarRooms(map.model, map.layout, domain.id, paint);
      const { capabilities, elements } = domainStarIds(map.model, domain.id);
      let lo = sx(home.x) - half;
      let hi = sx(home.x) + half;
      const names: { id: string; minX: number; maxX: number }[] = [];
      for (const id of [...capabilities, ...elements]) {
        const open = rooms.get(id)!;
        const r = openRadiusPx(ownOf(id), open, s, domainR, paint, open.nearestId === null ? 0 : ownOf(open.nearestId));
        const x = sx(map.at(id).x);
        lo = Math.min(lo, x - r);
        hi = Math.max(hi, x + r);
        const label = map.model.capabilityById.get(id)?.label;
        if (!label) continue;
        const reach = r + paint.nameGapPx + measureText(label, `${paint.capNamePx}px sans-serif`);
        names.push(map.at(id).x < home.x ? { id, minX: x - reach, maxX: x } : { id, minX: x, maxX: x + reach });
      }
      const spanOf = (list: readonly { minX: number; maxX: number }[]) => Math.max(hi, ...list.map((n) => n.maxX)) - Math.min(lo, ...list.map((n) => n.minX));
      if (hi - lo > room - 1) continue;
      if (spanOf(names) > room) short += 1;
      const fitting = names.filter((n) => n.minX >= left - 0.5 && n.maxX <= right + 0.5);
      for (const n of names) {
        if (fitting.includes(n) || spanOf([...fitting, n]) > room - 1) continue;
        passedOver.push(`${domain.id}: ${n.id} spans ${n.minX.toFixed(0)}..${n.maxX.toFixed(0)} beside ${fitting.length} fitting, ${(room - spanOf([...fitting, n])).toFixed(0)} px to spare`);
      }
    }
    if (width < 1500) expect(short, "some domain's star leaves less width than every name wants").toBeGreaterThan(0);
    expect(passedOver, "a name off the free map that the width the star left could have seated whole").toEqual([]);
  });

  it.each([
    ["docs", 1280, 800, docsManifest], ["docs", 1410, 840, docsManifest], ["storefront", 1280, 800, storefrontManifest],
  ])("never zooms out for a member pressed in the star a domain opened, in the %s vault at %ix%i", (_, width, height, manifest) => {
    const map = vaultMap(manifest, { width, height });
    const lowered: string[] = [];
    try {
      for (const domain of map.model.domains) {
        const landed = map.frame(domain.id, map.rest) ?? map.rest;
        OPEN_STAR.domainId = domain.id;
        for (const member of domainStarIds(map.model, domain.id).capabilities) {
          const pressed = map.frame(member, landed, map.rest.tscale) ?? landed;
          if (pressed.tscale < landed.tscale * (1 - 1e-9)) lowered.push(`${member}: ${(pressed.tscale / landed.tscale).toFixed(2)} of the landing`);
        }
      }
    } finally {
      OPEN_STAR.domainId = null;
    }
    expect(lowered).toEqual([]);
  });

  it.each([
    ["docs", 1100, 720, docsManifest], ["docs", 1512, 340, docsManifest], ["docs", 860, 900, docsManifest],
    ["storefront", 1100, 720, storefrontManifest], ["storefront", 1366, 768, storefrontManifest], ["storefront", 860, 900, storefrontManifest],
  ])("never zooms a domain below the camera's own minimum in the %s vault at %ix%i", (_, width, height, manifest) => {
    const { model, rest, frame, fit } = vaultMap(manifest, { width, height });
    const minScale = fit * INSETS.overviewEntryRatio * INSETS.cameraMinZoomRatio;
    for (const domain of model.domains) {
      const landed = frame(domain.id, rest) ?? rest;
      expect(Number.isFinite(landed.tscale) && Number.isFinite(landed.tx) && Number.isFinite(landed.ty), domain.id).toBe(true);
      expect(landed.tscale, `${domain.id} landed at ${landed.tscale}`).toBeGreaterThanOrEqual(minScale - 1e-9);
    }
  });

  it("is a fixed point: framing the view it landed on moves nothing", () => {
    const { model, rest, frame } = vaultMap(docsManifest, { width: 1448, height: 949 });
    const zoomedOut = { ...rest, tscale: rest.tscale / 2 };
    for (const [id, start] of [["capability:repo-structure-analysis", rest], [model.domains[0]!.id, zoomedOut]] as const) {
      const landed = frame(id, start);
      expect(landed, `${id}: the first selection frames`).not.toBeNull();
      const again = frame(id, landed!, start.tscale);
      expect(again, `${id} landed at ${JSON.stringify(landed)} from ${start.tscale.toFixed(3)}, then ${JSON.stringify(again)}`).toBeNull();
    }
  });

  it.each([[1410, 840], [1920, 1080]])("lands a domain pressed from deep inside its star where framing again moves nothing, at %ix%i", (width, height) => {
    const map = vaultMap(docsManifest, { width, height });
    const moved: string[] = [];
    for (const domain of map.model.domains) {
      const deep = { tx: map.at(domain.id).x, ty: map.at(domain.id).y, tscale: map.rest.tscale * 4 };
      const landed = map.frame(domain.id, deep) ?? deep;
      const again = map.frame(domain.id, landed);
      if (again) moved.push(`${domain.id}: ${Math.hypot((again.tx - landed.tx) * again.tscale, (again.ty - landed.ty) * again.tscale).toFixed(1)} px`);
    }
    expect(moved).toEqual([]);
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
    const zoomed = [...map.model.capabilityOf.keys()].sort().flatMap((id) => {
      const landed = map.frame(id, map.rest);
      return landed && landed.tscale > map.rest.tscale && farEnds(map, id, landed, viewport).length > 0 ? [{ id, landed }] : [];
    });
    expect(zoomed.length, "some element selection zooms in and draws a line").toBeGreaterThan(0);
    const { id, landed } = zoomed[0]!;
    for (const end of farEnds(map, id, landed, viewport)) expect(pointInside(end, map.free), `${end.id} at (${Math.round(end.x)}, ${Math.round(end.y)})`).toBe(true);
  });

  it.each([
    ["docs", 1448, 949, docsManifest], ["docs", 1856, 1080, docsManifest],
    ["storefront", 1448, 949, storefrontManifest], ["storefront", 1856, 1080, storefrontManifest],
  ])("loses no far end and lands in one step across the %s vault at %ix%i", (_, width, height, manifest) => {
    const viewport = { width, height };
    const map = vaultMap(manifest, viewport);
    const entry = map.rest.tscale;
    const starts = [map.rest, { ...map.rest, tscale: entry * 1.6 }, { tx: map.rest.tx + 300 / entry, ty: map.rest.ty, tscale: entry * 2.4 }];
    const elementIds = new Set([...map.model.capabilityOf.keys(), ...map.model.domains.flatMap((d) => d.directElementIds)]);
    const ids = [...map.model.capabilityById.keys(), ...elementIds];
    const lostFarEnds: string[] = [];
    const secondSteps: string[] = [];
    let zoomedElements = 0;
    for (const start of starts) {
      for (const id of ids) {
        const landed = map.frame(id, start) ?? start;
        if (map.frame(id, landed, start.tscale)) secondSteps.push(`${id} from ${start.tscale.toFixed(2)}`);
        if (!elementIds.has(id) || landed.tscale <= start.tscale + 1e-6) continue;
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

describe("a capability selection's names", () => {
  it.each([
    ["docs", 1448, 949, docsManifest], ["docs", 1856, 1080, docsManifest],
    ["storefront", 1448, 949, storefrontManifest], ["storefront", 1856, 1080, storefrontManifest],
  ])("land inside the free map by the margin as the frame names them round the opened star across the %s vault at %ix%i", (_, width, height, manifest) => {
    const viewport = { width, height };
    const map = vaultMap(manifest, viewport);
    const margin = paint.frameMarginPx;
    const box = { minX: map.free.minX + margin, maxX: map.free.maxX - margin, minY: map.free.minY + margin, maxY: map.free.maxY - margin };
    const entry = map.rest.tscale;
    const outside: string[] = [];
    for (const start of [map.rest, { ...map.rest, tscale: entry * 1.6 }]) {
      for (const id of map.model.capabilityById.keys()) {
        const landed = map.frame(id, start) ?? start;
        for (const n of map.framedNames(id, landed)) if (!inside(n, box)) outside.push(`${id} from ${start.tscale.toFixed(2)}: ${n.label}`);
      }
    }
    expect(outside).toEqual([]);
  });
});

describe("a domain selection's zoom", () => {
  const viewport = { width: 1920, height: 1080 };
  const margin = 24;
  /** 700 px between the margins across, ample height. */
  const free = { minX: 400, maxX: 400 + 700 + margin * 2, minY: 100, maxY: 1000 };
  const disc = (x: number, y: number, half: number): FramedMark => ({ x, y, box: { minX: -half, maxX: half, minY: -half, maxY: half } });
  const fits = (marks: readonly FramedMark[], scale: number) =>
    Math.max(...marks.map((m) => m.x * scale + m.box.maxX)) - Math.min(...marks.map((m) => m.x * scale + m.box.minX)) <= free.maxX - free.minX - margin * 2;

  it("stops where the star stops fitting the free map, short of the separation it aims at", () => {
    const members = Array.from({ length: 17 }, (_, k) => ({ x: k * 25, y: 0 }));
    const star = [disc(200, 40, 20), ...members.map((m) => disc(m.x, m.y, 5))];
    const zoom = domainSelectionZoom({ members, apartPx: 44, starAt: () => star, maxScale: 4 });
    const landed = selectionFrameTarget({ tx: 200, ty: 0, tscale: 1 }, [star], viewport, free, margin, 0.5, zoom)!;
    expect(landed.tscale, "the selection zooms in").toBeGreaterThan(1.5);
    expect(fits(star, landed.tscale), "the star fits where it lands").toBe(true);
    expect(fits(star, landed.tscale * 1.02), "a little further and the star would not fit").toBe(false);
    expect(25 * landed.tscale, "the members stop short of the separation").toBeLessThan(44);
  });

  it("stops once its two closest members stand the widest separation apart, with room left to fill", () => {
    const members = [{ x: 0, y: 0 }, { x: 25, y: 0 }];
    const star = [disc(12, 30, 20), ...members.map((m) => disc(m.x, m.y, 5))];
    const zoom = domainSelectionZoom({ members, apartPx: 160, starAt: () => star, maxScale: 20 });
    const landed = selectionFrameTarget({ tx: 12, ty: 0, tscale: 1 }, [star], viewport, free, margin, 0.5, zoom)!;
    expect(25 * landed.tscale, "the members reach the separation").toBeGreaterThanOrEqual(160 - 1e-6);
    expect(25 * landed.tscale, "and stop within a refined sample of it").toBeLessThan(160 * 1.02);
    expect(fits(star, landed.tscale * 1.5), "the star had room to grow further").toBe(true);
    expect(selectionFrameTarget(landed, [star], viewport, free, margin, 0.5, zoom), "framing its own landing moves nothing").toBeNull();
  });

  it("parts the nearest members that do not coincide, so two on one spot neither block nor exhaust the zoom", () => {
    const members = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 30, y: 0 }];
    const zoom = domainSelectionZoom({ members, apartPx: 44, starAt: () => [], maxScale: 4 });
    expect(zoom.readsAt(1), "30 px apart at 1x").toBe(false);
    expect(zoom.readsAt(44 / 30), "44 px apart once the distinct pair is").toBe(true);
    expect(zoom.scoreAt(1)[0], "the coincident pair does not pin the score at zero").toBeCloseTo(30, 9);
  });

  it.each([
    ["one capability and ten elements", [{ x: 0, y: 0 }], [{ x: 0, y: 0 }, ...Array.from({ length: 10 }, (_, i) => ({ x: 20 + i * 20, y: 10 }))]],
    ["only direct elements", [], Array.from({ length: 6 }, (_, i) => ({ x: i * 20, y: 0 }))],
  ])("zooms in with %s, spacing the closest two marks of its star", (_, members, marks) => {
    const star = [disc(60, 40, 20), ...marks.map((m) => disc(m.x, m.y, 3))];
    const zoom = domainSelectionZoom({ members, apartPx: 160, starAt: () => star, maxScale: 20 });
    expect(zoom.readsAt(1), "20 px apart at 1x").toBe(false);
    expect(zoom.scoreAt(2)[0]!, "the score still grows with the zoom").toBeGreaterThan(zoom.scoreAt(1)[0]!);
    const landed = selectionFrameTarget({ tx: 60, ty: 0, tscale: 1 }, [star], viewport, free, margin, 0.5, zoom)!;
    expect(landed.tscale, "the frame zooms in").toBeGreaterThan(1);
  });
});
