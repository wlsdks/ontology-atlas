import type { Point } from "../../dial/dial-shapes";
import { HITTABLE_MIN_TIER_ALPHA } from "../../model/visibility/tier-visibility";
import { inkUnder } from "../attention";
import { capabilityDiscRadiusPx, elementDotRadiusPx, graphDiscRadiusPx, LIT_DOT_SHARE, ORPHAN_ROOM, sunk } from "../marks";
import { DAMPED, dampedStep, FLAT_MOTION } from "../motion";
import type { OpenedElements } from "../open";
import { domainStarRooms, openRadiusPx, roomLimitPx, starRooms, type StarPoint, type StarRoom } from "../open-star";
import type { FlatGraphLayout } from "../flat-graph-shapes";
import { CULL_PX, ELEMENT_PICK_PX, type StampedPoint, MARK_STEP_MAX_MS, MARK_REST_PX, F as frameState, scratch, fanPushes, pushedDots, movedRoom } from "./state";

// A module-local name: see `F` in ./state.
const F = frameState;

/** World units a fanned element may sit from its laid-out place before it counts as dragged. */
const DRAG_SLACK = 1e-6;

const ORIGIN: Point = { x: 0, y: 0 };

/**
 * A domain's hue. The map rests achromatic, so every mark takes the neutral ink until attention
 * reaches the domain it sits in, which takes the project's ink over the same clock as the light.
 * Colour on this canvas says whose domain a mark is in and which way a relation runs.
 */
export function hueOf(domainId: string): string {
  const tint = F.motion.tintShare(domainId);
  return tint <= 0 ? F.tokens.inks.name : sunk(F.tokens.inks.project, F.tokens.inks.name, tint);
}

function loadInkAt(id: string, rest: number): void {
  const input = F.input;
  const attention = F.attention;
  const sink = F.P.sinkInk;
  F.motion.see(id);
  const focus = F.settled ? inkUnder(attention, id, sink, rest) : F.motion.ink(id, sink, rest);
  const brightened = attention.selected && id === input.hoveredNodeId ? 1 : focus;
  const lens = F.contextMode ? input.contextInkAlphas?.get(id) ?? 1 : 1;
  scratch[0] = brightened * lens * input.appearOf(id);
}

/** A concept's ink for its name and light: full at rest. */
export function loadInk(id: string): void {
  loadInkAt(id, 1);
}

/** A concept's ink for its disc, dot and links: `restHue` of the hue at rest, full when lit. */
export function loadMarkInk(id: string): void {
  loadInkAt(id, F.P.restHue);
}

/** How far a concept's glow shows: only the lit set of a hover or selection glows. */
export function loadGlowShare(id: string): void {
  scratch[0] = F.settled ? inkUnder(F.attention, id, 0, 0) : F.motion.litShare(id);
}

export function inkOf(id: string): number {
  loadInk(id);
  return scratch[0]!;
}

export function screenOf(id: string): StampedPoint {
  const home = F.input.nodeAt?.(id) ?? F.layout.positions.get(id) ?? F.layout.itemAt.get(id) ?? ORIGIN;
  let at = F.screen.get(id);
  if (!at) {
    at = { x: 0, y: 0, stamp: 0 };
    F.screen.set(id, at);
  }
  let x = home.x * F.scale + F.originX;
  let y = home.y * F.scale + F.originY;
  const pushed = pushedDots.get(id);
  if (pushed !== undefined && pushed.frame === F.frame) {
    const d = fanPushes.get(pushed.capabilityId)?.d ?? 0;
    x += pushed.ux * d;
    y += pushed.uy * d;
  }
  for (let i = 0; i < F.opened.length; i += 1) {
    const fan = F.opened[i]!;
    const offset = fan.elements.offsets.get(id);
    if (!offset) continue;
    const rest = F.layout.positions.get(fan.elements.capabilityId)!;
    const centre = F.input.nodeAt?.(fan.elements.capabilityId) ?? rest;
    const own = F.layout.positions.get(id);
    // A dot dragged away from its capability follows the pointer; the rest follow the capability wherever it goes.
    if (own && Math.hypot(home.x - own.x - (centre.x - rest.x), home.y - own.y - (centre.y - rest.y)) > DRAG_SLACK) continue;
    x += (centre.x * F.scale + F.originX + offset.x - x) * fan.share;
    y += (centre.y * F.scale + F.originY + offset.y - y) * fan.share;
  }
  if (id === F.stepId) {
    x += F.stepUx * F.stepPx;
    y += F.stepUy * F.stepPx;
  }
  if (at.x !== x) at.x = x;
  if (at.y !== y) at.y = y;
  at.stamp = F.stamp;
  return at;
}

