import type { CameraTarget } from "../../../engine/camera";
import { createMeasureText } from "../../../dial/fit";
import { branchMemberCount } from "../../../dial/branches/member-disclosure";
import { branchNameLines, branchTextStyle } from "../../../dial/branches/text";
import { readDialTokens } from "../../../dial/tokens";
import type { DialModel, DialWorld } from "../../../dial/types";
import {
  SELECTION_NUDGE_MARGIN_PX, selectionFrameTarget, selectionNudgeTarget, type FramedMark, type FreeMapRect,
} from "../../../model/camera/flat-selection-camera";
import type { TopologyWorld } from "../../world/topology-world";
import { cachedGraphAttention } from "../../../flat-graph/attention";
import { graphDiscRadiusPx } from "../../../flat-graph/marks";
import { nameReachBox, selectedDiscRadius, type NameReachInput } from "../../../flat-graph/names";
import { readFlatGraphTokens } from "../../../flat-graph/tokens";
import { labelFontFamily } from "../../../render/labels";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { computeEffectiveCameraScaleMax } from "../topology-camera-math";
import { graphSelectionZoom } from "./graph-selection-zoom";

const staleBounds = new WeakMap<DialModel, ReadonlyMap<string, number>>();

/** Every capability stale: the widest caption a domain block can draw, whatever the evidence says. */
function staleBound(model: DialModel): ReadonlyMap<string, number> {
  let bound = staleBounds.get(model);
  if (!bound) staleBounds.set(model, (bound = new Map(model.domains.map((d) => [d.id, d.capabilityIds.length]))));
  return bound;
}

/**
 * On the Flat graph a click frames the selection, its domain and the lit concepts inside that
 * domain with every side their names may take, preferring the whole lit reach when it already
 * fits. Radii are taken at the largest growth, so the frame holds at any zoom it lands on.
 */
function graphSelectionFrame(
  world: TopologyWorld, dial: DialWorld, id: string, camera: CameraTarget, viewport: { width: number; height: number }, free: FreeMapRect,
  band: { entryScale: number; maxScale: number },
): CameraTarget | null {
  const { model } = dial;
  const paint = readFlatGraphTokens().paint;
  const growth = paint.growthMax;
  const attention = cachedGraphAttention(model, id, true);
  const radius = (of: string) => {
    if (model.domainById.has(of)) return graphDiscRadiusPx("domain", 0, paint, growth);
    const cap = model.capabilityById.get(of);
    const own = graphDiscRadiusPx(cap || !model.domainOf.has(of) ? "capability" : "element", cap?.elementIds.length ?? 0, paint, growth);
    return of === id ? selectedDiscRadius(own, paint, growth) : own;
  };
  const measureText = createMeasureText();
  const fontFamily = labelFontFamily();
  const elementLabel = (of: string) => world.nodeById.get(of)?.label ?? null;
  const input: NameReachInput = {
    model, tokens: paint, labels: dial.labels ?? null, measureText, fontFamily, growth,
    selected: true, focusId: id, named: attention.named, lit: attention.lit, reach: attention.reach, discRadius: radius,
    elementLabel, staleByDomain: staleBound(model),
  };
  const domainId = model.domainById.has(id) ? id : model.domainOf.get(id) ?? null;
  const near = new Set([id]);
  const whole = new Set([id]);
  if (domainId !== null) near.add(domainId);
  const owner = model.capabilityOf.get(id);
  if (owner) near.add(owner);
  if (model.domainById.has(id)) for (const cap of model.domainById.get(id)!.capabilityIds) near.add(cap);
  for (const line of attention.lines) {
    for (const end of [line.from, line.to]) {
      whole.add(end);
      if (domainId !== null && model.domainOf.get(end) === domainId) near.add(end);
    }
  }
  for (const of of near) whole.add(of);
  const marks = (ids: ReadonlySet<string>) => [...ids].flatMap((of): FramedMark[] => {
    const node = world.nodeById.get(of);
    return node ? [{ x: node.x, y: node.y, box: nameReachBox(input, of) }] : [];
  });
  const zoom = graphSelectionZoom({
    model, layout: dial.scene.graph!, paint, attention, labels: dial.labels ?? null, measureText, fontFamily, elementLabel,
    staleByDomain: staleBound(model), medianElementPitch: dial.scene.medianElementPitch, near, domainId, ...band,
  });
  return selectionFrameTarget(camera, [marks(whole), marks(near)], viewport, free, paint.frameMarginPx, band.entryScale, zoom);
}

