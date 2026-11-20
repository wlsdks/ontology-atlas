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
import { lastOpenedDomainStar } from "../../../flat-graph/frame";
import { graphDiscRadiusPx } from "../../../flat-graph/marks";
import { domainTitleBlocks, memberNameReachPx, nameReachBox, selectedDiscRadius, type NameReachInput } from "../../../flat-graph/names";
import { domainStarIds, domainStarRooms, openRadiusPx, type StarRoom } from "../../../flat-graph/open-star";
import { readFlatGraphTokens } from "../../../flat-graph/tokens";
import type { FlatGraphPaintTokens } from "../../../flat-graph/types";
import { labelFontFamily } from "../../../render/labels";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { computeEffectiveCameraScaleMax } from "../topology-camera-math";
import { domainSelectionZoom, elementSelectionZoom, graphSelectionZoom } from "./graph-selection-zoom";

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
 * A domain frames its own star (disc, name block, member discs and their elements) instead, zooming
 * in until that star fills the free map or its members stand `domainApartMaxPx` apart; partner
 * domains may leave the view.
 */
function graphSelectionFrame(
  world: TopologyWorld, dial: DialWorld, id: string, camera: CameraTarget, viewport: { width: number; height: number }, free: FreeMapRect,
  band: { entryScale: number; maxScale: number; zoomBase: number },
): CameraTarget | null {
  const { model } = dial;
  const paint = readFlatGraphTokens().paint;
  const growth = paint.growthMax;
  const radius = (of: string) => {
    if (model.domainById.has(of)) return graphDiscRadiusPx("domain", 0, paint, growth);
    const cap = model.capabilityById.get(of);
    const own = graphDiscRadiusPx(cap || !model.domainOf.has(of) ? "capability" : "element", cap?.elementIds.length ?? 0, paint, growth);
    return of === id ? selectedDiscRadius(own, paint, growth) : own;
  };
  const measureText = createMeasureText();
  const fontFamily = labelFontFamily();
  if (model.domainById.has(id)) {
    const titles = domainTitleBlocks({ model, tokens: paint, labels: dial.labels ?? null, measureText, fontFamily });
    const home = world.nodeById.get(id);
    const title = titles.get(id);
    const domainPx = radius(id);
    const half = Math.max(domainPx, title?.halfWidthPx ?? 0);
    const block: FramedMark[] = home ? [{ x: home.x, y: home.y, box: { minX: -half, maxX: half, minY: Math.min(-domainPx, title?.topPx ?? 0), maxY: Math.max(domainPx, title?.bottomPx ?? 0) } }] : [];
    // Members and their elements as the opened star draws them at each scale; names are re-admitted where the frame lands.
    const { capabilities, elements } = domainStarIds(model, id);
    const rooms = domainStarRooms(model, dial.scene.graph!, id, paint);
    const opened = [...capabilities, ...elements].flatMap((of) => {
      const node = world.nodeById.get(of);
      const room = rooms.get(of);
      if (!node || !room) return [];
      const label = model.capabilityById.get(of)?.label;
      const namePx = label ? memberNameReachPx({ tokens: paint, measureText, fontFamily }, label) : 0;
      return [{ node, room, own: radius(of), nearestOwn: room.nearestId === null ? 0 : radius(room.nearestId), namePx, outLeft: home !== undefined && node.x < home.x }];
    });
    // The zoom weighs the star alone; its names take only the width the star leaves, so they move the pan, never the scale.
    const spanPx = free.maxX - free.minX - paint.frameMarginPx * 2;
    const starAt = (scale: number): FramedMark[] => domainStarMarks(block, opened, scale, domainPx, paint, spanPx);
    const zoom = domainSelectionZoom({
      members: capabilities.flatMap((of) => world.nodeById.get(of) ?? []), apartPx: paint.domainApartMaxPx, starAt, maxScale: band.maxScale,
    });
    // Panned as it draws at the deepest zoom, the star's largest: fixed sets whatever scale the frame starts from, so a landing
    // frames to itself. With every name's whole width first, then the star alone, the set a zoom-out falls back on.
    const largest = [domainStarMarks(block, opened, band.maxScale, domainPx, paint, Infinity), domainStarMarks(block, opened, band.maxScale, domainPx, paint, 0)];
    return selectionFrameTarget(camera, largest, viewport, free, paint.frameMarginPx, band.entryScale, zoom);
  }
  const attention = cachedGraphAttention(model, id, true);
  const elementLabel = (of: string) => world.nodeById.get(of)?.label ?? null;
  const input: NameReachInput = {
    model, tokens: paint, labels: dial.labels ?? null, measureText, fontFamily, growth,
    selected: true, focusId: id, named: attention.named, lit: attention.lit, reach: attention.reach, discRadius: radius,
    elementLabel, staleByDomain: staleBound(model),
  };
  const domainId = model.domainOf.get(id) ?? null;
  const near = new Set([id]);
  const whole = new Set([id]);
  if (domainId !== null) near.add(domainId);
  const owner = model.capabilityOf.get(id);
  if (owner) near.add(owner);
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
  const element = !model.capabilityById.has(id) && model.domainOf.has(id);
  // A member of the star open on the map keeps the zoom that opened it: its own mark always fits there, so the frame only pans.
  const inOpenStar = domainId !== null && domainId === lastOpenedDomainStar();
  const capped = Math.min(band.maxScale, band.zoomBase * paint.selectZoomMaxRatio);
  const zoom = (element ? elementSelectionZoom : graphSelectionZoom)({
    model, layout: dial.scene.graph!, paint, attention, labels: dial.labels ?? null, measureText, fontFamily, elementLabel,
    staleByDomain: staleBound(model), medianElementPitch: dial.scene.medianElementPitch, hubCaption: dial.labels?.evidenceUnmeasured?.() ?? null, near, framed: element ? whole : near, domainId,
    entryScale: band.entryScale, maxScale: inOpenStar ? Math.max(capped, camera.tscale) : capped,
  });
  const farEnds = [...whole].filter((of) => !near.has(of)).flatMap((of) => world.nodeById.get(of) ?? []);
  const own = world.nodeById.get(id)!;
  const disc = radius(id);
  const sets = inOpenStar ? [marks(whole), marks(near), [{ x: own.x, y: own.y, box: { minX: -disc, maxX: disc, minY: -disc, maxY: disc } }]] : [marks(whole), marks(near)];
  return selectionFrameTarget(camera, sets, viewport, free, paint.frameMarginPx, band.entryScale, zoom, farEnds);
}