/** How far the fan round the member the reader let go, `capabilityId`, still stands open; 0 once it has closed. */
export function leavingFanShare(capabilityId: string): number {
  for (let i = 0; i < F.opened.length; i += 1) if (F.opened[i]!.elements.capabilityId === capabilityId) return F.opened[i]!.share;
  return 0;
}

/** How far `id` has moved into an opened fan other than `besides`'s, 0 when it is in none. */
export function fanShare(id: string, besides: string | null = null): number {
  let share = 0;
  for (let i = 0; i < F.opened.length; i += 1) {
    const { elements } = F.opened[i]!;
    if (elements.capabilityId !== besides && elements.offsets.has(id)) share = Math.max(share, F.opened[i]!.share * elements.open);
  }
  return share;
}

export function alongSpoke(from: string, to: string): boolean {
  for (let i = 0; i < F.opened.length; i += 1) {
    const { capabilityId, offsets } = F.opened[i]!.elements;
    if ((from === capabilityId && offsets.has(to)) || (to === capabilityId && offsets.has(from))) return true;
  }
  return false;
}

export function screenAt(id: string): StampedPoint | undefined {
  const at = F.screen.get(id);
  return at && at.stamp === F.stamp ? at : undefined;
}

export function onScreen(p: Point): boolean {
  return p.x > -CULL_PX && p.y > -CULL_PX && p.x < F.W + CULL_PX && p.y < F.H + CULL_PX;
}

export function pickable(p: Point): boolean {
  return p.x > -ELEMENT_PICK_PX && p.y > -ELEMENT_PICK_PX && p.x < F.W + ELEMENT_PICK_PX && p.y < F.H + ELEMENT_PICK_PX;
}

/** The radius at this frame's growth; a cached value is returned as stored, so it never allocates. */
export function radiusNow(id: string): number {
  return F.radii.get(id) ?? radiusAt(id, F.growth);
}

/**
 * The radius `id` draws this frame: `target`, approached from the radius and speed the frame before
 * drew, so a mark grows, shrinks and retargets with no jump in size or in speed. A frame later than
 * `MARK_STEP_MAX_MS` moves it as that long a frame would. A mark the frame before did not draw (it
 * was off screen, or the map slept) and reduced motion take the target at once. Settled once per
 * mark and frame.
 */
function drawnRadius(id: string, wanted: number, limit = Infinity): number {
  // A mark heads for the room it has when that is smaller than its radius, so it settles there.
  const target = Math.min(wanted, limit);
  let last = F.drawn.get(id);
  if (!last) {
    F.drawn.set(id, (last = { r: target, perMs: 0, at: F.now, frame: F.frame }));
    return target;
  }
  if (last.frame === F.frame) return last.r;
  const continuing = last.frame === F.frame - 1;
  const stepMs = Math.min(Math.max(0, F.now - last.at), MARK_STEP_MAX_MS);
  let r = target;
  let perMs = 0;
  if (continuing && !F.reducedMotion && Math.abs(target - last.r) > MARK_REST_PX) {
    r = dampedStep(last.r, last.perMs, target, stepMs, FLAT_MOTION.riseMs, F.P.markPxPerMs);
    perMs = DAMPED.perMs;
    F.lagging = true;
  }
  // However its speed carried it, a mark never passes the room it has at this frame's zoom.
  if (r > limit) {
    r = limit;
    perMs = Math.min(perMs, 0);
  }
  if (last.r !== r) last.r = r;
  last.perMs = perMs;
  last.at = F.now;
  last.frame = F.frame;
  return r;
}

/** The drawn radius: the selected concept's toward the selected radius, an opened star's marks toward the room they have at this frame's zoom. */
export function discRadius(id: string): number {
  const own = radiusNow(id);
  if (id === F.selectedId || id === F.leavingId) return noteGrown(id, own, drawnRadius(id, id === F.selectedId ? F.selectedR : F.leavingR));
  return noteGrown(id, own, drawnRadius(id, openedRadius(id, own), roomLimit(id, own)));
}