/**
 * Where a click selection slides the camera so the detail panel leaves it readable: on the Flat
 * graph the framing above, elsewhere a sideways nudge until its name clears the panel.
 */
export function selectionSlideTarget(
  world: TopologyWorld, dial: DialWorld | null | undefined, id: string, camera: CameraTarget, viewport: { width: number; height: number },
  insets: Pick<OntologyMapTokens, "safeInsetLeft" | "safeInsetRight" | "safeInsetTop" | "safeInsetBottom" | "overviewEntryRatio" | "cameraMaxZoomRatio" | "cameraScaleMax">,
  overviewScale: number,
): CameraTarget | null {
  const node = world.nodeById.get(id);
  if (!node) return null;
  if (dial?.scene.graph && id !== dial.model.projectId) {
    const free = { minX: insets.safeInsetLeft, maxX: viewport.width - insets.safeInsetRight, minY: insets.safeInsetTop, maxY: viewport.height - insets.safeInsetBottom };
    const entryScale = overviewScale * insets.overviewEntryRatio;
    const maxScale = computeEffectiveCameraScaleMax(entryScale, insets.cameraMaxZoomRatio, insets.cameraScaleMax, world.dialScaleMax ?? undefined);
    return graphSelectionFrame(world, dial, id, camera, viewport, free, { entryScale, maxScale });
  }
  const span = viewport.width - insets.safeInsetLeft - insets.safeInsetRight;
  return selectionNudgeTarget(camera, node, viewport.width, { left: insets.safeInsetLeft, right: insets.safeInsetRight }, branchSelectionMargin(world, dial, id, camera.tscale, span));
}

/** Reserve the intended label positions, before collision handling clamps their painted boxes. */
export function branchSelectionMargin(world: TopologyWorld, dial: DialWorld | null | undefined, id: string, scale: number, freeWidth: number) {
  if (dial?.scene.graph) return SELECTION_NUDGE_MARGIN_PX;
  const focus = world.nodeById.get(id);
  const cluster = dial?.scene.branches ? dial.scene.clusterByDomain.get(dial.model.domainOf.get(id) ?? id) : null;
  if (!dial || !cluster || !focus) return SELECTION_NUDGE_MARGIN_PX;
  const tokens = readDialTokens();
  const measure = createMeasureText();
  const { font } = branchTextStyle("capability", "capability", tokens.labelScale);
  const count = branchMemberCount(dial.scene, cluster.domainId);
  const members = cluster.items.filter(item => !item.direct).slice(0, count);
  const ids = new Set([cluster.domainId, id, ...members.map(item => item.id)]);
  const ranges: { id: string; left: number; right: number }[] = [];
  for (const member of ids) {
    const node = world.nodeById.get(member);
    if (!node) continue;
    const x = (node.x - focus.x) * scale;
    if (member === cluster.domainId) {
      const half = (tokens.nameMaxPx + tokens.ledgerGapPx) / 2;
      ranges.push({ id: member, left: x - half, right: x + half });
    } else {
      const lines = branchNameLines(node.label, font, tokens.nameMaxPx, measure);
      const name = Math.max(...lines.map(line => measure(line, font)));
      const gap = tokens.discGlyphPx * 2 + tokens.chipMinPx;
      ranges.push({ id: member, left: x - (cluster.branchSide === -1 ? gap + name : gap), right: x + (cluster.branchSide === -1 ? gap : gap + name) });
    }
  }
  const margins = (items: typeof ranges, air = SELECTION_NUDGE_MARGIN_PX) => ({
    left: Math.max(air, -Math.min(...items.map(p => p.left)) + air),
    right: Math.max(air, Math.max(...items.map(p => p.right)) + air),
  });
  const whole = margins(ranges);
  return whole.left + whole.right <= freeWidth ? whole : margins(ranges.filter(p => p.id === id), freeWidth >= 400 ? SELECTION_NUDGE_MARGIN_PX : 24);
}