/** An open star's member as the domain frame weighs it: its node, its room in the star and its one-line name's reach. */
interface FramedStarMember {
  node: { x: number; y: number };
  room: StarRoom;
  own: number;
  nearestOwn: number;
  /** How far its one-line name reaches past its rim, 0 for an element. */
  namePx: number;
  /** Whether it stands left of its domain, so the side facing away from the domain is its left. */
  outLeft: boolean;
}

/** Width the star's names leave unspent in `spanPx`, px: float noise never makes a star that fits alone stop fitting. */
const NAME_ROOM_SLACK_PX = 0.5;

/**
 * A domain's star as the frame keeps it inside the free map at `scale`: the domain's block, then each
 * member's opened disc with room for its one-line name on the side facing away from the domain, so a
 * star framed against the free map's edge keeps a side there for the names of the members on its rim.
 * The names share, by one ratio, only the width the star leaves of `spanPx`: where the star alone
 * fits it still fits, and where it does not they take none. O(members).
 */
function domainStarMarks(
  block: readonly FramedMark[], members: readonly FramedStarMember[], scale: number, domainPx: number, paint: FlatGraphPaintTokens, spanPx: number,
): FramedMark[] {
  const radii = members.map((m) => openRadiusPx(m.own, m.room, scale, domainPx, paint, m.nearestOwn));
  let lo = Infinity;
  let hi = -Infinity;
  for (const m of block) {
    lo = Math.min(lo, m.x * scale + m.box.minX);
    hi = Math.max(hi, m.x * scale + m.box.maxX);
  }
  for (const [i, m] of members.entries()) {
    lo = Math.min(lo, m.node.x * scale - radii[i]!);
    hi = Math.max(hi, m.node.x * scale + radii[i]!);
  }
  let left = lo;
  let right = hi;
  for (const [i, m] of members.entries()) {
    if (m.outLeft) left = Math.min(left, m.node.x * scale - radii[i]! - m.namePx);
    else right = Math.max(right, m.node.x * scale + radii[i]! + m.namePx);
  }
  // Each name grows its side of the span by at most this ratio of what all of them would.
  const want = lo - left + (right - hi);
  const spare = spanPx - (hi - lo) - NAME_ROOM_SLACK_PX;
  const share = want <= 0 || spare <= 0 ? 0 : Math.min(1, spare / want);
  const marks = [...block];
  for (const [i, { node, namePx, outLeft }] of members.entries()) {
    const r = radii[i]!;
    const name = namePx * share;
    marks.push({ x: node.x, y: node.y, box: { minX: outLeft ? -r - name : -r, maxX: outLeft ? r : r + name, minY: -r, maxY: r } });
  }
  return marks;
}

/**
 * Where a click selection slides the camera so the detail panel leaves it readable: on the Flat
 * graph the framing above, its zoom-in capped from `zoomBase` (`selectionZoomBase`), elsewhere a
 * sideways nudge until its name clears the panel.
 */
export function selectionSlideTarget(
  world: TopologyWorld, dial: DialWorld | null | undefined, id: string, camera: CameraTarget, viewport: { width: number; height: number },
  insets: Pick<OntologyMapTokens, "safeInsetLeft" | "safeInsetRight" | "safeInsetTop" | "safeInsetBottom" | "overviewEntryRatio" | "cameraMaxZoomRatio" | "cameraScaleMax">,
  overviewScale: number,
  zoomBase: number,
): CameraTarget | null {
  const node = world.nodeById.get(id);
  if (!node) return null;
  if (dial?.scene.graph && id !== dial.model.projectId) {
    const free = { minX: insets.safeInsetLeft, maxX: viewport.width - insets.safeInsetRight, minY: insets.safeInsetTop, maxY: viewport.height - insets.safeInsetBottom };
    const entryScale = overviewScale * insets.overviewEntryRatio;
    const maxScale = computeEffectiveCameraScaleMax(entryScale, insets.cameraMaxZoomRatio, insets.cameraScaleMax, world.dialScaleMax ?? undefined);
    return graphSelectionFrame(world, dial, id, camera, viewport, free, { entryScale, maxScale, zoomBase });
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