/** The largest radius `id` may draw at this frame's zoom in every star that holds it, open or closing. O(stars). */
export function roomLimit(id: string, own: number): number {
  let limit = Infinity;
  for (let i = 0; i < F.starCount; i += 1) {
    const star = F.stars[i]!;
    const moved = star.domain && star.rooms.has(id) ? movedRoom(id) : undefined;
    const room = moved ?? star.rooms.get(id);
    if (room !== undefined) limit = Math.min(limit, roomLimitPx(own, room, star.world && !moved ? F.scale : 1, star.fixedPx, room.nearestId === null ? 0 : radiusNow(room.nearestId)));
  }
  const closing = F.closingRooms?.get(id);
  if (closing !== undefined) {
    const moved = movedRoom(id);
    const room = moved ?? closing;
    limit = Math.min(limit, roomLimitPx(own, room, moved ? 1 : F.scale, graphDiscRadiusPx("domain", 0, F.P, F.growth), room.nearestId === null ? 0 : radiusNow(room.nearestId)));
  }
  return limit;
}

/** Marks drawn past their resting radius this frame: the only marks a name gives way to. */
export const grownIds = new Set<string>();

function noteGrown(id: string, rest: number, r: number): number {
  if (r > rest + MARK_REST_PX) grownIds.add(id);
  return r;
}

/** `own` grown by every opened star that holds `id` into the room it has at this frame's zoom. O(stars). */
export function openedRadius(id: string, own: number): number {
  let r = own;
  for (let i = 0; i < F.starCount; i += 1) {
    const star = F.stars[i]!;
    const moved = star.domain && star.rooms.has(id) ? movedRoom(id) : undefined;
    const room = moved ?? star.rooms.get(id);
    if (room === undefined) continue;
    r = Math.max(r, openRadiusPx(own, room, star.world && !moved ? F.scale : 1, star.fixedPx, F.P, room.nearestId === null ? 0 : radiusNow(room.nearestId)));
  }
  return r;
}

/** An element dot's drawn radius: a lit dot stands out, and an opened star grows it. */
export function dotRadius(id: string): number {
  if (id === F.selectedId || id === F.leavingId) return discRadius(id);
  const rest = radiusNow(id) * (F.attention.lit?.has(id) === true ? LIT_DOT_SHARE : 1);
  return noteGrown(id, rest, drawnRadius(id, openedRadius(id, rest), roomLimit(id, rest)));
}

function setStar(rooms: ReadonlyMap<string, StarRoom>, world: boolean, domain: boolean, fixedPx: number): void {
  const star = F.stars[F.starCount]!;
  star.rooms = rooms;
  star.world = world;
  star.domain = domain;
  if (star.fixedPx !== fixedPx) star.fixedPx = fixedPx;
  F.starCount += 1;
}

interface FanRooms { world: ReadonlyMap<string, StarRoom> | null; fanned: ReadonlyMap<string, StarRoom> | null; ringPx: number }
const fanRoomCache = new WeakMap<FlatGraphLayout, Map<string, FanRooms>>();

/** A capability's elements' rooms round its centre: `fan` offsets in px, or their own places in world units. O(n²), n = its elements. */
function elementRooms(capabilityId: string, fan: OpenedElements | null): ReadonlyMap<string, StarRoom> {
  const centre = F.layout.positions.get(capabilityId);
  const points: StarPoint[] = [];
  for (const id of F.model.capabilityById.get(capabilityId)?.elementIds ?? []) {
    const offset = fan?.offsets.get(id);
    const at = F.layout.positions.get(id);
    if (fan) {
      if (offset) points.push({ id, kind: "element", x: offset.x, y: offset.y });
    } else if (at && centre) points.push({ id, kind: "element", x: at.x - centre.x, y: at.y - centre.y });
  }
  return starRooms(points, ORIGIN, F.P);
}

/**
 * A selected capability's elements' rooms beside its selection ring. Unfanned, they stand in their
 * own places, kept once per layout in world units; fully fanned, the fan's px places hold at any zoom
 * and are kept per ring; only a half-closed fan, which moves with the zoom, is measured each frame.
 */
function setFanStar(capabilityId: string, fan: OpenedElements | null, ringPx: number): void {
  let byCapability = fanRoomCache.get(F.layout);
  if (!byCapability) fanRoomCache.set(F.layout, (byCapability = new Map()));
  let known = byCapability.get(capabilityId);
  if (!known) byCapability.set(capabilityId, (known = { world: null, fanned: null, ringPx: 0 }));
  if (fan === null) {
    known.world ??= elementRooms(capabilityId, null);
    setStar(known.world, true, false, ringPx);
    return;
  }
  if (fan.open < 1) {
    setStar(elementRooms(capabilityId, fan), false, false, ringPx);
    return;
  }
  if (known.fanned === null || known.ringPx !== ringPx) {
    known.fanned = elementRooms(capabilityId, fan);
    known.ringPx = ringPx;
  }
  setStar(known.fanned, false, false, ringPx);
}

/** The fan drawn for `capabilityId` this frame, if any. */
function fanOf(capabilityId: string): OpenedElements | null {
  for (let i = 0; i < F.opened.length; i += 1) if (F.opened[i]!.elements.capabilityId === capabilityId) return F.opened[i]!.elements;
  return null;
}

/** A capability's elements open round its selection ring as it is drawn this frame. */
function setCapabilityStar(capabilityId: string): void {
  const ringPx = discRadius(capabilityId) + F.P.selectedRingGapPx + F.P.selectedRingPx;
  setFanStar(capabilityId, fanOf(capabilityId), ringPx);
}

let openDomainId: string | null = null;
/** A domain whose star the reader left while its marks still shrink: they keep within its rooms. */
let closingDomainId: string | null = null;

/** The domain whose star the last Flat frame drew open, or still drew closing; null when it drew none. */
export function lastOpenedDomainStar(): string | null {
  return openDomainId;
}

export function closingDomainStar(): string | null {
  return closingDomainId;
}

/** A closing domain star stays the open one until its marks have shrunk, so a member pressed meanwhile keeps its zoom. */
export function forgetSettledStars(focusedNodeId: string | null): void {
  if (!F.lagging && !(focusedNodeId !== null && F.model.domainById.has(focusedNodeId))) openDomainId = null;
  if (!F.lagging) closingDomainId = null;
}

/**
 * This frame's opened star: the focused domain's, or the selected capability's elements. A star
 * a change just left needs none: its marks shrink from what they drew, at the drawn radius's pace.
 */
export function planOpenStars(focused: string | null): void {
  const { model, P, layout } = F;
  F.starCount = 0;
  F.starNow = false;
  const focusedDomain = focused !== null && model.domainById.has(focused) ? focused : null;
  if (openDomainId !== null && openDomainId !== focusedDomain) closingDomainId = openDomainId;
  if (closingDomainId === focusedDomain) closingDomainId = null;
  F.closingRooms = closingDomainId === null ? null : domainStarRooms(model, layout, closingDomainId, P);
  if (focusedDomain !== null) {
    setStar(domainStarRooms(model, layout, focusedDomain, P), true, true, graphDiscRadiusPx("domain", 0, P, F.growth));
    F.starNow = true;
    openDomainId = focusedDomain;
  } else if (F.selectedId !== null && model.capabilityById.has(F.selectedId)) {
    setCapabilityStar(F.selectedId);
    F.starNow = true;
  }
}

export function segmentOnScreen(a: Point, b: Point): boolean {
  return !(Math.max(a.x, b.x) < -CULL_PX || Math.min(a.x, b.x) > F.W + CULL_PX || Math.max(a.y, b.y) < -CULL_PX || Math.min(a.y, b.y) > F.H + CULL_PX);
}

export function lensHidden(id: string): boolean {
  return F.contextMode && (F.input.contextAlphas!.get(id) ?? 0) < HITTABLE_MIN_TIER_ALPHA;
}

export function radiusOf(id: string, g: number, scale: number): number {
  const { model, P } = F;
  if (id === model.projectId) return graphDiscRadiusPx("project", 0, P, g);
  if (model.domainById.has(id)) return graphDiscRadiusPx("domain", 0, P, g);
  const capability = model.capabilityById.get(id);
  if (capability) return capabilityDiscRadiusPx(F.layout, model.domainOf.get(id)!, capability.elementIds.length, P, scale, g);
  if (F.orphans.has(id)) return capabilityDiscRadiusPx(F.layout, ORPHAN_ROOM, 0, P, scale, g);
  return elementDotRadiusPx(P, g, F.elementPitch, scale);
}

export function radiusAt(id: string, g: number): number {
  if (g !== F.growth) return radiusOf(id, g, F.scale);
  const known = F.radii.get(id);
  if (known !== undefined) return known;
  const r = radiusOf(id, g, F.scale);
  F.radii.set(id, r);
  return r;
}
